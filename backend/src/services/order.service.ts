import type { FilterQuery } from 'mongoose';
import { Types } from 'mongoose';
import { OrderModel, type IOrder, type IOrderItem, type IOrderTimelineEntry } from '../models/order.model';
import { ProductModel, type IProduct } from '../models/product.model';
import { CustomerModel } from '../models/customer.model';
import { SalesmanModel } from '../models/salesman.model';
import { AgencyModel, type IAgency } from '../models/agency.model';
import { InvoiceModel, type IInvoice } from '../models/invoice.model';
import { AppError, ErrorCode } from '../utils/errors';
import { round2, sum } from '../utils/numbers';
import { formatSequentialNumber, nextSequence } from './counter.service';
import { recordActivity } from './activity.service';
import { createNotificationSafe, resolveAdminUserIds } from './notification.service';
import { emitOrderCreated, emitOrderUpdated } from '../sockets/emitters';
import {
  commitStock,
  releaseStock,
  reserveStock,
  returnStock,
  refreshBatchStatus,
  type CommitEntry
} from './stock.service';
import { createInvoiceForOrder } from './invoice.service';
import {
  ALLOCATED_STATUSES,
  ADMIN_CANCELLABLE_STATUSES,
  COMMITTED_STATUSES,
  CUSTOMER_CANCELLABLE_STATUSES,
  ORDER_TRANSITIONS,
  type OrderStatus
} from '../constants/domain';
import type { Role } from '../constants/domain';
import type { AuthContext } from '../types/express';
import { isAdmin, isCustomer, isSalesman } from '../utils/tenant';

export interface CreateOrderInput {
  customerId?: string;
  items: Array<{ productId: string; quantity: number }>;
  notes?: string;
  customerNotes?: string;
  source?: 'CUSTOMER_PORTAL' | 'SALESMAN' | 'ADMIN' | 'REQUIREMENT' | 'REORDER';
  requirementUploadId?: string;
  reorderedFromOrderId?: string;
  idempotencyKey?: string;
}

const loadAgency = async (agencyId: Types.ObjectId): Promise<IAgency> => {
  const agency = await AgencyModel.findById(agencyId).exec();
  if (!agency) throw AppError.notFound('Agency');
  return agency;
};

export interface PricedLine {
  product: IProduct;
  quantity: number;
  unitPrice: number;
  taxRate: number;
  lineSubtotal: number;
  taxAmount: number;
  lineTotal: number;
}

/**
 * Server-authoritative pricing. Client supplied prices/taxes are ignored by
 * construction: the body schema does not even accept them.
 */
export const priceLines = async (
  agency: IAgency,
  lines: Array<{ productId: Types.ObjectId; quantity: number }>
): Promise<{ priced: PricedLine[]; subtotal: number; taxTotal: number; grandTotal: number }> => {
  const productIds = lines.map((line) => line.productId);
  const products = await ProductModel.find({
    agencyId: agency._id,
    _id: { $in: productIds },
    isActive: true
  })
    .exec();

  const productMap = new Map(products.map((product) => [product._id.toString(), product]));

  const priced: PricedLine[] = lines.map((line) => {
    const product = productMap.get(line.productId.toString());
    if (!product) {
      throw new AppError(422, ErrorCode.VALIDATION_ERROR, `Product ${line.productId.toString()} is unavailable`, [
        { path: 'items', message: 'One or more products are not available for ordering' }
      ]);
    }
    if (line.quantity < product.minOrderQuantity) {
      throw new AppError(
        422,
        ErrorCode.VALIDATION_ERROR,
        `${product.name} has a minimum order quantity of ${product.minOrderQuantity}`,
        [{ path: 'items', message: `${product.sku}: minimum order quantity is ${product.minOrderQuantity}` }]
      );
    }
    if (product.maxOrderQuantity && line.quantity > product.maxOrderQuantity) {
      throw new AppError(
        422,
        ErrorCode.VALIDATION_ERROR,
        `${product.name} allows at most ${product.maxOrderQuantity} unit(s) per order`
      );
    }

    const unitPrice = round2(product.price);
    const taxRate = agency.tax.pricesIncludeTax ? 0 : product.taxRate ?? agency.tax.defaultTaxRate;
    const lineSubtotal = round2(unitPrice * line.quantity);
    const taxAmount = round2((lineSubtotal * taxRate) / 100);
    return {
      product,
      quantity: line.quantity,
      unitPrice,
      taxRate,
      lineSubtotal,
      taxAmount,
      lineTotal: round2(lineSubtotal + taxAmount)
    };
  });

  const subtotal = round2(sum(priced.map((line) => line.lineSubtotal)));
  const taxTotal = round2(sum(priced.map((line) => line.taxAmount)));
  const grandTotal = round2(subtotal + taxTotal);

  return { priced, subtotal, taxTotal, grandTotal };
};

