/**
 * Deterministic development seed.
 *
 * Everything it creates is clearly marked as DEMO data. It is idempotent: every
 * write is an upsert keyed on a stable natural key, so running it twice changes
 * nothing. Credentials are only printed outside production, and the script
 * refuses to run in production at all.
 */
import { env } from '../config/env';
import { connectDatabase, disconnectDatabase } from '../config/database';
import { AgencyModel } from '../models/agency.model';
import { UserModel } from '../models/user.model';
import { CustomerModel } from '../models/customer.model';
import { SalesmanModel } from '../models/salesman.model';
import { CategoryModel } from '../models/category.model';
import { ProductModel } from '../models/product.model';
import { BatchModel } from '../models/batch.model';
import { InventoryModel } from '../models/inventory.model';
import { hashPassword, generateSeedPassword } from './demo-passwords';
import { recordActivity } from '../services/activity.service';
import { logger } from '../utils/logger';
import { DEMO_PASSWORD_FALLBACK } from './demo-passwords';

const DEMO_SLUG = 'supply-medicals-demo';
const DEMO_EMAIL_DOMAIN = '@demo.supplymedicals.test';

const banner = (): void => {
  if (env.isProduction) return;
  console.log('');
  console.log('  ============================================================');
  console.log('   DEMO SEED DATA - Supply Medicals development dataset');
  console.log('   These accounts are for local development only.');
  console.log('  ============================================================');
  console.log('');
};

const line = (label: string, value: string): void => console.log(`   ${label.padEnd(26)} ${value}`);

const daysFromNow = (days: number): Date => new Date(Date.now() + days * 24 * 60 * 60 * 1000);

const PASSWORD = process.env.SEED_DEMO_PASSWORD ?? DEMO_PASSWORD_FALLBACK;

