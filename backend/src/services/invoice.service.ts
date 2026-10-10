import type { FilterQuery, Types } from 'mongoose';
import { InvoiceModel, type IInvoice } from '../models/invoice.model';
import { PaymentModel } from '../models/payment.model';
import { SalesmanModel } from '../models/salesman.model';
import type { IOrder } from '../models/order.model';
import { AgencyModel } from '../models/agency.model';
import { AppError, ErrorCode } from '../utils/errors';
import { round2, sum } from '../utils/numbers';
import { formatSequentialNumber, nextSequence } from './counter.service';
import { recordActivity } from './activity.service';
import { createNotificationSafe, resolveAdminUserIds } from './notification.service';

/**
 * Generate the invoice for a delivered order. The immutable agency snapshot means
 * a printed invoice never changes when agency settings are later edited, and the
 * unique (agencyId, orderId) index makes generation idempotent.
 */
export const createInvoiceForOrder = async (agencyId: Types.ObjectId, order: IOrder): Promise<IInvoice> => {
  const existing = await InvoiceModel.findOne({ agencyId, orderId: order._id }).exec();
  if (existing) return existing;

  const agency = await AgencyModel.findById(agencyId).exec();
  if (!agency) throw AppError.notFound('Agency');

  const year = new Date().getUTCFullYear();
  const sequence = await nextSequence(agencyId, 'invoice', year);
  const invoiceNumber = formatSequentialNumber(
    agency.tax.invoicePrefix,
    year,
    sequence,
    agency.orderSettings.padding
  );

  const dueAt = new Date(Date.now() + agency.orderSettings.invoiceDueDays * 24 * 60 * 60 * 1000);

  const [invoice] = await InvoiceModel.create([
    {
      agencyId,
      invoiceNumber,
      invoiceYear: year,
      orderId: order._id,
      orderNumber: order.orderNumber,
      customerId: order.customerId,
      customerUserId: order.customerUserId,
      customerName: order.customerName,
      agencySnapshot: {
        name: agency.name,
        legalName: agency.legalName,
        gstNumber: agency.tax.gstNumber,
        email: agency.contact.email,
        phone: agency.contact.phone,
        address: agency.contact.address
      },
      lines: order.items.map((item) => ({
        productId: item.productId,
        productName: item.productName,
        sku: item.sku,
        unit: item.unit,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        taxRate: item.taxRate,
        taxAmount: item.taxAmount,
        lineTotal: item.lineTotal
      })),
      currency: order.currency,
      subtotal: order.subtotal,
      taxTotal: order.taxTotal,
      grandTotal: order.grandTotal,
      amountPaid: 0,
      amountDue: round2(order.grandTotal),
      status: 'ISSUED',
      issuedAt: new Date(),
      dueAt,
      paymentTermsDays: agency.orderSettings.invoiceDueDays
    }
  ]);

  if (!invoice) throw AppError.internal('Invoice could not be generated');

  createNotificationSafe({
    agencyId,
    userId: order.customerUserId,
    type: 'ORDER_STATUS',
    title: `Invoice ${invoice.invoiceNumber} is ready`,
    message: `Invoice ${invoice.invoiceNumber} for order ${order.orderNumber} totals ${invoice.grandTotal}.`,
    data: { invoiceId: invoice._id.toString(), invoiceNumber: invoice.invoiceNumber, grandTotal: invoice.grandTotal },
    entityType: 'Invoice',
    entityId: invoice._id
  });

  for (const adminId of await resolveAdminUserIds(agencyId)) {
    createNotificationSafe({
      agencyId,
      userId: adminId,
      type: 'PAYMENT_RECORDED',
      title: `Invoice ${invoice.invoiceNumber} generated`,
      message: `${order.customerName} · ${order.orderNumber} · ${invoice.grandTotal}`,
      data: { invoiceId: invoice._id.toString(), invoiceNumber: invoice.invoiceNumber },
      entityType: 'Invoice',
      entityId: invoice._id
    });
  }

  await recordActivity({
    agencyId,
    actorUserId: order.updatedBy,
    action: 'invoice.generate',
    entity: 'Invoice',
    entityId: invoice._id,
    summary: `Generated invoice ${invoice.invoiceNumber} for order ${order.orderNumber}`,
    meta: { orderId: order._id.toString(), grandTotal: invoice.grandTotal }
  });

  return invoice;
};

