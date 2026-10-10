import { Schema, model, models, type Model, type Types } from 'mongoose';
import { tenantPlugin } from './plugins/tenant.plugin';
import { SALESMAN_STATUSES, type SalesmanStatus } from '../constants/domain';

export interface ISalesman {
  _id: Types.ObjectId;
  agencyId: Types.ObjectId;
  userId: Types.ObjectId;
  employeeCode: string;
  territory?: string;
  phone?: string;
  status: SalesmanStatus;
  /** Customer document ids this salesman is responsible for. */
  customerIds: Types.ObjectId[];
  monthlyTarget?: number;
  joinedAt?: Date;
  notes?: string;
  createdBy?: Types.ObjectId;
  updatedBy?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const salesmanSchema = new Schema<ISalesman>(
  {
    agencyId: { type: Schema.Types.ObjectId, ref: 'Agency', required: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    employeeCode: { type: String, required: true, trim: true, uppercase: true, maxlength: 32 },
    territory: { type: String, trim: true, maxlength: 120 },
    phone: { type: String, trim: true, maxlength: 32 },
    status: { type: String, enum: SALESMAN_STATUSES, default: 'ACTIVE', required: true },
    customerIds: { type: [Schema.Types.ObjectId], default: [] },
    monthlyTarget: { type: Number, min: 0 },
    joinedAt: { type: Date },
    notes: { type: String, trim: true, maxlength: 1000 },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User' }
  },
  { timestamps: true, versionKey: false }
);

salesmanSchema.index({ agencyId: 1, userId: 1 }, { unique: true });
salesmanSchema.index({ agencyId: 1, employeeCode: 1 }, { unique: true });
salesmanSchema.index({ agencyId: 1, status: 1 });
salesmanSchema.index({ agencyId: 1, customerIds: 1 });

salesmanSchema.plugin(tenantPlugin);

export const SalesmanModel: Model<ISalesman> =
  (models.Salesman as Model<ISalesman>) ?? model<ISalesman>('Salesman', salesmanSchema);

export default SalesmanModel;
