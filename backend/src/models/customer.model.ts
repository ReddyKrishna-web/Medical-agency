import { Schema, model, models, type Model, type Types } from 'mongoose';
import { tenantPlugin } from './plugins/tenant.plugin';
import { CUSTOMER_STATUSES, type CustomerStatus } from '../constants/domain';
import type { AgencyAddress } from './agency.model';
import type { Role } from '../constants/domain';

export interface ICustomerNote {
  text: string;
  byUserId: Types.ObjectId;
  byRole: Role;
  at: Date;
}

export interface ICustomer {
  _id: Types.ObjectId;
  agencyId: Types.ObjectId;
  userId: Types.ObjectId;
  businessName: string;
  ownerName: string;
  phone: string;
  alternatePhone?: string;
  email?: string;
  gstNumber?: string;
  drugLicenseNumber?: string;
  shopType?: string;
  address: AgencyAddress;
  creditLimit: number;
  creditUsed: number;
  status: CustomerStatus;
  statusNote?: string;
  approvedAt?: Date;
  approvedBy?: Types.ObjectId;
  /** Salesman document id responsible for this account. */
  assignedSalesmanId?: Types.ObjectId;
  notes?: string;
  accountNotes: ICustomerNote[];
  lastContactAt?: Date;
  lastContactType?: 'NOTE' | 'MESSAGE' | 'FOLLOW_UP' | 'ORDER' | 'CALL';
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

const customerNoteSchema = new Schema<ICustomerNote>(
  {
    text: { type: String, required: true, trim: true, maxlength: 1000 },
    byUserId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    byRole: { type: String, enum: ['CUSTOMER', 'SALESMAN', 'AGENCY_ADMIN'], required: true },
    at: { type: Date, default: () => new Date(), required: true }
  },
  { _id: true, timestamps: false }
);

const customerSchema = new Schema<ICustomer>(
  {
    agencyId: { type: Schema.Types.ObjectId, ref: 'Agency', required: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    businessName: { type: String, required: true, trim: true, maxlength: 160 },
    ownerName: { type: String, required: true, trim: true, maxlength: 120 },
    phone: { type: String, required: true, trim: true, maxlength: 32 },
    alternatePhone: { type: String, trim: true, maxlength: 32 },
    email: { type: String, trim: true, lowercase: true, maxlength: 160 },
    gstNumber: { type: String, trim: true, uppercase: true, maxlength: 32 },
    drugLicenseNumber: { type: String, trim: true, maxlength: 64 },
    shopType: { type: String, trim: true, maxlength: 80 },
    address: { type: addressSchema, required: true },
    creditLimit: { type: Number, default: 0, min: 0 },
    creditUsed: { type: Number, default: 0, min: 0 },
    status: { type: String, enum: CUSTOMER_STATUSES, default: 'PENDING', required: true },
    statusNote: { type: String, trim: true, maxlength: 500 },
    approvedAt: { type: Date },
    approvedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    assignedSalesmanId: { type: Schema.Types.ObjectId, ref: 'Salesman', index: true },
    notes: { type: String, trim: true, maxlength: 1000 },
    accountNotes: { type: [customerNoteSchema], default: [] },
    lastContactAt: { type: Date },
    lastContactType: { type: String, enum: ['NOTE', 'MESSAGE', 'FOLLOW_UP', 'ORDER', 'CALL'] },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User' }
  },
  { timestamps: true, versionKey: false }
);

customerSchema.index({ agencyId: 1, userId: 1 }, { unique: true });
customerSchema.index({ agencyId: 1, status: 1, createdAt: -1 });
customerSchema.index({ agencyId: 1, assignedSalesmanId: 1, status: 1 });
customerSchema.index({ agencyId: 1, businessName: 1 });
customerSchema.index({ agencyId: 1, lastContactAt: -1 });

customerSchema.plugin(tenantPlugin);

export const CustomerModel: Model<ICustomer> =
  (models.Customer as Model<ICustomer>) ?? model<ICustomer>('Customer', customerSchema);

export default CustomerModel;
