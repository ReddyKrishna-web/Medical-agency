import { AgencyModel, type IAgency } from '../models/agency.model';
import { recordActivity } from './activity.service';
import { AppError } from '../utils/errors';
import { nextSequence } from './counter.service';
import { round2 } from '../utils/numbers';
import { WEEK_DAYS, NOTIFICATION_PREFERENCE_KEYS, type WeekDay } from '../constants/domain';

type DeepPartial<T> = { [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K] };

const isWeekDay = (key: string): key is WeekDay => (WEEK_DAYS as readonly string[]).includes(key);

/**
 * Normalise the submitted business hours into a complete seven-day record so
 * a client never has to remember to clear a day. Unknown keys are dropped
 * rather than persisted.
 */
const normaliseBusinessHours = (patch: Partial<IAgency['businessHours']>): IAgency['businessHours'] => {
  const next: IAgency['businessHours'] = {};
  for (const day of WEEK_DAYS) {
    const value = patch[day];
    if (value === undefined) continue;
    const trimmedValue = typeof value === 'string' ? value.trim() : null;
    next[day] = trimmedValue && trimmedValue.length > 0 ? trimmedValue : null;
  }
  for (const [key, value] of Object.entries(patch)) {
    if (!isWeekDay(key)) delete next[key];
    else if (next[key] === undefined && value === undefined) delete next[key];
  }
  return next;
};

/** Admin settings view: hides nothing sensitive because the agency *is* the tenant. */
export const getSettings = async (agencyId: string | import('mongoose').Types.ObjectId) => {
  const agency = await AgencyModel.findById(agencyId).lean();
  if (!agency) throw AppError.notFound('Agency');
  return agency;
};

export interface SettingsPatch {
  name?: string;
  legalName?: string;
  website?: string;
  description?: string;
  logoUrl?: string;
  contact?: Partial<IAgency['contact']> & { address?: Partial<IAgency['contact']['address']> };
  tax?: Partial<IAgency['tax']>;
  orderSettings?: Partial<IAgency['orderSettings']>;
  features?: Partial<IAgency['features']>;
  businessHours?: Partial<IAgency['businessHours']>;
  notifications?: DeepPartial<IAgency['notifications']>;
  actorUserId?: import('mongoose').Types.ObjectId;
}

export const updateSettings = async (agencyId: string, patch: SettingsPatch): Promise<IAgency> => {
  const agency = await AgencyModel.findById(agencyId).exec();
  if (!agency) throw AppError.notFound('Agency');

  if (patch.name !== undefined) agency.name = patch.name.trim();
  if (patch.legalName !== undefined) agency.legalName = patch.legalName;
  if (patch.website !== undefined) agency.website = patch.website;
  if (patch.description !== undefined) agency.description = patch.description;
  if (patch.logoUrl !== undefined) agency.logoUrl = patch.logoUrl;

  if (patch.contact) {
    if (patch.contact.email !== undefined) agency.contact.email = patch.contact.email.toLowerCase().trim();
    if (patch.contact.phone !== undefined) agency.contact.phone = patch.contact.phone.trim();
    if (patch.contact.address) {
      Object.assign(agency.contact.address, patch.contact.address);
      agency.markModified('contact.address');
    }
  }

  if (patch.tax) {
    if (patch.tax.gstNumber !== undefined) agency.tax.gstNumber = patch.tax.gstNumber?.trim().toUpperCase();
    if (patch.tax.defaultTaxRate !== undefined) agency.tax.defaultTaxRate = patch.tax.defaultTaxRate;
    if (patch.tax.pricesIncludeTax !== undefined) agency.tax.pricesIncludeTax = patch.tax.pricesIncludeTax;
    if (patch.tax.invoicePrefix !== undefined) {
      agency.tax.invoicePrefix = patch.tax.invoicePrefix.trim().toUpperCase();
    }
  }

  if (patch.orderSettings) {
    const current = agency.orderSettings;
    if (patch.orderSettings.prefix !== undefined) {
      current.prefix = patch.orderSettings.prefix.trim().toUpperCase();
    }
    if (patch.orderSettings.padding !== undefined) current.padding = patch.orderSettings.padding;
    if (patch.orderSettings.lowStockThreshold !== undefined) {
      current.lowStockThreshold = patch.orderSettings.lowStockThreshold;
    }
    if (patch.orderSettings.expiryAlertDays !== undefined) current.expiryAlertDays = patch.orderSettings.expiryAlertDays;
    if (patch.orderSettings.allowCustomerCancellation !== undefined) {
      current.allowCustomerCancellation = patch.orderSettings.allowCustomerCancellation;
    }
    if (patch.orderSettings.cancelWindowHours !== undefined) {
      current.cancelWindowHours = patch.orderSettings.cancelWindowHours;
    }
    if (patch.orderSettings.followUpDueDays !== undefined) current.followUpDueDays = patch.orderSettings.followUpDueDays;
    if (patch.orderSettings.invoiceDueDays !== undefined) current.invoiceDueDays = patch.orderSettings.invoiceDueDays;
    if (patch.orderSettings.defaultPaymentTermsDays !== undefined) {
      current.defaultPaymentTermsDays = patch.orderSettings.defaultPaymentTermsDays;
    }
  }

  if (patch.features) {
    if (patch.features.aiEnabled !== undefined) agency.features.aiEnabled = patch.features.aiEnabled;
    if (patch.features.uploadsEnabled !== undefined) agency.features.uploadsEnabled = patch.features.uploadsEnabled;
    if (patch.features.socketEnabled !== undefined) agency.features.socketEnabled = patch.features.socketEnabled;
  }

  if (patch.businessHours) {
    // The nested map must be replaced wholesale, so mark it modified explicitly.
    agency.businessHours = {
      ...(agency.businessHours ?? {}),
      ...normaliseBusinessHours(patch.businessHours)
    } as IAgency['businessHours'];
    agency.markModified('businessHours');
  }

  if (patch.notifications) {
    const current = agency.notifications;
    if (current) {
      if (patch.notifications.quietHoursEnabled !== undefined) {
        current.quietHoursEnabled = patch.notifications.quietHoursEnabled;
      }
      if (patch.notifications.quietHoursStart !== undefined) {
        current.quietHoursStart = patch.notifications.quietHoursStart;
      }
      if (patch.notifications.quietHoursEnd !== undefined) {
        current.quietHoursEnd = patch.notifications.quietHoursEnd;
      }
      if (patch.notifications.email) {
        for (const key of NOTIFICATION_PREFERENCE_KEYS) {
          const value = patch.notifications.email[key];
          if (value !== undefined) current.email[key] = value;
        }
        agency.markModified('notifications.email');
      }
      agency.markModified('notifications');
    }
  }

  agency.updatedBy = patch.actorUserId;
  await agency.save();

  await recordActivity({
    agencyId: agency._id,
    actorUserId: patch.actorUserId,
    actorRole: 'AGENCY_ADMIN',
    action: 'agency.settings.update',
    entity: 'Agency',
    entityId: agency._id,
    summary: 'Updated agency settings',
    meta: { fields: Object.keys(patch) }
  });

  return agency;
};