export const allocateOrderNumber = async (agency: IAgency): Promise<{ orderNumber: string; year: number }> => {
  const year = new Date().getUTCFullYear();
  const sequence = await nextSequence(agency._id, 'order', year);
  return { orderNumber: formatSequentialNumber(agency.orderSettings.prefix, year, sequence, agency.orderSettings.padding), year };
};

/**
 * Create an order. Pricing, tax, customer resolution and the human order number
 * are all resolved server side.
 */
export const createOrder = async (
  auth: AuthContext,
  customer: { _id: Types.ObjectId; userId: Types.ObjectId; assignedSalesmanId?: Types.ObjectId },
  input: CreateOrderInput
): Promise<IOrder> => {
  const agency = await loadAgency(auth.agencyId);

  // Merge duplicate product lines instead of rejecting them.
  const quantityByProduct = new Map<string, number>();
  for (const item of input.items) {
    const key = item.productId;
    quantityByProduct.set(key, (quantityByProduct.get(key) ?? 0) + item.quantity);
  }

  const lines = Array.from(quantityByProduct.entries()).map(([productId, quantity]) => ({
    productId: new Types.ObjectId(productId),
    quantity
  }));

  const { priced, subtotal, taxTotal, grandTotal } = await priceLines(agency, lines);

  const { orderNumber, year } = await allocateOrderNumber(agency);
  const source: CreateOrderInput['source'] =
    input.source ?? (isCustomer(auth) ? 'CUSTOMER_PORTAL' : isSalesman(auth) ? 'SALESMAN' : 'ADMIN');

  const customerDoc = await CustomerModel.findOne({ agencyId: auth.agencyId, _id: customer._id })
    .select('businessName')
    .lean<{ businessName: string }>();
  if (!customerDoc) throw AppError.notFound('Customer');

  const now = new Date();
  const items: IOrderItem[] = priced.map((line) => ({
    productId: line.product._id,
    productName: line.product.name,
    sku: line.product.sku,
    unit: line.product.unit,
    quantity: line.quantity,
    unitPrice: line.unitPrice,
    taxRate: line.taxRate,
    lineSubtotal: line.lineSubtotal,
    taxAmount: line.taxAmount,
    lineTotal: line.lineTotal,
    allocations: []
  }));

  const timeline: IOrderTimelineEntry[] = [
    { from: null, to: 'PENDING', at: now, byUserId: auth.userId, byRole: auth.role, note: 'Order created' }
  ];

  const { resolveSalesmanForCustomer, markCustomerContact } = await import('./customer.service');
  const salesman = await resolveSalesmanForCustomer(auth.agencyId, customer.assignedSalesmanId);
  const [order] = await OrderModel.create([
    {
      agencyId: auth.agencyId,
      orderNumber,
      orderYear: year,
      customerId: customer._id,
      customerUserId: customer.userId,
      customerName: customerDoc.businessName,
      ...salesman,
      items,
      status: 'PENDING',
      statusTimestamps: { PENDING: now },
      timeline,
      currency: 'INR',
      subtotal,
      taxTotal,
      grandTotal,
      source: source ?? 'ADMIN',
      requirementUploadId: input.requirementUploadId,
      reorderedFromOrderId: input.reorderedFromOrderId,
      notes: input.notes,
      customerNotes: input.customerNotes,
      allocationState: 'NONE',
      idempotencyKey: input.idempotencyKey,
      createdBy: auth.userId
    }
  ]);

  if (!order) throw AppError.internal('Order could not be created');
  await markCustomerContact(auth.agencyId, customer._id, 'ORDER', now);

  await recordActivity({
    agencyId: auth.agencyId,
    actorUserId: auth.userId,
    actorRole: auth.role,
    action: 'order.create',
    entity: 'Order',
    entityId: order._id,
    summary: `Created order ${order.orderNumber} for ${order.customerName}`,
    meta: { grandTotal, itemCount: items.length, source }
  });

  const adminRecipients = await resolveAdminUserIds(auth.agencyId);
  emitOrderCreated(order, adminRecipients);
  for (const adminId of adminRecipients) {
    createNotificationSafe({
      agencyId: auth.agencyId,
      userId: adminId,
      type: 'ORDER_CREATED',
      title: `New order ${order.orderNumber}`,
      message: `${order.customerName} placed an order worth ${order.grandTotal}`,
      data: { orderId: order._id.toString(), orderNumber: order.orderNumber, grandTotal: order.grandTotal },
      entityType: 'Order',
      entityId: order._id
    });
  }
  if (order.salesmanUserId) {
    createNotificationSafe({
      agencyId: auth.agencyId,
      userId: order.salesmanUserId,
      type: 'ORDER_CREATED',
      title: `New order ${order.orderNumber}`,
      message: `${order.customerName} placed an order worth ${order.grandTotal}`,
      data: { orderId: order._id.toString(), orderNumber: order.orderNumber, grandTotal: order.grandTotal },
      entityType: 'Order',
      entityId: order._id
    });
  }

  return order;
};

