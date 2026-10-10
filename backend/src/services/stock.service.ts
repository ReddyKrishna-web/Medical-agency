import type { ClientSession, Types } from 'mongoose';
import { InventoryModel } from '../models/inventory.model';
import { StockMovementModel, type IStockMovement } from '../models/stock-movement.model';
import { BatchModel } from '../models/batch.model';
import { ProductModel } from '../models/product.model';
import { AppError, ErrorCode } from '../utils/errors';
import { logger } from '../utils/logger';
import { getTransactionCapability, withOptionalTransaction } from '../config/database';
import type { StockMovementType } from '../constants/domain';

export interface StockLine {
  productId: Types.ObjectId;
  quantity: number;
}

export interface SellableBatch {
  inventoryId: Types.ObjectId;
  batchId: Types.ObjectId;
  batchNumber: string;
  expiryDate: Date;
  available: number;
  unitCost: number;
}

export interface ProductAvailability {
  productId: Types.ObjectId;
  productName: string;
  sku: string;
  requested: number;
  sellable: number;
  expiredQuantity: number;
  batches: SellableBatch[];
  isAvailable: boolean;
}

export interface AllocationPlanEntry {
  productId: Types.ObjectId;
  inventoryId: Types.ObjectId;
  batchId: Types.ObjectId;
  batchNumber: string;
  expiryDate: Date;
  quantity: number;
}

export interface AllocationPlan {
  agencyId: Types.ObjectId;
  lines: Array<{ productId: Types.ObjectId; quantity: number; entries: AllocationPlanEntry[] }>;
  totalUnits: number;
}

/**
 * Compute per-product sellable availability.
 *
 * A batch is sellable only when it is active, not expired, and still has
 * unreserved physical stock. Expired stock is reported separately so an agency
 * can act on it, but it is never offered to a customer.
 */
export const getAvailability = async (
  agencyId: Types.ObjectId,
  lines: StockLine[],
  session?: ClientSession
): Promise<ProductAvailability[]> => {
  const now = new Date();
  const productIds = lines.map((line) => line.productId);

  const [products, inventories] = await Promise.all([
    ProductModel.find({ agencyId, _id: { $in: productIds } })
      .select('_id name sku')
      .session(session ?? null)
      .lean<Array<{ _id: Types.ObjectId; name: string; sku: string }>>(),
    InventoryModel.find({
      agencyId,
      productId: { $in: productIds },
      isActive: true,
      expiryDate: { $gt: now },
      $expr: { $gt: [{ $subtract: ['$quantityOnHand', '$quantityReserved'] }, 0] }
    })
      .select('productId batchId batchNumber expiryDate unitCost quantityOnHand quantityReserved')
      .session(session ?? null)
      .sort({ productId: 1, expiryDate: 1, createdAt: 1 })
      .lean<Array<{
        _id: Types.ObjectId;
        productId: Types.ObjectId;
        batchId: Types.ObjectId;
        batchNumber: string;
        expiryDate: Date;
        unitCost: number;
        quantityOnHand: number;
        quantityReserved: number;
      }>>()
  ]);

  const productMap = new Map(products.map((product) => [product._id.toString(), product]));

  const expiredTotals = await InventoryModel.aggregate<{ _id: Types.ObjectId; expired: number }>([
    { $match: { agencyId, productId: { $in: productIds }, isActive: true, expiryDate: { $lte: now } } },
    { $group: { _id: '$productId', expired: { $sum: '$quantityOnHand' } } }
  ]).exec();
  const expiredMap = new Map(expiredTotals.map((row) => [row._id.toString(), row.expired]));

  return lines.map((line) => {
    const product = productMap.get(line.productId.toString());
    const batches: SellableBatch[] = inventories
      .filter((item) => item.productId.toString() === line.productId.toString())
      .map((item) => ({
        inventoryId: item._id,
        batchId: item.batchId,
        batchNumber: item.batchNumber,
        expiryDate: item.expiryDate,
        unitCost: item.unitCost,
        available: Math.max(0, item.quantityOnHand - item.quantityReserved)
      }))
      .filter((batch) => batch.available > 0);

    const sellable = batches.reduce((total, batch) => total + batch.available, 0);
    return {
      productId: line.productId,
      productName: product?.name ?? 'Unknown product',
      sku: product?.sku ?? '-',
      requested: line.quantity,
      sellable,
      expiredQuantity: expiredMap.get(line.productId.toString()) ?? 0,
      batches,
      isAvailable: sellable >= line.quantity
    };
  });
};

/**
 * FEFO plan: earliest expiry first, never expired, never more than available.
 * The plan is a pure read; nothing is mutated until `reserveStock` runs.
 */
