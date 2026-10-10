import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { auth, createCustomerUser, createStockedProduct, createTenant, expectError, expectSuccess, getApp, idOf } from './helpers/fixtures';
import { BatchModel } from '../src/models/batch.model';
import { InventoryModel } from '../src/models/inventory.model';
import { StockMovementModel } from '../src/models/stock-movement.model';
import { OrderModel } from '../src/models/order.model';
import { reserveStock, commitStock, getAvailability } from '../src/services/stock.service';

const daysFromNow = (days: number): Date => new Date(Date.now() + days * 86_400_000);

describe('inventory safety', () => {
  it('never allocates more sellable stock than exists', async () => {
    const tenant = await createTenant('stock-oversell');
    const customer = await createCustomerUser({
      agencyId: tenant.agencyId,
      email: 'stock-oversell-customer@test.local',
      businessName: 'Oversell Shop'
    });
    const product = await createStockedProduct({
      agencyId: tenant.agencyId,
      name: 'Scarce Product',
      batches: [{ batchNumber: 'SCARCE-1', quantity: 10, expiryInDays: 100 }]
    });

    const created = await request(getApp())
      .post('/api/orders')
      .set(...auth(customer.token))
      .send({ items: [{ productId: product._id.toString(), quantity: 10 }] });
    expect(created.status).toBe(201);
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

    // A second customer now tries to take the same units.
    const other = await createCustomerUser({
      agencyId: tenant.agencyId,
      email: 'stock-oversell-other@test.local',
      businessName: 'Second Oversell Shop'
    });
    const second = await request(getApp())
      .post('/api/orders')
      .set(...auth(other.token))
      .send({ items: [{ productId: product._id.toString(), quantity: 5 }] });
    expect(second.status).toBe(201);
    const secondOrderId = idOf(expectSuccess(second.body));

    await request(getApp())
      .post(`/api/orders/${secondOrderId}/status`)
      .set(...auth(tenant.admin.token))
      .send({ status: 'UNDER_REVIEW' })
      .expect(200);

    const rejected = await request(getApp())
      .post(`/api/orders/${secondOrderId}/status`)
      .set(...auth(tenant.admin.token))
      .send({ status: 'CONFIRMED' });

    expect(rejected.status).toBe(409);
    expect(expectError(rejected.body).code).toBe('INSUFFICIENT_STOCK');

    const inventory = await InventoryModel.findOne({ agencyId: tenant.agencyId }).lean();
    expect(inventory?.quantityOnHand).toBe(10);
    expect(inventory?.quantityReserved).toBe(10);
    expect(inventory!.quantityOnHand - inventory!.quantityReserved).toBe(0);

    const secondOrder = await OrderModel.findById(secondOrderId).lean();
    expect(secondOrder?.status).toBe('UNDER_REVIEW');
  });

  it('compensates a partial allocation so no stock is left reserved by a failed order', async () => {
    const tenant = await createTenant('stock-compensate');
    const plentiful = await createStockedProduct({
      agencyId: tenant.agencyId,
      name: 'Plentiful Product',
      batches: [{ batchNumber: 'PLENTY-1', quantity: 100, expiryInDays: 200 }]
    });
    const scarce = await createStockedProduct({
      agencyId: tenant.agencyId,
      name: 'Scarce Two Product',
      batches: [{ batchNumber: 'SCARCE2-1', quantity: 2, expiryInDays: 60 }]
    });

    const error = await reserveStock(
      tenant.agencyId,
      [
        { productId: plentiful._id, quantity: 10 },
        { productId: scarce._id, quantity: 5 }
      ],
      { agencyId: tenant.agencyId, referenceType: 'ORDER', reason: 'test' }
    ).catch((caught: Error) => caught);

    expect(error).toBeInstanceOf(Error);

    // Nothing may stay reserved from the line that could have been taken.
    const plentifulInventory = await InventoryModel.findOne({ agencyId: tenant.agencyId, productId: plentiful._id }).lean();
    expect(plentifulInventory?.quantityReserved).toBe(0);
    expect(plentifulInventory?.quantityOnHand).toBe(100);
  });

  it('holds the line under concurrent reservations', async () => {
    const tenant = await createTenant('stock-concurrency');
    const product = await createStockedProduct({
      agencyId: tenant.agencyId,
      name: 'Concurrent Product',
      batches: [{ batchNumber: 'CONC-1', quantity: 20, expiryInDays: 200 }]
    });

    const attempts = await Promise.allSettled(
      Array.from({ length: 5 }, () =>
        reserveStock(tenant.agencyId, [{ productId: product._id, quantity: 10 }], {
          agencyId: tenant.agencyId,
          referenceType: 'ORDER',
          reason: 'concurrency test'
        })
      )
    );

    const fulfilled = attempts.filter((attempt) => attempt.status === 'fulfilled');
    expect(fulfilled.length).toBeGreaterThanOrEqual(1);
    expect(fulfilled.length).toBeLessThanOrEqual(2);

    const inventory = await InventoryModel.findOne({ agencyId: tenant.agencyId, productId: product._id }).lean();
    expect(inventory!.quantityReserved).toBeLessThanOrEqual(20);
    expect(inventory!.quantityReserved).toBeGreaterThanOrEqual(10);
    expect(inventory!.quantityOnHand - inventory!.quantityReserved).toBeGreaterThanOrEqual(0);
  });

  it('never sells expired stock and marks it instead', async () => {
    const tenant = await createTenant('stock-expired');
    const product = await createStockedProduct({
      agencyId: tenant.agencyId,
      name: 'Expiring Product',
      batches: [
        { batchNumber: 'EXPIRED-1', quantity: 50, expiryInDays: -5 },
        { batchNumber: 'FRESH-1', quantity: 5, expiryInDays: 60 }
      ]
    });

    const availability = await getAvailability(tenant.agencyId, [{ productId: product._id, quantity: 1 }]);
    expect(availability[0]?.sellable).toBe(5);
    expect(availability[0]?.expiredQuantity).toBe(50);
    expect(availability[0]?.batches.map((batch) => batch.batchNumber)).toEqual(['FRESH-1']);

    // The expired batch cannot satisfy a bigger order either.
    const rejection = await reserveStock(
      tenant.agencyId,
      [{ productId: product._id, quantity: 20 }],
      { agencyId: tenant.agencyId, referenceType: 'ORDER' }
    ).catch((error: Error) => error);
    expect(rejection).toBeInstanceOf(Error);

    // Receiving stock with a past expiry is refused.
    await createCustomerUser({
      agencyId: tenant.agencyId,
      email: 'stock-expired-customer@test.local',
      businessName: 'Expiry Shop'
    });
    const receive = await request(getApp())
      .post('/api/inventory/batches')
      .set(...auth(tenant.admin.token))
      .send({
        productId: product._id.toString(),
        batchNumber: 'ALREADY-EXPIRED',
        quantity: 5,
        expiryDate: daysFromNow(-1).toISOString()
      });
    expect(receive.status).toBe(422);
  });

  it('prevents a negative balance on a manual adjustment', async () => {
    const tenant = await createTenant('stock-negative');
    const product = await createStockedProduct({
      agencyId: tenant.agencyId,
      name: 'Adjustment Product',
      batches: [{ batchNumber: 'ADJ-1', quantity: 10, expiryInDays: 180 }]
    });
    const inventory = await InventoryModel.findOne({ agencyId: tenant.agencyId, productId: product._id }).lean();

    const tooMuch = await request(getApp())
      .post('/api/inventory/adjust')
      .set(...auth(tenant.admin.token))
      .send({ inventoryId: String(inventory?._id), delta: -25, reason: 'Damaged in transit' });
    expect(tooMuch.status).toBe(409);
    expect(expectError(tooMuch.body).code).toBe('INSUFFICIENT_STOCK');

    const valid = await request(getApp())
      .post('/api/inventory/adjust')
      .set(...auth(tenant.admin.token))
      .send({ inventoryId: String(inventory?._id), delta: -4, reason: 'Damaged in transit' });
    expect(valid.status).toBe(200);

    const after = await InventoryModel.findById(inventory?._id).lean();
    expect(after?.quantityOnHand).toBe(6);

    const movements = await StockMovementModel.find({ agencyId: tenant.agencyId, type: 'ADJUST_OUT' }).lean();
    expect(movements.length).toBe(1);
    expect(movements[0]?.balanceOnHand).toBe(6);
  });

  it('records a receive movement and keeps batch metadata consistent', async () => {
    const tenant = await createTenant('stock-receive');
    const product = await createStockedProduct({
      agencyId: tenant.agencyId,
      name: 'Receive Product',
      batches: [{ batchNumber: 'RECV-1', quantity: 10, expiryInDays: 300 }]
    });

    const response = await request(getApp())
      .post('/api/inventory/batches')
      .set(...auth(tenant.admin.token))
      .send({
        productId: product._id.toString(),
        batchNumber: 'RECV-2',
        quantity: 25,
        unitCost: 40,
        expiryDate: daysFromNow(365).toISOString(),
        supplier: 'Test Supplier',
        location: 'Rack B'
      });

    expect(response.status).toBe(201);
    const data = expectSuccess(response.body) as { batchNumber: string; quantityOnHand: number };
    expect(data.batchNumber).toBe('RECV-2');
    expect(data.quantityOnHand).toBe(25);

    const batch = await BatchModel.findOne({ agencyId: tenant.agencyId, batchNumber: 'RECV-2' }).lean();
    expect(batch?.supplier).toBe('Test Supplier');

    const receiveMovements = await StockMovementModel.find({
      agencyId: tenant.agencyId,
      type: 'RECEIVE',
      batchNumber: 'RECV-2'
    }).lean();
    expect(receiveMovements.length).toBe(1);
    expect(receiveMovements[0]?.direction).toBe('IN');
    expect(receiveMovements[0]?.balanceOnHand).toBe(25);
  });

  it('validates a proposed order before it is placed', async () => {
    const tenant = await createTenant('stock-validate');
    const customer = await createCustomerUser({
      agencyId: tenant.agencyId,
      email: 'stock-validate-customer@test.local',
      businessName: 'Validate Shop'
    });
    const product = await createStockedProduct({
      agencyId: tenant.agencyId,
      name: 'Validate Product',
      batches: [{ batchNumber: 'VAL-1', quantity: 8, expiryInDays: 90 }]
    });

    const ok = await request(getApp())
      .post('/api/inventory/validate')
      .set(...auth(customer.token))
      .send({ items: [{ productId: product._id.toString(), quantity: 5 }] });
    expect(ok.status).toBe(200);
    const okData = expectSuccess(ok.body) as { ok: boolean; lines: Array<{ willUseBatches: unknown[] }> };
    expect(okData.ok).toBe(true);
    expect(okData.lines[0]?.willUseBatches).toHaveLength(1);

    const short = await request(getApp())
      .post('/api/inventory/validate')
      .set(...auth(customer.token))
      .send({ items: [{ productId: product._id.toString(), quantity: 50 }] });
    expect(short.status).toBe(200);
    expect((expectSuccess(short.body) as { ok: boolean }).ok).toBe(false);
  });

  it('refuses to commit stock that was never reserved', async () => {
    const tenant = await createTenant('stock-commit');
    const product = await createStockedProduct({
      agencyId: tenant.agencyId,
      name: 'Commit Product',
      batches: [{ batchNumber: 'COMMIT-1', quantity: 5, expiryInDays: 120 }]
    });
    const inventory = await InventoryModel.findOne({ agencyId: tenant.agencyId, productId: product._id }).lean();

    const error = await commitStock(
      tenant.agencyId,
      [
        {
          productId: product._id,
          inventoryId: inventory!._id as never,
          batchId: inventory!.batchId as never,
          batchNumber: 'COMMIT-1',
          quantity: 3
        }
      ],
      { agencyId: tenant.agencyId, referenceType: 'ORDER' }
    ).catch((caught: Error) => caught);

    expect(error).toBeInstanceOf(Error);
    const after = await InventoryModel.findById(inventory?._id).lean();
    expect(after?.quantityOnHand).toBe(5);
    expect(after?.quantityReserved).toBe(0);
  });
});
