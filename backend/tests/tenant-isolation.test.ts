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
import { OrderModel } from '../src/models/order.model';
import { ProductModel } from '../src/models/product.model';

describe('tenant isolation', () => {
  it('never returns another tenant record for a direct id', async () => {
    const alpha = await createTenant('alpha');
    const beta = await createTenant('beta');

    await createCustomerUser({
      agencyId: alpha.agencyId,
      email: 'alpha-owner@test.local',
      businessName: 'Alpha Shop'
    });
    const betaProduct = await createStockedProduct({ agencyId: beta.agencyId, name: 'Beta Product' });

    // A product of tenant B must be invisible to tenant A even by exact id.
    const productResponse = await request(getApp())
      .get(`/api/products/${betaProduct._id.toString()}`)
      .set(...auth(alpha.admin.token));
    expect(productResponse.status).toBe(404);
    expect(expectError(productResponse.body).code).toBe('NOT_FOUND');

    // ... and must not appear in a list either.
    const list = await request(getApp()).get('/api/products?limit=50').set(...auth(alpha.admin.token));
    const items = expectSuccess(list.body) as unknown as Array<{ _id: string; id: string }>;
    expect(items.some((item) => (item._id ?? item.id) === betaProduct._id.toString())).toBe(false);
  });

  it('blocks a customer from ordering on behalf of another tenant customer', async () => {
    const alpha = await createTenant('iso-alpha');
    const beta = await createTenant('iso-beta');

    const alphaCustomer = await createCustomerUser({
      agencyId: alpha.agencyId,
      email: 'iso-alpha-owner@test.local',
      businessName: 'Iso Alpha Shop'
    });
    const betaCustomer = await createCustomerUser({
      agencyId: beta.agencyId,
      email: 'iso-beta-owner@test.local',
      businessName: 'Iso Beta Shop'
    });
    const product = await createStockedProduct({ agencyId: beta.agencyId, name: 'Beta Only Product' });

    const response = await request(getApp())
      .post('/api/orders')
      .set(...auth(alphaCustomer.token))
      .send({
        customerId: betaCustomer.id.toString(),
        items: [{ productId: product._id.toString(), quantity: 1 }]
      });

    expect(response.status).toBe(403);
    expect(expectError(response.body).code).toBe('FORBIDDEN');

    const orders = await OrderModel.countDocuments({ agencyId: beta.agencyId });
    expect(orders).toBe(0);
  });

  it('scopes search and reports to the caller tenant', async () => {
    const alpha = await createTenant('search-alpha');
    const beta = await createTenant('search-beta');

    await createStockedProduct({ agencyId: beta.agencyId, name: 'Confidential Beta Gadget' });
    await createStockedProduct({ agencyId: alpha.agencyId, name: 'Public Alpha Gadget' });

    const search = await request(getApp())
      .get('/api/search?q=Gadget&limit=20')
      .set(...auth(alpha.admin.token));

    expect(search.status).toBe(200);
    const data = expectSuccess(search.body) as { groups: Array<{ items: Array<{ title: string }> }> };
    const titles = data.groups.flatMap((group) => group.items.map((item) => item.title));
    expect(titles).toContain('Public Alpha Gadget');
    expect(titles).not.toContain('Confidential Beta Gadget');
  });

  it('hides another tenant order from the order list and from direct fetch', async () => {
    const alpha = await createTenant('order-alpha');
    const beta = await createTenant('order-beta');

    const betaCustomer = await createCustomerUser({
      agencyId: beta.agencyId,
      email: 'order-beta-owner@test.local',
      businessName: 'Order Beta Shop'
    });
    const betaProduct = await createStockedProduct({ agencyId: beta.agencyId, name: 'Beta Order Product' });

    const created = await request(getApp())
      .post('/api/orders')
      .set(...auth(betaCustomer.token))
      .send({ items: [{ productId: betaProduct._id.toString(), quantity: 2 }] });
    expect(created.status).toBe(201);
    const betaOrderId = idOf(expectSuccess(created.body));

    const alphaList = await request(getApp()).get('/api/orders').set(...auth(alpha.admin.token));
    const alphaOrders = expectSuccess(alphaList.body) as unknown as Array<{ _id: string; id?: string }>;
    expect(alphaOrders.map((order) => order._id ?? order.id)).not.toContain(betaOrderId);

    const direct = await request(getApp())
      .get(`/api/orders/${betaOrderId}`)
      .set(...auth(alpha.admin.token));
    expect(direct.status).toBe(404);
  });

  it('keeps product creation inside the caller tenant', async () => {
    const alpha = await createTenant('create-alpha');
    const response = await request(getApp())
      .post('/api/products')
      .set(...auth(alpha.admin.token))
      .send({ name: 'Alpha Surgical Mask', price: 250, taxRate: 12, unit: 'BOX' });

    expect(response.status).toBe(201);
    const product = await ProductModel.findById(idOf(expectSuccess(response.body))).lean();
    expect(String(product?.agencyId)).toBe(String(alpha.agencyId));
  });

  it('limits a salesman to assigned customers only', async () => {
    const agency = await createTenant('salesman-scope');

    const assigned = await createCustomerUser({
      agencyId: agency.agencyId,
      email: 'assigned-owner@test.local',
      businessName: 'Assigned Shop'
    });
    const unassigned = await createCustomerUser({
      agencyId: agency.agencyId,
      email: 'unassigned-owner@test.local',
      businessName: 'Unassigned Shop'
    });

    const salesman = await createSalesmanUser({
      agencyId: agency.agencyId,
      email: 'scoped-salesman@test.local',
      name: 'Scoped Salesman',
      customerIds: [assigned.id]
    });

    const list = await request(getApp()).get('/api/customers?limit=50').set(...auth(salesman.token));
    const customers = expectSuccess(list.body) as unknown as Array<{ _id: string; businessName: string }>;
    const names = customers.map((customer) => customer.businessName);
    expect(names).toContain('Assigned Shop');
    expect(names).not.toContain('Unassigned Shop');

    const direct = await request(getApp())
      .get(`/api/customers/${unassigned.id.toString()}`)
      .set(...auth(salesman.token));
    expect(direct.status).toBe(404);
  });
});
