import mongoose, { Types } from 'mongoose';
import { AppError, ErrorCode } from './errors';

/** True when the value is a 12/24 character hex ObjectId. */
export const isObjectIdLike = (value: unknown): value is string =>
  typeof value === 'string' && /^[a-f\d]{24}$/i.test(value);

export const toObjectId = (value: unknown, field = 'id'): Types.ObjectId => {
  if (value instanceof Types.ObjectId) return value;
  if (!isObjectIdLike(value)) {
    throw AppError.badRequest(`Invalid ${field}`, [{ path: field, message: 'Must be a valid MongoDB ObjectId' }]);
  }
  return new Types.ObjectId(value);
};

export const toOptionalObjectId = (value: unknown, field = 'id'): Types.ObjectId | undefined =>
  value === undefined || value === null || value === '' ? undefined : toObjectId(value, field);

export const toObjectIdArray = (values: unknown[], field = 'ids'): Types.ObjectId[] =>
  values.map((value, index) => toObjectId(value, `${field}[${index}]`));

export const idEquals = (a: unknown, b: unknown): boolean => {
  if (!a || !b) return false;
  try {
    return new Types.ObjectId(String(a)).equals(new Types.ObjectId(String(b)));
  } catch {
    return false;
  }
};

export const objectIdOrNull = (value: unknown): Types.ObjectId | null => {
  if (value instanceof Types.ObjectId) return value;
  if (isObjectIdLike(value)) return new Types.ObjectId(value as string);
  return null;
};

export const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export { mongoose, Types, ErrorCode };
