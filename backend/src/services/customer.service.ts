import type { FilterQuery } from 'mongoose';
import { Types } from 'mongoose';
import { CustomerModel, type ICustomer } from '../models/customer.model';
import { SalesmanModel } from '../models/salesman.model';
import { UserModel } from '../models/user.model';
import { AppError, ErrorCode } from '../utils/errors';
import { hashPassword } from './auth.service';
import { nextSequence } from './counter.service';
import { recordActivity } from './activity.service';
import { createNotificationSafe } from './notification.service';
import { sendAccountApprovedEmail } from './email.service';
import { generateTemporaryPassword } from '../utils/crypto';
import type { AuthContext } from '../types/express';
import { isAdmin, isSalesman } from '../utils/tenant';
import type { ISalesman } from '../models/salesman.model';

export interface CustomerScope {
  filter: Record<string, unknown>;
}

const baseFilter = (agencyId: Types.ObjectId): FilterQuery<Record<string, unknown>> => ({ agencyId });

/**
 * Resource policy for reading customers:
 *  - admin: whole agency
 *  - salesman: only accounts assigned to them
 *  - customer: only their own record
 */
export const customerScope = async (auth: AuthContext): Promise<CustomerScope> => {
  if (isAdmin(auth)) return { filter: baseFilter(auth.agencyId) };
  if (isSalesman(auth)) {
    if (!auth.salesmanId) return { filter: { agencyId: auth.agencyId, _id: null } };
    return { filter: { agencyId: auth.agencyId, assignedSalesmanId: auth.salesmanId } };
  }
  return { filter: { agencyId: auth.agencyId, _id: auth.customerId ?? null } };
};

export interface CustomerListFilters {
  search?: string;
  status?: string;
  assignedSalesmanId?: string;
  city?: string;
  sort?: Record<string, 1 | -1>;
  skip: number;
  limit: number;
}

