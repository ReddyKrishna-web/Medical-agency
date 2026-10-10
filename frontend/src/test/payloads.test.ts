import { describe, expect, it } from 'vitest';
import {
  buildAdjustStockPayload,
  buildAssignCustomersPayload,
  buildCategoryPayload,
  buildContactPayload,
  buildCustomerStatusPayload,
  buildCustomerUpdatePayload,
  buildExportParams,
  buildFollowUpCreatePayload,
  buildFollowUpStatusPayload,
  buildMarkMessagesReadPayload,
  buildMarkNotificationsReadPayload,
  buildOrderCancelPayload,
  buildOrderPayload,
  buildOrderStatusPayload,
  buildPaymentPayload,
  buildProductPayload,
  buildReceiveStockPayload,
  buildRegisterPayload,
  buildRequirementFormData,
  buildRequirementStatusPayload,
  buildReorderPayload,
  buildSalesmanCreatePayload,
  buildSalesmanStatusPayload,
  buildSalesmanUpdatePayload,
  buildSendMessagePayload,
  buildSettingsPayload,
  buildStockValidationPayload,
} from '@/lib/payloads';

describe('register payload', () => {
  it('sends exactly the registerSchema fields for a shop and never a role', () => {
    const payload = buildRegisterPayload({
      accountType: 'MEDICAL_SHOP',
      agencyId: '64b7f2c8a1b2c3d4e5f60711',
      name: '  Asha Rao ',
      email: ' asha@shop.com ',
      phone: '+91 98765 43210',
      password: 'sup3rSecret',
      businessName: ' Rao Medicals ',
      ownerName: 'Asha Rao',
      alternatePhone: '',
      address: { line1: '12 Market Road', line2: '', city: 'Pune', state: 'MH', country: 'India', postalCode: '411001' },
      gstNumber: ' 27ABCDE1234F1Z5 ',
      drugLicenseNumber: 'MH/20/2026',
      shopType: 'Medical shop',
    });

    expect(payload).toEqual({
      accountType: 'MEDICAL_SHOP',
      agencyId: '64b7f2c8a1b2c3d4e5f60711',
      name: 'Asha Rao',
      email: 'asha@shop.com',
      phone: '+91 98765 43210',
      password: 'sup3rSecret',
      businessName: 'Rao Medicals',
      ownerName: 'Asha Rao',
      address: {
        line1: '12 Market Road',
        city: 'Pune',
        state: 'MH',
        country: 'India',
        postalCode: '411001',
      },
      gstNumber: '27ABCDE1234F1Z5',
      drugLicenseNumber: 'MH/20/2026',
      shopType: 'Medical shop',
    });
    expect(payload).not.toHaveProperty('role');
    expect(payload).not.toHaveProperty('alternatePhone');
  });

  it('strips shop-only fields for a salesman registration', () => {
    const payload = buildRegisterPayload({
      accountType: 'SALESMAN',
      agencyId: '64b7f2c8a1b2c3d4e5f60711',
      name: 'Sam Mediator',
      email: 'sam@shop.com',
      phone: '+91 98765 43211',
      password: 'sup3rSecret',
    });

    expect(payload).toEqual({
      accountType: 'SALESMAN',
      agencyId: '64b7f2c8a1b2c3d4e5f60711',
      name: 'Sam Mediator',
      email: 'sam@shop.com',
      phone: '+91 98765 43211',
      password: 'sup3rSecret',
    });
    expect(payload).not.toHaveProperty('businessName');
    expect(payload).not.toHaveProperty('address');
  });
});

describe('product payload', () => {
  it('produces a JSON body matching createProductSchema', () => {
    const payload = buildProductPayload({
      name: ' N95 Mask ',
      sku: ' n95-01 ',
      categoryId: '64b7f2c8a1b2c3d4e5f60718',
      brand: 'SafeGuard',
      genericName: 'N95 respirator',
      manufacturer: 'MedLine',
      price: '250.5',
      mrp: '300',
      taxRate: '12',
      unit: 'box',
      packSize: '20 pcs',
      minOrderQuantity: '2',
      maxOrderQuantity: '50',
      imageUrl: ' https://cdn.example.com/n95.png ',
      reorderLevel: '15',
      tags: 'ppe, mask ',
      isActive: true,
      isFeatured: false,
    });

    expect(payload).toEqual({
      name: 'N95 Mask',
      sku: 'N95-01',
      categoryId: '64b7f2c8a1b2c3d4e5f60718',
      brand: 'SafeGuard',
      genericName: 'N95 respirator',
      manufacturer: 'MedLine',
      price: 250.5,
      mrp: 300,
      taxRate: 12,
      unit: 'box',
      packSize: '20 pcs',
      minOrderQuantity: 2,
      maxOrderQuantity: 50,
      imageUrl: 'https://cdn.example.com/n95.png',
      reorderLevel: 15,
      tags: ['ppe', 'mask'],
      isActive: true,
      isFeatured: false,
    });
  });

  it('omits optional fields rather than sending empty strings', () => {
    const payload = buildProductPayload({ name: 'Gloves', price: '', taxRate: '18', unit: 'BOX' });
    expect(payload).toEqual({ name: 'Gloves', price: 0, taxRate: 18, unit: 'BOX' });
    expect(payload).not.toHaveProperty('sku');
    expect(payload).not.toHaveProperty('imageUrl');
  });

  it('never sends a file or price-alias field the schema rejects', () => {
    const payload = buildProductPayload({ name: 'Gloves', price: 10, taxRate: 18, unit: 'BOX' });
    expect(payload).not.toHaveProperty('image');
    expect(payload).not.toHaveProperty('businessPrice');
    expect(payload).not.toHaveProperty('rejectionReason');
  });
});

