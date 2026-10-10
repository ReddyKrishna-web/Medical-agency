import { describe, expect, it } from 'vitest';
import request from 'supertest';
import {
  auth,
  createCustomerUser,
  createSalesmanUser,
  createStockedProduct,
  createTenant,
  expectError,
  expectSuccess,
  getApp,
  idOf,
  TEST_PASSWORD
} from './helpers/fixtures';
import { ContactSubmissionModel } from '../src/models/contact-submission.model';
import { ActivityLogModel } from '../src/models/activity-log.model';
import { UserModel } from '../src/models/user.model';
import { AgencyModel } from '../src/models/agency.model';
import { generateTemporaryPassword } from '../src/utils/crypto';
import { passwordPolicyViolation } from '../src/utils/password-policy';

describe('public contact submissions', () => {
  it('accepts a business enquiry, assigns the single active agency and creates no account', async () => {
    const before = await UserModel.countDocuments({});

    const response = await request(getApp())
      .post('/api/public/contact')
      .send({
        name: 'Ananya Rao',
        email: 'ananya@buyer.example',
        phone: '+91 98800 11223',
        organisation: 'Rao Chemist Shop',
        topic: 'PRICING_REQUEST',
        message: 'Please share your wholesale price list for sutures and gloves.'
      });

    expect(response.status).toBe(201);
    const data = expectSuccess(response.body) as { message: string };
    // A generic acknowledgement, with nothing echoed back about the submission.
    expect(data.message).toMatch(/received/i);
    expect(JSON.stringify(data)).not.toContain('ananya@buyer.example');

    const stored = await ContactSubmissionModel.findOne({ email: 'ananya@buyer.example' }).lean();
    expect(stored).toBeTruthy();
    // The setup fixture creates exactly one ACTIVE agency, so attribution is unambiguous.
    expect(String(stored?.agencyId)).toBe(
      String((await AgencyModel.findOne({ status: 'ACTIVE' }).lean())?._id)
    );
    expect(stored?.organisation).toBe('Rao Chemist Shop');
    expect(stored?.topic).toBe('PRICING_REQUEST');
    expect(stored?.status).toBe('NEW');
    expect(stored?.phone).toBe('+91 98800 11223');

    // No account, no session, no login is created.
    expect(await UserModel.countDocuments({})).toBe(before);
    expect(await UserModel.exists({ email: 'ananya@buyer.example' })).toBeNull();
  });

  it('rejects an invalid contact body before it is stored', async () => {
    const invalid = await request(getApp())
      .post('/api/public/contact')
      .send({ name: 'x', email: 'not-an-email', message: 'too short' });
    expect(invalid.status).toBe(422);
    expect(expectError(invalid.body).code).toBe('VALIDATION_ERROR');

    const missing = await request(getApp()).post('/api/public/contact').send({ name: 'No Message' });
    expect(missing.status).toBe(422);

    expect(await ContactSubmissionModel.countDocuments({})).toBe(0);
  });

  it('refuses to guess a tenant when more than one agency is active', async () => {
    const tenant = await createTenant('contact-multi');
    expect(tenant.agencyId).toBeTruthy();

    const response = await request(getApp())
      .post('/api/public/contact')
      .send({ name: 'Ambiguous Tenant', email: 'ambiguous@buyer.example', message: 'Which agency receives this?' });

    expect(response.status).toBe(400);
    expect(expectError(response.body).code).toBe('VALIDATION_ERROR');
    expect(await ContactSubmissionModel.countDocuments({})).toBe(0);
  });

  it('notifies agency admins and records activity for the submission', async () => {
    const tenant = await createTenant('contact-notify');

    // Keep exactly one active agency so attribution stays unambiguous.
    await AgencyModel.updateMany(
      { _id: { $ne: tenant.agencyId }, status: 'ACTIVE' },
      { $set: { status: 'SUSPENDED' } }
    );

    const response = await request(getApp())
      .post('/api/public/contact')
      .send({
        name: 'Business Enquiry',
        email: 'enquiry@buyer.example',
        organisation: 'Buyer Pharma',
        topic: 'NEW_ORDER_ENQUIRY',
        message: 'We would like to open a trading account with your agency.'
      });
    expect(response.status).toBe(201);

    const submission = await ContactSubmissionModel.findOne({ email: 'enquiry@buyer.example' }).lean();
    expect(submission).toBeTruthy();
    expect(String(submission?.agencyId)).toBe(String(tenant.agencyId));

    const activity = await ActivityLogModel.find({ agencyId: tenant.agencyId, action: 'contact.submit' }).lean();
    expect(activity.length).toBe(1);
    expect(activity[0]?.entity).toBe('ContactSubmission');
    // The activity trail must not copy the enquiry body.
    expect(JSON.stringify(activity)).not.toContain('trading account');
  });

  it('keeps the contact inbox tenant scoped and admin only', async () => {
    const tenant = await createTenant('contact-inbox');
    const other = await createTenant('contact-inbox-other');
    await AgencyModel.updateMany(
      { _id: { $ne: other.agencyId }, status: 'ACTIVE' },
      { $set: { status: 'SUSPENDED' } }
    );
    const otherAgencyId = other.agencyId;

    const mine = await ContactSubmissionModel.create({
      agencyId: tenant.agencyId,
      name: 'Tenant A Lead',
      email: 'a@buyer.example',
      topic: 'SUPPORT',
      message: 'Question about my last delivery please.'
    });
    await ContactSubmissionModel.create({
      agencyId: otherAgencyId,
      name: 'Tenant B Lead',
      email: 'b@buyer.example',
      topic: 'SUPPORT',
      message: 'A completely different enquiry body.'
    });

    const list = await request(getApp()).get('/api/contact-submissions').set(...auth(tenant.admin.token));
    expect(list.status).toBe(200);
    const items = expectSuccess(list.body) as unknown as Array<{ name: string }>;
    expect(items).toHaveLength(1);
    expect(items[0]?.name).toBe('Tenant A Lead');

    // A cross-tenant read is a 404, never a leak.
    const crossTenant = await request(getApp())
      .get(`/api/contact-submissions/${(await ContactSubmissionModel.findOne({ agencyId: otherAgencyId }).lean())!._id}`)
      .set(...auth(tenant.admin.token));
    expect(crossTenant.status).toBe(404);

    // A customer cannot read the agency inbox at all.
    const customer = await createCustomerUser({
      agencyId: tenant.agencyId,
      email: 'contact-customer@test.local',
      businessName: 'Contact Shop'
    });
    const forbidden = await request(getApp()).get('/api/contact-submissions').set(...auth(customer.token));
    expect(forbidden.status).toBe(403);

    // Anonymous access is refused.
    const anonymous = await request(getApp()).get('/api/contact-submissions');
    expect(anonymous.status).toBe(401);

    // An admin can move the lead along the workflow.
    const updated = await request(getApp())
      .patch(`/api/contact-submissions/${idOf(mine)}`)
      .set(...auth(tenant.admin.token))
      .send({ status: 'CONTACTED', notes: 'Called the buyer.' });
    expect(updated.status).toBe(200);
    expect((expectSuccess(updated.body) as { status: string; handledAt?: string }).status).toBe('CONTACTED');
  });
});

