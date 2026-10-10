import { Router } from 'express';
import { asyncHandler } from '../middleware/async-handler';
import { authenticate } from '../middleware/auth';
import { allowRoles } from '../middleware/rbac';
import { writeLimiter, uploadLimiter } from '../middleware/rate-limit';
import { idempotency } from '../middleware/idempotency';
import { validate } from '../middleware/validate';
import { singleFileUpload } from '../middleware/upload';
import { idParamSchema } from '../validators/common.schema';
import {
  convertRequirementSchema,
  createFollowUpSchema,
  followUpListSchema,
  followUpStatusSchema,
  markNotificationsReadSchema,
  markReadSchema,
  messageListSchema,
  notificationListSchema,
  requirementListSchema,
  requirementStatusSchema,
  sendMessageSchema,
  updateFollowUpSchema,
  uploadRequirementSchema
} from '../validators/business.schema';
import * as requirements from '../controllers/requirement.controller';
import * as engagement from '../controllers/engagement.controller';

export const requirementRouter = Router();

requirementRouter.use(authenticate);

requirementRouter.get('/', validate({ query: requirementListSchema }), asyncHandler(requirements.listRequirements));

requirementRouter.post(
  '/',
  allowRoles('CUSTOMER', 'SALESMAN', 'AGENCY_ADMIN'),
  uploadLimiter,
  writeLimiter,
  singleFileUpload('file'),
  validate({ body: uploadRequirementSchema }),
  asyncHandler(requirements.uploadRequirement)
);

requirementRouter.get('/:id', validate({ params: idParamSchema }), asyncHandler(requirements.getRequirement));

requirementRouter.get(
  '/:id/file',
  validate({ params: idParamSchema }),
  asyncHandler(requirements.downloadRequirement)
);

requirementRouter.post(
  '/:id/status',
  allowRoles('AGENCY_ADMIN', 'SALESMAN'),
  writeLimiter,
  validate({ params: idParamSchema, body: requirementStatusSchema }),
  asyncHandler(requirements.setRequirementStatus)
);

requirementRouter.post(
  '/:id/extract',
  allowRoles('AGENCY_ADMIN', 'SALESMAN'),
  writeLimiter,
  validate({ params: idParamSchema }),
  asyncHandler(requirements.runRequirementExtraction)
);

requirementRouter.post(
  '/:id/convert-order',
  allowRoles('AGENCY_ADMIN', 'SALESMAN'),
  writeLimiter,
  idempotency(),
  validate({ params: idParamSchema, body: convertRequirementSchema }),
  asyncHandler(requirements.convertToOrder)
);

/* -------------------------------- messaging -------------------------------- */

export const messageRouter = Router();

messageRouter.use(authenticate);

messageRouter.get('/', validate({ query: messageListSchema }), asyncHandler(engagement.listMessages));

messageRouter.post(
  '/',
  writeLimiter,
  validate({ body: sendMessageSchema }),
  asyncHandler(engagement.sendMessage)
);

messageRouter.post('/read', writeLimiter, validate({ body: markReadSchema }), asyncHandler(engagement.markMessagesRead));

messageRouter.get('/conversations', asyncHandler(engagement.listConversations));

/* -------------------------------- follow-ups ------------------------------- */

export const followUpRouter = Router();

followUpRouter.use(authenticate);

followUpRouter.get('/', validate({ query: followUpListSchema }), asyncHandler(engagement.listFollowUps));

followUpRouter.post(
  '/',
  allowRoles('SALESMAN', 'AGENCY_ADMIN'),
  writeLimiter,
  validate({ body: createFollowUpSchema }),
  asyncHandler(engagement.createFollowUp)
);

followUpRouter.get('/:id', validate({ params: idParamSchema }), asyncHandler(engagement.getFollowUp));

followUpRouter.patch(
  '/:id',
  allowRoles('SALESMAN', 'AGENCY_ADMIN'),
  writeLimiter,
  validate({ params: idParamSchema, body: updateFollowUpSchema }),
  asyncHandler(engagement.updateFollowUp)
);

followUpRouter.post(
  '/:id/status',
  allowRoles('SALESMAN', 'AGENCY_ADMIN'),
  writeLimiter,
  validate({ params: idParamSchema, body: followUpStatusSchema }),
  asyncHandler(engagement.setFollowUpStatus)
);

/* ------------------------------ notifications ------------------------------ */

export const notificationRouter = Router();

notificationRouter.use(authenticate);

notificationRouter.get(
  '/',
  validate({ query: notificationListSchema }),
  asyncHandler(engagement.listNotifications)
);

notificationRouter.post(
  '/read',
  writeLimiter,
  validate({ body: markNotificationsReadSchema }),
  asyncHandler(engagement.markNotificationsRead)
);
