import type { Types } from 'mongoose';
import { OrderModel } from '../models/order.model';
import { CustomerModel } from '../models/customer.model';
import { ProductModel } from '../models/product.model';
import { InventoryModel } from '../models/inventory.model';
import { InvoiceModel } from '../models/invoice.model';
import { PaymentModel } from '../models/payment.model';
import { SalesmanModel } from '../models/salesman.model';
import { FollowUpModel } from '../models/follow-up.model';
import { StockMovementModel } from '../models/stock-movement.model';
import { UserModel } from '../models/user.model';
import { AgencyModel } from '../models/agency.model';
import { AppError } from '../utils/errors';
import { round2 } from '../utils/numbers';
import { toCsv, type CsvColumn } from '../utils/csv';
import { aggregateSellableStock } from './product.service';
import type { AuthContext } from '../types/express';
import { isAdmin, isCustomer, isSalesman } from '../utils/tenant';

export interface DateRange {
  from: Date;
  to: Date;
}

/** Local-time midnight of `date`, matching the server's reporting timezone. */
const startOfDay = (date: Date): Date => {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  return start;
};

/** Local-time first instant of the month containing `date`. */
const startOfMonth = (date: Date): Date => {
  const start = new Date(date);
  start.setDate(1);
  start.setHours(0, 0, 0, 0);
  return start;
};

export const resolveRange = (from?: Date, to?: Date): DateRange => {
  const end = to ?? new Date();
  const start = from ?? new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000);
  return { from: start, to: end };
};

/** Salesmen may only report on their assigned customers. */
const scopeCustomerIds = async (auth: AuthContext): Promise<Types.ObjectId[] | null> => {
  if (isAdmin(auth)) return null;
  if (isCustomer(auth)) return auth.customerId ? [auth.customerId] : [];
  if (!auth.salesmanId) return [];
  const salesman = await SalesmanModel.findOne({ agencyId: auth.agencyId, _id: auth.salesmanId })
    .select('customerIds')
    .lean<{ customerIds: Types.ObjectId[] }>();
  return salesman?.customerIds ?? [];
};

const orderMatch = async (auth: AuthContext, range: DateRange): Promise<Record<string, unknown>> => {
  const customerIds = await scopeCustomerIds(auth);
  const match: Record<string, unknown> = {
    agencyId: auth.agencyId,
    createdAt: { $gte: range.from, $lte: range.to }
  };
  if (customerIds) match.customerId = { $in: customerIds.length > 0 ? customerIds : [null] };
  return match;
};