describe('category payload', () => {
  it('matches createCategorySchema', () => {
    expect(
      buildCategoryPayload({ name: ' Consumables ', description: ' daily use ', parentId: '', displayOrder: '3', isActive: true }),
    ).toEqual({ name: 'Consumables', description: 'daily use', displayOrder: 3, isActive: true });
  });
});

describe('customer payload', () => {
  it('uses note, never rejectionReason, for a status change', () => {
    expect(buildCustomerStatusPayload('REJECTED', ' licence could not be verified ')).toEqual({
      status: 'REJECTED',
      note: 'licence could not be verified',
    });
    expect(buildCustomerStatusPayload('APPROVED')).toEqual({ status: 'APPROVED' });
  });

  it('only sends the fields that actually changed', () => {
    const original = { businessName: 'Rao Medicals', phone: '999', creditLimit: '0' };
    const changed = buildCustomerUpdatePayload({ ...original, businessName: 'Rao Medicals 2' }, original);
    expect(changed).toEqual({ businessName: 'Rao Medicals 2' });
  });

  it('sends null to unassign a salesman, and undefined to leave it untouched', () => {
    const original = { assignedSalesmanId: '64b7f2c8a1b2c3d4e5f60719' };
    expect(buildCustomerUpdatePayload({ assignedSalesmanId: null }, original)).toEqual({ assignedSalesmanId: null });
    expect(buildCustomerUpdatePayload({ assignedSalesmanId: '' }, original)).toEqual({});
  });
});

describe('salesman payload', () => {
  it('never sends a client-chosen password', () => {
    const payload = buildSalesmanCreatePayload({ name: 'Ravi', email: ' ravi@agency.com ', phone: '9000000000' });
    expect(payload).toEqual({ name: 'Ravi', email: 'ravi@agency.com', phone: '9000000000' });
    expect(payload).not.toHaveProperty('password');
    expect(payload).not.toHaveProperty('role');
  });

  it('matches updateSalesmanSchema and salesmanStatusSchema', () => {
    expect(buildSalesmanUpdatePayload({ employeeCode: ' sm-1 ', monthlyTarget: '50000' })).toEqual({
      employeeCode: 'SM-1',
      monthlyTarget: 50000,
    });
    expect(buildSalesmanStatusPayload('SUSPENDED', ' left the agency ')).toEqual({ status: 'SUSPENDED', note: 'left the agency' });
  });

  it('replaces the whole assignment set', () => {
    expect(buildAssignCustomersPayload(['a', 'b'])).toEqual({ customerIds: ['a', 'b'] });
  });
});

describe('order payload', () => {
  it('submits only product ids and quantities', () => {
    const payload = buildOrderPayload({
      customerId: '64b7f2c8a1b2c3d4e5f60718',
      items: [{ productId: 'p1', quantity: 3.9 }],
      notes: ' deliver before friday ',
    });
    expect(payload).toEqual({
      customerId: '64b7f2c8a1b2c3d4e5f60718',
      items: [{ productId: 'p1', quantity: 3 }],
      notes: 'deliver before friday',
    });
    expect(payload).not.toHaveProperty('subtotal');
    expect(payload).not.toHaveProperty('taxTotal');
    expect(payload).not.toHaveProperty('grandTotal');
  });

  it('omits customerId for a customer so the server resolves the account', () => {
    expect(buildOrderPayload({ items: [{ productId: 'p1', quantity: 1 }] })).toEqual({ items: [{ productId: 'p1', quantity: 1 }] });
  });

  it('sends only items to the stock validation endpoint', () => {
    expect(buildStockValidationPayload([{ productId: 'p1', quantity: 2 }])).toEqual({ items: [{ productId: 'p1', quantity: 2 }] });
  });

  it('reorders with the source orderId and never mutates history', () => {
    expect(buildReorderPayload('order-1', ' same again ')).toEqual({ orderId: 'order-1', notes: 'same again' });
  });

  it('uses note on status and reason on cancel', () => {
    expect(buildOrderStatusPayload('CONFIRMED', ' stock checked ')).toEqual({ status: 'CONFIRMED', note: 'stock checked' });
    expect(buildOrderCancelPayload(' customer changed the date ')).toEqual({ reason: 'customer changed the date' });
  });
});