export const orderScopeFilter = async (auth: AuthContext): Promise<FilterQuery<Record<string, unknown>>> => {
  const base: FilterQuery<Record<string, unknown>> = { agencyId: auth.agencyId };
  if (isAdmin(auth)) return base;
  if (isCustomer(auth)) return { ...base, customerId: auth.customerId ?? null };
  if (!auth.salesmanId) return { ...base, _id: null };
  const salesman = await SalesmanModel.findOne({ agencyId: auth.agencyId, _id: auth.salesmanId })
    .select('customerIds')
    .lean<{ customerIds: Types.ObjectId[] }>();
  const ids = salesman?.customerIds ?? [];
  return { ...base, customerId: { $in: ids.length > 0 ? ids : [null] } };
};

export interface OrderListFilters {
  status?: OrderStatus;
  customerId?: string;
  salesmanId?: string;
  search?: string;
  from?: Date;
  to?: Date;
  sort?: Record<string, 1 | -1>;
  skip: number;
  limit: number;
  extra?: FilterQuery<Record<string, unknown>>;
}

export const listOrders = async (scope: FilterQuery<Record<string, unknown>>, filters: OrderListFilters) => {
  const filter: FilterQuery<Record<string, unknown>> = { ...scope, ...(filters.extra ?? {}) };
  if (filters.status) filter.status = filters.status;
  if (filters.customerId) filter.customerId = filters.customerId;
  if (filters.salesmanId) filter.salesmanId = filters.salesmanId;
  if (filters.from || filters.to) {
    filter.createdAt = {
      ...(filters.from ? { $gte: filters.from } : {}),
      ...(filters.to ? { $lte: filters.to } : {})
    };
  }
  if (filters.search) {
    const escaped = filters.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const expression = new RegExp(escaped, 'i');
    filter.$or = [{ orderNumber: expression }, { customerName: expression }];
  }

  const [items, total] = await Promise.all([
    OrderModel.find(filter)
      .sort(filters.sort ?? { createdAt: -1 })
      .skip(filters.skip)
      .limit(filters.limit)
      .lean(),
    OrderModel.countDocuments(filter)
  ]);

  return { items, total };
};

