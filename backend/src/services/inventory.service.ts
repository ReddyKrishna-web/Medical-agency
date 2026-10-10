import type { FilterQuery, Types } from 'mongoose';
import { InventoryModel } from '../models/inventory.model';
import { BatchModel } from '../models/batch.model';
import { ProductModel } from '../models/product.model';
import { StockMovementModel } from '../models/stock-movement.model';
import { AgencyModel } from '../models/agency.model';
import { AppError, ErrorCode } from '../utils/errors';
import { recordActivity } from './activity.service';
import { emitInventoryAlert } from '../sockets/emitters';
import { notifyRoles } from './notification.service';
import { getAvailability, refreshBatchStatus, type ProductAvailability, type StockLine } from './stock.service';
import type { IAgency } from '../models/agency.model';

export interface ReceiveStockInput {
  productId: Types.ObjectId;
  batchNumber: string;
  quantity: number;
  unitCost?: number;
  expiryDate: string | Date;
  mfgDate?: string | Date;
  supplier?: string;
  manufacturer?: string;
  location?: string;
  reorderLevel?: number;
  note?: string;
  actorUserId?: Types.ObjectId;
  actorRole?: string;
}

const loadAgency = async (agencyId: Types.ObjectId): Promise<IAgency> => {
  const agency = await AgencyModel.findById(agencyId).exec();
  if (!agency) throw AppError.notFound('Agency');
  return agency;
};

/**
 * Receive stock: create the batch if it is new (or reuse it), then add physical
 * stock to the matching inventory row.
 */
export const receiveStock = async (agencyId: Types.ObjectId, input: ReceiveStockInput) => {
  const product = await ProductModel.findOne({ agencyId, _id: input.productId }).exec();
  if (!product) throw AppError.notFound('Product');

  const agency = await loadAgency(agencyId);
  const expiry = new Date(input.expiryDate);
  if (Number.isNaN(expiry.getTime())) throw AppError.badRequest('expiryDate is not a valid date');
  if (expiry.getTime() <= Date.now()) {
    throw new AppError(
      422,
      ErrorCode.VALIDATION_ERROR,
      'Received batches must have a future expiry date; expired stock cannot be received as sellable inventory'
    );
  }

  const batchNumber = input.batchNumber.trim().toUpperCase();
  let batch = await BatchModel.findOne({ agencyId, productId: product._id, batchNumber }).exec();

  if (batch && batch.expiryDate.getTime() !== expiry.getTime()) {
    throw AppError.conflict(
      `Batch ${batchNumber} already exists with a different expiry date. Receive it under a different batch number.`
    );
  }

  if (!batch) {
    batch = await BatchModel.create({
      agencyId,
      productId: product._id,
      batchNumber,
      expiryDate: expiry,
      mfgDate: input.mfgDate ? new Date(input.mfgDate) : undefined,
      supplier: input.supplier,
      manufacturer: input.manufacturer,
      receivedAt: new Date(),
      status: 'ACTIVE',
      note: input.note,
      createdBy: input.actorUserId
    });
  } else {
    batch.status = batch.expiryDate.getTime() <= Date.now() ? 'EXPIRED' : 'ACTIVE';
    await batch.save();
  }

  let inventory = await InventoryModel.findOne({ agencyId, batchId: batch._id }).exec();

  // A new batch inherits the product's catalogue reorder level so the per-batch
  // row and the catalogue do not silently disagree about when to restock.
  const effectiveReorderLevel =
    input.reorderLevel ?? (product.reorderLevel > 0 ? product.reorderLevel : agency.orderSettings.lowStockThreshold);

  if (!inventory) {
    inventory = await InventoryModel.create({
      agencyId,
      productId: product._id,
      batchId: batch._id,
      batchNumber,
      expiryDate: batch.expiryDate,
      location: input.location,
      unitCost: input.unitCost ?? 0,
      quantityOnHand: 0,
      quantityReserved: 0,
      reorderLevel: effectiveReorderLevel,
      isActive: true,
      createdBy: input.actorUserId
    });
  } else {
    if (input.location) inventory.location = input.location;
    if (input.unitCost !== undefined) inventory.unitCost = input.unitCost;
    if (input.reorderLevel !== undefined) inventory.reorderLevel = input.reorderLevel;
    inventory.isActive = true;
  }

  // An increment can only add stock, so a concurrent receipt cannot lose a delta.
  inventory.quantityOnHand += input.quantity;
  inventory.lastMovementAt = new Date();
  inventory.updatedBy = input.actorUserId;
  await inventory.save();

  await StockMovementModel.create({
    agencyId,
    productId: product._id,
    productName: product.name,
    batchId: batch._id,
    batchNumber: batch.batchNumber,
    inventoryId: inventory._id,
    type: 'RECEIVE',
    quantity: input.quantity,
    direction: 'IN',
    balanceOnHand: inventory.quantityOnHand,
    balanceReserved: inventory.quantityReserved,
    unitCost: inventory.unitCost,
    referenceType: 'MANUAL',
    reason: 'Stock received',
    note: input.note,
    actorUserId: input.actorUserId,
    actorRole: input.actorRole
  });

  await recordActivity({
    agencyId,
    actorUserId: input.actorUserId,
    actorRole: input.actorRole,
    action: 'inventory.receive',
    entity: 'Inventory',
    entityId: inventory._id,
    summary: `Received ${input.quantity} unit(s) of ${product.name} (batch ${batch.batchNumber})`,
    meta: { productId: product._id.toString(), batchNumber: batch.batchNumber, quantity: input.quantity }
  });

  await alertIfLow(agencyId, product._id, product.name);

  return { batch, inventory, product: { _id: product._id, name: product.name, sku: product.sku } };
};