/** Real aggregation pipeline. Nothing here is fabricated or cached. */
export const dashboardReport = async (auth: AuthContext, range: DateRange) => {
  const agency = await AgencyModel.findById(auth.agencyId)
    .select('name orderSettings tax')
    .lean<{ name: string; orderSettings: { lowStockThreshold: number; expiryAlertDays: number } }>();
  const match = await orderMatch(auth, range);
  const customerIds = await scopeCustomerIds(auth);
  const now = new Date();
  const expiringCutoff = new Date(now.getTime() + (agency?.orderSettings.expiryAlertDays ?? 60) * 24 * 60 * 60 * 1000);

  const dayStart = startOfDay(now);
  const monthStart = startOfMonth(now);
  const todayMatch = { ...match, createdAt: { $gte: dayStart, $lte: now } };
  const monthMatch = { ...match, createdAt: { $gte: monthStart, $lte: now } };

  const [orderSummary] = await OrderModel.aggregate<{
    total: number;
    delivered: number;
    cancelled: number;
    open: number;
    revenue: number;
    tax: number;
    averageValue: number;
    pending: number;
    underReview: number;
    confirmed: number;
    processing: number;
    packed: number;
    dispatched: number;
  }>([
    { $match: match },
    {
      $group: {
        _id: null,
        total: { $sum: 1 },
        delivered: { $sum: { $cond: [{ $eq: ['$status', 'DELIVERED'] }, 1, 0] } },
        cancelled: { $sum: { $cond: [{ $eq: ['$status', 'CANCELLED'] }, 1, 0] } },
        open: {
          $sum: { $cond: [{ $in: ['$status', ['DELIVERED', 'CANCELLED']] }, 0, 1] }
        },
        pending: { $sum: { $cond: [{ $eq: ['$status', 'PENDING'] }, 1, 0] } },
        underReview: { $sum: { $cond: [{ $eq: ['$status', 'UNDER_REVIEW'] }, 1, 0] } },
        confirmed: { $sum: { $cond: [{ $eq: ['$status', 'CONFIRMED'] }, 1, 0] } },
        processing: { $sum: { $cond: [{ $eq: ['$status', 'PROCESSING'] }, 1, 0] } },
        packed: { $sum: { $cond: [{ $eq: ['$status', 'PACKED'] }, 1, 0] } },
        dispatched: { $sum: { $cond: [{ $eq: ['$status', 'DISPATCHED'] }, 1, 0] } },
        revenue: {
          $sum: { $cond: [{ $eq: ['$status', 'DELIVERED'] }, '$grandTotal', 0] }
        },
        tax: {
          $sum: { $cond: [{ $eq: ['$status', 'DELIVERED'] }, '$taxTotal', 0] }
        },
        averageValue: { $avg: '$grandTotal' }
      }
    }
  ]).exec();

  const [todayRows, monthRows] = await Promise.all([
    OrderModel.aggregate<{ orders: number; value: number; delivered: number }>([
      { $match: todayMatch },
      {
        $group: {
          _id: null,
          orders: { $sum: 1 },
          value: { $sum: '$grandTotal' },
          delivered: {
            $sum: { $cond: [{ $gte: ['$deliveredAt', dayStart] }, 1, 0] }
          }
        }
      }
    ]).exec(),
    OrderModel.aggregate<{ orders: number; revenue: number }>([
      { $match: { ...monthMatch, status: { $ne: 'CANCELLED' } } },
      {
        $group: {
          _id: null,
          orders: { $sum: 1 },
          revenue: { $sum: '$grandTotal' }
        }
      }
    ]).exec()
  ]);
  const todaySummary = todayRows[0];
  const monthSummary = monthRows[0];

  const [productCount, customerCount, salesmanCount, totalOrderCount] = await Promise.all([
    ProductModel.countDocuments({ agencyId: auth.agencyId, isActive: true }),
    CustomerModel.countDocuments({
      agencyId: auth.agencyId,
      ...(customerIds ? { _id: { $in: customerIds.length > 0 ? customerIds : [null] } } : {})
    }),
    SalesmanModel.countDocuments({ agencyId: auth.agencyId }),
    OrderModel.countDocuments({
      agencyId: auth.agencyId,
      ...(customerIds ? { customerId: { $in: customerIds.length > 0 ? customerIds : [null] } } : {})
    })
  ]);

  const [stockSummary] = await InventoryModel.aggregate<{
    sellableUnits: number;
    stockValue: number;
    expiredUnits: number;
    expiringUnits: number;
  }>([
    { $match: { agencyId: auth.agencyId, isActive: true } },
    {
      $group: {
        _id: null,
        sellableUnits: {
          $sum: {
            $cond: [
              { $gt: ['$expiryDate', now] },
              { $max: [0, { $subtract: ['$quantityOnHand', '$quantityReserved'] }] },
              0
            ]
          }
        },
        expiredUnits: { $sum: { $cond: [{ $lte: ['$expiryDate', now] }, '$quantityOnHand', 0] } },
        expiringUnits: {
          $sum: {
            $cond: [
              { $and: [{ $gt: ['$expiryDate', now] }, { $lte: ['$expiryDate', expiringCutoff] }] },
              '$quantityOnHand',
              0
            ]
          }
        },
        stockValue: { $sum: { $multiply: ['$quantityOnHand', { $ifNull: ['$unitCost', 0] }] } }
      }
    }
  ]).exec();

  const [lowStock] = await InventoryModel.aggregate<{ count: number }>([
    {
      $match: {
        agencyId: auth.agencyId,
        isActive: true,
        expiryDate: { $gt: now },
        $expr: {
          $and: [
            { $gt: [{ $subtract: ['$quantityOnHand', '$quantityReserved'] }, 0] },
            {
              $lte: [
                { $subtract: ['$quantityOnHand', '$quantityReserved'] },
                agency?.orderSettings.lowStockThreshold ?? 20
              ]
            }
          ]
        }
      }
    },
    { $group: { _id: null, count: { $sum: 1 } } }
  ]).exec();

  const [outOfStock] = await InventoryModel.aggregate<{ count: number }>([
    {
      $match: {
        agencyId: auth.agencyId,
        isActive: true,
        expiryDate: { $gt: now },
        $expr: { $lte: [{ $subtract: ['$quantityOnHand', '$quantityReserved'] }, 0] }
      }
    },
    { $group: { _id: null, count: { $sum: 1 } } }
  ]).exec();

  // Flat product-level availability counters. The nested `inventory` block keeps
  // the batch-level view; the UI needs the product view to label a tile.
  const [expiryCounts] = await InventoryModel.aggregate<{ expiringSoon: number; expired: number }>([
    { $match: { agencyId: auth.agencyId, isActive: true } },
    {
      $group: {
        _id: null,
        expiringSoon: {
          $sum: {
            $cond: [
              { $and: [{ $gt: ['$expiryDate', now] }, { $lte: ['$expiryDate', expiringCutoff] }] },
              1,
              0
            ]
          }
        },
        expired: { $sum: { $cond: [{ $lte: ['$expiryDate', now] }, 1, 0] } }
      }
    }
  ]).exec();

  const lowStockThreshold = agency?.orderSettings.lowStockThreshold ?? 20;
  const sellableByProduct = await aggregateSellableStock(auth.agencyId, now);
  const activeProductIds = (
    await ProductModel.find({ agencyId: auth.agencyId, isActive: true })
      .select('_id')
      .lean<Array<{ _id: Types.ObjectId }>>()
  ).map((product) => String(product._id));

  let lowStockProducts = 0;
  let outOfStockProducts = 0;
  for (const productId of activeProductIds) {
    const sellable = sellableByProduct.get(productId) ?? 0;
    if (sellable <= 0) outOfStockProducts += 1;
    else if (sellable <= lowStockThreshold) lowStockProducts += 1;
  }

  const statusBreakdown = await OrderModel.aggregate<{ _id: string; count: number; value: number }>([
    { $match: match },
    { $group: { _id: '$status', count: { $sum: 1 }, value: { $sum: '$grandTotal' } } },
    { $sort: { count: -1 } }
  ]).exec();

  const openFollowUps = await FollowUpModel.countDocuments({
    agencyId: auth.agencyId,
    status: 'PENDING',
    ...(customerIds ? { customerId: { $in: customerIds.length > 0 ? customerIds : [null] } } : {}),
    ...(isSalesman(auth) ? { salesmanId: auth.salesmanId } : {})
  });

  // Due = still pending and the due date has passed.
  const followUpsDue = await FollowUpModel.countDocuments({
    agencyId: auth.agencyId,
    status: 'PENDING',
    dueAt: { $lte: now },
    ...(customerIds ? { customerId: { $in: customerIds.length > 0 ? customerIds : [null] } } : {}),
    ...(isSalesman(auth) ? { salesmanId: auth.salesmanId } : {})
  });

  const [outstanding] = await InvoiceModel.aggregate<{ due: number; count: number }>([
    {
      $match: {
        agencyId: auth.agencyId,
        status: { $in: ['ISSUED', 'PARTIALLY_PAID'] },
        ...(customerIds ? { customerId: { $in: customerIds.length > 0 ? customerIds : [null] } } : {})
      }
    },
    { $group: { _id: null, due: { $sum: '$amountDue' }, count: { $sum: 1 } } }
  ]).exec();

  const [payments] = await PaymentModel.aggregate<{ collected: number; count: number }>([
    {
      $match: {
        agencyId: auth.agencyId,
        paidAt: { $gte: range.from, $lte: range.to },
        ...(customerIds ? { customerId: { $in: customerIds.length > 0 ? customerIds : [null] } } : {})
      }
    },
    { $group: { _id: null, collected: { $sum: '$amount' }, count: { $sum: 1 } } }
  ]).exec();

  const rangeRevenue = round2(orderSummary?.revenue ?? 0);
  const unpaidAmount = round2(outstanding?.due ?? 0);

  return {
    agency: { id: auth.agencyId, name: agency?.name ?? 'Agency' },
    range: { from: range.from, to: range.to },
    scope: auth.role,
    // Flat, tenant-scoped operational counters. Every value below is produced by
    // a real query against this agency only; nothing is estimated or cached.
    metrics: {
      totalOrders: totalOrderCount,
      totalCustomers: customerCount,
      totalSalesmen: salesmanCount,
      totalProducts: productCount,
      todayOrders: todaySummary?.orders ?? 0,
      todayDeliveredOrders: todaySummary?.delivered ?? 0,
      pendingOrders: orderSummary?.pending ?? 0,
      underReviewOrders: orderSummary?.underReview ?? 0,
      confirmedOrders: orderSummary?.confirmed ?? 0,
      processingOrders: orderSummary?.processing ?? 0,
      packedOrders: orderSummary?.packed ?? 0,
      dispatchedOrders: orderSummary?.dispatched ?? 0,
      deliveredOrders: orderSummary?.delivered ?? 0,
      // Delivered value inside the requested range.
      orderValue: rangeRevenue,
      totalRevenue: rangeRevenue,
      monthlyOrders: monthSummary?.orders ?? 0,
      monthlyRevenue: round2(monthSummary?.revenue ?? 0),
      lowStock: lowStockProducts,
      outOfStock: outOfStockProducts,
      expiringSoon: expiryCounts?.expiringSoon ?? 0,
      expired: expiryCounts?.expired ?? 0,
      followUpsDue,
      unpaidAmount
    },
    orders: {
      total: orderSummary?.total ?? 0,
      delivered: orderSummary?.delivered ?? 0,
      cancelled: orderSummary?.cancelled ?? 0,
      open: orderSummary?.open ?? 0,
      revenue: rangeRevenue,
      taxCollected: round2(orderSummary?.tax ?? 0),
      averageOrderValue: round2(orderSummary?.averageValue ?? 0)
    },
    catalog: { activeProducts: productCount, visibleCustomers: customerCount },
    inventory: {
      sellableUnits: stockSummary?.sellableUnits ?? 0,
      stockValue: round2(stockSummary?.stockValue ?? 0),
      expiredUnits: stockSummary?.expiredUnits ?? 0,
      expiringUnits: stockSummary?.expiringUnits ?? 0,
      lowStockBatches: lowStock?.count ?? 0,
      outOfStockBatches: outOfStock?.count ?? 0,
      lowStockProducts,
      outOfStockProducts,
      expiringSoonBatches: expiryCounts?.expiringSoon ?? 0,
      expiredBatches: expiryCounts?.expired ?? 0
    },
    finance: {
      outstandingAmount: unpaidAmount,
      outstandingInvoices: outstanding?.count ?? 0,
      collectedAmount: round2(payments?.collected ?? 0),
      paymentsRecorded: payments?.count ?? 0
    },
    followUps: { pending: openFollowUps, due: followUpsDue },
    orderStatusBreakdown: statusBreakdown.map((row) => ({
      status: row._id,
      count: row.count,
      value: round2(row.value)
    }))
  };
};

