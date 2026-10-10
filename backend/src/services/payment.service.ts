import type { FilterQuery, Types } from 'mongoose';
import { PaymentModel, type IPayment } from '../models/payment.model';
import { InvoiceModel } from '../models/invoice.model';
import { CustomerModel } from '../models/customer.model';
import { OrderModel } from '../models/order.model';
import { SalesmanModel } from '../models/salesman.model';
import { AppError, ErrorCode } from '../utils/errors';
import { round2 } from '../utils/numbers';
import { formatSequentialNumber, nextSequence } from './counter.service';
import { applyPaymentToInvoice } from './invoice.service';
import { recordActivity } from './activity.service';
import { createNotificationSafe } from './notification.service';
import type { PaymentMethod } from '../constants/domain';

export interface RecordPaymentInput {
  invoiceId?: string;
  customerId: string;
  amount: number;
  method: PaymentMethod;
  reference?: string;
  paidAt?: string | Date;
  note?: string;
  actorUserId: Types.ObjectId;
  agencyId: Types.ObjectId;
  idempotencyKey?: string;
}

/**
 * Internal payment ledger (not an online gateway). Admin only, tenant scoped, and
 * capped at the outstanding invoice balance so a ledger cannot silently overpay.
 */
export const recordPayment = async (input: RecordPaymentInput): Promise<IPayment> => {
  const amount = round2(input.amount);
  if (amount <= 0) throw AppError.badRequest('Payment amount must be greater than zero');

  const customer = await CustomerModel.findOne({ agencyId: input.agencyId, _id: input.customerId }).exec();
  if (!customer) throw AppError.notFound('Customer');

  let invoiceId: Types.ObjectId | undefined;
  let invoiceNumber: string | undefined;
  let orderId: Types.ObjectId | undefined;
  let orderNumber: string | undefined;
  let outstanding = Number.POSITIVE_INFINITY;

  if (input.invoiceId) {
    const invoice = await InvoiceModel.findOne({ agencyId: input.agencyId, _id: input.invoiceId }).exec();
    if (!invoice) throw AppError.notFound('Invoice');
    if (String(invoice.customerId) !== String(customer._id)) {
      throw AppError.badRequest('The invoice does not belong to the selected customer');
    }
    if (invoice.status === 'VOID') throw AppError.conflict('Payments cannot be recorded against a void invoice');
    invoiceId = invoice._id;
    invoiceNumber = invoice.invoiceNumber;
    orderId = invoice.orderId;
    outstanding = round2(invoice.grandTotal - invoice.amountPaid);
    if (amount > outstanding) {
      throw new AppError(
        422,
        ErrorCode.VALIDATION_ERROR,
        `Payment exceeds the outstanding balance of ${outstanding}`,
        { outstanding }
      );
    }
    const order = await OrderModel.findOne({ agencyId: input.agencyId, _id: invoice.orderId })
      .select('orderNumber')
      .lean<{ orderNumber: string }>();
    orderNumber = order?.orderNumber;
  }

  const year = new Date().getUTCFullYear();
  let reference = input.reference?.trim().toUpperCase();
  if (!reference) {
    const sequence = await nextSequence(input.agencyId, 'payment', year);
    reference = formatSequentialNumber('PAY', year, sequence, 6);
  }
  const duplicate = await PaymentModel.exists({ agencyId: input.agencyId, reference });
  if (duplicate) {
    throw AppError.conflict('A payment with this reference already exists', ErrorCode.DUPLICATE_RESOURCE);
  }

  const [payment] = await PaymentModel.create([
    {
      agencyId: input.agencyId,
      reference,
      invoiceId,
      invoiceNumber,
      orderId,
      orderNumber,
      customerId: customer._id,
      customerUserId: customer.userId,
      amount,
      method: input.method,
      paidAt: input.paidAt ? new Date(input.paidAt) : new Date(),
      note: input.note,
      recordedBy: input.actorUserId,
      idempotencyKey: input.idempotencyKey
    }
  ]);

  if (!payment) throw AppError.internal('Payment could not be recorded');

  if (invoiceId) await applyPaymentToInvoice(input.agencyId, invoiceId);

  createNotificationSafe({
    agencyId: input.agencyId,
    userId: customer.userId,
    type: 'PAYMENT_RECORDED',
    title: `Payment ${payment.reference} recorded`,
    message: `We recorded ${payment.amount} against ${invoiceNumber ?? 'your account'}.`,
    data: { paymentId: payment._id.toString(), amount: payment.amount, invoiceId: invoiceId?.toString() },
    entityType: 'Payment',
    entityId: payment._id
  });

  await recordActivity({
    agencyId: input.agencyId,
    actorUserId: input.actorUserId,
    actorRole: 'AGENCY_ADMIN',
    action: 'payment.record',
    entity: 'Payment',
    entityId: payment._id,
    summary: `Recorded payment ${payment.reference} of ${payment.amount}`,
    meta: { invoiceId: invoiceId?.toString(), customerId: customer._id.toString(), method: payment.method }
  });

  return payment;
};

