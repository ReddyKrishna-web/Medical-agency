import jwt from 'jsonwebtoken';
import type { Types } from 'mongoose';
import { env } from '../config/env';
import { RefreshTokenModel } from '../models/refresh-token.model';
import { UserModel } from '../models/user.model';
import { signAccessToken, signRefreshToken, verifyRefreshToken } from '../middleware/auth';
import { AppError, ErrorCode } from '../utils/errors';
import { hashToken, randomJti } from '../utils/crypto';
import type { IUser } from '../models/user.model';

export interface SessionMetadata {
  userAgent?: string;
  ip?: string;
}

export interface IssuedSession {
  accessToken: string;
  refreshToken: string;
  refreshTokenHash: string;
  refreshExpiresAt: Date;
  jti: string;
}

const refreshTtlMs = (): number => {
  // Parse the configured `7d` / `15m` style duration.
  const raw = env.JWT_REFRESH_EXPIRES_IN.trim();
  const match = /^(\d+)\s*([smhdw]?)$/i.exec(raw);
  if (!match) return 7 * 24 * 60 * 60 * 1000;
  const value = Number(match[1]);
  const unit = (match[2] ?? 's').toLowerCase();
  const multipliers: Record<string, number> = {
    s: 1000,
    m: 60_000,
    h: 3_600_000,
    d: 86_400_000,
    w: 604_800_000
  };
  return value * (multipliers[unit] ?? 1000);
};

export const issueSession = async (user: IUser, meta: SessionMetadata = {}): Promise<IssuedSession> => {
  const jti = randomJti();
  const refreshToken = signRefreshToken(user, jti);
  const refreshExpiresAt = new Date(Date.now() + refreshTtlMs());

  await RefreshTokenModel.create({
    agencyId: user.agencyId,
    userId: user._id,
    jti,
    tokenHash: hashToken(refreshToken),
    expiresAt: refreshExpiresAt,
    userAgent: meta.userAgent?.slice(0, 300),
    ip: meta.ip?.slice(0, 64)
  });

  return {
    accessToken: signAccessToken(user),
    refreshToken,
    refreshTokenHash: hashToken(refreshToken),
    refreshExpiresAt,
    jti
  };
};

/**
 * Refresh token rotation with reuse detection:
 *  - the presented token must resolve to a live session record
 *  - the record is revoked and linked to its replacement
 *  - presenting an already-revoked token revokes the whole user session set
 */
export const rotateSession = async (refreshToken: string, meta: SessionMetadata = {}): Promise<IssuedSession> => {
  const payload = verifyRefreshToken(refreshToken);
  const record = await RefreshTokenModel.findOne({ jti: payload.jti, userId: payload.sub }).exec();

  if (!record) {
    throw AppError.unauthorized('Refresh token is not recognised', ErrorCode.INVALID_CREDENTIALS);
  }

  if (record.revokedAt) {
    // Reuse of a rotated token: treat the session as compromised.
    await RefreshTokenModel.updateMany(
      { userId: record.userId, revokedAt: null },
      { $set: { revokedAt: new Date(), revokedReason: 'REUSE_DETECTED' } }
    ).exec();
    throw AppError.unauthorized('Refresh token was already used; all sessions were revoked', ErrorCode.INVALID_CREDENTIALS);
  }

  if (record.expiresAt.getTime() <= Date.now()) {
    throw AppError.unauthorized('Refresh token has expired', ErrorCode.TOKEN_EXPIRED);
  }

  const user = await UserModel.findById(payload.sub).exec();
  if (!user) throw AppError.unauthorized('Account no longer exists');
  if (String(user.agencyId) !== payload.aid) throw AppError.unauthorized('Token tenant mismatch');
  if ((user.tokenVersion ?? 0) !== (payload.ver ?? 0)) {
    throw AppError.unauthorized('Session was invalidated; please sign in again');
  }
  if (user.status === 'DISABLED') throw AppError.forbidden('This account has been disabled');
  if (user.status === 'PENDING') {
    throw new AppError(403, ErrorCode.ACCOUNT_PENDING, 'This account is awaiting agency approval');
  }

  const next = await issueSession(user, meta);
  await RefreshTokenModel.updateOne(
    { _id: record._id },
    { $set: { revokedAt: new Date(), revokedReason: 'ROTATED', replacedByJti: next.jti } }
  ).exec();

  return next;
};

export const revokeSession = async (refreshToken: string, reason = 'LOGOUT'): Promise<void> => {
  const payload = verifyRefreshToken(refreshToken);
  await RefreshTokenModel.updateOne(
    { jti: payload.jti, userId: payload.sub, revokedAt: null },
    { $set: { revokedAt: new Date(), revokedReason: reason } }
  ).exec();
};

export const revokeAllSessions = async (userId: Types.ObjectId, reason: string): Promise<void> => {
  await RefreshTokenModel.updateMany(
    { userId, revokedAt: null },
    { $set: { revokedAt: new Date(), revokedReason: reason } }
  ).exec();
};

export const countActiveSessions = async (userId: Types.ObjectId): Promise<number> =>
  RefreshTokenModel.countDocuments({ userId, revokedAt: null, expiresAt: { $gt: new Date() } }).exec();

export const decodeRefreshTokenUnsafe = (token: string): { jti: string; sub: string } | null => {
  try {
    return jwt.decode(token) as { jti: string; sub: string };
  } catch {
    return null;
  }
};