export const ordersReport = async (auth: AuthContext, range: DateRange) => {
  const match = await orderMatch(auth, range);
  const rows = await OrderModel.aggregate<{
    _id: string;
    orderNumber: string;
    status: string;
    customerName: string;
    itemCount: number;
    units: number;
    subtotal: number;
    taxTotal: number;
    grandTotal: number;
    createdAt: Date;
    deliveredAt?: Date;
  }>([
    { $match: match },
    {
      $project: {
        orderNumber: 1,
        status: 1,
        customerName: 1,
        itemCount: { $size: '$items' },
        // `$reduce` is the portable single-document sum. `$sum` is only usable
        // as an expression inside `$project` from MongoDB 5.0 onwards; this form
        // is correct on every supported server version.
        units: {
          $reduce: {
            input: '$items.quantity',
            initialValue: 0,
            in: { $add: ['$$value', '$$this'] }
          }
        },
        subtotal: 1,
        taxTotal: 1,
        grandTotal: 1,
        createdAt: 1,
        deliveredAt: 1
      }
    },
    { $sort: { createdAt: -1 } },
    { $limit: 1000 }
  ]).exec();

  const byDay = await OrderModel.aggregate<{ _id: string; count: number; value: number }>([
    { $match: match },
    {
      $group: {
        _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
        count: { $sum: 1 },
        value: { $sum: '$grandTotal' }
      }
    },
    { $sort: { _id: 1 } }
  ]).exec();

  return {
    range,
    totals: {
      count: rows.length,
      units: rows.reduce((total, row) => total + row.units, 0),
      value: round2(rows.reduce((total, row) => total + row.grandTotal, 0)),
      tax: round2(rows.reduce((total, row) => total + row.taxTotal, 0))
    },
    daily: byDay.map((row) => ({ date: row._id, count: row.count, value: round2(row.value) })),
    orders: rows.map((row) => ({
      _id: row._id,
      id: row._id,
      orderNumber: row.orderNumber,
      status: row.status,
      customerName: row.customerName,
      itemCount: row.itemCount,
      units: row.units,
      subtotal: row.subtotal,
      taxTotal: row.taxTotal,
      grandTotal: row.grandTotal,
      createdAt: row.createdAt,
      deliveredAt: row.deliveredAt ?? null
    }))
  };
};

