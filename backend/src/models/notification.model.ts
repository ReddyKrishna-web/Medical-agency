import { Schema, model, models, type Model, type Types } from 'mongoose';
import { tenantPlugin, applyJsonTransform } from './plugins/tenant.plugin';
import { NOTIFICATION_TYPES, type NotificationType } from '../constants/domain';

export interface INotification {
  _id: Types.ObjectId;
  agencyId: Types.ObjectId;
  userId: Types.ObjectId;
  type: NotificationType;
  title: string;
  message: string;
  /** Minimal, already-authorized payload for the recipient only. */
  data?: Record<string, unknown>;
  entityType?: string;
  entityId?: Types.ObjectId;
  readAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const notificationSchema = new Schema<INotification>(
  {
    agencyId: { type: Schema.Types.ObjectId, ref: 'Agency', required: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    type: { type: String, enum: NOTIFICATION_TYPES, required: true, index: true },
    title: { type: String, required: true, trim: true, maxlength: 160 },
    message: { type: String, required: true, trim: true, maxlength: 1000 },
    data: { type: Schema.Types.Mixed },
    entityType: { type: String, trim: true, maxlength: 40 },
    entityId: { type: Schema.Types.ObjectId },
    readAt: { type: Date }
  },
  { timestamps: true, versionKey: false }
);

notificationSchema.index({ agencyId: 1, userId: 1, readAt: 1, createdAt: -1 });
notificationSchema.index({ agencyId: 1, userId: 1, createdAt: -1 });
notificationSchema.index({ agencyId: 1, type: 1, createdAt: -1 });

notificationSchema.plugin(tenantPlugin);

applyJsonTransform(notificationSchema, {
  transform: (_doc, ret) => {
    ret.id = String(ret._id);
    delete ret.__v;
    return ret;
  }
});

export const NotificationModel: Model<INotification> =
  (models.Notification as Model<INotification>) ??
  model<INotification>('Notification', notificationSchema);

export default NotificationModel;
