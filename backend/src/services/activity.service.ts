import type { Types } from 'mongoose';
import { ActivityLogModel, type IActivityLog } from '../models/activity-log.model';
import { logger } from '../utils/logger';

export interface ActivityInput {
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
}

/**
 * Activity logging must never break the request it is describing, so failures
 * are logged and swallowed rather than propagated.
 */
export const recordActivity = async (input: ActivityInput): Promise<IActivityLog | null> => {
  try {
    const [created] = await ActivityLogModel.create([input]);
    return created ?? null;
  } catch (error) {
    logger.error('Failed to record activity log', { action: input.action, error });
    return null;
  }
};

export const recordActivitySafe = (input: ActivityInput): void => {
  void recordActivity(input);
};
