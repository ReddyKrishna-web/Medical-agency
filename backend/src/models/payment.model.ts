import { Schema, model, models, type Model, type Types } from 'mongoose';
import { tenantPlugin } from './plugins/tenant.plugin';
import { PAYMENT_METHODS, type PaymentMethod } from '../constants/domain';

export interface IPayment {
  _id: Types.ObjectId;
  agencyId: Types.ObjectId;
  reference: string;
  invoiceId?: Types.ObjectId;
  invoiceNumber?: string;
  orderId?: Types.ObjectId;
  orderNumber?: string;
  customerId: Types.ObjectId;
  customerUserId: Types.ObjectId;
  amount: number;
  method: PaymentMethod;
  paidAt: Date;
  note?: string;
  recordedBy: Types.ObjectId;
  idempotencyKey?: string;
  createdAt: Date;
  updatedAt: Date;
}

const paymentSchema = new Schema<IPayment>(
  {
    agencyId: { type: Schema.Types.ObjectId, ref: 'Agency', required: true },
    reference: { type: String, required: true, trim: true, uppercase: true, maxlength: 64 },
    invoiceId: { type: Schema.Types.ObjectId, ref: 'Invoice' },
    invoiceNumber: { type: String, trim: true },
    orderId: { type: Schema.Types.ObjectId, ref: 'Order' },
    orderNumber: { type: String, trim: true },
    customerId: { type: Schema.Types.ObjectId, ref: 'Customer', required: true },
    customerUserId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    amount: { type: Number, required: true, min: 0.01 },
    method: { type: String, enum: PAYMENT_METHODS, required: true },
    paidAt: { type: Date, default: () => new Date() },
    note: { type: String, trim: true, maxlength: 500 },
    recordedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    idempotencyKey: { type: String, trim: true, maxlength: 120 }
  },
  { timestamps: true, versionKey: false }
);

paymentSchema.index({ agencyId: 1, reference: 1 }, { unique: true });
paymentSchema.index({ agencyId: 1, invoiceId: 1, paidAt: -1 });
paymentSchema.index({ agencyId: 1, customerId: 1, paidAt: -1 });
paymentSchema.index({ agencyId: 1, paidAt: -1 });

paymentSchema.plugin(tenantPlugin);

export const PaymentModel: Model<IPayment> =
  (models.Payment as Model<IPayment>) ?? model<IPayment>('Payment', paymentSchema);

export default PaymentModel;
