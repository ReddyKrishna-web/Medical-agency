import { Schema, model, models, type Model, type Types } from 'mongoose';

/**
 * Per-agency, per-year, per-purpose counter used to generate strictly sequential
 * human readable numbers (orders, invoices, payments). `nextSequence` performs an
 * atomic upsert-increment, so two concurrent requests can never receive the same
 * value.
 */
export interface ICounter {
  _id: Types.ObjectId;
  agencyId: Types.ObjectId;
  key: string;
  /** e.g. `2026`; reset automatically when the year changes. */
  period: string;
  value: number;
  createdAt: Date;
  updatedAt: Date;
}

const counterSchema = new Schema<ICounter>(
  {
    agencyId: { type: Schema.Types.ObjectId, ref: 'Agency', required: true },
    key: { type: String, required: true, trim: true, maxlength: 40 },
    period: { type: String, required: true, trim: true, maxlength: 20 },
    value: { type: Number, required: true, default: 0, min: 0 }
  },
  { timestamps: true, versionKey: false }
);

counterSchema.index({ agencyId: 1, key: 1, period: 1 }, { unique: true });

export const CounterModel: Model<ICounter> =
  (models.Counter as Model<ICounter>) ?? model<ICounter>('Counter', counterSchema);

export default CounterModel;
