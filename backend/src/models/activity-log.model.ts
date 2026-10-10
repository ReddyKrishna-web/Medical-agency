import { Schema, model, models, type Model, type Types } from 'mongoose';
import { tenantPlugin } from './plugins/tenant.plugin';

export interface IActivityLog {
  _id: Types.ObjectId;
  agencyId: Types.ObjectId;
  actorUserId?: Types.ObjectId;
  actorRole?: string;
  action: string;
  entity: string;
  entityId?: Types.ObjectId;
  summary?: string;
  meta?: Record<string, unknown>;
  ip?: string;
  userAgent?: string;
  createdAt: Date;
  updatedAt: Date;
}

const activityLogSchema = new Schema<IActivityLog>(
  {
    agencyId: { type: Schema.Types.ObjectId, ref: 'Agency', required: true },
    actorUserId: { type: Schema.Types.ObjectId, ref: 'User', index: true },
    actorRole: { type: String, trim: true, maxlength: 32 },
    action: { type: String, required: true, trim: true, maxlength: 80, index: true },
    entity: { type: String, required: true, trim: true, maxlength: 40, index: true },
    entityId: { type: Schema.Types.ObjectId },
    summary: { type: String, trim: true, maxlength: 300 },
    meta: { type: Schema.Types.Mixed },
    ip: { type: String, trim: true, maxlength: 64 },
    userAgent: { type: String, trim: true, maxlength: 300 }
  },
  { timestamps: true, versionKey: false }
);

activityLogSchema.index({ agencyId: 1, entity: 1, entityId: 1, createdAt: -1 });
activityLogSchema.index({ agencyId: 1, actorUserId: 1, createdAt: -1 });

activityLogSchema.plugin(tenantPlugin);

export const ActivityLogModel: Model<IActivityLog> =
  (models.ActivityLog as Model<IActivityLog>) ?? model<IActivityLog>('ActivityLog', activityLogSchema);

export default ActivityLogModel;