export const buildFefoPlan = (
  agencyId: Types.ObjectId,
  availability: ProductAvailability[]
): AllocationPlan => {
  const lines = availability.map((line) => {
    let remaining = line.requested;
    const entries: AllocationPlanEntry[] = [];
    for (const batch of line.batches) {
      if (remaining <= 0) break;
      const take = Math.min(remaining, batch.available);
      if (take <= 0) continue;
      entries.push({
        productId: line.productId,
        inventoryId: batch.inventoryId,
        batchId: batch.batchId,
        batchNumber: batch.batchNumber,
        expiryDate: batch.expiryDate,
        quantity: take
      });
      remaining -= take;
    }
    return { productId: line.productId, quantity: line.requested, entries };
  });

  return {
    agencyId,
    lines,
    totalUnits: lines.reduce((total, line) => total + line.quantity, 0)
  };
};

export interface ReserveContext {
  agencyId: Types.ObjectId;
  actorUserId?: Types.ObjectId;
  actorRole?: string;
  referenceType?: 'ORDER' | 'ADJUSTMENT' | 'MANUAL' | 'JOB' | 'REQUIREMENT';
  referenceId?: Types.ObjectId;
  referenceNumber?: string;
  reason?: string;
  movementType?: StockMovementType;
}

const createMovement = async (
  movement: Record<string, unknown>,
  session?: ClientSession
): Promise<void> => {
  const [created] = await StockMovementModel.create(
    [movement as unknown as IStockMovement],
    session ? { session } : {}
  );
  if (!created) logger.warn('Stock movement could not be recorded', { movement });
};

/**
 * Reserve stock for an order (CONFIRMED step).
 *
 * Safety model — the same guarantees hold with or without transactions:
 *  1. every reservation is a *conditional* update: `quantityOnHand - q >= take`
 *     and `expiryDate > now`; a losing racer simply matches zero documents
 *  2. if any line cannot be fully reserved, every reservation already taken by
 *     this request is compensated back before the error is raised
 *  3. reservations never reduce physical stock, so on-hand can never go negative
 */
export const reserveStock = async (
  agencyId: Types.ObjectId,
  lines: StockLine[],
  context: ReserveContext
): Promise<AllocationPlanEntry[]> => {
  const label = `reserve:${context.referenceNumber ?? 'unknown'}`;

  const run = async (session?: ClientSession): Promise<AllocationPlanEntry[]> => {
    const availability = await getAvailability(agencyId, lines, session);
    const shortfalls = availability.filter((line) => !line.isAvailable);

    if (shortfalls.length > 0) {
      throw new AppError(
        409,
        ErrorCode.INSUFFICIENT_STOCK,
        'Insufficient sellable stock for the requested order',
        {
          lines: shortfalls.map((line) => ({
            productId: line.productId.toString(),
            productName: line.productName,
            sku: line.sku,
            requested: line.requested,
            sellable: line.sellable
          }))
        }
      );
    }

    const plan = buildFefoPlan(agencyId, availability);
    const applied: AllocationPlanEntry[] = [];
    const movements: Record<string, unknown>[] = [];
    const now = new Date();

    try {
      for (const line of plan.lines) {
        for (const entry of line.entries) {
          // Conditional reserve: never oversell, never touch expired stock.
          const updated = await InventoryModel.findOneAndUpdate(
            {
              _id: entry.inventoryId,
              agencyId,
              isActive: true,
              expiryDate: { $gt: now },
              $expr: { $gte: [{ $subtract: ['$quantityOnHand', '$quantityReserved'] }, entry.quantity] }
            },
            { $inc: { quantityReserved: entry.quantity }, $set: { lastMovementAt: new Date() } },
            { new: true, session }
          ).exec();

          if (!updated) {
            // Someone else took the stock between the read and the write.
            throw new AppError(
              409,
              ErrorCode.INSUFFICIENT_STOCK,
              `Stock for batch ${entry.batchNumber} changed while the order was being confirmed. Please retry.`
            );
          }

          applied.push(entry);
          movements.push({
            agencyId,
            productId: line.productId,
            batchId: entry.batchId,
            batchNumber: entry.batchNumber,
            inventoryId: entry.inventoryId,
            type: context.movementType ?? 'RESERVE',
            quantity: entry.quantity,
            direction: 'OUT',
            balanceOnHand: updated.quantityOnHand,
            balanceReserved: updated.quantityReserved,
            referenceType: context.referenceType,
            referenceId: context.referenceId,
            referenceNumber: context.referenceNumber,
            reason: context.reason ?? 'Order confirmation allocation (FEFO)',
            actorUserId: context.actorUserId,
            actorRole: context.actorRole
          });
        }
      }
    } catch (error) {
      // Compensate: undo everything this request reserved.
      await compensate(agencyId, applied, context, session);
      throw error;
    }

    for (const movement of movements) {
      await createMovement(movement, session);
    }

    return applied;
  };

  return withOptionalTransaction(run, { label });
};

