import { Types, type FilterQuery } from 'mongoose';
import { ProductModel, type IProduct } from '../models/product.model';
import { CategoryModel } from '../models/category.model';
import { InventoryModel } from '../models/inventory.model';
import { AgencyModel } from '../models/agency.model';
import { AppError } from '../utils/errors';
import { round2 } from '../utils/numbers';
import { recordActivity } from './activity.service';
import type { ProductAvailability } from '../constants/domain';

export const slugify = (value: string): string =>
  value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 180);

export interface ProductListFilters {
  search?: string;
  categoryId?: string;
  brand?: string;
  manufacturer?: string;
  availability?: ProductAvailability;
  isActive?: boolean;
  isFeatured?: boolean;
  minPrice?: number;
  maxPrice?: number;
  includeInactive: boolean;
  sort?: Record<string, 1 | -1>;
  skip: number;
  limit: number;
}

/** Escape a user supplied term before it is embedded in a RegExp. */
const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const buildProductFilter = (
  agencyId: Types.ObjectId,
  filters: ProductListFilters
): FilterQuery<Record<string, unknown>> => {
  const filter: FilterQuery<Record<string, unknown>> = { agencyId };
  if (!filters.includeInactive) filter.isActive = true;
  if (filters.isActive !== undefined) filter.isActive = filters.isActive;
  if (filters.isFeatured !== undefined) filter.isFeatured = filters.isFeatured;
  if (filters.categoryId) filter.categoryId = filters.categoryId;
  if (filters.brand) filter.brand = new RegExp(`^${escapeRegExp(filters.brand.trim())}$`, 'i');
  if (filters.manufacturer) {
    filter.manufacturer = new RegExp(`^${escapeRegExp(filters.manufacturer.trim())}$`, 'i');
  }
  if (filters.minPrice !== undefined || filters.maxPrice !== undefined) {
    filter.price = {
      ...(filters.minPrice !== undefined ? { $gte: filters.minPrice } : {}),
      ...(filters.maxPrice !== undefined ? { $lte: filters.maxPrice } : {})
    };
  }
  if (filters.search) {
    const expression = new RegExp(escapeRegExp(filters.search), 'i');
    // A medicine is found by trade name, generic name, manufacturer or product code.
    filter.$or = [
      { name: expression },
      { sku: expression },
      { brand: expression },
      { genericName: expression },
      { manufacturer: expression },
      { description: expression }
    ];
  }
  return filter;
};

/**
 * Sellable units per product, computed from live inventory rows only. Expired
 * batches are never sellable, so they are excluded before the sum.
 *
 * Keys are the string form of the product id so callers can look up with either
 * an ObjectId or its hex string.
 */
export const aggregateSellableStock = async (
  agencyId: Types.ObjectId,
  now = new Date()
): Promise<Map<string, number>> => {
  const rows = await InventoryModel.aggregate<{ _id: Types.ObjectId; sellable: number }>([
    { $match: { agencyId, isActive: true, expiryDate: { $gt: now } } },
    {
      $group: {
        _id: '$productId',
        sellable: { $sum: { $max: [0, { $subtract: ['$quantityOnHand', '$quantityReserved'] }] } }
      }
    }
  ]).exec();

  return new Map(rows.map((row) => [row._id.toString(), row.sellable]));
};

/**
 * Translate the availability facet into a product-id clause that MongoDB can
 * still page and sort over. `OUT_OF_STOCK` is expressed as a `$nin` of the
 * products that actually hold sellable units, so a large catalogue does not
 * force a huge `$in` list.
 */
const availabilityIdClause = async (
  agencyId: Types.ObjectId,
  availability: ProductAvailability,
  lowStockThreshold: number
): Promise<{ _id: { $in: Types.ObjectId[] } | { $nin: Types.ObjectId[] } }> => {
  const [stock, thresholdRows] = await Promise.all([
    aggregateSellableStock(agencyId),
    ProductModel.find({ agencyId, isActive: true })
      .select('_id reorderLevel')
      .lean<Array<{ _id: Types.ObjectId; reorderLevel: number }>>()
  ]);
  const thresholds = new Map(
    thresholdRows.map((row) => [row._id.toString(), row.reorderLevel > 0 ? row.reorderLevel : lowStockThreshold])
  );

  const inStock: Types.ObjectId[] = [];
  const lowStock: Types.ObjectId[] = [];
  for (const [productId, sellable] of stock) {
    const threshold = thresholds.get(productId) ?? lowStockThreshold;
    if (sellable <= 0) continue;
    if (sellable <= threshold) lowStock.push(new Types.ObjectId(productId));
    else inStock.push(new Types.ObjectId(productId));
  }

  if (availability === 'IN_STOCK') return { _id: { $in: inStock } };
  if (availability === 'LOW_STOCK') return { _id: { $in: lowStock } };
  // The base filter is already active products in this agency, so any product
  // without positive sellable units is out of stock.
  return { _id: { $nin: [...inStock, ...lowStock] } };
};

