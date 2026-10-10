import { z } from 'zod';

export const DEFAULT_LIMIT = 20;
export const MAX_LIMIT = 100;

export const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(MAX_LIMIT).default(DEFAULT_LIMIT),
  search: z.string().trim().max(120).optional(),
  sort: z.string().trim().max(120).optional()
});

export type ListQuery = z.infer<typeof listQuerySchema>;

export interface NormalizedListQuery {
  page: number;
  limit: number;
  search?: string;
  sort: Record<string, 1 | -1>;
  skip: number;
}

const SORT_DIRECTIONS: Record<string, 1 | -1> = { '-': -1, '': 1 };

/**
 * Parse a `sort` string such as `-createdAt,name` restricted to an allowlist of
 * real columns. Unknown columns are dropped so a client can never sort by
 * arbitrary/unindexed fields or inject operators.
 */
export const parseSort = (
  raw: string | undefined,
  allowed: readonly string[],
  fallback: Record<string, 1 | -1> = { createdAt: -1 }
): Record<string, 1 | -1> => {
  if (!raw) return fallback;
  const parsed: Record<string, 1 | -1> = {};
  for (const token of raw.split(',')) {
    const trimmed = token.trim();
    if (!trimmed) continue;
    const direction = SORT_DIRECTIONS[trimmed.charAt(0)] ?? 1;
    const field = direction === -1 ? trimmed.slice(1) : trimmed;
    if (allowed.includes(field)) {
      parsed[field] = direction;
    }
  }
  return Object.keys(parsed).length > 0 ? parsed : fallback;
};

export const normalizeListQuery = (
  query: z.infer<typeof listQuerySchema>,
  allowedSort: readonly string[],
  fallbackSort: Record<string, 1 | -1> = { createdAt: -1 }
): NormalizedListQuery => ({
  ...query,
  page: query.page,
  limit: query.limit,
  skip: (query.page - 1) * query.limit,
  sort: parseSort(query.sort, allowedSort, fallbackSort)
});

/** Search terms are always escaped before becoming a case-insensitive regex. */
export const searchRegex = (term: string | undefined, fields?: string[]): Record<string, unknown> | null => {
  if (!term) return null;
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const expression = new RegExp(escaped, 'i');
  if (!fields || fields.length === 0) return { $text: { $search: term } };
  return { $or: fields.map((field) => ({ [field]: expression })) };
};