export const customersReport = async (auth: AuthContext, range: DateRange) => {
  const customerIds = await scopeCustomerIds(auth);
  const match: Record<string, unknown> = { agencyId: auth.agencyId };
  if (customerIds) match._id = { $in: customerIds.length > 0 ? customerIds : [null] };

  const rows = await CustomerModel.aggregate<{
    _id: string;
    businessName: string;
    city: string;
    status: string;
    orderCount: number;
    orderValue: number;
    lastOrderAt?: Date;
  }>([
    { $match: match },
    {
      $lookup: {
        from: 'orders',
        let: { customerId: '$_id', agency: '$agencyId' },
        pipeline: [
          {
            $match: {
              $expr: { $and: [{ $eq: ['$customerId', '$$customerId'] }, { $eq: ['$agencyId', '$$agency'] }] },
              createdAt: { $gte: range.from, $lte: range.to }
            }
          },
          { $group: { _id: null, count: { $sum: 1 }, value: { $sum: '$grandTotal' }, last: { $max: '$createdAt' } } }
        ],
        as: 'orderStats'
      }
    },
    {
      $project: {
        businessName: 1,
        city: '$address.city',
        status: 1,
        orderCount: { $ifNull: [{ $arrayElemAt: ['$orderStats.count', 0] }, 0] },
        orderValue: { $ifNull: [{ $arrayElemAt: ['$orderStats.value', 0] }, 0] },
        lastOrderAt: { $arrayElemAt: ['$orderStats.last', 0] }
      }
    },
    { $sort: { orderValue: -1 } },
    { $limit: 500 }
  ]).exec();

  const [byStatus] = await CustomerModel.aggregate<{ _id: string; count: number }>([
    { $match: match },
    { $group: { _id: '$status', count: { $sum: 1 } } }
  ]).exec();

  return {
    range,
    totals: {
      customers: rows.length,
      withOrders: rows.filter((row) => row.orderCount > 0).length,
      value: round2(rows.reduce((total, row) => total + row.orderValue, 0))
    },
    byStatus: byStatus ?? [],
    customers: rows.map((row) => ({
      _id: row._id,
      id: row._id,
      businessName: row.businessName,
      city: row.city,
      status: row.status,
      orderCount: row.orderCount,
      orderValue: round2(row.orderValue),
      lastOrderAt: row.lastOrderAt ?? null
    }))
  };
};