const compensate = async (
  agencyId: Types.ObjectId,
  applied: AllocationPlanEntry[],
  context: ReserveContext,
  session?: ClientSession
): Promise<void> => {
  for (const entry of applied) {
    await InventoryModel.updateOne(
      { _id: entry.inventoryId, agencyId, quantityReserved: { $gte: entry.quantity } },
      { $inc: { quantityReserved: -entry.quantity } },
      { session }
    ).exec();
    await createMovement(
      {
        agencyId,
        productId: entry.productId,
        batchId: entry.batchId,
        batchNumber: entry.batchNumber,
        inventoryId: entry.inventoryId,
        type: 'RELEASE',
        quantity: entry.quantity,
        direction: 'IN',
        balanceOnHand: 0,
        balanceReserved: 0,
        referenceType: context.referenceType,
        referenceId: context.referenceId,
        referenceNumber: context.referenceNumber,
        reason: 'Allocation rolled back (compensating movement)',
        actorUserId: context.actorUserId,
        actorRole: context.actorRole
      },
      session
    );
  }
  logger.warn('Stock reservation compensated', {
    agencyId: agencyId.toString(),
    entries: applied.length,
    reference: context.referenceNumber
  });
};

export interface CommitEntry {
  inventoryId: Types.ObjectId;
  batchId: Types.ObjectId;
  batchNumber: string;
  productId: Types.ObjectId;
  quantity: number;
  unitCost?: number;
}

/**
 * Commit reservations into a real stock deduction (PROCESSING step).
 *
 *  - conditional `quantityOnHand >= take` prevents negative balances
 *  - the reservation is released in the same update
 *  - a partial failure restores every deduction already applied in this call
 */
export const commitStock = async (
  agencyId: Types.ObjectId,
  entries: CommitEntry[],
  context: ReserveContext
): Promise<void> => {
  const label = `commit:${context.referenceNumber ?? 'unknown'}`;

  const run = async (session?: ClientSession): Promise<void> => {
    const done: CommitEntry[] = [];

    try {
      for (const entry of entries) {
        if (entry.quantity <= 0) continue;
        const updated = await InventoryModel.findOneAndUpdate(
          {
            _id: entry.inventoryId,
            agencyId,
            isActive: true,
            quantityOnHand: { $gte: entry.quantity },
            quantityReserved: { $gte: entry.quantity }
          },
          {
            $inc: { quantityOnHand: -entry.quantity, quantityReserved: -entry.quantity },
            $set: { lastMovementAt: new Date() }
          },
          { new: true, session }
        ).exec();

        if (!updated) {
          throw new AppError(
            409,
            ErrorCode.INVENTORY_COMMIT_FAILED,
            `Stock for batch ${entry.batchNumber} could not be committed; the order was left unchanged. Please retry.`
          );
        }

        done.push(entry);
        await createMovement(
          {
            agencyId,
            productId: entry.productId,
            batchId: entry.batchId,
            batchNumber: entry.batchNumber,
            inventoryId: entry.inventoryId,
            type: 'DEDUCT',
            quantity: entry.quantity,
            direction: 'OUT',
            balanceOnHand: updated.quantityOnHand,
            balanceReserved: updated.quantityReserved,
            unitCost: entry.unitCost,
            referenceType: context.referenceType,
            referenceId: context.referenceId,
            referenceNumber: context.referenceNumber,
            reason: context.reason ?? 'Order processing commit',
            actorUserId: context.actorUserId,
            actorRole: context.actorRole
          },
          session
        );
      }
    } catch (error) {
      // Restore everything already deducted by this call.
      for (const entry of done) {
        const restored = await InventoryModel.findOneAndUpdate(
          { _id: entry.inventoryId, agencyId },
          { $inc: { quantityOnHand: entry.quantity, quantityReserved: entry.quantity } },
          { new: true, session }
        ).exec();
        if (restored) {
          await createMovement(
            {
              agencyId,
              productId: entry.productId,
              batchId: entry.batchId,
              batchNumber: entry.batchNumber,
              inventoryId: entry.inventoryId,
              type: 'SALE_REVERSAL',
              quantity: entry.quantity,
              direction: 'IN',
              balanceOnHand: restored.quantityOnHand,
              balanceReserved: restored.quantityReserved,
              referenceType: context.referenceType,
              referenceId: context.referenceId,
              referenceNumber: context.referenceNumber,
              reason: 'Commit failed; stock restored (compensating movement)',
              actorUserId: context.actorUserId,
              actorRole: context.actorRole
            },
            session
          );
        }
      }
      throw error;
    }
  };

  await withOptionalTransaction(run, { label });
};

