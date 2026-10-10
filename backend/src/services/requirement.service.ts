import type { FilterQuery, Types } from 'mongoose';
import { RequirementUploadModel, type IRequirementUpload } from '../models/requirement-upload.model';
import { CustomerModel } from '../models/customer.model';
import { SalesmanModel } from '../models/salesman.model';
import { AppError, ErrorCode } from '../utils/errors';
import { getStorage } from './storage';
import { randomObjectKey, sha256 } from '../utils/crypto';
import { validateUpload, type ValidatedUpload } from '../utils/file-validation';
import { recordActivity } from './activity.service';
import { createNotificationSafe, resolveAdminUserIds } from './notification.service';
import type { AuthContext } from '../types/express';
import { isAdmin, isSalesman } from '../utils/tenant';
import type { RequirementStatus } from '../constants/domain';

export interface UploadRequirementInput {
  title: string;
  notes?: string;
  file: Express.Multer.File;
}

/**
 * Store a requirement document. The file is validated by content, renamed to a
 * random key, and kept outside the public web root. Only an authorised,
 * tenant-scoped user may read it back.
 */
export const uploadRequirement = async (
  auth: AuthContext,
  customer: { _id: Types.ObjectId; userId: Types.ObjectId; assignedSalesmanId?: Types.ObjectId },
  input: UploadRequirementInput
): Promise<IRequirementUpload> => {
  const validated: ValidatedUpload = validateUpload(input.file);
  const storage = getStorage();

  const storageKey = randomObjectKey(validated.extension);
  const stored = await storage.put(storageKey, validated.buffer, validated.mimeType);

  const upload = await RequirementUploadModel.create({
    agencyId: auth.agencyId,
    customerId: customer._id,
    customerUserId: customer.userId,
    title: input.title.trim(),
    notes: input.notes,
    file: {
      storageProvider: stored.provider,
      storageKey: stored.key,
      originalName: validated.originalName,
      mimeType: validated.mimeType,
      extension: validated.extension,
      sizeBytes: stored.sizeBytes,
      checksumSha256: stored.checksumSha256 || sha256(validated.buffer),
      uploadedAt: new Date()
    },
    status: 'SUBMITTED'
  });

  const recipients = new Set<Types.ObjectId>(await resolveAdminUserIds(auth.agencyId));
  if (customer.assignedSalesmanId) {
    const salesman = await SalesmanModel.findOne({ agencyId: auth.agencyId, _id: customer.assignedSalesmanId })
      .select('userId')
      .lean<{ userId: Types.ObjectId }>();
    if (salesman) recipients.add(salesman.userId);
  }

  for (const userId of recipients) {
    createNotificationSafe({
      agencyId: auth.agencyId,
      userId,
      type: 'REQUIREMENT_UPLOADED',
      title: 'New requirement uploaded',
      message: `${upload.title} (${validated.originalName}) is awaiting review`,
      data: { requirementId: upload._id.toString(), customerId: customer._id.toString() },
      entityType: 'RequirementUpload',
      entityId: upload._id
    });
  }

  await recordActivity({
    agencyId: auth.agencyId,
    actorUserId: auth.userId,
    actorRole: auth.role,
    action: 'requirement.upload',
    entity: 'RequirementUpload',
    entityId: upload._id,
    summary: `Uploaded requirement "${upload.title}" (${validated.originalName})`,
    meta: { sizeBytes: stored.sizeBytes, extension: validated.extension }
  });

  return upload;
};

export const requirementScopeFilter = async (auth: AuthContext): Promise<FilterQuery<Record<string, unknown>>> => {
  const base: FilterQuery<Record<string, unknown>> = { agencyId: auth.agencyId };
  if (isAdmin(auth)) return base;
  if (isSalesman(auth)) {
    if (!auth.salesmanId) return { ...base, _id: null };
    const salesman = await SalesmanModel.findOne({ agencyId: auth.agencyId, _id: auth.salesmanId })
      .select('customerIds')
      .lean<{ customerIds: Types.ObjectId[] }>();
    const ids = salesman?.customerIds ?? [];
    return { ...base, customerId: { $in: ids.length > 0 ? ids : [null] } };
  }
  return { ...base, customerId: auth.customerId ?? null };
};

export interface RequirementListFilters {
  status?: RequirementStatus;
  customerId?: string;
  search?: string;
  skip: number;
  limit: number;
  sort?: Record<string, 1 | -1>;
}

export const listRequirements = async (
  scope: FilterQuery<Record<string, unknown>>,
  filters: RequirementListFilters
) => {
  const filter: FilterQuery<Record<string, unknown>> = { ...scope };
  if (filters.status) filter.status = filters.status;
  if (filters.customerId) filter.customerId = filters.customerId;
  if (filters.search) {
    const escaped = filters.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const expression = new RegExp(escaped, 'i');
    filter.$or = [{ title: expression }, { 'file.originalName': expression }];
  }

  const [items, total] = await Promise.all([
    RequirementUploadModel.find(filter)
      .populate('customerId', 'businessName phone')
      .sort(filters.sort ?? { createdAt: -1 })
      .skip(filters.skip)
      .limit(filters.limit)
      .lean(),
    RequirementUploadModel.countDocuments(filter)
  ]);
  return { items, total };
};

