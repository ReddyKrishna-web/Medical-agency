import { z } from 'zod';
import { ORDER_STATUSES } from '../constants/domain';
import { objectId, optionalDateField, quantityField, trimmed } from './common.schema';

const orderItemSchema = z.object({
  productId: objectId,
  quantity: quantityField
});

/**
 * The create body intentionally has no price/tax/total fields: the server owns
 * all commercial values. Unknown keys are stripped.
 */
export const createOrderSchema = z.object({
  customerId: objectId.optional(),
  items: z.array(orderItemSchema).min(1, 'An order needs at least one item').max(200),
  notes: trimmed(1, 2000).optional(),
  customerNotes: trimmed(1, 2000).optional()
});

export const reorderSchema = z.object({
  orderId: objectId,
  customerId: objectId.optional(),
  notes: trimmed(1, 2000).optional()
});

export const orderListSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(120).optional(),
  sort: z.string().trim().max(120).optional(),
  status: z.enum(ORDER_STATUSES).optional(),
  customerId: objectId.optional(),
  salesmanId: objectId.optional(),
  from: z.string().optional(),
  to: z.string().optional()
});

export const orderStatusSchema = z.object({
  status: z.enum(ORDER_STATUSES),
  note: trimmed(1, 500).optional()
});

export const cancelOrderSchema = z.object({
  reason: trimmed(3, 500)
});

export const invoiceListSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(120).optional(),
  sort: z.string().trim().max(120).optional(),
  status: z.enum(['ISSUED', 'PARTIALLY_PAID', 'PAID', 'VOID']).optional(),
  customerId: objectId.optional(),
  orderId: objectId.optional(),
  from: z.string().optional(),
  to: z.string().optional()
});

export const voidInvoiceSchema = z.object({
  reason: trimmed(3, 500)
});

export const paymentListSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(120).optional(),
  sort: z.string().trim().max(120).optional(),
  customerId: objectId.optional(),
  invoiceId: objectId.optional(),
  method: z
    .enum(['CASH', 'BANK_TRANSFER', 'UPI', 'CARD', 'CHEQUE', 'OTHER'])
    .optional(),
  from: z.string().optional(),
  to: z.string().optional()
});

export const createPaymentSchema = z.object({
  invoiceId: objectId.optional(),
  customerId: objectId,
  amount: z.coerce.number().positive('Amount must be greater than zero').max(10_000_000),
  method: z.enum(['CASH', 'BANK_TRANSFER', 'UPI', 'CARD', 'CHEQUE', 'OTHER']),
  reference: trimmed(2, 64).optional(),
  paidAt: optionalDateField,
  note: trimmed(1, 500).optional()
});
