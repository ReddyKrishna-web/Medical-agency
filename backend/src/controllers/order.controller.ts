import type { Request, Response } from 'express';
import type { Types } from 'mongoose';
import { asyncHandler } from '../middleware/async-handler';
import { sendCreated, sendData, sendPaginated } from '../utils/response';
import { requireAuth, resolveCustomerForWrite, toObjectIdSafe } from '../utils/tenant';
import { parseSort } from '../utils/pagination';
import { AppError } from '../utils/errors';
import * as orderService from '../services/order.service';
import * as invoiceService from '../services/invoice.service';
import * as paymentService from '../services/payment.service';
import { OrderModel } from '../models/order.model';
import { requireRole } from '../middleware/rbac';
import { ORDER_TRANSITIONS } from '../constants/domain';
import type { OrderStatus } from '../constants/domain';

const ORDER_SORT_FIELDS = ['createdAt', 'updatedAt', 'orderNumber', 'status', 'grandTotal', 'deliveredAt'] as const;
const INVOICE_SORT_FIELDS = ['issuedAt', 'invoiceNumber', 'grandTotal', 'amountDue', 'status'] as const;
const PAYMENT_SORT_FIELDS = ['paidAt', 'amount', 'reference'] as const;

export const listOrders = asyncHandler(async (req: Request, res: Response) => {
  const auth = requireAuth(req.auth);
  const query = req.query as unknown as {
    page: number;
    limit: number;
    search?: string;
    sort?: string;
    status?: OrderStatus;
    customerId?: string;
    salesmanId?: string;
    from?: string;
    to?: string;
  };

  const scope = await orderService.orderScopeFilter(auth);
  const { items, total } = await orderService.listOrders(scope, {
    search: query.search,
    status: query.status,
    customerId: query.customerId,
    salesmanId: query.salesmanId,
    from: query.from ? new Date(query.from) : undefined,
    to: query.to ? new Date(query.to) : undefined,
    sort: parseSort(query.sort, ORDER_SORT_FIELDS, { createdAt: -1 }),
    skip: (query.page - 1) * query.limit,
    limit: query.limit
  });

  sendPaginated(res, items, total, query.page, query.limit);
});

export const createOrder = asyncHandler(async (req: Request, res: Response) => {
  const auth = requireAuth(req.auth);
  const body = req.body as { customerId?: string; items: Array<{ productId: string; quantity: number }>; notes?: string; customerNotes?: string };

  const customer = await resolveCustomerForWrite(auth, body.customerId);
  const order = await orderService.createOrder(auth, customer, {
    ...body,
    idempotencyKey: req.idempotency?.key
  });

  if (req.idempotency) {
    await req.idempotency.complete(201, { success: true, data: order }, order._id);
  }
  sendCreated(res, order);
});

export const getOrder = asyncHandler(async (req: Request, res: Response) => {
  const auth = requireAuth(req.auth);
  const scope = await orderService.orderScopeFilter(auth);
  const order = await orderService.getOrder(scope, toObjectIdSafe(req.params.id, 'id'));

  const allowedNext = auth.role === 'AGENCY_ADMIN' ? (ORDER_TRANSITIONS[order.status] ?? []) : [];
  sendData(res, {
    ...order,
    permissions: {
      canCancel: orderService.cancellableStatusesFor(auth).includes(order.status),
      allowedTransitions: allowedNext,
      allowedStatuses: orderService.cancellableStatusesFor(auth)
    }
  });
});

export const reorder = asyncHandler(async (req: Request, res: Response) => {
  const auth = requireAuth(req.auth);
  const scope = await orderService.orderScopeFilter(auth);
  const source = await orderService.getOrder(scope, toObjectIdSafe(req.body.orderId, 'orderId'));

  const customer =
    auth.role === 'CUSTOMER'
      ? { _id: source.customerId, userId: source.customerUserId, assignedSalesmanId: source.salesmanId }
      : await resolveCustomerForWrite(auth, req.body.customerId ?? source.customerId.toString());

  const order = await orderService.createOrder(auth, customer, {
    items: orderService.buildReorderItems(source as never),
    notes: req.body.notes,
    source: 'REORDER',
    reorderedFromOrderId: source._id.toString(),
    idempotencyKey: req.idempotency?.key
  });

  if (req.idempotency) {
    await req.idempotency.complete(201, { success: true, data: order }, order._id);
  }
  sendCreated(res, order);
});

export const changeStatus = asyncHandler(async (req: Request, res: Response) => {
  const auth = requireAuth(req.auth);
  const previous = await OrderModel.findOne({ agencyId: auth.agencyId, _id: toObjectIdSafe(req.params.id, 'id') })
    .select('status orderNumber')
    .lean<{ _id: Types.ObjectId; status: OrderStatus; orderNumber: string }>();
  if (!previous) throw AppError.notFound('Order');

  const order = await orderService.transitionOrder({
    orderId: previous._id,
    toStatus: req.body.status,
    note: req.body.note,
    actor: auth
  });

  sendData(res, { order, previousStatus: previous.status, status: order.status });
});

