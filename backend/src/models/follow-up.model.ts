import { Schema, model, models, type Model, type Types } from 'mongoose';
import { tenantPlugin } from './plugins/tenant.plugin';
import { FOLLOW_UP_STATUSES, FOLLOW_UP_TYPES, type FollowUpStatus, type FollowUpType } from '../constants/domain';

export interface IFollowUp {
  _id: Types.ObjectId;
  agencyId: Types.ObjectId;
  salesmanId: Types.ObjectId;
  salesmanUserId: Types.ObjectId;
  customerId: Types.ObjectId;
  customerUserId: Types.ObjectId;
  title: string;
  notes?: string;
  type: FollowUpType;
  dueAt: Date;
  status: FollowUpStatus;
  completedAt?: Date;
  outcome?: string;
  nextFollowUpAt?: Date;
  relatedOrderId?: Types.ObjectId;
  createdBy?: Types.ObjectId;
  updatedBy?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const followUpSchema = new Schema<IFollowUp>(
  {
    agencyId: { type: Schema.Types.ObjectId, ref: 'Agency', required: true },
    salesmanId: { type: Schema.Types.ObjectId, ref: 'Salesman', required: true },
    salesmanUserId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    customerId: { type: Schema.Types.ObjectId, ref: 'Customer', required: true },
    customerUserId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    title: { type: String, required: true, trim: true, maxlength: 160 },
    notes: { type: String, trim: true, maxlength: 2000 },
    type: { type: String, enum: FOLLOW_UP_TYPES, default: 'CALL', required: true },
    dueAt: { type: Date, required: true, index: true },
    status: { type: String, enum: FOLLOW_UP_STATUSES, default: 'PENDING', index: true },
    completedAt: { type: Date },
    outcome: { type: String, trim: true, maxlength: 1000 },
    nextFollowUpAt: { type: Date },
    relatedOrderId: { type: Schema.Types.ObjectId, ref: 'Order' },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User' }
  },
  { timestamps: true, versionKey: false }
);

followUpSchema.index({ agencyId: 1, salesmanId: 1, status: 1, dueAt: 1 });
followUpSchema.index({ agencyId: 1, customerId: 1, createdAt: -1 });
followUpSchema.index({ agencyId: 1, dueAt: 1, status: 1 });

followUpSchema.plugin(tenantPlugin);

export const FollowUpModel: Model<IFollowUp> =
  (models.FollowUp as Model<IFollowUp>) ?? model<IFollowUp>('FollowUp', followUpSchema);

export default FollowUpModel;