export interface AdjustStockInput {
  inventoryId: Types.ObjectId;
  /** Signed delta: positive adds stock, negative removes it. */
  delta: number;
  reason: string;
  note?: string;
  actorUserId?: Types.ObjectId;
  actorRole?: string;
}

/** Signed manual adjustment. Negative results are rejected: stock never goes below zero. */
export const adjustStock = async (agencyId: Types.ObjectId, input: AdjustStockInput) => {
  if (input.delta === 0) throw AppError.badRequest('Adjustment delta must not be zero');
  if (!Number.isInteger(input.delta)) throw AppError.badRequest('Adjustment delta must be a whole number');

  const inventory = await InventoryModel.findOne({ agencyId, _id: input.inventoryId }).exec();
  if (!inventory) throw AppError.notFound('Inventory row');

  const product = await ProductModel.findOne({ agencyId, _id: inventory.productId })
    .select('name sku')
    .lean<{ name: string; sku: string }>();

  if (input.delta < 0) {
    const removable = inventory.quantityOnHand - inventory.quantityReserved;
    if (Math.abs(input.delta) > removable) {
      throw new AppError(
        409,
        ErrorCode.INSUFFICIENT_STOCK,
        `Only ${removable} unreserved unit(s) are available to adjust; reserved stock cannot be removed`,
        { available: removable, requested: Math.abs(input.delta) }
      );
    }
  }

  const updated = await InventoryModel.findOneAndUpdate(
    {
      _id: inventory._id,
      agencyId,
      ...(input.delta < 0
        ? { $expr: { $gte: [{ $subtract: ['$quantityOnHand', '$quantityReserved'] }, Math.abs(input.delta)] } }
        : {})
    },
    { $inc: { quantityOnHand: input.delta }, $set: { lastMovementAt: new Date(), updatedBy: input.actorUserId } },
    { new: true }
  ).exec();

  if (!updated) {
    throw new AppError(
      409,
      ErrorCode.INSUFFICIENT_STOCK,
      'Stock changed while adjusting; no units were modified. Please retry.'
    );
  }

  const movementType = input.delta > 0 ? 'ADJUST_IN' : 'ADJUST_OUT';
  await StockMovementModel.create({
    agencyId,
    productId: inventory.productId,
    productName: product?.name,
    batchId: inventory.batchId,
    batchNumber: inventory.batchNumber,
    inventoryId: inventory._id,
    type: movementType,
    quantity: Math.abs(input.delta),
    direction: input.delta > 0 ? 'IN' : 'OUT',
    balanceOnHand: updated.quantityOnHand,
    balanceReserved: updated.quantityReserved,
    unitCost: updated.unitCost,
    referenceType: 'ADJUSTMENT',
    reason: input.reason,
    note: input.note,
    actorUserId: input.actorUserId,
    actorRole: input.actorRole
  });

  await refreshBatchStatus(agencyId, [inventory.batchId]);
  await recordActivity({
    agencyId,
    actorUserId: input.actorUserId,
    actorRole: input.actorRole,
    action: 'inventory.adjust',
    entity: 'Inventory',
    entityId: inventory._id,
    summary: `Adjusted ${product?.name ?? 'stock'} batch ${inventory.batchNumber} by ${input.delta > 0 ? '+' : ''}${input.delta}`,
    meta: { delta: input.delta, reason: input.reason }
  });

  return { inventory: updated, product };
};

