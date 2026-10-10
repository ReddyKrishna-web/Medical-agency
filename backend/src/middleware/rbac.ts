import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { AppError } from '../utils/errors';
import type { AuthContext } from '../types/express';
import type { Role } from '../constants/domain';

export const requireRole =
  (...roles: Role[]): RequestHandler =>
  (req: Request, _res: Response, next: NextFunction): void => {
    const auth = req.auth;
    if (!auth) {
      next(AppError.unauthorized());
      return;
    }
    if (!roles.includes(auth.role)) {
      next(AppError.forbidden(`This action requires one of: ${roles.join(', ')}`));
      return;
    }
    next();
  };

export const allowRoles = (...roles: Role[]): RequestHandler => requireRole(...roles);

export const isAdminAuth = (auth: AuthContext): boolean => auth.role === 'AGENCY_ADMIN';