export const cancelOrder = asyncHandler(async (req: Request, res: Response) => {
  const auth = requireAuth(req.auth);
  const orderId = toObjectIdSafe(req.params.id, 'id');
  const existing = await OrderModel.findOne({ agencyId: auth.agencyId, _id: orderId })
    .select('status orderNumber')
    .lean<{ _id: Types.ObjectId; status: OrderStatus; orderNumber: string }>();
  if (!existing) throw AppError.notFound('Order');

  if (auth.role === 'CUSTOMER') orderService.assertCustomerCancellable(existing.status);
  else orderService.assertAdminCancellable(existing.status);

  const order = await orderService.transitionOrder({
    orderId,
    toStatus: 'CANCELLED',
    note: req.body.reason,
    actor: auth
  });

  sendData(res, {
    order,
    previousStatus: existing.status,
    status: order.status,
    stockDisposition: order.cancellation?.stockDisposition ?? 'NOT_ALLOCATED'
  });
});

export const orderTimeline = asyncHandler(async (req: Request, res: Response) => {
  const auth = requireAuth(req.auth);
  const scope = await orderService.orderScopeFilter(auth);
  const order = await orderService.getOrder(scope, toObjectIdSafe(req.params.id, 'id'));
  sendData(res, {
    orderId: order._id,
    orderNumber: order.orderNumber,
    status: order.status,
    statusTimestamps: order.statusTimestamps,
    timeline: order.timeline
  });
});

/* ------------------------------- invoices -------------------------------- */

export const listInvoices = asyncHandler(async (req: Request, res: Response) => {
  const auth = requireAuth(req.auth);
  const query = req.query as unknown as {
    page: number;
    limit: number;
    search?: string;
    sort?: string;
    status?: string;
    customerId?: string;
    orderId?: string;
    from?: string;
    to?: string;
  };

  const scope = await invoiceService.invoiceScopeForScope(auth);
  const { items, total } = await invoiceService.listInvoices(scope, {
    search: query.search,
    status: query.status,
    customerId: query.customerId,
    orderId: query.orderId,
    from: query.from ? new Date(query.from) : undefined,
    to: query.to ? new Date(query.to) : undefined,
    sort: parseSort(query.sort, INVOICE_SORT_FIELDS, { issuedAt: -1 }),
    skip: (query.page - 1) * query.limit,
    limit: query.limit
  });

  sendPaginated(res, items, total, query.page, query.limit);
});

export const getInvoice = asyncHandler(async (req: Request, res: Response) => {
  const auth = requireAuth(req.auth);
  const scope = await invoiceService.invoiceScopeForScope(auth);
  const invoice = await invoiceService.getInvoice(scope, toObjectIdSafe(req.params.id, 'id'));
  sendData(res, invoice);
});

export const voidInvoice = asyncHandler(async (req: Request, res: Response) => {
  const auth = requireAuth(req.auth);
  const invoice = await invoiceService.voidInvoice(
    auth.agencyId,
    toObjectIdSafe(req.params.id, 'id'),
    auth.userId,
    req.body.reason
  );
  sendData(res, invoice);
});

/* -------------------------------- payments ------------------------------- */

export const listPayments = asyncHandler(async (req: Request, res: Response) => {
  const auth = requireAuth(req.auth);
  const query = req.query as unknown as {
    page: number;
    limit: number;
    search?: string;
    sort?: string;
    customerId?: string;
    invoiceId?: string;
    method?: string;
    from?: string;
    to?: string;
  };

  const scope = await paymentService.paymentScopeForScope(auth);
  const { items, total } = await paymentService.listPayments(scope, {
    search: query.search,
    customerId: query.customerId,
    invoiceId: query.invoiceId,
    method: query.method,
    from: query.from ? new Date(query.from) : undefined,
    to: query.to ? new Date(query.to) : undefined,
    sort: parseSort(query.sort, PAYMENT_SORT_FIELDS, { paidAt: -1 }),
    skip: (query.page - 1) * query.limit,
    limit: query.limit
  });

  sendPaginated(res, items, total, query.page, query.limit);
});

export const createPayment = asyncHandler(async (req: Request, res: Response) => {
  const auth = requireAuth(req.auth);
  const body = req.body as {
    invoiceId?: string;
    customerId: string;
    amount: number;
    method: paymentService.RecordPaymentInput['method'];
    reference?: string;
    paidAt?: Date;
    note?: string;
  };

  const payment = await paymentService.recordPayment({
    ...body,
    invoiceId: body.invoiceId,
    agencyId: auth.agencyId,
    actorUserId: auth.userId,
    idempotencyKey: req.idempotency?.key
  });

  if (req.idempotency) {
    await req.idempotency.complete(201, { success: true, data: payment }, payment._id);
  }
  sendCreated(res, payment);
});

export const adminOnly = requireRole('AGENCY_ADMIN');