export const paymentScopeFilter = (auth: {
  agencyId: Types.ObjectId;
  role: string;
  customerId?: Types.ObjectId;
}): FilterQuery<Record<string, unknown>> => {
  const base: FilterQuery<Record<string, unknown>> = { agencyId: auth.agencyId };
  if (auth.role === 'AGENCY_ADMIN') return base;
  if (auth.role === 'CUSTOMER') return { ...base, customerId: auth.customerId ?? null };
  return { ...base, customerId: { $in: [] as Types.ObjectId[] } };
};

/** Async variant that resolves the salesman's assigned customers. */
export const paymentScopeForScope = async (auth: {
  agencyId: Types.ObjectId;
  role: string;
  customerId?: Types.ObjectId;
  salesmanId?: Types.ObjectId;
}): Promise<FilterQuery<Record<string, unknown>>> => {
  const base: FilterQuery<Record<string, unknown>> = { agencyId: auth.agencyId };
  if (auth.role === 'AGENCY_ADMIN') return base;
  if (auth.role === 'CUSTOMER') return { ...base, customerId: auth.customerId ?? null };
  if (auth.salesmanId) {
    const salesman = await SalesmanModel.findOne({ agencyId: auth.agencyId, _id: auth.salesmanId })
      .select('customerIds')
      .lean<{ customerIds: Types.ObjectId[] }>();
    const ids = salesman?.customerIds ?? [];
    return { ...base, customerId: { $in: ids.length > 0 ? ids : [null] } };
  }
  return { ...base, customerId: null };
};

export interface PaymentListFilters {
  customerId?: string;
  invoiceId?: string;
  method?: string;
  from?: Date;
  to?: Date;
  search?: string;
  skip: number;
  limit: number;
  sort?: Record<string, 1 | -1>;
}

export const listPayments = async (scope: FilterQuery<Record<string, unknown>>, filters: PaymentListFilters) => {
  const filter: FilterQuery<Record<string, unknown>> = { ...scope };
  if (filters.customerId) filter.customerId = filters.customerId;
  if (filters.invoiceId) filter.invoiceId = filters.invoiceId;
  if (filters.method) filter.method = filters.method;
  if (filters.from || filters.to) {
    filter.paidAt = {
      ...(filters.from ? { $gte: filters.from } : {}),
      ...(filters.to ? { $lte: filters.to } : {})
    };
  }
  if (filters.search) {
    const escaped = filters.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const expression = new RegExp(escaped, 'i');
    filter.$or = [{ reference: expression }, { invoiceNumber: expression }, { orderNumber: expression }];
  }

  const [items, total] = await Promise.all([
    PaymentModel.find(filter)
      .populate('customerId', 'businessName')
      .sort(filters.sort ?? { paidAt: -1 })
      .skip(filters.skip)
      .limit(filters.limit)
      .lean(),
    PaymentModel.countDocuments(filter)
  ]);
  return { items, total };
};
