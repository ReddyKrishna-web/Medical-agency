import { Schema, model, models, type Model, type Types } from 'mongoose';

export interface AgencyAddress {
  line1: string;
  line2?: string;
  city: string;
  state: string;
  country: string;
  postalCode: string;
}

export interface AgencyTaxSettings {
  gstNumber?: string;
  defaultTaxRate: number;
  pricesIncludeTax: boolean;
  invoicePrefix: string;
}

export interface AgencyOrderSettings {
  /** Human order-number prefix, e.g. `SM` produces `SM-2026-000001`. */
  prefix: string;
  /** Zero padding of the numeric part. */
  padding: number;
  lowStockThreshold: number;
  expiryAlertDays: number;
  allowCustomerCancellation: boolean;
  cancelWindowHours: number;
  followUpDueDays: number;
  invoiceDueDays: number;
  defaultPaymentTermsDays: number;
}

export interface AgencyFeatures {
  aiEnabled: boolean;
  uploadsEnabled: boolean;
  socketEnabled: boolean;
}

/**
 * Published opening hours. A day maps to free text ("09:00 - 18:00") so an
 * agency can express split shifts; `null`/`''` means closed that day.
 */
export type AgencyBusinessHours = Record<string, string | null>;

export interface AgencyNotificationPreferences {
  /** Send an email as well as an in-app notification for these events. */
  email: {
    newOrder: boolean;
    orderStatusChange: boolean;
    paymentRecorded: boolean;
    inventoryLow: boolean;
    inventoryExpiring: boolean;
    requirementUploaded: boolean;
    followUpDue: boolean;
    contactSubmission: boolean;
  };
  /** Bypass the in-app notification for a low-staff channel. */
  quietHoursEnabled: boolean;
  /** 24h `HH:mm` local window in which non-critical notifications are muted. */
  quietHoursStart?: string;
  quietHoursEnd?: string;
}

export interface IAgency {
  _id: Types.ObjectId;
  name: string;
  slug: string;
  legalName?: string;
  status: 'ACTIVE' | 'SUSPENDED';
  logoUrl?: string;
  website?: string;
  description?: string;
  contact: {
    email: string;
    phone: string;
    address: AgencyAddress;
  };
  tax: AgencyTaxSettings;
  orderSettings: AgencyOrderSettings;
  features: AgencyFeatures;
  businessHours: AgencyBusinessHours;
  notifications: AgencyNotificationPreferences;
  createdBy?: Types.ObjectId;
  updatedBy?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const addressSchema = new Schema<AgencyAddress>(
  {
    line1: { type: String, required: true, trim: true, maxlength: 160 },
    line2: { type: String, trim: true, maxlength: 160 },
    city: { type: String, required: true, trim: true, maxlength: 80 },
    state: { type: String, required: true, trim: true, maxlength: 80 },
    country: { type: String, required: true, trim: true, maxlength: 80 },
    postalCode: { type: String, required: true, trim: true, maxlength: 20 }
  },
  { _id: false }
);

const agencySchema = new Schema<IAgency>(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    slug: { type: String, required: true, trim: true, lowercase: true, maxlength: 80 },
    legalName: { type: String, trim: true, maxlength: 160 },
    status: { type: String, enum: ['ACTIVE', 'SUSPENDED'], default: 'ACTIVE', index: true },
    logoUrl: { type: String, trim: true, maxlength: 500 },
    website: { type: String, trim: true, maxlength: 200 },
    description: { type: String, trim: true, maxlength: 2000 },
    contact: {
      email: { type: String, required: true, trim: true, lowercase: true, maxlength: 160 },
      phone: { type: String, required: true, trim: true, maxlength: 32 },
      address: { type: addressSchema, required: true }
    },
    tax: {
      gstNumber: { type: String, trim: true, maxlength: 32 },
      defaultTaxRate: { type: Number, min: 0, max: 100, default: 18 },
      pricesIncludeTax: { type: Boolean, default: false },
      invoicePrefix: { type: String, trim: true, uppercase: true, maxlength: 12, default: 'INV' }
    },
    orderSettings: {
      prefix: { type: String, trim: true, uppercase: true, maxlength: 12, default: 'SM' },
      padding: { type: Number, min: 1, max: 12, default: 6 },
      lowStockThreshold: { type: Number, min: 0, max: 100000, default: 20 },
      expiryAlertDays: { type: Number, min: 1, max: 365, default: 60 },
      allowCustomerCancellation: { type: Boolean, default: true },
      cancelWindowHours: { type: Number, min: 0, max: 720, default: 48 },
      followUpDueDays: { type: Number, min: 1, max: 365, default: 7 },
      invoiceDueDays: { type: Number, min: 0, max: 365, default: 15 },
      defaultPaymentTermsDays: { type: Number, min: 0, max: 365, default: 0 }
    },
    features: {
      aiEnabled: { type: Boolean, default: true },
      uploadsEnabled: { type: Boolean, default: true },
      socketEnabled: { type: Boolean, default: true }
    },
    businessHours: {
      type: new Schema<Record<string, string | null>>({}, { _id: false, minimize: false, strict: false }),
      default: () => ({})
    },
    notifications: {
      email: {
        newOrder: { type: Boolean, default: true },
        orderStatusChange: { type: Boolean, default: true },
        paymentRecorded: { type: Boolean, default: true },
        inventoryLow: { type: Boolean, default: true },
        inventoryExpiring: { type: Boolean, default: true },
        requirementUploaded: { type: Boolean, default: true },
        followUpDue: { type: Boolean, default: true },
        contactSubmission: { type: Boolean, default: true }
      },
      quietHoursEnabled: { type: Boolean, default: false },
      quietHoursStart: { type: String, trim: true, maxlength: 5 },
      quietHoursEnd: { type: String, trim: true, maxlength: 5 }
    },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User' }
  },
  { timestamps: true, versionKey: false }
);

agencySchema.index({ name: 1 });
agencySchema.index({ slug: 1 }, { unique: true });

export const AgencyModel: Model<IAgency> =
  (models.Agency as Model<IAgency>) ?? model<IAgency>('Agency', agencySchema);

export default AgencyModel;
