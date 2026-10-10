import type { Types } from 'mongoose';
import { ContactSubmissionModel, type IContactSubmission } from '../models/contact-submission.model';
import { AgencyModel } from '../models/agency.model';
import { AppError } from '../utils/errors';
import { recordActivity } from './activity.service';
import { notifyRoles } from './notification.service';
import type { ContactTopic } from '../constants/domain';

export interface ContactSubmissionInput {
  name: string;
  email: string;
  phone?: string;
  organisation?: string;
  topic: ContactTopic;
  message: string;
}

/**
 * A public form has no tenant context, so the receiving agency is resolved from
 * configuration: the single ACTIVE agency. When the deployment holds more than
 * one active agency the request is refused rather than attributed to a guess.
 */
export const resolveDefaultActiveAgency = async (): Promise<Types.ObjectId> => {
  const active = await AgencyModel.find({ status: 'ACTIVE' })
    .sort({ createdAt: 1 })
    .limit(2)
    .select('_id')
    .lean<Array<{ _id: Types.ObjectId }>>();

  if (active.length === 0) throw AppError.notFound('Agency');
  if (active.length > 1) {
    throw AppError.badRequest(
      'Contact submissions are unavailable: this deployment serves more than one agency'
    );
  }
  return active[0]!._id;
};

const safeLabel = (value: string, max = 120): string => value.replace(/\s+/g, ' ').trim().slice(0, max);

/**
 * Persist an enquiry and let the agency know. No account, user, session or
 * password is created, and the response never echoes the stored values back.
 */
export const submitContact = async (
  agencyId: Types.ObjectId,
  input: ContactSubmissionInput
): Promise<IContactSubmission> => {
  const submission = await ContactSubmissionModel.create({
    agencyId,
    name: safeLabel(input.name),
    email: input.email.trim().toLowerCase(),
    phone: input.phone ? safeLabel(input.phone, 32) : undefined,
    organisation: input.organisation ? safeLabel(input.organisation, 160) : undefined,
    topic: input.topic,
    message: input.message.trim(),
    status: 'NEW'
  });

  const label = safeLabel(input.organisation ?? input.name);

  // Notify every active agency admin through the role fan-out.
  await notifyRoles(agencyId, ['AGENCY_ADMIN'], {
    type: 'SYSTEM',
    title: 'New website enquiry',
    message: `${label} sent a "${input.topic}" enquiry via the website contact form.`,
    data: { contactSubmissionId: submission._id.toString(), topic: input.topic },
    entityType: 'ContactSubmission',
    entityId: submission._id
  });

  await recordActivity({
    agencyId,
    action: 'contact.submit',
    entity: 'ContactSubmission',
    entityId: submission._id,
    summary: `Public contact submission (${input.topic}) from ${safeLabel(input.name)}`,
    meta: { topic: input.topic, hasPhone: Boolean(input.phone), hasOrganisation: Boolean(input.organisation) }
  });

  return submission;
};
