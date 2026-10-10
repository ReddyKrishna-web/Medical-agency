import { Schema, model, models, type Model, type SchemaDefinitionProperty, type Types } from 'mongoose';
import { tenantPlugin, applyJsonTransform } from './plugins/tenant.plugin';
import {
  ORDER_SOURCES,
  ORDER_STATUSES,
  type OrderSource,
  type OrderStatus
} from '../constants/domain';
import type { Role } from '../constants/domain';

export interface IOrderAllocation {
  batchId: Types.ObjectId;
  inventoryId: Types.ObjectId;
  batchNumber: string;
  expiryDate: Date;
  quantity: number;
  committedQuantity: number;
  releasedQuantity: number;
}

export interface IOrderItem {
  productId: Types.ObjectId;
  productName: string;
  sku: string;
  unit: string;
  quantity: number;
  /** Snapshot of server-authoritative pricing at order time. */
  unitPrice: number;
  taxRate: number;
  lineSubtotal: number;
  taxAmount: number;
  lineTotal: number;
  allocations: IOrderAllocation[];
}

export interface IOrderTimelineEntry {
  from: OrderStatus | null;
  to: OrderStatus;
  at: Date;
  byUserId?: Types.ObjectId;
  byRole?: Role;
  note?: string;
}

export interface IOrderCancellation {
  reason: string;
  at: Date;
  byUserId?: Types.ObjectId;
  stockDisposition: 'NOT_ALLOCATED' | 'RELEASED' | 'RESTORED';
}

