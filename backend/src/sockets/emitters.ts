import type { Types } from 'mongoose';
import { getIo } from '../sockets';
import { SOCKET_EVENTS, roomForUser, roomForAgency } from '../sockets/rooms';
import { logger } from '../utils/logger';
import type { INotification } from '../models/notification.model';
import type { IMessage } from '../models/message.model';
import type { IOrder } from '../models/order.model';

type MinimalOrder = Pick<IOrder, '_id' | 'orderNumber' | 'status' | 'subtotal' | 'taxTotal' | 'grandTotal' | 'customerId' | 'customerUserId' | 'salesmanId' | 'salesmanUserId' | 'createdAt'>;

/** Minimal, already-authorized projection. Never ship a whole customer record. */
export const minimalOrder = (order: IOrder): Record<string, unknown> => ({
  id: order._id,
  orderNumber: order.orderNumber,
  status: order.status,
  subtotal: order.subtotal,
  taxTotal: order.taxTotal,
  grandTotal: order.grandTotal,
  customerId: order.customerId,
  createdAt: order.createdAt
});

const emitToUser = (userId: Types.ObjectId | string | undefined, event: string, payload: unknown): void => {
  if (!userId) return;
  getIo()?.to(roomForUser(userId)).emit(event, payload);
};

const emitToAgency = (agencyId: Types.ObjectId | string, event: string, payload: unknown): void => {
  getIo()?.to(roomForAgency(agencyId)).emit(event, payload);
};

/** New order: customer owner, assigned salesman, and agency admins only. */
export const emitOrderCreated = (order: IOrder, recipients: Types.ObjectId[]): void => {
  const payload = { order: minimalOrder(order) };
  emitToUser(order.customerUserId, SOCKET_EVENTS.ORDER_CREATED, payload);
  emitToUser(order.salesmanUserId, SOCKET_EVENTS.ORDER_CREATED, payload);
  for (const recipient of recipients) {
    if (String(recipient) === String(order.customerUserId)) continue;
    if (order.salesmanUserId && String(recipient) === String(order.salesmanUserId)) continue;
    emitToUser(recipient, SOCKET_EVENTS.ORDER_CREATED, payload);
  }
  logger.debug('Emitted order.created', { orderId: order._id.toString() });
};

export const emitOrderUpdated = (
  order: IOrder,
  previousStatus: string,
  adminRecipients: Types.ObjectId[]
): void => {
  const payload = {
    order: minimalOrder(order),
    previousStatus,
    status: order.status
  };
  emitToUser(order.customerUserId, SOCKET_EVENTS.ORDER_UPDATED, payload);
  emitToUser(order.salesmanUserId, SOCKET_EVENTS.ORDER_UPDATED, payload);
  for (const recipient of adminRecipients) {
    emitToUser(recipient, SOCKET_EVENTS.ORDER_UPDATED, payload);
  }
  logger.debug('Emitted order.updated', { orderId: order._id.toString(), previousStatus, status: order.status });
};

export const emitMessageCreated = (message: IMessage, participants: Types.ObjectId[]): void => {
  const payload = {
    message: {
      id: message._id,
      conversationKey: message.conversationKey,
      senderId: message.senderId,
      receiverId: message.receiverId,
      body: message.body,
      orderId: message.orderId ?? null,
      orderReference: message.orderReference ?? null,
      readAt: message.readAt ?? null,
      createdAt: message.createdAt
    }
  };
  emitToUser(message.senderId, SOCKET_EVENTS.MESSAGE_CREATED, payload);
  emitToUser(message.receiverId, SOCKET_EVENTS.MESSAGE_CREATED, payload);
  for (const participant of participants) {
    emitToUser(participant, SOCKET_EVENTS.MESSAGE_CREATED, payload);
  }
};

export const emitNotificationCreated = (notification: INotification): void => {
  emitToUser(notification.userId, SOCKET_EVENTS.NOTIFICATION_CREATED, {
    notification: {
      id: notification._id,
      type: notification.type,
      title: notification.title,
      message: notification.message,
      data: notification.data ?? null,
      entityType: notification.entityType ?? null,
      entityId: notification.entityId ?? null,
      readAt: notification.readAt ?? null,
      createdAt: notification.createdAt
    }
  });
};

/** Inventory alerts are agency wide (admins + salesmen watching stock). */
export const emitInventoryAlert = (
  agencyId: Types.ObjectId,
  alert: { kind: 'LOW_STOCK' | 'EXPIRED' | 'OUT_OF_STOCK'; productId: string; productName: string; batchNumber?: string; available: number; threshold: number }
): void => {
  emitToAgency(agencyId, SOCKET_EVENTS.INVENTORY_ALERT, { alert });
};

export type { MinimalOrder };
