import { Schema, model, models, type Model, type Types } from 'mongoose';
import { tenantPlugin } from './plugins/tenant.plugin';

export interface ICategory {
  _id: Types.ObjectId;
  agencyId: Types.ObjectId;
  name: string;
  slug: string;
  description?: string;
  parentId?: Types.ObjectId;
  displayOrder: number;
  isActive: boolean;
  imageUrl?: string;
  createdBy?: Types.ObjectId;
  updatedBy?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const categorySchema = new Schema<ICategory>(
  {
    agencyId: { type: Schema.Types.ObjectId, ref: 'Agency', required: true },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    slug: { type: String, required: true, trim: true, lowercase: true, maxlength: 140 },
    description: { type: String, trim: true, maxlength: 1000 },
    parentId: { type: Schema.Types.ObjectId, ref: 'Category' },
    displayOrder: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
    imageUrl: { type: String, trim: true, maxlength: 500 },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User' }
  },
  { timestamps: true, versionKey: false }
);

categorySchema.index({ agencyId: 1, slug: 1 }, { unique: true });
categorySchema.index({ agencyId: 1, parentId: 1, displayOrder: 1 });

categorySchema.plugin(tenantPlugin);

export const CategoryModel: Model<ICategory> =
  (models.Category as Model<ICategory>) ?? model<ICategory>('Category', categorySchema);

export default CategoryModel;
