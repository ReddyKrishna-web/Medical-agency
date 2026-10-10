import type { Request, Response } from 'express';
import { env } from '../config/env';
import { UserModel } from '../models/user.model';
import { CustomerModel } from '../models/customer.model';
import { SalesmanModel } from '../models/salesman.model';
import { asyncHandler } from '../middleware/async-handler';
import { verifyAccessToken } from '../middleware/auth';
import { sendCreated, sendData, sendMessage } from '../utils/response';
import { requireAuth } from '../utils/tenant';
import { AppError } from '../utils/errors';
import * as authService from '../services/auth.service';
import {
  revokeSession,
  revokeAllSessions,
  rotateSession,
  countActiveSessions
} from '../services/token.service';
import { recordActivity } from '../services/activity.service';

const clientMeta = (req: Request) => ({
  userAgent: req.headers['user-agent']?.slice(0, 300),
  ip: (req.ip ?? '').slice(0, 64)
});

export const setRefreshCookie = (res: Response, token: string): void => {
  res.cookie(env.COOKIE_NAME, token, {
    httpOnly: true,
    secure: env.isProduction || env.COOKIE_SAME_SITE === 'none',
    sameSite: env.COOKIE_SAME_SITE,
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: '/api/auth'
  });
};

export const clearRefreshCookie = (res: Response): void => {
  res.clearCookie(env.COOKIE_NAME, {
    httpOnly: true,
    secure: env.isProduction || env.COOKIE_SAME_SITE === 'none',
    sameSite: env.COOKIE_SAME_SITE,
    path: '/api/auth'
  });
};

const sessionPayload = (result: {
  user: {
    id: unknown;
    name: string;
    email: string;
    phone?: string;
    role: string;
    status: string;
    mustChangePassword: boolean;
  };
  session: { accessToken: string; refreshToken: string };
  statusMessage: string;
  agencyId: unknown;
}) => ({
  user: result.user,
  accessToken: result.session.accessToken,
  expiresIn: env.JWT_ACCESS_EXPIRES_IN,
  tokenType: 'Bearer',
  status: result.statusMessage
});

export const register = asyncHandler(async (req: Request, res: Response) => {
  const result = await authService.registerAccount(req.body);
  setRefreshCookie(res, result.session.refreshToken);

  await recordActivity({
    agencyId: result.agencyId,
    actorUserId: result.user.id,
    actorRole: result.user.role as 'CUSTOMER' | 'SALESMAN',
    action: 'auth.register',
    entity: 'User',
    entityId: result.user.id,
    summary: `Registration submitted by ${result.user.email}`
  });

  sendCreated(res, sessionPayload(result));
});

export const registerAgency = asyncHandler(async (req: Request, res: Response) => {
  const result = await authService.registerAgency(req.body);
  setRefreshCookie(res, result.session.refreshToken);

  sendCreated(res, sessionPayload(result));
});

export const login = asyncHandler(async (req: Request, res: Response) => {
  const result = await authService.login(req.body, clientMeta(req));
  setRefreshCookie(res, result.session.refreshToken);
  sendData(res, { ...sessionPayload(result), agency: result.agency });
});

export const refresh = asyncHandler(async (req: Request, res: Response) => {
  const token = (req.cookies?.[env.COOKIE_NAME] as string | undefined) ?? (req.body?.refreshToken as string | undefined);
  if (!token) throw AppError.unauthorized('Refresh token cookie is missing');

  const session = await rotateSession(token, clientMeta(req));
  setRefreshCookie(res, session.refreshToken);

  const subject = verifyAccessToken(session.accessToken).sub;
  const user = await UserModel.findById(subject)
    .select('name email phone role status mustChangePassword')
    .lean();

  sendData(res, {
    accessToken: session.accessToken,
    expiresIn: env.JWT_ACCESS_EXPIRES_IN,
    tokenType: 'Bearer',
    user: user
      ? {
          _id: user._id,
          id: user._id,
          name: user.name,
          email: user.email,
          phone: user.phone,
          role: user.role,
          status: user.status,
          mustChangePassword: user.mustChangePassword
        }
      : null
  });
});

