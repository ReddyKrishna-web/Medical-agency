import type { Types } from 'mongoose';
import { NotificationModel, type INotification } from '../models/notification.model';
import { UserModel } from '../models/user.model';
import { emitNotificationCreated } from '../sockets/emitters';
import { logger } from '../utils/logger';
import type { NotificationType } from '../constants/domain';
import type { Role } from '../constants/domain';

export interface CreateNotificationInput {
  agencyId: Types.ObjectId;
  userId: Types.ObjectId;
  type: NotificationType;
  title: string;
  message: string;
  data?: Record<string, unknown>;
  entityType?: string;
  entityId?: Types.ObjectId;
}

/** Persist first, then emit. The database record is the source of truth. */
export const createNotification = async (input: CreateNotificationInput): Promise<INotification> => {
  const [created] = await NotificationModel.create([{ ...input }]);
  if (!created) throw new Error('Notification could not be created');
  emitNotificationCreated(created);
  return created;
};

export const createNotificationSafe = (input: CreateNotificationInput): void => {
  void createNotification(input).catch(() => {
    logger.error('Failed to create notification', { type: input.type, userId: input.userId.toString() });
  });
};

/** Resolve every active agency admin user id of a tenant. */
export const resolveAdminUserIds = async (agencyId: Types.ObjectId): Promise<Types.ObjectId[]> => {
  const admins = await UserModel.find({
    agencyId,
    role: 'AGENCY_ADMIN',
    status: 'ACTIVE'
  })
    .select('_id')
    .lean<{ _id: Types.ObjectId }[]>();
  return admins.map((admin) => admin._id);
};

export const notifyRoles = async (
  agencyId: Types.ObjectId,
  roles: Role[],
  input: Omit<CreateNotificationInput, 'agencyId' | 'userId'>
): Promise<void> => {
  try {
    const users = await UserModel.find({ agencyId, role: { $in: roles }, status: 'ACTIVE' })
      .select('_id')
      .lean<{ _id: Types.ObjectId }[]>();
    await Promise.all(
      users.map((user) =>
        createNotification({
          agencyId,
          userId: user._id,
          type: input.type,
          title: input.title,
          message: input.message,
          data: input.data,
          entityType: input.entityType,
          entityId: input.entityId
        })
      )
    );
  } catch {
    logger.warn('Bulk notification failed', { agencyId: agencyId.toString() });
  }
};
