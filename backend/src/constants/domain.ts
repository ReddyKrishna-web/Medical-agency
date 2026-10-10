export const ORDER_STATUSES = [
  'PENDING',
  'UNDER_REVIEW',
  'CONFIRMED',
  'PROCESSING',
  'PACKED',
  'DISPATCHED',
  'DELIVERED',
  'CANCELLED'
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

/**
 * Guarded state machine. Only these edges exist; every mutation must go
 * through `canTransition` so a client can never skip fulfilment stages.
 */
export const ORDER_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  PENDING: ['UNDER_REVIEW', 'CANCELLED'],
  UNDER_REVIEW: ['CONFIRMED', 'PENDING', 'CANCELLED'],
  CONFIRMED: ['PROCESSING', 'CANCELLED'],
  PROCESSING: ['PACKED', 'CANCELLED'],
  PACKED: ['DISPATCHED', 'CANCELLED'],
  DISPATCHED: ['DELIVERED', 'CANCELLED'],
  DELIVERED: [],
  CANCELLED: []
};

export const CANCELLED_TERMINAL_STATES: OrderStatus[] = ['DELIVERED', 'CANCELLED'];

/** Customers may only withdraw an order before physical fulfilment starts. */
export const CUSTOMER_CANCELLABLE_STATUSES: OrderStatus[] = ['PENDING', 'UNDER_REVIEW', 'CONFIRMED'];

/** Admins may cancel anything that has not been delivered yet. */
export const ADMIN_CANCELLABLE_STATUSES: OrderStatus[] = [
  'PENDING',
  'UNDER_REVIEW',
  'CONFIRMED',
  'PROCESSING',
  'PACKED',
  'DISPATCHED'
];

/** Statuses where stock is physically reserved (but not yet deducted). */
export const ALLOCATED_STATUSES: OrderStatus[] = ['CONFIRMED'];

/** Statuses where stock has been physically deducted from inventory. */
export const COMMITTED_STATUSES: OrderStatus[] = ['PROCESSING', 'PACKED', 'DISPATCHED', 'DELIVERED'];

export const ROLES = ['CUSTOMER', 'SALESMAN', 'AGENCY_ADMIN'] as const;
export type Role = (typeof ROLES)[number];

export const USER_STATUSES = ['PENDING', 'ACTIVE', 'DISABLED'] as const;
export type UserStatus = (typeof USER_STATUSES)[number];

export const CUSTOMER_STATUSES = ['PENDING', 'APPROVED', 'REJECTED', 'ACTIVE', 'DISABLED'] as const;
export type CustomerStatus = (typeof CUSTOMER_STATUSES)[number];

export const SALESMAN_STATUSES = ['ACTIVE', 'INACTIVE', 'SUSPENDED'] as const;
export type SalesmanStatus = (typeof SALESMAN_STATUSES)[number];

export const FOLLOW_UP_STATUSES = ['PENDING', 'COMPLETED', 'CANCELLED'] as const;
export type FollowUpStatus = (typeof FOLLOW_UP_STATUSES)[number];

export const FOLLOW_UP_TYPES = ['CALL', 'VISIT', 'WHATSAPP', 'EMAIL', 'OTHER'] as const;
export type FollowUpType = (typeof FOLLOW_UP_TYPES)[number];

export const REQUIREMENT_STATUSES = ['SUBMITTED', 'IN_REVIEW', 'ACCEPTED', 'REJECTED', 'CONVERTED'] as const;
export type RequirementStatus = (typeof REQUIREMENT_STATUSES)[number];

export const INVOICE_STATUSES = ['ISSUED', 'PARTIALLY_PAID', 'PAID', 'VOID'] as const;
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];

export const PAYMENT_METHODS = ['CASH', 'BANK_TRANSFER', 'UPI', 'CARD', 'CHEQUE', 'OTHER'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const STOCK_MOVEMENT_TYPES = [
  'RECEIVE',
  'RESERVE',
  'DEDUCT',
  'RELEASE',
  'ADJUST_IN',
  'ADJUST_OUT',
  'RETURN',
  'EXPIRE_WRITE_OFF',
  'SALE_REVERSAL'
] as const;
export type StockMovementType = (typeof STOCK_MOVEMENT_TYPES)[number];

export const NOTIFICATION_TYPES = [
  'ORDER_CREATED',
  'ORDER_STATUS',
  'MESSAGE_RECEIVED',
  'INVENTORY_LOW',
  'INVENTORY_EXPIRED',
  'ACCOUNT_APPROVED',
  'ACCOUNT_REJECTED',
  'PAYMENT_RECORDED',
  'FOLLOW_UP_DUE',
  'REQUIREMENT_UPLOADED',
  'SYSTEM'
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export const ORDER_SOURCES = ['CUSTOMER_PORTAL', 'SALESMAN', 'ADMIN', 'REQUIREMENT', 'REORDER'] as const;
export type OrderSource = (typeof ORDER_SOURCES)[number];

/**
 * Catalogue availability derived from live, nonexpired inventory
 * (sellable = quantityOnHand - quantityReserved).
 */
export const PRODUCT_AVAILABILITIES = ['IN_STOCK', 'LOW_STOCK', 'OUT_OF_STOCK'] as const;
export type ProductAvailability = (typeof PRODUCT_AVAILABILITIES)[number];

/** Lifecycle of a public website contact form submission. */
export const CONTACT_SUBMISSION_STATUSES = ['NEW', 'IN_REVIEW', 'CONTACTED', 'CLOSED', 'SPAM'] as const;
export type ContactSubmissionStatus = (typeof CONTACT_SUBMISSION_STATUSES)[number];

/** Reasons a visitor can give on the public contact form. */
export const CONTACT_TOPICS = [
  'NEW_ORDER_ENQUIRY',
  'PRODUCT_ENQUIRY',
  'PRICING_REQUEST',
  'PARTNERSHIP',
  'COMPLAINT',
  'SUPPORT',
  'OTHER'
] as const;
export type ContactTopic = (typeof CONTACT_TOPICS)[number];

/** Days of the week, in the order an agency publishes them. */
export const WEEK_DAYS = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'] as const;
export type WeekDay = (typeof WEEK_DAYS)[number];

/** Business events an agency can opt into notifying its admins about. */
export const NOTIFICATION_PREFERENCE_KEYS = [
  'newOrder',
  'orderStatusChange',
  'paymentRecorded',
  'inventoryLow',
  'inventoryExpiring',
  'requirementUploaded',
  'followUpDue',
  'contactSubmission'
] as const;
export type NotificationPreferenceKey = (typeof NOTIFICATION_PREFERENCE_KEYS)[number];

export const AI_DISCLAIMER =
  'AI output is advisory, generated only from the requesting user authorised agency data, and requires human review. It never submits orders or makes clinical decisions.';
