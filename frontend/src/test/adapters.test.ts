import { describe, expect, it } from 'vitest';
import {
  mapAgencySettings,
  mapAuthUser,
  mapBatches,
  mapConversations,
  mapCustomer,
  mapDashboard,
  mapFollowUps,
  mapInventoryRows,
  mapInvoice,
  mapMessages,
  mapOrder,
  mapOrderMutation,
  mapOrderTimeline,
  mapPayments,
  mapProvisionedSalesman,
  mapProducts,
  mapSalesmen,
  mapSearchResults,
} from '@/lib/adapters';
import { mapActivityLogs } from '@/lib/adapters';

const ID = '64b7f2c8a1b2c3d4e5f60718';

describe('auth/me adapter', () => {
  it('maps { user, profile } to one authenticated user with the customer profile attached', () => {
    const user = mapAuthUser({
      user: {
        _id: ID,
        name: 'Asha Rao',
        email: 'asha@shop.com',
        phone: '9999999999',
        role: 'CUSTOMER',
        status: 'ACTIVE',
        mustChangePassword: false,
        agencyId: ID,
      },
      profile: {
        _id: ID,
        businessName: 'Rao Medicals',
        ownerName: 'Asha Rao',
        phone: '9999999999',
        address: { line1: '1 Road', city: 'Pune', state: 'MH', country: 'India', postalCode: '411001' },
        status: 'ACTIVE',
        userId: ID,
      },
    });

    expect(user?.id).toBe(ID);
    expect(user?.role).toBe('customer');
    expect(user?.status).toBe('ACTIVE');
    expect(user?.customer?.businessName).toBe('Rao Medicals');
    expect(user?.customer?.address.city).toBe('Pune');
  });

  it('attaches the salesman profile and counts assigned customers', () => {
    const user = mapAuthUser({
      user: { _id: ID, name: 'Ravi', email: 'ravi@agency.com', role: 'SALESMAN', status: 'ACTIVE' },
      profile: { _id: ID, employeeCode: 'SM-1', territory: 'Pune', status: 'ACTIVE', customerIds: ['a', 'b'] },
    });
    expect(user?.salesman?.employeeCode).toBe('SM-1');
    expect(user?.salesman?.assignedCustomerCount).toBe(2);
  });

  it('returns null when the payload has no user', () => {
    expect(mapAuthUser({ user: null })).toBeNull();
    expect(mapAuthUser(undefined)).toBeNull();
  });
});

describe('salesman provisioning', () => {
  it('reads the one-time temporaryPassword when the backend returns it', () => {
    const result = mapProvisionedSalesman({ id: ID, employeeCode: 'SM-2', userId: ID, temporaryPassword: 'Temp#1234' });
    expect(result).toEqual({ id: ID, employeeCode: 'SM-2', userId: ID, temporaryPassword: 'Temp#1234', message: undefined });
  });

  it('leaves temporaryPassword undefined when the backend does not mint one', () => {
    expect(mapProvisionedSalesman({ id: ID, employeeCode: 'SM-3' }).temporaryPassword).toBeUndefined();
  });
});

describe('customer adapter', () => {
  it('reads businessName, ownerName, address and a populated assigned salesman', () => {
    const customer = mapCustomer({
      _id: ID,
      businessName: 'Rao Medicals',
      ownerName: 'Asha Rao',
      phone: '9999999999',
      address: { line1: '1 Road', city: 'Pune', state: 'MH', country: 'India', postalCode: '411001' },
      status: 'ACTIVE',
      userId: { _id: 'u1', name: 'Asha', email: 'asha@shop.com', status: 'ACTIVE' },
      assignedSalesmanId: { _id: 's1', employeeCode: 'SM-1', territory: 'Pune', status: 'ACTIVE' },
    });

    expect(customer.businessName).toBe('Rao Medicals');
    expect(customer.ownerName).toBe('Asha Rao');
    expect(customer.address.city).toBe('Pune');
    expect(customer.assignedSalesmanId).toBe('s1');
    expect(customer.assignedSalesman?.employeeCode).toBe('SM-1');
    expect(customer.userId).toBe('u1');
    expect(customer.user?.name).toBe('Asha');
    expect(customer.user?.email).toBe('asha@shop.com');
  });

  it('surfaces the status note rather than a rejectionReason', () => {
    const customer = mapCustomer({ _id: ID, businessName: 'X', status: 'REJECTED', statusNote: 'licence mismatch', userId: 'u1' });
    expect(customer.statusNote).toBe('licence mismatch');
    expect(customer).not.toHaveProperty('rejectionReason');
  });

  it('reads a last-order summary when the endpoint supplies it', () => {
    const customer = mapCustomer({ _id: ID, businessName: 'X', status: 'ACTIVE', userId: 'u1', lastOrderAt: '2026-02-01T00:00:00.000Z', lastOrderNumber: 'SM-2026-000009' });
    expect(customer.lastOrderAt).toBe('2026-02-01T00:00:00.000Z');
    expect(customer.lastOrderNumber).toBe('SM-2026-000009');
  });
});