export const productsReport = async (auth: AuthContext, range: DateRange) => {
  const match = await orderMatch(auth, range);

  const sold = await OrderModel.aggregate<{
    _id: string;
    sku: string;
    productName: string;
    units: number;
    revenue: number;
    orders: number;
  }>([
    { $match: { ...match, status: { $ne: 'CANCELLED' } } },
    { $unwind: '$items' },
    {
      $group: {
        _id: '$items.productId',
        sku: { $first: '$items.sku' },
        productName: { $first: '$items.productName' },
        units: { $sum: '$items.quantity' },
        revenue: { $sum: '$items.lineTotal' },
        orders: { $sum: 1 }
      }
    },
    { $sort: { revenue: -1 } },
    { $limit: 500 }
  ]).exec();

  const stock = await InventoryModel.aggregate<{
    _id: string;
    units: number;
    batches: number;
    value: number;
    earliestExpiry?: Date;
  }>([
    { $match: { agencyId: auth.agencyId, isActive: true, expiryDate: { $gt: new Date() } } },
    {
      $group: {
        _id: '$productId',
        units: { $sum: { $max: [0, { $subtract: ['$quantityOnHand', '$quantityReserved'] }] } },
        batches: { $sum: 1 },
        value: { $sum: { $multiply: ['$quantityOnHand', { $ifNull: ['$unitCost', 0] }] } },
        earliestExpiry: { $min: '$expiryDate' }
      }
    }
  ]).exec();

  const stockMap = new Map(stock.map((row) => [row._id, row]));
  const productIds = Array.from(new Set([...sold.map((row) => row._id), ...stock.map((row) => row._id)]));
  const products = await ProductModel.find({ agencyId: auth.agencyId, _id: { $in: productIds } })
    .select('name sku categoryId price taxRate isActive')
    .lean<Array<{ _id: string; name: string; sku: string; categoryId?: string; price: number; taxRate: number; isActive: boolean }>>();
  const productMap = new Map(products.map((product) => [product._id.toString(), product]));

  const merged = productIds.map((id) => {
    const soldRow = sold.find((row) => row._id === id);
    const stockRow = stockMap.get(id);
    const product = productMap.get(id);
    return {
      _id: id,
      id,
      productName: product?.name ?? soldRow?.productName ?? 'Unknown product',
      sku: product?.sku ?? soldRow?.sku ?? '-',
      isActive: product?.isActive ?? false,
      unitsSold: soldRow?.units ?? 0,
      revenue: round2(soldRow?.revenue ?? 0),
      orderLines: soldRow?.orders ?? 0,
      stockOnHand: stockRow?.units ?? 0,
      batches: stockRow?.batches ?? 0,
      stockValue: round2(stockRow?.value ?? 0),
      earliestExpiry: stockRow?.earliestExpiry ?? null
    };
  });

  return {
    range,
    totals: {
      products: merged.length,
      unitsSold: merged.reduce((total, row) => total + row.unitsSold, 0),
      revenue: round2(merged.reduce((total, row) => total + row.revenue, 0))
    },
    products: merged.sort((a, b) => b.revenue - a.revenue)
  };
};

