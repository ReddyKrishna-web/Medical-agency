import { Schema, model, models, type Model, type Types } from 'mongoose';

/**
 * Idempotency records let a client safely retry a mutating request (order create,
 * payment record, requirement conversion) without creating duplicates.
 */
export interface IIdempotencyKey {
  _id: Types.ObjectId;
  agencyId: Types.ObjectId;
  userId: Types.ObjectId;
  key: string;
  method: string;
  path: string;
  requestHash: string;
  status: 'IN_PROGRESS' | 'COMPLETED';
  statusCode?: number;
  responseBody?: unknown;
  resourceId?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const idempotencySchema = new Schema<IIdempotencyKey>(
  {
    agencyId: { type: Schema.Types.ObjectId, ref: 'Agency', required: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    key: { type: String, required: true, trim: true, maxlength: 120 },
    method: { type: String, required: true, maxlength: 10 },
    path: { type: String, required: true, maxlength: 200 },
    requestHash: { type: String, required: true, maxlength: 64 },
    status: { type: String, enum: ['IN_PROGRESS', 'COMPLETED'], default: 'IN_PROGRESS' },
    statusCode: { type: Number },
    responseBody: { type: Schema.Types.Mixed },
    resourceId: { type: Schema.Types.ObjectId }
  },
  { timestamps: true, versionKey: false }
);

idempotencySchema.index({ agencyId: 1, userId: 1, key: 1 }, { unique: true });
idempotencySchema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 });

export const IdempotencyKeyModel: Model<IIdempotencyKey> =
  (models.IdempotencyKey as Model<IIdempotencyKey>) ??
  model<IIdempotencyKey>('IdempotencyKey', idempotencySchema);

export default IdempotencyKeyModel;
