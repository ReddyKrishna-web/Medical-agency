/**
 * Response adapters.
 *
 * These translate real API documents into the view models the pages consume.
 * They are defensive about fields the parallel backend release is adding
 * (product `genericName`/`manufacturer`/`mrp`/`reorderLevel`, flat dashboard
 * aliases, `temporaryPassword`, `businessHours`, `notificationPreferences`),
 * but they never invent values: a missing field stays `undefined` or `0`.
 */

import type {
  ActivityLog,
  AgencySettings,
  AgencySummary,
  AuthUser,
  Availability,
  Batch,
  BusinessHours,
  Category,
  Conversation,
  ConversationPartner,
  ContactSubmission,
  Customer,
  CustomerProfile,
  DashboardMetrics,
  DashboardReport,
  DirectoryContact,
  CustomerNote,
  FollowUp,
  ID,
  InventoryRow,
  InventoryMovement,
  Invoice,
  Message,
  NotificationPreferences,
  Order,
  OrderItem,
  OrderStatus,
  OrderTimelineEntry,
  Payment,
  Product,
  Requirement,
  RequirementExtraction,
  ExtractedRequirementItem,
  RequirementFile,
  RequirementStatus,
  Role,
  Salesman,
  SalesmanProvisioned,
  SearchHit,
  SearchResponse,
  User,
  UserStub,
} from '@/types/api';

/* ------------------------------------------------------------------ helpers */

type Dict = Record<string, unknown>;

const isObject = (value: unknown): value is Dict => typeof value === 'object' && value !== null && !Array.isArray(value);

const asDict = (value: unknown): Dict => (isObject(value) ? value : {});

const asArray = <T>(value: unknown): T[] => (Array.isArray(value) ? (value as T[]) : []);

const num = (value: unknown, fallback = 0): number => {
  const parsed = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
  return Number.isFinite(parsed) ? parsed : fallback;
};