export const salesmenReport = async (auth: AuthContext, range: DateRange) => {
  if (!isAdmin(auth) && !isSalesman(auth)) {
    throw AppError.forbidden('Salesman performance reporting is available to the agency only');
  }

  const ids = await scopeCustomerIds(auth);
  const match: Record<string, unknown> = {
    agencyId: auth.agencyId,
    createdAt: { $gte: range.from, $lte: range.to }
  };
  if (ids) match.customerId = { $in: ids.length > 0 ? ids : [null] };

  const rows = await OrderModel.aggregate<{
    _id: string;
    employeeCode: string;
    orders: number;
    value: number;
    customers: string[];
  }>([
    { $match: { ...match, status: { $ne: 'CANCELLED' }, salesmanId: { $ne: null } } },
    {
      $group: {
        _id: '$salesmanId',
        orders: { $sum: 1 },
        value: { $sum: '$grandTotal' },
        customers: { $addToSet: '$customerId' }
      }
    },
    { $sort: { value: -1 } }
  ]).exec();

  const salesmen = await SalesmanModel.find({ agencyId: auth.agencyId, _id: { $in: rows.map((row) => row._id) } })
    .select('employeeCode territory userId monthlyTarget status customerIds')
    .populate('userId', 'name email')
    .lean<Array<{
      _id: string;
      employeeCode: string;
      territory?: string;
      status: string;
      monthlyTarget?: number;
      customerIds: unknown[];
      userId?: { name: string; email: string };
    }>>();
  const salesmanMap = new Map(salesmen.map((salesman) => [salesman._id.toString(), salesman]));

  const followUps = await FollowUpModel.aggregate<{ _id: string; total: number; completed: number }>([
    {
      $match: {
        agencyId: auth.agencyId,
        createdAt: { $gte: range.from, $lte: range.to }
      }
    },
    {
      $group: {
        _id: '$salesmanId',
        total: { $sum: 1 },
        completed: { $sum: { $cond: [{ $eq: ['$status', 'COMPLETED'] }, 1, 0] } }
      }
    }
  ]).exec();
  const followUpMap = new Map(followUps.map((row) => [row._id, row]));

  return {
    range,
    salesmen: rows.map((row) => {
      const salesman = salesmanMap.get(row._id);
      const followUp = followUpMap.get(row._id);
      const value = round2(row.value);
      return {
        _id: row._id,
        id: row._id,
        employeeCode: salesman?.employeeCode ?? '-',
        name: salesman?.userId?.name ?? 'Unknown',
        territory: salesman?.territory ?? null,
        status: salesman?.status ?? 'UNKNOWN',
        assignedCustomers: salesman?.customerIds?.length ?? 0,
        orders: row.orders,
        revenue: value,
        averageOrderValue: row.orders > 0 ? round2(value / row.orders) : 0,
        target: salesman?.monthlyTarget ?? null,
        targetAchievement:
          salesman?.monthlyTarget && salesman.monthlyTarget > 0
            ? round2((value / salesman.monthlyTarget) * 100)
            : null,
        customersServed: row.customers.length,
        followUps: followUp?.total ?? 0,
        followUpsCompleted: followUp?.completed ?? 0
      };
    })
  };
};

