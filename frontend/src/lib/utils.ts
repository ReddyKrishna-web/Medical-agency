import { type ClassValue, clsx } from 'clsx';
import { format, formatDistanceToNow, isValid, parseISO } from 'date-fns';

/**
 * The API stores order/invoice money in the agency's currency; the schema
 * default is INR. Nothing here invents an exchange rate.
 */
export const DEFAULT_CURRENCY = 'INR';

export const cn = (...inputs: ClassValue[]) => clsx(inputs);

export function formatCurrency(value: number | string | undefined | null, currency: string = DEFAULT_CURRENCY) {
  if (value === undefined || value === null || value === '') return '—';
  const amount = typeof value === 'string' ? Number(value) : value;
  if (!Number.isFinite(amount)) return '—';
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency, maximumFractionDigits: 2 }).format(amount);
  } catch {
    return new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(amount);
  }
}

export function formatNumber(value: number | string | undefined | null) {
  if (value === undefined || value === null || value === '') return '—';
  const amount = typeof value === 'string' ? Number(value) : value;
  if (!Number.isFinite(amount)) return '—';
  return new Intl.NumberFormat().format(amount);
}

export function formatDate(value: string | Date | undefined | null, pattern = 'dd MMM yyyy') {
  if (!value) return '—';
  const date = typeof value === 'string' ? parseISO(value) : value;
  return isValid(date) ? format(date, pattern) : '—';
}

export function timeAgo(value: string | undefined | null) {
  if (!value) return '—';
  const date = parseISO(value);
  return isValid(date) ? formatDistanceToNow(date, { addSuffix: true }) : '—';
}

export function initials(name?: string) {
  return (name || '?')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();
}

export function fileSize(bytes?: number | null) {
  if (!bytes) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** `yyyy-MM-dd` for `<input type="date">` values. */
export const toDateInput = (value?: string | null) => (value ? value.slice(0, 10) : '');

export const toDateTimeInput = (value?: string | null) => (value ? value.slice(0, 16) : '');

export const errorMessage = (error: unknown, fallback = 'Something went wrong.') =>
  error instanceof Error && error.message ? error.message : fallback;