const firstNumber = (...values: unknown[]): number => {
  for (const value of values) {
    const parsed = num(value, NaN);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
};

const str = (value: unknown): string | undefined => {
  if (typeof value === 'string') return value.trim() ? value : undefined;
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return undefined;
};

const bool = (value: unknown): boolean | undefined => (typeof value === 'boolean' ? value : undefined);

const idOf = (value: unknown): ID => {
  if (typeof value === 'string') return value;
  if (isObject(value)) return str(value.id) ?? str(value._id) ?? '';
  return '';
};

/** Accepts both a bare id string and a populated sub-document. */
const resolveRef = <T extends Dict>(value: unknown): (T & { id: ID }) | null => {
  if (typeof value === 'string') return value ? ({ id: value } as T & { id: ID }) : null;
  if (!isObject(value)) return null;
  const id = str(value.id) ?? str(value._id);
  return id ? ({ ...value, id } as T & { id: ID }) : null;
};

/**
 * The API normalises documents to carry both `_id` and a string `id`, and this
 * client normalises wire roles to UI keys. Everything downstream can therefore
 * rely on `id`.
 */
const withId = <T extends Dict>(value: Dict, fallback: Dict = {}): T & { id: ID } =>
  ({ ...fallback, ...value, id: idOf(value) }) as T & { id: ID };

/* --------------------------------------------------------------------- role */

const ROLE_KEYS: Record<string, Role> = {
  CUSTOMER: 'customer',
  SALESMAN: 'salesman',
  AGENCY_ADMIN: 'admin',
};

/** Wire role -> UI role key. Unknown values fall back to the most restricted role. */
export const mapRole = (value: unknown): Role => ROLE_KEYS[String(value ?? '').toUpperCase()] ?? 'customer';

/* ------------------------------------------------------------------ auth me */

const mapUserStub = (value: unknown): UserStub | null => {
  const ref = resolveRef(value);
  if (!ref) return null;
  return {
    id: ref.id,
    name: str(ref.name),
    email: str(ref.email),
    phone: str(ref.phone),
    status: str(ref.status) as UserStub['status'],
    avatarUrl: str(ref.avatarUrl),
    lastLoginAt: str(ref.lastLoginAt),
  };
};

/** `GET /auth/me` returns `{ user, profile }`. */
export const mapAuthUser = (raw: unknown): User | null => {
  const envelope = asDict(raw);
  const user = asDict(envelope.user);
  if (!Object.keys(user).length) return null;

  const profile = asDict(envelope.profile);
  const agencyEnvelope = asDict(envelope.agency);
  const role = mapRole(user.role);
  const status = (str(user.status) ?? 'ACTIVE') as AuthUser['status'];

  const result: User = {
    id: idOf(user),
    name: str(user.name) ?? str(user.email) ?? 'Account user',
    email: str(user.email) ?? '',
    phone: str(user.phone),
    role,
    status,
    avatarUrl: str(user.avatarUrl),
    mustChangePassword: bool(user.mustChangePassword) ?? false,
    agencyId: str(user.agencyId) ?? idOf(user.agencyId),
    createdAt: str(user.createdAt),
    lastLoginAt: str(user.lastLoginAt),
  };

  if (Object.keys(agencyEnvelope).length && str(agencyEnvelope.name)) {
    result.agency = {
      name: str(agencyEnvelope.name) as string,
      slug: str(agencyEnvelope.slug) ?? '',
      logoUrl: str(agencyEnvelope.logoUrl),
    };
  }
  if (role === 'customer' && Object.keys(profile).length) {
    result.customer = mapCustomer(profile, {});
  }
  if (role === 'salesman' && Object.keys(profile).length) {
    const customerIds = asArray(profile.customerIds).map(idOf).filter(Boolean);
    result.salesman = {
      id: idOf(profile),
      employeeCode: str(profile.employeeCode) ?? '',
      territory: str(profile.territory),
      status: (str(profile.status) ?? 'ACTIVE') as Salesman['status'],
      monthlyTarget: profile.monthlyTarget === undefined ? undefined : num(profile.monthlyTarget),
      assignedCustomerCount: customerIds.length,
      customerIds,
      userId: result.id,
    };
  }
  return result;
};

/** `POST /auth/login` and `POST /auth/register` return `{ user, accessToken, ... }`. */
export const mapSession = (raw: unknown): { user: User; accessToken: string; statusMessage?: string } => {
  const envelope = asDict(raw);
  const accessToken = str(envelope.accessToken) ?? '';
  // The login response carries a small `{ name, slug }` agency summary.
  const user = mapAuthUser({ user: envelope.user, profile: null, agency: envelope.agency });
  if (!user) throw new Error('The service did not return an account profile.');
  return { user, accessToken, statusMessage: str(envelope.status) };
};

export const mapAgencySummary = (raw: unknown): AgencySummary | null => {
  const value = asDict(raw);
  if (bool(value.available) === false) return null;
  if (!str(value.name)) return null;
  const contact = asDict(value.contact);
  const address = asDict(contact.address);
  return {
    name: str(value.name) as string,
    slug: str(value.slug) ?? '',
    legalName: str(value.legalName),
    logoUrl: str(value.logoUrl),
    website: str(value.website),
    description: str(value.description),
    contact: {
      email: str(contact.email),
      phone: str(contact.phone),
      address: Object.keys(address).length
        ? {
            line1: str(address.line1) ?? '',
            line2: str(address.line2),
            city: str(address.city) ?? '',
            state: str(address.state) ?? '',
            country: str(address.country) ?? '',
            postalCode: str(address.postalCode) ?? '',
          }
        : undefined,
    },
    tax: isObject(value.tax)
      ? {
          gstNumber: str(asDict(value.tax).gstNumber),
          defaultTaxRate: asDict(value.tax).defaultTaxRate === undefined ? undefined : num(asDict(value.tax).defaultTaxRate),
          pricesIncludeTax: bool(asDict(value.tax).pricesIncludeTax),
        }
      : undefined,
    features: isObject(value.features)
      ? {
          uploadsEnabled: bool(asDict(value.features).uploadsEnabled),
          aiEnabled: bool(asDict(value.features).aiEnabled),
        }
      : undefined,
    businessHours: isObject(value.businessHours)
      ? (Object.fromEntries(
          Object.entries(asDict(value.businessHours)).map(([day, entry]) => [
            day,
            typeof entry === 'string' ? entry.trim() || null : null,
          ]),
        ) as BusinessHours)
      : undefined,
    status: str(value.status) as AgencySummary['status'],
  };
};

/* ---------------------------------------------------------------- customers */

const mapAddress = (value: unknown) => {
  const address = asDict(value);
  return {
    line1: str(address.line1) ?? '',
    line2: str(address.line2),
    city: str(address.city) ?? '',
    state: str(address.state) ?? '',
    country: str(address.country) ?? '',
    postalCode: str(address.postalCode) ?? '',
  };
};

export const mapCustomer = (raw: unknown, _fallback: Partial<CustomerProfile> = {}): CustomerProfile => {
  const value = asDict(raw);
  // `listCustomers` populates `assignedSalesmanId`; `assignedSalesman` is read as a
  // defensive alias for deployments that rename the field.
  const assignedSalesman = resolveRef(value.assignedSalesmanId) ?? resolveRef(value.assignedSalesman);
  return {
    id: idOf(value),
    businessName: str(value.businessName) ?? str(value.name) ?? 'Unnamed business',
    ownerName: str(value.ownerName) ?? str(value.name) ?? '',
    phone: str(value.phone) ?? '',
    alternatePhone: str(value.alternatePhone),
    email: str(value.email),
    gstNumber: str(value.gstNumber),
    drugLicenseNumber: str(value.drugLicenseNumber),
    shopType: str(value.shopType),
    address: mapAddress(value.address),
    creditLimit: num(value.creditLimit),
    creditUsed: num(value.creditUsed),
    status: (str(value.status) ?? 'PENDING') as CustomerProfile['status'],
    statusNote: str(value.statusNote),
    approvedAt: str(value.approvedAt),
    approvedBy: str(value.approvedBy),
    assignedSalesmanId: assignedSalesman?.id,
    notes: str(value.notes),
    accountNotes: asArray(value.accountNotes).map((item) => {
      const note = asDict(item);
      return {
        id: idOf(note) || undefined,
        text: str(note.text) ?? '',
        byUserId: resolveRef(note.byUserId)?.id ?? idOf(note.byUserId),
        byRole: (str(note.byRole) ?? 'AGENCY_ADMIN') as CustomerNote['byRole'],
        at: str(note.at) ?? str(note.createdAt) ?? '',
      } satisfies CustomerNote;
    }).filter((note) => note.text && note.at),
    lastContactAt: str(value.lastContactAt),
    lastContactType: str(value.lastContactType) as CustomerProfile['lastContactType'],
    userId: (resolveRef(value.userId)?.id ?? idOf(value.userId)) as ID,
    user: mapUserStub(value.userId) ?? undefined,
    assignedSalesman: assignedSalesman
      ? {
          id: assignedSalesman.id,
          employeeCode: str(assignedSalesman.employeeCode) ?? '',
          territory: str(assignedSalesman.territory),
          status: str(assignedSalesman.status) as Salesman['status'],
          userId: (resolveRef(assignedSalesman.userId)?.id ?? idOf(assignedSalesman.userId)) as ID,
        }
      : null,
    // Only read when the backend supplies them; never derived.
    lastOrderAt: str(value.lastOrderAt) ?? null,
    lastOrderNumber: str(value.lastOrderNumber) ?? null,
    orderCount: value.orderCount === undefined ? undefined : num(value.orderCount),
    createdAt: str(value.createdAt),
    updatedAt: str(value.updatedAt),
  };
};

export const mapCustomers = (raw: unknown): CustomerProfile[] => asArray<unknown>(raw).map((row) => mapCustomer(row));

/* ---------------------------------------------------------------- salesmen */

export const mapSalesman = (raw: unknown): Salesman => {
  const value = asDict(raw);
  const userId = resolveRef(value.userId);
  const customerIds = asArray(value.customerIds).map(idOf).filter(Boolean);
  return {
    id: idOf(value),
    employeeCode: str(value.employeeCode) ?? '',
    territory: str(value.territory),
    phone: str(value.phone) ?? (userId ? str(userId.phone) : undefined),
    status: (str(value.status) ?? 'ACTIVE') as Salesman['status'],
    customerIds,
    assignedCustomerCount:
      value.assignedCustomerCount === undefined ? customerIds.length : num(value.assignedCustomerCount),
    monthlyTarget: value.monthlyTarget === undefined ? undefined : num(value.monthlyTarget),
    joinedAt: str(value.joinedAt),
    notes: str(value.notes),
    userId: (userId?.id ?? idOf(value.userId)) as ID,
    user: mapUserStub(value.userId) ?? undefined,
    createdAt: str(value.createdAt),
    updatedAt: str(value.updatedAt),
  };
};

export const mapSalesmen = (raw: unknown): Salesman[] => asArray<unknown>(raw).map(mapSalesman);

/** `POST /salesmen` → `{ id, employeeCode, userId, temporaryPassword? }`. */
export const mapProvisionedSalesman = (raw: unknown): SalesmanProvisioned => {
  const value = asDict(raw);
  return {
    id: str(value.id) ?? idOf(value) ?? undefined,
    employeeCode: str(value.employeeCode),
    userId: str(value.userId) ?? ((idOf(value.userId) || undefined)),
    temporaryPassword: str(value.temporaryPassword),
    message: str(value.message),
  };
};

/* ------------------------------------------------------------------ catalog */

export const mapCategory = (raw: unknown): Category => {
  const value = withId(asDict(raw));
  return {
    id: value.id,
    name: str(value.name) ?? '',
    slug: str(value.slug) ?? '',
    description: str(value.description),
    parentId: str(value.parentId) ?? (idOf(value.parentId) || undefined),
    displayOrder: num(value.displayOrder),
    isActive: bool(value.isActive) ?? true,
    imageUrl: str(value.imageUrl),
    createdAt: str(value.createdAt),
    updatedAt: str(value.updatedAt),
  };
};

export const mapCategories = (raw: unknown): Category[] => asArray<unknown>(raw).map(mapCategory);

/**
 * Catalog product. Availability values are only used when the endpoint
 * exposes them; stock columns are never synthesised from the catalog.
 */
export const mapProduct = (raw: unknown): Product => {
  const value = withId(asDict(raw));
  const category = resolveRef(value.categoryId) ?? resolveRef(value.category);
  const stockOnHand = value.stockOnHand === undefined ? undefined : num(value.stockOnHand);
  const stockReserved = value.stockReserved === undefined ? undefined : num(value.stockReserved);
  const explicitAvailable = value.stockAvailable ?? value.availableStock;
  const stockAvailable =
    explicitAvailable === undefined
      ? stockOnHand === undefined || stockReserved === undefined
        ? undefined
        : Math.max(0, stockOnHand - stockReserved)
      : num(explicitAvailable);

  return {
    id: value.id,
    name: str(value.name) ?? str(value.productName) ?? '',
    slug: str(value.slug),
    sku: str(value.sku) ?? str(value.productCode) ?? '',
    brand: str(value.brand),
    genericName: str(value.genericName),
    manufacturer: str(value.manufacturer),
    description: str(value.description),
    hsnCode: str(value.hsnCode),
    price: num(value.price),
    mrp: value.mrp === undefined ? undefined : num(value.mrp),
    taxRate: num(value.taxRate),
    unit: str(value.unit) ?? 'UNIT',
    packSize: str(value.packSize),
    minOrderQuantity: num(value.minOrderQuantity, 1),
    maxOrderQuantity: value.maxOrderQuantity === undefined ? undefined : num(value.maxOrderQuantity),
    imageUrl: str(value.imageUrl),
    tags: asArray(value.tags).map((tag) => String(tag)),
    isActive: bool(value.isActive) ?? true,
    isFeatured: bool(value.isFeatured) ?? false,
    categoryId: str(value.categoryId) ?? (idOf(value.categoryId) || undefined),
    category: category ? { id: category.id, name: str(category.name), slug: str(category.slug) } : null,
    reorderLevel: value.reorderLevel === undefined ? undefined : num(value.reorderLevel),
    availability: str(value.availability) as Product['availability'],
    stockOnHand,
    stockReserved,
    stockAvailable,
    createdAt: str(value.createdAt),
    updatedAt: str(value.updatedAt),
  };
};

export const mapProducts = (raw: unknown): Product[] => asArray<unknown>(raw).map(mapProduct);

/** Sellable units. Never invented: undefined when the endpoint exposes no stock. */
export const productStock = (product: Product): number | undefined => {
  if (product.stockAvailable !== undefined) return product.stockAvailable;
  if (product.stockOnHand === undefined) return undefined;
  return Math.max(0, product.stockOnHand - (product.stockReserved ?? 0));
};

/** The catalog carries a server-computed availability label and sellable units. */
export const productAvailability = (product: Product): Availability | undefined => product.availability;

/* ---------------------------------------------------------------- inventory */

export const mapInventoryRow = (raw: unknown): InventoryRow => {
  const value = withId(asDict(raw));
  const product = resolveRef(value.productId);
  return {
    id: value.id,
    productId: product?.id ?? idOf(value.productId),
    product: product ? { id: product.id, name: str(product.name), sku: str(product.sku), unit: str(product.unit) } : null,
    batchId: str(value.batchId) ?? idOf(value.batchId),
    batchNumber: str(value.batchNumber) ?? '',
    expiryDate: str(value.expiryDate) ?? '',
    location: str(value.location),
    unitCost: num(value.unitCost),
    quantityOnHand: num(value.quantityOnHand),
    quantityReserved: num(value.quantityReserved),
    quantityAvailable: num(value.quantityAvailable, Math.max(0, num(value.quantityOnHand) - num(value.quantityReserved))),
    reorderLevel: num(value.reorderLevel),
    isActive: bool(value.isActive) ?? true,
    isExpired: bool(value.isExpired) ?? false,
    lastMovementAt: str(value.lastMovementAt),
    createdAt: str(value.createdAt),
    updatedAt: str(value.updatedAt),
  };
};

export const mapInventoryRows = (raw: unknown): InventoryRow[] => asArray<unknown>(raw).map(mapInventoryRow);

export const mapInventoryMovement = (raw: unknown): InventoryMovement => {
  const value = withId(asDict(raw));
  return {
    id: value.id,
    productId: resolveRef(value.productId)?.id ?? idOf(value.productId),
    productName: str(value.productName) ?? str(asDict(value.productId).name),
    batchId: resolveRef(value.batchId)?.id ?? idOf(value.batchId),
    batchNumber: str(value.batchNumber) ?? '',
    inventoryId: resolveRef(value.inventoryId)?.id ?? idOf(value.inventoryId),
    type: str(value.type) ?? '',
    direction: (str(value.direction) ?? 'OUT') as 'IN' | 'OUT',
    quantity: num(value.quantity),
    balanceOnHand: num(value.balanceOnHand),
    balanceReserved: num(value.balanceReserved),
    unitCost: value.unitCost === undefined ? undefined : num(value.unitCost),
    referenceType: str(value.referenceType),
    referenceId: str(value.referenceId) ?? (idOf(value.referenceId) || undefined),
    referenceNumber: str(value.referenceNumber),
    reason: str(value.reason),
    note: str(value.note),
    actorRole: str(value.actorRole),
    createdAt: str(value.createdAt) ?? '',
  };
};

export const mapInventoryMovements = (raw: unknown): InventoryMovement[] => asArray<unknown>(raw).map(mapInventoryMovement);

export const mapBatch = (raw: unknown): Batch => {
  const value = withId(asDict(raw));
  const product = resolveRef(value.productId);
  return {
    id: value.id,
    productId: product ?? null,
    batchNumber: str(value.batchNumber) ?? '',
    manufacturer: str(value.manufacturer),
    mfgDate: str(value.mfgDate),
    expiryDate: str(value.expiryDate) ?? '',
    supplier: str(value.supplier),
    receivedAt: str(value.receivedAt),
    status: (str(value.status) ?? 'ACTIVE') as Batch['status'],
    note: str(value.note),
    isExpired: bool(value.isExpired) ?? false,
    createdAt: str(value.createdAt),
    updatedAt: str(value.updatedAt),
  };
};

export const mapBatches = (raw: unknown): Batch[] => asArray<unknown>(raw).map(mapBatch);


/* ------------------------------------------------------------------ orders */

export const mapOrderItem = (raw: unknown): OrderItem => {
  const value = asDict(raw);
  return {
    productId: str(value.productId) ?? idOf(value.productId),
    productName: str(value.productName) ?? str(value.name) ?? '',
    sku: str(value.sku) ?? '',
    unit: str(value.unit) ?? 'UNIT',
    quantity: num(value.quantity, 1),
    unitPrice: num(value.unitPrice),
    taxRate: num(value.taxRate),
    lineSubtotal: num(value.lineSubtotal),
    taxAmount: num(value.taxAmount),
    lineTotal: num(value.lineTotal, num(value.lineSubtotal) + num(value.taxAmount)),
    allocations: asArray(value.allocations).map((allocation) => {
      const row = asDict(allocation);
      return {
        batchId: str(row.batchId) ?? idOf(row.batchId),
        inventoryId: str(row.inventoryId) ?? idOf(row.inventoryId),
        batchNumber: str(row.batchNumber) ?? '',
        expiryDate: str(row.expiryDate) ?? '',
        quantity: num(row.quantity),
        committedQuantity: num(row.committedQuantity),
        releasedQuantity: num(row.releasedQuantity),
      };
    }),
  };
};

export const mapOrder = (raw: unknown): Order => {
  const value = withId(asDict(raw));
  const permissions = asDict(value.permissions);
  const cancellation = asDict(value.cancellation);
  return {
    id: value.id,
    orderNumber: str(value.orderNumber) ?? value.id.slice(-8),
    orderYear: num(value.orderYear),
    customerId: str(value.customerId) ?? idOf(value.customerId),
    customerName: str(value.customerName) ?? 'Customer',
    salesmanId: str(value.salesmanId) ?? (idOf(value.salesmanId) || undefined),
    items: asArray(value.items).map(mapOrderItem),
    status: (str(value.status) ?? 'PENDING') as OrderStatus,
    statusTimestamps: asDict(value.statusTimestamps) as Order['statusTimestamps'],
    timeline: asArray(value.timeline).map(mapTimelineEntry),
    currency: str(value.currency) ?? 'INR',
    subtotal: num(value.subtotal),
    taxTotal: num(value.taxTotal),
    grandTotal: num(value.grandTotal),
    source: (str(value.source) ?? 'ADMIN') as Order['source'],
    allocationState: (str(value.allocationState) ?? 'NONE') as Order['allocationState'],
    notes: str(value.notes),
    customerNotes: str(value.customerNotes),
    requirementUploadId: str(value.requirementUploadId) ?? (idOf(value.requirementUploadId) || undefined),
    reorderedFromOrderId: str(value.reorderedFromOrderId) ?? (idOf(value.reorderedFromOrderId) || undefined),
    cancellation: Object.keys(cancellation).length
      ? {
          reason: str(cancellation.reason),
          at: str(cancellation.at),
          stockDisposition: str(cancellation.stockDisposition) as 'NOT_ALLOCATED' | 'RELEASED' | 'RESTORED' | undefined,
        }
      : undefined,
    invoiceId: str(value.invoiceId) ?? (idOf(value.invoiceId) || undefined),
    deliveredAt: str(value.deliveredAt),
    createdAt: str(value.createdAt),
    updatedAt: str(value.updatedAt),
    permissions: Object.keys(permissions).length
      ? {
          canCancel: bool(permissions.canCancel) ?? false,
          allowedTransitions: asArray(permissions.allowedTransitions).map((entry) => String(entry) as OrderStatus),
          allowedStatuses: asArray(permissions.allowedStatuses).map((entry) => String(entry) as OrderStatus),
        }
      : undefined,
  };
};

export const mapOrders = (raw: unknown): Order[] => asArray<unknown>(raw).map(mapOrder);

export const mapOrderMutation = (raw: unknown) => {
  const value = asDict(raw);
  return {
    order: mapOrder(value.order),
    previousStatus: (str(value.previousStatus) ?? 'PENDING') as OrderStatus,
    status: (str(value.status) ?? mapOrder(value.order).status) as OrderStatus,
    stockDisposition: str(value.stockDisposition) as 'NOT_ALLOCATED' | 'RELEASED' | 'RESTORED' | undefined,
  };
};

export const mapTimelineEntry = (raw: unknown): OrderTimelineEntry => {
  const value = asDict(raw);
  return {
    from: (str(value.from) ?? null) as OrderStatus | null,
    to: (str(value.to) ?? 'PENDING') as OrderStatus,
    at: str(value.at) ?? str(value.createdAt) ?? '',
    byRole: str(value.byRole),
    note: str(value.note),
  };
};

/** `GET /orders/:id/timeline` → `{ orderId, orderNumber, status, statusTimestamps, timeline }`. */
export const mapOrderTimeline = (raw: unknown) => {
  const value = asDict(raw);
  return {
    orderId: str(value.orderId) ?? idOf(value),
    orderNumber: str(value.orderNumber) ?? '',
    status: (str(value.status) ?? 'PENDING') as OrderStatus,
    statusTimestamps: asDict(value.statusTimestamps) as Partial<Record<OrderStatus, string>>,
    timeline: asArray(value.timeline).map(mapTimelineEntry),
  };
};

/* ------------------------------------------------------------ requirements */

export const mapRequirementFile = (raw: unknown): RequirementFile => {
  const value = asDict(raw);
  return {
    storageProvider: (str(value.storageProvider) ?? 'local') as RequirementFile['storageProvider'],
    originalName: str(value.originalName) ?? 'requirement-file',
    mimeType: str(value.mimeType) ?? 'application/octet-stream',
    extension: str(value.extension) ?? '',
    sizeBytes: num(value.sizeBytes),
    uploadedAt: str(value.uploadedAt) ?? '',
  };
};

const mapRequirementExtraction = (raw: unknown): RequirementExtraction => {
  const value = asDict(raw);
  return {
    status: (str(value.status) ?? 'NOT_REQUESTED') as RequirementExtraction['status'],
    provider: str(value.provider) as RequirementExtraction['provider'],
    model: str(value.model),
    requestedAt: str(value.requestedAt),
    completedAt: str(value.completedAt),
    errorCode: str(value.errorCode),
    items: asArray(value.items).map((item): ExtractedRequirementItem => {
      const row = withId(asDict(item));
      return {
        id: row.id,
        rawText: str(row.rawText) ?? '',
        rawQuantity: row.rawQuantity === undefined ? undefined : num(row.rawQuantity),
        quantity: row.quantity === undefined ? undefined : num(row.quantity),
        productId: resolveRef(row.productId)?.id ?? (idOf(row.productId) || undefined),
        productName: str(row.productName) ?? str(asDict(row.productId).name),
        sku: str(row.sku) ?? str(asDict(row.productId).sku),
        confidence: num(row.confidence),
        needsVerification: bool(row.needsVerification) ?? true,
        reason: str(row.reason),
      };
    }).filter((item) => item.rawText),
  };
};

export const mapRequirement = (raw: unknown): Requirement => {
  const value = withId(asDict(raw));
  const customer = resolveRef(value.customerId);
  const review = asDict(value.review);
  return {
    id: value.id,
    customerId: customer ?? null,
    customerUserId: str(value.customerUserId) ?? (idOf(value.customerUserId) || undefined),
    title: str(value.title) ?? '',
    notes: str(value.notes),
    file: mapRequirementFile(value.file),
    status: (str(value.status) ?? 'SUBMITTED') as RequirementStatus,
    review: Object.keys(review).length
      ? { byUserId: str(review.byUserId) ?? (idOf(review.byUserId) || undefined), at: str(review.at), note: str(review.note) }
      : undefined,
    extraction: mapRequirementExtraction(value.extraction),
    convertedOrderId: str(value.convertedOrderId) ?? (idOf(value.convertedOrderId) || undefined),
    createdAt: str(value.createdAt),
    updatedAt: str(value.updatedAt),
  };
};

export const mapRequirements = (raw: unknown): Requirement[] => asArray<unknown>(raw).map(mapRequirement);

/* --------------------------------------------------------------- messaging */

const messageParticipantId = (message: Dict, key: 'sender' | 'receiver'): ID => {
  const populated = resolveRef(message[key]);
  return populated?.id ?? (str(message[`${key}Id`]) ?? idOf(message[`${key}Id`]));
};

export const mapMessage = (raw: unknown): Message => {
  const value = withId(asDict(raw));
  return {
    id: value.id,
    conversationKey: str(value.conversationKey) ?? '',
    senderId: messageParticipantId(value, 'sender'),
    receiverId: messageParticipantId(value, 'receiver'),
    sender: mapUserStub(value.sender),
    receiver: mapUserStub(value.receiver),
    body: str(value.body) ?? '',
    orderId: str(value.orderId) ?? (idOf(value.orderId) || undefined),
    orderReference: str(value.orderReference),
    readAt: str(value.readAt) ?? null,
    createdAt: str(value.createdAt) ?? '',
  };
};

export const mapMessages = (raw: unknown): Message[] => asArray<unknown>(raw).map(mapMessage);

/** `GET /messages/conversations` → `{ partner, conversationKey, lastMessageAt, lastBody, unreadCount }`. */
export const mapConversation = (raw: unknown): Conversation => {
  const value = asDict(raw);
  const partner = resolveRef(value.partner);
  const partnerModel: ConversationPartner = {
    id: partner?.id ?? idOf(value.partner),
    name: str(partner?.name) ?? 'Unknown user',
    email: str(partner?.email),
    role: str(partner?.role),
    avatarUrl: str(partner?.avatarUrl),
  };
  return {
    partner: partnerModel,
    conversationKey: str(value.conversationKey) ?? '',
    lastMessageAt: str(value.lastMessageAt) ?? '',
    lastBody: str(value.lastBody) ?? '',
    unreadCount: num(value.unreadCount),
  };
};

export const mapConversations = (raw: unknown): Conversation[] => asArray<unknown>(raw).map(mapConversation);

/** `/staff/options` returns user stubs the current account may message. */
export const mapDirectory = (raw: unknown): DirectoryContact[] =>
  asArray<unknown>(raw).map((row) => {
    const value = withId(asDict(row));
    return {
      id: value.id,
      name: str(value.name) ?? str(value.email) ?? 'Unknown user',
      email: str(value.email),
      role: str(value.role) ?? 'UNKNOWN',
    };
  });

/* -------------------------------------------------------------- follow-ups */

export const mapFollowUp = (raw: unknown): FollowUp => {
  const value = withId(asDict(raw));
  return {
    id: value.id,
    salesmanId: resolveRef(value.salesmanId) ?? null,
    customerId: resolveRef(value.customerId) ?? null,
    title: str(value.title) ?? '',
    notes: str(value.notes),
    type: (str(value.type) ?? 'CALL') as FollowUp['type'],
    dueAt: str(value.dueAt) ?? '',
    status: (str(value.status) ?? 'PENDING') as FollowUp['status'],
    completedAt: str(value.completedAt),
    outcome: str(value.outcome),
    nextFollowUpAt: str(value.nextFollowUpAt),
    relatedOrderId: str(value.relatedOrderId) ?? (idOf(value.relatedOrderId) || undefined),
    createdAt: str(value.createdAt),
    updatedAt: str(value.updatedAt),
  };
};

export const mapFollowUps = (raw: unknown): FollowUp[] => asArray<unknown>(raw).map(mapFollowUp);

/* --------------------------------------------------------- contact enquiries */

export const mapContactSubmission = (raw: unknown): ContactSubmission => {
  const value = withId(asDict(raw));
  const handledBy = resolveRef(value.handledBy);
  return {
    id: value.id,
    name: str(value.name) ?? '',
    email: str(value.email) ?? '',
    phone: str(value.phone),
    organisation: str(value.organisation),
    topic: (str(value.topic) ?? 'OTHER') as ContactSubmission['topic'],
    message: str(value.message) ?? '',
    status: (str(value.status) ?? 'NEW') as ContactSubmission['status'],
    notes: str(value.notes),
    handledBy: handledBy ? {
      id: handledBy.id,
      name: str(handledBy.name),
      email: str(handledBy.email),
      phone: str(handledBy.phone),
      status: str(handledBy.status) as UserStub['status'],
      avatarUrl: str(handledBy.avatarUrl),
      lastLoginAt: str(handledBy.lastLoginAt),
    } : undefined,
    handledAt: str(value.handledAt),
    createdAt: str(value.createdAt) ?? '',
    updatedAt: str(value.updatedAt) ?? '',
  };
};

export const mapContactSubmissions = (raw: unknown): ContactSubmission[] => asArray<unknown>(raw).map(mapContactSubmission);

/* ----------------------------------------------------------------- activity */

export const mapActivityLog = (raw: unknown): ActivityLog => {
  const value = withId(asDict(raw));
  const actor = resolveRef(value.actorUserId);
  return {
    id: value.id,
    action: str(value.action) ?? '',
    entity: str(value.entity) ?? '',
    entityId: str(value.entityId) ?? (idOf(value.entityId) || undefined),
    summary: str(value.summary),
    meta: isObject(value.meta) ? value.meta : undefined,
    actorRole: str(value.actorRole),
    actorUserId: actor,
    createdAt: str(value.createdAt) ?? '',
  };
};

export const mapActivityLogs = (raw: unknown): ActivityLog[] => asArray<unknown>(raw).map(mapActivityLog);

/* ------------------------------------------------------------------ search */

const SEARCH_PATHS: Record<string, (id: string) => string> = {
  orders: (id) => `/orders/${id}`,
  products: () => '/products',
  batches: () => '/inventory',
  customers: () => '/customers',
  invoices: (id) => `/invoices/${id}`,
  staff: () => '/salesmen',
};

const resolveSearchBase = (role: Role | undefined) => (role === 'admin' ? '/admin' : role === 'salesman' ? '/salesman' : '/customer');

/** `GET /search` → `{ term, groups: [{ type, label, items }], total }`. */
export const mapSearchResults = (raw: unknown, role?: Role): { term: string; total: number; hits: SearchHit[] } => {
  const value = asDict(raw);
  const base = resolveSearchBase(role);
  const hits: SearchHit[] = [];

  for (const group of asArray(value.groups)) {
    const row = asDict(group);
    const type = str(row.type) ?? '';
    const pathFor = SEARCH_PATHS[type];
    if (!pathFor) continue;
    for (const item of asArray(row.items)) {
      const entry = asDict(item);
      const id = str(entry.id) ?? idOf(entry) ?? '';
      hits.push({
        id,
        type: type as SearchHit['type'],
        title: str(entry.title) ?? 'Record',
        subtitle: str(entry.subtitle),
        status: str(entry.status),
        value: entry.value === undefined ? undefined : num(entry.value),
        due: entry.due === undefined ? undefined : num(entry.due),
        phone: str(entry.phone),
        role: str(entry.role),
        price: entry.price === undefined ? undefined : num(entry.price),
        unit: str(entry.unit),
        date: str(entry.date),
        expiryDate: str(entry.expiryDate),
        path: `${base}${pathFor(id)}`,
      });
    }
  }

  return { term: str(value.term) ?? '', total: num(value.total, hits.length), hits };
};

/* ---------------------------------------------------------------- dashboard */

const section = <T extends Dict>(value: unknown): T => asDict(value) as T;

/**
 * `GET /reports/dashboard` returns nested blocks plus a flat `metrics` block.
 * Nested wins; the flat aliases are the documented fallback.
 */
export const mapDashboard = (raw: unknown): DashboardReport => {
  const value = asDict(raw);
  const orders = section(value.orders);
  const catalog = section(value.catalog);
  const inventory = section(value.inventory);
  const finance = section(value.finance);
  const followUps = section(value.followUps);
  const agency = section(value.agency);
  const range = section(value.range);
  const totals = section(value.totals);
  const metrics = section(value.metrics);

  /** Reads a key from `metrics` first, then from the dashboard root. */
  const metric = (...keys: string[]) =>
    firstNumber(...keys.map((key) => metrics[key]), ...keys.map((key) => value[key]));

  return {
    agency: { id: str(agency.id) ?? (idOf(agency.id) || undefined), name: str(agency.name) ?? 'Agency' },
    range: Object.keys(range).length ? { from: str(range.from) ?? '', to: str(range.to) ?? '' } : undefined,
    scope: str(value.scope),
    metrics: Object.keys(metrics).length ? mapDashboardMetrics(metrics) : undefined,
    orders: {
      total: firstNumber(orders.total, metric('totalOrders')),
      delivered: firstNumber(orders.delivered, metric('deliveredOrders')),
      cancelled: firstNumber(orders.cancelled, value.cancelledOrders),
      open: firstNumber(orders.open, metric('pendingOrders'), value.openOrders),
      revenue: firstNumber(orders.revenue, totals.orderValue, metric('orderValue', 'totalRevenue'), value.revenue),
      taxCollected: firstNumber(orders.taxCollected, totals.tax, value.taxCollected),
      averageOrderValue: firstNumber(orders.averageOrderValue, value.averageOrderValue),
    },
    catalog: {
      activeProducts: firstNumber(catalog.activeProducts, metric('totalProducts'), value.products),
      visibleCustomers: firstNumber(catalog.visibleCustomers, metric('totalCustomers'), value.customers),
    },
    inventory: {
      sellableUnits: firstNumber(inventory.sellableUnits, value.sellableUnits),
      stockValue: firstNumber(inventory.stockValue, value.stockValue),
      expiredUnits: firstNumber(inventory.expiredUnits, inventory.expiredBatches, metric('expired')),
      expiringUnits: firstNumber(inventory.expiringUnits, inventory.expiringSoonBatches, metric('expiringSoon')),
      lowStockBatches: firstNumber(inventory.lowStockBatches, inventory.lowStockProducts, metric('lowStock')),
      outOfStockBatches: firstNumber(inventory.outOfStockBatches, inventory.outOfStockProducts, metric('outOfStock')),
    },
    finance: {
      outstandingAmount: firstNumber(finance.outstandingAmount, metric('unpaidAmount'), value.outstandingAmount),
      outstandingInvoices: firstNumber(finance.outstandingInvoices),
      collectedAmount: firstNumber(finance.collectedAmount, value.collectedAmount),
      paymentsRecorded: firstNumber(finance.paymentsRecorded),
    },
    followUps: { pending: firstNumber(followUps.pending, followUps.due, metric('followUpsDue'), value.pendingFollowUps) },
    orderStatusBreakdown: asArray(value.orderStatusBreakdown).map((row) => {
      const entry = asDict(row);
      return { status: str(entry.status) ?? '', count: num(entry.count), value: num(entry.value) };
    }),
    totals: Object.keys(totals).length
      ? {
          orderValue: totals.orderValue === undefined ? undefined : num(totals.orderValue),
          tax: totals.tax === undefined ? undefined : num(totals.tax),
          customers: totals.customers === undefined ? undefined : num(totals.customers),
          products: totals.products === undefined ? undefined : num(totals.products),
          salesmen: totals.salesmen === undefined ? undefined : num(totals.salesmen),
        }
      : undefined,
  };
};

const mapDashboardMetrics = (metrics: Dict): DashboardMetrics => ({
  totalCustomers: num(metrics.totalCustomers),
  totalSalesmen: num(metrics.totalSalesmen),
  totalProducts: num(metrics.totalProducts),
  todayOrders: num(metrics.todayOrders),
  todayDeliveredOrders: num(metrics.todayDeliveredOrders),
  pendingOrders: num(metrics.pendingOrders),
  underReviewOrders: num(metrics.underReviewOrders),
  confirmedOrders: num(metrics.confirmedOrders),
  processingOrders: num(metrics.processingOrders),
  packedOrders: num(metrics.packedOrders),
  dispatchedOrders: num(metrics.dispatchedOrders),
  deliveredOrders: num(metrics.deliveredOrders),
  orderValue: num(metrics.orderValue),
  totalRevenue: num(metrics.totalRevenue),
  monthlyOrders: num(metrics.monthlyOrders),
  monthlyRevenue: num(metrics.monthlyRevenue),
  lowStock: num(metrics.lowStock),
  outOfStock: num(metrics.outOfStock),
  expiringSoon: num(metrics.expiringSoon),
  expired: num(metrics.expired),
  followUpsDue: num(metrics.followUpsDue),
  unpaidAmount: num(metrics.unpaidAmount),
});

/* ---------------------------------------------------------------- settings */

/** `GET /settings` returns the agency document, including the fields added in parallel. */
export const mapAgencySettings = (raw: unknown): AgencySettings => {
  const value = withId(asDict(raw));
  const contact = asDict(value.contact);
  const tax = asDict(value.tax);
  const orderSettings = asDict(value.orderSettings);
  const features = asDict(value.features);

  const normalizeHours = (input: unknown): BusinessHours => {
    // A day is free text such as "09:00 - 18:00"; null or blank means closed.
    const result: BusinessHours = {};
    for (const [day, entry] of Object.entries(asDict(input))) {
      result[day] = typeof entry === 'string' ? entry.trim() || null : null;
    }
    return result;
  };

  const notifications = asDict(value.notifications);
  const emailPrefs = asDict(notifications.email);
  const notificationPreferences: NotificationPreferences = {
    email: {
      newOrder: bool(emailPrefs.newOrder) ?? true,
      orderStatusChange: bool(emailPrefs.orderStatusChange) ?? true,
      paymentRecorded: bool(emailPrefs.paymentRecorded) ?? true,
      inventoryLow: bool(emailPrefs.inventoryLow) ?? true,
      inventoryExpiring: bool(emailPrefs.inventoryExpiring) ?? true,
      requirementUploaded: bool(emailPrefs.requirementUploaded) ?? true,
      followUpDue: bool(emailPrefs.followUpDue) ?? true,
      contactSubmission: bool(emailPrefs.contactSubmission) ?? true,
    },
    quietHoursEnabled: bool(notifications.quietHoursEnabled) ?? false,
    quietHoursStart: str(notifications.quietHoursStart),
    quietHoursEnd: str(notifications.quietHoursEnd),
  };

  return {
    id: value.id,
    name: str(value.name) ?? '',
    slug: str(value.slug) ?? '',
    status: (str(value.status) ?? 'ACTIVE') as AgencySettings['status'],
    legalName: str(value.legalName),
    logoUrl: str(value.logoUrl),
    website: str(value.website),
    description: str(value.description),
    contact: {
      email: str(contact.email) ?? '',
      phone: str(contact.phone) ?? '',
      address: mapAddress(contact.address),
    },
    tax: {
      gstNumber: str(tax.gstNumber),
      defaultTaxRate: num(tax.defaultTaxRate),
      pricesIncludeTax: bool(tax.pricesIncludeTax) ?? false,
      invoicePrefix: str(tax.invoicePrefix) ?? 'INV',
    },
    orderSettings: {
      prefix: str(orderSettings.prefix) ?? 'SM',
      padding: num(orderSettings.padding, 6),
      lowStockThreshold: num(orderSettings.lowStockThreshold, 20),
      expiryAlertDays: num(orderSettings.expiryAlertDays, 60),
      allowCustomerCancellation: bool(orderSettings.allowCustomerCancellation) ?? true,
      cancelWindowHours: num(orderSettings.cancelWindowHours, 48),
      followUpDueDays: num(orderSettings.followUpDueDays, 7),
      invoiceDueDays: num(orderSettings.invoiceDueDays, 15),
      defaultPaymentTermsDays: num(orderSettings.defaultPaymentTermsDays),
    },
    features: {
      aiEnabled: bool(features.aiEnabled) ?? true,
      uploadsEnabled: bool(features.uploadsEnabled) ?? true,
      socketEnabled: bool(features.socketEnabled) ?? true,
    },
    businessHours: normalizeHours(value.businessHours),
    notifications: notificationPreferences,
    createdAt: str(value.createdAt),
    updatedAt: str(value.updatedAt),
  };
};

/* ---------------------------------------------------------------- payments */

export const mapInvoice = (raw: unknown) => {
  const value = withId(asDict(raw));
  const snapshot = asDict(value.agencySnapshot);
  const snapshotAddress = asDict(snapshot.address);
  return {
    id: value.id,
    invoiceNumber: str(value.invoiceNumber) ?? value.id.slice(-8),
    invoiceYear: num(value.invoiceYear),
    orderId: str(value.orderId) ?? idOf(value.orderId),
    orderNumber: str(value.orderNumber) ?? '',
    customerId: str(value.customerId) ?? idOf(value.customerId),
    customerName: str(value.customerName) ?? 'Customer',
    customerPhone: str(value.customerPhone),
    customerGstNumber: str(value.customerGstNumber),
    agencySnapshot: {
      name: str(snapshot.name) ?? '',
      legalName: str(snapshot.legalName),
      gstNumber: str(snapshot.gstNumber),
      email: str(snapshot.email) ?? '',
      phone: str(snapshot.phone) ?? '',
      address: mapAddress(snapshotAddress),
    },
    lines: asArray(value.lines).map((line) => {
      const row = asDict(line);
      return {
        productId: str(row.productId) ?? idOf(row.productId),
        productName: str(row.productName) ?? '',
        sku: str(row.sku) ?? '',
        unit: str(row.unit) ?? 'UNIT',
        quantity: num(row.quantity, 1),
        unitPrice: num(row.unitPrice),
        taxRate: num(row.taxRate),
        taxAmount: num(row.taxAmount),
        lineTotal: num(row.lineTotal, num(row.unitPrice) * num(row.quantity) + num(row.taxAmount)),
      };
    }),
    currency: str(value.currency) ?? 'INR',
    subtotal: num(value.subtotal),
    taxTotal: num(value.taxTotal),
    grandTotal: num(value.grandTotal),
    amountPaid: num(value.amountPaid),
    amountDue: num(value.amountDue),
    status: (str(value.status) ?? 'ISSUED') as Invoice['status'],
    issuedAt: str(value.issuedAt) ?? '',
    dueAt: str(value.dueAt),
    paymentTermsDays: num(value.paymentTermsDays),
    voidedAt: str(value.voidedAt),
    voidReason: str(value.voidReason),
    createdAt: str(value.createdAt),
    updatedAt: str(value.updatedAt),
  } satisfies Invoice;
};

export const mapInvoices = (raw: unknown): Invoice[] => asArray<unknown>(raw).map(mapInvoice);

export const mapPayment = (raw: unknown): Payment => {
  const value = withId(asDict(raw));
  const customer = resolveRef(value.customerId);
  return {
    id: value.id,
    reference: str(value.reference) ?? '',
    invoiceId: str(value.invoiceId) ?? (idOf(value.invoiceId) || undefined),
    invoiceNumber: str(value.invoiceNumber),
    orderId: str(value.orderId) ?? (idOf(value.orderId) || undefined),
    orderNumber: str(value.orderNumber),
    customerId: customer
      ? { id: customer.id, businessName: str(customer.businessName) }
      : (str(value.customerId) ?? idOf(value.customerId)) as ID,
    customerUserId: str(value.customerUserId) ?? (idOf(value.customerUserId) || undefined),
    amount: num(value.amount),
    method: (str(value.method) ?? 'OTHER') as Payment['method'],
    paidAt: str(value.paidAt) ?? '',
    note: str(value.note),
    recordedBy: str(value.recordedBy) ?? idOf(value.recordedBy),
    createdAt: str(value.createdAt),
  };
};

export const mapPayments = (raw: unknown): Payment[] => asArray<unknown>(raw).map(mapPayment);