describe('salesman adapter', () => {
  it('uses assignedCustomerCount and a populated userId', () => {
    const [salesman] = mapSalesmen([
      { _id: 's1', employeeCode: 'SM-1', status: 'ACTIVE', customerIds: ['a'], assignedCustomerCount: 7, userId: { _id: 'u1', name: 'Ravi', email: 'ravi@agency.com' } },
    ]);
    expect(salesman.assignedCustomerCount).toBe(7);
    expect(salesman.userId).toBe('u1');
    expect(salesman.user?.name).toBe('Ravi');
  });
});

describe('product adapter', () => {
  it('reads the real catalog fields including the newly added business fields', () => {
    const [product] = mapProducts([
      {
        _id: 'p1',
        name: 'N95 Mask',
        sku: 'SKU-1',
        category: { _id: 'cat1', name: 'PPE', slug: 'ppe' },
        brand: 'SafeGuard',
        genericName: 'N95 respirator',
        manufacturer: 'MedLine',
        price: 250,
        mrp: 300,
        taxRate: 12,
        unit: 'BOX',
        packSize: '20 pcs',
        minOrderQuantity: 1,
        reorderLevel: 10,
        isActive: true,
        isFeatured: false,
        tags: ['ppe'],
      },
    ]);

    expect(product).toMatchObject({
      id: 'p1',
      name: 'N95 Mask',
      sku: 'SKU-1',
      brand: 'SafeGuard',
      genericName: 'N95 respirator',
      manufacturer: 'MedLine',
      price: 250,
      mrp: 300,
      taxRate: 12,
      packSize: '20 pcs',
      reorderLevel: 10,
    });
    expect(product.category).toMatchObject({ id: 'cat1', name: 'PPE' });
  });

  it('defaults absent optional business fields to undefined rather than guessing', () => {
    const [product] = mapProducts([{ _id: 'p1', name: 'Gloves', sku: 'G1', price: 10, taxRate: 18, unit: 'BOX' }]);
    expect(product.genericName).toBeUndefined();
    expect(product.manufacturer).toBeUndefined();
    expect(product.mrp).toBeUndefined();
    expect(product.reorderLevel).toBeUndefined();
  });
});

describe('inventory adapters', () => {
  it('computes quantityAvailable from on-hand and reserved when absent', () => {
    const [row] = mapInventoryRows([
      { _id: 'i1', productId: 'p1', batchId: 'b1', batchNumber: 'B-1', expiryDate: '2027-01-01', quantityOnHand: 40, quantityReserved: 12, unitCost: 5, reorderLevel: 10, isActive: true },
    ]);
    expect(row.quantityAvailable).toBe(28);
  });

  it('reads real batch status and expiry flags', () => {
    const [batch] = mapBatches([{ _id: 'b1', productId: 'p1', batchNumber: 'B-1', expiryDate: '2026-01-01', status: 'EXPIRED', isExpired: true }]);
    expect(batch.status).toBe('EXPIRED');
    expect(batch.isExpired).toBe(true);
  });
});