export const listCustomers = async (scope: CustomerScope, filters: CustomerListFilters) => {
  const filter: FilterQuery<Record<string, unknown>> = { ...scope.filter };
  if (filters.status) filter.status = filters.status;
  if (filters.assignedSalesmanId) filter.assignedSalesmanId = filters.assignedSalesmanId;
  if (filters.city) filter['address.city'] = new RegExp(filters.city.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
  if (filters.search) {
    const escaped = filters.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const expression = new RegExp(escaped, 'i');
    filter.$or = [
      { businessName: expression },
      { ownerName: expression },
      { phone: expression },
      { email: expression },
      { gstNumber: expression }
    ];
  }

  const [items, total] = await Promise.all([
    CustomerModel.find(filter)
      .populate('userId', 'name email phone status')
      .populate('assignedSalesmanId', 'employeeCode userId territory status')
      .sort(filters.sort ?? { createdAt: -1 })
      .skip(filters.skip)
      .limit(filters.limit)
      .lean(),
    CustomerModel.countDocuments(filter)
  ]);

  return { items, total };
};

export const getCustomer = async (scope: CustomerScope, customerId: Types.ObjectId) => {
  const customer = await CustomerModel.findOne({ ...scope.filter, _id: customerId })
    .populate('userId', 'name email phone status lastLoginAt')
    .populate('assignedSalesmanId', 'employeeCode territory status userId')
    .lean();
  if (!customer) throw AppError.notFound('Customer');
  return customer;
};

export interface CreateCustomerInput {
  name: string;
  email: string;
  phone: string;
  password: string;
  businessName: string;
  ownerName?: string;
  alternatePhone?: string;
  gstNumber?: string;
  drugLicenseNumber?: string;
  shopType?: string;
  address: ICustomer['address'];
  creditLimit?: number;
  assignedSalesmanId?: string;
  status?: 'PENDING' | 'APPROVED' | 'ACTIVE';
  notes?: string;
  actorUserId: Types.ObjectId;
  actorRole: string;
}

/** Admin-created customer. The role is always CUSTOMER; admins cannot mint staff. */
export const createCustomer = async (agencyId: Types.ObjectId, input: CreateCustomerInput) => {
  const email = input.email.trim().toLowerCase();
  const existing = await UserModel.findOne({ email }).select('_id').exec();
  if (existing) throw AppError.conflict('An account with this email address already exists', ErrorCode.DUPLICATE_RESOURCE);

  if (input.assignedSalesmanId) {
    const salesmanExists = await SalesmanModel.exists({ agencyId, _id: input.assignedSalesmanId });
    if (!salesmanExists) throw AppError.notFound('Salesman');
  }

  const status = input.status ?? 'APPROVED';
  const user = await UserModel.create({
    agencyId,
    name: input.name.trim(),
    email,
    phone: input.phone.trim(),
    passwordHash: await hashPassword(input.password),
    role: 'CUSTOMER',
    status: status === 'PENDING' ? 'PENDING' : 'ACTIVE',
    tokenVersion: 0,
    mustChangePassword: true
  });

  const sequence = await nextSequence(agencyId, 'customer', new Date().getUTCFullYear());
  const customer = await CustomerModel.create({
    agencyId,
    userId: user._id,
    businessName: input.businessName.trim(),
    ownerName: (input.ownerName ?? input.name).trim(),
    phone: input.phone.trim(),
    alternatePhone: input.alternatePhone,
    email,
    gstNumber: input.gstNumber?.trim().toUpperCase(),
    drugLicenseNumber: input.drugLicenseNumber,
    shopType: input.shopType,
    address: input.address,
    creditLimit: input.creditLimit ?? 0,
    status,
    approvedAt: status === 'PENDING' ? undefined : new Date(),
    approvedBy: status === 'PENDING' ? undefined : input.actorUserId,
    assignedSalesmanId: input.assignedSalesmanId,
    notes: input.notes ?? `Created by agency (sequence ${sequence})`,
    createdBy: input.actorUserId
  });

  if (input.assignedSalesmanId) {
    await SalesmanModel.updateOne(
      { agencyId, _id: input.assignedSalesmanId },
      { $addToSet: { customerIds: customer._id } }
    ).exec();
  }

  createNotificationSafe({
    agencyId,
    userId: user._id,
    type: 'ACCOUNT_APPROVED',
    title: 'Welcome to Supply Medicals',
    message: `Your account for ${customer.businessName} is active.`,
    data: { customerId: customer._id.toString() },
    entityType: 'Customer',
    entityId: customer._id
  });
  void sendAccountApprovedEmail(user.email, user.name);

  await recordActivity({
    agencyId,
    actorUserId: input.actorUserId,
    actorRole: input.actorRole,
    action: 'customer.create',
    entity: 'Customer',
    entityId: customer._id,
    summary: `Created customer ${customer.businessName}`
  });

  return { customer, userId: user._id };
};

export const updateCustomer = async (
  agencyId: Types.ObjectId,
  customerId: Types.ObjectId,
  patch: Partial<Omit<CreateCustomerInput, 'password' | 'actorUserId' | 'actorRole'>> & { actorUserId?: Types.ObjectId }
) => {
  const customer = await CustomerModel.findOne({ agencyId, _id: customerId }).exec();
  if (!customer) throw AppError.notFound('Customer');

  const previousSalesmanId = customer.assignedSalesmanId;

  if (patch.businessName !== undefined) customer.businessName = patch.businessName.trim();
  if (patch.ownerName !== undefined) customer.ownerName = patch.ownerName.trim();
  if (patch.phone !== undefined) customer.phone = patch.phone.trim();
  if (patch.alternatePhone !== undefined) customer.alternatePhone = patch.alternatePhone;
  if (patch.gstNumber !== undefined) customer.gstNumber = patch.gstNumber?.trim().toUpperCase();
  if (patch.drugLicenseNumber !== undefined) customer.drugLicenseNumber = patch.drugLicenseNumber;
  if (patch.shopType !== undefined) customer.shopType = patch.shopType;
  if (patch.address !== undefined) customer.address = patch.address;
  if (patch.creditLimit !== undefined) customer.creditLimit = patch.creditLimit;
  if (patch.notes !== undefined) customer.notes = patch.notes;
  if (patch.assignedSalesmanId !== undefined) {
    customer.assignedSalesmanId = patch.assignedSalesmanId as unknown as Types.ObjectId;
  }
  customer.updatedBy = patch.actorUserId;
  await customer.save();

  // Keep both sides of the assignment consistent.
  if (patch.assignedSalesmanId !== undefined) {
    if (previousSalesmanId && String(previousSalesmanId) !== String(patch.assignedSalesmanId)) {
      await SalesmanModel.updateOne(
        { agencyId, _id: previousSalesmanId },
        { $pull: { customerIds: customer._id } }
      ).exec();
    }
    if (patch.assignedSalesmanId) {
      await SalesmanModel.updateOne(
        { agencyId, _id: patch.assignedSalesmanId },
        { $addToSet: { customerIds: customer._id } }
      ).exec();
    }
  }

  // Mirror the editable identity fields onto the login account.
  if (patch.phone !== undefined || patch.businessName !== undefined) {
    const user = await UserModel.findOne({ agencyId, _id: customer.userId }).exec();
    if (user) {
      if (patch.phone !== undefined) user.phone = patch.phone.trim();
      user.updatedBy = patch.actorUserId;
      await user.save();
    }
  }

  await recordActivity({
    agencyId,
    actorUserId: patch.actorUserId,
    action: 'customer.update',
    entity: 'Customer',
    entityId: customer._id,
    summary: `Updated customer ${customer.businessName}`,
    meta: { fields: Object.keys(patch) }
  });

  return customer;
};

export interface AddCustomerNoteInput {
  text: string;
  type?: 'NOTE' | 'CALL';
  actorUserId: Types.ObjectId;
  actorRole: 'SALESMAN' | 'AGENCY_ADMIN';
}

/**
 * Append an attributable CRM note. Admins may note any agency customer; a
 * salesman may only note an account assigned to them. The note history is a
 * separate collection inside the tenant-scoped customer document so it is never
 * confused with agency-owned commercial notes.
 */
export const addCustomerNote = async (
  auth: AuthContext,
  customerId: Types.ObjectId,
  input: AddCustomerNoteInput
): Promise<ICustomer> => {
  const scope = await customerScope(auth);
  const customer = await CustomerModel.findOne({ ...scope.filter, _id: customerId }).exec();
  if (!customer) throw AppError.notFound('Customer');

  customer.accountNotes = [
    ...(customer.accountNotes ?? []),
    { text: input.text.trim(), byUserId: input.actorUserId, byRole: input.actorRole, at: new Date() }
  ].slice(-200);
  customer.lastContactAt = new Date();
  customer.lastContactType = input.type === 'CALL' ? 'CALL' : 'NOTE';
  customer.updatedBy = input.actorUserId;
  await customer.save();

  await recordActivity({
    agencyId: auth.agencyId,
    actorUserId: input.actorUserId,
    actorRole: input.actorRole,
    action: 'customer.note',
    entity: 'Customer',
    entityId: customer._id,
    summary: `Added a CRM ${input.type === 'CALL' ? 'call note' : 'note'} to ${customer.businessName}`,
    meta: { type: input.type ?? 'NOTE' }
  });

  return customer;
};

/** Update the last-contact signal without writing a visible note. */
export const markCustomerContact = async (
  agencyId: Types.ObjectId,
  customerId: Types.ObjectId,
  type: 'MESSAGE' | 'FOLLOW_UP' | 'ORDER',
  at = new Date()
): Promise<void> => {
  await CustomerModel.updateOne(
    { agencyId, _id: customerId },
    { $set: { lastContactAt: at, lastContactType: type } }
  ).exec();
};

export interface SalesmanListFilters {
  search?: string;
  status?: string;
  skip: number;
  limit: number;
  sort?: Record<string, 1 | -1>;
}

export const listSalesmen = async (agencyId: Types.ObjectId, filters: SalesmanListFilters) => {
  const filter: FilterQuery<Record<string, unknown>> = { agencyId };
  if (filters.status) filter.status = filters.status;
  if (filters.search) {
    const escaped = filters.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const expression = new RegExp(escaped, 'i');
    filter.$or = [{ employeeCode: expression }, { territory: expression }, { phone: expression }];
  }

  const [items, total] = await Promise.all([
    SalesmanModel.find(filter)
      .populate('userId', 'name email phone status lastLoginAt')
      .sort(filters.sort ?? { createdAt: -1 })
      .skip(filters.skip)
      .limit(filters.limit)
      .lean(),
    SalesmanModel.countDocuments(filter)
  ]);

  return {
    items: items.map((item) => ({ ...item, assignedCustomerCount: item.customerIds?.length ?? 0 })),
    total
  };
};

export const getSalesman = async (agencyId: Types.ObjectId, salesmanId: Types.ObjectId) => {
  const salesman = await SalesmanModel.findOne({ agencyId, _id: salesmanId })
    .populate('userId', 'name email phone status lastLoginAt')
    .populate('customerIds', 'businessName status')
    .lean();
  if (!salesman) throw AppError.notFound('Salesman');
  return { ...salesman, assignedCustomerCount: salesman.customerIds?.length ?? 0 };
};

export interface CreateSalesmanInput {
  name: string;
  email: string;
  phone: string;
  /**
   * Optional. When omitted the server generates a strong temporary password so
   * an admin never has to invent or reuse a secret to onboard staff.
   */
  password?: string;
  employeeCode?: string;
  territory?: string;
  monthlyTarget?: number;
  notes?: string;
  actorUserId: Types.ObjectId;
  actorRole: string;
}

export interface CreateSalesmanResult {
  salesman: ISalesman;
  userId: Types.ObjectId;
  /**
   * Plaintext temporary password, present **only** when the server generated
   * one. It is never persisted, never logged and never returned again.
   */
  temporaryPassword?: string;
}

export const createSalesman = async (
  agencyId: Types.ObjectId,
  input: CreateSalesmanInput
): Promise<CreateSalesmanResult> => {
  const email = input.email.trim().toLowerCase();
  const existing = await UserModel.findOne({ email }).select('_id').exec();
  if (existing) throw AppError.conflict('An account with this email address already exists', ErrorCode.DUPLICATE_RESOURCE);

  // No admin-supplied password means we mint a single-use credential. The raw
  // value exists only in this function's return value and is hashed below.
  const generatedPassword = input.password ? undefined : generateTemporaryPassword();
  const password = input.password ?? generatedPassword!;

  const user = await UserModel.create({
    agencyId,
    name: input.name.trim(),
    email,
    phone: input.phone.trim(),
    passwordHash: await hashPassword(password),
    role: 'SALESMAN',
    status: 'ACTIVE',
    tokenVersion: 0,
    // Either way the first sign-in must replace the credential.
    mustChangePassword: true,
    createdBy: input.actorUserId
  });

  const sequence = await nextSequence(agencyId, 'salesman', new Date().getUTCFullYear());
  const employeeCode = input.employeeCode?.trim().toUpperCase() ?? `SM-${sequence}`;

  const salesman = await SalesmanModel.create({
    agencyId,
    userId: user._id,
    employeeCode,
    territory: input.territory,
    phone: input.phone.trim(),
    status: 'ACTIVE',
    customerIds: [],
    monthlyTarget: input.monthlyTarget,
    joinedAt: new Date(),
    notes: input.notes,
    createdBy: input.actorUserId
  });

  createNotificationSafe({
    agencyId,
    userId: user._id,
    type: 'SYSTEM',
    title: 'Salesman account created',
    message: `Your salesman account (${employeeCode}) is active. Sign in with the temporary password you were given and change it immediately.`,
    data: { salesmanId: salesman._id.toString() },
    entityType: 'Salesman',
    entityId: salesman._id
  });

  await recordActivity({
    agencyId,
    actorUserId: input.actorUserId,
    actorRole: input.actorRole,
    action: 'salesman.create',
    entity: 'Salesman',
    entityId: salesman._id,
    summary: `Created salesman ${input.name} (${employeeCode})`,
    // Only whether a credential was generated, never the credential itself.
    meta: { temporaryPasswordGenerated: Boolean(generatedPassword) }
  });

  return { salesman, userId: user._id, temporaryPassword: generatedPassword };
};

export const updateSalesman = async (
  agencyId: Types.ObjectId,
  salesmanId: Types.ObjectId,
  patch: Partial<Omit<CreateSalesmanInput, 'password' | 'actorUserId' | 'actorRole'>> & { actorUserId?: Types.ObjectId }
) => {
  const salesman = await SalesmanModel.findOne({ agencyId, _id: salesmanId }).exec();
  if (!salesman) throw AppError.notFound('Salesman');

  if (patch.employeeCode !== undefined) salesman.employeeCode = patch.employeeCode.trim().toUpperCase();
  if (patch.territory !== undefined) salesman.territory = patch.territory;
  if (patch.phone !== undefined) salesman.phone = patch.phone.trim();
  if (patch.monthlyTarget !== undefined) salesman.monthlyTarget = patch.monthlyTarget;
  if (patch.notes !== undefined) salesman.notes = patch.notes;
  salesman.updatedBy = patch.actorUserId;
  await salesman.save();

  await recordActivity({
    agencyId,
    actorUserId: patch.actorUserId,
    action: 'salesman.update',
    entity: 'Salesman',
    entityId: salesman._id,
    summary: `Updated salesman ${salesman.employeeCode}`,
    meta: { fields: Object.keys(patch) }
  });
  return salesman;
};

/** Replace the whole assignment set for a salesman (admin only). */
export const assignCustomers = async (
  agencyId: Types.ObjectId,
  salesmanId: Types.ObjectId,
  customerIds: Types.ObjectId[],
  actorUserId: Types.ObjectId
) => {
  const salesman = await SalesmanModel.findOne({ agencyId, _id: salesmanId }).exec();
  if (!salesman) throw AppError.notFound('Salesman');

  const uniqueIds = Array.from(new Set(customerIds.map((id) => id.toString()))).map((id) => new Types.ObjectId(id));

  if (uniqueIds.length > 0) {
    const found = await CustomerModel.countDocuments({ agencyId, _id: { $in: uniqueIds } });
    if (found !== uniqueIds.length) {
      throw AppError.badRequest('One or more customer ids do not belong to this agency');
    }
  }

  salesman.customerIds = uniqueIds;
  salesman.updatedBy = actorUserId;
  await salesman.save();

  await CustomerModel.updateMany(
    { agencyId, assignedSalesmanId: salesman._id, _id: { $nin: uniqueIds } },
    { $unset: { assignedSalesmanId: 1 } }
  ).exec();

  await CustomerModel.updateMany(
    { agencyId, _id: { $in: uniqueIds } },
    { $set: { assignedSalesmanId: salesman._id } }
  ).exec();

  await recordActivity({
    agencyId,
    actorUserId,
    action: 'salesman.assign_customers',
    entity: 'Salesman',
    entityId: salesman._id,
    summary: `Assigned ${uniqueIds.length} customer(s) to ${salesman.employeeCode}`,
    meta: { customerIds: uniqueIds.map((id) => id.toString()) }
  });

  return salesman;
};

export const resolveSalesmanForCustomer = async (
  agencyId: Types.ObjectId,
  assignedSalesmanId?: Types.ObjectId
): Promise<{ salesmanId?: Types.ObjectId; salesmanUserId?: Types.ObjectId }> => {
  if (!assignedSalesmanId) return {};
  const salesman = await SalesmanModel.findOne({ agencyId, _id: assignedSalesmanId, status: 'ACTIVE' })
    .select('_id userId')
    .lean<{ _id: Types.ObjectId; userId: Types.ObjectId }>();
  if (!salesman) return {};
  return { salesmanId: salesman._id, salesmanUserId: salesman.userId };
};
