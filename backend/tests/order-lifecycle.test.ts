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
import { InventoryModel } from '../src/models/inventory.model';
import { InvoiceModel } from '../src/models/invoice.model';
import { OrderModel } from '../src/models/order.model';
import { StockMovementModel } from '../src/models/stock-movement.model';

const createOrder = async (input: {
  token: string;
  productId: string;
  quantity: number;
  customerId?: string;
}) => {
  const response = await request(getApp())
    .post('/api/orders')
    .set(...auth(input.token))
    .send({
      ...(input.customerId ? { customerId: input.customerId } : {}),
      items: [{ productId: input.productId, quantity: input.quantity }]
    });
  return response;
};

describe('order lifecycle', () => {
  it('prices the order on the server and allocates a sequential agency number', async () => {
    const tenant = await createTenant('order-price');
    const customer = await createCustomerUser({
      agencyId: tenant.agencyId,
      email: 'order-price-customer@test.local',
      businessName: 'Price Shop'
    });
    const product = await createStockedProduct({
      agencyId: tenant.agencyId,
      name: 'Priced Product',
      price: 250,
      taxRate: 12
    });

    const response = await request(getApp())
      .post('/api/orders')
      .set(...auth(customer.token))
      // A hostile client tries to dictate price and tax.
      .send({
        items: [{ productId: product._id.toString(), quantity: 4, unitPrice: 1, taxRate: 0 }],
        notes: 'Deliver before Friday'
      });

    expect(response.status).toBe(201);
    const order = expectSuccess(response.body) as {
      orderNumber: string;
      status: string;
      subtotal: number;
      taxTotal: number;
      grandTotal: number;
      source: string;
    };

    expect(order.orderNumber).toMatch(/^TS-\d{4}-000001$/);
    expect(order.status).toBe('PENDING');
    expect(order.subtotal).toBe(1000);
    expect(order.taxTotal).toBe(120);
    expect(order.grandTotal).toBe(1120);
    expect(order.source).toBe('CUSTOMER_PORTAL');

    const second = await createOrder({ token: customer.token, productId: product._id.toString(), quantity: 1 });
    expect(second.status).toBe(201);
    const secondOrder = expectSuccess(second.body) as { orderNumber: string };
    expect(secondOrder.orderNumber).toMatch(/-000002$/);
  });

  it('rejects invalid quantities and non-integer amounts', async () => {
    const tenant = await createTenant('order-invalid');
    const customer = await createCustomerUser({
      agencyId: tenant.agencyId,
      email: 'order-invalid-customer@test.local',
      businessName: 'Invalid Shop'
    });
    const product = await createStockedProduct({ agencyId: tenant.agencyId, name: 'Invalid Product' });

    const zero = await createOrder({ token: customer.token, productId: product._id.toString(), quantity: 0 });
    expect(zero.status).toBe(422);
    expect(expectError(zero.body).code).toBe('VALIDATION_ERROR');

    const negative = await createOrder({ token: customer.token, productId: product._id.toString(), quantity: -3 });
    expect(negative.status).toBe(422);

    const fractional = await createOrder({ token: customer.token, productId: product._id.toString(), quantity: 1.5 });
    expect(fractional.status).toBe(422);

    const empty = await request(getApp())
      .post('/api/orders')
      .set(...auth(customer.token))
      .send({ items: [] });
    expect(empty.status).toBe(422);

    expect(await OrderModel.countDocuments({ agencyId: tenant.agencyId })).toBe(0);
  });

  it('enforces the state machine and blocks a customer from marking an order delivered', async () => {
    const tenant = await createTenant('order-states');
    const customer = await createCustomerUser({
      agencyId: tenant.agencyId,
      email: 'order-states-customer@test.local',
      businessName: 'States Shop'
    });
    const product = await createStockedProduct({
      agencyId: tenant.agencyId,
      name: 'Lifecycle Product',
      batches: [{ batchNumber: 'LIFE-1', quantity: 50, expiryInDays: 120 }]
    });

    const created = await createOrder({ token: customer.token, productId: product._id.toString(), quantity: 5 });
    const orderId = idOf(expectSuccess(created.body));

    // A customer may not advance the order.
    const customerConfirm = await request(getApp())
      .post(`/api/orders/${orderId}/status`)
      .set(...auth(customer.token))
      .send({ status: 'UNDER_REVIEW' });
    expect(customerConfirm.status).toBe(403);

    const review = await request(getApp())
      .post(`/api/orders/${orderId}/status`)
      .set(...auth(tenant.admin.token))
      .send({ status: 'UNDER_REVIEW', note: 'Checking credit' });
    expect(review.status).toBe(200);

    // Skipping a stage is refused.
    const skip = await request(getApp())
      .post(`/api/orders/${orderId}/status`)
      .set(...auth(tenant.admin.token))
      .send({ status: 'DELIVERED' });
    expect(skip.status).toBe(409);
    expect(expectError(skip.body).code).toBe('INVALID_TRANSITION');

    const confirm = await request(getApp())
      .post(`/api/orders/${orderId}/status`)
      .set(...auth(tenant.admin.token))
      .send({ status: 'CONFIRMED' });
    expect(confirm.status).toBe(200);
    expect((expectSuccess(confirm.body) as { status: string }).status).toBe('CONFIRMED');

    const processing = await request(getApp())
      .post(`/api/orders/${orderId}/status`)
      .set(...auth(tenant.admin.token))
      .send({ status: 'PROCESSING' });
    expect(processing.status).toBe(200);

    const packed = await request(getApp())
      .post(`/api/orders/${orderId}/status`)
      .set(...auth(tenant.admin.token))
      .send({ status: 'PACKED' });
    expect(packed.status).toBe(200);

    const dispatched = await request(getApp())
      .post(`/api/orders/${orderId}/status`)
      .set(...auth(tenant.admin.token))
      .send({ status: 'DISPATCHED' });
    expect(dispatched.status).toBe(200);

    // Customers can never mark an order delivered.
    const customerDeliver = await request(getApp())
      .post(`/api/orders/${orderId}/status`)
      .set(...auth(customer.token))
      .send({ status: 'DELIVERED' });
    expect(customerDeliver.status).toBe(403);

    const delivered = await request(getApp())
      .post(`/api/orders/${orderId}/status`)
      .set(...auth(tenant.admin.token))
      .send({ status: 'DELIVERED' });
    expect(delivered.status).toBe(200);

    const payload = expectSuccess(delivered.body) as {
      order: { status: string; invoiceId?: string; orderNumber: string };
    };
    expect(payload.order.status).toBe('DELIVERED');
    expect(payload.order.invoiceId).toBeTruthy();

    const invoice = await InvoiceModel.findById(payload.order.invoiceId as string).lean();
    expect(invoice?.invoiceNumber).toMatch(/^INV-\d{4}-\d{6}$/);
    expect(invoice?.orderNumber).toBe(payload.order.orderNumber);
    expect(invoice?.grandTotal).toBe(550); // 5 x 100 plus 10% tax
  });

  it('reserves stock on confirmation, deducts on processing and audits both', async () => {
    const tenant = await createTenant('order-stock');
    const customer = await createCustomerUser({
      agencyId: tenant.agencyId,
      email: 'order-stock-customer@test.local',
      businessName: 'Stock Shop'
    });
    const product = await createStockedProduct({
      agencyId: tenant.agencyId,
      name: 'Reserved Product',
      batches: [
        { batchNumber: 'SOON-1', quantity: 30, expiryInDays: 30 },
        { batchNumber: 'LATE-1', quantity: 30, expiryInDays: 300 }
      ]
    });

    const created = await createOrder({ token: customer.token, productId: product._id.toString(), quantity: 40 });
    const orderId = idOf(expectSuccess(created.body));

    await request(getApp())
      .post(`/api/orders/${orderId}/status`)
      .set(...auth(tenant.admin.token))
      .send({ status: 'UNDER_REVIEW' })
      .expect(200);
    await request(getApp())
      .post(`/api/orders/${orderId}/status`)
      .set(...auth(tenant.admin.token))
      .send({ status: 'CONFIRMED' })
      .expect(200);

    const afterConfirm = await InventoryModel.find({ agencyId: tenant.agencyId }).sort({ batchNumber: 1 }).lean();
    // FEFO: the earlier expiry takes the first 30 units, the later batch the rest.
    expect(afterConfirm[0]?.batchNumber).toBe('LATE-1');
    expect(afterConfirm[0]?.quantityReserved).toBe(10);
    expect(afterConfirm[1]?.batchNumber).toBe('SOON-1');
    expect(afterConfirm[1]?.quantityReserved).toBe(30);

    // Physical stock is untouched while stock is only reserved.
    expect(afterConfirm.reduce((total, row) => total + (row.quantityOnHand ?? 0), 0)).toBe(60);

    const reserveMovements = await StockMovementModel.find({
      agencyId: tenant.agencyId,
      type: 'RESERVE'
    }).lean();
    expect(reserveMovements.length).toBe(2);
    expect(reserveMovements.map((movement) => movement.batchNumber).sort()).toEqual(['LATE-1', 'SOON-1']);

    await request(getApp())
      .post(`/api/orders/${orderId}/status`)
      .set(...auth(tenant.admin.token))
      .send({ status: 'PROCESSING' })
      .expect(200);

    const afterProcessing = await InventoryModel.find({ agencyId: tenant.agencyId }).sort({ batchNumber: 1 }).lean();
    expect(afterProcessing[0]?.quantityOnHand).toBe(20);
    expect(afterProcessing[0]?.quantityReserved).toBe(0);
    expect(afterProcessing[1]?.quantityOnHand).toBe(0);
    expect(afterProcessing[1]?.quantityReserved).toBe(0);

    const deductions = await StockMovementModel.find({ agencyId: tenant.agencyId, type: 'DEDUCT' }).lean();
    expect(deductions.length).toBe(2);
  });

  it('releases a reservation when a customer cancels a confirmed order', async () => {
    const tenant = await createTenant('order-cancel');
    const customer = await createCustomerUser({
      agencyId: tenant.agencyId,
      email: 'order-cancel-customer@test.local',
      businessName: 'Cancel Shop'
    });
    const product = await createStockedProduct({
      agencyId: tenant.agencyId,
      name: 'Cancelable Product',
      batches: [{ batchNumber: 'CANCEL-1', quantity: 20, expiryInDays: 90 }]
    });

    const created = await createOrder({ token: customer.token, productId: product._id.toString(), quantity: 8 });
    const orderId = idOf(expectSuccess(created.body));

    await request(getApp())
      .post(`/api/orders/${orderId}/status`)
      .set(...auth(tenant.admin.token))
      .send({ status: 'UNDER_REVIEW' })
      .expect(200);
    await request(getApp())
      .post(`/api/orders/${orderId}/status`)
      .set(...auth(tenant.admin.token))
      .send({ status: 'CONFIRMED' })
      .expect(200);

    const reserved = await InventoryModel.findOne({ agencyId: tenant.agencyId }).lean();
    expect(reserved?.quantityReserved).toBe(8);

    const cancelled = await request(getApp())
      .post(`/api/orders/${orderId}/cancel`)
      .set(...auth(customer.token))
      .send({ reason: 'Ordered the wrong item' });

    expect(cancelled.status).toBe(200);
    const payload = expectSuccess(cancelled.body) as { status: string; stockDisposition: string };
    expect(payload.status).toBe('CANCELLED');
    expect(payload.stockDisposition).toBe('RELEASED');

    const afterCancel = await InventoryModel.findOne({ agencyId: tenant.agencyId }).lean();
    expect(afterCancel?.quantityReserved).toBe(0);
    expect(afterCancel?.quantityOnHand).toBe(20);

    const releases = await StockMovementModel.find({ agencyId: tenant.agencyId, type: 'RELEASE' }).lean();
    expect(releases.length).toBeGreaterThanOrEqual(1);
  });

  it('refuses cancellation once the order is dispatched and restores stock for an admin cancel', async () => {
    const tenant = await createTenant('order-cancel-late');
    const customer = await createCustomerUser({
      agencyId: tenant.agencyId,
      email: 'order-late-customer@test.local',
      businessName: 'Late Cancel Shop'
    });
    const product = await createStockedProduct({
      agencyId: tenant.agencyId,
      name: 'Late Cancel Product',
      batches: [{ batchNumber: 'LATE-CANCEL-1', quantity: 25, expiryInDays: 200 }]
    });

    const created = await createOrder({ token: customer.token, productId: product._id.toString(), quantity: 6 });
    const orderId = idOf(expectSuccess(created.body));

    for (const status of ['UNDER_REVIEW', 'CONFIRMED', 'PROCESSING', 'PACKED', 'DISPATCHED']) {
      await request(getApp())
        .post(`/api/orders/${orderId}/status`)
        .set(...auth(tenant.admin.token))
        .send({ status })
        .expect(200);
    }

    const customerCancel = await request(getApp())
      .post(`/api/orders/${orderId}/cancel`)
      .set(...auth(customer.token))
      .send({ reason: 'Too late to change my mind' });
    expect(customerCancel.status).toBe(403);

    const afterDispatch = await InventoryModel.findOne({ agencyId: tenant.agencyId }).lean();
    expect(afterDispatch?.quantityOnHand).toBe(19);

    const adminCancel = await request(getApp())
      .post(`/api/orders/${orderId}/cancel`)
      .set(...auth(tenant.admin.token))
      .send({ reason: 'Vehicle breakdown' });
    expect(adminCancel.status).toBe(200);

    const payload = expectSuccess(adminCancel.body) as { stockDisposition: string };
    expect(payload.stockDisposition).toBe('RESTORED');

    const afterRestore = await InventoryModel.findOne({ agencyId: tenant.agencyId }).lean();
    expect(afterRestore?.quantityOnHand).toBe(25);

    const returns = await StockMovementModel.find({ agencyId: tenant.agencyId, type: 'RETURN' }).lean();
    expect(returns.length).toBe(1);
  });

  it('lets only the assigned salesman order for a customer', async () => {
    const tenant = await createTenant('order-salesman');
    const assigned = await createCustomerUser({
      agencyId: tenant.agencyId,
      email: 'order-assigned@test.local',
      businessName: 'Assigned Order Shop'
    });
    const other = await createCustomerUser({
      agencyId: tenant.agencyId,
      email: 'order-other@test.local',
      businessName: 'Other Order Shop'
    });
    const salesman = await createSalesmanUser({
      agencyId: tenant.agencyId,
      email: 'order-salesman@test.local',
      name: 'Order Salesman',
      customerIds: [assigned.id]
    });
    const product = await createStockedProduct({ agencyId: tenant.agencyId, name: 'Salesman Product' });

    const allowed = await createOrder({
      token: salesman.token,
      customerId: assigned.id.toString(),
      productId: product._id.toString(),
      quantity: 2
    });
    expect(allowed.status).toBe(201);

    const denied = await createOrder({
      token: salesman.token,
      customerId: other.id.toString(),
      productId: product._id.toString(),
      quantity: 2
    });
    expect(denied.status).toBe(403);
  });

  it('supports reorder with fresh server pricing', async () => {
    const tenant = await createTenant('order-reorder');
    const customer = await createCustomerUser({
      agencyId: tenant.agencyId,
      email: 'order-reorder-customer@test.local',
      businessName: 'Reorder Shop'
    });
    const product = await createStockedProduct({
      agencyId: tenant.agencyId,
      name: 'Reorder Product',
      price: 100,
      taxRate: 10
    });

    const created = await createOrder({ token: customer.token, productId: product._id.toString(), quantity: 3 });
    const original = expectSuccess(created.body) as { orderNumber: string; grandTotal: number };

    // Price change is picked up on reorder.
    const { ProductModel } = await import('../src/models/product.model');
    await ProductModel.updateOne({ _id: product._id }, { $set: { price: 200 } });

    const reorder = await request(getApp())
      .post('/api/orders/reorder')
      .set(...auth(customer.token))
      .send({ orderId: idOf(expectSuccess(created.body)) });

    expect(reorder.status).toBe(201);
    const reordered = expectSuccess(reorder.body) as { orderNumber: string; grandTotal: number; source: string };
    expect(reordered.orderNumber).not.toBe(original.orderNumber);
    expect(reordered.source).toBe('REORDER');
    expect(reordered.grandTotal).toBe(660); // 3 x 200 + 10% tax
  });

  it('honours an idempotency key for order creation', async () => {
    const tenant = await createTenant('order-idempotent');
    const customer = await createCustomerUser({
      agencyId: tenant.agencyId,
      email: 'order-idem-customer@test.local',
      businessName: 'Idempotent Shop'
    });
    const product = await createStockedProduct({ agencyId: tenant.agencyId, name: 'Idempotent Product' });

    const first = await request(getApp())
      .post('/api/orders')
      .set(...auth(customer.token))
      .set('Idempotency-Key', 'order-key-001')
      .send({ items: [{ productId: product._id.toString(), quantity: 1 }] });
    expect(first.status).toBe(201);

    const replay = await request(getApp())
      .post('/api/orders')
      .set(...auth(customer.token))
      .set('Idempotency-Key', 'order-key-001')
      .send({ items: [{ productId: product._id.toString(), quantity: 1 }] });

    expect(replay.status).toBe(201);
    expect(idOf(expectSuccess(replay.body))).toBe(idOf(expectSuccess(first.body)));
    expect(await OrderModel.countDocuments({ agencyId: tenant.agencyId })).toBe(1);

    const conflicting = await request(getApp())
      .post('/api/orders')
      .set(...auth(customer.token))
      .set('Idempotency-Key', 'order-key-001')
      .send({ items: [{ productId: product._id.toString(), quantity: 2 }] });
    expect(conflicting.status).toBe(409);
    expect(expectError(conflicting.body).code).toBe('IDEMPOTENCY_CONFLICT');
  });
});
