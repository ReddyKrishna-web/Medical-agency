import type { NextFunction, Request, Response } from 'express';
import jwt, { type SignOptions } from 'jsonwebtoken';
import type { Types } from 'mongoose';
import { env } from '../config/env';
import { AppError, ErrorCode } from '../utils/errors';
import { UserModel, type IUser } from '../models/user.model';
import { CustomerModel } from '../models/customer.model';
import { SalesmanModel } from '../models/salesman.model';
import type { AuthContext } from '../types/express';
import type { Role } from '../constants/domain';

export interface AccessTokenPayload {
  sub: string;
  aid: string;
  role: Role;
  ver: number;
  typ: 'access';
}

export interface RefreshTokenPayload {
  sub: string;
  aid: string;
  jti: string;
  ver: number;
  typ: 'refresh';
}

/** `JWT_*_EXPIRES_IN` is a string such as `15m`; jsonwebtoken types it narrowly. */
const expiresIn = (value: string): SignOptions['expiresIn'] => value as SignOptions['expiresIn'];

export const signAccessToken = (user: Pick<IUser, '_id' | 'agencyId' | 'role' | 'tokenVersion'>): string =>
  jwt.sign(
    {
      sub: user._id.toString(),
      aid: user.agencyId.toString(),
      role: user.role,
      ver: user.tokenVersion ?? 0,
      typ: 'access'
    } satisfies AccessTokenPayload,
    env.JWT_SECRET,
    { expiresIn: expiresIn(env.JWT_ACCESS_EXPIRES_IN), issuer: 'supply-medicals' }
  );

export const signRefreshToken = (
  user: Pick<IUser, '_id' | 'agencyId' | 'tokenVersion'>,
  jti: string
): string =>
  jwt.sign(
    {
      sub: user._id.toString(),
      aid: user.agencyId.toString(),
      jti,
      ver: user.tokenVersion ?? 0,
      typ: 'refresh'
    } satisfies RefreshTokenPayload,
    env.JWT_REFRESH_SECRET,
    { expiresIn: expiresIn(env.JWT_REFRESH_EXPIRES_IN), issuer: 'supply-medicals' }
  );

export const verifyAccessToken = (token: string): AccessTokenPayload => {
  try {
    const decoded = jwt.verify(token, env.JWT_SECRET, { issuer: 'supply-medicals' }) as AccessTokenPayload;
    if (decoded.typ !== 'access') {
      throw AppError.unauthorized('Invalid token type', ErrorCode.TOKEN_EXPIRED);
    }
    return decoded;
  } catch (error) {
    if (error instanceof AppError) throw error;
    if (error instanceof jwt.TokenExpiredError) {
      throw AppError.unauthorized('Access token has expired', ErrorCode.TOKEN_EXPIRED);
    }
    throw AppError.unauthorized('Invalid or malformed access token');
  }
};

export const verifyRefreshToken = (token: string): RefreshTokenPayload => {
  try {
    const decoded = jwt.verify(token, env.JWT_REFRESH_SECRET, { issuer: 'supply-medicals' }) as RefreshTokenPayload;
    if (decoded.typ !== 'refresh') throw AppError.unauthorized('Invalid token type');
    return decoded;
  } catch (error) {
    if (error instanceof AppError) throw error;
    if (error instanceof jwt.TokenExpiredError) {
      throw AppError.unauthorized('Refresh token has expired', ErrorCode.TOKEN_EXPIRED);
    }
    throw AppError.unauthorized('Invalid or malformed refresh token');
  }
};

const buildAuthContext = async (user: IUser): Promise<AuthContext> => {
  const context: AuthContext = {
    userId: user._id,
    agencyId: user.agencyId,
    role: user.role,
    name: user.name,
    email: user.email,
    status: user.status,
    tokenVersion: user.tokenVersion ?? 0
  };

  if (user.role === 'CUSTOMER') {
    const customer = await CustomerModel.findOne({ agencyId: user.agencyId, userId: user._id })
      .select('_id')
      .lean<{ _id: Types.ObjectId }>();
    if (customer) context.customerId = customer._id;
  }

  if (user.role === 'SALESMAN') {
    const salesman = await SalesmanModel.findOne({ agencyId: user.agencyId, userId: user._id })
      .select('_id')
      .lean<{ _id: Types.ObjectId }>();
    if (salesman) context.salesmanId = salesman._id;
  }

  return context;
};

const bearerToken = (req: Request): string | null => {
  const header = req.headers.authorization;
  if (!header) return null;
  const [scheme, value] = header.split(' ');
  if (!scheme || scheme.toLowerCase() !== 'bearer' || !value) return null;
  return value.trim();
};

/**
 * Hard tenant + account gate. The token identifies the user; the database record
 * is still the source of truth for agency, role and status.
 */
export const authenticate = async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
  try {
    const token = bearerToken(req);
    if (!token) throw AppError.unauthorized('Authorization: Bearer <accessToken> header is required');

    const payload = verifyAccessToken(token);
    const user = await UserModel.findById(payload.sub).exec();
    if (!user) throw AppError.unauthorized('Account no longer exists');

    if (String(user.agencyId) !== payload.aid || user.role !== payload.role) {
      throw AppError.unauthorized('Token does not match the current account');
    }
    if ((user.tokenVersion ?? 0) !== (payload.ver ?? 0)) {
      throw AppError.unauthorized('Session was invalidated; please sign in again');
    }
    if (user.status === 'DISABLED') {
      throw AppError.forbidden('This account has been disabled');
    }
    if (user.status === 'PENDING') {
      throw new AppError(
        403,
        ErrorCode.ACCOUNT_PENDING,
        'This account is awaiting agency approval'
      );
    }

    req.auth = await buildAuthContext(user);
    next();
  } catch (error) {
    next(error);
  }
};

/** Same as `authenticate` but allows pending customers to read their own profile. */
export const authenticateAllowPending = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const token = bearerToken(req);
    if (!token) throw AppError.unauthorized('Authorization: Bearer <accessToken> header is required');
    const payload = verifyAccessToken(token);
    const user = await UserModel.findById(payload.sub).exec();
    if (!user) throw AppError.unauthorized('Account no longer exists');
    if (String(user.agencyId) !== payload.aid || user.role !== payload.role) {
      throw AppError.unauthorized('Token does not match the current account');
    }
    if (user.status === 'DISABLED') throw AppError.forbidden('This account has been disabled');

    req.auth = await buildAuthContext(user);
    next();
  } catch (error) {
    next(error);
  }
};