describe('order adapter', () => {
  const raw = {
    _id: 'o1',
    orderNumber: 'SM-2026-000001',
    orderYear: 2026,
    customerId: 'c1',
    customerName: 'Rao Medicals',
    status: 'CONFIRMED',
    statusTimestamps: { PENDING: '2026-02-01T10:00:00.000Z', CONFIRMED: '2026-02-02T10:00:00.000Z' },
    timeline: [{ from: 'PENDING', to: 'CONFIRMED', at: '2026-02-02T10:00:00.000Z', byRole: 'AGENCY_ADMIN', note: 'stock allocated' }],
    currency: 'INR',
    subtotal: 500,
    taxTotal: 60,
    grandTotal: 560,
    source: 'CUSTOMER_PORTAL',
    allocationState: 'RESERVED',
    items: [
      {
        productId: 'p1',
        productName: 'N95 Mask',
        sku: 'SKU-1',
        unit: 'BOX',
        quantity: 2,
        unitPrice: 250,
        taxRate: 12,
        lineSubtotal: 500,
        taxAmount: 60,
        lineTotal: 560,
        allocations: [{ batchId: 'b1', inventoryId: 'i1', batchNumber: 'B-1', expiryDate: '2027-01-01', quantity: 2, committedQuantity: 0, releasedQuantity: 0 }],
      },
    ],
  };

  it('reads the authoritative totals, items, statusTimestamps and timeline', () => {
    const order = mapOrder(raw);
    expect(order.grandTotal).toBe(560);
    expect(order.taxTotal).toBe(60);
    expect(order.customerName).toBe('Rao Medicals');
    expect(order.statusTimestamps.CONFIRMED).toBe('2026-02-02T10:00:00.000Z');
    expect(order.items[0].allocations[0].batchNumber).toBe('B-1');
    expect(order.timeline[0].byRole).toBe('AGENCY_ADMIN');
  });

  it('unwraps the { order, previousStatus, status } status mutation', () => {
    const result = mapOrderMutation({ order: raw, previousStatus: 'UNDER_REVIEW', status: 'CONFIRMED' });
    expect(result.previousStatus).toBe('UNDER_REVIEW');
    expect(result.status).toBe('CONFIRMED');
    expect(result.order.orderNumber).toBe('SM-2026-000001');
  });

  it('reads the stock disposition from a cancel mutation', () => {
    const result = mapOrderMutation({ order: { ...raw, status: 'CANCELLED' }, previousStatus: 'CONFIRMED', status: 'CANCELLED', stockDisposition: 'RELEASED' });
    expect(result.stockDisposition).toBe('RELEASED');
  });

  it('reads the timeline endpoint wrapper', () => {
    const timeline = mapOrderTimeline({
      orderId: 'o1',
      orderNumber: 'SM-2026-000001',
      status: 'CONFIRMED',
      statusTimestamps: { PENDING: '2026-02-01T10:00:00.000Z' },
      timeline: [{ from: null, to: 'PENDING', at: '2026-02-01T10:00:00.000Z', byRole: 'CUSTOMER' }],
    });
    expect(timeline.orderNumber).toBe('SM-2026-000001');
    expect(timeline.timeline[0].from).toBeNull();
    expect(timeline.timeline[0].to).toBe('PENDING');
  });

  it('reads server-provided permissions', () => {
    const order = mapOrder({ ...raw, permissions: { canCancel: true, allowedTransitions: ['PROCESSING', 'CANCELLED'], allowedStatuses: ['PENDING'] } });
    expect(order.permissions?.canCancel).toBe(true);
    expect(order.permissions?.allowedTransitions).toEqual(['PROCESSING', 'CANCELLED']);
  });
});

