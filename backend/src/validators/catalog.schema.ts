import { z } from 'zod';
import { PRODUCT_AVAILABILITIES } from '../constants/domain';
import {
  moneyField,
  nonNegativeQuantity,
  objectId,
  optionalBoolean,
  quantityField,
  trimmed
} from './common.schema';

export const productListSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(120).optional(),
  sort: z.string().trim().max(120).optional(),
  categoryId: objectId.optional(),
  brand: z.string().trim().min(1).max(120).optional(),
  manufacturer: z.string().trim().min(1).max(160).optional(),
  availability: z.enum(PRODUCT_AVAILABILITIES).optional(),
  isActive: optionalBoolean,
  isFeatured: optionalBoolean,
  includeInactive: optionalBoolean,
  minPrice: z.coerce.number().min(0).optional(),
  maxPrice: z.coerce.number().min(0).optional()
});

const productFields = z.object({
  name: trimmed(2, 180),
  sku: trimmed(2, 64).optional(),
  categoryId: objectId.optional(),
  brand: trimmed(1, 120).optional(),
  genericName: trimmed(1, 160).optional(),
  manufacturer: trimmed(1, 160).optional(),
  description: trimmed(1, 2000).optional(),
  hsnCode: trimmed(1, 16).optional(),
  mrp: moneyField.optional(),
  price: moneyField,
  taxRate: z.coerce.number().min(0).max(100),
  unit: trimmed(1, 24),
  packSize: trimmed(1, 60).optional(),
  reorderLevel: nonNegativeQuantity.optional(),
  minOrderQuantity: quantityField.optional(),
  maxOrderQuantity: quantityField.optional(),
  imageUrl: z.string().trim().url().max(500).optional(),
  tags: z.array(z.string().trim().min(1).max(40)).max(20).optional(),
  isFeatured: z.boolean().optional(),
  isActive: z.boolean().optional()
});

export const createProductSchema = productFields
  .refine((value) => value.mrp === undefined || value.mrp >= value.price, {
    message: 'MRP cannot be lower than the selling price',
    path: ['mrp']
  })
  .refine(
    (value) =>
      value.maxOrderQuantity === undefined ||
      value.minOrderQuantity === undefined ||
      value.maxOrderQuantity >= value.minOrderQuantity,
    { message: 'maxOrderQuantity must be greater than or equal to minOrderQuantity', path: ['maxOrderQuantity'] }
  );

/**
 * On a partial update only the supplied fields are known here, so the
 * `mrp >= price` rule is enforced in the service against the merged document.
 */
export const updateProductSchema = productFields
  .partial()
  .refine((value) => Object.keys(value).length > 0, { message: 'Provide at least one field to update' });

export const categoryListSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  search: z.string().trim().max(120).optional(),
  sort: z.string().trim().max(120).optional(),
  parentId: objectId.optional(),
  isActive: optionalBoolean
});

export const createCategorySchema = z.object({
  name: trimmed(2, 120),
  description: trimmed(1, 1000).optional(),
  parentId: objectId.optional(),
  displayOrder: z.coerce.number().int().min(0).max(10_000).optional(),
  imageUrl: z.string().trim().url().max(500).optional(),
  isActive: z.boolean().optional()
});

export const updateCategorySchema = createCategorySchema
  .partial()
  .refine((value) => Object.keys(value).length > 0, { message: 'Provide at least one field to update' });

export const receiveStockSchema = z.object({
  productId: objectId,
  batchNumber: trimmed(2, 64),
  quantity: quantityField,
  unitCost: moneyField.optional(),
  expiryDate: z.string().min(4, 'Expiry date is required'),
  mfgDate: z.string().optional(),
  supplier: trimmed(1, 160).optional(),
  manufacturer: trimmed(1, 120).optional(),
  location: trimmed(1, 120).optional(),
  reorderLevel: nonNegativeQuantity.optional(),
  note: trimmed(1, 500).optional()
});

export const adjustStockSchema = z.object({
  inventoryId: objectId,
  delta: z.coerce
    .number()
    .int('Adjustment must be a whole number of units')
    .min(-1_000_000)
    .max(1_000_000)
    .refine((value) => value !== 0, 'Adjustment must not be zero'),
  reason: trimmed(3, 300),
  note: trimmed(1, 500).optional()
});

export const inventoryListSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(20),
  search: z.string().trim().max(120).optional(),
  sort: z.string().trim().max(120).optional(),
  productId: objectId.optional(),
  batchId: objectId.optional(),
  lowStock: optionalBoolean,
  outOfStock: optionalBoolean,
  expiring: optionalBoolean,
  expired: optionalBoolean
});

export const movementListSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(25),
  search: z.string().trim().max(120).optional(),
  sort: z.string().trim().max(120).optional(),
  productId: objectId.optional(),
  batchId: objectId.optional(),
  type: z.string().trim().max(32).optional(),
  referenceType: z.string().trim().max(32).optional(),
  referenceId: objectId.optional(),
  from: z.string().optional(),
  to: z.string().optional()
});

export const batchListSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(20),
  search: z.string().trim().max(120).optional(),
  sort: z.string().trim().max(120).optional(),
  productId: objectId.optional(),
  status: z.enum(['ACTIVE', 'EXPIRED', 'DEPLETED', 'QUARANTINED']).optional(),
  expiring: optionalBoolean,
  expired: optionalBoolean
});

export const updateBatchSchema = z
  .object({
    supplier: trimmed(1, 160).optional(),
    manufacturer: trimmed(1, 120).optional(),
    location: trimmed(1, 120).optional(),
    note: trimmed(1, 500).optional(),
    isActive: z.boolean().optional()
  })
  .refine((value) => Object.keys(value).length > 0, { message: 'Provide at least one field to update' });

export const validateOrderSchema = z.object({
  items: z
    .array(
      z.object({
        productId: objectId,
        quantity: quantityField
      })
    )
    .min(1, 'At least one item is required')
    .max(200)
});
