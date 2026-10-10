import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../middleware/async-handler';
import { authenticate } from '../middleware/auth';
import { allowRoles } from '../middleware/rbac';
import { writeLimiter } from '../middleware/rate-limit';
import { validate } from '../middleware/validate';
import { sendData, sendPaginated } from '../utils/response';
import { requireAuth } from '../utils/tenant';
import { idParamSchema } from '../validators/common.schema';
import {
  assignCustomersSchema,
  createCustomerSchema,
  createSalesmanSchema,
  customerListSchema,
  customerNoteSchema,
  customerStatusSchema,
  salesmanListSchema,
  salesmanStatusSchema,
  updateCustomerSchema,
  updateSalesmanSchema
} from '../validators/auth.schema';
import * as customers from '../controllers/customer.controller';
import { listSalesmanOptions } from '../controllers/engagement.controller';
import { UserModel } from '../models/user.model';

const staffOptionsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50)
});

export const customerRouter = Router();

customerRouter.use(authenticate);

customerRouter.get('/', validate({ query: customerListSchema }), asyncHandler(customers.listCustomers));

customerRouter.post(
  '/',
  allowRoles('AGENCY_ADMIN'),
  writeLimiter,
  validate({ body: createCustomerSchema }),
  asyncHandler(customers.createCustomer)
);

customerRouter.get('/:id', validate({ params: idParamSchema }), asyncHandler(customers.getCustomer));

customerRouter.post(
  '/:id/notes',
  allowRoles('AGENCY_ADMIN', 'SALESMAN'),
  writeLimiter,
  validate({ params: idParamSchema, body: customerNoteSchema }),
  asyncHandler(customers.addCustomerNote)
);

customerRouter.patch(
  '/:id',
  writeLimiter,
  validate({ params: idParamSchema, body: updateCustomerSchema }),
  asyncHandler(customers.updateCustomer)
);

customerRouter.post(
  '/:id/status',
  allowRoles('AGENCY_ADMIN'),
  writeLimiter,
  validate({ params: idParamSchema, body: customerStatusSchema }),
  asyncHandler(customers.setCustomerStatus)
);

export const salesmanRouter = Router();

salesmanRouter.use(authenticate);

salesmanRouter.get('/', validate({ query: salesmanListSchema }), asyncHandler(customers.listSalesmen));

salesmanRouter.post(
  '/',
  allowRoles('AGENCY_ADMIN'),
  writeLimiter,
  validate({ body: createSalesmanSchema }),
  asyncHandler(customers.createSalesman)
);

/** Options for dropdowns: active staff of the agency. */
salesmanRouter.get('/options', allowRoles('AGENCY_ADMIN', 'SALESMAN'), asyncHandler(listSalesmanOptions));

salesmanRouter.get('/:id', validate({ params: idParamSchema }), asyncHandler(customers.getSalesman));

salesmanRouter.patch(
  '/:id',
  allowRoles('AGENCY_ADMIN'),
  writeLimiter,
  validate({ params: idParamSchema, body: updateSalesmanSchema }),
  asyncHandler(customers.updateSalesman)
);

salesmanRouter.post(
  '/:id/status',
  allowRoles('AGENCY_ADMIN'),
  writeLimiter,
  validate({ params: idParamSchema, body: salesmanStatusSchema }),
  asyncHandler(customers.setSalesmanStatus)
);

salesmanRouter.post(
  '/:id/assign-customers',
  allowRoles('AGENCY_ADMIN'),
  writeLimiter,
  validate({ params: idParamSchema, body: assignCustomersSchema }),
  asyncHandler(customers.assignCustomers)
);

/** Directory of staff a customer may message. */
export const staffRouter = Router();

staffRouter.use(authenticate);

staffRouter.get(
  '/options',
  validate({ query: staffOptionsQuerySchema }),
  asyncHandler(async (req, res) => {
    const auth = requireAuth(req.auth);
    const { page, limit } = req.query as unknown as { page: number; limit: number };
    const filter: Record<string, unknown> = {
      agencyId: auth.agencyId,
      status: 'ACTIVE',
      role: { $in: ['AGENCY_ADMIN', 'SALESMAN'] }
    };

    const [items, total] = await Promise.all([
      UserModel.find(filter)
        .select('name email role avatarUrl')
        .sort({ name: 1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      UserModel.countDocuments(filter)
    ]);
    sendPaginated(res, items, total, page, limit);
  })
);

/** The caller's own customer profile (customer workspace shortcut). */
export const profileRouter = Router();

profileRouter.use(authenticate);

profileRouter.get(
  '/me',
  allowRoles('CUSTOMER'),
  asyncHandler(async (req, res) => {
    const auth = requireAuth(req.auth);
    sendData(res, { customerId: auth.customerId ?? null, role: auth.role, name: auth.name, email: auth.email });
  })
);
