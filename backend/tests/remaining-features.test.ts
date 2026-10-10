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
import { CustomerModel } from '../src/models/customer.model';
import { OrderModel } from '../src/models/order.model';
import { ProductModel } from '../src/models/product.model';
import { RequirementUploadModel } from '../src/models/requirement-upload.model';

describe('customer CRM notes and last contact', () => {
  it('lets the assigned salesman add an attributable note but blocks other roles and tenants', async () => {
    const tenant = await createTenant('crm-notes');
    const other = await createTenant('crm-notes-other');
    const customer = await createCustomerUser({
      agencyId: tenant.agencyId,
      email: 'crm-shop@test.local',
      businessName: 'CRM Test Shop'
    });
    const salesman = await createSalesmanUser({
      agencyId: tenant.agencyId,
      email: 'crm-salesman@test.local',
      name: 'CRM Salesman',
      customerIds: [customer.id]
    });
    const otherSalesman = await createSalesmanUser({
      agencyId: other.agencyId,
      email: 'other-crm-salesman@test.local',
      name: 'Other Salesman',
      customerIds: []
    });

    const created = await request(getApp())
      .post(`/api/customers/${idOf(customer)}/notes`)
      .set(...auth(salesman.token))
      .send({ text: 'Requested a restock quotation for next week.', type: 'CALL' });
    expect(created.status).toBe(201);
    const noteResult = expectSuccess(created.body) as {
      accountNotes: Array<{ text: string; byRole: string }>;
      lastContactType?: string;
    };
    expect(noteResult.accountNotes.at(-1)?.text).toMatch(/restock quotation/i);
    expect(noteResult.accountNotes.at(-1)?.byRole).toBe('SALESMAN');
    expect(noteResult.lastContactType).toBe('CALL');

    const stored = await CustomerModel.findById(customer.id).lean();
    expect(stored?.accountNotes).toHaveLength(1);
    expect(stored?.lastContactAt).toBeTruthy();

    const forbidden = await request(getApp())
      .post(`/api/customers/${idOf(customer)}/notes`)
      .set(...auth(customer.token))
      .send({ text: 'A customer should not write an internal note.' });
    expect(forbidden.status).toBe(403);

    const crossTenant = await request(getApp())
      .post(`/api/customers/${idOf(customer)}/notes`)
      .set(...auth(otherSalesman.token))
      .send({ text: 'Cross-tenant note attempt.' });
    expect(crossTenant.status).toBe(404);
  });
});

describe('catalog availability projection', () => {
  it('returns real sellable units and classifies availability without exposing cost', async () => {
    const tenant = await createTenant('catalog-stock');
    const product = await createStockedProduct({
      agencyId: tenant.agencyId,
      name: 'Availability Test Gloves',
      sku: 'AVAIL-GLOVES',
      price: 500,
      batches: [{ batchNumber: 'AVAIL-A', quantity: 9, expiryInDays: 300 }]
    });
    await ProductModel.updateOne({ _id: product._id }, { $set: { reorderLevel: 10 } });

    const response = await request(getApp())
      .get('/api/products?page=1&limit=50&search=AVAIL-GLOVES')
      .set(...auth(tenant.admin.token));
    expect(response.status).toBe(200);
    const rows = expectSuccess(response.body) as unknown as Array<{
      _id: unknown;
      availableStock: number;
      availability: string;
      unitCost?: number;
    }>;
    const row = rows.find((item) => String(item._id) === String(product._id));
    expect(row?.availableStock).toBe(9);
    // The product threshold is 10, so 9 sellable units is low stock.
    expect(row?.availability).toBe('LOW_STOCK');
    expect(row).not.toHaveProperty('unitCost');

    const low = await request(getApp())
      .get('/api/products?availability=LOW_STOCK&page=1&limit=50')
      .set(...auth(tenant.admin.token));
    expect(low.status).toBe(200);
    expect(JSON.stringify(low.body)).toContain('AVAIL-GLOVES');

    await ProductModel.updateOne({ _id: product._id }, { $set: { isActive: false } });
    const active = await ProductModel.countDocuments({ agencyId: tenant.agencyId, isActive: true });
    expect(active).toBe(0);
  });
});