export const getOrder = async (scope: FilterQuery<Record<string, unknown>>, orderId: Types.ObjectId) => {
  const order = await OrderModel.findOne({ ...scope, _id: orderId }).lean();
  if (!order) throw AppError.notFound('Order');
  return order;
};

const toCommitEntries = (order: IOrder): CommitEntry[] => {
  const entries: CommitEntry[] = [];
  for (const item of order.items) {
    for (const allocation of item.allocations) {
      const remaining = allocation.quantity - allocation.releasedQuantity;
      if (remaining <= 0) continue;
      entries.push({
        productId: item.productId,
        inventoryId: allocation.inventoryId,
        batchId: allocation.batchId,
        batchNumber: allocation.batchNumber,
        quantity: remaining
      });
    }
  }
  return entries;
};

export const isAdminTransition = (from: OrderStatus, to: OrderStatus): boolean =>
  (ORDER_TRANSITIONS[from] ?? []).includes(to);

/**
 * Which roles may drive a given edge. Fulfilment stages (processing onward) and
 * delivery confirmation are agency-only; customers can never self-advance an
 * order beyond review.
 */
export const allowedActorsForTransition = (
  from: OrderStatus,
  to: OrderStatus
): Array<Role | 'SALESMAN_ASSIGNED'> => {
  switch (`${from}->${to}`) {
    case 'PENDING->UNDER_REVIEW':
      return ['AGENCY_ADMIN', 'SALESMAN_ASSIGNED'];
    case 'UNDER_REVIEW->CONFIRMED':
      return ['AGENCY_ADMIN', 'SALESMAN_ASSIGNED'];
    case 'UNDER_REVIEW->PENDING':
      return ['AGENCY_ADMIN'];
    case 'CONFIRMED->PROCESSING':
      return ['AGENCY_ADMIN'];
    case 'PROCESSING->PACKED':
      return ['AGENCY_ADMIN'];
    case 'PACKED->DISPATCHED':
      return ['AGENCY_ADMIN'];
    case 'DISPATCHED->DELIVERED':
      return ['AGENCY_ADMIN'];
    case 'PENDING->CANCELLED':
    case 'UNDER_REVIEW->CANCELLED':
    case 'CONFIRMED->CANCELLED':
    case 'PROCESSING->CANCELLED':
    case 'PACKED->CANCELLED':
    case 'DISPATCHED->CANCELLED':
      return ['AGENCY_ADMIN', 'CUSTOMER', 'SALESMAN_ASSIGNED'];
    default:
      return ['AGENCY_ADMIN'];
  }
};

export interface TransitionInput {
  orderId: Types.ObjectId;
  toStatus: OrderStatus;
  note?: string;
  actor: AuthContext;
}

/**
 * Single guarded entry point for every status change, including the inventory
 * side effects. Nothing else is allowed to mutate `order.status`.
 */
