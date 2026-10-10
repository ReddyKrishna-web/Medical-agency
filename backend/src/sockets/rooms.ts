import type { Types } from 'mongoose';

export const roomForUser = (userId: Types.ObjectId | string): string => `user:${userId.toString()}`;

export const roomForAgency = (agencyId: Types.ObjectId | string): string => `agency:${agencyId.toString()}`;

/** Every event name is namespaced so clients can subscribe precisely. */
export const SOCKET_EVENTS = {
  ORDER_CREATED: 'order.created',
  ORDER_UPDATED: 'order.updated',
  MESSAGE_CREATED: 'message.created',
  NOTIFICATION_CREATED: 'notification.created',
  INVENTORY_ALERT: 'inventory.alert'
} as const;

export type SocketEventName = (typeof SOCKET_EVENTS)[keyof typeof SOCKET_EVENTS];
