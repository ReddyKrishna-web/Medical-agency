import type { FilterQuery, Types } from 'mongoose';
import { FollowUpModel, type IFollowUp } from '../models/follow-up.model';
import { CustomerModel } from '../models/customer.model';
import { SalesmanModel } from '../models/salesman.model';
import { UserModel } from '../models/user.model';
import { AppError, ErrorCode } from '../utils/errors';
import { recordActivity } from './activity.service';
import { createNotificationSafe } from './notification.service';
import type { AuthContext } from '../types/express';
import { isAdmin, isCustomer, isSalesman } from '../utils/tenant';
import type { FollowUpStatus, FollowUpType } from '../constants/domain';

/**
 * Follow-up ownership: admins see everything, a salesman sees only their own
 * follow-ups, and a customer sees the follow-ups recorded against their account.
 */
export const followUpScopeFilter = (auth: AuthContext): FilterQuery<Record<string, unknown>> => {
  const base: FilterQuery<Record<string, unknown>> = { agencyId: auth.agencyId };
  if (isAdmin(auth)) return base;
  if (isSalesman(auth)) return { ...base, salesmanId: auth.salesmanId ?? null };
  return { ...base, customerId: auth.customerId ?? null };
};

export const assertCanMutateFollowUp = async (auth: AuthContext, followUp: IFollowUp): Promise<void> => {
  if (isAdmin(auth)) return;
  if (isSalesman(auth)) {
    if (String(followUp.salesmanId) !== String(auth.salesmanId ?? '')) {
      throw AppError.forbidden('You can only change your own follow-ups');
    }
    return;
  }
  if (isCustomer(auth)) {
    if (String(followUp.customerId) !== String(auth.customerId ?? '')) {
      throw AppError.notFound('Follow-up');
    }
    return;
  }
  throw AppError.forbidden();
};

export interface CreateFollowUpInput {
  customerId: string;
  title: string;
  notes?: string;
  type: FollowUpType;
  dueAt: string | Date;
  relatedOrderId?: string;
}

export const createFollowUp = async (auth: AuthContext, input: CreateFollowUpInput): Promise<IFollowUp> => {
  if (isCustomer(auth)) {
    throw AppError.forbidden('Follow-ups are recorded by the agency; contact your salesman');
  }

  const customer = await CustomerModel.findOne({ agencyId: auth.agencyId, _id: input.customerId }).exec();
  if (!customer) throw AppError.notFound('Customer');

  let salesmanId: Types.ObjectId | undefined;
  let salesmanUserId: Types.ObjectId | undefined;

  if (isSalesman(auth)) {
    if (!auth.salesmanId) throw AppError.forbidden('Salesman profile is not resolved');
    const assigned = await SalesmanModel.exists({
      agencyId: auth.agencyId,
      _id: auth.salesmanId,
      customerIds: customer._id
    });
    if (!assigned) throw AppError.forbidden('This customer is not assigned to you');
    salesmanId = auth.salesmanId;
    salesmanUserId = auth.userId;
  } else if (customer.assignedSalesmanId) {
    const salesman = await SalesmanModel.findOne({ agencyId: auth.agencyId, _id: customer.assignedSalesmanId })
      .select('_id userId status')
      .lean<{ _id: Types.ObjectId; userId: Types.ObjectId; status: string }>();
    if (salesman) {
      salesmanId = salesman._id;
      salesmanUserId = salesman.userId;
    }
  }

  if (!salesmanId) {
    throw new AppError(
      409,
      ErrorCode.CONFLICT,
      'Assign a salesman to this customer before scheduling a follow-up'
    );
  }

  const followUp = await FollowUpModel.create({
    agencyId: auth.agencyId,
    salesmanId,
    salesmanUserId,
    customerId: customer._id,
    customerUserId: customer.userId,
    title: input.title.trim(),
    notes: input.notes,
    type: input.type,
    dueAt: new Date(input.dueAt),
    status: 'PENDING',
    relatedOrderId: input.relatedOrderId,
    createdBy: auth.userId
  });

  if (salesmanUserId && String(salesmanUserId) !== String(auth.userId)) {
    createNotificationSafe({
      agencyId: auth.agencyId,
      userId: salesmanUserId,
      type: 'FOLLOW_UP_DUE',
      title: 'New follow-up scheduled',
      message: `${followUp.title} for ${customer.businessName} is due ${new Date(followUp.dueAt).toISOString()}`,
      data: { followUpId: followUp._id.toString(), customerId: customer._id.toString() },
      entityType: 'FollowUp',
      entityId: followUp._id
    });
  }

  createNotificationSafe({
    agencyId: auth.agencyId,
    userId: customer.userId,
    type: 'FOLLOW_UP_DUE',
    title: 'Your agency scheduled a follow-up',
    message: `${followUp.title} is scheduled for ${new Date(followUp.dueAt).toDateString()}`,
    data: { followUpId: followUp._id.toString() },
    entityType: 'FollowUp',
    entityId: followUp._id
  });

  await recordActivity({
    agencyId: auth.agencyId,
    actorUserId: auth.userId,
    actorRole: auth.role,
    action: 'followup.create',
    entity: 'FollowUp',
    entityId: followUp._id,
    summary: `Scheduled follow-up "${followUp.title}" for ${customer.businessName}`
  });

  return followUp;
};

