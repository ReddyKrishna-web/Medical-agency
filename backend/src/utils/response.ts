import type { Response } from 'express';
import { Types } from 'mongoose';
import { env } from '../config/env';

export interface PageMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}

export interface SuccessBody<T> {
  success: true;
  data: T;
  meta?: Record<string, unknown>;
}

export const buildPageMeta = (total: number, page: number, limit: number): PageMeta => {
  const totalPages = limit > 0 ? Math.ceil(total / limit) : 0;
  return {
    page,
    limit,
    total,
    totalPages,
    hasNextPage: page < totalPages,
    hasPreviousPage: page > 1
  };
};

const MAX_DEPTH = 12;

const isMongooseDocument = (value: unknown): boolean =>
  typeof value === 'object' &&
  value !== null &&
  typeof (value as { toJSON?: unknown }).toJSON === 'function' &&
  '$__' in (value as Record<string, unknown>);

/**
 * One response shape for every endpoint: ObjectIds become strings, every document
 * exposes both `_id` and a string `id`, and mongoose Maps become plain objects.
 * This keeps lean (list) and hydrated (single document) responses identical.
 */
export const normalizePayload = <T>(value: T, depth = 0): T => {
  if (depth > MAX_DEPTH) return value;
  if (value === null || value === undefined) return value;

  if (isMongooseDocument(value)) {
    return normalizePayload((value as unknown as { toJSON: () => unknown }).toJSON() as T, depth + 1);
  }

  if (value instanceof Types.ObjectId) return value.toString() as unknown as T;
  if (value instanceof Date) return value.toISOString() as unknown as T;
  if (Buffer.isBuffer(value)) return value;

  if (Array.isArray(value)) {
    return value.map((item) => normalizePayload(item, depth + 1)) as unknown as T;
  }

  if (typeof value === 'object') {
    if (value instanceof Map) {
      const asObject: Record<string, unknown> = {};
      for (const [key, item] of value.entries()) {
        asObject[String(key)] = normalizePayload(item, depth + 1);
      }
      return asObject as unknown as T;
    }

    const input = value as Record<string, unknown>;
    const output: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(input)) {
      if (key === '__v') continue;
      output[key] = normalizePayload(item, depth + 1);
    }
    if (output._id !== undefined && output.id === undefined) {
      output.id = String(output._id);
    }
    return output as unknown as T;
  }

  return value;
};

export const sendData = <T>(res: Response, data: T, statusCode = 200): Response => {
  const body: SuccessBody<T> = { success: true, data: normalizePayload(data) };
  return res.status(statusCode).json(body);
};

export const sendCreated = <T>(res: Response, data: T): Response => sendData(res, data, 201);

export const sendWithMeta = <T>(res: Response, data: T, meta: Record<string, unknown>): Response => {
  const body: SuccessBody<T> = { success: true, data: normalizePayload(data), meta };
  return res.status(200).json(body);
};

export const sendPaginated = <T>(
  res: Response,
  data: T[],
  total: number,
  page: number,
  limit: number
): Response =>
  sendWithMeta(res, data, buildPageMeta(total, page, limit) as unknown as Record<string, unknown>);

export const sendMessage = (res: Response, message: string, statusCode = 200): Response =>
  res.status(statusCode).json({ success: true, data: { message } });

export const serverOrigin = (): string => env.SERVER_URL.replace(/\/+$/, '');
