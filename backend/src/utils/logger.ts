type Level = 'debug' | 'info' | 'warn' | 'error';

import { env } from '../config/env';

const LEVEL_ORDER: Record<Level | 'silent', number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
  silent: 100
};

const REDACTED_KEYS = new Set([
  'password',
  'newpassword',
  'currentpassword',
  'passwordhash',
  'token',
  'accesstoken',
  'refreshtoken',
  'authorization',
  'cookie',
  'set-cookie',
  'jwtsecret',
  'jwtrefreshsecret',
  'apikey',
  'ai_api_key',
  'secretaccesskey',
  'accesskeyid'
]);

const isProductionLike = (): boolean => process.env.NODE_ENV === 'production' || process.env.NODE_ENV === 'test';

const sanitizeValue = (value: unknown, depth = 0): unknown => {
  if (depth > 4) return '[deep]';
  if (value === null || value === undefined) return value;
  if (value instanceof Date) return value.toISOString();
  if (value instanceof Error) return { name: value.name, message: value.message };
  if (Array.isArray(value)) return value.slice(0, 25).map((item) => sanitizeValue(item, depth + 1));
  if (typeof value === 'object') {
    const output: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      output[key] = REDACTED_KEYS.has(key.toLowerCase()) ? '[redacted]' : sanitizeValue(item, depth + 1);
    }
    return output;
  }
  return value;
};

class Logger {
  private readonly threshold: number;

  constructor(level: string) {
    this.threshold = LEVEL_ORDER[(level as Level) ?? 'info'] ?? LEVEL_ORDER.info;
  }

  private write(level: Level, message: string, meta?: Record<string, unknown>): void {
    if (LEVEL_ORDER[level] < this.threshold) return;
    const payload = {
      level,
      time: new Date().toISOString(),
      message,
      ...(meta ? { meta: sanitizeValue(meta) as Record<string, unknown> } : {})
    };

    if (!isProductionLike()) {
      const method = level === 'debug' ? 'log' : level;
      const fn = (console as unknown as Record<string, (...args: unknown[]) => void>)[method] ?? console.log;
      fn.call(console, `[${payload.time}] ${level.toUpperCase()} ${message}`, payload.meta ?? '');
      return;
    }

    const line = JSON.stringify(payload);
    if (level === 'error') process.stderr.write(`${line}\n`);
    else process.stdout.write(`${line}\n`);
  }

  debug(message: string, meta?: Record<string, unknown>): void {
    this.write('debug', message, meta);
  }

  info(message: string, meta?: Record<string, unknown>): void {
    this.write('info', message, meta);
  }

  warn(message: string, meta?: Record<string, unknown>): void {
    this.write('warn', message, meta);
  }

  error(message: string, meta?: Record<string, unknown>): void {
    this.write('error', message, meta);
  }
}

let current: Logger | null = null;

export const getLogger = (): Logger => {
  if (!current) {
    // The test harness sets LOG_LEVEL in global setup, before any module loads.
    current = new Logger(env.LOG_LEVEL);
  }
  return current;
};

export const logger = {
  debug: (message: string, meta?: Record<string, unknown>) => getLogger().debug(message, meta),
  info: (message: string, meta?: Record<string, unknown>) => getLogger().info(message, meta),
  warn: (message: string, meta?: Record<string, unknown>) => getLogger().warn(message, meta),
  error: (message: string, meta?: Record<string, unknown>) => getLogger().error(message, meta)
};

export type LoggerType = Logger;
