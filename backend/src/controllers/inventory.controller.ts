import type { Request, Response } from 'express';
import { asyncHandler } from '../middleware/async-handler';
import { sendCreated, sendData, sendPaginated } from '../utils/response';
import { requireAuth, toObjectIdSafe } from '../utils/tenant';
import { parseSort } from '../utils/pagination';
import { AppError } from '../utils/errors';
import * as inventoryService from '../services/inventory.service';
import * as stockService from '../services/stock.service';
import { STOCK_MOVEMENT_TYPES } from '../constants/domain';

const INVENTORY_SORT_FIELDS = ['expiryDate', 'createdAt', 'quantityOnHand', 'batchNumber', 'updatedAt'] as const;
const MOVEMENT_SORT_FIELDS = ['createdAt', 'quantity', 'type'] as const;

const assertStaff = (auth: ReturnType<typeof requireAuth>): void => {
  if (auth.role === 'CUSTOMER') {
    throw AppError.forbidden('Inventory operations are internal to the agency');
  }
};

export const listInventory = asyncHandler(async (req: Request, res: Response) => {
  const auth = requireAuth(req.auth);
  const query = req.query as unknown as {
    page: number;
    limit: number;
    search?: string;
    sort?: string;
    productId?: string;
    batchId?: string;
    lowStock?: boolean;
    outOfStock?: boolean;
    expiring?: boolean;
    expired?: boolean;
  };

  // Customers may inspect availability of the catalogue without seeing costs.
  if (auth.role === 'CUSTOMER' && (query.lowStock || query.outOfStock || query.expired)) {
    throw AppError.forbidden('Stock threshold filters are internal to the agency');
  }

  const { items, total } = await inventoryService.listInventory(auth.agencyId, {
    search: query.search,
    productId: query.productId,
    batchId: query.batchId,
    lowStock: query.lowStock,
    outOfStock: query.outOfStock,
    expiring: query.expiring,
    expired: query.expired,
    sort: parseSort(query.sort, INVENTORY_SORT_FIELDS, { expiryDate: 1 }),
    skip: (query.page - 1) * query.limit,
    limit: query.limit
  });

  if (auth.role === 'CUSTOMER') {
    sendPaginated(
      res,
      items.map((item) => ({
        _id: item._id,
        id: item._id,
        productId: item.productId,
        batchNumber: item.batchNumber,
        expiryDate: item.expiryDate,
        quantityAvailable: item.quantityAvailable,
        isExpired: item.isExpired
      })),
      total,
      query.page,
      query.limit
    );
    return;
  }

  sendPaginated(res, items, total, query.page, query.limit);
});

export const receiveStock = asyncHandler(async (req: Request, res: Response) => {
  const auth = requireAuth(req.auth);
  assertStaff(auth);

  const result = await inventoryService.receiveStock(auth.agencyId, {
    ...(req.body as inventoryService.ReceiveStockInput),
    productId: toObjectIdSafe((req.body as { productId: string }).productId, 'productId'),
    actorUserId: auth.userId,
    actorRole: auth.role
  });

  sendCreated(res, {
    batchId: result.batch._id,
    batchNumber: result.batch.batchNumber,
    inventoryId: result.inventory._id,
    quantityOnHand: result.inventory.quantityOnHand,
    quantityAvailable: result.inventory.quantityOnHand - result.inventory.quantityReserved,
    product: result.product
  });
});

export const adjustStock = asyncHandler(async (req: Request, res: Response) => {
  const auth = requireAuth(req.auth);
  assertStaff(auth);

  const result = await inventoryService.adjustStock(auth.agencyId, {
    ...(req.body as inventoryService.AdjustStockInput),
    inventoryId: toObjectIdSafe((req.body as { inventoryId: string }).inventoryId, 'inventoryId'),
    actorUserId: auth.userId,
    actorRole: auth.role
  });

  sendData(res, {
    inventoryId: result.inventory._id,
    quantityOnHand: result.inventory.quantityOnHand,
    quantityReserved: result.inventory.quantityReserved,
    quantityAvailable: result.inventory.quantityOnHand - result.inventory.quantityReserved
  });
});

export const listMovements = asyncHandler(async (req: Request, res: Response) => {
  const auth = requireAuth(req.auth);
  assertStaff(auth);

  const query = req.query as unknown as {
    page: number;
    limit: number;
    search?: string;
    sort?: string;
    productId?: string;
    batchId?: string;
    type?: string;
    referenceType?: string;
    referenceId?: string;
    from?: string;
    to?: string;
  };

  if (query.type && !STOCK_MOVEMENT_TYPES.includes(query.type as never)) {
    throw AppError.badRequest(`type must be one of: ${STOCK_MOVEMENT_TYPES.join(', ')}`);
  }

  const { items, total } = await inventoryService.listMovements(auth.agencyId, {
    search: query.search,
    productId: query.productId,
    batchId: query.batchId,
    type: query.type,
    referenceType: query.referenceType,
    referenceId: query.referenceId,
    from: query.from ? new Date(query.from) : undefined,
    to: query.to ? new Date(query.to) : undefined,
    sort: parseSort(query.sort, MOVEMENT_SORT_FIELDS, { createdAt: -1 }),
    skip: (query.page - 1) * query.limit,
    limit: query.limit
  });

  sendPaginated(res, items, total, query.page, query.limit);
});

export const stockCapability = asyncHandler(async (_req: Request, res: Response) => {
  const mode = stockService.transactionMode();
  sendData(res, {
    transactions: mode.supported,
    reason: mode.reason,
    strategy: mode.supported
      ? 'multi-document transactions with conditional updates'
      : 'conditional updates with compensating movements (standalone MongoDB)'
  });
});
