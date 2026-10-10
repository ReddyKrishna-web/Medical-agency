import { Router } from 'express';
import { asyncHandler } from '../middleware/async-handler';
import { authenticate } from '../middleware/auth';
import { allowRoles } from '../middleware/rbac';
import { writeLimiter } from '../middleware/rate-limit';
import { validate } from '../middleware/validate';
import { idParamSchema } from '../validators/common.schema';
import {
  activityQuerySchema,
  askAiSchema,
  contactSubmissionListSchema,
  exportQuerySchema,
  reportQuerySchema,
  searchSchema,
  settingsPatchSchema,
  updateContactSubmissionSchema
} from '../validators/business.schema';
import * as report from '../controllers/report.controller';
import * as contact from '../controllers/contact.controller';

export const reportRouter = Router();

reportRouter.use(authenticate);

reportRouter.get('/dashboard', validate({ query: reportQuerySchema }), asyncHandler(report.dashboard));
reportRouter.get('/orders', validate({ query: reportQuerySchema }), asyncHandler(report.ordersReport));
reportRouter.get('/customers', validate({ query: reportQuerySchema }), asyncHandler(report.customersReport));
reportRouter.get('/products', validate({ query: reportQuerySchema }), asyncHandler(report.productsReport));
reportRouter.get(
  '/salesmen',
  allowRoles('AGENCY_ADMIN', 'SALESMAN'),
  validate({ query: reportQuerySchema }),
  asyncHandler(report.salesmenReport)
);
reportRouter.get(
  '/inventory',
  allowRoles('AGENCY_ADMIN', 'SALESMAN'),
  asyncHandler(report.inventoryReport)
);
reportRouter.get(
  '/export',
  validate({ query: exportQuerySchema }),
  asyncHandler(report.exportReport)
);

export const searchRouter = Router();

searchRouter.use(authenticate);
searchRouter.get('/', validate({ query: searchSchema }), asyncHandler(report.search));

export const aiRouter = Router();

aiRouter.use(authenticate);
aiRouter.get('/status', asyncHandler(report.aiStatus));
aiRouter.post(
  '/ask',
  allowRoles('AGENCY_ADMIN', 'SALESMAN', 'CUSTOMER'),
  writeLimiter,
  validate({ body: askAiSchema }),
  asyncHandler(report.aiAsk)
);

export const activityRouter = Router();

activityRouter.use(authenticate);
activityRouter.get('/', validate({ query: activityQuerySchema }), asyncHandler(report.activity));

/* ------------------------- contact submissions ---------------------------- */

export const contactRouter = Router();

contactRouter.use(authenticate);

// Reads the tenant's own enquiry inbox.
contactRouter.get(
  '/',
  allowRoles('AGENCY_ADMIN', 'SALESMAN'),
  validate({ query: contactSubmissionListSchema }),
  asyncHandler(contact.listContactSubmissions)
);

contactRouter.get(
  '/:id',
  allowRoles('AGENCY_ADMIN', 'SALESMAN'),
  validate({ params: idParamSchema }),
  asyncHandler(contact.getContactSubmission)
);

contactRouter.patch(
  '/:id',
  allowRoles('AGENCY_ADMIN'),
  writeLimiter,
  validate({ params: idParamSchema, body: updateContactSubmissionSchema }),
  asyncHandler(contact.updateContactSubmission)
);

contactRouter.delete(
  '/:id',
  allowRoles('AGENCY_ADMIN'),
  writeLimiter,
  validate({ params: idParamSchema }),
  asyncHandler(contact.removeContactSubmission)
);

export const settingsRouter = Router();

settingsRouter.use(authenticate);

settingsRouter.get('/', allowRoles('AGENCY_ADMIN'), asyncHandler(report.getSettings));

settingsRouter.patch(
  '/',
  allowRoles('AGENCY_ADMIN'),
  writeLimiter,
  validate({ body: settingsPatchSchema }),
  asyncHandler(report.updateSettings)
);