describe('messaging adapters', () => {
  it('maps the real conversation shape with a partner object', () => {
    const conversations = mapConversations([
      {
        partner: { _id: 'u2', name: 'Ravi', email: 'ravi@agency.com', role: 'SALESMAN' },
        conversationKey: `${ID}:u2`.split(':').sort().join(':'),
        lastMessageAt: '2026-02-03T10:00:00.000Z',
        lastBody: 'Confirming the delivery date',
        unreadCount: 2,
      },
    ]);
    expect(conversations[0].partner.name).toBe('Ravi');
    expect(conversations[0].lastBody).toBe('Confirming the delivery date');
    expect(conversations[0].unreadCount).toBe(2);
    expect(conversations[0].lastMessageAt).toBe('2026-02-03T10:00:00.000Z');
  });

  it('falls back to an unknown partner rather than dropping the row', () => {
    const [conversation] = mapConversations([{ partner: { _id: 'gone' }, conversationKey: 'k', lastMessageAt: '', lastBody: '', unreadCount: 0 }]);
    expect(conversation.partner.name).toBe('Unknown user');
  });

  it('reads raw senderId/receiverId on message records', () => {
    const [message] = mapMessages([{ _id: 'm1', senderId: 'u1', receiverId: 'u2', body: 'hi', createdAt: '2026-02-03T10:00:00.000Z' }]);
    expect(message.senderId).toBe('u1');
    expect(message.receiverId).toBe('u2');
  });

  it('prefers populated sender/receiver when the deployment provides them', () => {
    const [message] = mapMessages([
      { _id: 'm1', senderId: 'u1', receiverId: 'u2', body: 'hi', createdAt: '2026-02-03T10:00:00.000Z', sender: { _id: 'u1', name: 'Asha' }, receiver: { _id: 'u2', name: 'Ravi' } },
    ]);
    expect(message.sender?.name).toBe('Asha');
    expect(message.receiver?.name).toBe('Ravi');
  });
});

describe('follow-up adapter', () => {
  it('reads PENDING and tolerates RESCHEDULED', () => {
    const rows = mapFollowUps([
      { _id: 'f1', customerId: { _id: 'c1', businessName: 'Rao Medicals' }, title: 'Call', type: 'CALL', dueAt: '2026-03-01T09:00:00.000Z', status: 'PENDING' },
      { _id: 'f2', customerId: { _id: 'c1', businessName: 'Rao Medicals' }, title: 'Visit', type: 'VISIT', dueAt: '2026-03-05T09:00:00.000Z', status: 'RESCHEDULED' },
    ]);
    expect(rows[0].status).toBe('PENDING');
    expect(rows[1].status).toBe('RESCHEDULED');
    expect(rows[0].dueAt).toBe('2026-03-01T09:00:00.000Z');
  });
});

