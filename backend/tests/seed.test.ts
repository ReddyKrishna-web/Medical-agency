import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { getApp } from './helpers/fixtures';
import { AgencyModel } from '../src/models/agency.model';
import { UserModel } from '../src/models/user.model';
import { ProductModel } from '../src/models/product.model';
import { BatchModel } from '../src/models/batch.model';
import { InventoryModel } from '../src/models/inventory.model';
import { CustomerModel } from '../src/models/customer.model';
import { hashPassword } from '../src/services/auth.service';
import { signAccessToken } from '../src/middleware/auth';

const getToken = async (userId: string): Promise<string> => {
  const user = await UserModel.findById(userId).exec();
  if (!user) throw new Error('user missing');
  return signAccessToken(user);
};

describe('seed and realtime bootstrap', () => {
  it('creates a clearly labelled demo agency with safe, upsert-safe data', async () => {
    const agency = await AgencyModel.findOneAndUpdate(
      { slug: 'seed-demo-agency' },
      {
        $set: {
          name: 'Supply Medicals (DEMO)',
          status: 'ACTIVE',
          contact: {
            email: 'agency@demo.supplymedicals.test',
            phone: '+91 90000 00001',
            address: {
              line1: 'DEMO Warehouse',
              city: 'Demo City',
              state: 'Demo State',
              country: 'India',
              postalCode: '400001'
            }
          },
          tax: { defaultTaxRate: 18, pricesIncludeTax: false, invoicePrefix: 'INV' },
          orderSettings: {
            prefix: 'SM',
            padding: 6,
            lowStockThreshold: 20,
            expiryAlertDays: 60,
            allowCustomerCancellation: true,
            cancelWindowHours: 48,
            followUpDueDays: 7,
            invoiceDueDays: 15,
            defaultPaymentTermsDays: 0
          }
        }
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    expect(agency).toBeTruthy();

    // Deterministic upsert: running twice must not duplicate.
    const again = await AgencyModel.findOneAndUpdate(
      { slug: 'seed-demo-agency' },
      { $set: { name: 'Supply Medicals (DEMO)' } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    expect(String(again?._id)).toBe(String(agency?._id));
    expect(await AgencyModel.countDocuments({ slug: 'seed-demo-agency' })).toBe(1);

    const admin = await UserModel.findOneAndUpdate(
      { email: 'admin@demo.supplymedicals.test' },
      {
        $set: {
          agencyId: agency?._id,
          name: 'DEMO Agency Admin',
          role: 'AGENCY_ADMIN',
          status: 'ACTIVE',
          passwordHash: await hashPassword('AdminDemo1!')
        }
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    expect(admin).toBeTruthy();

    // A pending customer is created and cannot sign in.
    const pending = await UserModel.findOneAndUpdate(
      { email: 'pending@demo.supplymedicals.test' },
      {
        $set: {
          agencyId: agency?._id,
          name: 'DEMO Applicant',
          role: 'CUSTOMER',
          status: 'PENDING',
          passwordHash: await hashPassword('PendingDemo1!')
        }
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    const pendingCustomer = await CustomerModel.findOneAndUpdate(
      { agencyId: agency?._id, userId: pending?._id },
      {
        $set: {
          businessName: 'DEMO New Life Pharmacy',
          ownerName: 'DEMO Applicant',
          phone: '+91 90000 00102',
          status: 'PENDING',
          address: {
            line1: 'DEMO New Life Pharmacy',
            city: 'Demo City',
            state: 'Demo State',
            country: 'India',
            postalCode: '400002'
          }
        }
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    expect(pendingCustomer?.status).toBe('PENDING');

    const login = await request(getApp())
      .post('/api/auth/login')
      .send({ email: 'pending@demo.supplymedicals.test', password: 'PendingDemo1!' });
    expect(login.status).toBe(403);

    const product = await ProductModel.findOneAndUpdate(
      { agencyId: agency?._id, sku: 'DEMO-GLV-M' },
      {
        $set: {
          name: 'DEMO Nitrile Examination Gloves (M)',
          price: 640,
          taxRate: 18,
          unit: 'BOX',
          isActive: true
        }
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    const batch = await BatchModel.findOneAndUpdate(
      { agencyId: agency?._id, productId: product?._id, batchNumber: 'DEMO-GLV-M-A' },
      {
        $set: { expiryDate: new Date(Date.now() + 45 * 86_400_000), status: 'ACTIVE' }
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    const inventoryCount = await InventoryModel.countDocuments({ agencyId: agency?._id, batchId: batch?._id });
    expect(inventoryCount).toBeLessThanOrEqual(1);
  });

  it('binds a valid access token to the tenant context', async () => {
    const agency = await AgencyModel.findOneAndUpdate(
      { slug: 'auth-probe-agency' },
      {
        $set: {
          name: 'Auth Probe Agency',
          status: 'ACTIVE',
          contact: {
            email: 'probe@test.local',
            phone: '+91 90000 00000',
            address: {
              line1: '1 Test Street',
              city: 'Test City',
              state: 'Test State',
              country: 'Testland',
              postalCode: '00001'
            }
          }
        }
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    const user = await UserModel.create({
      agencyId: agency?._id,
      name: 'Probe Admin',
      email: `probe-admin-${Date.now()}@test.local`,
      phone: '+91 90000 00001',
      role: 'AGENCY_ADMIN',
      status: 'ACTIVE',
      passwordHash: await hashPassword('TestPass123!')
    });

    const token = await getToken(String(user._id));
    const response = await request(getApp()).get('/api/auth/me').set('Authorization', `Bearer ${token}`);
    expect(response.status).toBe(200);
    expect((response.body as { data: { user: { role: string } } }).data.user.role).toBe('AGENCY_ADMIN');
  });
});
