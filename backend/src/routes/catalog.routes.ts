import { Router } from 'express';
import { asyncHandler } from '../middleware/async-handler';
import { authenticate } from '../middleware/auth';
import { allowRoles } from '../middleware/rbac';
import { writeLimiter } from '../middleware/rate-limit';
import { idempotency } from '../middleware/idempotency';
import { validate } from '../middleware/validate';
import { idParamSchema } from '../validators/common.schema';
import {
  batchListSchema,
  categoryListSchema,
  createCategorySchema,
  createProductSchema,
  inventoryListSchema,
  movementListSchema,
  productListSchema,
  receiveStockSchema,
  updateBatchSchema,
  updateCategorySchema,
  updateProductSchema,
  validateOrderSchema
} from '../validators/catalog.schema';
import { adjustStockSchema } from '../validators/catalog.schema';
import * as catalog from '../controllers/catalog.controller';
import * as inventory from '../controllers/inventory.controller';

export const catalogRouter = Router();

/* -------------------------------- products -------------------------------- */

catalogRouter.get(
  '/products',
  authenticate,
  validate({ query: productListSchema }),
  asyncHandler(catalog.listProducts)
);

catalogRouter.post(
  '/products',
  authenticate,
  allowRoles('AGENCY_ADMIN'),
  writeLimiter,
  validate({ body: createProductSchema }),
  asyncHandler(catalog.createProduct)
);

catalogRouter.get(
  '/products/:id',
  authenticate,
  validate({ params: idParamSchema }),
  asyncHandler(catalog.getProduct)
);

catalogRouter.patch(
  '/products/:id',
  authenticate,
  allowRoles('AGENCY_ADMIN'),
  writeLimiter,
  validate({ params: idParamSchema, body: updateProductSchema }),
  asyncHandler(catalog.updateProduct)
);

catalogRouter.delete(
  '/products/:id',
  authenticate,
  allowRoles('AGENCY_ADMIN'),
  writeLimiter,
  validate({ params: idParamSchema }),
  asyncHandler(catalog.deleteProduct)
);

/* ------------------------------- categories ------------------------------- */

catalogRouter.get(
  '/categories',
  authenticate,
  validate({ query: categoryListSchema }),
  asyncHandler(catalog.listCategories)
);

catalogRouter.post(
  '/categories',
  authenticate,
  allowRoles('AGENCY_ADMIN'),
  writeLimiter,
  validate({ body: createCategorySchema }),
  asyncHandler(catalog.createCategory)
);

catalogRouter.patch(
  '/categories/:id',
  authenticate,
  allowRoles('AGENCY_ADMIN'),
  writeLimiter,
  validate({ params: idParamSchema, body: updateCategorySchema }),
  asyncHandler(catalog.updateCategory)
);

/* -------------------------------- inventory ------------------------------- */

catalogRouter.get(
  '/inventory',
  authenticate,
  validate({ query: inventoryListSchema }),
  asyncHandler(inventory.listInventory)
);

catalogRouter.post(
  '/inventory/batches',
  authenticate,
  allowRoles('AGENCY_ADMIN', 'SALESMAN'),
  writeLimiter,
  idempotency(),
  validate({ body: receiveStockSchema }),
  asyncHandler(inventory.receiveStock)
);

catalogRouter.post(
  '/inventory/adjust',
  authenticate,
  allowRoles('AGENCY_ADMIN'),
  writeLimiter,
  idempotency(),
  validate({ body: adjustStockSchema }),
  asyncHandler(inventory.adjustStock)
);

catalogRouter.get(
  '/inventory/movements',
  authenticate,
  allowRoles('AGENCY_ADMIN', 'SALESMAN'),
  validate({ query: movementListSchema }),
  asyncHandler(inventory.listMovements)
);

catalogRouter.post(
  '/inventory/validate',
  authenticate,
  writeLimiter,
  validate({ body: validateOrderSchema }),
  asyncHandler(catalog.validateOrderStock)
);

catalogRouter.get(
  '/inventory/capability',
  authenticate,
  allowRoles('AGENCY_ADMIN'),
  asyncHandler(inventory.stockCapability)
);

/* --------------------------------- batches -------------------------------- */

catalogRouter.get(
  '/batches',
  authenticate,
  allowRoles('AGENCY_ADMIN', 'SALESMAN'),
  validate({ query: batchListSchema }),
  asyncHandler(catalog.listBatches)
);

catalogRouter.patch(
  '/batches/:id',
  authenticate,
  allowRoles('AGENCY_ADMIN'),
  writeLimiter,
  validate({ params: idParamSchema, body: updateBatchSchema }),
  asyncHandler(catalog.updateBatch)
);
