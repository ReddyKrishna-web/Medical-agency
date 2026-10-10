import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { auth, createCustomerUser, createStockedProduct, createTenant, expectError, expectSuccess, getApp, idOf } from './helpers/fixtures';
import { RequirementUploadModel } from '../src/models/requirement-upload.model';
import { NotificationModel } from '../src/models/notification.model';

const PNG_BYTES = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
);

const PDF_BYTES = Buffer.from('%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n', 'utf8');
const CSV_BYTES = Buffer.from('product,quantity\nGloves,10\nMasks,5\n', 'utf8');
const EXE_BYTES = Buffer.from('MZ\x90\x00\x03\x00\x00\x00binary payload', 'utf8');

describe('platform surfaces', () => {
  it('reports health without authentication', async () => {
    const response = await request(getApp()).get('/api/health');
    expect(response.status).toBe(200);
    const data = expectSuccess(response.body) as {
      status: string;
      database: { connected: boolean; transactions: boolean };
    };
    expect(data.status).toBe('ok');
    expect(data.database.connected).toBe(true);
    expect(typeof data.database.transactions).toBe('boolean');
  });

  it('returns a structured 404 for an unknown route', async () => {
    const response = await request(getApp()).get('/api/does-not-exist');
    expect(response.status).toBe(404);
    const error = expectError(response.body);
    expect(error.code).toBe('NOT_FOUND');
    expect(error.message).toContain('/api/does-not-exist');
  });

  it('exposes the public agency profile', async () => {
    const response = await request(getApp()).get('/api/public/agency');
    expect(response.status).toBe(200);
    const data = expectSuccess(response.body) as { name?: string; contact?: { email: string } };
    expect(data.name).toBeTruthy();
    expect(data.contact?.email).toBeTruthy();
  });

  it('uploads a valid requirement file and serves it only to authorised users', async () => {
    const tenant = await createTenant('upload-ok');
    const customer = await createCustomerUser({
      agencyId: tenant.agencyId,
      email: 'upload-customer@test.local',
      businessName: 'Upload Shop'
    });

    const upload = await request(getApp())
      .post('/api/requirements')
      .set(...auth(customer.token))
      .field('title', 'Monthly requirement list')
      .attach('file', PNG_BYTES, { filename: 'requirement.png', contentType: 'image/png' });

    expect(upload.status).toBe(201);
    const created = expectSuccess(upload.body) as { id: string; file: { originalName: string; storageKey?: string } };
    expect(created.file.originalName).toBe('requirement.png');

    const stored = await RequirementUploadModel.findById(idOf(created)).lean();
    // Stored under a random key, never the user supplied name.
    expect(stored?.file.storageKey).toMatch(/requirements\/\d{6}\/[0-9a-f-]{36}\.png$/);
    expect(stored?.file.storageKey).not.toContain('requirement.png');
    expect(stored?.file.originalName).toBe('requirement.png');

    const download = await request(getApp())
      .get(`/api/requirements/${idOf(created)}/file`)
      .set(...auth(customer.token));
    expect(download.status).toBe(200);
    expect(download.headers['content-type']).toContain('image/png');

    // Another tenant cannot read it.
    const otherTenant = await createTenant('upload-other');
    const otherCustomer = await createCustomerUser({
      agencyId: otherTenant.agencyId,
      email: 'upload-other-customer@test.local',
      businessName: 'Other Upload Shop'
    });
    const forbidden = await request(getApp())
      .get(`/api/requirements/${idOf(created)}/file`)
      .set(...auth(otherCustomer.token));
    expect(forbidden.status).toBe(404);

    const anonymous = await request(getApp()).get(`/api/requirements/${idOf(created)}/file`);
    expect(anonymous.status).toBe(401);
  });

  it('rejects an executable disguised as a PDF', async () => {
    const tenant = await createTenant('upload-bad');
    const customer = await createCustomerUser({
      agencyId: tenant.agencyId,
      email: 'upload-bad-customer@test.local',
      businessName: 'Bad Upload Shop'
    });

    const response = await request(getApp())
      .post('/api/requirements')
      .set(...auth(customer.token))
      .field('title', 'Malicious file')
      .attach('file', EXE_BYTES, { filename: 'invoice.pdf', contentType: 'application/pdf' });

    expect(response.status).toBe(415);
    expect(expectError(response.body).code).toBe('UNSUPPORTED_MEDIA_TYPE');
    expect(await RequirementUploadModel.countDocuments({ agencyId: tenant.agencyId })).toBe(0);
  });

  it('rejects an unsupported extension outright', async () => {
    const tenant = await createTenant('upload-ext');
    const customer = await createCustomerUser({
      agencyId: tenant.agencyId,
      email: 'upload-ext-customer@test.local',
      businessName: 'Ext Upload Shop'
    });

    const response = await request(getApp())
      .post('/api/requirements')
      .set(...auth(customer.token))
      .field('title', 'Word document')
      .attach('file', PDF_BYTES, { filename: 'list.docx', contentType: 'application/pdf' });

    expect(response.status).toBe(415);
  });

  it('accepts CSV and PDF uploads', async () => {
    const tenant = await createTenant('upload-ok2');
    const customer = await createCustomerUser({
      agencyId: tenant.agencyId,
      email: 'upload-ok2-customer@test.local',
      businessName: 'Upload Shop Two'
    });

    const csv = await request(getApp())
      .post('/api/requirements')
      .set(...auth(customer.token))
      .field('title', 'CSV requirement')
      .attach('file', CSV_BYTES, { filename: 'requirement.csv', contentType: 'text/csv' });
    expect(csv.status).toBe(201);

    const pdf = await request(getApp())
      .post('/api/requirements')
      .set(...auth(customer.token))
      .field('title', 'PDF requirement')
      .attach('file', PDF_BYTES, { filename: 'prescription.pdf', contentType: 'application/pdf' });
    expect(pdf.status).toBe(201);
  });

  it('converts a requirement into a priced order', async () => {
    const tenant = await createTenant('upload-convert');
    const customer = await createCustomerUser({
      agencyId: tenant.agencyId,
      email: 'convert-customer@test.local',
      businessName: 'Convert Shop'
    });
    const product = await createStockedProduct({ agencyId: tenant.agencyId, name: 'Converted Product' });

    const upload = await request(getApp())
      .post('/api/requirements')
      .set(...auth(customer.token))
      .field('title', 'Need gloves')
      .attach('file', CSV_BYTES, { filename: 'need.csv', contentType: 'text/csv' });
    const requirementId = idOf(expectSuccess(upload.body));

    const review = await request(getApp())
      .post(`/api/requirements/${requirementId}/status`)
      .set(...auth(tenant.admin.token))
      .send({ status: 'ACCEPTED', note: 'Checked by the agency' });
    expect(review.status).toBe(200);

    const convert = await request(getApp())
      .post(`/api/requirements/${requirementId}/convert-order`)
      .set(...auth(tenant.admin.token))
      .send({ items: [{ productId: product._id.toString(), quantity: 4 }] });

    expect(convert.status).toBe(201);
    const converted = expectSuccess(convert.body) as { order: { source: string; grandTotal: number } };
    expect(converted.order.source).toBe('REQUIREMENT');

    const stored = await RequirementUploadModel.findById(requirementId).lean();
    expect(stored?.status).toBe('CONVERTED');
    expect(stored?.convertedOrderId).toBeTruthy();

    // A second conversion is refused.
    const again = await request(getApp())
      .post(`/api/requirements/${requirementId}/convert-order`)
      .set(...auth(tenant.admin.token))
      .send({ items: [{ productId: product._id.toString(), quantity: 1 }] });
    expect(again.status).toBe(409);
  });

  it('produces database-derived dashboard numbers', async () => {
    const tenant = await createTenant('reports');
    const customer = await createCustomerUser({
      agencyId: tenant.agencyId,
      email: 'reports-customer@test.local',
      businessName: 'Reports Shop'
    });
    const product = await createStockedProduct({
      agencyId: tenant.agencyId,
      name: 'Reported Product',
      price: 200,
      taxRate: 10,
      batches: [{ batchNumber: 'REP-1', quantity: 40, expiryInDays: 120 }]
    });

    const created = await request(getApp())
      .post('/api/orders')
      .set(...auth(customer.token))
      .send({ items: [{ productId: product._id.toString(), quantity: 2 }] });
    expect(created.status).toBe(201);
    const orderId = idOf(expectSuccess(created.body));

    for (const status of ['UNDER_REVIEW', 'CONFIRMED', 'PROCESSING', 'PACKED', 'DISPATCHED', 'DELIVERED']) {
      await request(getApp())
        .post(`/api/orders/${orderId}/status`)
        .set(...auth(tenant.admin.token))
        .send({ status })
        .expect(200);
    }

    const dashboard = await request(getApp()).get('/api/reports/dashboard').set(...auth(tenant.admin.token));
    expect(dashboard.status).toBe(200);
    const data = expectSuccess(dashboard.body) as {
      orders: { total: number; delivered: number; revenue: number; taxCollected: number };
      inventory: { sellableUnits: number };
      finance: { collectedAmount: number };
    };
    expect(data.orders.total).toBe(1);
    expect(data.orders.delivered).toBe(1);
    expect(data.orders.revenue).toBe(440);
    expect(data.orders.taxCollected).toBe(40);
    expect(data.inventory.sellableUnits).toBe(38);

    const ordersReport = await request(getApp()).get('/api/reports/orders').set(...auth(tenant.admin.token));
    expect(ordersReport.status).toBe(200);
    expect((expectSuccess(ordersReport.body) as { totals: { count: number } }).totals.count).toBe(1);

    const exportResponse = await request(getApp())
      .get('/api/reports/export?type=orders&format=csv')
      .set(...auth(tenant.admin.token));
    expect(exportResponse.status).toBe(200);
    expect(exportResponse.text).toContain('Order Number');
    expect(exportResponse.text).toContain('DELIVERED');
  });

  it('scopes the customer dashboard to their own records', async () => {
    const tenant = await createTenant('reports-scope');
    const mine = await createCustomerUser({
      agencyId: tenant.agencyId,
      email: 'scope-mine@test.local',
      businessName: 'Mine Shop'
    });
    const theirs = await createCustomerUser({
      agencyId: tenant.agencyId,
      email: 'scope-theirs@test.local',
      businessName: 'Theirs Shop'
    });
    const product = await createStockedProduct({ agencyId: tenant.agencyId, name: 'Scope Product' });

    await request(getApp())
      .post('/api/orders')
      .set(...auth(theirs.token))
      .send({ items: [{ productId: product._id.toString(), quantity: 1 }] })
      .expect(201);

    const dashboard = await request(getApp()).get('/api/reports/dashboard').set(...auth(mine.token));
    const data = expectSuccess(dashboard.body) as { orders: { total: number } };
    expect(data.orders.total).toBe(0);

    const ordersList = await request(getApp()).get('/api/orders').set(...auth(mine.token));
    const orders = expectSuccess(ordersList.body) as unknown as unknown[];
    expect(orders).toHaveLength(0);
  });

  it('records a payment against an invoice and refuses to overpay', async () => {
    const tenant = await createTenant('payments');
    const customer = await createCustomerUser({
      agencyId: tenant.agencyId,
      email: 'payments-customer@test.local',
      businessName: 'Payments Shop'
    });
    const product = await createStockedProduct({
      agencyId: tenant.agencyId,
      name: 'Paid Product',
      price: 100,
      taxRate: 0
    });

    const created = await request(getApp())
      .post('/api/orders')
      .set(...auth(customer.token))
      .send({ items: [{ productId: product._id.toString(), quantity: 3 }] });
    const orderId = idOf(expectSuccess(created.body));

    for (const status of ['UNDER_REVIEW', 'CONFIRMED', 'PROCESSING', 'PACKED', 'DISPATCHED', 'DELIVERED']) {
      await request(getApp())
        .post(`/api/orders/${orderId}/status`)
        .set(...auth(tenant.admin.token))
        .send({ status })
        .expect(200);
    }

    const invoices = await request(getApp()).get('/api/invoices').set(...auth(tenant.admin.token));
    const invoiceList = expectSuccess(invoices.body) as unknown as Array<{ _id: string; id: string; grandTotal: number }>;
    expect(invoiceList).toHaveLength(1);
    const invoiceId = invoiceList[0]?._id ?? invoiceList[0]?.id;

    const payment = await request(getApp())
      .post('/api/payments')
      .set(...auth(tenant.admin.token))
      .send({ invoiceId, customerId: customer.id.toString(), amount: 150, method: 'BANK_TRANSFER' });
    expect(payment.status).toBe(201);
    const created_ = expectSuccess(payment.body) as { reference: string };
    expect(created_.reference).toMatch(/^PAY-\d{4}-\d{6}$/);

    const overpay = await request(getApp())
      .post('/api/payments')
      .set(...auth(tenant.admin.token))
      .send({ invoiceId, customerId: customer.id.toString(), amount: 500, method: 'CASH' });
    expect(overpay.status).toBe(422);

    const settled = await request(getApp())
      .post('/api/payments')
      .set(...auth(tenant.admin.token))
      .send({ invoiceId, customerId: customer.id.toString(), amount: 150, method: 'CASH' });
    expect(settled.status).toBe(201);

    const invoiceAfter = await request(getApp())
      .get(`/api/invoices/${invoiceId}`)
      .set(...auth(tenant.admin.token));
    const invoiceData = expectSuccess(invoiceAfter.body) as { status: string; amountDue: number; amountPaid: number };
    expect(invoiceData.status).toBe('PAID');
    expect(invoiceData.amountDue).toBe(0);
    expect(invoiceData.amountPaid).toBe(300);

    const customerPayment = await request(getApp())
      .post('/api/payments')
      .set(...auth(customer.token))
      .send({ invoiceId, customerId: customer.id.toString(), amount: 10, method: 'CASH' });
    expect(customerPayment.status).toBe(403);
  });

  it('persists notifications for the order lifecycle and marks them read', async () => {
    const tenant = await createTenant('notifications');
    const customer = await createCustomerUser({
      agencyId: tenant.agencyId,
      email: 'notify-customer@test.local',
      businessName: 'Notify Shop'
    });
    const product = await createStockedProduct({ agencyId: tenant.agencyId, name: 'Notify Product' });

    const created = await request(getApp())
      .post('/api/orders')
      .set(...auth(customer.token))
      .send({ items: [{ productId: product._id.toString(), quantity: 1 }] });
    const orderId = idOf(expectSuccess(created.body));

    await request(getApp())
      .post(`/api/orders/${orderId}/status`)
      .set(...auth(tenant.admin.token))
      .send({ status: 'UNDER_REVIEW' })
      .expect(200);

    const list = await request(getApp()).get('/api/notifications').set(...auth(customer.token));
    expect(list.status).toBe(200);
    const payload = list.body as { data: unknown[]; meta: { unreadCount: number } };
    expect(payload.data.length).toBeGreaterThan(0);
    expect(payload.meta.unreadCount).toBeGreaterThan(0);

    const stored = await NotificationModel.countDocuments({ agencyId: tenant.agencyId, userId: customer.userId });
    expect(stored).toBeGreaterThan(0);

    const read = await request(getApp())
      .post('/api/notifications/read')
      .set(...auth(customer.token))
      .send({ all: true });
    expect(read.status).toBe(200);
    expect((expectSuccess(read.body) as { unreadCount: number }).unreadCount).toBe(0);
  });

  it('persists messages before emitting and marks them read', async () => {
    const tenant = await createTenant('messaging');
    const customer = await createCustomerUser({
      agencyId: tenant.agencyId,
      email: 'msg-owner@test.local',
      businessName: 'Message Shop'
    });

    const salesman = await request(getApp())
      .post('/api/salesmen')
      .set(...auth(tenant.admin.token))
      .send({ name: 'Messaging Salesman', email: 'msg-salesman@test.local', phone: '+91 90000 00007', password: 'TestPass123!' });
    expect(salesman.status).toBe(201);
    const salesmanUserId = (expectSuccess(salesman.body) as { userId: string }).userId;

    const sent = await request(getApp())
      .post('/api/messages')
      .set(...auth(customer.token))
      .send({ receiverId: salesmanUserId, body: 'Please send the quotation' });
    expect(sent.status).toBe(201);
    const message = expectSuccess(sent.body) as { _id: string; body: string; conversationKey: string };
    expect(message.body).toBe('Please send the quotation');

    const conversation = await request(getApp())
      .get(`/api/messages?conversationWith=${salesmanUserId}`)
      .set(...auth(customer.token));
    expect(conversation.status).toBe(200);
    expect((expectSuccess(conversation.body) as unknown as unknown[]).length).toBe(1);

    const salesmanToken = await loginSalesman();
    const marked = await request(getApp())
      .post('/api/messages/read')
      .set(...auth(salesmanToken))
      .send({ conversationWith: customer.userId.toString() });
    expect(marked.status).toBe(200);
    expect((expectSuccess(marked.body) as { updated: number }).updated).toBe(1);

    const conversations = await request(getApp()).get('/api/messages/conversations').set(...auth(customer.token));
    expect(conversations.status).toBe(200);
    const list = expectSuccess(conversations.body) as unknown as Array<{ unreadCount: number }>;
    expect(list[0]?.unreadCount).toBe(0);
  });

  it('reports AI as not configured instead of inventing an answer', async () => {
    const tenant = await createTenant('ai');
    const status = await request(getApp()).get('/api/ai/status').set(...auth(tenant.admin.token));
    expect(status.status).toBe(200);
    const statusData = expectSuccess(status.body) as { configured: boolean; reason: string | null };
    expect(statusData.configured).toBe(false);
    expect(statusData.reason).toContain('AI_API_KEY');

    const ask = await request(getApp())
      .post('/api/ai/ask')
      .set(...auth(tenant.admin.token))
      .send({ question: 'What were the top selling products last month?' });
    expect(ask.status).toBe(503);
    expect(expectError(ask.body).code).toBe('AI_NOT_CONFIGURED');
  });

  it('updates agency settings for admins only', async () => {
    const tenant = await createTenant('settings');
    const update = await request(getApp())
      .patch('/api/settings')
      .set(...auth(tenant.admin.token))
      .send({ orderSettings: { prefix: 'ZZ', lowStockThreshold: 42, expiryAlertDays: 90 } });
    expect(update.status).toBe(200);

    const settings = expectSuccess(update.body) as {
      orderSettings: { prefix: string; lowStockThreshold: number; expiryAlertDays: number };
    };
    expect(settings.orderSettings.prefix).toBe('ZZ');
    expect(settings.orderSettings.lowStockThreshold).toBe(42);
    expect(settings.orderSettings.expiryAlertDays).toBe(90);

    const read = await request(getApp()).get('/api/settings').set(...auth(tenant.admin.token));
    const readData = expectSuccess(read.body) as { orderSettings: { prefix: string } };
    expect(readData.orderSettings.prefix).toBe('ZZ');
  });

  it('records activity entries for auditable actions', async () => {
    const tenant = await createTenant('activity');
    const created = await request(getApp())
      .post('/api/products')
      .set(...auth(tenant.admin.token))
      .send({ name: 'Activity Product', price: 50, taxRate: 5, unit: 'BOX' });
    expect(created.status).toBe(201);

    const activity = await request(getApp()).get('/api/activity?limit=50').set(...auth(tenant.admin.token));
    expect(activity.status).toBe(200);
    const entries = expectSuccess(activity.body) as unknown as Array<{ action: string; entity: string }>;
    expect(entries.length).toBeGreaterThan(0);
    expect(entries.some((entry) => entry.entity === 'Product')).toBe(true);
  });
});

/** Sign in the seeded salesman so message read receipts can be asserted. */
const loginSalesman = async (): Promise<string> => {
  const response = await request(getApp())
    .post('/api/auth/login')
    .send({ email: 'msg-salesman@test.local', password: 'TestPass123!' });
  if (response.status !== 200) throw new Error(`salesman login failed: ${response.status}`);
  return (response.body as { data: { accessToken: string } }).data.accessToken;
};
