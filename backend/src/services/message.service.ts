import type { FilterQuery, Types } from 'mongoose';
import { Types as MongooseTypes } from 'mongoose';import { MessageModel, type IMessage } from '../models/message.model';
import { UserModel } from '../models/user.model';
import { OrderModel } from '../models/order.model';
import { AppError } from '../utils/errors';
import { recordActivity } from './activity.service';
import { createNotificationSafe } from './notification.service';
import { emitMessageCreated } from '../sockets/emitters';
import type { AuthContext } from '../types/express';
import { isAdmin, isCustomer, isSalesman } from '../utils/tenant';

/** Deterministic key so both participants compute the same conversation id. */
export const conversationKeyFor = (userA: Types.ObjectId | string, userB: Types.ObjectId | string): string =>
  [userA.toString(), userB.toString()].sort().join(':');

/**
 * Who may message whom inside one tenant:
 *  - customer -> their own customer user, or the agency's salesmen/admins
 *  - salesman/admin -> any user of the same agency
 * Cross-tenant ids can never resolve because the query is agency scoped.
 */
export const assertCanMessage = async (auth: AuthContext, receiverId: Types.ObjectId): Promise<void> => {
  const receiver = await UserModel.findOne({ agencyId: auth.agencyId, _id: receiverId })
    .select('_id role status')
    .lean<{ _id: Types.ObjectId; role: string; status: string }>();
  if (!receiver) throw AppError.notFound('Recipient');
  if (String(receiver._id) === String(auth.userId)) throw AppError.badRequest('You cannot message yourself');
  if (receiver.status !== 'ACTIVE') throw AppError.forbidden('This account cannot receive messages');

  if (isCustomer(auth)) {
    if (receiver.role === 'CUSTOMER') {
      throw AppError.forbidden('Customers cannot message other customers');
    }
    return;
  }

  if (isSalesman(auth)) {
    if (receiver.role === 'CUSTOMER') {
      const { CustomerModel } = await import('../models/customer.model');
      const customer = await CustomerModel.findOne({ agencyId: auth.agencyId, userId: receiver._id })
        .select('_id assignedSalesmanId')
        .lean<{ _id: Types.ObjectId; assignedSalesmanId?: Types.ObjectId }>();
      if (!customer) throw AppError.forbidden('You cannot message this customer');
      if (!auth.salesmanId || String(customer.assignedSalesmanId ?? '') !== String(auth.salesmanId)) {
        throw AppError.forbidden('This customer is not assigned to you');
      }
    }
    return;
  }

  if (isAdmin(auth)) return;
};

export interface SendMessageInput {
  receiverId: string;
  body: string;
  orderId?: string;
  orderReference?: string;
}

export const sendMessage = async (auth: AuthContext, input: SendMessageInput): Promise<IMessage> => {
  const receiverId = new MongooseTypes.ObjectId(input.receiverId);
  await assertCanMessage(auth, receiverId);

  let orderId: Types.ObjectId | undefined;
  if (input.orderId) {
    const order = await OrderModel.findOne({ agencyId: auth.agencyId, _id: input.orderId })
      .select('_id orderNumber')
      .lean<{ _id: Types.ObjectId; orderNumber: string }>();
    if (!order) throw AppError.notFound('Order');
    // A customer may only reference their own order.
    if (isCustomer(auth) && String(order._id) !== String(auth.customerId ?? '')) {
      const orderCustomer = await OrderModel.findOne({ agencyId: auth.agencyId, _id: order._id })
        .select('customerId')
        .lean<{ customerId: Types.ObjectId }>();
      if (!orderCustomer || String(orderCustomer.customerId) !== String(auth.customerId ?? '')) {
        throw AppError.forbidden('You can only reference your own orders');
      }
    }
    orderId = order._id;
  }

  const [message] = await MessageModel.create([
    {
      agencyId: auth.agencyId,
      conversationKey: conversationKeyFor(auth.userId, receiverId),
      senderId: auth.userId,
      receiverId,
      body: input.body.trim(),
      orderId,
      orderReference: input.orderReference
    }
  ]);

  if (!message) throw AppError.internal('Message could not be sent');

  // Keep the CRM "last contact" signal accurate without exposing message text.
  const { markCustomerContact } = await import('./customer.service');
  const { CustomerModel } = await import('../models/customer.model');
  const customerForContact = await CustomerModel.findOne({ agencyId: auth.agencyId, $or: [{ userId: auth.userId }, { userId: receiverId }] })
    .select('_id')
    .lean<{ _id: Types.ObjectId }>();
  if (customerForContact) {
    await markCustomerContact(auth.agencyId, customerForContact._id, 'MESSAGE', message.createdAt);
  }

  createNotificationSafe({
    agencyId: auth.agencyId,
    userId: receiverId,
    type: 'MESSAGE_RECEIVED',
    title: `New message from ${auth.name}`,
    message: input.body.trim().slice(0, 140),
    data: { messageId: message._id.toString(), senderId: auth.userId.toString() },
    entityType: 'Message',
    entityId: message._id
  });

  // Notify the agency side (admins + the assigned salesman) for customer-initiated chat.
  if (isCustomer(auth)) {
    const { resolveAdminUserIds } = await import('./notification.service');
    for (const adminId of await resolveAdminUserIds(auth.agencyId)) {
      if (String(adminId) === String(receiverId)) continue;
      createNotificationSafe({
        agencyId: auth.agencyId,
        userId: adminId,
        type: 'MESSAGE_RECEIVED',
        title: `New customer message from ${auth.name}`,
        message: input.body.trim().slice(0, 140),
        data: { messageId: message._id.toString(), senderId: auth.userId.toString() },
        entityType: 'Message',
        entityId: message._id
      });
    }
  }

  emitMessageCreated(message, []);

  await recordActivity({
    agencyId: auth.agencyId,
    actorUserId: auth.userId,
    actorRole: auth.role,
    action: 'message.send',
    entity: 'Message',
    entityId: message._id,
    summary: `Messaged user ${receiverId.toString()}`,
    meta: { orderId: orderId?.toString() }
  });

  return message;
};

