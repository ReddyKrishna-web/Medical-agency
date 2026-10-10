import { Schema, model, models, type Model, type Types } from 'mongoose';
import { tenantPlugin } from './plugins/tenant.plugin';
import { STOCK_MOVEMENT_TYPES, type StockMovementType } from '../constants/domain';

export interface IStockMovement {
  _id: Types.ObjectId;
  agencyId: Types.ObjectId;
  productId: Types.ObjectId;
  productName?: string;
  batchId: Types.ObjectId;
  batchNumber: string;
  inventoryId: Types.ObjectId;
  type: StockMovementType;
  /** Always positive; `direction` carries the sign. */
  quantity: number;
  direction: 'IN' | 'OUT';
  /** Stock levels after the movement was applied (audit trail). */
  balanceOnHand: number;
  balanceReserved: number;
  unitCost?: number;
  referenceType?: 'ORDER' | 'INVOICE' | 'ADJUSTMENT' | 'MANUAL' | 'JOB' | 'REQUIREMENT';
  referenceId?: Types.ObjectId;
  referenceNumber?: string;
  reason?: string;
  note?: string;
  actorUserId?: Types.ObjectId;
  actorRole?: string;
  createdAt: Date;
  updatedAt: Date;
}

const stockMovementSchema = new Schema<IStockMovement>(
  {
    agencyId: { type: Schema.Types.ObjectId, ref: 'Agency', required: true },
    productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
    productName: { type: String, trim: true, maxlength: 180 },
    batchId: { type: Schema.Types.ObjectId, ref: 'Batch', required: true },
    batchNumber: { type: String, required: true, trim: true, uppercase: true },
    inventoryId: { type: Schema.Types.ObjectId, ref: 'Inventory', required: true },
    type: { type: String, enum: STOCK_MOVEMENT_TYPES, required: true, index: true },
    quantity: { type: Number, required: true, min: 0 },
    direction: { type: String, enum: ['IN', 'OUT'], required: true },
    balanceOnHand: { type: Number, required: true, min: 0 },
    balanceReserved: { type: Number, required: true, min: 0 },
    unitCost: { type: Number, min: 0 },
    referenceType: { type: String, enum: ['ORDER', 'INVOICE', 'ADJUSTMENT', 'MANUAL', 'JOB', 'REQUIREMENT'] },
    referenceId: { type: Schema.Types.ObjectId },
    referenceNumber: { type: String, trim: true, maxlength: 64 },
    reason: { type: String, trim: true, maxlength: 300 },
    note: { type: String, trim: true, maxlength: 500 },
    actorUserId: { type: Schema.Types.ObjectId, ref: 'User' },
    actorRole: { type: String, trim: true, maxlength: 32 }
  },
  { timestamps: true, versionKey: false }
);

stockMovementSchema.index({ agencyId: 1, productId: 1, createdAt: -1 });
stockMovementSchema.index({ agencyId: 1, batchId: 1, createdAt: -1 });
stockMovementSchema.index({ agencyId: 1, referenceType: 1, referenceId: 1, createdAt: -1 });
stockMovementSchema.index({ agencyId: 1, type: 1, createdAt: -1 });

stockMovementSchema.plugin(tenantPlugin);

export const StockMovementModel: Model<IStockMovement> =
  (models.StockMovement as Model<IStockMovement>) ??
  model<IStockMovement>('StockMovement', stockMovementSchema);

export default StockMovementModel;
