import { afterAll, afterEach, beforeAll, beforeEach } from 'vitest';
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { AgencyModel } from '../src/models/agency.model';

/**
 * A replica set (not a standalone) is used on purpose so the tests exercise the
 * same transaction path a production deployment takes. The compensated saga for
 * standalone deployments is covered by the conditional-update tests in
 * `inventory.test.ts`, which call the stock service directly.
 */
let replSet: MongoMemoryReplSet | null = null;

beforeAll(async () => {
  replSet = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: 'wiredTiger' } });
  const uri = replSet.getUri();
  process.env.MONGODB_URI = uri;
  process.env.MONGO_URI_TEST = uri;

  const { connectDatabase } = await import('../src/config/database');
  await connectDatabase(uri);
}, 180_000);

/** A base agency exists so the public registration endpoint behaves realistically. */
beforeEach(async () => {
  await AgencyModel.create({
    name: 'Test Platform Agency',
    slug: 'test-platform-agency',
    status: 'ACTIVE',
    contact: {
      email: 'platform@test.local',
      phone: '+91 90000 00000',
      address: {
        line1: '1 Test Street',
        city: 'Test City',
        state: 'Test State',
        country: 'Testland',
        postalCode: '00001'
      }
    },
    tax: { defaultTaxRate: 10, pricesIncludeTax: false, invoicePrefix: 'INV' },
    orderSettings: {
      prefix: 'TS',
      padding: 6,
      lowStockThreshold: 5,
      expiryAlertDays: 30,
      allowCustomerCancellation: true,
      cancelWindowHours: 48,
      followUpDueDays: 7,
      invoiceDueDays: 15,
      defaultPaymentTermsDays: 0
    }
  });
});

afterEach(async () => {
  const collections = mongoose.connection.collections;
  await Promise.all(Object.values(collections).map((collection) => collection.deleteMany({})));
});

afterAll(async () => {
  const { disconnectDatabase } = await import('../src/config/database');
  await disconnectDatabase();
  if (replSet) {
    await replSet.stop({ doCleanup: true, force: true });
    replSet = null;
  }
}, 60_000);