export const transitionOrder = async (input: TransitionInput): Promise<IOrder> => {
  const order = await OrderModel.findOne({ agencyId: input.actor.agencyId, _id: input.orderId }).exec();
  if (!order) throw AppError.notFound('Order');

  const from = order.status;
  const to = input.toStatus;

  if (from === to) {
    throw AppError.conflict(`Order is already ${to}`, ErrorCode.INVALID_TRANSITION);
  }
  const allowedNext = ORDER_TRANSITIONS[from] ?? [];
  if (!allowedNext.includes(to)) {
    throw new AppError(
      409,
      ErrorCode.INVALID_TRANSITION,
      `Cannot move an order from ${from} to ${to}`,
      { from, to, allowed: allowedNext }
    );
  }

  const actors = allowedActorsForTransition(from, to);
  const isAssignedSalesman = isSalesman(input.actor) && String(order.salesmanId ?? '') === String(input.actor.salesmanId ?? '');

  if (to === 'CANCELLED') {
    const cancellableByCustomer = CUSTOMER_CANCELLABLE_STATUSES.includes(from);
    const allowed = isAdmin(input.actor) || (isCustomer(input.actor) && cancellableByCustomer) || (isSalesman(input.actor) && cancellableByCustomer && isAssignedSalesman);
    if (!allowed) {
      throw AppError.forbidden(
        cancellableByCustomer
          ? 'You are not allowed to cancel this order'
          : `An order in ${from} can no longer be cancelled; contact the agency`
      );
    }
    if (isCustomer(input.actor) && from === 'CONFIRMED') {
      // Customers can withdraw a confirmed order; the reservation is released.
      const agency = await loadAgency(input.actor.agencyId);
      if (!agency.orderSettings.allowCustomerCancellation) {
        throw AppError.forbidden('Customer cancellation is disabled for this agency at this stage');
      }
    }
  } else if (!(actors.includes(input.actor.role) || (actors.includes('SALESMAN_ASSIGNED') && isAssignedSalesman))) {
    throw AppError.forbidden(`A ${from.replace('_', ' ').toLowerCase()} order cannot be moved to ${to} by your role`);
  }

  const context = {
    agencyId: input.actor.agencyId,
    actorUserId: input.actor.userId,
    actorRole: input.actor.role,
    referenceType: 'ORDER' as const,
    referenceId: order._id,
    referenceNumber: order.orderNumber
  };

  const now = new Date();
  const entries = toCommitEntries(order);
  const batchIds = new Set<Types.ObjectId>();
  for (const entry of entries) batchIds.add(entry.batchId);

  let stockDisposition: 'NOT_ALLOCATED' | 'RELEASED' | 'RESTORED' = 'NOT_ALLOCATED';

  if (to === 'CONFIRMED') {
    // Atomic all-or-nothing allocation across every batch of every line.
    const allocations = await reserveStock(
      input.actor.agencyId,
      order.items.map((item) => ({ productId: item.productId, quantity: item.quantity })),
      { ...context, reason: 'Order confirmed: FEFO allocation' }
    );
    for (const item of order.items) {
      item.allocations = allocations
        .filter((allocation) => String(allocation.productId) === String(item.productId))
        .map((allocation) => ({
          batchId: allocation.batchId,
          inventoryId: allocation.inventoryId,
          batchNumber: allocation.batchNumber,
          expiryDate: allocation.expiryDate,
          quantity: allocation.quantity,
          committedQuantity: 0,
          releasedQuantity: 0
        }));
    }
    order.allocationState = 'RESERVED';
    order.allocatedAt = now;
  }

  if (to === 'PROCESSING') {
    if (order.allocationState !== 'RESERVED') {
      throw AppError.conflict('Order has no stock reservation to commit', ErrorCode.INVENTORY_COMMIT_FAILED);
    }
    await commitStock(input.actor.agencyId, entries, { ...context, reason: 'Order processing: stock deducted' });
    for (const item of order.items) {
      for (const allocation of item.allocations) {
        allocation.committedQuantity = allocation.quantity;
      }
    }
    order.allocationState = 'COMMITTED';
    order.committedAt = now;
  }

  if (to === 'CANCELLED') {
    if (order.allocationState === 'RESERVED') {
      await releaseStock(input.actor.agencyId, entries, { ...context, reason: 'Order cancelled before processing' });
      for (const item of order.items) {
        for (const allocation of item.allocations) {
          allocation.releasedQuantity = allocation.quantity - allocation.committedQuantity;
        }
      }
      order.allocationState = 'RELEASED';
      stockDisposition = 'RELEASED';
    } else if (order.allocationState === 'COMMITTED') {
      await returnStock(input.actor.agencyId, entries, {
        ...context,
        reason: 'Order cancelled after dispatch preparation: stock restored'
      });
      order.allocationState = 'RELEASED';
      stockDisposition = 'RESTORED';
    }

    if (order.invoiceId) {
      await InvoiceModel.updateOne(
        { agencyId: input.actor.agencyId, _id: order.invoiceId, status: { $ne: 'VOID' } },
        { $set: { status: 'VOID', voidedAt: now, voidedBy: input.actor.userId, voidReason: 'Order cancelled' } }
      ).exec();
    }
    order.cancellation = {
      reason: input.note?.trim() || 'Cancelled',
      at: now,
      byUserId: input.actor.userId,
      stockDisposition
    };
  }

  order.status = to;
  order.statusTimestamps.set(to, now);
  order.timeline.push({
    from,
    to,
    at: now,
    byUserId: input.actor.userId,
    byRole: input.actor.role,
    note: input.note
  });
  order.updatedBy = input.actor.userId;

  if (to === 'DELIVERED') {
    order.deliveredAt = now;
  }

  await order.save();
  if (batchIds.size > 0) await refreshBatchStatus(input.actor.agencyId, Array.from(batchIds));

  let invoice: IInvoice | null = null;
  if (to === 'DELIVERED') {
    // Delivered generates the invoice; the unique (agencyId, orderId) index makes
    // a duplicate delivery attempt impossible.
    invoice = await createInvoiceForOrder(input.actor.agencyId, order);
    order.invoiceId = invoice._id;
    await order.save();
  }

  await recordActivity({
    agencyId: input.actor.agencyId,
    actorUserId: input.actor.userId,
    actorRole: input.actor.role,
    action: `order.status.${to.toLowerCase()}`,
    entity: 'Order',
    entityId: order._id,
    summary: `Order ${order.orderNumber} moved ${from} -> ${to}`,
    meta: { from, to, note: input.note, stockDisposition, invoiceId: invoice?._id?.toString() }
  });

  const adminRecipients = await resolveAdminUserIds(input.actor.agencyId);
  emitOrderUpdated(order, from, adminRecipients);

  const recipients = new Set<Types.ObjectId>([...adminRecipients, order.customerUserId]);
  if (order.salesmanUserId) recipients.add(order.salesmanUserId);
  for (const userId of recipients) {
    if (String(userId) === String(input.actor.userId)) continue;
    createNotificationSafe({
      agencyId: input.actor.agencyId,
      userId,
      type: 'ORDER_STATUS',
      title: `Order ${order.orderNumber} is now ${to.replace('_', ' ').toLowerCase()}`,
      message:
        to === 'DELIVERED'
          ? `Order ${order.orderNumber} was delivered. Invoice ${invoice?.invoiceNumber ?? ''} was generated.`.trim()
          : `Order ${order.orderNumber} moved from ${from} to ${to}.`,
      data: { orderId: order._id.toString(), orderNumber: order.orderNumber, status: to, previousStatus: from },
      entityType: 'Order',
      entityId: order._id
    });
  }

  return order;
};