export interface IOrder {
  _id: Types.ObjectId;
  agencyId: Types.ObjectId;
  orderNumber: string;
  orderYear: number;
  customerId: Types.ObjectId;
  customerUserId: Types.ObjectId;
  customerName: string;
  salesmanId?: Types.ObjectId;
  salesmanUserId?: Types.ObjectId;
  items: IOrderItem[];
  status: OrderStatus;
  statusTimestamps: Map<string, Date>;
  timeline: IOrderTimelineEntry[];
  currency: string;
  subtotal: number;
  taxTotal: number;
  grandTotal: number;
  source: OrderSource;
  requirementUploadId?: Types.ObjectId;
  reorderedFromOrderId?: Types.ObjectId;
  notes?: string;
  internalNotes?: string;
  customerNotes?: string;
  allocationState: 'NONE' | 'RESERVED' | 'COMMITTED' | 'RELEASED';
  allocatedAt?: Date;
  committedAt?: Date;
  cancellation?: IOrderCancellation;
  invoiceId?: Types.ObjectId;
  deliveredAt?: Date;
  idempotencyKey?: string;
  createdBy?: Types.ObjectId;
  updatedBy?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const allocationSchema = new Schema<IOrderAllocation>(
  {
    batchId: { type: Schema.Types.ObjectId, ref: 'Batch', required: true },
    inventoryId: { type: Schema.Types.ObjectId, ref: 'Inventory', required: true },
    batchNumber: { type: String, required: true },
    expiryDate: { type: Date, required: true },
    quantity: { type: Number, required: true, min: 1 },
    committedQuantity: { type: Number, default: 0, min: 0 },
    releasedQuantity: { type: Number, default: 0, min: 0 }
  },
  { _id: false }
);

const orderItemSchema = new Schema<IOrderItem>(
  {
    productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
    productName: { type: String, required: true },
    sku: { type: String, required: true },
    unit: { type: String, required: true },
    quantity: { type: Number, required: true, min: 1 },
    unitPrice: { type: Number, required: true, min: 0 },
    taxRate: { type: Number, required: true, min: 0, max: 100 },
    lineSubtotal: { type: Number, required: true, min: 0 },
    taxAmount: { type: Number, required: true, min: 0 },
    lineTotal: { type: Number, required: true, min: 0 },
    allocations: { type: [allocationSchema], default: [] }
  },
  { _id: false }
);

const timelineSchema = new Schema<IOrderTimelineEntry>(
  {
    from: { type: String, enum: [...ORDER_STATUSES, null] },
    to: { type: String, enum: ORDER_STATUSES, required: true },
    at: { type: Date, required: true, default: () => new Date() },
    byUserId: { type: Schema.Types.ObjectId, ref: 'User' },
    byRole: { type: String, enum: ['CUSTOMER', 'SALESMAN', 'AGENCY_ADMIN'] },
    note: { type: String, trim: true, maxlength: 500 }
  },
  { _id: false }
);

const orderSchema = new Schema<IOrder>(
  {
    agencyId: { type: Schema.Types.ObjectId, ref: 'Agency', required: true },
    // Human readable and agency-scoped unique: SM-2026-000001
    orderNumber: { type: String, required: true, trim: true, uppercase: true },
    orderYear: { type: Number, required: true, min: 2000, max: 2999 },
    customerId: { type: Schema.Types.ObjectId, ref: 'Customer', required: true },
    customerUserId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    customerName: { type: String, required: true, trim: true, maxlength: 160 },
    salesmanId: { type: Schema.Types.ObjectId, ref: 'Salesman' },
    salesmanUserId: { type: Schema.Types.ObjectId, ref: 'User' },
    items: {
      type: [orderItemSchema],
      required: true,
      validate: {
        validator: (items: IOrderItem[]) => Array.isArray(items) && items.length > 0 && items.length <= 200,
        message: 'An order must contain between 1 and 200 line items'
      }
    },
    status: { type: String, enum: ORDER_STATUSES, default: 'PENDING', required: true },
    statusTimestamps: {
      type: Map,
      of: Date,
      default: () => ({ PENDING: new Date() })
    } as unknown as SchemaDefinitionProperty<Map<string, Date>>,
    timeline: { type: [timelineSchema], default: [] },
    currency: { type: String, default: 'INR', uppercase: true, maxlength: 8 },
    subtotal: { type: Number, required: true, min: 0 },
    taxTotal: { type: Number, required: true, min: 0 },
    grandTotal: { type: Number, required: true, min: 0 },
    source: { type: String, enum: ORDER_SOURCES, required: true },
    requirementUploadId: { type: Schema.Types.ObjectId, ref: 'RequirementUpload' },
    reorderedFromOrderId: { type: Schema.Types.ObjectId, ref: 'Order' },
    notes: { type: String, trim: true, maxlength: 2000 },
    internalNotes: { type: String, trim: true, maxlength: 2000 },
    customerNotes: { type: String, trim: true, maxlength: 2000 },
    allocationState: {
      type: String,
      enum: ['NONE', 'RESERVED', 'COMMITTED', 'RELEASED'],
      default: 'NONE'
    },
    allocatedAt: { type: Date },
    committedAt: { type: Date },
    cancellation: {
      reason: { type: String, trim: true, maxlength: 500 },
      at: { type: Date },
      byUserId: { type: Schema.Types.ObjectId, ref: 'User' },
      stockDisposition: {
        type: String,
        enum: ['NOT_ALLOCATED', 'RELEASED', 'RESTORED'],
        default: 'NOT_ALLOCATED'
      }
    },
    invoiceId: { type: Schema.Types.ObjectId, ref: 'Invoice' },
    deliveredAt: { type: Date },
    idempotencyKey: { type: String, trim: true, maxlength: 120 },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User' }
  },
  { timestamps: true, versionKey: false }
);

orderSchema.index({ agencyId: 1, orderNumber: 1 }, { unique: true });
orderSchema.index({ agencyId: 1, status: 1, createdAt: -1 });
orderSchema.index({ agencyId: 1, customerId: 1, createdAt: -1 });
orderSchema.index({ agencyId: 1, salesmanId: 1, createdAt: -1 });
orderSchema.index({ agencyId: 1, 'items.productId': 1 });

orderSchema.plugin(tenantPlugin);

applyJsonTransform(orderSchema, {
  transform: (_doc, ret) => {
    ret.id = String(ret._id);
    delete ret.__v;
    return ret;
  }
});

export const OrderModel: Model<IOrder> = (models.Order as Model<IOrder>) ?? model<IOrder>('Order', orderSchema);

export default OrderModel;
