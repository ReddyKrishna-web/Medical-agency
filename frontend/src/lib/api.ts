import axios, { AxiosError, type AxiosInstance, type InternalAxiosRequestConfig } from 'axios';
import type {
  AgencySummary,
  ApiEnvelope,
  ApiErrorBody,
  PublicAgencyOption,
  PublicContactInput,
  PublicContactResult,
  SearchResponse,
} from '@/types/api';

const API_URL = (import.meta.env.VITE_API_URL || 'http://localhost:5000/api').replace(/\/$/, '');

let accessToken: string | null = null;
let refreshPromise: Promise<string | null> | null = null;
let sessionExpiredHandler: (() => void) | null = null;

export class ApiError extends Error {
  status: number;
  code: string;
  details?: unknown;

  constructor(message: string, status = 0, code = 'NETWORK_ERROR', details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const setAccessToken = (token: string | null) => {
  accessToken = token;
};

export const getAccessToken = () => accessToken;

export const setSessionExpiredHandler = (handler: () => void) => {
  sessionExpiredHandler = handler;
};

async function refreshAccessToken() {
  if (!refreshPromise) {
    refreshPromise = axios
      .post<ApiEnvelope<{ accessToken: string }>>(`${API_URL}/auth/refresh`, {}, { withCredentials: true })
      .then(({ data }) => {
        const token = data.data.accessToken;
        setAccessToken(token);
        return token;
      })
      .catch(() => {
        setAccessToken(null);
        return null;
      })
      .finally(() => {
        refreshPromise = null;
      });
  }
  return refreshPromise;
}

const client: AxiosInstance = axios.create({
  baseURL: API_URL,
  withCredentials: true,
  timeout: 20000,
});

client.interceptors.request.use((config) => {
  if (accessToken) config.headers.Authorization = `Bearer ${accessToken}`;
  return config;
});

client.interceptors.response.use((response) => response, async (error: AxiosError<ApiErrorBody>) => {
  const original = error.config as (InternalAxiosRequestConfig & { _retry?: boolean }) | undefined;
  const status = error.response?.status;

  if (status === 401 && original && !original._retry && !original.url?.includes('/auth/refresh')) {
    original._retry = true;
    const token = await refreshAccessToken();
    if (token) {
      original.headers.Authorization = `Bearer ${token}`;
      return client(original);
    }
    sessionExpiredHandler?.();
  }

  const body = error.response?.data?.error;
  return Promise.reject(
    new ApiError(
      body?.message ||
        (error.code === 'ECONNABORTED'
          ? 'The request timed out. Please try again.'
          : 'Unable to reach the service. Check your connection and try again.'),
      status || 0,
      body?.code || error.code || 'REQUEST_FAILED',
      body?.details,
    ),
  );
});

export interface RequestOptions {
  params?: Record<string, unknown>;
  headers?: Record<string, string>;
  signal?: AbortSignal;
}

/** Query params: drops empty values so optional filters are never sent as `''`. */
export const cleanParams = (params?: Record<string, unknown>): Record<string, unknown> | undefined => {
  if (!params) return undefined;
  const entries = Object.entries(params).filter(([, value]) => value !== undefined && value !== null && value !== '');
  return entries.length ? Object.fromEntries(entries) : undefined;
};

export async function api<T>(path: string, options: RequestOptions = {}): Promise<T> {
  try {
    const { data } = await client.get<ApiEnvelope<T>>(path, { ...options, params: cleanParams(options.params) });
    return data.data;
  } catch (error) {
    throw asApiError(error);
  }
}

export async function apiMeta<T>(path: string, options: RequestOptions = {}): Promise<{ data: T; meta: Record<string, unknown> }> {
  try {
    const { data } = await client.get<ApiEnvelope<T>>(path, { ...options, params: cleanParams(options.params) });
    return { data: data.data, meta: data.meta ?? {} };
  } catch (error) {
    throw asApiError(error);
  }
}

export async function apiSend<T>(
  method: 'post' | 'put' | 'patch' | 'delete',
  path: string,
  body?: unknown,
  options: RequestOptions = {},
): Promise<T> {
  try {
    const isMultipart = typeof FormData !== 'undefined' && body instanceof FormData;
    const config: RequestOptions = {
      ...options,
      params: cleanParams(options.params),
      // Let the browser set the multipart boundary; never hard-code it.
      headers: { ...(isMultipart ? {} : { 'Content-Type': 'application/json' }), ...(options.headers ?? {}) },
    };
    const { data } = await client.request<ApiEnvelope<T>>({ url: path, method, data: body, ...config });
    return data.data;
  } catch (error) {
    throw asApiError(error);
  }
}

/**
 * Authenticated binary download. `GET /requirements/:id/file` is behind the
 * bearer token, so a raw anchor or `window.open` cannot work.
 */
export async function apiBlob(path: string, options: RequestOptions = {}): Promise<Blob> {
  try {
    const { data } = await client.get<Blob>(path, { ...options, params: cleanParams(options.params), responseType: 'blob' });
    return data;
  } catch (error) {
    throw asApiError(error, true);
  }
}

function asApiError(error: unknown, isBlob = false): ApiError {
  if (error instanceof ApiError) return error;
  if (isBlob && axios.isAxiosError(error)) {
    // A blob error response hides the JSON envelope; surface a readable message.
    const message = extractBlobErrorMessage(error.response?.data) ?? 'The file could not be downloaded.';
    return new ApiError(message, error.response?.status ?? 0, 'REQUEST_FAILED');
  }
  return new ApiError('An unexpected error occurred.');
}

function extractBlobErrorMessage(data: unknown): string | null {
  if (!(data instanceof Blob)) return null;
  // Blob.text() is async; the synchronous path can only detect the MIME type.
  return data.type.includes('application/json')
    ? 'The service rejected the file download. Sign in again or ask an administrator for access.'
    : null;
}

/** Triggers a browser download for an already-fetched blob. */
export function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.rel = 'noopener';
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/** Endpoints reachable without a session. */
export const publicApi = {
  agency: () => api<AgencySummary>('/public/agency'),
  /** Public names of agencies an applicant can join at registration. */
  agencies: () => api<{ rows: PublicAgencyOption[] }>('/public/agencies'),
  contact: (input: PublicContactInput) => apiSend<PublicContactResult>('post', '/public/contact', input),
};

/** `GET /search` is authenticated and tenant scoped. */
export const searchApi = {
  global: (q: string, limit = 10) => api<SearchResponse>('/search', { params: { q, limit } }),
};

export { API_URL, refreshAccessToken };