/** Emits a realtime alert when a product drops to/below the agency threshold. */
export const alertIfLow = async (
  agencyId: Types.ObjectId,
  productId: Types.ObjectId,
  productName: string
): Promise<void> => {
  try {
    const agency = await AgencyModel.findById(agencyId).select('orderSettings').lean<{
      orderSettings: { lowStockThreshold: number };
    }>();
    const threshold = agency?.orderSettings?.lowStockThreshold ?? 20;
    const now = new Date();

    const [rows] = await InventoryModel.aggregate<{ total: number }>([
      {
        $match: {
          agencyId,
          productId,
          isActive: true,
          expiryDate: { $gt: now },
          $expr: { $gt: [{ $subtract: ['$quantityOnHand', '$quantityReserved'] }, 0] }
        }
      },
      { $group: { _id: null, total: { $sum: { $subtract: ['$quantityOnHand', '$quantityReserved'] } } } }
    ]).exec();

    const available = rows?.total ?? 0;
    if (available > threshold) return;

    const kind = available <= 0 ? 'OUT_OF_STOCK' : 'LOW_STOCK';
    emitInventoryAlert(agencyId, {
      kind,
      productId: productId.toString(),
      productName,
      available,
      threshold
    });

    // Persisted notification for every agency admin (the realtime alert is advisory).
    void notifyRoles(agencyId, ['AGENCY_ADMIN'], {
      type: 'INVENTORY_LOW',
      title: kind === 'OUT_OF_STOCK' ? 'Out of stock' : 'Low stock',
      message: `${productName} is ${
        kind === 'OUT_OF_STOCK' ? 'out of stock' : `below the low stock threshold (${available} available)`
      }`,
      data: { productId: productId.toString(), available, threshold },
      entityType: 'Product',
      entityId: productId
    });
  } catch {
    // Alerts are advisory; a failure must never fail the business operation.
  }
};

export interface InventoryListFilters {
  productId?: string;
  batchId?: string;
  search?: string;
  lowStock?: boolean;
  outOfStock?: boolean;
  expiring?: boolean;
  expired?: boolean;
  sort?: Record<string, 1 | -1>;
  skip: number;
  limit: number;
  now?: Date;
}

export const listInventory = async (agencyId: Types.ObjectId, filters: InventoryListFilters) => {
  const now = filters.now ?? new Date();
  const agency = await loadAgency(agencyId);
  const expiringCutoff = new Date(now.getTime() + agency.orderSettings.expiryAlertDays * 24 * 60 * 60 * 1000);

  const filter: FilterQuery<Record<string, unknown>> = { agencyId };

  if (filters.productId) filter.productId = filters.productId;
  if (filters.batchId) filter.batchId = filters.batchId;
  if (filters.expired) {
    filter.expiryDate = { $lte: now };
  } else if (filters.expiring) {
    filter.expiryDate = { $gt: now, $lte: expiringCutoff };
  }
  if (filters.outOfStock) {
    filter.$expr = { $lte: [{ $subtract: ['$quantityOnHand', '$quantityReserved'] }, 0] };
  } else if (filters.lowStock) {
    filter.$expr = {
      $and: [
        { $gt: [{ $subtract: ['$quantityOnHand', '$quantityReserved'] }, 0] },
        { $lte: [{ $subtract: ['$quantityOnHand', '$quantityReserved'] }, agency.orderSettings.lowStockThreshold] }
      ]
    };
  }
  if (filters.search) {
    const escaped = filters.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    filter.$or = [{ batchNumber: new RegExp(escaped, 'i') }, { location: new RegExp(escaped, 'i') }];
  }

  const [items, total] = await Promise.all([
    InventoryModel.find(filter)
      .populate('productId', 'name sku unit isActive')
      .sort(filters.sort ?? { expiryDate: 1 })
      .skip(filters.skip)
      .limit(filters.limit)
      .lean(),
    InventoryModel.countDocuments(filter)
  ]);

  return {
    items: items.map((item) => ({
      ...item,
      quantityAvailable: Math.max(0, item.quantityOnHand - item.quantityReserved),
      isExpired: item.expiryDate.getTime() <= now.getTime()
    })),
    total
  };
};

