import { z } from 'zod';
import {
  CONTACT_SUBMISSION_STATUSES,
  CONTACT_TOPICS,
  FOLLOW_UP_STATUSES,
  FOLLOW_UP_TYPES,
  NOTIFICATION_PREFERENCE_KEYS,
  REQUIREMENT_STATUSES,
  WEEK_DAYS
} from '../constants/domain';
import { emailField, objectId, phoneField, quantityField, trimmed } from './common.schema';

export const uploadRequirementSchema = z.object({
  customerId: objectId.optional(),
  title: trimmed(2, 160),
  notes: trimmed(1, 2000).optional()
});

export const requirementListSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(120).optional(),
  sort: z.string().trim().max(120).optional(),
  status: z.enum(REQUIREMENT_STATUSES).optional(),
  customerId: objectId.optional()
});

export const requirementStatusSchema = z.object({
  status: z.enum(REQUIREMENT_STATUSES),
  note: trimmed(1, 1000).optional()
});

export const convertRequirementSchema = z.object({
  customerId: objectId.optional(),
  items: z
    .array(z.object({ productId: objectId, quantity: quantityField }))
    .min(1, 'Provide the items to convert')
    .max(200),
  notes: trimmed(1, 2000).optional()
});

export const sendMessageSchema = z.object({
  receiverId: objectId,
  body: trimmed(1, 4000),
  orderId: objectId.optional(),
  orderReference: trimmed(1, 64).optional()
});

export const messageListSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(30),
  sort: z.string().trim().max(120).optional(),
  conversationWith: objectId.optional(),
  unreadOnly: z
    .union([z.boolean(), z.string()])
    .transform((value) => (typeof value === 'boolean' ? value : value === 'true' || value === '1'))
    .optional()
});

export const markReadSchema = z
  .object({
    messageIds: z.array(objectId).max(200).optional(),
    conversationWith: objectId.optional()
  })
  .refine((value) => Boolean(value.messageIds?.length) || Boolean(value.conversationWith), {
    message: 'Provide messageIds or conversationWith'
  });

export const followUpListSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(120).optional(),
  sort: z.string().trim().max(120).optional(),
  status: z.enum(FOLLOW_UP_STATUSES).optional(),
  type: z.enum(FOLLOW_UP_TYPES).optional(),
  customerId: objectId.optional(),
  salesmanId: objectId.optional(),
  dueFrom: z.string().optional(),
  dueTo: z.string().optional()
});

export const createFollowUpSchema = z.object({
  customerId: objectId,
  title: trimmed(2, 160),
  notes: trimmed(1, 2000).optional(),
  type: z.enum(FOLLOW_UP_TYPES).default('CALL'),
  dueAt: z.string().min(4, 'dueAt is required'),
  relatedOrderId: objectId.optional()
});

export const updateFollowUpSchema = z
  .object({
    title: trimmed(2, 160).optional(),
    notes: trimmed(1, 2000).optional(),
    type: z.enum(FOLLOW_UP_TYPES).optional(),
    dueAt: z.string().optional(),
    outcome: trimmed(1, 1000).optional(),
    nextFollowUpAt: z.string().optional()
  })
  .refine((value) => Object.keys(value).length > 0, { message: 'Provide at least one field to update' });

export const followUpStatusSchema = z.object({
  status: z.enum(FOLLOW_UP_STATUSES),
  note: trimmed(1, 1000).optional()
});

export const notificationListSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  unreadOnly: z
    .union([z.boolean(), z.string()])
    .transform((value) => (typeof value === 'boolean' ? value : value === 'true' || value === '1'))
    .optional(),
  type: z.string().trim().max(40).optional()
});

export const markNotificationsReadSchema = z
  .object({
    notificationIds: z.array(objectId).max(200).optional(),
    all: z.boolean().optional()
  })
  .refine((value) => Boolean(value.notificationIds?.length) || value.all === true, {
    message: 'Provide notificationIds or set all=true'
  });

export const searchSchema = z.object({
  q: z.string().trim().min(2, 'Search term must be at least 2 characters').max(120),
  limit: z.coerce.number().int().min(1).max(50).default(10)
});

export const reportQuerySchema = z.object({
  from: z.string().optional(),
  to: z.string().optional()
});

export const exportQuerySchema = z.object({
  type: z.enum(['orders', 'customers', 'products', 'salesmen', 'inventory', 'invoices', 'payments']),
  format: z.literal('csv').default('csv'),
  from: z.string().optional(),
  to: z.string().optional()
});

export const askAiSchema = z.object({
  question: trimmed(8, 1000),
  from: z.string().optional(),
  to: z.string().optional()
});

export const activityQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  search: z.string().trim().max(120).optional(),
  sort: z.string().trim().max(120).optional(),
  entity: z.string().trim().max(40).optional(),
  entityId: objectId.optional(),
  actorUserId: objectId.optional(),
  from: z.string().optional(),
  to: z.string().optional()
});

