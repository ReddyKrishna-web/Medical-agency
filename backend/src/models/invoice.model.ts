import { Schema, model, models, type Model, type Types } from 'mongoose';
import { tenantPlugin } from './plugins/tenant.plugin';
import { INVOICE_STATUSES, type InvoiceStatus } from '../constants/domain';

export interface IInvoiceLine {
  productId: Types.ObjectId;
  productName: string;
  sku: string;
  unit: string;
  quantity: number;
  unitPrice: number;
  taxRate: number;
  taxAmount: number;
  lineTotal: number;
}

export interface IInvoice {
  _id: Types.ObjectId;
  agencyId: Types.ObjectId;
  invoiceNumber: string;
  invoiceYear: number;
  orderId: Types.ObjectId;
  orderNumber: string;
  customerId: Types.ObjectId;
  customerUserId: Types.ObjectId;
  customerName: string;
  customerPhone?: string;
  customerGstNumber?: string;
  agencySnapshot: {
    name: string;
    legalName?: string;
    gstNumber?: string;
    email: string;
    phone: string;
    address: {
      line1: string;
      line2?: string;
      city: string;
      state: string;
      country: string;
      postalCode: string;
    };
  };
  lines: IInvoiceLine[];
  currency: string;
  subtotal: number;
  taxTotal: number;
  grandTotal: number;
  amountPaid: number;
  amountDue: number;
  status: InvoiceStatus;
  issuedAt: Date;
  dueAt?: Date;
  paymentTermsDays: number;
  voidedAt?: Date;
  voidedBy?: Types.ObjectId;
  voidReason?: string;
  createdAt: Date;
  updatedAt: Date;
}

const invoiceLineSchema = new Schema<IInvoiceLine>(
  {
    productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
    productName: { type: String, required: true },
    sku: { type: String, required: true },
    unit: { type: String, required: true },
    quantity: { type: Number, required: true, min: 1 },
    unitPrice: { type: Number, required: true, min: 0 },
    taxRate: { type: Number, required: true, min: 0 },
    taxAmount: { type: Number, required: true, min: 0 },
    lineTotal: { type: Number, required: true, min: 0 }
  },
  { _id: false }
);

const invoiceSchema = new Schema<IInvoice>(
  {
    agencyId: { type: Schema.Types.ObjectId, ref: 'Agency', required: true },
    invoiceNumber: { type: String, required: true, trim: true, uppercase: true },
    invoiceYear: { type: Number, required: true, min: 2000, max: 2999 },
    orderId: { type: Schema.Types.ObjectId, ref: 'Order', required: true },
    orderNumber: { type: String, required: true },
    customerId: { type: Schema.Types.ObjectId, ref: 'Customer', required: true },
    customerUserId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    customerName: { type: String, required: true },
    customerPhone: { type: String },
    customerGstNumber: { type: String },
    // Immutable agency snapshot so a printed invoice never changes retroactively.
    agencySnapshot: {
      name: { type: String, required: true },
      legalName: { type: String },
      gstNumber: { type: String },
      email: { type: String, required: true },
      phone: { type: String, required: true },
      address: {
        line1: { type: String, required: true },
        line2: { type: String },
        city: { type: String, required: true },
        state: { type: String, required: true },
        country: { type: String, required: true },
        postalCode: { type: String, required: true }
      }
    },
    lines: { type: [invoiceLineSchema], required: true },
    currency: { type: String, default: 'INR' },
    subtotal: { type: Number, required: true, min: 0 },
    taxTotal: { type: Number, required: true, min: 0 },
    grandTotal: { type: Number, required: true, min: 0 },
    amountPaid: { type: Number, default: 0, min: 0 },
    amountDue: { type: Number, default: 0, min: 0 },
    status: { type: String, enum: INVOICE_STATUSES, default: 'ISSUED', index: true },
    issuedAt: { type: Date, default: () => new Date() },
    dueAt: { type: Date },
    paymentTermsDays: { type: Number, default: 0, min: 0 },
    voidedAt: { type: Date },
    voidedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    voidReason: { type: String, trim: true, maxlength: 500 }
  },
  { timestamps: true, versionKey: false }
);

invoiceSchema.index({ agencyId: 1, invoiceNumber: 1 }, { unique: true });
invoiceSchema.index({ agencyId: 1, orderId: 1 }, { unique: true });
invoiceSchema.index({ agencyId: 1, customerId: 1, issuedAt: -1 });
invoiceSchema.index({ agencyId: 1, status: 1, issuedAt: -1 });

invoiceSchema.plugin(tenantPlugin);

export const InvoiceModel: Model<IInvoice> =
  (models.Invoice as Model<IInvoice>) ?? model<IInvoice>('Invoice', invoiceSchema);

export default InvoiceModel;
