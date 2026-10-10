import path from 'node:path';
import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config({ path: path.resolve(process.cwd(), '.env'), override: false });

const booleanish = z
  .string()
  .transform((value) => ['true', '1', 'yes', 'on'].includes(value.trim().toLowerCase()));

const optionalString = z
  .string()
  .optional()
  .transform((value) => {
    const trimmed = value?.trim();
    return trimmed && trimmed.length > 0 ? trimmed : undefined;
  });

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().min(1).max(65535).default(5000),
    SERVER_URL: z.string().min(1).default('http://localhost:5000'),
    CLIENT_URL: z.string().default('http://localhost:5173'),
    CORS_EXTRA_ORIGINS: z.string().optional().default(''),
    TRUST_PROXY: z.coerce.number().int().min(0).max(10).default(0),

    MONGODB_URI: z.string().min(1).default('mongodb://127.0.0.1:27017/supply-medicals'),
    ALLOW_TRANSACTIONS: booleanish.default('true'),
    MONGODB_SERVER_SELECTION_TIMEOUT_MS: z.coerce.number().int().min(1000).default(10000),

    JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
    JWT_REFRESH_SECRET: z.string().min(32, 'JWT_REFRESH_SECRET must be at least 32 characters'),
    JWT_ACCESS_EXPIRES_IN: z.string().default('15m'),
    JWT_REFRESH_EXPIRES_IN: z.string().default('7d'),
    COOKIE_NAME: z.string().default('sm_refresh_token'),
    COOKIE_SAME_SITE: z.enum(['lax', 'strict', 'none']).default('lax'),
    BCRYPT_ROUNDS: z.coerce.number().int().min(4).max(15).default(12),

    FILE_STORAGE_CONFIG: z.enum(['local', 's3']).default('local'),
    LOCAL_STORAGE_PATH: z.string().default('./storage/uploads'),
    MAX_FILE_SIZE_MB: z.coerce.number().min(0.1).max(200).default(10),
    S3_BUCKET: optionalString,
    S3_REGION: optionalString,
    S3_ENDPOINT: optionalString,
    S3_ACCESS_KEY_ID: optionalString,
    S3_SECRET_ACCESS_KEY: optionalString,
    S3_FORCE_PATH_STYLE: booleanish.default('false'),

    AI_API_KEY: optionalString,
    AI_API_BASE_URL: z.string().default('https://api.openai.com/v1'),
    AI_MODEL: z.string().default('gpt-4.1-mini'),
    AI_TIMEOUT_MS: z.coerce.number().int().min(1000).max(300000).default(45000),
    AI_REQUIREMENT_MIN_CONFIDENCE: z.coerce.number().min(0.5).max(1).default(0.75),

    EMAIL_CONFIG: z.enum(['console', 'smtp', 'disabled']).default('console'),
    SMTP_HOST: optionalString,
    SMTP_PORT: z.coerce.number().int().min(1).max(65535).default(587),
    SMTP_SECURE: booleanish.default('false'),
    SMTP_USER: optionalString,
    SMTP_PASS: optionalString,
    EMAIL_FROM: z.string().default('Supply Medicals <no-reply@example.com>'),

    RATE_LIMIT_WINDOW_MS: z.coerce.number().int().min(1000).default(900_000),
    RATE_LIMIT_MAX: z.coerce.number().int().min(1).default(600),
    AUTH_RATE_LIMIT_MAX: z.coerce.number().int().min(1).default(40),
    LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error', 'silent']).default('info'),

    SEED_ADMIN_EMAIL: z.string().default('admin@demo.supplymedicals.test'),
    SEED_ADMIN_PASSWORD: optionalString,
    SEED_SALESMAN_EMAIL: z.string().default('salesman@demo.supplymedicals.test'),
    SEED_SALESMAN_PASSWORD: optionalString,
    SEED_CUSTOMER_EMAIL: z.string().default('owner@demo.supplymedicals.test'),
    SEED_CUSTOMER_PASSWORD: optionalString,
    SEED_PENDING_CUSTOMER_EMAIL: z.string().default('pending@demo.supplymedicals.test'),
    SEED_PENDING_CUSTOMER_PASSWORD: optionalString
  })
  .superRefine((value, ctx) => {
    if (value.JWT_SECRET === value.JWT_REFRESH_SECRET) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['JWT_REFRESH_SECRET'],
        message: 'JWT_REFRESH_SECRET must be different from JWT_SECRET'
      });
    }
    if (value.NODE_ENV === 'production') {
      const placeholders = ['replace-with', 'changeme', 'example-secret'];
      for (const key of ['JWT_SECRET', 'JWT_REFRESH_SECRET'] as const) {
        if (placeholders.some((needle) => value[key].toLowerCase().includes(needle))) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: [key],
            message: `${key} still contains a placeholder value; generate a unique secret`
          });
        }
      }
      if (value.COOKIE_SAME_SITE === 'none') {
        // allowed, but secure cookies are mandatory in production
      }
    }
    if (value.FILE_STORAGE_CONFIG === 's3') {
      const missing = (['S3_BUCKET', 'S3_REGION', 'S3_ACCESS_KEY_ID', 'S3_SECRET_ACCESS_KEY'] as const).filter(
        (key) => !value[key]
      );
      if (missing.length > 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['FILE_STORAGE_CONFIG'],
          message: `FILE_STORAGE_CONFIG=s3 requires: ${missing.join(', ')}`
        });
      }
    }
    if (value.EMAIL_CONFIG === 'smtp') {
      const missing = (['SMTP_HOST', 'SMTP_USER', 'SMTP_PASS'] as const).filter((key) => !value[key]);
      if (missing.length > 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['EMAIL_CONFIG'],
          message: `EMAIL_CONFIG=smtp requires: ${missing.join(', ')}`
        });
      }
    }
  });

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const details = parsed.error.issues
    .map((issue) => `  - ${issue.path.join('.') || 'env'}: ${issue.message}`)
    .join('\n');
  // Fail fast and loudly: a misconfigured environment must never boot a server.
  throw new Error(`Invalid environment configuration:\n${details}`);
}

const raw = parsed.data;

const splitList = (value: string): string[] =>
  value
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item.length > 0);

const clientOrigins = Array.from(
  new Set([...splitList(raw.CLIENT_URL), ...splitList(raw.CORS_EXTRA_ORIGINS ?? '')])
);

export type AppEnvironment = typeof raw;

export const env = {
  ...raw,
  isProduction: raw.NODE_ENV === 'production',
  isDevelopment: raw.NODE_ENV === 'development',
  isTest: raw.NODE_ENV === 'test',
  corsOrigins: clientOrigins,
  maxFileSizeBytes: Math.floor(raw.MAX_FILE_SIZE_MB * 1024 * 1024),
  storagePath: path.isAbsolute(raw.LOCAL_STORAGE_PATH)
    ? raw.LOCAL_STORAGE_PATH
    : path.resolve(process.cwd(), raw.LOCAL_STORAGE_PATH),
  serviceName: 'supply-medicals-api',
  apiVersion: '1'
} as const;

export type Env = typeof env;