describe('salesman temporary credentials', () => {
  it('generates a one-time temporary password when the admin supplies none', async () => {
    const tenant = await createTenant('salesman-temp');

    const response = await request(getApp())
      .post('/api/salesmen')
      .set(...auth(tenant.admin.token))
      .send({ name: 'Auto Credited Salesman', email: 'auto-salesman@test.local', phone: '+91 90000 00021' });

    expect(response.status).toBe(201);
    const created = expectSuccess(response.body) as {
      temporaryPassword?: string;
      temporaryPasswordNotice?: string;
      mustChangePassword: boolean;
      employeeCode: string;
    };

    expect(created.mustChangePassword).toBe(true);
    expect(typeof created.temporaryPassword).toBe('string');
    expect(created.temporaryPassword).toHaveLength(14);
    // The generated secret must satisfy the account password policy.
    expect(passwordPolicyViolation(created.temporaryPassword!)).toBeNull();
    expect(created.temporaryPasswordNotice).toMatch(/once/i);

    // The generated password is never persisted in plaintext.
    const user = await UserModel.findOne({ email: 'auto-salesman@test.local' }).select('+passwordHash').lean();
    expect(user?.passwordHash).toBeTruthy();
    expect(user?.passwordHash).not.toContain(created.temporaryPassword!);
    expect(user?.mustChangePassword).toBe(true);

    // The plaintext is absent from every later read surface.
    const list = await request(getApp()).get('/api/salesmen').set(...auth(tenant.admin.token));
    expect(list.status).toBe(200);
    expect(JSON.stringify(list.body)).not.toContain(created.temporaryPassword!);

    const detail = await request(getApp())
      .get(`/api/salesmen/${idOf(created)}`)
      .set(...auth(tenant.admin.token));
    expect(detail.status).toBe(200);
    expect(JSON.stringify(detail.body)).not.toContain(created.temporaryPassword!);
    expect(JSON.stringify(detail.body)).not.toContain('temporaryPassword');

    // It works exactly once as a real credential, and the account is flagged.
    const login = await request(getApp())
      .post('/api/auth/login')
      .send({ email: 'auto-salesman@test.local', password: created.temporaryPassword });
    expect(login.status).toBe(200);
    expect((login.body as { data: { user: { mustChangePassword: boolean } } }).data.user.mustChangePassword).toBe(
      true
    );
  });

  it('generates a different temporary password for every salesman', async () => {
    const tenant = await createTenant('salesman-temp-unique');
    const seen = new Set<string>();

    for (const email of ['temp-a@test.local', 'temp-b@test.local', 'temp-c@test.local']) {
      const response = await request(getApp())
        .post('/api/salesmen')
        .set(...auth(tenant.admin.token))
        .send({ name: `Salesman ${email}`, email, phone: '+91 90000 00022' });
      expect(response.status).toBe(201);
      const password = (expectSuccess(response.body) as { temporaryPassword: string }).temporaryPassword;
      seen.add(password);
    }

    expect(seen.size).toBe(3);
  });

  it('still honours an explicit admin supplied password without echoing it', async () => {
    const tenant = await createTenant('salesman-explicit');

    const response = await request(getApp())
      .post('/api/salesmen')
      .set(...auth(tenant.admin.token))
      .send({
        name: 'Explicit Password Salesman',
        email: 'explicit-salesman@test.local',
        phone: '+91 90000 00023',
        password: TEST_PASSWORD
      });

    expect(response.status).toBe(201);
    const created = expectSuccess(response.body) as { temporaryPassword?: string; mustChangePassword: boolean };
    // The admin chose the secret, so nothing is generated and nothing is echoed.
    expect(created.temporaryPassword).toBeUndefined();
    expect(JSON.stringify(created)).not.toContain(TEST_PASSWORD);
    expect(created.mustChangePassword).toBe(true);
  });

  it('mints passwords that satisfy the policy and vary across calls', () => {
    const generated = Array.from({ length: 40 }, () => generateTemporaryPassword());
    expect(new Set(generated).size).toBeGreaterThan(35);
    for (const password of generated) {
      expect(password).toHaveLength(14);
      expect(passwordPolicyViolation(password)).toBeNull();
      expect(password).toMatch(/[a-z]/);
      expect(password).toMatch(/[A-Z]/);
      expect(password).toMatch(/\d/);
      expect(password).toMatch(/[!@#$%*?]/);
      // Ambiguous glyphs are excluded so it survives being read aloud.
      expect(password).not.toMatch(/[O0Il1]/);
    }
  });

  it('does not leak the temporary password into the activity trail', async () => {
    const tenant = await createTenant('salesman-temp-audit');
    const response = await request(getApp())
      .post('/api/salesmen')
      .set(...auth(tenant.admin.token))
      .send({ name: 'Audited Salesman', email: 'audited-salesman@test.local', phone: '+91 90000 00024' });
    const password = (expectSuccess(response.body) as { temporaryPassword: string }).temporaryPassword;

    const activity = await ActivityLogModel.find({ agencyId: tenant.agencyId, action: 'salesman.create' }).lean();
    expect(activity.length).toBe(1);
    expect(JSON.stringify(activity)).not.toContain(password);
    expect((activity[0]?.meta as { temporaryPasswordGenerated?: boolean })?.temporaryPasswordGenerated).toBe(true);
  });
});

describe('product business fields and filters', () => {
  it('stores and returns the real catalogue fields on create', async () => {
    const tenant = await createTenant('product-fields');

    const response = await request(getApp())
      .post('/api/products')
      .set(...auth(tenant.admin.token))
      .send({
        name: 'Ciprofloxacin 500mg Tablets',
        sku: 'CIPRO-500',
        brand: 'HealthPlus',
        genericName: 'Ciprofloxacin',
        manufacturer: 'HealthPlus Pharma Ltd',
        mrp: 145,
        price: 120,
        taxRate: 12,
        unit: 'STRIP',
        packSize: '10 tablets',
        reorderLevel: 40,
        categoryId: undefined
      });

    expect(response.status).toBe(201);
    const product = expectSuccess(response.body) as Record<string, unknown>;
    expect(product.genericName).toBe('Ciprofloxacin');
    expect(product.manufacturer).toBe('HealthPlus Pharma Ltd');
    expect(product.mrp).toBe(145);
    expect(product.price).toBe(120);
    expect(product.reorderLevel).toBe(40);
    expect(product.packSize).toBe('10 tablets');
    expect(product.sku).toBe('CIPRO-500');
    // Both identifier shapes are present.
    expect(product.id).toBe(product._id);
  });

  it('persists field updates and keeps server-authoritative price integrity', async () => {
    const tenant = await createTenant('product-update');

    const created = await request(getApp())
      .post('/api/products')
      .set(...auth(tenant.admin.token))
      .send({ name: 'Original Item', price: 100, taxRate: 5, unit: 'BOX', mrp: 130 });
    const productId = idOf(expectSuccess(created.body));

    const updated = await request(getApp())
      .patch(`/api/products/${productId}`)
      .set(...auth(tenant.admin.token))
      .send({ genericName: 'Paracetamol', manufacturer: 'Wellness Ltd', reorderLevel: 25, mrp: 160 });
    expect(updated.status).toBe(200);
    const product = expectSuccess(updated.body) as Record<string, unknown>;
    expect(product.genericName).toBe('Paracetamol');
    expect(product.manufacturer).toBe('Wellness Ltd');
    expect(product.reorderLevel).toBe(25);
    expect(product.mrp).toBe(160);
    expect(product.price).toBe(100);

    // Lowering the price below the stored MRP is refused.
    const invalid = await request(getApp())
      .patch(`/api/products/${productId}`)
      .set(...auth(tenant.admin.token))
      .send({ price: 500 });
    expect(invalid.status).toBe(400);
  });

  it('validates the new product fields', async () => {
    const tenant = await createTenant('product-validation');

    const mrpTooLow = await request(getApp())
      .post('/api/products')
      .set(...auth(tenant.admin.token))
      .send({ name: 'Bad MRP Item', price: 500, mrp: 100, taxRate: 5, unit: 'BOX' });
    expect(mrpTooLow.status).toBe(422);

    const negativeReorder = await request(getApp())
      .post('/api/products')
      .set(...auth(tenant.admin.token))
      .send({ name: 'Bad Reorder', price: 10, taxRate: 5, unit: 'BOX', reorderLevel: -5 });
    expect(negativeReorder.status).toBe(422);

    const longGeneric = await request(getApp())
      .post('/api/products')
      .set(...auth(tenant.admin.token))
      .send({ name: 'Long Generic', price: 10, taxRate: 5, unit: 'BOX', genericName: 'x'.repeat(200) });
    expect(longGeneric.status).toBe(422);

    const badMax = await request(getApp())
      .post('/api/products')
      .set(...auth(tenant.admin.token))
      .send({ name: 'Bad Range', price: 10, taxRate: 5, unit: 'BOX', minOrderQuantity: 10, maxOrderQuantity: 2 });
    expect(badMax.status).toBe(422);
  });

  it('searches products by generic name, manufacturer and product code', async () => {
    const tenant = await createTenant('product-search');
    const admin = tenant.admin.token;

    const created = await request(getApp())
      .post('/api/products')
      .set(...auth(admin))
      .send({
        name: 'Metformin 500mg Tablets',
        sku: 'METF-500',
        genericName: 'Metformin',
        manufacturer: 'Diabetix Labs',
        price: 55,
        taxRate: 12,
        unit: 'STRIP'
      });
    expect(created.status).toBe(201);

    for (const term of ['Metformin', 'Diabetix', 'METF-500']) {
      const response = await request(getApp()).get(`/api/products?search=${encodeURIComponent(term)}`).set(...auth(admin));
      expect(response.status).toBe(200);
      const items = expectSuccess(response.body) as unknown as Array<{ sku: string }>;
      expect(items.map((item) => item.sku)).toContain('METF-500');
    }
  });

  it('filters by brand and manufacturer', async () => {
    const tenant = await createTenant('product-facets');
    const admin = tenant.admin.token;

    for (const body of [
      { name: 'Brand A Mask', sku: 'FAC-A', brand: 'AlphaCare', manufacturer: 'Alpha Manufacturing', price: 10, taxRate: 5, unit: 'BOX' },
      { name: 'Brand B Mask', sku: 'FAC-B', brand: 'BetaCare', manufacturer: 'Beta Manufacturing', price: 10, taxRate: 5, unit: 'BOX' }
    ]) {
      const created = await request(getApp()).post('/api/products').set(...auth(admin)).send(body);
      expect(created.status).toBe(201);
    }

    const byBrand = await request(getApp()).get('/api/products?brand=AlphaCare').set(...auth(admin));
    const brandItems = expectSuccess(byBrand.body) as unknown as Array<{ sku: string }>;
    expect(brandItems.map((item) => item.sku)).toEqual(['FAC-A']);

    const byManufacturer = await request(getApp())
      .get('/api/products?manufacturer=Beta%20Manufacturing')
      .set(...auth(admin));
    const manufacturerItems = expectSuccess(byManufacturer.body) as unknown as Array<{ sku: string }>;
    expect(manufacturerItems.map((item) => item.sku)).toEqual(['FAC-B']);

    const unknownBrand = await request(getApp()).get('/api/products?brand=NoSuchBrand').set(...auth(admin));
    expect(expectSuccess(unknownBrand.body)).toHaveLength(0);
  });

  it('filters availability from real nonexpired inventory and stays tenant scoped', async () => {
    const tenant = await createTenant('product-availability');
    const other = await createTenant('product-availability-other');
    const admin = tenant.admin.token;

    // 180 units available: comfortably IN_STOCK (threshold is 5 in the fixture).
    const stocked = await createStockedProduct({
      agencyId: tenant.agencyId,
      name: 'Well Stocked Item',
      batches: [{ batchNumber: 'OK-1', quantity: 180, expiryInDays: 200 }]
    });
    // 3 units available: below the threshold but above zero.
    const low = await createStockedProduct({
      agencyId: tenant.agencyId,
      name: 'Low Stock Item',
      batches: [{ batchNumber: 'LOW-1', quantity: 3, expiryInDays: 200 }]
    });
    // Only expired stock: never sellable, so OUT_OF_STOCK.
    const expired = await createStockedProduct({
      agencyId: tenant.agencyId,
      name: 'Expired Only Item',
      batches: [{ batchNumber: 'EXP-1', quantity: 50, expiryInDays: -10 }]
    });
    // No inventory rows at all: also OUT_OF_STOCK.
    const empty = await createStockedProduct({
      agencyId: tenant.agencyId,
      name: 'No Stock Item',
      batches: []
    });
    // Another tenant's product must never leak into this tenant's result.
    await createStockedProduct({
      agencyId: other.agencyId,
      name: 'Other Tenant Stocked',
      batches: [{ batchNumber: 'OTHER-1', quantity: 500, expiryInDays: 300 }]
    });

    const inStock = await request(getApp()).get('/api/products?availability=IN_STOCK').set(...auth(admin));
    expect(inStock.status).toBe(200);
    const inStockItems = expectSuccess(inStock.body) as unknown as Array<{ sku: string }>;
    expect(inStockItems.map((item) => item.sku)).toContain(stocked.sku);
    expect(inStockItems.map((item) => item.sku)).not.toContain(low.sku);

    const lowStock = await request(getApp()).get('/api/products?availability=LOW_STOCK').set(...auth(admin));
    const lowItems = expectSuccess(lowStock.body) as unknown as Array<{ sku: string }>;
    expect(lowItems.map((item) => item.sku)).toEqual([low.sku]);

    const outOfStock = await request(getApp()).get('/api/products?availability=OUT_OF_STOCK').set(...auth(admin));
    const outItems = expectSuccess(outOfStock.body) as unknown as Array<{ sku: string }>;
    const outSkus = outItems.map((item) => item.sku);
    expect(outSkus).toContain(expired.sku);
    expect(outSkus).toContain(empty.sku);
    expect(outSkus).not.toContain(stocked.sku);

    const body = outOfStock.body as { meta: { total: number; page: number; limit: number } };
    expect(body.meta.total).toBe(outItems.length);
    expect(body.meta.page).toBe(1);

    // An unknown availability value is a validation error, not a silent no-op.
    const invalid = await request(getApp()).get('/api/products?availability=RANDOM').set(...auth(admin));
    expect(invalid.status).toBe(422);
  });

  it('paginates availability filtered product lists', async () => {
    const tenant = await createTenant('product-availability-page');
    const admin = tenant.admin.token;

    for (let index = 0; index < 3; index += 1) {
      await createStockedProduct({
        agencyId: tenant.agencyId,
        name: `Paged Item ${index}`,
        batches: [{ batchNumber: `PG-${index}`, quantity: 200, expiryInDays: 200 }]
      });
    }

    const first = await request(getApp())
      .get('/api/products?availability=IN_STOCK&limit=2&page=1')
      .set(...auth(admin));
    const firstBody = first.body as { data: Array<{ id: string }>; meta: { total: number; totalPages: number } };
    expect(firstBody.data).toHaveLength(2);
    expect(firstBody.meta.total).toBe(3);
    expect(firstBody.meta.totalPages).toBe(2);

    const second = await request(getApp())
      .get('/api/products?availability=IN_STOCK&limit=2&page=2')
      .set(...auth(admin));
    const secondBody = second.body as { data: Array<{ id: string }> };
    expect(secondBody.data).toHaveLength(1);
    expect(secondBody.data[0]?.id).not.toBe(firstBody.data[0]?.id);
  });
});

describe('flat dashboard metrics', () => {
  it('returns database-derived flat operational counters with the nested report', async () => {
    const tenant = await createTenant('metrics');
    const customer = await createCustomerUser({
      agencyId: tenant.agencyId,
      email: 'metrics-customer@test.local',
      businessName: 'Metrics Shop'
    });
    const salesman = await createSalesmanUser({
      agencyId: tenant.agencyId,
      email: 'metrics-salesman@test.local',
      name: 'Metrics Salesman'
    });
    const product = await createStockedProduct({
      agencyId: tenant.agencyId,
      name: 'Metrics Product',
      price: 200,
      taxRate: 10,
      batches: [{ batchNumber: 'MET-1', quantity: 40, expiryInDays: 120 }]
    });
    // A second product in the same tenant that is deliberately short.
    await createStockedProduct({
      agencyId: tenant.agencyId,
      name: 'Metrics Low Product',
      batches: [{ batchNumber: 'MET-LOW', quantity: 2, expiryInDays: 200 }]
    });
    // And one with no stock at all.
    await createStockedProduct({
      agencyId: tenant.agencyId,
      name: 'Metrics Empty Product',
      batches: []
    });

    const created = await request(getApp())
      .post('/api/orders')
      .set(...auth(customer.token))
      .send({ items: [{ productId: product._id.toString(), quantity: 2 }] });
    expect(created.status).toBe(201);
    const orderId = idOf(expectSuccess(created.body));

    // Leave one order pending so the status counters are not all identical.
    const pending = await request(getApp())
      .post('/api/orders')
      .set(...auth(customer.token))
      .send({ items: [{ productId: product._id.toString(), quantity: 1 }] });
    expect(pending.status).toBe(201);
    void salesman;

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
      metrics: Record<string, number>;
      orders: { total: number; revenue: number };
      inventory: { lowStockProducts: number; outOfStockProducts: number };
    };

    const m = data.metrics;
    expect(m.totalCustomers).toBe(1);
    expect(m.totalSalesmen).toBe(1);
    expect(m.totalProducts).toBe(3);
    expect(m.todayOrders).toBe(2);
    expect(m.todayDeliveredOrders).toBe(1);
    expect(m.deliveredOrders).toBe(1);
    expect(m.pendingOrders).toBe(1);
    expect(m.underReviewOrders).toBe(0);
    expect(m.confirmedOrders).toBe(0);
    expect(m.processingOrders).toBe(0);
    expect(m.packedOrders).toBe(0);
    expect(m.dispatchedOrders).toBe(0);
    // Delivered value inside the range.
    expect(m.orderValue).toBe(440);
    expect(m.totalRevenue).toBe(440);
    expect(m.monthlyOrders).toBe(2);
    expect(m.monthlyRevenue).toBe(660);
    // 40 units minus the 2 committed leaves 38 (above the threshold of 5).
    expect(m.lowStock).toBe(1);
    expect(m.outOfStock).toBe(1);
    expect(m.expiringSoon).toBe(0);
    expect(m.expired).toBe(0);
    expect(m.followUpsDue).toBe(0);
    expect(m.unpaidAmount).toBe(440);

    for (const key of [
      'totalCustomers',
      'totalSalesmen',
      'totalProducts',
      'todayOrders',
      'pendingOrders',
      'underReviewOrders',
      'confirmedOrders',
      'processingOrders',
      'packedOrders',
      'dispatchedOrders',
      'deliveredOrders',
      'todayDeliveredOrders',
      'orderValue',
      'totalRevenue',
      'monthlyOrders',
      'monthlyRevenue',
      'lowStock',
      'outOfStock',
      'expiringSoon',
      'expired',
      'followUpsDue',
      'unpaidAmount'
    ]) {
      expect(typeof m[key], `metrics.${key}`).toBe('number');
      expect(Number.isFinite(m[key] as number)).toBe(true);
    }

    // The pre-existing rich report is still present alongside the flat block.
    expect(data.orders.total).toBe(2);
    expect(data.orders.revenue).toBe(440);
    expect(data.inventory.lowStockProducts).toBe(1);
    expect(data.inventory.outOfStockProducts).toBe(1);
  });

  it('reports follow-ups that are actually due', async () => {
    const tenant = await createTenant('metrics-followups');
    const customer = await createCustomerUser({
      agencyId: tenant.agencyId,
      email: 'followup-customer@test.local',
      businessName: 'Follow-up Shop'
    });
    const salesman = await createSalesmanUser({
      agencyId: tenant.agencyId,
      email: 'followup-salesman@test.local',
      name: 'Follow-up Salesman',
      customerIds: [customer.id]
    });

    const overdue = new Date(Date.now() - 3 * 86_400_000).toISOString();
    const future = new Date(Date.now() + 5 * 86_400_000).toISOString();

    for (const [title, dueAt] of [
      ['Overdue call', overdue],
      ['Upcoming call', future]
    ] as const) {
      const created = await request(getApp())
        .post('/api/follow-ups')
        .set(...auth(salesman.token))
        .send({ customerId: customer.id.toString(), title, dueAt, type: 'CALL' });
      expect(created.status).toBe(201);
    }

    const dashboard = await request(getApp()).get('/api/reports/dashboard').set(...auth(tenant.admin.token));
    const data = expectSuccess(dashboard.body) as { metrics: { followUpsDue: number } };
    expect(data.metrics.followUpsDue).toBe(1);
  });

  it('scopes the flat metrics to the caller', async () => {
    const tenant = await createTenant('metrics-scope');
    const mine = await createCustomerUser({
      agencyId: tenant.agencyId,
      email: 'scope-mine@test.local',
      businessName: 'Mine Shop'
    });
    await createCustomerUser({
      agencyId: tenant.agencyId,
      email: 'scope-theirs@test.local',
      businessName: 'Theirs Shop'
    });

    const dashboard = await request(getApp()).get('/api/reports/dashboard').set(...auth(mine.token));
    const data = expectSuccess(dashboard.body) as { metrics: { totalCustomers: number } };
    // A customer only ever sees themselves.
    expect(data.metrics.totalCustomers).toBe(1);
  });
});

describe('agency settings for business hours and notifications', () => {
  it('persists business hours and notification preferences', async () => {
    const tenant = await createTenant('settings-hours');

    const update = await request(getApp())
      .patch('/api/settings')
      .set(...auth(tenant.admin.token))
      .send({
        businessHours: {
          MONDAY: '09:00 - 13:00, 16:00 - 20:00',
          SATURDAY: '09:30 - 14:00',
          SUNDAY: ''
        },
        notifications: {
          email: { newOrder: false, contactSubmission: true },
          quietHoursEnabled: true,
          quietHoursStart: '21:30',
          quietHoursEnd: '07:00'
        }
      });

    expect(update.status).toBe(200);
    const settings = expectSuccess(update.body) as {
      businessHours: Record<string, string | null>;
      notifications: {
        email: Record<string, boolean>;
        quietHoursEnabled: boolean;
        quietHoursStart: string;
        quietHoursEnd: string;
      };
    };

    expect(settings.businessHours.MONDAY).toBe('09:00 - 13:00, 16:00 - 20:00');
    expect(settings.businessHours.SATURDAY).toBe('09:30 - 14:00');
    // An empty string clears the day rather than storing a blank.
    expect(settings.businessHours.SUNDAY).toBeNull();
    expect(settings.notifications.email.newOrder).toBe(false);
    expect(settings.notifications.email.contactSubmission).toBe(true);
    // Unspecified toggles keep their stored value.
    expect(settings.notifications.email.paymentRecorded).toBe(true);
    expect(settings.notifications.quietHoursEnabled).toBe(true);
    expect(settings.notifications.quietHoursStart).toBe('21:30');
    expect(settings.notifications.quietHoursEnd).toBe('07:00');

    // The values round-trip through a fresh read.
    const read = await request(getApp()).get('/api/settings').set(...auth(tenant.admin.token));
    const readData = expectSuccess(read.body) as typeof settings;
    expect(readData.businessHours.MONDAY).toBe('09:00 - 13:00, 16:00 - 20:00');
    expect(readData.businessHours.SUNDAY).toBeNull();
    expect(readData.notifications.email.newOrder).toBe(false);

    // The pre-existing commercial settings still work.
    const preserved = await request(getApp())
      .patch('/api/settings')
      .set(...auth(tenant.admin.token))
      .send({ orderSettings: { lowStockThreshold: 33, expiryAlertDays: 45 }, tax: { defaultTaxRate: 18 } });
    expect(preserved.status).toBe(200);
    const preservedData = expectSuccess(preserved.body) as {
      orderSettings: { lowStockThreshold: number; expiryAlertDays: number; prefix: string };
      tax: { defaultTaxRate: number; invoicePrefix: string };
    };
    expect(preservedData.orderSettings.lowStockThreshold).toBe(33);
    expect(preservedData.orderSettings.expiryAlertDays).toBe(45);
    expect(preservedData.tax.defaultTaxRate).toBe(18);
    // Invoice prefix is untouched by a tax-rate-only patch.
    expect(preservedData.tax.invoicePrefix).toBe('INV');
  });

  it('validates business hours and notification preferences', async () => {
    const tenant = await createTenant('settings-hours-validation');

    const badHours = await request(getApp())
      .patch('/api/settings')
      .set(...auth(tenant.admin.token))
      .send({ businessHours: { MONDAY: 'whenever we feel like it' } });
    expect(badHours.status).toBe(422);

    const badQuietHours = await request(getApp())
      .patch('/api/settings')
      .set(...auth(tenant.admin.token))
      .send({ notifications: { quietHoursStart: '25:99' } });
    expect(badQuietHours.status).toBe(422);

    const empty = await request(getApp())
      .patch('/api/settings')
      .set(...auth(tenant.admin.token))
      .send({ businessHours: {} });
    expect(empty.status).toBe(422);
  });

  it('exposes both id and _id on list and detail DTOs', async () => {
    const tenant = await createTenant('dto-ids');
    const customer = await createCustomerUser({
      agencyId: tenant.agencyId,
      email: 'dto-customer@test.local',
      businessName: 'DTO Shop'
    });
    const product = await createStockedProduct({ agencyId: tenant.agencyId, name: 'DTO Product', price: 100, taxRate: 0 });

    const order = await request(getApp())
      .post('/api/orders')
      .set(...auth(customer.token))
      .send({ items: [{ productId: product._id.toString(), quantity: 1 }] });
    expect(order.status).toBe(201);
    const orderId = idOf(expectSuccess(order.body));

    for (const status of ['UNDER_REVIEW', 'CONFIRMED', 'PROCESSING', 'PACKED', 'DISPATCHED', 'DELIVERED']) {
      await request(getApp())
        .post(`/api/orders/${orderId}/status`)
        .set(...auth(tenant.admin.token))
        .send({ status })
        .expect(200);
    }

    // List endpoints return { success, data: [], meta } and both id shapes.
    const lists: Array<[string, string]> = [
      ['/api/products', 'products'],
      ['/api/customers', 'customers'],
      ['/api/salesmen', 'salesmen'],
      ['/api/orders', 'orders'],
      ['/api/invoices', 'invoices'],
      ['/api/inventory', 'inventory']
    ];

    for (const [path, label] of lists) {
      const response = await request(getApp()).get(path).set(...auth(tenant.admin.token));
      expect(response.status, label).toBe(200);
      const body = response.body as { success: boolean; data: Array<Record<string, unknown>>; meta?: unknown };
      expect(body.success).toBe(true);
      expect(Array.isArray(body.data), label).toBe(true);
      if (path === '/api/salesmen' || path === '/api/customers') {
        // These lists are empty for this tenant; the shape check still applies.
        expect(body.data).toEqual(expect.any(Array));
      }
      for (const row of body.data) {
        expect(row.id, `${label}.id`).toBeDefined();
        expect(row._id, `${label}._id`).toBeDefined();
        expect(String(row.id)).toBe(String(row._id));
      }
    }

    // Detail endpoints too.
    const detail = await request(getApp())
      .get(`/api/products/${product._id.toString()}`)
      .set(...auth(tenant.admin.token));
    const productDto = expectSuccess(detail.body) as Record<string, unknown>;
    expect(String(productDto.id)).toBe(String(productDto._id));

    const orderDetail = await request(getApp()).get(`/api/orders/${orderId}`).set(...auth(tenant.admin.token));
    const orderDto = expectSuccess(orderDetail.body) as Record<string, unknown>;
    expect(String(orderDto.id)).toBe(String(orderDto._id));

    // Report row DTOs expose both shapes as well.
    const ordersReport = await request(getApp()).get('/api/reports/orders').set(...auth(tenant.admin.token));
    const reportRows = (expectSuccess(ordersReport.body) as { orders: Array<Record<string, unknown>> }).orders;
    expect(reportRows.length).toBe(1);
    expect(String(reportRows[0]?.id)).toBe(String(reportRows[0]?._id));

    const inventoryReport = await request(getApp()).get('/api/reports/inventory').set(...auth(tenant.admin.token));
    const inventoryRows = (expectSuccess(inventoryReport.body) as { items: Array<Record<string, unknown>> }).items;
    expect(inventoryRows.length).toBeGreaterThan(0);
    for (const row of inventoryRows) {
      expect(String(row.id)).toBe(String(row._id));
    }

    // Search results carry both shapes too.
    const search = await request(getApp())
      .get('/api/search?q=DTO')
      .set(...auth(tenant.admin.token));
    expect(search.status).toBe(200);
    const groups = (expectSuccess(search.body) as { groups: Array<{ items: Array<Record<string, unknown>> }> }).groups;
    for (const group of groups) {
      for (const row of group.items) {
        expect(row.id).toBeDefined();
        expect(row._id).toBeDefined();
      }
    }
  });

  it('publishes only safe agency fields including business hours', async () => {
    const tenant = await createTenant('public-hours');
    await AgencyModel.updateMany(
      { _id: { $ne: tenant.agencyId }, status: 'ACTIVE' },
      { $set: { status: 'SUSPENDED' } }
    );
    await request(getApp())
      .patch('/api/settings')
      .set(...auth(tenant.admin.token))
      .send({ businessHours: { MONDAY: '08:00 - 18:00', SUNDAY: '' } })
      .expect(200);

    const response = await request(getApp()).get('/api/public/agency');
    expect(response.status).toBe(200);
    const data = expectSuccess(response.body) as Record<string, unknown>;
    expect((data.businessHours as Record<string, string | null>).MONDAY).toBe('08:00 - 18:00');
    expect((data.businessHours as Record<string, string | null>).SUNDAY).toBeNull();

    // Internal commercial rules and notification routing stay private.
    expect(data.orderSettings).toBeUndefined();
    expect(data.notifications).toBeUndefined();
    expect(data.tax).toBeDefined();
    expect(JSON.stringify(data)).not.toContain('lowStockThreshold');
    expect(JSON.stringify(data)).not.toContain('invoicePrefix');
    expect(JSON.stringify(data)).not.toContain('quietHours');
  });
});
