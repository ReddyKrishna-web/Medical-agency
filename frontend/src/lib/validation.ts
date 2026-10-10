/**
 * Client-side mirrors of the backend validation rules that the user can feel.
 * The API re-validates everything; these only avoid a pointless round trip.
 *
 * Sources: `backend/src/utils/password-policy.ts`, `backend/src/utils/email.ts`.
 */

import { z } from 'zod';

export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;

const COMMON_PASSWORDS = new Set([
  'password',
  'password1',
  'password123',
  '12345678',
  '123456789',
  'qwerty123',
  'admin123',
  'welcome123',
  'letmein123',
]);

export const PASSWORD_HINT = `At least ${PASSWORD_MIN_LENGTH} characters, mixing letters and numbers.`;

const weakPassword = (value: string): boolean => {
  const normalized = value.trim().toLowerCase();
  if (COMMON_PASSWORDS.has(normalized)) return true;
  if (/^(.)\1+$/.test(value)) return true;
  if (/^(0123456789|1234567890|abcdefghij)/i.test(normalized)) return true;
  return !(/[a-z]/i.test(value) && /\d/.test(value));
};

export const passwordField = z
  .string()
  .min(PASSWORD_MIN_LENGTH, `Password must be at least ${PASSWORD_MIN_LENGTH} characters`)
  .max(PASSWORD_MAX_LENGTH, `Password must be at most ${PASSWORD_MAX_LENGTH} characters`)
  .refine((value) => !weakPassword(value), 'Password must mix letters and numbers and must not be a common password');

/** Matches `emailPatterns.phone`. */
export const PHONE_PATTERN = /^\+?[0-9][0-9\s\-()]{6,19}$/;

export const phoneField = z
  .string()
  .trim()
  .regex(PHONE_PATTERN, 'Enter a valid phone number');

export const optionalPhoneField = z
  .string()
  .trim()
  .refine((value) => value === '' || PHONE_PATTERN.test(value), 'Enter a valid phone number');

export const emailField = z.string().trim().email('Enter a valid email address').max(160);

export const objectIdField = z.string().regex(/^[a-f\d]{24}$/i, 'Must be a valid record id');

/** Cross-field confirmation used by every password form. */
export const withPasswordConfirmation = <T extends { password: string; confirmPassword: string }>(schema: z.ZodType<T>) =>
  schema.refine((data) => data.password === data.confirmPassword, {
    path: ['confirmPassword'],
    message: 'Passwords do not match',
  });
