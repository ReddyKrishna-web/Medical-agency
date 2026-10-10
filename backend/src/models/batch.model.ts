import { Schema, model, models, type Model, type Types } from 'mongoose';
import { tenantPlugin } from './plugins/tenant.plugin';

export type BatchStatus = 'ACTIVE' | 'EXPIRED' | 'DEPLETED' | 'QUARANTINED';

export interface IBatch {
  _id: Types.ObjectId;
  agencyId: Types.ObjectId;
  productId: Types.ObjectId;
  batchNumber: string;
  manufacturer?: string;
  mfgDate?: Date;
  expiryDate: Date;
  supplier?: string;
  receivedAt: Date;
  status: BatchStatus;
  note?: string;
  createdBy?: Types.ObjectId;
  updatedBy?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const batchSchema = new Schema<IBatch>(
  {
    agencyId: { type: Schema.Types.ObjectId, ref: 'Agency', required: true },
    productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true, index: true },
    batchNumber: { type: String, required: true, trim: true, uppercase: true, maxlength: 64 },
    manufacturer: { type: String, trim: true, maxlength: 120 },
    mfgDate: { type: Date },
    // Expired batches are never sellable; the date is indexed for FEFO selection.
    expiryDate: { type: Date, required: true, index: true },
    supplier: { type: String, trim: true, maxlength: 160 },
    receivedAt: { type: Date, default: () => new Date() },
    status: {
      type: String,
      enum: ['ACTIVE', 'EXPIRED', 'DEPLETED', 'QUARANTINED'],
      default: 'ACTIVE',
      index: true
    },
    note: { type: String, trim: true, maxlength: 500 },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User' }
  },
  { timestamps: true, versionKey: false }
);

batchSchema.index({ agencyId: 1, productId: 1, batchNumber: 1 }, { unique: true });
batchSchema.index({ agencyId: 1, productId: 1, expiryDate: 1, status: 1 });
batchSchema.index({ agencyId: 1, expiryDate: 1, status: 1 });

batchSchema.plugin(tenantPlugin);

batchSchema.virtual('isExpired').get(function isExpired(this: IBatch) {
  return this.expiryDate.getTime() <= Date.now();
});

export const BatchModel: Model<IBatch> = (models.Batch as Model<IBatch>) ?? model<IBatch>('Batch', batchSchema);

export default BatchModel;