export const listProducts = async (
  agencyId: Types.ObjectId,
  filters: ProductListFilters,
  options: { lowStockThreshold?: number } = {}
) => {
  const agencyThreshold = options.lowStockThreshold ?? (await resolveLowStockThreshold(agencyId));
  const filter = buildProductFilter(agencyId, filters);

  if (filters.availability) {
    const clause = await availabilityIdClause(agencyId, filters.availability, agencyThreshold);
    Object.assign(filter, clause);
  }

  const [items, total, stock] = await Promise.all([
    ProductModel.find(filter)
      .populate('categoryId', 'name slug')
      .sort(filters.sort ?? { createdAt: -1 })
      .skip(filters.skip)
      .limit(filters.limit)
      .lean(),
    ProductModel.countDocuments(filter),
    aggregateSellableStock(agencyId)
  ]);

  // Availability is safe for every authenticated role: it exposes units that
  // may be ordered, never cost, reserved ownership or internal batch detail.
  const enriched = items.map((item) => {
    const availableStock = stock.get(String(item._id)) ?? 0;
    const threshold = item.reorderLevel > 0 ? item.reorderLevel : agencyThreshold;
    const availability: ProductAvailability = availableStock <= 0
      ? 'OUT_OF_STOCK'
      : availableStock <= threshold
        ? 'LOW_STOCK'
        : 'IN_STOCK';
    return { ...item, id: String(item._id), availableStock, availability };
  });

  return { items: enriched, total };
};

export const getProduct = async (agencyId: Types.ObjectId, productId: Types.ObjectId) => {
  const product = await ProductModel.findOne({ agencyId, _id: productId })
    .populate('categoryId', 'name slug')
    .lean();
  if (!product) throw AppError.notFound('Product');
  const [availableStock, agencyThreshold] = await Promise.all([
    aggregateSellableStock(agencyId),
    resolveLowStockThreshold(agencyId)
  ]);
  const units = availableStock.get(String(product._id)) ?? 0;
  const threshold = product.reorderLevel > 0 ? product.reorderLevel : agencyThreshold;
  return {
    ...product,
    id: String(product._id),
    availableStock: units,
    availability: units <= 0 ? 'OUT_OF_STOCK' : units <= threshold ? 'LOW_STOCK' : 'IN_STOCK'
  };
};

export interface ProductInput {
  name: string;
  categoryId?: string;
  brand?: string;
  genericName?: string;
  manufacturer?: string;
  description?: string;
  hsnCode?: string;
  mrp?: number;
  price: number;
  taxRate: number;
  unit: string;
  packSize?: string;
  reorderLevel?: number;
  minOrderQuantity?: number;
  maxOrderQuantity?: number;
  imageUrl?: string;
  tags?: string[];
  isFeatured?: boolean;
  isActive?: boolean;
  sku?: string;
  actorUserId?: Types.ObjectId;
}

const generateSku = async (agencyId: Types.ObjectId, name: string, unit: string): Promise<string> => {
  const base = `${slugify(name)}-${unit}`.toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 24);
  for (let attempt = 1; attempt <= 20; attempt += 1) {
    const candidate = `${base}-${String(attempt).padStart(2, '0')}`;
    const exists = await ProductModel.exists({ agencyId, sku: candidate });
    if (!exists) return candidate;
  }
  throw AppError.conflict('Could not generate a unique SKU; provide one explicitly');
};

