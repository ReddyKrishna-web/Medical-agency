import type {
  BatchStatus,
  FollowUpStatus,
  FollowUpType,
  ID,
  InvoiceStatus,
  OrderStatus,
  PaymentMethod,
  RequirementStatus,
  Role,
} from '@/types/api';

export type BadgeTone = 'blue' | 'green' | 'amber' | 'red' | 'slate' | 'purple';

const toneMap: Record<string, BadgeTone> = {
  // orders — in-review and in-progress states read as informational (blue)
  PENDING: 'amber',
  UNDER_REVIEW: 'blue',
  CONFIRMED: 'blue',
  PROCESSING: 'blue',
  PACKED: 'purple',
  DISPATCHED: 'blue',
  DELIVERED: 'green',
  CANCELLED: 'red',
  // accounts
  APPROVED: 'green',
  ACTIVE: 'green',
  REJECTED: 'red',
  DISABLED: 'slate',
  INACTIVE: 'slate',
  SUSPENDED: 'amber',
  // finance
  ISSUED: 'blue',
  PARTIALLY_PAID: 'amber',
  PAID: 'green',
  VOID: 'slate',
  // requirements
  SUBMITTED: 'blue',
  IN_REVIEW: 'blue',
  ACCEPTED: 'green',
  CONVERTED: 'purple',
  // follow-ups
  COMPLETED: 'green',
  RESCHEDULED: 'blue',
  // stock
  IN_STOCK: 'green',
  LOW_STOCK: 'amber',
  OUT_OF_STOCK: 'red',
  EXPIRING_SOON: 'amber',
  OK: 'green',
  DEPLETED: 'slate',
  QUARANTINED: 'purple',
  LOW: 'amber',
  EXPIRED: 'red',
};

export const statusTone = (value?: string): BadgeTone => toneMap[value || ''] || 'slate';

export const humanize = (value?: string) =>
  value
    ? value
        .replaceAll('_', ' ')
        .toLowerCase()
        .replace(/(^|\s)\S/g, (character) => character.toUpperCase())
    : '—';

/** Forward order lifecycle plus the terminal states. */
export const ORDER_STATUSES: OrderStatus[] = [
  'PENDING',
  'UNDER_REVIEW',
  'CONFIRMED',
  'PROCESSING',
  'PACKED',
  'DISPATCHED',
  'DELIVERED',
  'CANCELLED',
];

export const INVOICE_STATUSES: InvoiceStatus[] = ['ISSUED', 'PARTIALLY_PAID', 'PAID', 'VOID'];

/** `RESCHEDULED` is rendered when present but is not offered as a target state. */
export const FOLLOW_UP_STATUSES: FollowUpStatus[] = ['PENDING', 'COMPLETED', 'RESCHEDULED', 'CANCELLED'];
export const FOLLOW_UP_TARGET_STATUSES: FollowUpStatus[] = ['PENDING', 'COMPLETED', 'CANCELLED'];
export const FOLLOW_UP_TYPES: FollowUpType[] = ['CALL', 'VISIT', 'WHATSAPP', 'EMAIL', 'OTHER'];

export const REQUIREMENT_STATUSES: RequirementStatus[] = [
  'SUBMITTED',
  'IN_REVIEW',
  'ACCEPTED',
  'REJECTED',
  'CONVERTED',
];

export const BATCH_STATUSES: BatchStatus[] = ['ACTIVE', 'EXPIRED', 'DEPLETED', 'QUARANTINED'];

export const PAYMENT_METHODS: PaymentMethod[] = ['CASH', 'BANK_TRANSFER', 'UPI', 'CARD', 'CHEQUE', 'OTHER'];

export const CUSTOMER_STATUSES = ['PENDING', 'APPROVED', 'REJECTED', 'ACTIVE', 'DISABLED'] as const;
export const SALESMAN_STATUSES = ['ACTIVE', 'INACTIVE', 'SUSPENDED'] as const;

export const roleHome: Record<Role, string> = {
  customer: '/customer/dashboard',
  salesman: '/salesman/dashboard',
  admin: '/admin/dashboard',
};

export const roleLabel: Record<Role, string> = {
  customer: 'Customer',
  salesman: 'Salesman',
  admin: 'Agency admin',
};

export const roleWorkspace: Record<Role, string> = {
  customer: '/customer',
  salesman: '/salesman',
  admin: '/admin',
};

/** Resolves the role workspace for a record id, e.g. `/admin/orders/:id`. */
export const rolePath = (role: Role | undefined, path: string, id?: ID) =>
  `${roleWorkspace[role ?? 'customer']}/${path}${id ? `/${id}` : ''}`;
