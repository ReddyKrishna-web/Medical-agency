import { describe, expect, it } from 'vitest';
import {
  mapContactSubmission,
  mapCustomer,
  mapInventoryMovement,
  mapProduct,
  mapRequirement,
  productStock,
} from '@/lib/adapters';
import { buildCustomerNotePayload } from '@/lib/payloads';

describe('remaining integration adapters', () => {
  it('maps server sellable units and availability into the catalog view', () => {
    const product = mapProduct({
      _id: 'p1',
      name: 'Paracetamol 500mg',
      sku: 'PARA-500',
      availableStock: 42,
      availability: 'LOW_STOCK',
      reorderLevel: 50,
      price: 28,
    });
    expect(product.stockAvailable).toBe(42);
    expect(product.availability).toBe('LOW_STOCK');
    expect(productStock(product)).toBe(42);
  });

  it('maps CRM notes and last-contact signals without inventing them', () => {
    const customer = mapCustomer({
      _id: 'c1',
      businessName: 'Sri Sai Medicals',
      ownerName: 'Meera',
      status: 'ACTIVE',
      lastContactAt: '2026-09-26T10:00:00.000Z',
      lastContactType: 'CALL',
      accountNotes: [
        { _id: 'n1', text: 'Requested a quotation', byUserId: 'u1', byRole: 'SALESMAN', at: '2026-09-26T10:00:00.000Z' },
      ],
    });
    expect(customer.accountNotes).toHaveLength(1);
    expect(customer.accountNotes[0]).toMatchObject({ text: 'Requested a quotation', byRole: 'SALESMAN' });
    expect(customer.lastContactType).toBe('CALL');
    expect(customer.lastContactAt).toBe('2026-09-26T10:00:00.000Z');
    expect(buildCustomerNotePayload('  Called the customer  ', 'CALL')).toEqual({ text: 'Called the customer', type: 'CALL' });
  });

  it('maps the public contact inbox record', () => {
    const row = mapContactSubmission({
      _id: 'lead1',
      name: 'A Buyer',
      email: 'buyer@example.com',
      organisation: 'Buyer Pharmacy',
      topic: 'PRICING_REQUEST',
      message: 'Please share the price list.',
      status: 'NEW',
    });
    expect(row).toMatchObject({ id: 'lead1', name: 'A Buyer', topic: 'PRICING_REQUEST', status: 'NEW' });
  });

  it('maps a requirement extraction without treating unverified lines as confirmed', () => {
    const requirement = mapRequirement({
      _id: 'r1',
      title: 'September list',
      status: 'SUBMITTED',
      file: { originalName: 'list.csv', mimeType: 'text/csv', extension: '.csv', sizeBytes: 100 },
      extraction: {
        status: 'NEEDS_REVIEW',
        provider: 'deterministic-csv',
        items: [
          { _id: 'i1', rawText: 'Paracetamol', productId: 'p1', productName: 'Paracetamol', quantity: 20, confidence: 0.95, needsVerification: false },
          { _id: 'i2', rawText: 'Unknown item', confidence: 0.2, needsVerification: true },
        ],
      },
    });
    expect(requirement.extraction.status).toBe('NEEDS_REVIEW');
    expect(requirement.extraction.items[0]?.productId).toBe('p1');
    expect(requirement.extraction.items[1]?.needsVerification).toBe(true);
  });

  it('maps the signed stock movement ledger', () => {
    const movement = mapInventoryMovement({
      _id: 'm1',
      productId: { _id: 'p1', name: 'Gloves' },
      batchId: 'b1',
      batchNumber: 'B-01',
      inventoryId: 'i1',
      type: 'ORDER_COMMIT',
      direction: 'OUT',
      quantity: 10,
      balanceOnHand: 90,
      balanceReserved: 5,
      referenceNumber: 'SM-2026-000001',
    });
    expect(movement).toMatchObject({ direction: 'OUT', quantity: 10, balanceOnHand: 90, batchNumber: 'B-01' });
  });
});