export const createProduct = async (agencyId: Types.ObjectId, input: ProductInput) => {
  if (input.categoryId) {
    const categoryExists = await CategoryModel.exists({ agencyId, _id: input.categoryId });
    if (!categoryExists) throw AppError.notFound('Category');
  }

  const sku = input.sku ? input.sku.trim().toUpperCase() : await generateSku(agencyId, input.name, input.unit);

  const product = await ProductModel.create({
    agencyId,
    categoryId: input.categoryId,
    name: input.name.trim(),
    slug: slugify(input.name),
    sku,
    brand: input.brand,
    genericName: input.genericName,
    manufacturer: input.manufacturer,
    description: input.description,
    hsnCode: input.hsnCode,
    mrp: input.mrp === undefined ? undefined : round2(input.mrp),
    price: round2(input.price),
    taxRate: input.taxRate,
    unit: input.unit.trim().toUpperCase(),
    packSize: input.packSize,
    reorderLevel: input.reorderLevel ?? 0,
    minOrderQuantity: input.minOrderQuantity ?? 1,
    maxOrderQuantity: input.maxOrderQuantity,
    imageUrl: input.imageUrl,
    tags: input.tags ?? [],
    isActive: input.isActive ?? true,
    isFeatured: input.isFeatured ?? false,
    createdBy: input.actorUserId
  });

  await recordActivity({
    agencyId,
    actorUserId: input.actorUserId,
    action: 'product.create',
    entity: 'Product',
    entityId: product._id,
    summary: `Created product ${product.name} (${product.sku})`
  });

  return product;
};

export const updateProduct = async (
  agencyId: Types.ObjectId,
  productId: Types.ObjectId,
  patch: Partial<ProductInput>
) => {
  const product = await ProductModel.findOne({ agencyId, _id: productId }).exec();
  if (!product) throw AppError.notFound('Product');

  if (patch.categoryId) {
    const categoryExists = await CategoryModel.exists({ agencyId, _id: patch.categoryId });
    if (!categoryExists) throw AppError.notFound('Category');
  }

  // A partial patch can change only one half of the comparison, so the rule is
  // checked against the merged result rather than the request body.
  const nextMrp = patch.mrp !== undefined ? patch.mrp : product.mrp;
  const nextPrice = patch.price !== undefined ? patch.price : product.price;
  if (nextMrp !== undefined && nextMrp < nextPrice) {
    throw AppError.badRequest('MRP cannot be lower than the selling price', [
      { path: 'mrp', message: 'MRP must be greater than or equal to price' }
    ]);
  }
  const nextMin = patch.minOrderQuantity !== undefined ? patch.minOrderQuantity : product.minOrderQuantity;
  const nextMax = patch.maxOrderQuantity !== undefined ? patch.maxOrderQuantity : product.maxOrderQuantity;
  if (nextMax !== undefined && nextMax < nextMin) {
    throw AppError.badRequest('maxOrderQuantity must be greater than or equal to minOrderQuantity', [
      { path: 'maxOrderQuantity', message: 'maxOrderQuantity must be >= minOrderQuantity' }
    ]);
  }

  if (patch.name && patch.name.trim() !== product.name) {
    product.name = patch.name.trim();
    product.slug = slugify(patch.name);
  }
  if (patch.sku) product.sku = patch.sku.trim().toUpperCase();
  if (patch.categoryId !== undefined) product.categoryId = patch.categoryId as unknown as Types.ObjectId;
  if (patch.brand !== undefined) product.brand = patch.brand;
  if (patch.genericName !== undefined) product.genericName = patch.genericName;
  if (patch.manufacturer !== undefined) product.manufacturer = patch.manufacturer;
  if (patch.description !== undefined) product.description = patch.description;
  if (patch.hsnCode !== undefined) product.hsnCode = patch.hsnCode;
  if (patch.mrp !== undefined) product.mrp = round2(patch.mrp);
  if (patch.price !== undefined) product.price = round2(patch.price);
  if (patch.taxRate !== undefined) product.taxRate = patch.taxRate;
  if (patch.unit !== undefined) product.unit = patch.unit.trim().toUpperCase();
  if (patch.packSize !== undefined) product.packSize = patch.packSize;
  if (patch.reorderLevel !== undefined) product.reorderLevel = patch.reorderLevel;
  if (patch.minOrderQuantity !== undefined) product.minOrderQuantity = patch.minOrderQuantity;
  if (patch.maxOrderQuantity !== undefined) product.maxOrderQuantity = patch.maxOrderQuantity;
  if (patch.imageUrl !== undefined) product.imageUrl = patch.imageUrl;
  if (patch.tags !== undefined) product.tags = patch.tags;
  if (patch.isFeatured !== undefined) product.isFeatured = patch.isFeatured;
  if (patch.isActive !== undefined) product.isActive = patch.isActive;
  product.updatedBy = patch.actorUserId;

  await product.save();
  await recordActivity({
    agencyId,
    actorUserId: patch.actorUserId,
    action: 'product.update',
    entity: 'Product',
    entityId: product._id,
    summary: `Updated product ${product.name}`,
    meta: { fields: Object.keys(patch) }
  });
  return product;
};