export const listMovements = async (
  agencyId: Types.ObjectId,
  filters: {
    search?: string;
    productId?: string;
    batchId?: string;
    type?: string;
    referenceType?: string;
    referenceId?: string;
    from?: Date;
    to?: Date;
    skip: number;
    limit: number;
    sort?: Record<string, 1 | -1>;
  }
) => {
  const filter: FilterQuery<Record<string, unknown>> = { agencyId };
  if (filters.search) {
    const escaped = filters.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const expression = new RegExp(escaped, 'i');
    filter.$or = [
      { productName: expression },
      { batchNumber: expression },
      { referenceNumber: expression },
      { reason: expression },
      { note: expression }
    ];
  }
  if (filters.productId) filter.productId = filters.productId;
  if (filters.batchId) filter.batchId = filters.batchId;
  if (filters.type) filter.type = filters.type;
  if (filters.referenceType) filter.referenceType = filters.referenceType;
  if (filters.referenceId) filter.referenceId = filters.referenceId;
  if (filters.from || filters.to) {
    filter.createdAt = {
      ...(filters.from ? { $gte: filters.from } : {}),
      ...(filters.to ? { $lte: filters.to } : {})
    };
  }

  const [items, total] = await Promise.all([
    StockMovementModel.find(filter)
      .populate('productId', 'name sku')
      .sort(filters.sort ?? { createdAt: -1 })
      .skip(filters.skip)
      .limit(filters.limit)
      .lean(),
    StockMovementModel.countDocuments(filter)
  ]);

  return { items, total };
};

/** Dry-run check used by `POST /inventory/validate` before an order is placed. */
export const validateProposedOrder = async (
  agencyId: Types.ObjectId,
  lines: StockLine[]
): Promise<{
  ok: boolean;
  lines: Array<
    ProductAvailability & {
      shortfall: number;
      earliestExpiry: Date | null;
      willUseBatches: Array<{ batchNumber: string; expiryDate: Date; quantity: number }>;
    }
  >;
}> => {
  const availability = await getAvailability(agencyId, lines);
  return {
    ok: availability.every((line) => line.isAvailable),
    lines: availability.map((line) => {
      let remaining = line.requested;
      const willUseBatches: Array<{ batchNumber: string; expiryDate: Date; quantity: number }> = [];
      for (const batch of line.batches) {
        if (remaining <= 0) break;
        const take = Math.min(remaining, batch.available);
        willUseBatches.push({ batchNumber: batch.batchNumber, expiryDate: batch.expiryDate, quantity: take });
        remaining -= take;
      }
      return {
        ...line,
        shortfall: Math.max(0, line.requested - line.sellable),
        earliestExpiry: line.batches[0]?.expiryDate ?? null,
        willUseBatches
      };
    })
  };
};

export interface UpdateBatchPatch {
  supplier?: string;
  manufacturer?: string;
  location?: string;
  note?: string;
  isActive?: boolean;
  actorUserId?: Types.ObjectId;
}

export const updateBatchMeta = async (
  agencyId: Types.ObjectId,
  batchId: Types.ObjectId,
  patch: UpdateBatchPatch
) => {
  const batch = await BatchModel.findOne({ agencyId, _id: batchId }).exec();
  if (!batch) throw AppError.notFound('Batch');

  if (patch.supplier !== undefined) batch.supplier = patch.supplier;
  if (patch.manufacturer !== undefined) batch.manufacturer = patch.manufacturer;
  if (patch.note !== undefined) batch.note = patch.note;
  if (patch.isActive !== undefined) batch.status = patch.isActive ? 'ACTIVE' : 'QUARANTINED';
  batch.updatedBy = patch.actorUserId;
  await batch.save();

  if (patch.location !== undefined || patch.isActive !== undefined) {
    await InventoryModel.updateMany(
      { agencyId, batchId: batch._id },
      {
        $set: {
          ...(patch.location !== undefined ? { location: patch.location } : {}),
          ...(patch.isActive !== undefined ? { isActive: patch.isActive } : {})
        }
      }
    ).exec();
  }

  await recordActivity({
    agencyId,
    actorUserId: patch.actorUserId,
    action: 'batch.update',
    entity: 'Batch',
    entityId: batch._id,
    summary: `Updated batch ${batch.batchNumber}`,
    meta: { fields: Object.keys(patch) }
  });

  return batch;
};
