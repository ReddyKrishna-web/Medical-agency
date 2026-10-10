import type { Types } from 'mongoose';
import { InventoryModel } from '../models/inventory.model';
import { BatchModel } from '../models/batch.model';
import { ProductModel } from '../models/product.model';
import { refreshBatchStatus } from '../services/stock.service';
import { emitInventoryAlert } from '../sockets/emitters';
import { logger } from '../utils/logger';

let timer: NodeJS.Timeout | null = null;

const EXPIRY_SWEEP_MS = 6 * 60 * 60 * 1000;

/**
 * Marks expired batches and pushes `inventory.alert` for them. Purely advisory:
 * expired stock is already excluded from every sellable query, so a skipped or
 * failed sweep can never allow an expired unit to be sold.
 */
export const runExpirySweep = async (): Promise<void> => {
  const now = new Date();
  const result = await BatchModel.updateMany(
    { status: { $in: ['ACTIVE', 'DEPLETED'] }, expiryDate: { $lte: now } },
    { $set: { status: 'EXPIRED' } }
  ).exec();

  const expired = await InventoryModel.find({
    isActive: true,
    expiryDate: { $lte: now },
    quantityOnHand: { $gt: 0 }
  })
    .select('_id agencyId productId batchId batchNumber quantityOnHand expiryDate')
    .limit(200)
    .lean<Array<{
      _id: Types.ObjectId;
      agencyId: Types.ObjectId;
      productId: Types.ObjectId;
      batchId: Types.ObjectId;
      batchNumber: string;
      quantityOnHand: number;
    }>>();

  const productIds = Array.from(new Set(expired.map((row) => row.productId)));
  const products = await ProductModel.find({ _id: { $in: productIds } })
    .select('name')
    .lean<Array<{ _id: Types.ObjectId; name: string }>>();
  const nameMap = new Map(products.map((product) => [product._id.toString(), product.name]));

  for (const row of expired) {
    emitInventoryAlert(row.agencyId, {
      kind: 'EXPIRED',
      productId: row.productId.toString(),
      productName: nameMap.get(row.productId.toString()) ?? `Product ${row.productId.toString()}`,
      batchNumber: row.batchNumber,
      available: 0,
      threshold: 0
    });
    void refreshBatchStatus(row.agencyId, [row.batchId]);
  }

  if ((result.modifiedCount ?? 0) > 0 || expired.length > 0) {
    logger.info('Expiry sweep completed', {
      batchesMarked: result.modifiedCount ?? 0,
      alerted: expired.length,
      at: now.toISOString()
    });
  }
};

export const startScheduler = (): void => {
  if (timer) return;
  timer = setInterval(() => {
    void runExpirySweep().catch((error: unknown) => {
      logger.error('Expiry sweep failed', { error });
    });
  }, EXPIRY_SWEEP_MS);
  timer.unref();
  logger.info('Expiry sweep scheduler started', { intervalMs: EXPIRY_SWEEP_MS });
};

export const stopScheduler = (): void => {
  if (!timer) return;
  clearInterval(timer);
  timer = null;
};
