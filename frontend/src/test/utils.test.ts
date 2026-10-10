import { describe, expect, it } from 'vitest';
import { fileSize, formatCurrency, formatDate, formatNumber, initials, toDateInput } from '@/lib/utils';
import {
  BATCH_STATUSES,
  FOLLOW_UP_STATUSES,
  FOLLOW_UP_TYPES,
  humanize,
  INVOICE_STATUSES,
  ORDER_STATUSES,
  PAYMENT_METHODS,
  REQUIREMENT_STATUSES,
  roleHome,
  roleWorkspace,
  statusTone,
} from '@/lib/status';
import { productAvailability, productStock } from '@/lib/adapters';
import type { Product } from '@/types/api';

describe('presentation utilities', () => {
  it('maps the order lifecycle to stable status tones', () => {
    expect(statusTone('PENDING')).toBe('amber');
    expect(statusTone('DISPATCHED')).toBe('blue');
    expect(statusTone('DELIVERED')).toBe('green');
    expect(statusTone('CANCELLED')).toBe('red');
    expect(statusTone('NOT_CONFIGURED')).toBe('slate');
  });

  it('humanizes business status labels', () => {
    expect(humanize('UNDER_REVIEW')).toBe('Under Review');
    expect(humanize('AWAITING_APPROVAL')).toBe('Awaiting Approval');
    expect(humanize(undefined)).toBe('—');
  });

  it('exposes the full order lifecycle including the terminal cancel state', () => {
    expect(ORDER_STATUSES).toEqual([
      'PENDING',
      'UNDER_REVIEW',
      'CONFIRMED',
      'PROCESSING',
      'PACKED',
      'DISPATCHED',
      'DELIVERED',
      'CANCELLED',
    ]);
  });

  it('exposes the real domain constant sets', () => {
    expect(INVOICE_STATUSES).toEqual(['ISSUED', 'PARTIALLY_PAID', 'PAID', 'VOID']);
    expect(REQUIREMENT_STATUSES).toEqual(['SUBMITTED', 'IN_REVIEW', 'ACCEPTED', 'REJECTED', 'CONVERTED']);
    expect(BATCH_STATUSES).toEqual(['ACTIVE', 'EXPIRED', 'DEPLETED', 'QUARANTINED']);
    expect(PAYMENT_METHODS).toEqual(['CASH', 'BANK_TRANSFER', 'UPI', 'CARD', 'CHEQUE', 'OTHER']);
    expect(FOLLOW_UP_TYPES).toEqual(['CALL', 'VISIT', 'WHATSAPP', 'EMAIL', 'OTHER']);
  });

  it('uses PENDING, not OPEN, as the first follow-up state and tolerates RESCHEDULED', () => {
    expect(FOLLOW_UP_STATUSES).toEqual(['PENDING', 'COMPLETED', 'RESCHEDULED', 'CANCELLED']);
    expect(FOLLOW_UP_STATUSES).not.toContain('OPEN');
  });

  it('uses the required role landing routes', () => {
    expect(roleHome.customer).toBe('/customer/dashboard');
    expect(roleHome.salesman).toBe('/salesman/dashboard');
    expect(roleHome.admin).toBe('/admin/dashboard');
    expect(roleWorkspace.admin).toBe('/admin');
  });
});

describe('number, currency, and file helpers', () => {
  it('formats money using the record currency rather than a hard-coded one', () => {
    expect(formatCurrency(1234.5, 'INR')).toMatch(/1,234\.50/);
    expect(formatCurrency(undefined)).toBe('—');
  });

  it('formats numbers, dates, and file sizes safely', () => {
    expect(formatNumber(1000)).toMatch(/1,000/);
    expect(formatNumber(undefined)).toBe('—');
    expect(formatDate(undefined)).toBe('—');
    expect(fileSize(1536)).toBe('1.5 KB');
    expect(initials('Supply Medicals')).toBe('SM');
  });

  it('produces a date input value from an ISO timestamp', () => {
    expect(toDateInput('2026-03-04T10:20:30.000Z')).toBe('2026-03-04');
    expect(toDateInput(undefined)).toBe('');
  });
});

describe('product availability helpers', () => {
  const base: Product = {
    id: 'p1',
    name: 'Surgical mask',
    sku: 'SKU-1',
    price: 100,
    taxRate: 18,
    unit: 'BOX',
    minOrderQuantity: 1,
    tags: [],
    isActive: true,
    isFeatured: false,
  };

  it('never invents stock when the endpoint does not expose it', () => {
    expect(productStock(base)).toBeUndefined();
    expect(productAvailability(base)).toBeUndefined();
  });

  it('derives sellable stock from on-hand minus reserved', () => {
    expect(productStock({ ...base, stockOnHand: 30, stockReserved: 12 })).toBe(18);
    // A server-supplied available count always wins.
    expect(productStock({ ...base, stockOnHand: 30, stockReserved: 12, stockAvailable: 5 })).toBe(5);
    // Reserved stock can never make the available count negative.
    expect(productStock({ ...base, stockOnHand: 5, stockReserved: 9 })).toBe(0);
  });

  it('passes through only a server-computed availability label', () => {
    expect(productAvailability({ ...base, availability: 'LOW_STOCK' })).toBe('LOW_STOCK');
    // The catalog endpoint returns no per-product stock, so nothing is inferred.
    expect(productAvailability({ ...base, stockOnHand: 0, reorderLevel: 10 })).toBeUndefined();
  });
});
