import type { Request, Response } from 'express';
import { asyncHandler } from '../middleware/async-handler';
import { sendCreated, sendData, sendMessage, sendPaginated } from '../utils/response';
import { requireAuth, toObjectIdSafe } from '../utils/tenant';
import { parseSort } from '../utils/pagination';
import { AppError } from '../utils/errors';
import * as productService from '../services/product.service';
import { validateProposedOrder, updateBatchMeta } from '../services/inventory.service';
import { BatchModel } from '../models/batch.model';
import type { ProductAvailability } from '../constants/domain';

const PRODUCT_SORT_FIELDS = [
  'createdAt',
  'name',
  'price',
  'mrp',
  'updatedAt',
  'sku',
  'brand',
  'manufacturer',
  'genericName'
] as const;
const CATEGORY_SORT_FIELDS = ['createdAt', 'name', 'displayOrder'] as const;
const BATCH_SORT_FIELDS = ['createdAt', 'expiryDate', 'batchNumber', 'status'] as const;

export const listProducts = asyncHandler(async (req: Request, res: Response) => {
  const auth = requireAuth(req.auth);
  const query = req.query as unknown as {
    page: number;
    limit: number;
    search?: string;
    sort?: string;
    categoryId?: string;
    brand?: string;
    manufacturer?: string;
    availability?: ProductAvailability;
    isActive?: boolean;
    isFeatured?: boolean;
    includeInactive?: boolean;
    minPrice?: number;
    maxPrice?: number;
  };

  // Only staff may see archived products.
  const includeInactive = query.includeInactive === true && auth.role !== 'CUSTOMER';

  const lowStockThreshold = await productService.resolveLowStockThreshold(auth.agencyId);

  const { items, total } = await productService.listProducts(
    auth.agencyId,
    {
      search: query.search,
      categoryId: query.categoryId,
      brand: query.brand,
      manufacturer: query.manufacturer,
      availability: query.availability,
      isActive: query.isActive,
      isFeatured: query.isFeatured,
      includeInactive,
      minPrice: query.minPrice,
      maxPrice: query.maxPrice,
      sort: parseSort(query.sort, PRODUCT_SORT_FIELDS, { createdAt: -1 }),
      skip: (query.page - 1) * query.limit,
      limit: query.limit
    },
    { lowStockThreshold }
  );

  sendPaginated(res, items, total, query.page, query.limit);
});

export const getProduct = asyncHandler(async (req: Request, res: Response) => {
  const auth = requireAuth(req.auth);
  const product = await productService.getProduct(auth.agencyId, toObjectIdSafe(req.params.id, 'id'));
  if (auth.role === 'CUSTOMER' && !product.isActive) throw AppError.notFound('Product');
  sendData(res, product);
});

export const createProduct = asyncHandler(async (req: Request, res: Response) => {
  const auth = requireAuth(req.auth);
  const product = await productService.createProduct(auth.agencyId, {
    ...(req.body as productService.ProductInput),
    actorUserId: auth.userId
  });
  sendCreated(res, product);
});

export const updateProduct = asyncHandler(async (req: Request, res: Response) => {
  const auth = requireAuth(req.auth);
  const product = await productService.updateProduct(auth.agencyId, toObjectIdSafe(req.params.id, 'id'), {
    ...(req.body as productService.ProductInput),
    actorUserId: auth.userId
  });
  sendData(res, product);
});

export const deleteProduct = asyncHandler(async (req: Request, res: Response) => {
  const auth = requireAuth(req.auth);
  const product = await productService.archiveProduct(auth.agencyId, toObjectIdSafe(req.params.id, 'id'), auth.userId);
  sendMessage(res, `Product ${product.name} was archived and can no longer be ordered`);
});

export const listCategories = asyncHandler(async (req: Request, res: Response) => {
  const auth = requireAuth(req.auth);
  const query = req.query as unknown as {
    page: number;
    limit: number;
    search?: string;
    sort?: string;
    parentId?: string;
    isActive?: boolean;
  };

  const { items, total } = await productService.listCategories(auth.agencyId, {
    search: query.search,
    parentId: query.parentId,
    isActive: query.isActive,
    sort: parseSort(query.sort, CATEGORY_SORT_FIELDS, { displayOrder: 1 }),
    skip: (query.page - 1) * query.limit,
    limit: query.limit
  });
  sendPaginated(res, items, total, query.page, query.limit);
});

export const createCategory = asyncHandler(async (req: Request, res: Response) => {
  const auth = requireAuth(req.auth);
  const category = await productService.createCategory(auth.agencyId, {
    ...(req.body as productService.CategoryInput),
    actorUserId: auth.userId
  });
  sendCreated(res, category);
});

export const updateCategory = asyncHandler(async (req: Request, res: Response) => {
  const auth = requireAuth(req.auth);
  const category = await productService.updateCategory(
    auth.agencyId,
    toObjectIdSafe(req.params.id, 'id'),
    { ...(req.body as productService.CategoryInput), actorUserId: auth.userId }
  );
  sendData(res, category);
});

export const listBatches = asyncHandler(async (req: Request, res: Response) => {
  const auth = requireAuth(req.auth);
  if (auth.role === 'CUSTOMER') throw AppError.forbidden('Batch data is internal to the agency');

  const query = req.query as unknown as {
    page: number;
    limit: number;
    search?: string;
    sort?: string;
    productId?: string;
    status?: string;
    expiring?: boolean;
    expired?: boolean;
  };

  const now = new Date();
  const filter: Record<string, unknown> = { agencyId: auth.agencyId };
  if (query.productId) filter.productId = query.productId;
  if (query.status) filter.status = query.status;
  if (query.expired) filter.expiryDate = { $lte: now };
  if (query.search) {
    const escaped = query.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    filter.$or = [
      { batchNumber: new RegExp(escaped, 'i') },
      { supplier: new RegExp(escaped, 'i') },
      { manufacturer: new RegExp(escaped, 'i') }
    ];
  }

  const [items, total] = await Promise.all([
    BatchModel.find(filter)
      .populate('productId', 'name sku unit')
      .sort(parseSort(query.sort, BATCH_SORT_FIELDS, { expiryDate: 1 }))
      .skip((query.page - 1) * query.limit)
      .limit(query.limit)
      .lean(),
    BatchModel.countDocuments(filter)
  ]);

  sendPaginated(
    res,
    items.map((batch) => ({
      ...batch,
      isExpired: batch.expiryDate.getTime() <= now.getTime()
    })),
    total,
    query.page,
    query.limit
  );
});

export const updateBatch = asyncHandler(async (req: Request, res: Response) => {
  const auth = requireAuth(req.auth);
  const batch = await updateBatchMeta(auth.agencyId, toObjectIdSafe(req.params.id, 'id'), {
    ...(req.body as Record<string, never>),
    actorUserId: auth.userId
  });
  sendData(res, batch);
});

export const validateOrderStock = asyncHandler(async (req: Request, res: Response) => {
  const auth = requireAuth(req.auth);
  const result = await validateProposedOrder(
    auth.agencyId,
    (req.body.items as Array<{ productId: string; quantity: number }>).map((item) => ({
      productId: toObjectIdSafe(item.productId, 'items.productId'),
      quantity: item.quantity
    }))
  );
  sendData(res, result);
});