describe('AI-ready requirement extraction', () => {
  it('extracts a CSV deterministically, flags uncertain lines and never creates an order', async () => {
    const tenant = await createTenant('requirement-csv');
    const product = await createStockedProduct({
      agencyId: tenant.agencyId,
      name: 'Paracetamol 500mg Tablets',
      sku: 'PARA-500',
      price: 28
    });
    const customer = await createCustomerUser({
      agencyId: tenant.agencyId,
      email: 'requirement-shop@test.local',
      businessName: 'Requirement Shop'
    });
    const csv = 'Product,Quantity\nParacetamol 500mg Tablets,20\nUnlisted mystery product,5\n';

    const uploaded = await request(getApp())
      .post('/api/requirements')
      .set(...auth(customer.token))
      .field('title', 'September restock')
      .field('notes', 'Please quote the current rate.')
      .attach('file', Buffer.from(csv), { filename: 'september-requirement.csv', contentType: 'text/csv' });
    expect(uploaded.status).toBe(201);
    const requirementId = idOf(expectSuccess(uploaded.body));

    const ordersBefore = await OrderModel.countDocuments({ agencyId: tenant.agencyId });
    const extracted = await request(getApp())
      .post(`/api/requirements/${requirementId}/extract`)
      .set(...auth(tenant.admin.token))
      .send({});
    expect(extracted.status).toBe(200);
    const result = expectSuccess(extracted.body) as {
      orderCreated: boolean;
      humanConfirmationRequired: boolean;
      extraction: {
        status: string;
        provider: string;
        items: Array<{ productId?: string; quantity?: number; needsVerification: boolean }>;
      };
    };

    expect(result.orderCreated).toBe(false);
    expect(result.humanConfirmationRequired).toBe(true);
    expect(result.extraction.provider).toBe('deterministic-csv');
    expect(result.extraction.status).toBe('NEEDS_REVIEW');
    expect(result.extraction.items).toHaveLength(2);
    const matched = result.extraction.items.find((item) => item.productId);
    expect(String(matched?.productId)).toBe(String(product._id));
    expect(matched?.quantity).toBe(20);
    expect(matched?.needsVerification).toBe(false);
    expect(result.extraction.items.find((item) => !item.productId)?.needsVerification).toBe(true);
    expect(await OrderModel.countDocuments({ agencyId: tenant.agencyId })).toBe(ordersBefore);

    const stored = await RequirementUploadModel.findById(requirementId).lean();
    expect(stored?.extraction.status).toBe('NEEDS_REVIEW');
    expect(stored?.extraction.items).toHaveLength(2);
  });

  it('returns an explicit configuration error for OCR documents and blocks customer extraction', async () => {
    const tenant = await createTenant('requirement-ocr-config');
    const customer = await createCustomerUser({
      agencyId: tenant.agencyId,
      email: 'ocr-shop@test.local',
      businessName: 'OCR Shop'
    });
    const uploaded = await request(getApp())
      .post('/api/requirements')
      .set(...auth(customer.token))
      .field('title', 'Scanned requirement')
      .attach('file', Buffer.from('%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n'), {
        filename: 'scanned-requirement.pdf',
        contentType: 'application/pdf'
      });
    expect(uploaded.status).toBe(201);
    const requirementId = idOf(expectSuccess(uploaded.body));

    const customerAttempt = await request(getApp())
      .post(`/api/requirements/${requirementId}/extract`)
      .set(...auth(customer.token))
      .send({});
    expect(customerAttempt.status).toBe(403);

    const unconfigured = await request(getApp())
      .post(`/api/requirements/${requirementId}/extract`)
      .set(...auth(tenant.admin.token))
      .send({});
    expect(unconfigured.status).toBe(503);
    expect(expectError(unconfigured.body).code).toBe('AI_NOT_CONFIGURED');

    const stored = await RequirementUploadModel.findById(requirementId).lean();
    expect(stored?.extraction.status).toBe('FAILED');
    expect(stored?.extraction.errorCode).toBe('AI_NOT_CONFIGURED');
  });
});