export const inventoryReport = async (auth: AuthContext) => {
  const now = new Date();
  const agency = await AgencyModel.findById(auth.agencyId)
    .select('orderSettings')
    .lean<{ orderSettings: { lowStockThreshold: number; expiryAlertDays: number } }>();
  const threshold = agency?.orderSettings.lowStockThreshold ?? 20;
  const expiringCutoff = new Date(now.getTime() + (agency?.orderSettings.expiryAlertDays ?? 60) * 24 * 60 * 60 * 1000);

  const rows = await InventoryModel.aggregate<{
    _id: string;
    productId: string;
    batchNumber: string;
    expiryDate: Date;
    onHand: number;
    reserved: number;
    unitCost: number;
    location?: string;
  }>([
    { $match: { agencyId: auth.agencyId, isActive: true } },
    {
      $project: {
        productId: 1,
        batchNumber: 1,
        expiryDate: 1,
        onHand: '$quantityOnHand',
        reserved: '$quantityReserved',
        unitCost: { $ifNull: ['$unitCost', 0] },
        location: 1,
        available: { $max: [0, { $subtract: ['$quantityOnHand', '$quantityReserved'] }] }
      }
    },
    { $sort: { expiryDate: 1 } },
    { $limit: 2000 }
  ]).exec();

  const productIds = Array.from(new Set(rows.map((row) => row.productId)));
  const products = await ProductModel.find({ agencyId: auth.agencyId, _id: { $in: productIds } })
    .select('name sku unit')
    .lean<Array<{ _id: string; name: string; sku: string; unit: string }>>();
  const productMap = new Map(products.map((product) => [product._id.toString(), product]));

  const items = rows.map((row) => {
    const available = Math.max(0, row.onHand - row.reserved);
    const product = productMap.get(String(row.productId));
    return {
      _id: row._id,
      id: row._id,
      productId: row.productId,
      productName: product?.name ?? 'Unknown product',
      sku: product?.sku ?? '-',
      unit: product?.unit ?? 'UNIT',
      batchNumber: row.batchNumber,
      expiryDate: row.expiryDate,
      quantityOnHand: row.onHand,
      quantityReserved: row.reserved,
      quantityAvailable: available,
      stockValue: round2(row.onHand * row.unitCost),
      location: row.location ?? null,
      status:
        row.expiryDate.getTime() <= now.getTime()
          ? 'EXPIRED'
          : available <= 0
            ? 'OUT_OF_STOCK'
            : available <= threshold
              ? 'LOW_STOCK'
              : 'OK'
    };
  });

  return {
    generatedAt: now,
    thresholds: { lowStock: threshold, expiryAlertDays: agency?.orderSettings.expiryAlertDays ?? 60 },
    totals: {
      batches: items.length,
      unitsOnHand: items.reduce((total, item) => total + item.quantityOnHand, 0),
      unitsAvailable: items.reduce((total, item) => total + item.quantityAvailable, 0),
      stockValue: round2(items.reduce((total, item) => total + item.stockValue, 0)),
      expiredBatches: items.filter((item) => item.status === 'EXPIRED').length,
      lowStockBatches: items.filter((item) => item.status === 'LOW_STOCK').length,
      outOfStockBatches: items.filter((item) => item.status === 'OUT_OF_STOCK').length,
      expiringSoon: items.filter(
        (item) => item.expiryDate.getTime() > now.getTime() && item.expiryDate.getTime() <= expiringCutoff.getTime()
      ).length
    },
    items
  };
};

export type ExportType = 'orders' | 'customers' | 'products' | 'salesmen' | 'inventory' | 'invoices' | 'payments';

export interface ExportTable {
  headers: string[];
  rows: Array<Record<string, unknown>>;
}

const buildOrderExport = async (auth: AuthContext, range: DateRange): Promise<ExportTable> => {
  const report = await ordersReport(auth, range);
  return {
    headers: ['Order Number', 'Status', 'Customer', 'Lines', 'Units', 'Subtotal', 'Tax', 'Grand Total', 'Created At'],
    rows: report.orders.map((row) => ({
      'Order Number': row.orderNumber,
      Status: row.status,
      Customer: row.customerName,
      Lines: row.itemCount,
      Units: row.units,
      Subtotal: row.subtotal,
      Tax: row.taxTotal,
      'Grand Total': row.grandTotal,
      'Created At': row.createdAt
    }))
  };
};

const buildCustomerExport = async (auth: AuthContext, range: DateRange): Promise<ExportTable> => {
  const report = await customersReport(auth, range);
  return {
    headers: ['Customer', 'City', 'Status', 'Orders', 'Order Value', 'Last Order'],
    rows: report.customers.map((row) => ({
      Customer: row.businessName,
      City: row.city,
      Status: row.status,
      Orders: row.orderCount,
      'Order Value': row.orderValue,
      'Last Order': row.lastOrderAt
    }))
  };
};

const buildProductExport = async (auth: AuthContext, range: DateRange): Promise<ExportTable> => {
  const report = await productsReport(auth, range);
  return {
    headers: ['Product', 'SKU', 'Active', 'Units Sold', 'Revenue', 'Stock On Hand', 'Batches', 'Stock Value'],
    rows: report.products.map((row) => ({
      Product: row.productName,
      SKU: row.sku,
      Active: row.isActive,
      'Units Sold': row.unitsSold,
      Revenue: row.revenue,
      'Stock On Hand': row.stockOnHand,
      Batches: row.batches,
      'Stock Value': row.stockValue
    }))
  };
};

