import type { Request, Response } from 'express';
import { asyncHandler } from '../middleware/async-handler';
import { buildPageMeta, sendCreated, sendData, sendPaginated } from '../utils/response';
import { requireAuth, toObjectIdSafe } from '../utils/tenant';
import { parseSort } from '../utils/pagination';
import * as messageService from '../services/message.service';
import * as followUpService from '../services/follow-up.service';
import * as notificationService from '../services/notification-query.service';
import { AppError } from '../utils/errors';

const MESSAGE_SORT_FIELDS = ['createdAt', 'readAt'] as const;
const FOLLOW_UP_SORT_FIELDS = ['createdAt', 'dueAt', 'status', 'title', 'updatedAt'] as const;

export const listMessages = asyncHandler(async (req: Request, res: Response) => {
  const auth = requireAuth(req.auth);
  const query = req.query as unknown as {
    page: number;
    limit: number;
    sort?: string;
    conversationWith?: string;
    unreadOnly?: boolean;
  };

  const { items, total } = await messageService.listMessages(auth, {
    conversationWith: query.conversationWith,
    unreadOnly: query.unreadOnly,
    sort: parseSort(query.sort, MESSAGE_SORT_FIELDS, { createdAt: -1 }),
    skip: (query.page - 1) * query.limit,
    limit: query.limit
  });

  sendPaginated(res, items, total, query.page, query.limit);
});

export const sendMessage = asyncHandler(async (req: Request, res: Response) => {
  const auth = requireAuth(req.auth);
  const message = await messageService.sendMessage(auth, req.body);
  sendCreated(res, message);
});

export const markMessagesRead = asyncHandler(async (req: Request, res: Response) => {
  const auth = requireAuth(req.auth);
  const updated = await messageService.markMessagesRead(auth, req.body);
  sendData(res, { updated });
});

export const listConversations = asyncHandler(async (req: Request, res: Response) => {
  const auth = requireAuth(req.auth);
  const conversations = await messageService.listConversations(auth);
  sendData(res, conversations);
});

export const listFollowUps = asyncHandler(async (req: Request, res: Response) => {
  const auth = requireAuth(req.auth);
  const query = req.query as unknown as {
    page: number;
    limit: number;
    search?: string;
    sort?: string;
    status?: string;
    type?: string;
    customerId?: string;
    salesmanId?: string;
    dueFrom?: string;
    dueTo?: string;
  };

  const scope = followUpService.followUpScopeFilter(auth);
  const { items, total } = await followUpService.listFollowUps(scope, {
    search: query.search,
    status: query.status as never,
    type: query.type as never,
    customerId: query.customerId,
    salesmanId: query.salesmanId,
    dueFrom: query.dueFrom ? new Date(query.dueFrom) : undefined,
    dueTo: query.dueTo ? new Date(query.dueTo) : undefined,
    sort: parseSort(query.sort, FOLLOW_UP_SORT_FIELDS, { dueAt: 1 }),
    skip: (query.page - 1) * query.limit,
    limit: query.limit
  });

  sendPaginated(res, items, total, query.page, query.limit);
});

export const createFollowUp = asyncHandler(async (req: Request, res: Response) => {
  const auth = requireAuth(req.auth);
  const followUp = await followUpService.createFollowUp(auth, req.body);
  sendCreated(res, followUp);
});

export const getFollowUp = asyncHandler(async (req: Request, res: Response) => {
  const auth = requireAuth(req.auth);
  const scope = followUpService.followUpScopeFilter(auth);
  const followUp = await followUpService.getFollowUp(scope, toObjectIdSafe(req.params.id, 'id'));
  sendData(res, followUp);
});

export const updateFollowUp = asyncHandler(async (req: Request, res: Response) => {
  const auth = requireAuth(req.auth);
  const followUp = await followUpService.updateFollowUp(auth, toObjectIdSafe(req.params.id, 'id'), req.body);
  sendData(res, followUp);
});

export const setFollowUpStatus = asyncHandler(async (req: Request, res: Response) => {
  const auth = requireAuth(req.auth);
  const followUp = await followUpService.setFollowUpStatus(
    auth,
    toObjectIdSafe(req.params.id, 'id'),
    req.body.status,
    req.body.note
  );
  sendData(res, followUp);
});

export const listNotifications = asyncHandler(async (req: Request, res: Response) => {
  const auth = requireAuth(req.auth);
  const query = req.query as unknown as { page: number; limit: number; unreadOnly?: boolean; type?: string };

  const result = await notificationService.listNotifications(auth, {
    unreadOnly: query.unreadOnly,
    type: query.type as never,
    skip: (query.page - 1) * query.limit,
    limit: query.limit
  });

  // Same envelope as every other list endpoint, plus the unread count the
  // notification centre needs for its badge.
  res.status(200).json({
    success: true,
    data: result.items,
    meta: { ...buildPageMeta(result.total, query.page, query.limit), unreadCount: result.unreadCount }
  });
});

export const markNotificationsRead = asyncHandler(async (req: Request, res: Response) => {
  const auth = requireAuth(req.auth);
  const updated = await notificationService.markNotificationsRead(auth, req.body);
  const unread = await notificationService.unreadCount(auth);
  sendData(res, { updated, unreadCount: unread });
});

export const listSalesmanOptions = asyncHandler(async (req: Request, res: Response) => {
  const auth = requireAuth(req.auth);
  if (auth.role === 'CUSTOMER') throw AppError.forbidden('Salesman directory is internal');
  const options = await followUpService.listSalesmanOptions(auth.agencyId);
  sendData(res, options);
});
