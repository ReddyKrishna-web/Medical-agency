import { Schema, model, models, type Model, type Types } from 'mongoose';
import { tenantPlugin } from './plugins/tenant.plugin';

export interface IProduct {
  _id: Types.ObjectId;
  agencyId: Types.ObjectId;
  categoryId?: Types.ObjectId;
  name: string;
  slug: string;
  /** Business product code, unique per agency. */
  sku: string;
  brand?: string;
  /** Salt composition the item is dispensed as, e.g. "Amoxicillin". */
  genericName?: string;
  /** Company that manufactures the item, e.g. "Sun Pharma". */
  manufacturer?: string;
  description?: string;
  hsnCode?: string;
  /** Listed maximum retail price. Informational only: it never drives order pricing. */
  mrp?: number;
  /** Authoritative selling unit price (server owned; clients can never set it). */
  price: number;
  taxRate: number;
  unit: string;
  packSize?: string;
  /** Catalogue level restock trigger, distinct from a per-batch inventory row. */
  reorderLevel: number;
  minOrderQuantity: number;
  maxOrderQuantity?: number;
  imageUrl?: string;
  tags: string[];
  isActive: boolean;
  isFeatured: boolean;
  createdBy?: Types.ObjectId;
  updatedBy?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const productSchema = new Schema<IProduct>(
  {
    agencyId: { type: Schema.Types.ObjectId, ref: 'Agency', required: true },
    categoryId: { type: Schema.Types.ObjectId, ref: 'Category', index: true },
    name: { type: String, required: true, trim: true, maxlength: 180 },
    slug: { type: String, required: true, trim: true, lowercase: true, maxlength: 200 },
    sku: { type: String, required: true, trim: true, uppercase: true, maxlength: 64 },
    brand: { type: String, trim: true, maxlength: 120 },
    genericName: { type: String, trim: true, maxlength: 160 },
    manufacturer: { type: String, trim: true, maxlength: 160 },
    description: { type: String, trim: true, maxlength: 2000 },
    hsnCode: { type: String, trim: true, maxlength: 16 },
    mrp: { type: Number, min: 0, max: 10_000_000 },
    price: { type: Number, required: true, min: 0, max: 10_000_000 },
    taxRate: { type: Number, required: true, min: 0, max: 100 },
    unit: { type: String, required: true, trim: true, uppercase: true, maxlength: 24, default: 'UNIT' },
    packSize: { type: String, trim: true, maxlength: 60 },
    reorderLevel: { type: Number, default: 0, min: 0, max: 1_000_000 },
    minOrderQuantity: { type: Number, default: 1, min: 1, max: 100000 },
    maxOrderQuantity: { type: Number, min: 1, max: 1000000 },
    imageUrl: { type: String, trim: true, maxlength: 500 },
    tags: { type: [String], default: [] },
    isActive: { type: Boolean, default: true, index: true },
    isFeatured: { type: Boolean, default: false },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User' }
  },
  { timestamps: true, versionKey: false }
);

productSchema.index({ agencyId: 1, sku: 1 }, { unique: true });
productSchema.index({ agencyId: 1, categoryId: 1, isActive: 1 });
productSchema.index({ agencyId: 1, name: 1 });
productSchema.index({ agencyId: 1, price: 1 });
// Support the catalogue facet filters (brand/manufacturer) and generic-name search.
productSchema.index({ agencyId: 1, brand: 1, isActive: 1 });
productSchema.index({ agencyId: 1, manufacturer: 1, isActive: 1 });
productSchema.index({ agencyId: 1, genericName: 1 });

productSchema.plugin(tenantPlugin);

export const ProductModel: Model<IProduct> =
  (models.Product as Model<IProduct>) ?? model<IProduct>('Product', productSchema);

export default ProductModel;
