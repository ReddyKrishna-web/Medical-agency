import { Router } from 'express';
import { asyncHandler } from '../middleware/async-handler';
import { authenticate, authenticateAllowPending } from '../middleware/auth';
import { authLimiter, writeLimiter } from '../middleware/rate-limit';
import { validate } from '../middleware/validate';
import {
  changePasswordSchema,
  forgotPasswordSchema,
  loginSchema,
  registerAgencySchema,
  registerSchema,
  resetPasswordSchema,
  updateProfileSchema
} from '../validators/auth.schema';
import * as controller from '../controllers/auth.controller';

export const authRouter = Router();

authRouter.post(
  '/register',
  authLimiter,
  validate({ body: registerSchema }),
  asyncHandler(controller.register)
);

/** Agency self-registration: creates the tenant and its ACTIVE admin. */
authRouter.post(
  '/register-agency',
  authLimiter,
  validate({ body: registerAgencySchema }),
  asyncHandler(controller.registerAgency)
);

authRouter.post('/login', authLimiter, validate({ body: loginSchema }), asyncHandler(controller.login));

/**
 * Session renewal is not a credential endpoint: it is driven by the HttpOnly
 * refresh cookie on every cold page load, and a signed-out visitor always gets a
 * 401 here. Counting those against the strict sign-in limiter would lock real
 * users out of /auth/login after repeated visits from one IP, so only the global
 * API limiter applies. Rotation and reuse detection still protect the token.
 */
authRouter.post('/refresh', asyncHandler(controller.refresh));

authRouter.post('/logout', asyncHandler(controller.logout));

/** Pending customers may read their own account state. */
authRouter.get('/me', authenticateAllowPending, asyncHandler(controller.me));

authRouter.patch(
  '/profile',
  authenticate,
  writeLimiter,
  validate({ body: updateProfileSchema }),
  asyncHandler(controller.updateProfile)
);

authRouter.patch(
  '/password',
  authenticate,
  writeLimiter,
  validate({ body: changePasswordSchema }),
  asyncHandler(controller.changePassword)
);

authRouter.post(
  '/forgot-password',
  authLimiter,
  validate({ body: forgotPasswordSchema }),
  asyncHandler(controller.forgotPassword)
);

authRouter.post(
  '/reset-password',
  authLimiter,
  validate({ body: resetPasswordSchema }),
  asyncHandler(controller.resetPassword)
);

authRouter.get('/sessions', authenticate, asyncHandler(controller.sessions));

authRouter.post('/sessions/revoke-all', authenticate, asyncHandler(controller.revokeAll));