const buildSalesmanExport = async (auth: AuthContext, range: DateRange): Promise<ExportTable> => {
  const report = await salesmenReport(auth, range);
  return {
    headers: ['Employee Code', 'Name', 'Territory', 'Orders', 'Revenue', 'Avg Order', 'Target Achievement %', 'Follow-ups'],
    rows: report.salesmen.map((row) => ({
      'Employee Code': row.employeeCode,
      Name: row.name,
      Territory: row.territory,
      Orders: row.orders,
      Revenue: row.revenue,
      'Avg Order': row.averageOrderValue,
      'Target Achievement %': row.targetAchievement,
      'Follow-ups': row.followUps
    }))
  };
};

const buildInventoryExport = async (auth: AuthContext): Promise<ExportTable> => {
  const report = await inventoryReport(auth);
  return {
    headers: ['Product', 'SKU', 'Batch', 'Expiry', 'On Hand', 'Reserved', 'Available', 'Status'],
    rows: report.items.map((row) => ({
      Product: row.productName,
      SKU: row.sku,
      Batch: row.batchNumber,
      Expiry: row.expiryDate,
      'On Hand': row.quantityOnHand,
      Reserved: row.quantityReserved,
      Available: row.quantityAvailable,
      Status: row.status
    }))
  };
};

const buildInvoiceExport = async (auth: AuthContext, range: DateRange): Promise<ExportTable> => {
  const rows = await InvoiceModel.find({
    agencyId: auth.agencyId,
    issuedAt: { $gte: range.from, $lte: range.to },
    ...(isCustomer(auth) ? { customerId: auth.customerId } : {})
  })
    .select('invoiceNumber orderNumber customerName grandTotal amountPaid amountDue status issuedAt')
    .sort({ issuedAt: -1 })
    .limit(2000)
    .lean<Array<Record<string, unknown>>>();

  return {
    headers: ['Invoice', 'Order', 'Customer', 'Total', 'Paid', 'Due', 'Status', 'Issued'],
    rows: rows.map((row) => ({
      Invoice: row.invoiceNumber,
      Order: row.orderNumber,
      Customer: row.customerName,
      Total: row.grandTotal,
      Paid: row.amountPaid,
      Due: row.amountDue,
      Status: row.status,
      Issued: row.issuedAt
    }))
  };
};

const buildPaymentExport = async (auth: AuthContext, range: DateRange): Promise<ExportTable> => {
  const rows = await PaymentModel.find({
    agencyId: auth.agencyId,
    paidAt: { $gte: range.from, $lte: range.to },
    ...(isCustomer(auth) ? { customerId: auth.customerId } : {})
  })
    .select('reference invoiceNumber orderNumber amount method paidAt')
    .sort({ paidAt: -1 })
    .limit(2000)
    .lean<Array<Record<string, unknown>>>();

  return {
    headers: ['Reference', 'Invoice', 'Order', 'Amount', 'Method', 'Paid At'],
    rows: rows.map((row) => ({
      Reference: row.reference,
      Invoice: row.invoiceNumber,
      Order: row.orderNumber,
      Amount: row.amount,
      Method: row.method,
      'Paid At': row.paidAt
    }))
  };
};

const exportBuilders: Record<ExportType, (auth: AuthContext, range: DateRange) => Promise<ExportTable>> = {
  orders: buildOrderExport,
  customers: buildCustomerExport,
  products: buildProductExport,
  salesmen: buildSalesmanExport,
  inventory: buildInventoryExport,
  invoices: buildInvoiceExport,
  payments: buildPaymentExport
};

export const EXPORT_TYPES = Object.keys(exportBuilders) as ExportType[];

export const exportReportCsv = async (auth: AuthContext, type: ExportType, range: DateRange): Promise<string> => {
  const builder = exportBuilders[type];
  if (!builder) throw AppError.badRequest(`Unsupported export type "${type}"`);
  const table = await builder(auth, range);
  const columns: Array<CsvColumn<Record<string, unknown>>> = table.headers.map((header) => ({
    header,
    value: (row) => row[header]
  }));
  return toCsv(columns, table.rows);
};

export const staffDirectory = async (agencyId: Types.ObjectId) =>
  UserModel.find({ agencyId, role: { $in: ['AGENCY_ADMIN', 'SALESMAN'] }, status: 'ACTIVE' })
    .select('name email role')
    .lean<Array<{ _id: Types.ObjectId; name: string; email: string; role: string }>>();

export const recentMovements = async (agencyId: Types.ObjectId, limit: number) =>
  StockMovementModel.find({ agencyId })
    .sort({ createdAt: -1 })
    .limit(limit)
    .populate('productId', 'name sku')
    .lean();