export interface FollowUpListFilters {
  status?: FollowUpStatus;
  type?: FollowUpType;
  customerId?: string;
  salesmanId?: string;
  dueFrom?: Date;
  dueTo?: Date;
  search?: string;
  sort?: Record<string, 1 | -1>;
  skip: number;
  limit: number;
}

export const listFollowUps = async (scope: FilterQuery<Record<string, unknown>>, filters: FollowUpListFilters) => {
  const filter: FilterQuery<Record<string, unknown>> = { ...scope };
  if (filters.status) filter.status = filters.status;
  if (filters.type) filter.type = filters.type;
  if (filters.customerId) filter.customerId = filters.customerId;
  if (filters.salesmanId) filter.salesmanId = filters.salesmanId;
  if (filters.dueFrom || filters.dueTo) {
    filter.dueAt = {
      ...(filters.dueFrom ? { $gte: filters.dueFrom } : {}),
      ...(filters.dueTo ? { $lte: filters.dueTo } : {})
    };
  }
  if (filters.search) {
    const escaped = filters.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const expression = new RegExp(escaped, 'i');
    filter.$or = [{ title: expression }, { notes: expression }];
  }

  const [items, total] = await Promise.all([
    FollowUpModel.find(filter)
      .populate('customerId', 'businessName phone')
      .populate('salesmanId', 'employeeCode territory')
      .sort(filters.sort ?? { dueAt: 1 })
      .skip(filters.skip)
      .limit(filters.limit)
      .lean(),
    FollowUpModel.countDocuments(filter)
  ]);
  return { items, total };
};

export const getFollowUp = async (scope: FilterQuery<Record<string, unknown>>, followUpId: Types.ObjectId) => {
  const followUp = await FollowUpModel.findOne({ ...scope, _id: followUpId })
    .populate('customerId', 'businessName phone')
    .populate('salesmanId', 'employeeCode territory userId')
    .lean();
  if (!followUp) throw AppError.notFound('Follow-up');
  return followUp;
};

export const updateFollowUp = async (
  auth: AuthContext,
  followUpId: Types.ObjectId,
  patch: { title?: string; notes?: string; type?: FollowUpType; dueAt?: string | Date; outcome?: string; nextFollowUpAt?: string | Date }
): Promise<IFollowUp> => {
  const followUp = await FollowUpModel.findOne({ agencyId: auth.agencyId, _id: followUpId }).exec();
  if (!followUp) throw AppError.notFound('Follow-up');
  if (isCustomer(auth)) throw AppError.forbidden('Customers cannot edit follow-ups');
  await assertCanMutateFollowUp(auth, followUp);

  if (patch.title !== undefined) followUp.title = patch.title.trim();
  if (patch.notes !== undefined) followUp.notes = patch.notes;
  if (patch.type !== undefined) followUp.type = patch.type;
  if (patch.dueAt !== undefined) followUp.dueAt = new Date(patch.dueAt);
  if (patch.outcome !== undefined) followUp.outcome = patch.outcome;
  if (patch.nextFollowUpAt !== undefined) followUp.nextFollowUpAt = new Date(patch.nextFollowUpAt);
  followUp.updatedBy = auth.userId;
  await followUp.save();

  await recordActivity({
    agencyId: auth.agencyId,
    actorUserId: auth.userId,
    actorRole: auth.role,
    action: 'followup.update',
    entity: 'FollowUp',
    entityId: followUp._id,
    summary: `Updated follow-up "${followUp.title}"`,
    meta: { fields: Object.keys(patch) }
  });
  return followUp;
};