/**
 * Public agency profile. Only presentation-safe fields are projected: the
 * selection deliberately omits `orderSettings` (internal commercial rules) and
 * `notifications` (internal routing), and nothing secret is ever stored here.
 */
export const publicAgencyProfile = async () => {
  const agency = await AgencyModel.findOne({ status: 'ACTIVE' })
    .select('name slug legalName logoUrl website description contact tax features businessHours status')
    .lean();
  if (!agency) return null;
  return {
    _id: agency._id,
    id: agency._id,
    name: agency.name,
    slug: agency.slug,
    legalName: agency.legalName,
    logoUrl: agency.logoUrl,
    website: agency.website,
    description: agency.description,
    contact: agency.contact,
    tax: { gstNumber: agency.tax.gstNumber, defaultTaxRate: agency.tax.defaultTaxRate, pricesIncludeTax: agency.tax.pricesIncludeTax },
    features: { uploadsEnabled: agency.features.uploadsEnabled, aiEnabled: agency.features.aiEnabled },
    businessHours: agency.businessHours ?? {},
    status: agency.status
  };
};

/** Creates the first agency (bootstrap) or an additional one. */
export const createAgency = async (input: {
  name: string;
  slug: string;
  legalName?: string;
  contactEmail: string;
  contactPhone: string;
  address: IAgency['contact']['address'];
  createdBy?: import('mongoose').Types.ObjectId;
}): Promise<IAgency> => {
  const agency = await AgencyModel.create({
    name: input.name.trim(),
    slug: input.slug.trim().toLowerCase(),
    legalName: input.legalName,
    status: 'ACTIVE',
    contact: {
      email: input.contactEmail.toLowerCase().trim(),
      phone: input.contactPhone.trim(),
      address: input.address
    },
    createdBy: input.createdBy
  });

  await nextSequence(agency._id, 'order', new Date().getUTCFullYear());
  return agency;
};

export const taxPreview = (subtotal: number, taxRate: number, includesTax: boolean) => {
  if (includesTax) {
    const base = round2(subtotal / (1 + taxRate / 100));
    return { taxableValue: base, taxAmount: round2(subtotal - base), total: round2(subtotal) };
  }
  const tax = round2((subtotal * taxRate) / 100);
  return { taxableValue: round2(subtotal), taxAmount: tax, total: round2(subtotal + tax) };
};