export const messageScopeFilter = (auth: AuthContext): FilterQuery<Record<string, unknown>> => ({
  agencyId: auth.agencyId,
  $or: [{ senderId: auth.userId }, { receiverId: auth.userId }]
});

export const listMessages = async (
  auth: AuthContext,
  filters: { conversationWith?: string; skip: number; limit: number; unreadOnly?: boolean; sort?: Record<string, 1 | -1> }
) => {
  const filter: FilterQuery<Record<string, unknown>> = { agencyId: auth.agencyId };

  if (filters.conversationWith) {
    const other = new MongooseTypes.ObjectId(filters.conversationWith);
    const exists = await UserModel.exists({ agencyId: auth.agencyId, _id: other });
    if (!exists) throw AppError.notFound('Conversation partner');
    filter.conversationKey = conversationKeyFor(auth.userId, other);
  } else {
    filter.$or = [{ senderId: auth.userId }, { receiverId: auth.userId }];
  }

  if (filters.unreadOnly) {
    filter.receiverId = auth.userId;
    filter.readAt = null;
  }

  const [items, total] = await Promise.all([
    MessageModel.find(filter)
      .sort(filters.sort ?? { createdAt: -1 })
      .skip(filters.skip)
      .limit(filters.limit)
      .lean(),
    MessageModel.countDocuments(filter)
  ]);
  return { items, total };
};

export const markMessagesRead = async (
  auth: AuthContext,
  input: { messageIds?: string[]; conversationWith?: string }
): Promise<number> => {
  const filter: FilterQuery<Record<string, unknown>> = {
    agencyId: auth.agencyId,
    receiverId: auth.userId,
    readAt: null
  };

  if (input.messageIds && input.messageIds.length > 0) {
    filter._id = { $in: input.messageIds.map((id) => new MongooseTypes.ObjectId(id)) };
  } else if (input.conversationWith) {
    filter.conversationKey = conversationKeyFor(auth.userId, input.conversationWith);
  } else {
    throw AppError.badRequest('Provide messageIds or conversationWith');
  }

  const result = await MessageModel.updateMany(filter, { $set: { readAt: new Date() } }).exec();
  return result.modifiedCount ?? 0;
};

export const listConversations = async (auth: AuthContext) => {
  const rows = await MessageModel.aggregate<{
    _id: string;
    lastMessageAt: Date;
    lastBody: string;
    unread: number;
    partnerId: string;
  }>([
    { $match: { agencyId: auth.agencyId, $or: [{ senderId: auth.userId }, { receiverId: auth.userId }] } },
    {
      $addFields: {
        partnerId: {
          $cond: [{ $eq: ['$senderId', auth.userId] }, '$receiverId', '$senderId']
        },
        isUnread: { $and: [{ $eq: ['$receiverId', auth.userId] }, { $eq: [{ $type: '$readAt' }, 'missing'] }] }
      }
    },
    // Oldest first so `$last` below captures the newest message per partner;
    // without this sort the grouped preview could come from any document.
    { $sort: { createdAt: 1 } },
    {
      $group: {
        _id: '$partnerId',
        lastMessageAt: { $last: '$createdAt' },
        lastBody: { $last: '$body' },
        unread: { $sum: { $cond: ['$isUnread', 1, 0] } }
      }
    },
    { $sort: { lastMessageAt: -1 } },
    { $limit: 100 }
  ]).exec();

  const partnerIds = rows.map((row) => row.partnerId).filter((id) => MongooseTypes.ObjectId.isValid(id));
  const partners = await UserModel.find({
    agencyId: auth.agencyId,
    _id: { $in: partnerIds.map((id) => new MongooseTypes.ObjectId(id)) }
  })
    .select('name email role avatarUrl')
    .lean<Array<{ _id: Types.ObjectId; name: string; email: string; role: string; avatarUrl?: string }>>();

  const partnerMap = new Map(partners.map((partner) => [partner._id.toString(), partner]));

  return rows.map((row) => ({
    partner: partnerMap.get(row._id) ?? { _id: row._id, name: 'Unknown user', role: 'UNKNOWN' },
    conversationKey: conversationKeyFor(auth.userId, row._id),
    lastMessageAt: row.lastMessageAt,
    lastBody: row.lastBody,
    unreadCount: row.unread
  }));
};