describe('inventory payload', () => {
  it('matches receiveStockSchema', () => {
    expect(
      buildReceiveStockPayload({
        productId: 'p1',
        batchNumber: ' b-01 ',
        quantity: '20',
        unitCost: '12.5',
        expiryDate: '2027-01-31',
        mfgDate: '',
        supplier: 'Acme',
        manufacturer: 'MedLine',
        location: 'Rack A',
        reorderLevel: '5',
        note: '',
      }),
    ).toEqual({
      productId: 'p1',
      batchNumber: 'B-01',
      quantity: 20,
      unitCost: 12.5,
      expiryDate: '2027-01-31',
      supplier: 'Acme',
      manufacturer: 'MedLine',
      location: 'Rack A',
      reorderLevel: 5,
    });
  });

  it('adjusts by inventoryId and a signed delta, never by product or batch', () => {
    const payload = buildAdjustStockPayload({ inventoryId: 'inv-1', delta: -4, reason: ' stock count ' });
    expect(payload).toEqual({ inventoryId: 'inv-1', delta: -4, reason: 'stock count' });
    expect(payload).not.toHaveProperty('productId');
    expect(payload).not.toHaveProperty('batchNumber');
    expect(payload).not.toHaveProperty('quantity');
  });
});

describe('requirement payload', () => {
  it('uses multipart field "file" and requires title plus notes', () => {
    const file = new File(['x'], 'req.pdf', { type: 'application/pdf' });
    const form = buildRequirementFormData({ file, title: ' Restock ', notes: ' Q3 list ' });
    expect(form.get('file')).toBeInstanceOf(File);
    expect(form.get('title')).toBe('Restock');
    expect(form.get('notes')).toBe('Q3 list');
    expect(form.get('customerId')).toBeNull();
  });

  it('sends status with note', () => {
    expect(buildRequirementStatusPayload('ACCEPTED', ' pricing checked ')).toEqual({ status: 'ACCEPTED', note: 'pricing checked' });
  });
});

describe('follow-up payload', () => {
  it('creates with dueAt, type and optional relatedOrderId', () => {
    const payload = buildFollowUpCreatePayload({
      customerId: 'c1',
      title: ' Confirm order ',
      notes: ' called ',
      type: 'CALL',
      dueAt: '2026-04-01T09:30',
      relatedOrderId: 'o1',
    });
    expect(payload.customerId).toBe('c1');
    expect(payload.title).toBe('Confirm order');
    expect(payload.type).toBe('CALL');
    expect(new Date(payload.dueAt).getTime()).toBe(new Date('2026-04-01T09:30').getTime());
    expect(payload.relatedOrderId).toBe('o1');
  });

  it('uses a valid follow-up status on the status endpoint', () => {
    expect(buildFollowUpStatusPayload('COMPLETED', ' met the owner ')).toEqual({ status: 'COMPLETED', note: 'met the owner' });
  });
});

describe('notification and message payload', () => {
  it('uses notificationIds or all, never ids', () => {
    expect(buildMarkNotificationsReadPayload(['n1', 'n2'])).toEqual({ notificationIds: ['n1', 'n2'] });
    expect(buildMarkNotificationsReadPayload([], true)).toEqual({ all: true });
    expect(buildMarkNotificationsReadPayload([], false)).not.toHaveProperty('ids');
  });

  it('marks a whole conversation read', () => {
    expect(buildMarkMessagesReadPayload('u1')).toEqual({ conversationWith: 'u1' });
  });

  it('sends receiverId with the optional order reference', () => {
    expect(buildSendMessagePayload({ receiverId: 'u2', body: ' hello ', orderReference: ' SM-1 ' })).toEqual({
      receiverId: 'u2',
      body: 'hello',
      orderReference: 'SM-1',
    });
  });
});

describe('finance payload', () => {
  it('sends only schema fields for a payment', () => {
    expect(
      buildPaymentPayload({ customerId: 'c1', amount: '1500.5', method: 'UPI', invoiceId: 'i1', paidAt: '2026-04-01T10:00' }),
    ).toEqual({
      customerId: 'c1',
      amount: 1500.5,
      method: 'UPI',
      invoiceId: 'i1',
      paidAt: new Date('2026-04-01T10:00').toISOString(),
    });
  });

  it('does not invent a status on a payment', () => {
    const payload = buildPaymentPayload({ customerId: 'c1', amount: 10, method: 'CASH' });
    expect(payload).not.toHaveProperty('status');
    expect(payload).not.toHaveProperty('invoice');
  });
});