describe('dashboard adapter', () => {
  it('reads the current nested shape', () => {
    const report = mapDashboard({
      agency: { id: ID, name: 'Supply Medicals' },
      scope: 'AGENCY_ADMIN',
      orders: { total: 20, delivered: 8, cancelled: 2, open: 10, revenue: 50000, taxCollected: 6000, averageOrderValue: 2500 },
      catalog: { activeProducts: 120, visibleCustomers: 45 },
      inventory: { sellableUnits: 900, stockValue: 40000, expiredUnits: 5, expiringUnits: 12, lowStockBatches: 7, outOfStockBatches: 1 },
      finance: { outstandingAmount: 9000, outstandingInvoices: 6, collectedAmount: 30000, paymentsRecorded: 14 },
      followUps: { pending: 5 },
      orderStatusBreakdown: [{ status: 'PENDING', count: 6, value: 12000 }],
    });

    expect(report.agency.name).toBe('Supply Medicals');
    expect(report.orders.total).toBe(20);
    expect(report.orders.revenue).toBe(50000);
    expect(report.catalog.visibleCustomers).toBe(45);
    expect(report.inventory.lowStockBatches).toBe(7);
    expect(report.finance.outstandingAmount).toBe(9000);
    expect(report.followUps.pending).toBe(5);
    expect(report.orderStatusBreakdown[0].status).toBe('PENDING');
  });

  it('reads the flat metrics block the dashboard now returns', () => {
    const report = mapDashboard({
      agency: { name: 'Supply Medicals' },
      metrics: {
        totalCustomers: 45,
        totalSalesmen: 6,
        totalProducts: 120,
        todayOrders: 4,
        todayDeliveredOrders: 1,
        pendingOrders: 9,
        underReviewOrders: 3,
        confirmedOrders: 2,
        processingOrders: 1,
        packedOrders: 1,
        dispatchedOrders: 2,
        deliveredOrders: 18,
        orderValue: 75000,
        totalRevenue: 75000,
        monthlyOrders: 12,
        monthlyRevenue: 31000,
        lowStock: 3,
        outOfStock: 1,
        expiringSoon: 4,
        expired: 2,
        followUpsDue: 5,
        unpaidAmount: 1500,
      },
      orders: { total: 30, delivered: 18, cancelled: 1, open: 11, revenue: 75000, taxCollected: 9000, averageOrderValue: 2500 },
      catalog: { activeProducts: 120, visibleCustomers: 45 },
      inventory: {
        sellableUnits: 900,
        stockValue: 40000,
        expiredUnits: 2,
        expiringUnits: 4,
        lowStockBatches: 3,
        outOfStockBatches: 1,
        lowStockProducts: 3,
        outOfStockProducts: 1,
        expiringSoonBatches: 4,
        expiredBatches: 2,
      },
      finance: { outstandingAmount: 1500, outstandingInvoices: 6, collectedAmount: 30000, paymentsRecorded: 14 },
      followUps: { pending: 5, due: 5 },
    });

    expect(report.metrics?.totalSalesmen).toBe(6);
    expect(report.metrics?.monthlyRevenue).toBe(31000);
    expect(report.orders.revenue).toBe(75000);
    expect(report.orders.open).toBe(11);
    expect(report.inventory.lowStockBatches).toBe(3);
    expect(report.followUps.pending).toBe(5);
    expect(report.finance.outstandingAmount).toBe(1500);
  });

  it('reads the new flat dashboard aliases when the nested blocks are absent', () => {
    const report = mapDashboard({
      agencyName: 'Supply Medicals',
      totalRevenue: 75000,
      totalOrders: 30,
      totalCustomers: 12,
      totalProducts: 60,
      lowStock: 3,
      expiringSoon: 4,
      pendingOrders: 9,
      deliveredOrders: 18,
      followUpsDue: 2,
      unpaidAmount: 1500,
      orderStatusBreakdown: [{ status: 'DELIVERED', count: 18, value: 75000 }],
    });

    expect(report.orders.revenue).toBe(75000);
    expect(report.orders.total).toBe(30);
    expect(report.catalog.visibleCustomers).toBe(12);
    expect(report.catalog.activeProducts).toBe(60);
    expect(report.inventory.lowStockBatches).toBe(3);
    expect(report.inventory.expiringUnits).toBe(4);
    expect(report.orders.open).toBe(9);
    expect(report.orders.delivered).toBe(18);
    expect(report.followUps.pending).toBe(2);
    expect(report.finance.outstandingAmount).toBe(1500);
  });

  it('returns zeroes rather than throwing on an empty payload', () => {
    const report = mapDashboard({});
    expect(report.orders.total).toBe(0);
    expect(report.catalog.activeProducts).toBe(0);
    expect(report.orderStatusBreakdown).toEqual([]);
  });
});

describe('settings adapter', () => {
  it('reads free-text business hours and the nested notifications block', () => {
    const settings = mapAgencySettings({
      _id: 'a1',
      name: 'Supply Medicals',
      slug: 'supply-medicals',
      status: 'ACTIVE',
      contact: {
        email: 'hi@agency.com',
        phone: '9000000000',
        address: { line1: '1 Road', city: 'Pune', state: 'MH', country: 'India', postalCode: '411001' },
      },
      tax: { gstNumber: '27ABC', defaultTaxRate: 18, pricesIncludeTax: false, invoicePrefix: 'INV' },
      orderSettings: { prefix: 'SM', padding: 6, lowStockThreshold: 20, expiryAlertDays: 60 },
      features: { aiEnabled: true, uploadsEnabled: true, socketEnabled: false },
      businessHours: { MONDAY: '09:00 - 18:00', SUNDAY: null, SATURDAY: '  ' },
      notifications: {
        email: { newOrder: true, orderStatusChange: false },
        quietHoursEnabled: true,
        quietHoursStart: '21:00',
        quietHoursEnd: '07:00',
      },
    });

    expect(settings.businessHours.MONDAY).toBe('09:00 - 18:00');
    expect(settings.businessHours.SUNDAY).toBeNull();
    // A blank string is stored as closed, not as an empty value.
    expect(settings.businessHours.SATURDAY).toBeNull();
    expect(settings.notifications.email.newOrder).toBe(true);
    expect(settings.notifications.email.orderStatusChange).toBe(false);
    expect(settings.notifications.quietHoursEnabled).toBe(true);
    expect(settings.notifications.quietHoursStart).toBe('21:00');
    expect(settings.orderSettings.lowStockThreshold).toBe(20);
  });
});

