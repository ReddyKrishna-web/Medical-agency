import type { Types } from 'mongoose';
import { OrderModel } from '../models/order.model';
import { CustomerModel } from '../models/customer.model';
import { ProductModel } from '../models/product.model';
import { InvoiceModel } from '../models/invoice.model';
import { BatchModel } from '../models/batch.model';
import { SalesmanModel } from '../models/salesman.model';
import { UserModel } from '../models/user.model';
import { AppError } from '../utils/errors';
import type { AuthContext } from '../types/express';
import { isAdmin, isCustomer, isSalesman } from '../utils/tenant';

export interface SearchResultGroup {
  type: string;
  label: string;
  items: Array<Record<string, unknown>>;
}

const escape = (term: string): string => term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Tenant scoped global search. Each branch is filtered by the caller's own
 * access policy, so a customer can never surface another tenant's or another
 * customer's private record through search.
 */
export const globalSearch = async (
  auth: AuthContext,
  rawTerm: string,
  limit: number
): Promise<{ term: string; groups: SearchResultGroup[]; total: number }> => {
  const term = rawTerm.trim();
  if (term.length < 2) {
    throw AppError.badRequest('Search term must be at least 2 characters');
  }

  const expression = new RegExp(escape(term), 'i');
  const groups: SearchResultGroup[] = [];

  // --- Orders -------------------------------------------------------------
  const orderFilter: Record<string, unknown> = {
    agencyId: auth.agencyId,
    $or: [{ orderNumber: expression }, { customerName: expression }]
  };
  if (isCustomer(auth)) orderFilter.customerId = auth.customerId ?? null;
  if (isSalesman(auth)) {
    if (!auth.salesmanId) orderFilter._id = null;
    else {
      const salesman = await SalesmanModel.findOne({ agencyId: auth.agencyId, _id: auth.salesmanId })
        .select('customerIds')
        .lean<{ customerIds: Types.ObjectId[] }>();
      orderFilter.customerId = { $in: salesman?.customerIds?.length ? salesman.customerIds : [null] };
    }
  }

  const orders = await OrderModel.find(orderFilter)
    .select('orderNumber status customerName grandTotal createdAt')
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean();

  groups.push({
    type: 'orders',
    label: 'Orders',
    items: orders.map((order) => ({
      _id: order._id,
      id: order._id,
      title: order.orderNumber,
      subtitle: order.customerName,
      status: order.status,
      value: order.grandTotal,
      date: order.createdAt
    }))
  });

  // --- Products / batches -------------------------------------------------
  if (isAdmin(auth) || isSalesman(auth)) {
    const products = await ProductModel.find({
      agencyId: auth.agencyId,
      isActive: true,
      $or: [{ name: expression }, { sku: expression }, { brand: expression }]
    })
      .select('name sku price unit isActive')
      .limit(limit)
      .lean();
    groups.push({
      type: 'products',
      label: 'Products',
      items: products.map((product) => ({
        _id: product._id,
        id: product._id,
        title: product.name,
        subtitle: product.sku,
        price: product.price,
        unit: product.unit
      }))
    });

    const batches = await BatchModel.find({
      agencyId: auth.agencyId,
      $or: [{ batchNumber: expression }, { supplier: expression }]
    })
      .select('batchNumber expiryDate status productId')
      .sort({ expiryDate: 1 })
      .limit(limit)
      .lean();
    groups.push({
      type: 'batches',
      label: 'Batches',
      items: batches.map((batch) => ({
        _id: batch._id,
        id: batch._id,
        title: batch.batchNumber,
        subtitle: batch.status,
        expiryDate: batch.expiryDate
      }))
    });
  }

  // --- Customers ----------------------------------------------------------
  const customerFilter: Record<string, unknown> = {
    agencyId: auth.agencyId,
    $or: [{ businessName: expression }, { ownerName: expression }, { phone: expression }, { gstNumber: expression }]
  };
  if (isCustomer(auth)) customerFilter._id = auth.customerId ?? null;
  if (isSalesman(auth)) customerFilter.assignedSalesmanId = auth.salesmanId ?? null;

  const customers = await CustomerModel.find(customerFilter)
    .select('businessName ownerName phone status')
    .limit(limit)
    .lean();
  groups.push({
    type: 'customers',
    label: 'Customers',
    items: customers.map((customer) => ({
      _id: customer._id,
      id: customer._id,
      title: customer.businessName,
      subtitle: customer.ownerName,
      phone: customer.phone,
      status: customer.status
    }))
  });

  // --- Invoices -----------------------------------------------------------
  const invoiceFilter: Record<string, unknown> = {
    agencyId: auth.agencyId,
    $or: [{ invoiceNumber: expression }, { orderNumber: expression }]
  };
  if (isCustomer(auth)) invoiceFilter.customerId = auth.customerId ?? null;
  const invoices = await InvoiceModel.find(invoiceFilter)
    .select('invoiceNumber orderNumber grandTotal amountDue status issuedAt')
    .limit(limit)
    .lean();
  groups.push({
    type: 'invoices',
    label: 'Invoices',
    items: invoices.map((invoice) => ({
      _id: invoice._id,
      id: invoice._id,
      title: invoice.invoiceNumber,
      subtitle: invoice.orderNumber,
      value: invoice.grandTotal,
      due: invoice.amountDue,
      status: invoice.status
    }))
  });

  // --- Staff (admin only) -------------------------------------------------
  if (isAdmin(auth)) {
    const staff = await UserModel.find({
      agencyId: auth.agencyId,
      role: { $in: ['AGENCY_ADMIN', 'SALESMAN'] },
      $or: [{ name: expression }, { email: expression }]
    })
      .select('name email role status')
      .limit(limit)
      .lean();
    groups.push({
      type: 'staff',
      label: 'Staff',
      items: staff.map((member) => ({
        _id: member._id,
        id: member._id,
        title: member.name,
        subtitle: member.email,
        role: member.role,
        status: member.status
      }))
    });
  }

  const nonEmpty = groups.filter((group) => group.items.length > 0);
  return { term, groups: nonEmpty, total: nonEmpty.reduce((total, group) => total + group.items.length, 0) };
};