/**
 * Public business contact form. Only the fields a visitor deliberately supplies
 * are accepted; there is no `role`, `status` or `agencyId`, so a caller can
 * never influence account creation or tenant attribution.
 */
export const contactSubmissionSchema = z.object({
  name: trimmed(2, 120),
  email: emailField,
  phone: phoneField.optional(),
  organisation: trimmed(2, 160).optional(),
  topic: z.enum(CONTACT_TOPICS).default('NEW_ORDER_ENQUIRY'),
  message: trimmed(10, 4000)
});

export const contactSubmissionListSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(120).optional(),
  sort: z.string().trim().max(120).optional(),
  status: z.enum(CONTACT_SUBMISSION_STATUSES).optional(),
  topic: z.enum(CONTACT_TOPICS).optional()
});

export const updateContactSubmissionSchema = z
  .object({
    status: z.enum(CONTACT_SUBMISSION_STATUSES).optional(),
    notes: trimmed(1, 2000).optional()
  })
  .refine((value) => Object.keys(value).length > 0, { message: 'Provide at least one field to update' });

/** `HH:mm` in 24h form, used for business hours and quiet hours. */
const clockTime = z
  .string()
  .trim()
  .regex(/^([01]\d|2[0-3]):([0-5]\d)$/, 'Use 24-hour HH:mm format');

/** Free-text opening hours for one day, e.g. "09:00 - 13:00, 16:00 - 20:00". */
const businessHoursText = z
  .string()
  .trim()
  .max(120)
  .refine((value) => value === '' || /^\d{1,2}:\d{2}/.test(value), {
    message: 'Use a time range such as "09:00 - 18:00"'
  })
  .transform((value) => (value === '' ? null : value));

const businessHoursSchema = z
  .object(
    Object.fromEntries(WEEK_DAYS.map((day) => [day, businessHoursText.optional()]))
  )
  .refine((value) => Object.values(value).some((entry) => entry !== undefined), {
    message: 'Provide at least one day of business hours'
  });

const notificationPreferencesSchema = z
  .object({
    email: z
      .object(Object.fromEntries(NOTIFICATION_PREFERENCE_KEYS.map((key) => [key, z.boolean().optional()])))
      .optional(),
    quietHoursEnabled: z.boolean().optional(),
    quietHoursStart: clockTime.optional(),
    quietHoursEnd: clockTime.optional()
  })
  .refine((value) => Object.keys(value).length > 0, { message: 'Provide at least one notification preference' });

export const settingsPatchSchema = z
  .object({
    name: trimmed(2, 120).optional(),
    legalName: trimmed(1, 160).optional(),
    website: z.string().trim().url().max(200).optional(),
    description: trimmed(1, 2000).optional(),
    logoUrl: z.string().trim().url().max(500).optional(),
    contact: z
      .object({
        email: z.string().trim().toLowerCase().email().max(160).optional(),
        phone: z.string().trim().max(32).optional(),
        address: z
          .object({
            line1: trimmed(3, 160).optional(),
            line2: trimmed(1, 160).optional(),
            city: trimmed(2, 80).optional(),
            state: trimmed(2, 80).optional(),
            country: trimmed(2, 80).optional(),
            postalCode: trimmed(2, 20).optional()
          })
          .optional()
      })
      .optional(),
    tax: z
      .object({
        gstNumber: trimmed(2, 32).optional(),
        defaultTaxRate: z.coerce.number().min(0).max(100).optional(),
        pricesIncludeTax: z.boolean().optional(),
        invoicePrefix: trimmed(1, 12).optional()
      })
      .optional(),
    orderSettings: z
      .object({
        prefix: trimmed(1, 12).optional(),
        padding: z.coerce.number().int().min(1).max(12).optional(),
        lowStockThreshold: z.coerce.number().int().min(0).max(100_000).optional(),
        expiryAlertDays: z.coerce.number().int().min(1).max(365).optional(),
        allowCustomerCancellation: z.boolean().optional(),
        cancelWindowHours: z.coerce.number().int().min(0).max(720).optional(),
        followUpDueDays: z.coerce.number().int().min(1).max(365).optional(),
        invoiceDueDays: z.coerce.number().int().min(0).max(365).optional(),
        defaultPaymentTermsDays: z.coerce.number().int().min(0).max(365).optional()
      })
      .optional(),
    features: z
      .object({
        aiEnabled: z.boolean().optional(),
        uploadsEnabled: z.boolean().optional(),
        socketEnabled: z.boolean().optional()
      })
      .optional(),
    businessHours: businessHoursSchema.optional(),
    notifications: notificationPreferencesSchema.optional()
  })
  .refine((value) => Object.keys(value).length > 0, { message: 'Provide at least one field to update' });
