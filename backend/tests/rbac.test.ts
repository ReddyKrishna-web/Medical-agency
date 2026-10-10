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
  idOf
} from './helpers/fixtures';
import { FollowUpModel } from '../src/models/follow-up.model';

describe('role based access control', () => {
  it('blocks a customer from admin-only endpoints', async () => {
    const tenant = await createTenant('rbac-basic');
    const customer = await createCustomerUser({
      agencyId: tenant.agencyId,
      email: 'rbac-customer@test.local',
      businessName: 'Rbac Shop'
    });

    const createProduct = await request(getApp())
      .post('/api/products')
      .set(...auth(customer.token))
      .send({ name: 'Forbidden Product', price: 10, taxRate: 0, unit: 'BOX' });
    expect(createProduct.status).toBe(403);
    expect(expectError(createProduct.body).code).toBe('FORBIDDEN');

    const listSalesmen = await request(getApp()).get('/api/salesmen').set(...auth(customer.token));
    expect(listSalesmen.status).toBe(403);

    const settings = await request(getApp()).get('/api/settings').set(...auth(customer.token));
    expect(settings.status).toBe(403);

    const inventoryWrite = await request(getApp())
      .post('/api/inventory/batches')
      .set(...auth(customer.token))
      .send({
        productId: '507f1f77bcf86cd799439011',
        batchNumber: 'X1',
        quantity: 1,
        expiryDate: new Date(Date.now() + 86400000).toISOString()
      });
    expect(inventoryWrite.status).toBe(403);
  });

  it('blocks a customer from creating a salesman', async () => {
    const tenant = await createTenant('rbac-staff');
    const customer = await createCustomerUser({
      agencyId: tenant.agencyId,
      email: 'rbac-staff-customer@test.local',
      businessName: 'Rbac Staff Shop'
    });

    const response = await request(getApp())
      .post('/api/salesmen')
      .set(...auth(customer.token))
      .send({ name: 'Fake Admin', email: 'fake-admin@test.local', phone: '+91 90000 00009', password: 'TestPass123!' });

    expect(response.status).toBe(403);
  });

  it('allows an admin to create a salesman and a customer to message them', async () => {
    const tenant = await createTenant('rbac-msg');

    const created = await request(getApp())
      .post('/api/salesmen')
      .set(...auth(tenant.admin.token))
      .send({ name: 'New Salesman', email: 'new-salesman@test.local', phone: '+91 90000 00008', password: 'TestPass123!' });
    expect(created.status).toBe(201);
    const salesmanUserId = (expectSuccess(created.body) as { userId: string }).userId;

    const customer = await createCustomerUser({
      agencyId: tenant.agencyId,
      email: 'msg-customer@test.local',
      businessName: 'Msg Shop'
    });

    const message = await request(getApp())
      .post('/api/messages')
      .set(...auth(customer.token))
      .send({ receiverId: salesmanUserId, body: 'Please call me about my order' });
    expect(message.status).toBe(201);

    // Customers may not message other customers.
    const otherCustomer = await createCustomerUser({
      agencyId: tenant.agencyId,
      email: 'other-customer@test.local',
      businessName: 'Other Shop'
    });
    const forbidden = await request(getApp())
      .post('/api/messages')
      .set(...auth(customer.token))
      .send({ receiverId: otherCustomer.userId.toString(), body: 'hello' });
    expect(forbidden.status).toBe(403);
  });

  it('keeps follow-ups owned by the salesman who created them', async () => {
    const tenant = await createTenant('rbac-followup');
    const customer = await createCustomerUser({
      agencyId: tenant.agencyId,
      email: 'followup-customer@test.local',
      businessName: 'Followup Shop'
    });
    const salesman = await createSalesmanUser({
      agencyId: tenant.agencyId,
      email: 'followup-salesman@test.local',
      name: 'Followup Salesman',
      customerIds: [customer.id]
    });

    const created = await request(getApp())
      .post('/api/follow-ups')
      .set(...auth(salesman.token))
      .send({
        customerId: customer.id.toString(),
        title: 'Weekly check-in',
        type: 'CALL',
        dueAt: new Date(Date.now() + 86400000).toISOString()
      });
    expect(created.status).toBe(201);
    const followUpId = idOf(expectSuccess(created.body));

    // The customer can read the follow-up but not change its status.
    const read = await request(getApp())
      .get(`/api/follow-ups/${followUpId}`)
      .set(...auth(customer.token));
    expect(read.status).toBe(200);

    const customerUpdate = await request(getApp())
      .post(`/api/follow-ups/${followUpId}/status`)
      .set(...auth(customer.token))
      .send({ status: 'COMPLETED' });
    expect(customerUpdate.status).toBe(403);

    const salesmanUpdate = await request(getApp())
      .post(`/api/follow-ups/${followUpId}/status`)
      .set(...auth(salesman.token))
      .send({ status: 'COMPLETED', note: 'Spoke to the shop owner' });
    expect(salesmanUpdate.status).toBe(200);

    const stored = await FollowUpModel.findById(followUpId).lean();
    expect(stored?.status).toBe('COMPLETED');
  });

  it('restricts inventory reports and exports to the agency', async () => {
    const tenant = await createTenant('rbac-reports');
    await createStockedProduct({ agencyId: tenant.agencyId, name: 'Report Product' });
    const customer = await createCustomerUser({
      agencyId: tenant.agencyId,
      email: 'report-customer@test.local',
      businessName: 'Report Shop'
    });

    const inventoryReport = await request(getApp())
      .get('/api/reports/inventory')
      .set(...auth(customer.token));
    expect(inventoryReport.status).toBe(403);

    const exportResponse = await request(getApp())
      .get('/api/reports/export?type=inventory&format=csv')
      .set(...auth(customer.token));
    expect(exportResponse.status).toBe(403);

    const adminExport = await request(getApp())
      .get('/api/reports/export?type=inventory&format=csv')
      .set(...auth(tenant.admin.token));
    expect(adminExport.status).toBe(200);
    expect(adminExport.headers['content-type']).toContain('text/csv');
    expect(String(adminExport.text)).toContain('Report Product');
  });

  it('lets a customer read the catalogue but not archived products', async () => {
    const tenant = await createTenant('rbac-catalog');
    const product = await createStockedProduct({ agencyId: tenant.agencyId, name: 'Catalog Visible' });
    const customer = await createCustomerUser({
      agencyId: tenant.agencyId,
      email: 'catalog-customer@test.local',
      businessName: 'Catalog Shop'
    });

    const active = await request(getApp())
      .get(`/api/products/${product._id.toString()}`)
      .set(...auth(customer.token));
    expect(active.status).toBe(200);

    await request(getApp())
      .patch(`/api/products/${product._id.toString()}`)
      .set(...auth(tenant.admin.token))
      .send({ isActive: false })
      .expect(200);

    const archived = await request(getApp())
      .get(`/api/products/${product._id.toString()}`)
      .set(...auth(customer.token));
    expect(archived.status).toBe(404);

    const customerPatch = await request(getApp())
      .patch(`/api/products/${product._id.toString()}`)
      .set(...auth(customer.token))
      .send({ price: 1 });
    expect(customerPatch.status).toBe(403);
  });
});
