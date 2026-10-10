import type { Request, Response } from 'express';
import { Types } from 'mongoose';
import { asyncHandler } from '../middleware/async-handler';
import { sendCreated, sendData, sendPaginated } from '../utils/response';
import { requireAuth, toObjectIdSafe } from '../utils/tenant';
import { parseSort } from '../utils/pagination';
import { AppError } from '../utils/errors';
import { ContactSubmissionModel } from '../models/contact-submission.model';
import * as contactService from '../services/contact.service';
import { recordActivity } from '../services/activity.service';
import type { ContactSubmissionStatus, ContactTopic } from '../constants/domain';

/**
 * `POST /api/public/contact`
 *
 * Public, unauthenticated and rate limited. It stores a business enquiry and
 * nothing else: no user is created, no password is issued and no login is
 * implied. The response is deliberately generic so the endpoint cannot be used
 * to probe whether an address is already known to the agency.
 */
export const submitPublicContact = asyncHandler(async (req: Request, res: Response) => {
  const agencyId = await contactService.resolveDefaultActiveAgency();
  await contactService.submitContact(agencyId, req.body as contactService.ContactSubmissionInput);

  sendCreated(res, {
    message: 'Thank you. Your enquiry has been received and our team will contact you shortly.'
  });
});

/* ------------------------- agency-side management ------------------------- */

const CONTACT_SORT_FIELDS = ['createdAt', 'name', 'status', 'topic'] as const;

export const listContactSubmissions = asyncHandler(async (req: Request, res: Response) => {
  const auth = requireAuth(req.auth);
  const query = req.query as unknown as {
    page: number;
    limit: number;
    search?: string;
    sort?: string;
    status?: ContactSubmissionStatus;
    topic?: ContactTopic;
  };

  const filter: Record<string, unknown> = { agencyId: auth.agencyId };
  if (query.status) filter.status = query.status;
  if (query.topic) filter.topic = query.topic;
  if (query.search) {
    const escaped = query.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const expression = new RegExp(escaped, 'i');
    filter.$or = [
      { name: expression },
      { email: expression },
      { organisation: expression },
      { message: expression }
    ];
  }

  const [items, total] = await Promise.all([
    ContactSubmissionModel.find(filter)
      .sort(parseSort(query.sort, CONTACT_SORT_FIELDS, { createdAt: -1 }))
      .skip((query.page - 1) * query.limit)
      .limit(query.limit)
      .lean(),
    ContactSubmissionModel.countDocuments(filter)
  ]);

  sendPaginated(res, items, total, query.page, query.limit);
});

export const getContactSubmission = asyncHandler(async (req: Request, res: Response) => {
  const auth = requireAuth(req.auth);
  const submission = await ContactSubmissionModel.findOne({
    agencyId: auth.agencyId,
    _id: toObjectIdSafe(req.params.id, 'id')
  })
    .populate('handledBy', 'name email role')
    .lean();
  if (!submission) throw AppError.notFound('Contact submission');
  sendData(res, submission);
});

export const updateContactSubmission = asyncHandler(async (req: Request, res: Response) => {
  const auth = requireAuth(req.auth);
  const submission = await ContactSubmissionModel.findOne({
    agencyId: auth.agencyId,
    _id: toObjectIdSafe(req.params.id, 'id')
  }).exec();
  if (!submission) throw AppError.notFound('Contact submission');

  if (req.body.status !== undefined) {
    submission.status = req.body.status as ContactSubmissionStatus;
    if (submission.status === 'CONTACTED' && !submission.handledAt) {
      submission.handledAt = new Date();
      submission.handledBy = auth.userId;
    }
  }
  if (req.body.notes !== undefined) submission.notes = req.body.notes;
  submission.updatedBy = auth.userId;
  await submission.save();

  await recordActivity({
    agencyId: auth.agencyId,
    actorUserId: auth.userId,
    actorRole: auth.role,
    action: 'contact.update',
    entity: 'ContactSubmission',
    entityId: submission._id,
    summary: `Updated contact submission ${submission._id.toString()}`,
    meta: { status: submission.status }
  });

  sendData(res, submission);
});

export const removeContactSubmission = asyncHandler(async (req: Request, res: Response) => {
  const auth = requireAuth(req.auth);
  const result = await ContactSubmissionModel.deleteOne({
    agencyId: auth.agencyId,
    _id: new Types.ObjectId(toObjectIdSafe(req.params.id, 'id'))
  });
  if (result.deletedCount === 0) throw AppError.notFound('Contact submission');
  sendData(res, { deleted: result.deletedCount });
});
