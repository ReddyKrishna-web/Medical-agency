import { Schema, model, models, type Model, type Types } from 'mongoose';
import { tenantPlugin } from './plugins/tenant.plugin';
import {
  CONTACT_SUBMISSION_STATUSES,
  CONTACT_TOPICS,
  type ContactSubmissionStatus,
  type ContactTopic
} from '../constants/domain';

/**
 * A business enquiry submitted through the public website form.
 *
 * This is *not* an account: no user, no password and no session is created.
 * Only the contact details a visitor deliberately supplied are stored, and the
 * document is always tenant scoped so a submission can only ever be read by the
 * agency that received it.
 */
export interface IContactSubmission {
  _id: Types.ObjectId;
  agencyId: Types.ObjectId;
  name: string;
  email: string;
  phone?: string;
  organisation?: string;
  topic: ContactTopic;
  message: string;
  status: ContactSubmissionStatus;
  /** Set once an agency user works the lead. */
  handledBy?: Types.ObjectId;
  handledAt?: Date;
  notes?: string;
  createdBy?: Types.ObjectId;
  updatedBy?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const contactSubmissionSchema = new Schema<IContactSubmission>(
  {
    agencyId: { type: Schema.Types.ObjectId, ref: 'Agency', required: true },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    email: { type: String, required: true, trim: true, lowercase: true, maxlength: 160 },
    phone: { type: String, trim: true, maxlength: 32 },
    organisation: { type: String, trim: true, maxlength: 160 },
    topic: { type: String, enum: CONTACT_TOPICS, required: true, default: 'NEW_ORDER_ENQUIRY' },
    message: { type: String, required: true, trim: true, maxlength: 4000 },
    status: { type: String, enum: CONTACT_SUBMISSION_STATUSES, default: 'NEW', required: true },
    handledBy: { type: Schema.Types.ObjectId, ref: 'User' },
    handledAt: { type: Date },
    notes: { type: String, trim: true, maxlength: 2000 },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User' }
  },
  { timestamps: true, versionKey: false }
);

// Inbox read path: newest first, optionally filtered to an open status.
contactSubmissionSchema.index({ agencyId: 1, status: 1, createdAt: -1 });
contactSubmissionSchema.index({ agencyId: 1, email: 1, createdAt: -1 });

contactSubmissionSchema.plugin(tenantPlugin);

export const ContactSubmissionModel: Model<IContactSubmission> =
  (models.ContactSubmission as Model<IContactSubmission>) ??
  model<IContactSubmission>('ContactSubmission', contactSubmissionSchema);

export default ContactSubmissionModel;
