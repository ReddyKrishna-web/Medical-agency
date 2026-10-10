/**
 * Order draft (client-side only).
 *
 * A draft is a local convenience for building a basket. It is never submitted
 * as an order and it never mutates a historical order: reordering calls
 * `POST /orders/reorder` on the server, which re-prices the lines today.
 */

import type { ID } from '@/types/api';

const KEY = 'supply-medicals:order-draft';

export interface DraftLine {
  productId: ID;
  quantity: number;
}

export interface OrderDraft {
  items: DraftLine[];
  customerId?: ID;
  notes?: string;
  sourceOrderId?: ID;
  createdAt: string;
}

export function saveOrderDraft(draft: Omit<OrderDraft, 'createdAt'>) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify({ ...draft, createdAt: new Date().toISOString() }));
  } catch {
    // A draft is best effort; a blocked storage quota must never break ordering.
  }
}

export function getOrderDraft(): OrderDraft | null {
  try {
    const value = sessionStorage.getItem(KEY);
    if (!value) return null;
    const parsed = JSON.parse(value) as OrderDraft;
    if (!Array.isArray(parsed.items)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function clearOrderDraft() {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    // Ignore: the draft simply stays until the tab closes.
  }
}
