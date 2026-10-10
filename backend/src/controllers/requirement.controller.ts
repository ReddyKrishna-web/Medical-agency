import type { Request, Response } from 'express';
import { asyncHandler } from '../middleware/async-handler';
import { sendCreated, sendData, sendPaginated } from '../utils/response';
import { requireAuth, toObjectIdSafe } from '../utils/tenant';
import { parseSort } from '../utils/pagination';
import { AppError, ErrorCode } from '../utils/errors';
import * as requirementService from '../services/requirement.service';
import { extractRequirement } from '../services/requirement-extraction.service';
import * as orderService from '../services/order.service';
import { AgencyModel } from '../models/agency.model';

const SORT_FIELDS = ['createdAt', 'updatedAt', 'status', 'title'] as const;

export const listRequirements = asyncHandler(async (req: Request, res: Response) => {
  const auth = requireAuth(req.auth);
  const query = req.query as unknown as {
    page: number;
    limit: number;
    search?: string;
    sort?: string;
    status?: string;
    customerId?: string;
  };

  const scope = await requirementService.requirementScopeFilter(auth);
  const { items, total } = await requirementService.listRequirements(scope, {
    search: query.search,
    status: query.status as never,
    customerId: query.customerId,
    sort: parseSort(query.sort, SORT_FIELDS, { createdAt: -1 }),
    skip: (query.page - 1) * query.limit,
    limit: query.limit
  });

  sendPaginated(res, items, total, query.page, query.limit);
});

export const uploadRequirement = asyncHandler(async (req: Request, res: Response) => {
  const auth = requireAuth(req.auth);

  const agency = await AgencyModel.findById(auth.agencyId).select('features').lean<{ features: { uploadsEnabled: boolean } }>();
  if (agency && agency.features.uploadsEnabled === false) {
    throw new AppError(403, ErrorCode.FORBIDDEN, 'Requirement uploads are disabled for this agency');
  }

  const file = req.file;
  if (!file) {
    throw AppError.badRequest('A multipart file field named "file" is required');
  }

  const customer = await requirementService.resolveCustomerForRequirement(auth, req.body.customerId);
  const upload = await requirementService.uploadRequirement(auth, customer, {
    title: req.body.title,
    notes: req.body.notes,
    file
  });

  sendCreated(res, {
    _id: upload._id,
    id: upload._id,
    title: upload.title,
    status: upload.status,
    customerId: upload.customerId,
    file: {
      originalName: upload.file.originalName,
      mimeType: upload.file.mimeType,
      sizeBytes: upload.file.sizeBytes,
      uploadedAt: upload.file.uploadedAt
    }
  });
});

export const getRequirement = asyncHandler(async (req: Request, res: Response) => {
  const auth = requireAuth(req.auth);
  const scope = await requirementService.requirementScopeFilter(auth);
  const upload = await requirementService.getRequirement(scope, toObjectIdSafe(req.params.id, 'id'));
  sendData(res, upload);
});

export const downloadRequirement = asyncHandler(async (req: Request, res: Response) => {
  const auth = requireAuth(req.auth);
  const scope = await requirementService.requirementScopeFilter(auth);
  const handle = await requirementService.openRequirementFile(scope, toObjectIdSafe(req.params.id, 'id'));

  res.setHeader('Content-Type', handle.mimeType);
  res.setHeader('Content-Length', String(handle.sizeBytes));
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="${handle.originalName.replace(/"/g, '')}"`
  );
  res.setHeader('Cache-Control', 'private, no-store');

  handle.stream.pipe(res);
});

export const setRequirementStatus = asyncHandler(async (req: Request, res: Response) => {
  const auth = requireAuth(req.auth);
  const upload = await requirementService.setRequirementStatus(
    auth,
    toObjectIdSafe(req.params.id, 'id'),
    req.body.status,
    req.body.note
  );
  sendData(res, { id: upload._id, status: upload.status, review: upload.review });
});

export const runRequirementExtraction = asyncHandler(async (req: Request, res: Response) => {
  const auth = requireAuth(req.auth);
  const upload = await extractRequirement(auth, toObjectIdSafe(req.params.id, 'id'));
  sendData(res, {
    id: upload._id,
    status: upload.status,
    extraction: upload.extraction,
    // A hard guarantee at the API boundary: extraction never creates an order.
    orderCreated: false,
    humanConfirmationRequired: true
  });
});

export const convertToOrder = asyncHandler(async (req: Request, res: Response) => {
  const auth = requireAuth(req.auth);
  const requirementId = toObjectIdSafe(req.params.id, 'id');
  const scope = await requirementService.requirementScopeFilter(auth);
  const upload = await requirementService.getRequirement(scope, requirementId);

  if (upload.status === 'CONVERTED') {
    throw AppError.conflict('This requirement was already converted to an order', ErrorCode.INVALID_TRANSITION);
  }
  if (upload.status === 'REJECTED') {
    throw AppError.conflict('A rejected requirement cannot be converted', ErrorCode.INVALID_TRANSITION);
  }

  // The requirement already identifies the customer; an explicit customerId may
  // only point at the same tenant-visible customer.
  const customer = await requirementService.resolveCustomerForRequirement(
    auth,
    req.body.customerId ?? (upload.customerId as unknown as string)
  );
  const order = await orderService.createOrder(auth, customer, {
    items: (req.body.items as Array<{ productId: string; quantity: number }>).map((item) => ({
      productId: item.productId,
      quantity: item.quantity
    })),
    notes: req.body.notes,
    source: 'REQUIREMENT',
    requirementUploadId: requirementId.toString(),
    idempotencyKey: req.idempotency?.key
  });

  await requirementService.markRequirementConverted(auth.agencyId, requirementId, order._id);

  if (req.idempotency) {
    await req.idempotency.complete(201, { success: true, data: order }, order._id);
  }
  sendCreated(res, { order, requirementId: requirementId, orderNumber: order.orderNumber });
});
