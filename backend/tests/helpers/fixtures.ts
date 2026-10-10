import type { Application } from 'express';
import request from 'supertest';
import { createApp } from '../../src/app';
import { AgencyModel } from '../../src/models/agency.model';
import { UserModel } from '../../src/models/user.model';
import { CustomerModel } from '../../src/models/customer.model';
import { SalesmanModel } from '../../src/models/salesman.model';
import { ProductModel } from '../../src/models/product.model';
import { BatchModel } from '../../src/models/batch.model';
import { InventoryModel } from '../../src/models/inventory.model';
import { hashPassword } from '../../src/services/auth.service';
import type { Role } from '../../src/constants/domain';

let cachedApp: Application | null = null;

export const getApp = (): Application => {
  if (!cachedApp) cachedApp = createApp();
  return cachedApp;
};

export const TEST_PASSWORD = 'TestPass123!';

const days = (n: number): Date => new Date(Date.now() + n * 24 * 60 * 60 * 1000);

export interface Tenant {
  agencyId: import('mongoose').Types.ObjectId;
  admin: { id: import('mongoose').Types.ObjectId; token: string };
}

export const createTenant = async (suffix: string): Promise<Tenant> => {
  const agency = await AgencyModel.create({
    name: `Test Agency ${suffix}`,
    slug: `test-agency-${suffix}-${Date.now()}`,
    status: 'ACTIVE',
    contact: {
      email: `agency-${suffix}@test.local`,
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

  const admin = await UserModel.create({
    agencyId: agency._id,
    name: `Admin ${suffix}`,
    email: `admin-${suffix}@test.local`,
    phone: '+91 90000 00001',
    role: 'AGENCY_ADMIN',
    status: 'ACTIVE',
    passwordHash: await hashPassword(TEST_PASSWORD)
  });

  const login = await request(getApp())
    .post('/api/auth/login')
    .send({ email: admin.email, password: TEST_PASSWORD });

  if (login.status !== 200) {
    throw new Error(`Test admin login failed: ${login.status} ${JSON.stringify(login.body)}`);
  }

  return { agencyId: agency._id, admin: { id: admin._id, token: login.body.data.accessToken } };
};

export interface TestUser {
  id: import('mongoose').Types.ObjectId;
  userId: import('mongoose').Types.ObjectId;
  token: string;
  email: string;
}

export const createUser = async (input: {
  agencyId: import('mongoose').Types.ObjectId;
  role: Role;
  email: string;
  name: string;
  status?: 'ACTIVE' | 'PENDING';
  password?: string;
}): Promise<TestUser> => {
  const password = input.password ?? TEST_PASSWORD;
  const user = await UserModel.create({
    agencyId: input.agencyId,
    name: input.name,
    email: input.email,
    phone: '+91 90000 00002',
    role: input.role,
    status: input.status ?? 'ACTIVE',
    passwordHash: await hashPassword(password)
  });

  const login = await request(getApp())
    .post('/api/auth/login')
    .send({ email: input.email, password });

  if (login.status !== 200) {
    throw new Error(`Test user login failed (${input.email}): ${login.status} ${JSON.stringify(login.body)}`);
  }

  return { id: user._id, userId: user._id, token: login.body.data.accessToken, email: input.email };
};

export const createCustomerUser = async (input: {
  agencyId: import('mongoose').Types.ObjectId;
  email: string;
  businessName: string;
  status?: 'PENDING' | 'APPROVED' | 'ACTIVE';
  assignedSalesmanId?: import('mongoose').Types.ObjectId;
}): Promise<TestUser> => {
  const user = await createUser({ agencyId: input.agencyId, role: 'CUSTOMER', email: input.email, name: input.businessName });
  const customer = await CustomerModel.create({
    agencyId: input.agencyId,
    userId: user.userId,
    businessName: input.businessName,
    ownerName: input.businessName,
    phone: '+91 90000 00003',
    address: { line1: '2 Test Road', city: 'Test City', state: 'Test State', country: 'Testland', postalCode: '00002' },
    status: input.status ?? 'ACTIVE',
    assignedSalesmanId: input.assignedSalesmanId,
    approvedAt: new Date()
  });

  return { ...user, id: customer._id, userId: user.userId };
};

/** Assign customers to a salesman, keeping both sides of the relation consistent. */
export const assignCustomersToSalesman = async (
  agencyId: import('mongoose').Types.ObjectId,
  salesmanId: import('mongoose').Types.ObjectId,
  customerIds: import('mongoose').Types.ObjectId[]
): Promise<void> => {
  await SalesmanModel.updateOne({ agencyId, _id: salesmanId }, { $set: { customerIds } }).exec();
  await CustomerModel.updateMany(
    { agencyId, _id: { $in: customerIds } },
    { $set: { assignedSalesmanId: salesmanId } }
  ).exec();
};

export const createSalesmanUser = async (input: {
  agencyId: import('mongoose').Types.ObjectId;
  email: string;
  name: string;
  customerIds?: import('mongoose').Types.ObjectId[];
}): Promise<{ id: import('mongoose').Types.ObjectId; token: string; userId: import('mongoose').Types.ObjectId }> => {
  const user = await createUser({
    agencyId: input.agencyId,
    role: 'SALESMAN',
    email: input.email,
    name: input.name
  });

  const salesman = await SalesmanModel.create({
    agencyId: input.agencyId,
    userId: user.userId,
    employeeCode: `EMP-${Date.now()}`,
    status: 'ACTIVE',
    customerIds: []
  });

  if (input.customerIds && input.customerIds.length > 0) {
    await assignCustomersToSalesman(input.agencyId, salesman._id, input.customerIds);
  }

  return { id: salesman._id, token: user.token, userId: user.userId };
};

export const createStockedProduct = async (input: {
  agencyId: import('mongoose').Types.ObjectId;
  name: string;
  sku?: string;
  price?: number;
  taxRate?: number;
  minOrderQuantity?: number;
  batches?: Array<{ batchNumber: string; quantity: number; expiryInDays: number }>;
}) => {
  const product = await ProductModel.create({
    agencyId: input.agencyId,
    name: input.name,
    slug: input.name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
    sku: input.sku ?? `SKU-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    price: input.price ?? 100,
    taxRate: input.taxRate ?? 10,
    unit: 'BOX',
    minOrderQuantity: input.minOrderQuantity ?? 1,
    isActive: true
  });

  const batches = input.batches ?? [{ batchNumber: 'B1', quantity: 100, expiryInDays: 200 }];
  for (const batchDefinition of batches) {
    const batch = await BatchModel.create({
      agencyId: input.agencyId,
      productId: product._id,
      batchNumber: batchDefinition.batchNumber,
      expiryDate: days(batchDefinition.expiryInDays),
      status: 'ACTIVE'
    });
    await InventoryModel.create({
      agencyId: input.agencyId,
      productId: product._id,
      batchId: batch._id,
      batchNumber: batch.batchNumber,
      expiryDate: batch.expiryDate,
      quantityOnHand: batchDefinition.quantity,
      quantityReserved: 0,
      unitCost: (input.price ?? 100) * 0.7,
      isActive: true
    });
  }

  return product;
};

export const auth = (token: string): [string, string] => ['Authorization', `Bearer ${token}`];

export const expectSuccess = (body: unknown): Record<string, unknown> => {
  const payload = body as { success?: boolean; data?: Record<string, unknown> };
  if (!payload?.success || payload.data === undefined) {
    throw new Error(`Expected a success envelope, received: ${JSON.stringify(body)}`);
  }
  return payload.data;
};

export const expectError = (body: unknown): { code: string; message: string } => {
  const payload = body as { success?: boolean; error?: { code: string; message: string } };
  if (payload?.success !== false || !payload.error) {
    throw new Error(`Expected an error envelope, received: ${JSON.stringify(body)}`);
  }
  return payload.error;
};

/** Documents expose both `_id` and `id`; accept either in assertions. */
export const idOf = (data: unknown): string => {
  const record = data as { _id?: unknown; id?: unknown };
  const value = record?._id ?? record?.id;
  if (value === undefined) {
    const keys = data && typeof data === 'object' ? Object.keys(data as object).slice(0, 10) : [];
    throw new Error(`No identifier in payload with keys: ${keys.join(', ')}`);
  }
  return String(value);
};