/** Release reservations without a physical movement (order cancelled before processing). */
export const releaseStock = async (
  agencyId: Types.ObjectId,
  entries: CommitEntry[],
  context: ReserveContext
): Promise<number> => {
  const run = async (session?: ClientSession): Promise<number> => {
    let released = 0;
    for (const entry of entries) {
      if (entry.quantity <= 0) continue;
      const updated = await InventoryModel.findOneAndUpdate(
        { _id: entry.inventoryId, agencyId, quantityReserved: { $gte: entry.quantity } },
        { $inc: { quantityReserved: -entry.quantity }, $set: { lastMovementAt: new Date() } },
        { new: true, session }
      ).exec();
      if (!updated) {
        logger.warn('Reservation release skipped (no matching reservation)', {
          inventoryId: entry.inventoryId.toString(),
          quantity: entry.quantity
        });
        continue;
      }
      released += entry.quantity;
      await createMovement(
        {
          agencyId,
          productId: entry.productId,
          batchId: entry.batchId,
          batchNumber: entry.batchNumber,
          inventoryId: entry.inventoryId,
          type: 'RELEASE',
          quantity: entry.quantity,
          direction: 'IN',
          balanceOnHand: updated.quantityOnHand,
          balanceReserved: updated.quantityReserved,
          referenceType: context.referenceType,
          referenceId: context.referenceId,
          referenceNumber: context.referenceNumber,
          reason: context.reason ?? 'Reservation released',
          actorUserId: context.actorUserId,
          actorRole: context.actorRole
        },
        session
      );
    }
    return released;
  };

  return withOptionalTransaction(run, { label: `release:${context.referenceNumber ?? 'unknown'}` });
};

/**
 * Cancel policy for a committed order: physical stock is returned so the batch
 * becomes sellable again (unless it has since expired).
 */
export const returnStock = async (
  agencyId: Types.ObjectId,
  entries: CommitEntry[],
  context: ReserveContext
): Promise<number> => {
  const run = async (session?: ClientSession): Promise<number> => {
    let returned = 0;
    for (const entry of entries) {
      if (entry.quantity <= 0) continue;
      const updated = await InventoryModel.findOneAndUpdate(
        { _id: entry.inventoryId, agencyId, quantityOnHand: { $gte: 0 } },
        { $inc: { quantityOnHand: entry.quantity }, $set: { lastMovementAt: new Date() } },
        { new: true, session }
      ).exec();
      if (!updated) continue;
      returned += entry.quantity;
      await createMovement(
        {
          agencyId,
          productId: entry.productId,
          batchId: entry.batchId,
          batchNumber: entry.batchNumber,
          inventoryId: entry.inventoryId,
          type: 'RETURN',
          quantity: entry.quantity,
          direction: 'IN',
          balanceOnHand: updated.quantityOnHand,
          balanceReserved: updated.quantityReserved,
          referenceType: context.referenceType,
          referenceId: context.referenceId,
          referenceNumber: context.referenceNumber,
          reason: context.reason ?? 'Cancelled order: stock restored',
          actorUserId: context.actorUserId,
          actorRole: context.actorRole
        },
        session
      );
    }
    return returned;
  };

  return withOptionalTransaction(run, { label: `return:${context.referenceNumber ?? 'unknown'}` });
};

/** Mark a batch depleted when no sellable stock remains. */
export const refreshBatchStatus = async (agencyId: Types.ObjectId, batchIds: Types.ObjectId[]): Promise<void> => {
  if (batchIds.length === 0) return;
  const now = new Date();
  await Promise.all(
    batchIds.map(async (batchId) => {
      const inventories = await InventoryModel.find({ agencyId, batchId }).select(
        'quantityOnHand quantityReserved expiryDate isActive'
      );
      const live = inventories.filter((item) => item.isActive);
      const sellable = live.reduce(
        (total, item) => total + Math.max(0, item.quantityOnHand - item.quantityReserved),
        0
      );
      const expired = live.some((item) => item.expiryDate.getTime() <= now.getTime());
      const status = expired ? 'EXPIRED' : sellable <= 0 ? 'DEPLETED' : 'ACTIVE';
      await BatchModel.updateOne({ agencyId, _id: batchId }, { $set: { status } }).exec();
    })
  );
};

export const transactionMode = (): { supported: boolean; reason: string } => getTransactionCapability();
