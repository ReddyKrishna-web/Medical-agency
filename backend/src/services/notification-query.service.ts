import type { FilterQuery } from 'mongoose';
import { NotificationModel } from '../models/notification.model';
import { AppError } from '../utils/errors';
import type { AuthContext } from '../types/express';
import type { NotificationType } from '../constants/domain';

export const listNotifications = async (
  auth: AuthContext,
  filters: { unreadOnly?: boolean; type?: NotificationType; skip: number; limit: number }
) => {
  const filter: FilterQuery<Record<string, unknown>> = { agencyId: auth.agencyId, userId: auth.userId };
  if (filters.unreadOnly) filter.readAt = null;
  if (filters.type) filter.type = filters.type;

  const [items, total, unreadCount] = await Promise.all([
    NotificationModel.find(filter)
      .sort({ createdAt: -1 })
      .skip(filters.skip)
      .limit(filters.limit)
      .lean(),
    NotificationModel.countDocuments(filter),
    NotificationModel.countDocuments({ agencyId: auth.agencyId, userId: auth.userId, readAt: null })
  ]);

  return { items, total, unreadCount };
};

export const markNotificationsRead = async (
  auth: AuthContext,
  input: { notificationIds?: string[]; all?: boolean }
): Promise<number> => {
  const filter: FilterQuery<Record<string, unknown>> = {
    agencyId: auth.agencyId,
    userId: auth.userId,
    readAt: null
  };

  if (!input.all) {
    if (!input.notificationIds || input.notificationIds.length === 0) {
      throw AppError.badRequest('Provide notificationIds or set all=true');
    }
    filter._id = { $in: input.notificationIds };
  }

  const result = await NotificationModel.updateMany(filter, { $set: { readAt: new Date() } }).exec();
  return result.modifiedCount ?? 0;
};

export const unreadCount = async (auth: AuthContext): Promise<number> =>
  NotificationModel.countDocuments({ agencyId: auth.agencyId, userId: auth.userId, readAt: null }).exec();