/** The agency's own low-stock threshold, used to classify `LOW_STOCK`. */
export const resolveLowStockThreshold = async (agencyId: Types.ObjectId): Promise<number> => {
  const agency = await AgencyModel.findById(agencyId)
    .select('orderSettings.lowStockThreshold')
    .lean<{ orderSettings?: { lowStockThreshold?: number } }>();
  return agency?.orderSettings?.lowStockThreshold ?? 20;
};

/** Soft delete: an order or invoice may reference the product for ever. */
export const archiveProduct = async (agencyId: Types.ObjectId, productId: Types.ObjectId, actorUserId?: Types.ObjectId) => {
  const product = await ProductModel.findOne({ agencyId, _id: productId }).exec();
  if (!product) throw AppError.notFound('Product');

  product.isActive = false;
  product.updatedBy = actorUserId;
  await product.save();

  await recordActivity({
    agencyId,
    actorUserId,
    action: 'product.archive',
    entity: 'Product',
    entityId: product._id,
    summary: `Archived product ${product.name}`
  });
  return product;
};

export const listCategories = async (
  agencyId: Types.ObjectId,
  filters: { search?: string; parentId?: string; isActive?: boolean; skip: number; limit: number; sort?: Record<string, 1 | -1> }
) => {
  const filter: FilterQuery<Record<string, unknown>> = { agencyId };
  if (filters.parentId) filter.parentId = filters.parentId;
  if (filters.isActive !== undefined) filter.isActive = filters.isActive;
  if (filters.search) {
    const escaped = filters.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    filter.name = new RegExp(escaped, 'i');
  }

  const [items, total] = await Promise.all([
    CategoryModel.find(filter)
      .sort(filters.sort ?? { displayOrder: 1, name: 1 })
      .skip(filters.skip)
      .limit(filters.limit)
      .lean(),
    CategoryModel.countDocuments(filter)
  ]);
  return { items, total };
};

export interface CategoryInput {
  name: string;
  description?: string;
  parentId?: string;
  displayOrder?: number;
  imageUrl?: string;
  isActive?: boolean;
  actorUserId?: Types.ObjectId;
}

export const createCategory = async (agencyId: Types.ObjectId, input: CategoryInput) => {
  const baseSlug = slugify(input.name);
  let slug = baseSlug;
  for (let attempt = 2; attempt <= 20; attempt += 1) {
    const exists = await CategoryModel.exists({ agencyId, slug });
    if (!exists) break;
    slug = `${baseSlug}-${attempt}`;
  }

  const category = await CategoryModel.create({
    agencyId,
    name: input.name.trim(),
    slug,
    description: input.description,
    parentId: input.parentId,
    displayOrder: input.displayOrder ?? 0,
    imageUrl: input.imageUrl,
    isActive: input.isActive ?? true,
    createdBy: input.actorUserId
  });

  await recordActivity({
    agencyId,
    actorUserId: input.actorUserId,
    action: 'category.create',
    entity: 'Category',
    entityId: category._id,
    summary: `Created category ${category.name}`
  });
  return category;
};

export const updateCategory = async (
  agencyId: Types.ObjectId,
  categoryId: Types.ObjectId,
  patch: Partial<CategoryInput>
) => {
  const category = await CategoryModel.findOne({ agencyId, _id: categoryId }).exec();
  if (!category) throw AppError.notFound('Category');
  if (patch.name && patch.name.trim() !== category.name) {
    category.name = patch.name.trim();
    category.slug = slugify(patch.name);
  }
  if (patch.description !== undefined) category.description = patch.description;
  if (patch.parentId !== undefined) category.parentId = patch.parentId as unknown as Types.ObjectId;
  if (patch.displayOrder !== undefined) category.displayOrder = patch.displayOrder;
  if (patch.imageUrl !== undefined) category.imageUrl = patch.imageUrl;
  if (patch.isActive !== undefined) category.isActive = patch.isActive;
  category.updatedBy = patch.actorUserId;
  await category.save();
  return category;
};

export type { IProduct };
