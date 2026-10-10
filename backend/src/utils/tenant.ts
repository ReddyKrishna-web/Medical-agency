import type { Types } from 'mongoose';
import mongoose, { Types as MongooseTypes } from 'mongoose';
import { AppError } from './errors';
import { idEquals, toObjectId } from './mongo';
import type { AuthContext } from '../types/express';
import { CustomerModel } from '../models/customer.model';
import { SalesmanModel } from '../models/salesman.model';

/**
 * Mandatory tenant scoping helper. Every business query must pass the caller's
 * `agencyId` through one of these functions; an id alone is never authorisation.
 */
export const tenantFilter = <T extends Record<string, unknown>>(
  auth: AuthContext,
  extra: T = {} as T
): { agencyId: Types.ObjectId } & T => ({
  agencyId: auth.agencyId,
  ...extra
});

export const requireAuth = (auth: AuthContext | undefined): AuthContext => {
  if (!auth) throw AppError.unauthorized();
  return auth;
};

/** Params arrive validated; this keeps controllers free of ad-hoc casts. */
export const toObjectIdSafe = (value: unknown, field = 'id'): Types.ObjectId => toObjectId(value, field);

export const isAdmin = (auth: AuthContext): boolean => auth.role === 'AGENCY_ADMIN';
export const isSalesman = (auth: AuthContext): boolean => auth.role === 'SALESMAN';
export const isCustomer = (auth: AuthContext): boolean => auth.role === 'CUSTOMER';

/** A salesman may only act on accounts assigned to them. */
export const assertSalesmanOwnsCustomer = async (auth: AuthContext, customerId: Types.ObjectId): Promise<void> => {
  if (isAdmin(auth)) return;
  if (!isSalesman(auth)) throw AppError.forbidden('Only agency admins and salesmen can access this customer');
  if (!auth.salesmanId) throw AppError.forbidden('Salesman profile is not resolved for this session');

  const owns = await SalesmanModel.exists({
    agencyId: auth.agencyId,
    _id: auth.salesmanId,
    customerIds: customerId,
    status: 'ACTIVE'
  });
  if (!owns) throw AppError.forbidden('This customer is not assigned to you');
};

/** A customer may only act on their own customer record. */
export const assertCustomerOwnsCustomer = async (auth: AuthContext, customerId: Types.ObjectId): Promise<void> => {
  if (isAdmin(auth)) return;
  if (isCustomer(auth)) {
    if (!auth.customerId || !idEquals(auth.customerId, customerId)) {
      throw AppError.forbidden('You can only access your own records');
    }
    return;
  }
  await assertSalesmanOwnsCustomer(auth, customerId);
};

export const loadCustomerProfile = async (
  auth: AuthContext,
  customerId: Types.ObjectId
): Promise<{ _id: Types.ObjectId; userId: Types.ObjectId; assignedSalesmanId?: Types.ObjectId }> => {
  const customer = await CustomerModel.findOne({ agencyId: auth.agencyId, _id: customerId })
    .select('_id userId assignedSalesmanId')
    .lean<{ _id: Types.ObjectId; userId: Types.ObjectId; assignedSalesmanId?: Types.ObjectId }>();
  if (!customer) throw AppError.notFound('Customer');
  return customer;
};

/** Resolve the customer a request may act on, and verify the policy in one step. */
export const resolveCustomerForWrite = async (
  auth: AuthContext,
  requestedCustomerId?: string
): Promise<{ _id: Types.ObjectId; userId: Types.ObjectId; assignedSalesmanId?: Types.ObjectId }> => {
  if (isCustomer(auth)) {
    if (requestedCustomerId) {
      const requested = mongoose.isValidObjectId(requestedCustomerId)
        ? new MongooseTypes.ObjectId(requestedCustomerId)
        : undefined;
      if (!requested || !auth.customerId || !idEquals(requested, auth.customerId)) {
        throw AppError.forbidden('Customers may only order for their own account');
      }
    }
    if (!auth.customerId) throw AppError.forbidden('Customer profile is not resolved for this session');
    return loadCustomerProfile(auth, auth.customerId);
  }

  if (!requestedCustomerId) {
    throw AppError.badRequest('customerId is required for this role');
  }
  if (!mongoose.isValidObjectId(requestedCustomerId)) {
    throw AppError.badRequest('customerId must be a valid MongoDB ObjectId', [
      { path: 'customerId', message: 'Invalid ObjectId' }
    ]);
  }
  const customerId = new MongooseTypes.ObjectId(requestedCustomerId);  await assertCustomerOwnsCustomer(auth, customerId);
  return loadCustomerProfile(auth, customerId);
};

/** A filter fragment that matches no document, used for empty access scopes. */
const EMPTY_SCOPE = { _id: new MongooseTypes.ObjectId('000000000000000000000000') };

/**
 * Order/message scoping for a salesman: they see orders of assigned customers.
 * Returns an extra query fragment to merge into the tenant filter.
 */
export const orderScopeFor = async (auth: AuthContext): Promise<Record<string, unknown>> => {
  if (isAdmin(auth)) return {};
  if (isCustomer(auth)) {
    if (!auth.customerId) return { ...EMPTY_SCOPE };
    return { customerId: auth.customerId };
  }
  if (!auth.salesmanId) return { ...EMPTY_SCOPE };
  const salesman = await SalesmanModel.findOne({ agencyId: auth.agencyId, _id: auth.salesmanId })
    .select('customerIds')
    .lean<{ customerIds: Types.ObjectId[] }>();
  const customerIds = salesman?.customerIds ?? [];
  if (customerIds.length === 0) return { ...EMPTY_SCOPE };
  return { customerId: { $in: customerIds } };
};

export const assertOrderVisible = async (auth: AuthContext, order: { customerId: Types.ObjectId }): Promise<void> => {
  if (isAdmin(auth)) return;
  if (isCustomer(auth)) {
    if (!auth.customerId || !idEquals(auth.customerId, order.customerId)) {
      throw AppError.notFound('Order');
    }
    return;
  }
  await assertSalesmanOwnsCustomer(auth, order.customerId);
};

export const assertUserInAgency = async (auth: AuthContext, userId: Types.ObjectId): Promise<void> => {
  const exists = await import('../models/user.model').then(({ UserModel }) =>
    UserModel.exists({ agencyId: auth.agencyId, _id: userId })
  );
  if (!exists) throw AppError.notFound('User');
};
