import { Router } from 'express';
import { asyncHandler as wrap } from '../middleware/async-handler';
import { health, publicAgencies, publicAgency } from '../controllers/report.controller';
import { submitPublicContact } from '../controllers/contact.controller';
import { authRouter } from './auth.routes';
import { customerRouter, profileRouter, salesmanRouter, staffRouter } from './people.routes';
import { catalogRouter } from './catalog.routes';
import { orderRouter, invoiceRouter, paymentRouter } from './order.routes';
import { followUpRouter, messageRouter, notificationRouter, requirementRouter } from './business.routes';
import {
  activityRouter,
  aiRouter,
  contactRouter,
  reportRouter,
  searchRouter,
  settingsRouter
} from './report.routes';
import { requireAuth } from '../middleware/require-auth';
import { validate } from '../middleware/validate';
import { publicFormLimiter } from '../middleware/rate-limit';
import { contactSubmissionSchema } from '../validators/business.schema';
import { sendData } from '../utils/response';

export const apiRouter = Router();

/** Practical health probe: no auth, no rate limit. */
apiRouter.get('/health', wrap(health));
apiRouter.get('/public/agency', wrap(publicAgency));
/** Public list of agencies an applicant can pick at registration. */
apiRouter.get('/public/agencies', wrap(publicAgencies));

/**
 * Public business contact form. Unauthenticated, rate limited and validated;
 * it records an enquiry and never creates an account.
 */
apiRouter.post(
  '/public/contact',
  publicFormLimiter,
  validate({ body: contactSubmissionSchema }),
  wrap(submitPublicContact)
);

apiRouter.use('/auth', authRouter);
apiRouter.use('/customers', customerRouter);
apiRouter.use('/salesmen', salesmanRouter);
apiRouter.use('/staff', staffRouter);
apiRouter.use('/me', profileRouter);
apiRouter.use('/', catalogRouter); // products, categories, inventory, batches
apiRouter.use('/orders', orderRouter);
apiRouter.use('/invoices', invoiceRouter);
apiRouter.use('/payments', paymentRouter);
apiRouter.use('/requirements', requirementRouter);
apiRouter.use('/messages', messageRouter);
apiRouter.use('/follow-ups', followUpRouter);
apiRouter.use('/notifications', notificationRouter);
apiRouter.use('/reports', reportRouter);
apiRouter.use('/search', searchRouter);
apiRouter.use('/ai', aiRouter);
apiRouter.use('/activity', activityRouter);
apiRouter.use('/settings', settingsRouter);
apiRouter.use('/contact-submissions', contactRouter);

/** Resolved authentication context, handy for client bootstrap. */
apiRouter.get(
  '/context',
  requireAuth,
  wrap(async (req, res) => {
    const { requireAuth: resolveAuth } = await import('../utils/tenant');
    sendData(res, { auth: resolveAuth(req.auth) });
  })
);