export const logout = asyncHandler(async (req: Request, res: Response) => {
  const token = (req.cookies?.[env.COOKIE_NAME] as string | undefined) ?? (req.body?.refreshToken as string | undefined);
  if (token) {
    try {
      await revokeSession(token);
    } catch {
      // A malformed or already-revoked token still results in a clean logout.
    }
  }
  clearRefreshCookie(res);
  sendMessage(res, 'Signed out');
});

export const me = asyncHandler(async (req: Request, res: Response) => {
  const auth = requireAuth(req.auth);
  const [user, agency] = await Promise.all([
    UserModel.findOne({ agencyId: auth.agencyId, _id: auth.userId }).select('-passwordHash').lean(),
    (await import('../models/agency.model')).AgencyModel.findById(auth.agencyId)
      .select('name slug logoUrl')
      .lean<{ name: string; slug: string; logoUrl?: string }>()
  ]);

  let profile: Record<string, unknown> | null = null;
  if (auth.role === 'CUSTOMER' && auth.customerId) {
    profile = await CustomerModel.findOne({ agencyId: auth.agencyId, _id: auth.customerId })
      .select('-__v')
      .lean();
  } else if (auth.role === 'SALESMAN' && auth.salesmanId) {
    profile = await SalesmanModel.findOne({ agencyId: auth.agencyId, _id: auth.salesmanId })
      .select('employeeCode territory status customerIds monthlyTarget')
      .lean();
  }

  sendData(res, {
    user,
    profile,
    agency: agency ? { name: agency.name, slug: agency.slug, logoUrl: agency.logoUrl } : null
  });
});

export const updateProfile = asyncHandler(async (req: Request, res: Response) => {
  const auth = requireAuth(req.auth);
  const user = await UserModel.findOne({ agencyId: auth.agencyId, _id: auth.userId }).exec();
  if (!user) throw AppError.notFound('User');

  const updated = await authService.updateOwnProfile(user, req.body);
  await recordActivity({
    agencyId: auth.agencyId,
    actorUserId: auth.userId,
    actorRole: auth.role,
    action: 'auth.profile_update',
    entity: 'User',
    entityId: auth.userId,
    summary: 'Updated own profile'
  });

  sendData(res, {
    user: { id: updated._id, name: updated.name, email: updated.email, phone: updated.phone, avatarUrl: updated.avatarUrl }
  });
});

export const changePassword = asyncHandler(async (req: Request, res: Response) => {
  const auth = requireAuth(req.auth);
  const user = await UserModel.findById(auth.userId).exec();
  if (!user) throw AppError.notFound('User');

  await authService.changePassword(user, req.body.currentPassword, req.body.newPassword);
  clearRefreshCookie(res);
  sendMessage(res, 'Password updated. Please sign in again with your new password.');
});

export const forgotPassword = asyncHandler(async (req: Request, res: Response) => {
  const result = await authService.requestPasswordReset(req.body.email);
  sendData(res, {
    message: result.message,
    ...(result.devResetToken ? { devResetToken: result.devResetToken } : {})
  });
});

export const resetPassword = asyncHandler(async (req: Request, res: Response) => {
  if (req.body.confirmPassword && req.body.confirmPassword !== req.body.password) {
    throw AppError.badRequest('Password confirmation does not match');
  }
  await authService.resetPassword(req.body.token, req.body.password);
  clearRefreshCookie(res);
  sendMessage(res, 'Password has been reset. You can now sign in.');
});

export const sessions = asyncHandler(async (req: Request, res: Response) => {
  const auth = requireAuth(req.auth);
  const count = await countActiveSessions(auth.userId);
  sendData(res, { activeSessions: count });
});

export const revokeAll = asyncHandler(async (req: Request, res: Response) => {
  const auth = requireAuth(req.auth);
  await revokeAllSessions(auth.userId, 'USER_REQUESTED');
  clearRefreshCookie(res);
  sendMessage(res, 'All sessions were signed out');
});