describe('finance adapters', () => {
  it('reads the real invoice fields', () => {
    const invoice = mapInvoice({
      _id: 'i1',
      invoiceNumber: 'INV-2026-000001',
      orderId: 'o1',
      orderNumber: 'SM-2026-000001',
      customerId: 'c1',
      customerName: 'Rao Medicals',
      agencySnapshot: {
        name: 'Supply Medicals',
        email: 'billing@agency.com',
        phone: '9000000000',
        address: { line1: '1 Road', city: 'Pune', state: 'MH', country: 'India', postalCode: '411001' },
      },
      lines: [{ productId: 'p1', productName: 'N95 Mask', sku: 'SKU-1', unit: 'BOX', quantity: 2, unitPrice: 250, taxRate: 12, taxAmount: 60, lineTotal: 560 }],
      currency: 'INR',
      subtotal: 500,
      taxTotal: 60,
      grandTotal: 560,
      amountPaid: 100,
      amountDue: 460,
      status: 'PARTIALLY_PAID',
      issuedAt: '2026-02-05T10:00:00.000Z',
      dueAt: '2026-02-20T10:00:00.000Z',
      paymentTermsDays: 15,
    });

    expect(invoice.invoiceNumber).toBe('INV-2026-000001');
    expect(invoice.orderNumber).toBe('SM-2026-000001');
    expect(invoice.customerName).toBe('Rao Medicals');
    expect(invoice.grandTotal).toBe(560);
    expect(invoice.amountDue).toBe(460);
    expect(invoice.status).toBe('PARTIALLY_PAID');
    expect(invoice.lines[0].lineTotal).toBe(560);
    expect(invoice).not.toHaveProperty('balanceDue');
  });

  it('reads payments with a populated customer reference', () => {
    const [payment] = mapPayments([
      { _id: 'pay1', reference: 'UTR-1', customerId: { _id: 'c1', businessName: 'Rao Medicals' }, amount: 500, method: 'UPI', paidAt: '2026-02-06T10:00:00.000Z' },
    ]);
    expect(payment.amount).toBe(500);
    expect(payment.method).toBe('UPI');
    expect(payment.customerId).toEqual({ id: 'c1', businessName: 'Rao Medicals' });
  });
});

describe('activity and search adapters', () => {
  it('reads action, entity, entityId, summary and a populated actor', () => {
    const [log] = mapActivityLogs([
      {
        _id: 'al1',
        action: 'order.create',
        entity: 'Order',
        entityId: 'o1',
        summary: 'Created order SM-2026-000001',
        actorRole: 'CUSTOMER',
        actorUserId: { _id: 'u1', name: 'Asha', email: 'asha@shop.com' },
        createdAt: '2026-02-01T10:00:00.000Z',
      },
    ]);
    expect(log.action).toBe('order.create');
    expect(log.entity).toBe('Order');
    expect(log.summary).toBe('Created order SM-2026-000001');
    expect(log.actorUserId).toMatchObject({ name: 'Asha' });
  });

  it('flattens the grouped global search output into navigable hits', () => {
    const result = mapSearchResults(
      {
        term: 'SM-1',
        total: 2,
        groups: [
          { type: 'orders', label: 'Orders', items: [{ id: 'o1', title: 'SM-2026-000001', subtitle: 'Rao Medicals', status: 'CONFIRMED', value: 560 }] },
          { type: 'customers', label: 'Customers', items: [{ id: 'c1', title: 'Rao Medicals', subtitle: 'Asha Rao' }] },
        ],
      },
      'admin',
    );

    expect(result.total).toBe(2);
    expect(result.hits).toHaveLength(2);
    expect(result.hits[0]).toMatchObject({ type: 'orders', title: 'SM-2026-000001', path: '/admin/orders/o1' });
    expect(result.hits[1].path).toBe('/admin/customers');
  });

  it('returns an empty hit list for an empty response', () => {
    expect(mapSearchResults({ term: 'x', groups: [], total: 0 }, 'customer').hits).toEqual([]);
  });
});
