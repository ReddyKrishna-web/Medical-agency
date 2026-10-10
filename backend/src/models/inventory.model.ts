import { Schema, model, models, type Model, type Types } from 'mongoose';
import { tenantPlugin, applyJsonTransform } from './plugins/tenant.plugin';

/**
 * Dedicated stock ledger, one row per (agency, product, batch).
 * `quantityOnHand` is physical stock, `quantityReserved` is stock promised to a
 * confirmed order. Sellable = quantityOnHand - quantityReserved, and expired
 * batches are excluded entirely by every read/write path.
 */
export interface IInventory {
  _id: Types.ObjectId;
  agencyId: Types.ObjectId;
  productId: Types.ObjectId;
  batchId: Types.ObjectId;
  batchNumber: string;
  expiryDate: Date;
  location?: string;
  unitCost: number;
  quantityOnHand: number;
  quantityReserved: number;
  reorderLevel: number;
  isActive: boolean;
  lastMovementAt?: Date;
  createdBy?: Types.ObjectId;
  updatedBy?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const inventorySchema = new Schema<IInventory>(
  {
    agencyId: { type: Schema.Types.ObjectId, ref: 'Agency', required: true },
    productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
    batchId: { type: Schema.Types.ObjectId, ref: 'Batch', required: true },
    batchNumber: { type: String, required: true, trim: true, uppercase: true },
    expiryDate: { type: Date, required: true },
    location: { type: String, trim: true, maxlength: 120 },
    unitCost: { type: Number, default: 0, min: 0 },
    quantityOnHand: { type: Number, required: true, default: 0, min: 0 },
    quantityReserved: { type: Number, required: true, default: 0, min: 0 },
    reorderLevel: { type: Number, default: 0, min: 0 },
    isActive: { type: Boolean, default: true },
    lastMovementAt: { type: Date },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User' }
  },
  { timestamps: true, versionKey: false }
);

inventorySchema.index({ agencyId: 1, batchId: 1 }, { unique: true });
// FEFO index: agency + product + earliest expiry among live batches.
inventorySchema.index({ agencyId: 1, productId: 1, expiryDate: 1, isActive: 1 });
inventorySchema.index({ agencyId: 1, expiryDate: 1, isActive: 1 });

inventorySchema.virtual('quantityAvailable').get(function quantityAvailable(this: IInventory) {
  return Math.max(0, this.quantityOnHand - this.quantityReserved);
});

applyJsonTransform(inventorySchema, {
  virtuals: true,
  transform: (_doc, ret) => {
    ret.quantityAvailable = Math.max(0, (ret.quantityOnHand as number) - (ret.quantityReserved as number));
    ret.id = String(ret._id);
    delete ret.__v;
    return ret;
  }
});

inventorySchema.plugin(tenantPlugin);

export const InventoryModel: Model<IInventory> =
  (models.Inventory as Model<IInventory>) ?? model<IInventory>('Inventory', inventorySchema);

export default InventoryModel;