export const getRequirement = async (scope: FilterQuery<Record<string, unknown>>, requirementId: Types.ObjectId) => {
  const upload = await RequirementUploadModel.findOne({ ...scope, _id: requirementId })
    .populate('customerId', 'businessName phone')
    .lean();
  if (!upload) throw AppError.notFound('Requirement upload');
  return upload;
};

export interface RequirementFileHandle {
  stream: NodeJS.ReadableStream;
  mimeType: string;
  originalName: string;
  sizeBytes: number;
}

export const openRequirementFile = async (
  scope: FilterQuery<Record<string, unknown>>,
  requirementId: Types.ObjectId
): Promise<RequirementFileHandle> => {
  const upload = await RequirementUploadModel.findOne({ ...scope, _id: requirementId })
    .select('file')
    .lean<{ file: { storageKey: string; mimeType: string; originalName: string; sizeBytes: number } }>();
  if (!upload) throw AppError.notFound('Requirement upload');

  const storage = getStorage();
  const exists = await storage.exists(upload.file.storageKey);
  if (!exists) {
    throw new AppError(410, ErrorCode.STORAGE_ERROR, 'The stored file is no longer available');
  }

  const stream = await storage.getStream(upload.file.storageKey);

  await recordActivity({
    agencyId: (scope.agencyId as Types.ObjectId) ?? null,
    action: 'requirement.download',
    entity: 'RequirementUpload',
    entityId: requirementId,
    summary: `Downloaded ${upload.file.originalName}`
  });

  return {
    stream,
    mimeType: upload.file.mimeType,
    originalName: upload.file.originalName,
    sizeBytes: upload.file.sizeBytes
  };
};

const REVIEW_EDGES: Record<RequirementStatus, RequirementStatus[]> = {
  SUBMITTED: ['IN_REVIEW', 'ACCEPTED', 'REJECTED'],
  IN_REVIEW: ['ACCEPTED', 'REJECTED'],
  ACCEPTED: ['CONVERTED'],
  REJECTED: [],
  CONVERTED: []
};

export const setRequirementStatus = async (
  auth: AuthContext,
  requirementId: Types.ObjectId,
  status: RequirementStatus,
  note?: string
): Promise<IRequirementUpload> => {
  if (isSalesman(auth) || isAdmin(auth)) {
    // staff path
  } else {
    throw AppError.forbidden('Only the agency can review a requirement');
  }

  const upload = await RequirementUploadModel.findOne({ agencyId: auth.agencyId, _id: requirementId }).exec();
  if (!upload) throw AppError.notFound('Requirement upload');

  if (upload.status === status) {
    throw AppError.conflict(`Requirement is already ${status}`, ErrorCode.INVALID_TRANSITION);
  }
  if (!REVIEW_EDGES[upload.status].includes(status)) {
    throw new AppError(
      409,
      ErrorCode.INVALID_TRANSITION,
      `Cannot move a requirement from ${upload.status} to ${status}`,
      { from: upload.status, to: status, allowed: REVIEW_EDGES[upload.status] }
    );
  }

  upload.status = status;
  upload.review = { byUserId: auth.userId, at: new Date(), note: note?.trim() };
  await upload.save();

  createNotificationSafe({
    agencyId: auth.agencyId,
    userId: upload.customerUserId,
    type: 'REQUIREMENT_UPLOADED',
    title: `Requirement ${status.toLowerCase().replace('_', ' ')}`,
    message: `${upload.title} is now ${status.toLowerCase()}.${note ? ` Note: ${note}` : ''}`,
    data: { requirementId: upload._id.toString(), status },
    entityType: 'RequirementUpload',
    entityId: upload._id
  });

  await recordActivity({
    agencyId: auth.agencyId,
    actorUserId: auth.userId,
    actorRole: auth.role,
    action: `requirement.status.${status.toLowerCase()}`,
    entity: 'RequirementUpload',
    entityId: upload._id,
    summary: `Requirement "${upload.title}" moved to ${status}`,
    meta: { note }
  });

  return upload;
};

export const markRequirementConverted = async (
  agencyId: Types.ObjectId,
  requirementId: Types.ObjectId,
  orderId: Types.ObjectId
): Promise<void> => {
  await RequirementUploadModel.updateOne(
    { agencyId, _id: requirementId },
    { $set: { status: 'CONVERTED', convertedOrderId: orderId, review: { at: new Date() } } }
  ).exec();
};

export const resolveCustomerForRequirement = async (auth: AuthContext, customerId?: string) => {
  if (auth.role === 'CUSTOMER') {
    if (!auth.customerId) throw AppError.forbidden('Customer profile is not resolved');
    const customer = await CustomerModel.findOne({ agencyId: auth.agencyId, _id: auth.customerId }).exec();
    if (!customer) throw AppError.notFound('Customer');
    return customer;
  }
  if (!customerId) throw AppError.badRequest('customerId is required for this role');
  const customer = await CustomerModel.findOne({ agencyId: auth.agencyId, _id: customerId }).exec();
  if (!customer) throw AppError.notFound('Customer');
  if (isSalesman(auth) && String(customer.assignedSalesmanId ?? '') !== String(auth.salesmanId ?? '')) {
    throw AppError.forbidden('This customer is not assigned to you');
  }
  return customer;
};