export const assertCustomerCancellable = (status: OrderStatus): void => {
  if (!CUSTOMER_CANCELLABLE_STATUSES.includes(status)) {
    throw AppError.forbidden(
      `An order in ${status} can no longer be cancelled; please contact the agency`
    );
  }
};

export const assertAdminCancellable = (status: OrderStatus): void => {
  if (!ADMIN_CANCELLABLE_STATUSES.includes(status)) {
    throw AppError.conflict(`An order in ${status} can no longer be cancelled`, ErrorCode.INVALID_TRANSITION);
  }
};

export const cancellableStatusesFor = (auth: AuthContext): OrderStatus[] =>
  isAdmin(auth) ? ADMIN_CANCELLABLE_STATUSES : CUSTOMER_CANCELLABLE_STATUSES;

export const isAllocatedStatus = (status: OrderStatus): boolean => ALLOCATED_STATUSES.includes(status);
export const isCommittedStatus = (status: OrderStatus): boolean => COMMITTED_STATUSES.includes(status);

/** Reorder: rebuild an order from a previous order's lines, re-priced today. */
export const buildReorderItems = (order: IOrder): Array<{ productId: string; quantity: number }> =>
  order.items.map((item) => ({ productId: item.productId.toString(), quantity: item.quantity }));

export type { IOrder };
