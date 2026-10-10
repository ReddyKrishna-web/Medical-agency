import { Schema, model, models, type Model, type Types } from 'mongoose';
import { tenantPlugin } from './plugins/tenant.plugin';
import { REQUIREMENT_STATUSES, type RequirementStatus } from '../constants/domain';

export interface IRequirementFile {
  storageProvider: 'local' | 's3';
  storageKey: string;
  originalName: string;
  mimeType: string;
  extension: string;
  sizeBytes: number;
  checksumSha256: string;
  uploadedAt: Date;
}

export interface IExtractedRequirementItem {
  rawText: string;
  rawQuantity?: number;
  quantity?: number;
  productId?: Types.ObjectId;
  productName?: string;
  sku?: string;
  confidence: number;
  needsVerification: boolean;
  reason?: string;
}

export interface IRequirementExtraction {
  status: 'NOT_REQUESTED' | 'PENDING' | 'NEEDS_REVIEW' | 'COMPLETE' | 'FAILED';
  provider?: 'deterministic-csv' | 'openai-compatible';
  model?: string;
  requestedBy?: Types.ObjectId;
  requestedAt?: Date;
  completedAt?: Date;
  items: IExtractedRequirementItem[];
  errorCode?: string;
}

export interface IRequirementUpload {
  _id: Types.ObjectId;
  agencyId: Types.ObjectId;
  customerId: Types.ObjectId;
  customerUserId: Types.ObjectId;
  title: string;
  notes?: string;
  file: IRequirementFile;
  status: RequirementStatus;
  review: {
    byUserId?: Types.ObjectId;
    at?: Date;
    note?: string;
  };
  extraction: IRequirementExtraction;
  convertedOrderId?: Types.ObjectId;
  createdBy?: Types.ObjectId;
  updatedBy?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const fileSchema = new Schema<IRequirementFile>(
  {
    storageProvider: { type: String, enum: ['local', 's3'], required: true },
    // Random, non-guessable key. Never a user supplied filename.
    storageKey: { type: String, required: true, maxlength: 400 },
    originalName: { type: String, required: true, maxlength: 255 },
    mimeType: { type: String, required: true, maxlength: 120 },
    extension: { type: String, required: true, maxlength: 10 },
    sizeBytes: { type: Number, required: true, min: 1 },
    checksumSha256: { type: String, required: true, maxlength: 64 },
    uploadedAt: { type: Date, default: () => new Date() }
  },
  { _id: false }
);

const extractedItemSchema = new Schema<IExtractedRequirementItem>(
  {
    rawText: { type: String, required: true, trim: true, maxlength: 500 },
    rawQuantity: { type: Number, min: 0 },
    quantity: { type: Number, min: 1, max: 1_000_000 },
    productId: { type: Schema.Types.ObjectId, ref: 'Product' },
    productName: { type: String, trim: true, maxlength: 180 },
    sku: { type: String, trim: true, maxlength: 64 },
    confidence: { type: Number, required: true, min: 0, max: 1 },
    needsVerification: { type: Boolean, required: true },
    reason: { type: String, trim: true, maxlength: 300 }
  },
  { _id: true, timestamps: false }
);

const extractionSchema = new Schema<IRequirementExtraction>(
  {
    status: {
      type: String,
      enum: ['NOT_REQUESTED', 'PENDING', 'NEEDS_REVIEW', 'COMPLETE', 'FAILED'],
      default: 'NOT_REQUESTED'
    },
    provider: { type: String, enum: ['deterministic-csv', 'openai-compatible'] },
    model: { type: String, maxlength: 120 },
    requestedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    requestedAt: { type: Date },
    completedAt: { type: Date },
    items: { type: [extractedItemSchema], default: [] },
    errorCode: { type: String, maxlength: 60 }
  },
  { _id: false, timestamps: false }
);

const requirementSchema = new Schema<IRequirementUpload>(
  {
    agencyId: { type: Schema.Types.ObjectId, ref: 'Agency', required: true },
    customerId: { type: Schema.Types.ObjectId, ref: 'Customer', required: true },
    customerUserId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    title: { type: String, required: true, trim: true, maxlength: 160 },
    notes: { type: String, trim: true, maxlength: 2000 },
    file: { type: fileSchema, required: true },
    status: { type: String, enum: REQUIREMENT_STATUSES, default: 'SUBMITTED', index: true },
    review: {
      byUserId: { type: Schema.Types.ObjectId, ref: 'User' },
      at: { type: Date },
      note: { type: String, trim: true, maxlength: 1000 }
    },
    extraction: { type: extractionSchema, default: () => ({ status: 'NOT_REQUESTED', items: [] }) },
    convertedOrderId: { type: Schema.Types.ObjectId, ref: 'Order' },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User' }
  },
  { timestamps: true, versionKey: false }
);

requirementSchema.index({ agencyId: 1, customerId: 1, createdAt: -1 });
requirementSchema.index({ agencyId: 1, status: 1, createdAt: -1 });
requirementSchema.index({ agencyId: 1, checksumSha256: 1 });

requirementSchema.plugin(tenantPlugin);

export const RequirementUploadModel: Model<IRequirementUpload> =
  (models.RequirementUpload as Model<IRequirementUpload>) ??
  model<IRequirementUpload>('RequirementUpload', requirementSchema);

export default RequirementUploadModel;
