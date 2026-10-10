import { z } from 'zod';
import { emailPatterns } from '../utils/email';
import { PASSWORD_MIN_LENGTH, PASSWORD_MAX_LENGTH } from '../utils/password-policy';

export const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Must be a valid MongoDB ObjectId');

export const trimmed = (min: number, max: number) => z.string().trim().min(min).max(max);

export const emailField = z.string().trim().toLowerCase().email().max(160);
export const phoneField = z.string().trim().regex(emailPatterns.phone, 'Enter a valid phone number');
export const passwordField = z
  .string()
  .min(PASSWORD_MIN_LENGTH, `Password must be at least ${PASSWORD_MIN_LENGTH} characters`)
  .max(PASSWORD_MAX_LENGTH, `Password must be at most ${PASSWORD_MAX_LENGTH} characters`);

export const addressSchema = z.object({
  line1: trimmed(3, 160),
  line2: trimmed(1, 160).optional(),
  city: trimmed(2, 80),
  state: trimmed(2, 80),
  country: trimmed(2, 80),
  postalCode: trimmed(2, 20)
});

export const idParamSchema = z.object({ id: objectId });

export const booleanish = z
  .union([z.boolean(), z.string()])
  .transform((value) => (typeof value === 'boolean' ? value : ['true', '1', 'yes'].includes(value.toLowerCase())));

export const optionalBoolean = booleanish.optional();

export const dateField = z
  .union([z.string(), z.date()])
  .transform((value) => (value instanceof Date ? value : new Date(value)))
  .refine((value) => !Number.isNaN(value.getTime()), 'Must be a valid date');

export const optionalDateField = dateField.optional();

export const isoDateQuery = z
  .string()
  .optional()
  .transform((value) => (value ? new Date(value) : undefined))
  .refine((value) => value === undefined || !Number.isNaN(value.getTime()), 'Invalid date');

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(120).optional(),
  sort: z.string().trim().max(120).optional()
});

export const moneyField = z.coerce.number().min(0).max(10_000_000);
export const quantityField = z.coerce.number().int().min(1).max(1_000_000);
export const nonNegativeQuantity = z.coerce.number().int().min(0).max(1_000_000);