const STATUS_EDGES: Record<FollowUpStatus, FollowUpStatus[]> = {
  PENDING: ['COMPLETED', 'CANCELLED'],
  COMPLETED: [],
  CANCELLED: []
};

export const setFollowUpStatus = async (
  auth: AuthContext,
  followUpId: Types.ObjectId,
  status: FollowUpStatus,
  note?: string
): Promise<IFollowUp> => {
  const followUp = await FollowUpModel.findOne({ agencyId: auth.agencyId, _id: followUpId }).exec();
  if (!followUp) throw AppError.notFound('Follow-up');
  if (isCustomer(auth)) throw AppError.forbidden('Customers cannot change follow-up status');
  await assertCanMutateFollowUp(auth, followUp);

  if (followUp.status === status) {
    throw AppError.conflict(`Follow-up is already ${status}`, ErrorCode.INVALID_TRANSITION);
  }
  if (!STATUS_EDGES[followUp.status].includes(status)) {
    throw new AppError(
      409,
      ErrorCode.INVALID_TRANSITION,
      `Cannot move a follow-up from ${followUp.status} to ${status}`,
      { from: followUp.status, to: status, allowed: STATUS_EDGES[followUp.status] }
    );
  }

  followUp.status = status;
  if (status === 'COMPLETED') {
    followUp.completedAt = new Date();
    if (note) followUp.outcome = note;
  }
  followUp.updatedBy = auth.userId;
  await followUp.save();
  if (status === 'COMPLETED' && followUp.completedAt) {
    const { markCustomerContact } = await import('./customer.service');
    await markCustomerContact(auth.agencyId, followUp.customerId, 'FOLLOW_UP', followUp.completedAt);
  }

  createNotificationSafe({
    agencyId: auth.agencyId,
    userId: followUp.customerUserId,
    type: 'FOLLOW_UP_DUE',
    title: `Follow-up ${status.toLowerCase()}`,
    message: `${followUp.title} was marked ${status.toLowerCase()}.${note ? ` Note: ${note}` : ''}`,
    data: { followUpId: followUp._id.toString(), status },
    entityType: 'FollowUp',
    entityId: followUp._id
  });

  await recordActivity({
    agencyId: auth.agencyId,
    actorUserId: auth.userId,
    actorRole: auth.role,
    action: `followup.status.${status.toLowerCase()}`,
    entity: 'FollowUp',
    entityId: followUp._id,
    summary: `Follow-up "${followUp.title}" marked ${status}`,
    meta: { note }
  });

  return followUp;
};

export const listSalesmanOptions = async (agencyId: Types.ObjectId) => {
  const salesmen = await SalesmanModel.find({ agencyId, status: 'ACTIVE' })
    .select('employeeCode territory userId')
    .populate('userId', 'name email')
    .lean<Array<{ _id: Types.ObjectId; employeeCode: string; territory?: string; userId: { name: string; email: string } }>>();
  return salesmen.map((salesman) => ({
    _id: salesman._id,
    id: salesman._id,
    employeeCode: salesman.employeeCode,
    territory: salesman.territory,
    name: salesman.userId?.name,
    email: salesman.userId?.email
  }));
};

export const countUserMessages = async (agencyId: Types.ObjectId, userId: Types.ObjectId): Promise<number> => {
  const user = await UserModel.findOne({ agencyId, _id: userId }).select('_id').lean();
  return user ? 1 : 0;
};