export const invoiceScopeFilter = (auth: {
  agencyId: Types.ObjectId;
  role: string;
  customerId?: Types.ObjectId;
}): FilterQuery<Record<string, unknown>> => {
  const base: FilterQuery<Record<string, unknown>> = { agencyId: auth.agencyId };
  if (auth.role === 'AGENCY_ADMIN') return base;
  if (auth.role === 'CUSTOMER') return { ...base, customerId: auth.customerId ?? null };
  // Salesmen see invoices of their assigned customers.
  return { ...base, customerId: { $in: [] as Types.ObjectId[] } };
};

/** Async variant that resolves the salesman's assigned customers. */
export const invoiceScopeForScope = async (auth: {
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

export interface InvoiceListFilters {
  status?: string;
  customerId?: string;
  orderId?: string;
  from?: Date;
  to?: Date;
  search?: string;
  skip: number;
  limit: number;
  sort?: Record<string, 1 | -1>;
}

export const listInvoices = async (scope: FilterQuery<Record<string, unknown>>, filters: InvoiceListFilters) => {
  const filter: FilterQuery<Record<string, unknown>> = { ...scope };
  if (filters.status) filter.status = filters.status;
  if (filters.customerId) filter.customerId = filters.customerId;
  if (filters.orderId) filter.orderId = filters.orderId;
  if (filters.from || filters.to) {
    filter.issuedAt = {
      ...(filters.from ? { $gte: filters.from } : {}),
      ...(filters.to ? { $lte: filters.to } : {})
    };
  }
  if (filters.search) {
    const escaped = filters.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const expression = new RegExp(escaped, 'i');
    filter.$or = [{ invoiceNumber: expression }, { orderNumber: expression }, { customerName: expression }];
  }

  const [items, total] = await Promise.all([
    InvoiceModel.find(filter)
      .sort(filters.sort ?? { issuedAt: -1 })
      .skip(filters.skip)
      .limit(filters.limit)
      .lean(),
    InvoiceModel.countDocuments(filter)
  ]);
  return { items, total };
};

export const getInvoice = async (scope: FilterQuery<Record<string, unknown>>, invoiceId: Types.ObjectId) => {
  const invoice = await InvoiceModel.findOne({ ...scope, _id: invoiceId }).lean();
  if (!invoice) throw AppError.notFound('Invoice');
  return invoice;
};

/** Recompute paid/derived fields after a payment is recorded. */
export const applyPaymentToInvoice = async (agencyId: Types.ObjectId, invoiceId: Types.ObjectId): Promise<void> => {
  const invoice = await InvoiceModel.findOne({ agencyId, _id: invoiceId }).exec();
  if (!invoice) throw AppError.notFound('Invoice');

  const totalPaid = await PaymentModel.aggregate<{ total: number }>([
    { $match: { agencyId, invoiceId: invoice._id } },
    { $group: { _id: null, total: { $sum: '$amount' } } }
  ]).exec();

  const paid = round2(totalPaid[0]?.total ?? 0);
  invoice.amountPaid = paid;
  invoice.amountDue = round2(Math.max(0, invoice.grandTotal - paid));
  invoice.status =
    invoice.status === 'VOID' ? 'VOID' : invoice.amountDue <= 0 ? 'PAID' : paid > 0 ? 'PARTIALLY_PAID' : 'ISSUED';
  await invoice.save();
};

export const voidInvoice = async (
  agencyId: Types.ObjectId,
  invoiceId: Types.ObjectId,
  actorUserId: Types.ObjectId,
  reason: string
): Promise<IInvoice> => {
  const invoice = await InvoiceModel.findOne({ agencyId, _id: invoiceId }).exec();
  if (!invoice) throw AppError.notFound('Invoice');
  if (invoice.status === 'VOID') throw AppError.conflict('Invoice is already void');
  if (invoice.amountPaid > 0) {
    throw new AppError(
      409,
      ErrorCode.CONFLICT,
      'An invoice with recorded payments cannot be voided; resolve the payment first'
    );
  }
  invoice.status = 'VOID';
  invoice.voidedAt = new Date();
  invoice.voidedBy = actorUserId;
  invoice.voidReason = reason;
  await invoice.save();

  await recordActivity({
    agencyId,
    actorUserId,
    action: 'invoice.void',
    entity: 'Invoice',
    entityId: invoice._id,
    summary: `Voided invoice ${invoice.invoiceNumber}`,
    meta: { reason }
  });
  return invoice;
};

/** Sum helper kept for callers that need line arithmetic without importing utils. */
export const invoiceLineTotals = (subtotals: number[], taxAmounts: number[]) => ({
  subtotal: round2(sum(subtotals)),
  taxTotal: round2(sum(taxAmounts))
});