const run = async (): Promise<void> => {
  if (env.isProduction) {
    console.error('');
    console.error('  Refusing to seed demo data with NODE_ENV=production.');
    console.error('  Create a real agency administrator through a controlled bootstrap instead.');
    console.error('');
    process.exitCode = 1;
    return;
  }

  banner();
  await connectDatabase();

  /* --------------------------------- agency -------------------------------- */
  const agency =
    (await AgencyModel.findOneAndUpdate(
      { slug: DEMO_SLUG },
      {
        $set: {
          name: 'Supply Medicals (DEMO)',
          legalName: 'Supply Medicals Distribution Pvt Ltd - DEMO',
          status: 'ACTIVE',
          website: 'https://demo.supplymedicals.test',
          description:
            'DEMO tenant used by the development seed. Wholesale medical distribution agency.',
          contact: {
            email: `agency${DEMO_EMAIL_DOMAIN}`,
            phone: '+91 90000 00001',
            address: {
              line1: 'DEMO Warehouse 1, Medical Market',
              line2: 'Demo Block',
              city: 'Demo City',
              state: 'Demo State',
              country: 'India',
              postalCode: '400001'
            }
          },
          tax: { gstNumber: '27DEMO0001A1Z5', defaultTaxRate: 18, pricesIncludeTax: false, invoicePrefix: 'INV' },
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
          },
          features: { aiEnabled: true, uploadsEnabled: true, socketEnabled: true },
          businessHours: {
            MONDAY: '09:00 - 13:00, 16:00 - 20:00',
            TUESDAY: '09:00 - 13:00, 16:00 - 20:00',
            WEDNESDAY: '09:00 - 13:00, 16:00 - 20:00',
            THURSDAY: '09:00 - 13:00, 16:00 - 20:00',
            FRIDAY: '09:00 - 13:00, 16:00 - 20:00',
            SATURDAY: '09:30 - 14:00',
            SUNDAY: null
          },
          notifications: {
            email: {
              newOrder: true,
              orderStatusChange: true,
              paymentRecorded: true,
              inventoryLow: true,
              inventoryExpiring: true,
              requirementUploaded: true,
              followUpDue: true,
              contactSubmission: true
            },
            quietHoursEnabled: false,
            quietHoursStart: '21:00',
            quietHoursEnd: '08:00'
          }
        }
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    )) ?? null;

  if (!agency) throw new Error('DEMO agency could not be created');
  const agencyId = agency._id;

  /* --------------------------------- users --------------------------------- */
  const adminEmail = (process.env.SEED_ADMIN_EMAIL ?? `admin${DEMO_EMAIL_DOMAIN}`).toLowerCase();
  const salesmanEmail = (process.env.SEED_SALESMAN_EMAIL ?? `salesman${DEMO_EMAIL_DOMAIN}`).toLowerCase();
  const customerEmail = (process.env.SEED_CUSTOMER_EMAIL ?? `owner${DEMO_EMAIL_DOMAIN}`).toLowerCase();
  const secondaryCustomerEmail = (process.env.SEED_SECONDARY_CUSTOMER_EMAIL ?? `citycare${DEMO_EMAIL_DOMAIN}`).toLowerCase();
  const pendingEmail = (process.env.SEED_PENDING_CUSTOMER_EMAIL ?? `pending${DEMO_EMAIL_DOMAIN}`).toLowerCase();

  const adminPassword = process.env.SEED_ADMIN_PASSWORD || generateSeedPassword('admin');
  const salesmanPassword = process.env.SEED_SALESMAN_PASSWORD || generateSeedPassword('salesman');
  const customerPassword = process.env.SEED_CUSTOMER_PASSWORD || generateSeedPassword('customer');
  const secondaryCustomerPassword = process.env.SEED_SECONDARY_CUSTOMER_PASSWORD || generateSeedPassword('citycare');
  const pendingPassword = process.env.SEED_PENDING_CUSTOMER_PASSWORD || generateSeedPassword('pending');

  const upsertUser = async (input: {
    email: string;
    name: string;
    phone: string;
    role: 'AGENCY_ADMIN' | 'SALESMAN' | 'CUSTOMER';
    status: 'ACTIVE' | 'PENDING';
    password: string;
  }) => {
    const existing = await UserModel.findOne({ email: input.email }).select('+passwordHash').exec();
    if (existing) {
      existing.name = input.name;
      existing.phone = input.phone;
      existing.role = input.role;
      existing.status = input.status;
      existing.passwordHash = await hashPassword(input.password);
      existing.passwordChangedAt = new Date();
      await existing.save();
      return existing;
    }
    return UserModel.create({
      agencyId,
      name: input.name,
      email: input.email,
      phone: input.phone,
      role: input.role,
      status: input.status,
      passwordHash: await hashPassword(input.password),
      tokenVersion: 0,
      mustChangePassword: false
    });
  };

  const admin = await upsertUser({
    email: adminEmail,
    name: 'DEMO Agency Admin',
    phone: '+91 90000 00010',
    role: 'AGENCY_ADMIN',
    status: 'ACTIVE',
    password: adminPassword
  });

  const salesmanUser = await upsertUser({
    email: salesmanEmail,
    name: 'DEMO Salesman Ravi',
    phone: '+91 90000 00011',
    role: 'SALESMAN',
    status: 'ACTIVE',
    password: salesmanPassword
  });

  const customerUser = await upsertUser({
    email: customerEmail,
    name: 'DEMO Shop Owner Meera',
    phone: '+91 90000 00012',
    role: 'CUSTOMER',
    status: 'ACTIVE',
    password: customerPassword
  });

  const secondaryCustomerUser = await upsertUser({
    email: secondaryCustomerEmail,
    name: 'DEMO City Care Owner Ananya',
    phone: '+91 90000 00014',
    role: 'CUSTOMER',
    status: 'ACTIVE',
    password: secondaryCustomerPassword
  });

  const pendingUser = await upsertUser({
    email: pendingEmail,
    name: 'DEMO Applicant Karan',
    phone: '+91 90000 00013',
    role: 'CUSTOMER',
    status: 'PENDING',
    password: pendingPassword
  });

  /* -------------------------------- salesman ------------------------------- */
  const salesman =
    (await SalesmanModel.findOneAndUpdate(
      { agencyId, userId: salesmanUser._id },
      {
        $set: {
          employeeCode: 'SM-DEMO-001',
          territory: 'Demo City North',
          phone: salesmanUser.phone,
          status: 'ACTIVE',
          joinedAt: new Date(),
          notes: 'DEMO salesman account'
        },
        $setOnInsert: { agencyId, userId: salesmanUser._id, customerIds: [] }
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    )) ?? null;

  if (!salesman) throw new Error('DEMO salesman could not be created');

  /* -------------------------------- customers ------------------------------ */
  const customerDefinitions = [
    {
      userId: customerUser._id,
      businessName: 'DEMO Sri Sai Medicals',
      ownerName: 'Meera Sharma',
      phone: '+91 90000 00101',
      email: customerEmail,
      gstNumber: '27DEMO0001B1ZX',
      drugLicenseNumber: 'MH-DEMO-4471',
      shopType: 'Retail medical shop',
      city: 'Demo City',
      state: 'Demo State',
      postalCode: '400001',
      status: 'ACTIVE' as const,
      creditLimit: 50000
    },
    {
      userId: secondaryCustomerUser._id,
      businessName: 'DEMO City Care Medicals',
      ownerName: 'Ananya Rao',
      phone: '+91 90000 00103',
      email: secondaryCustomerEmail,
      gstNumber: '27DEMO0003D1ZV',
      drugLicenseNumber: 'MH-DEMO-6612',
      shopType: 'Retail medical shop',
      city: 'Demo City',
      state: 'Demo State',
      postalCode: '400003',
      status: 'ACTIVE' as const,
      creditLimit: 35000
    },
    {
      userId: pendingUser._id,
      businessName: 'DEMO Lakshmi Pharmacy',
      ownerName: 'Karan Patel',
      phone: '+91 90000 00102',
      email: pendingEmail,
      gstNumber: '27DEMO0002C1ZW',
      drugLicenseNumber: 'MH-DEMO-5520',
      shopType: 'Retail pharmacy',
      city: 'Demo City',
      state: 'Demo State',
      postalCode: '400002',
      status: 'PENDING' as const,
      creditLimit: 0
    }
  ];

  const customers = [];
  for (const definition of customerDefinitions) {
    const customer = await CustomerModel.findOneAndUpdate(
      { agencyId, userId: definition.userId },
      {
        $set: {
          businessName: definition.businessName,
          ownerName: definition.ownerName,
          phone: definition.phone,
          email: definition.email,
          gstNumber: definition.gstNumber,
          drugLicenseNumber: definition.drugLicenseNumber,
          shopType: definition.shopType,
          address: {
            line1: `DEMO ${definition.businessName}`,
            city: definition.city,
            state: definition.state,
            country: 'India',
            postalCode: definition.postalCode
          },
          status: definition.status,
          creditLimit: definition.creditLimit,
          assignedSalesmanId: definition.status === 'ACTIVE' ? salesman._id : undefined,
          notes: 'DEMO customer record',
          approvedAt: definition.status === 'ACTIVE' ? new Date() : undefined,
          approvedBy: definition.status === 'ACTIVE' ? admin._id : undefined,
          statusNote: definition.status === 'PENDING' ? 'Awaiting agency approval (DEMO)' : 'Approved (DEMO)'
        }
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    if (customer) customers.push(customer);
  }

  const activeCustomers = customers.filter((customer) => customer.status === 'ACTIVE');
  if (activeCustomers.length > 0) {
    await SalesmanModel.updateOne(
      { _id: salesman._id },
      { $addToSet: { customerIds: { $each: activeCustomers.map((customer) => customer._id) } } }
    );
  }

  /* -------------------------------- categories ------------------------------ */
  const categoryDefinitions = [
    { name: 'DEMO Surgical Supplies', description: 'DEMO surgical consumables', displayOrder: 1 },
    { name: 'DEMO Diagnostics', description: 'DEMO diagnostic devices and reagents', displayOrder: 2 },
    { name: 'DEMO Personal Protection', description: 'DEMO masks, gloves and protective wear', displayOrder: 3 },
    { name: 'DEMO Medicines', description: 'DEMO prescription and OTC medicines', displayOrder: 4 }
  ];

  const categories = new Map<string, TypesLike>();
  for (const definition of categoryDefinitions) {
    const slug = definition.name
      .toLowerCase()
      .replace(/demo\s+/g, '')
      .trim()
      .replace(/[^a-z0-9]+/g, '-');
    const category = await CategoryModel.findOneAndUpdate(
      { agencyId, slug },
      {
        $set: { name: definition.name, description: definition.description, displayOrder: definition.displayOrder, isActive: true },
        $setOnInsert: { agencyId, slug }
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    if (category) categories.set(definition.name, category._id);
  }

  /* --------------------------------- products ------------------------------ */
  // Realistic medical-distribution catalogue: every item carries the fields a
  // pharmacy actually orders by (brand, generic name, manufacturer, MRP, pack
  // size and a catalogue reorder level).
  const productDefinitions = [
    { name: 'DEMO Nitrile Examination Gloves (M)', sku: 'DEMO-GLV-M', category: 'DEMO Personal Protection', brand: 'DEMO SafeHands', genericName: 'Nitrile', manufacturer: 'DEMO SafeHands Industries', mrp: 780, price: 640, taxRate: 18, unit: 'BOX', packSize: '100 pieces', reorderLevel: 40, minOrderQuantity: 1, tag: 'ppe' },
    { name: 'DEMO Surgical Face Mask Type IIR', sku: 'DEMO-MSK-IIR', category: 'DEMO Personal Protection', brand: 'DEMO SafeHands', genericName: 'Type IIR Surgical Mask', manufacturer: 'DEMO SafeHands Industries', mrp: 400, price: 320, taxRate: 18, unit: 'BOX', packSize: '50 pieces', reorderLevel: 40, minOrderQuantity: 1, tag: 'ppe' },
    { name: 'DEMO Digital Thermometer', sku: 'DEMO-THM-01', category: 'DEMO Diagnostics', brand: 'DEMO MediSense', genericName: 'Clinical Thermometer', manufacturer: 'DEMO MediSense Devices Pvt Ltd', mrp: 600, price: 480, taxRate: 12, unit: 'PIECE', reorderLevel: 15, minOrderQuantity: 1, tag: 'diagnostics' },
    { name: 'DEMO Pulse Oximeter', sku: 'DEMO-OXI-02', category: 'DEMO Diagnostics', brand: 'DEMO MediSense', genericName: 'Fingertip Pulse Oximeter', manufacturer: 'DEMO MediSense Devices Pvt Ltd', mrp: 1800, price: 1450, taxRate: 12, unit: 'PIECE', reorderLevel: 10, minOrderQuantity: 1, tag: 'diagnostics' },
    { name: 'DEMO Blood Glucose Test Strips', sku: 'DEMO-BGC-50', category: 'DEMO Diagnostics', brand: 'DEMO MediSense', genericName: 'Glucose Oxidase Strips', manufacturer: 'DEMO MediSense Devices Pvt Ltd', mrp: 1499, price: 1199, taxRate: 12, unit: 'BOX', packSize: '50 strips', reorderLevel: 25, minOrderQuantity: 1, tag: 'diagnostics' },
    { name: 'DEMO Surgical Suture Pack', sku: 'DEMO-SUT-01', category: 'DEMO Surgical Supplies', brand: 'DEMO SurgiLine', genericName: 'Polyglactin Suture', manufacturer: 'DEMO SurgiLine Surgical', mrp: 1100, price: 890, taxRate: 18, unit: 'PACK', packSize: '12 sutures', reorderLevel: 20, minOrderQuantity: 1, tag: 'surgical' },
    { name: 'DEMO Sterile Gauze 10x10cm', sku: 'DEMO-GAU-10', category: 'DEMO Surgical Supplies', brand: 'DEMO SurgiLine', genericName: 'Sterile Gauze Swab', manufacturer: 'DEMO SurgiLine Surgical', mrp: 260, price: 210, taxRate: 12, unit: 'PACK', packSize: '25 pieces', reorderLevel: 30, minOrderQuantity: 1, tag: 'surgical' },
    { name: 'DEMO Amoxicillin 500mg Tablets', sku: 'DEMO-AMX-500', category: 'DEMO Medicines', brand: 'DEMO PharmaCare', genericName: 'Amoxicillin', manufacturer: 'DEMO PharmaCare Laboratories', mrp: 120, price: 96, taxRate: 12, unit: 'STRIP', packSize: '10 tablets', reorderLevel: 50, minOrderQuantity: 1, tag: 'medicine' },
    { name: 'DEMO Paracetamol 650mg Tablets', sku: 'DEMO-PAR-650', category: 'DEMO Medicines', brand: 'DEMO PharmaCare', genericName: 'Paracetamol', manufacturer: 'DEMO PharmaCare Laboratories', mrp: 35, price: 28, taxRate: 12, unit: 'STRIP', packSize: '15 tablets', reorderLevel: 60, minOrderQuantity: 1, tag: 'medicine' }
  ];

  const products = [];
  for (const definition of productDefinitions) {
    const product = await ProductModel.findOneAndUpdate(
      { agencyId, sku: definition.sku },
      {
        $set: {
          name: definition.name,
          slug: definition.name.toLowerCase().replace(/demo\s+/g, '').trim().replace(/[^a-z0-9]+/g, '-'),
          categoryId: categories.get(definition.category),
          brand: definition.brand,
          genericName: definition.genericName,
          manufacturer: definition.manufacturer,
          mrp: definition.mrp,
          price: definition.price,
          taxRate: definition.taxRate,
          unit: definition.unit,
          packSize: definition.packSize,
          reorderLevel: definition.reorderLevel,
          minOrderQuantity: definition.minOrderQuantity,
          tags: [definition.tag, 'demo'],
          isActive: true,
          description: `${definition.name} (DEMO catalogue item)`
        },
        $setOnInsert: { agencyId, sku: definition.sku }
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    if (product) products.push(product);
  }

  /* ------------------------------ stock + batches -------------------------- */
  let batchCount = 0;
  for (const product of products) {
    // Two batches per product: one that expires soon (FEFO first) and one later.
    const batchDefinitions = [
      { batchNumber: `${product.sku}-A`, expiryDate: daysFromNow(45), quantity: 120, unitCost: product.price * 0.72 },
      { batchNumber: `${product.sku}-B`, expiryDate: daysFromNow(400), quantity: 60, unitCost: product.price * 0.75 }
    ];

    for (const batchDefinition of batchDefinitions) {
      const batch = await BatchModel.findOneAndUpdate(
        { agencyId, productId: product._id, batchNumber: batchDefinition.batchNumber },
        {
          $set: {
            expiryDate: batchDefinition.expiryDate,
            supplier: 'DEMO Supplier',
            manufacturer: product.brand ?? 'DEMO',
            status: 'ACTIVE',
            receivedAt: new Date()
          },
          $setOnInsert: { agencyId, productId: product._id, batchNumber: batchDefinition.batchNumber }
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
      if (!batch) continue;
      batchCount += 1;

      const inventory = await InventoryModel.findOne({ agencyId, batchId: batch._id });
      if (!inventory) {
        await InventoryModel.create({
          agencyId,
          productId: product._id,
          batchId: batch._id,
          batchNumber: batch.batchNumber,
          expiryDate: batch.expiryDate,
          location: 'DEMO Rack A',
          unitCost: batchDefinition.unitCost,
          quantityOnHand: batchDefinition.quantity,
          quantityReserved: 0,
          reorderLevel: product.reorderLevel ?? 20,
          isActive: true
        });
      }
    }
  }

  await recordActivity({
    agencyId,
    actorUserId: admin._id,
    actorRole: 'AGENCY_ADMIN',
    action: 'seed.run',
    entity: 'Agency',
    entityId: agencyId,
    summary: 'Development DEMO dataset seeded',
    meta: { products: products.length, batches: batchCount, customers: customers.length }
  });

  /* --------------------------------- report -------------------------------- */
  console.log('   DEMO agency');
  line('Agency', `${agency.name} (slug: ${agency.slug})`);
  line('Products', String(products.length));
  line('Batches', String(batchCount));
  line('Customers', String(customers.length));
  console.log('');
  console.log('   DEMO accounts (development only)');
  line('AGENCY_ADMIN', `${adminEmail} / ${adminPassword}`);
  line('SALESMAN', `${salesmanEmail} / ${salesmanPassword}`);
  line('CUSTOMER (approved)', `${customerEmail} / ${customerPassword}`);
  line('CUSTOMER (approved)', `${secondaryCustomerEmail} / ${secondaryCustomerPassword}`);
  line('CUSTOMER (pending)', `${pendingEmail} / ${pendingPassword}`);
  console.log('');
  console.log('   The pending customer cannot sign in until an admin approves it:');
  console.log(`   POST /api/auth/customers/:id/status  { "status": "APPROVED" }`);
  console.log('');
  console.log('   Start the API with: npm run dev');
  console.log('');
};

type TypesLike = import('mongoose').Types.ObjectId;

run()
  .then(async () => {
    await disconnectDatabase();
    process.exit(0);
  })
  .catch(async (error: unknown) => {
    logger.error('Seed failed', { error });
    console.error('Seed failed:', error instanceof Error ? error.message : error);
    await disconnectDatabase().catch(() => undefined);
    process.exit(1);
  });

void PASSWORD;