describe('settings payload', () => {
  const form = {
    name: 'Supply Medicals',
    legalName: '',
    website: '',
    description: '',
    logoUrl: '',
    contact: { email: 'Hello@Agency.com', phone: ' 9000000000 ', address: { line1: '1 Road', line2: '', city: 'Pune', state: 'MH', country: 'India', postalCode: '411001' } },
    tax: { gstNumber: '', defaultTaxRate: '18', pricesIncludeTax: false, invoicePrefix: 'inv' },
    orderSettings: {
      prefix: 'sm',
      padding: '6',
      lowStockThreshold: '20',
      expiryAlertDays: '60',
      allowCustomerCancellation: true,
      cancelWindowHours: '48',
      followUpDueDays: '7',
      invoiceDueDays: '15',
      defaultPaymentTermsDays: '0',
    },
    features: { aiEnabled: true, uploadsEnabled: true, socketEnabled: false },
    businessHours: {
      MONDAY: '09:00 - 18:00',
      TUESDAY: '09:00 - 13:00, 16:00 - 20:00',
      SATURDAY: 'closed all day',
      SUNDAY: null,
    },
    notifications: {
      email: {
        newOrder: true,
        orderStatusChange: true,
        paymentRecorded: false,
        inventoryLow: true,
        inventoryExpiring: true,
        requirementUploaded: false,
        followUpDue: true,
        contactSubmission: true,
      },
      quietHoursEnabled: true,
      quietHoursStart: '21:00',
      quietHoursEnd: '07:00',
    },
  };

  it('sends the nested agency shape, not a flat invented payload', () => {
    const payload = buildSettingsPayload(form);
    expect(payload).toMatchObject({
      name: 'Supply Medicals',
      contact: { email: 'hello@agency.com', phone: '9000000000' },
      tax: { defaultTaxRate: 18, pricesIncludeTax: false, invoicePrefix: 'INV' },
      orderSettings: { prefix: 'SM', padding: 6, lowStockThreshold: 20, expiryAlertDays: 60 },
      features: { aiEnabled: true, uploadsEnabled: true, socketEnabled: false },
    });
    expect(payload).toHaveProperty('contact.address.city', 'Pune');
    expect(payload).not.toHaveProperty('currency');
    expect(payload).not.toHaveProperty('notificationPreferences');
    expect(payload).not.toHaveProperty('lowStockThreshold');
  });

  it('sends free-text businessHours for all seven days, normalising a closed day to null', () => {
    const hours = buildSettingsPayload(form).businessHours as Record<string, string | null>;
    expect(hours.MONDAY).toBe('09:00 - 18:00');
    // A split shift is passed through verbatim.
    expect(hours.TUESDAY).toBe('09:00 - 13:00, 16:00 - 20:00');
    // Text that does not start with a time is treated as closed.
    expect(hours.SATURDAY).toBeNull();
    expect(hours.SUNDAY).toBeNull();
    expect(Object.keys(hours)).toHaveLength(7);
  });

  it('sends the nested notifications block with the quiet-hours window', () => {
    expect(buildSettingsPayload(form).notifications).toEqual({
      email: {
        newOrder: true,
        orderStatusChange: true,
        paymentRecorded: false,
        inventoryLow: true,
        inventoryExpiring: true,
        requirementUploaded: false,
        followUpDue: true,
        contactSubmission: true,
      },
      quietHoursEnabled: true,
      quietHoursStart: '21:00',
      quietHoursEnd: '07:00',
    });
  });
});

describe('misc payloads', () => {
  it('builds the export query with only supported keys', () => {
    expect(buildExportParams('orders', '2026-01-01', '2026-02-01')).toEqual({
      type: 'orders',
      format: 'csv',
      from: '2026-01-01',
      to: '2026-02-01',
    });
    expect(buildExportParams('invoices')).toEqual({ type: 'invoices', format: 'csv' });
  });

  it('builds the public contact body without empty optional fields', () => {
    expect(
      buildContactPayload({
        name: ' Asha ',
        email: ' a@b.com ',
        phone: '',
        organisation: ' Shop ',
        topic: 'SUPPORT',
        message: ' Hello there ',
      }),
    ).toEqual({ name: 'Asha', email: 'a@b.com', organisation: 'Shop', topic: 'SUPPORT', message: 'Hello there' });
  });

  it('omits a missing organisation, which the API treats as optional', () => {
    const payload = buildContactPayload({ name: 'Asha', email: 'a@b.com', topic: 'OTHER', message: 'Hello' });
    expect(payload).not.toHaveProperty('organisation');
    expect(payload).not.toHaveProperty('phone');
  });
});
