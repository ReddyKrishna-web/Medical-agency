/**
 * Request-body builders.
 *
 * Every function here produces the exact JSON the backend Zod schema accepts.
 * Optional fields are omitted rather than sent empty, because the schemas use
 * `trimmed()`/`objectId` refinements that reject `''`.
 */

import type {
  AddressInput,
  CustomerStatus,
  FollowUpStatus,
  FollowUpType,
  ID,
  NotificationPreferenceKey,
  OrderStatus,
  PaymentMethod,
  PublicContactInput,
  RequirementStatus,
  SalesmanStatus,
} from '@/types/api';

const trimmed = (value: string | undefined | null): string | undefined => {
  const next = typeof value === 'string' ? value.trim() : '';
  return next.length ? next : undefined;
};

const optionalNumber = (value: string | number | undefined | null): number | undefined => {
  if (value === undefined || value === null || value === '') return undefined;
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const requiredNumber = (value: string | number | undefined | null, fallback = 0): number => {
  const parsed = optionalNumber(value);
  return parsed === undefined ? fallback : parsed;
};

const omit = <T extends Record<string, unknown>>(value: T): T => {
  const output = {} as Record<string, unknown>;
  for (const [key, item] of Object.entries(value)) {
    if (item === undefined) continue;
    output[key] = item;
  }
  return output as T;
};

const address = (value: AddressInput) => ({
  line1: value.line1 ?? '',
  line2: trimmed(value.line2),
  city: value.city ?? '',
  state: value.state ?? '',
  country: value.country ?? '',
  postalCode: value.postalCode ?? '',
});

/* ------------------------------------------------------------- registration */

/** Which kind of account a visitor is registering. */
export type AccountType = 'MEDICAL_SHOP' | 'SALESMAN' | 'AGENCY';

export interface RegisterFormValues {
  accountType: AccountType;
  agencyId?: string;
  name: string;
  email: string;
  phone: string;
  password: string;
  businessName?: string;
  ownerName?: string;
  alternatePhone?: string;
  address?: AddressInput;
  gstNumber?: string;
  drugLicenseNumber?: string;
  shopType?: string;
  /** Salesman-only profile fields. */
  territory?: string;
  monthlyTarget?: string | number;
}

/**
 * Shops and salesmen register into the agency they selected. The payload shape
 * matches `registerSchema`: shops must carry business details, salesmen omit
 * them. Role, status and tenant are decided by the server.
 */
export const buildRegisterPayload = (values: RegisterFormValues) => {
  const isShop = values.accountType === 'MEDICAL_SHOP';
  const isSalesman = values.accountType === 'SALESMAN';
  return omit({
    accountType: values.accountType,
    agencyId: trimmed(values.agencyId),
    name: values.name.trim(),
    email: values.email.trim(),
    phone: values.phone.trim(),
    password: values.password,
    businessName: isShop ? values.businessName?.trim() || values.name.trim() : undefined,
    ownerName: isShop ? trimmed(values.ownerName) : undefined,
    alternatePhone: isShop ? trimmed(values.alternatePhone) : undefined,
    address: isShop && values.address ? address(values.address) : undefined,
    gstNumber: isShop ? trimmed(values.gstNumber) : undefined,
    drugLicenseNumber: isShop ? trimmed(values.drugLicenseNumber) : undefined,
    shopType: isShop ? trimmed(values.shopType) : undefined,
    territory: isSalesman ? trimmed(values.territory) : undefined,
    monthlyTarget: isSalesman ? optionalNumber(values.monthlyTarget) : undefined,
  });
};

export interface RegisterAgencyFormValues {
  agencyName: string;
  contactName?: string;
  email: string;
  phone: string;
  password: string;
  gstNumber?: string;
  address: AddressInput;
}

/** Matches `registerAgencySchema` for the dedicated agency sign-up route. */
export const buildRegisterAgencyPayload = (values: RegisterAgencyFormValues) =>
  omit({
    agencyName: values.agencyName.trim(),
    contactName: trimmed(values.contactName),
    email: values.email.trim(),
    phone: values.phone.trim(),
    password: values.password,
    gstNumber: trimmed(values.gstNumber),
    address: address(values.address),
  });

/* ---------------------------------------------------------------- products */

export interface ProductFormValues {
  name: string;
  sku?: string;
  categoryId?: string;
  brand?: string;
  genericName?: string;
  manufacturer?: string;
  description?: string;
  hsnCode?: string;
  price: string | number;
  mrp?: string | number;
  taxRate: string | number;
  unit: string;
  packSize?: string;
  minOrderQuantity?: string | number;
  maxOrderQuantity?: string | number;
  imageUrl?: string;
  reorderLevel?: string | number;
  tags?: string;
  isFeatured?: boolean;
  isActive?: boolean;
}

/**
 * `createProductSchema` is JSON only; there is no product upload route, so the
 * product image is referenced by URL. `genericName`, `manufacturer`, `mrp` and
 * `reorderLevel` are part of the extended schema and are omitted when blank.
 */
export const buildProductPayload = (values: ProductFormValues) => {
  const tags = trimmed(values.tags)
    ?.split(',')
    .map((tag) => tag.trim())
    .filter(Boolean)
    .slice(0, 20);

  return omit({
    name: values.name.trim(),
    // The service uppercases the SKU; sending it trimmed is enough.
    sku: trimmed(values.sku)?.toUpperCase(),
    categoryId: trimmed(values.categoryId),
    brand: trimmed(values.brand),
    genericName: trimmed(values.genericName),
    manufacturer: trimmed(values.manufacturer),
    description: trimmed(values.description),
    hsnCode: trimmed(values.hsnCode),
    price: requiredNumber(values.price),
    mrp: optionalNumber(values.mrp),
    taxRate: requiredNumber(values.taxRate),
    unit: values.unit.trim(),
    packSize: trimmed(values.packSize),
    minOrderQuantity: optionalNumber(values.minOrderQuantity),
    maxOrderQuantity: optionalNumber(values.maxOrderQuantity),
    imageUrl: trimmed(values.imageUrl),
    reorderLevel: optionalNumber(values.reorderLevel),
    tags: tags?.length ? tags : undefined,
    isFeatured: values.isFeatured,
    isActive: values.isActive,
  });
};

/* -------------------------------------------------------------- categories */

export interface CategoryFormValues {
  name: string;
  description?: string;
  parentId?: string;
  displayOrder?: string | number;
  imageUrl?: string;
  isActive?: boolean;
}

export const buildCategoryPayload = (values: CategoryFormValues) =>
  omit({
    name: values.name.trim(),
    description: trimmed(values.description),
    parentId: trimmed(values.parentId),
    displayOrder: optionalNumber(values.displayOrder),
    imageUrl: trimmed(values.imageUrl),
    isActive: values.isActive,
  });

/* --------------------------------------------------------------- customers */

export interface CustomerCreateFormValues {
  name: string;
  email: string;
  phone: string;
  password: string;
  businessName: string;
  ownerName?: string;
  alternatePhone?: string;
  address: AddressInput;
  gstNumber?: string;
  drugLicenseNumber?: string;
  shopType?: string;
  creditLimit?: string | number;
  assignedSalesmanId?: string;
  status?: 'PENDING' | 'APPROVED' | 'ACTIVE';
  notes?: string;
}

export const buildCustomerCreatePayload = (values: CustomerCreateFormValues) =>
  omit({
    name: values.name.trim(),
    email: values.email.trim(),
    phone: values.phone.trim(),
    password: values.password,
    businessName: values.businessName.trim(),
    ownerName: trimmed(values.ownerName),
    alternatePhone: trimmed(values.alternatePhone),
    address: address(values.address),
    gstNumber: trimmed(values.gstNumber),
    drugLicenseNumber: trimmed(values.drugLicenseNumber),
    shopType: trimmed(values.shopType),
    creditLimit: optionalNumber(values.creditLimit),
    assignedSalesmanId: trimmed(values.assignedSalesmanId),
    status: values.status,
    notes: trimmed(values.notes),
  });

export interface CustomerUpdateFormValues {
  businessName?: string;
  ownerName?: string;
  phone?: string;
  alternatePhone?: string;
  gstNumber?: string;
  drugLicenseNumber?: string;
  shopType?: string;
  address?: AddressInput;
  creditLimit?: string | number;
  assignedSalesmanId?: string | null;
  notes?: string;
}

/** `updateCustomerSchema` rejects an empty object; only changed fields are sent. */
const buildCustomerFields = (input: CustomerUpdateFormValues) =>
  omit({
    businessName: trimmed(input.businessName),
    ownerName: trimmed(input.ownerName),
    phone: trimmed(input.phone),
    alternatePhone: trimmed(input.alternatePhone),
    gstNumber: trimmed(input.gstNumber),
    drugLicenseNumber: trimmed(input.drugLicenseNumber),
    shopType: trimmed(input.shopType),
    address: input.address ? address(input.address) : undefined,
    creditLimit: optionalNumber(input.creditLimit),
    // `null` explicitly unassigns; `undefined` leaves the assignment untouched.
    assignedSalesmanId:
      input.assignedSalesmanId === null ? null : trimmed(input.assignedSalesmanId as string | undefined) || undefined,
    notes: trimmed(input.notes),
  });

export const buildCustomerUpdatePayload = (values: CustomerUpdateFormValues, original?: CustomerUpdateFormValues) => {
  type Built = ReturnType<typeof buildCustomerFields>;

  const payload: Built = buildCustomerFields(values);
  if (!original) return payload;

  // Both sides are normalised through the same builder so a form string and a
  // stored number are not reported as a change.
  const baseline = buildCustomerFields(original);
  const entries = Object.entries(payload) as [string, unknown][];
  return omit(
    Object.fromEntries(
      entries.filter(([key, value]) => {
        if (value === undefined) return false;
        if (key === 'address') return true;
        return JSON.stringify((baseline as Record<string, unknown>)[key]) !== JSON.stringify(value);
      }),
    ),
  ) as Built;
};

export const buildCustomerNotePayload = (text: string, type: 'NOTE' | 'CALL' = 'NOTE') => ({
  text: text.trim(),
  type
});

/** `customerStatusSchema`: rejection and activation use `note`, never `rejectionReason`. */
export const buildCustomerStatusPayload = (status: CustomerStatus, note?: string) =>
  omit({ status, note: trimmed(note) });

/* ---------------------------------------------------------------- salesmen */

export interface SalesmanCreateFormValues {
  name: string;
  email: string;
  phone: string;
  employeeCode?: string;
  territory?: string;
  monthlyTarget?: string | number;
  notes?: string;
}

/**
 * `createSalesmanSchema` also accepts `password`, but the extended backend mints
 * a one-time `temporaryPassword` instead, so the client never supplies one.
 */
export const buildSalesmanCreatePayload = (values: SalesmanCreateFormValues) =>
  omit({
    name: values.name.trim(),
    email: values.email.trim(),
    phone: values.phone.trim(),
    employeeCode: trimmed(values.employeeCode)?.toUpperCase(),
    territory: trimmed(values.territory),
    monthlyTarget: optionalNumber(values.monthlyTarget),
    notes: trimmed(values.notes),
  });

export interface SalesmanUpdateFormValues {
  employeeCode?: string;
  territory?: string;
  phone?: string;
  monthlyTarget?: string | number;
  notes?: string;
}

export const buildSalesmanUpdatePayload = (values: SalesmanUpdateFormValues) =>
  omit({
    employeeCode: trimmed(values.employeeCode)?.toUpperCase(),
    territory: trimmed(values.territory),
    phone: trimmed(values.phone),
    monthlyTarget: optionalNumber(values.monthlyTarget),
    notes: trimmed(values.notes),
  });

export const buildSalesmanStatusPayload = (status: SalesmanStatus, note?: string) =>
  omit({ status, note: trimmed(note) });

/** `POST /salesmen/:id/assign-customers` replaces the whole assignment set. */
export const buildAssignCustomersPayload = (customerIds: ID[]) => ({ customerIds });

/* ------------------------------------------------------------------ orders */

export interface OrderLineInput {
  productId: string;
  quantity: number;
}

export interface OrderFormValues {
  customerId?: string;
  items: OrderLineInput[];
  notes?: string;
  customerNotes?: string;
}

/**
 * `createOrderSchema` accepts only product ids and quantities: prices, tax and
 * totals are server owned. The validation body must therefore be a separate
 * `{ items }` payload, never the order body.
 */
export const buildOrderPayload = (values: OrderFormValues) =>
  omit({
    customerId: trimmed(values.customerId),
    items: values.items.map((item) => ({ productId: item.productId, quantity: Math.max(1, Math.trunc(item.quantity)) })),
    notes: trimmed(values.notes),
    customerNotes: trimmed(values.customerNotes),
  });

/** `validateOrderSchema` takes `{ items }` only. */
export const buildStockValidationPayload = (items: OrderLineInput[]) => ({
  items: items.map((item) => ({ productId: item.productId, quantity: Math.max(1, Math.trunc(item.quantity)) })),
});

/** `reorderSchema`: the source order is re-priced; its own history is untouched. */
export const buildReorderPayload = (orderId: string, notes?: string, customerId?: string) =>
  omit({ orderId, customerId: trimmed(customerId), notes: trimmed(notes) });

export const buildOrderStatusPayload = (status: OrderStatus, note?: string) => omit({ status, note: trimmed(note) });

/** `cancelOrderSchema` requires a `reason` of at least 3 characters. */
export const buildOrderCancelPayload = (reason: string) => ({ reason: reason.trim() });

/* --------------------------------------------------------------- inventory */

export interface ReceiveStockFormValues {
  productId: string;
  batchNumber: string;
  quantity: string | number;
  unitCost?: string | number;
  expiryDate: string;
  mfgDate?: string;
  supplier?: string;
  manufacturer?: string;
  location?: string;
  reorderLevel?: string | number;
  note?: string;
}

export const buildReceiveStockPayload = (values: ReceiveStockFormValues) =>
  omit({
    productId: values.productId,
    // The service uppercases the batch number and rejects a case conflict.
    batchNumber: values.batchNumber.trim().toUpperCase(),
    quantity: Math.max(1, Math.trunc(requiredNumber(values.quantity, 1))),
    unitCost: optionalNumber(values.unitCost),
    expiryDate: values.expiryDate,
    mfgDate: trimmed(values.mfgDate),
    supplier: trimmed(values.supplier),
    manufacturer: trimmed(values.manufacturer),
    location: trimmed(values.location),
    reorderLevel: optionalNumber(values.reorderLevel),
    note: trimmed(values.note),
  });

/** `adjustStockSchema` is keyed on the inventory row, not on product or batch. */
export const buildAdjustStockPayload = (values: { inventoryId: string; delta: number; reason: string; note?: string }) =>
  omit({
    inventoryId: values.inventoryId,
    delta: Math.trunc(values.delta),
    reason: values.reason.trim(),
    note: trimmed(values.note),
  });

export const buildUpdateBatchPayload = (values: {
  supplier?: string;
  manufacturer?: string;
  location?: string;
  note?: string;
  isActive?: boolean;
}) =>
  omit({
    supplier: trimmed(values.supplier),
    manufacturer: trimmed(values.manufacturer),
    location: trimmed(values.location),
    note: trimmed(values.note),
    isActive: values.isActive,
  });

/* ------------------------------------------------------------ requirements */

/** Multipart upload: the file field is `file`, and `notes` is required. */
export function buildRequirementFormData(values: { file: File; title: string; notes: string; customerId?: string }) {
  const form = new FormData();
  form.append('file', values.file);
  form.append('title', values.title.trim());
  form.append('notes', values.notes.trim());
  const customerId = trimmed(values.customerId);
  if (customerId) form.append('customerId', customerId);
  return form;
}

export const buildRequirementStatusPayload = (status: RequirementStatus, note?: string) => omit({ status, note: trimmed(note) });

/* ------------------------------------------------------------------ follow */

export interface FollowUpFormValues {
  customerId: string;
  title: string;
  notes?: string;
  type: FollowUpType;
  dueAt: string;
  relatedOrderId?: string;
}

export const buildFollowUpCreatePayload = (values: FollowUpFormValues) =>
  omit({
    customerId: values.customerId,
    title: values.title.trim(),
    notes: trimmed(values.notes),
    type: values.type,
    // `dueAt` is required and parsed with `new Date(value)`.
    dueAt: new Date(values.dueAt).toISOString(),
    relatedOrderId: trimmed(values.relatedOrderId),
  });

export const buildFollowUpUpdatePayload = (values: {
  title?: string;
  notes?: string;
  type?: FollowUpType;
  dueAt?: string;
  outcome?: string;
  nextFollowUpAt?: string;
}) =>
  omit({
    title: trimmed(values.title),
    notes: trimmed(values.notes),
    type: values.type,
    dueAt: values.dueAt ? new Date(values.dueAt).toISOString() : undefined,
    outcome: trimmed(values.outcome),
    nextFollowUpAt: values.nextFollowUpAt ? new Date(values.nextFollowUpAt).toISOString() : undefined,
  });

export const buildFollowUpStatusPayload = (status: FollowUpStatus, note?: string) => omit({ status, note: trimmed(note) });

/* ----------------------------------------------------------- notifications */

/** `markNotificationsReadSchema` accepts `notificationIds` or `all`; never `ids`. */
export const buildMarkNotificationsReadPayload = (notificationIds: ID[], all = false) =>
  all ? { all: true } : { notificationIds };

export const buildMarkMessagesReadPayload = (conversationWith: ID) => ({ conversationWith });

/* ---------------------------------------------------------------- messages */

export const buildSendMessagePayload = (values: {
  receiverId: string;
  body: string;
  orderId?: string;
  orderReference?: string;
}) =>
  omit({
    receiverId: values.receiverId,
    body: values.body.trim(),
    orderId: trimmed(values.orderId),
    orderReference: trimmed(values.orderReference),
  });

/* ------------------------------------------------------------------ finance */

/** `createPaymentSchema`: `customerId`, `amount` and `method` are mandatory. */
export const buildPaymentPayload = (values: {
  customerId: string;
  amount: string | number;
  method: PaymentMethod;
  invoiceId?: string;
  reference?: string;
  paidAt?: string;
  note?: string;
}) =>
  omit({
    customerId: values.customerId,
    amount: requiredNumber(values.amount, 0),
    method: values.method,
    invoiceId: trimmed(values.invoiceId),
    reference: trimmed(values.reference),
    paidAt: values.paidAt ? new Date(values.paidAt).toISOString() : undefined,
    note: trimmed(values.note),
  });

export const buildVoidInvoicePayload = (reason: string) => ({ reason: reason.trim() });

/* ---------------------------------------------------------------- settings */

export interface SettingsFormValues {
  name: string;
  legalName?: string;
  website?: string;
  description?: string;
  logoUrl?: string;
  contact: { email: string; phone: string; address: AddressInput };
  tax: {
    gstNumber?: string;
    defaultTaxRate: string | number;
    pricesIncludeTax: boolean;
    invoicePrefix: string;
  };
  orderSettings: {
    prefix: string;
    padding: string | number;
    lowStockThreshold: string | number;
    expiryAlertDays: string | number;
    allowCustomerCancellation: boolean;
    cancelWindowHours: string | number;
    followUpDueDays: string | number;
    invoiceDueDays: string | number;
    defaultPaymentTermsDays: string | number;
  };
  features: { aiEnabled: boolean; uploadsEnabled: boolean; socketEnabled: boolean };
  businessHours: BusinessHoursInput;
  notifications: NotificationFormValues;
}

/** `NOTIFICATION_PREFERENCE_KEYS` plus the quiet-hours window. */
export interface NotificationFormValues {
  email: Record<NotificationPreferenceKey, boolean>;
  quietHoursEnabled: boolean;
  quietHoursStart: string;
  quietHoursEnd: string;
}

/** One free-text opening-hours entry per day, e.g. `"09:00 - 18:00"`; '' is closed. */
export type BusinessHoursInput = Record<string, string | null>;

/** `WEEK_DAYS`, in the order the agency publishes them. */
const DAYS = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'] as const;

/**
 * Each day is free text such as `"09:00 - 18:00"` so a split shift can be
 * expressed; a blank or unparsable value is stored as `null` (closed).
 */
const RANGE_PATTERN = /^\d{1,2}:\d{2}(\s*-\s*\d{1,2}:\d{2})?/;

const buildBusinessHours = (input: BusinessHoursInput) => {
  const result: Record<string, string | null> = {};
  for (const day of DAYS) {
    const text = (input[day] ?? '').trim();
    result[day] = RANGE_PATTERN.test(text) ? text : null;
  }
  return result;
};

/**
 * `settingsPatchSchema` is strictly nested. A flat or invented payload is
 * silently dropped by the backend, so the shape is rebuilt here.
 */
export const buildSettingsPayload = (values: SettingsFormValues) =>
  omit({
    name: values.name.trim(),
    legalName: trimmed(values.legalName),
    website: trimmed(values.website),
    description: trimmed(values.description),
    logoUrl: trimmed(values.logoUrl),
    contact: omit({
      email: values.contact.email.trim().toLowerCase(),
      phone: values.contact.phone.trim(),
      address: omit({
        line1: trimmed(values.contact.address.line1),
        line2: trimmed(values.contact.address.line2),
        city: trimmed(values.contact.address.city),
        state: trimmed(values.contact.address.state),
        country: trimmed(values.contact.address.country),
        postalCode: trimmed(values.contact.address.postalCode),
      }),
    }),
    tax: omit({
      gstNumber: trimmed(values.tax.gstNumber)?.toUpperCase(),
      defaultTaxRate: optionalNumber(values.tax.defaultTaxRate),
      pricesIncludeTax: values.tax.pricesIncludeTax,
      invoicePrefix: trimmed(values.tax.invoicePrefix)?.toUpperCase(),
    }),
    orderSettings: omit({
      prefix: trimmed(values.orderSettings.prefix)?.toUpperCase(),
      padding: optionalNumber(values.orderSettings.padding),
      lowStockThreshold: optionalNumber(values.orderSettings.lowStockThreshold),
      expiryAlertDays: optionalNumber(values.orderSettings.expiryAlertDays),
      allowCustomerCancellation: values.orderSettings.allowCustomerCancellation,
      cancelWindowHours: optionalNumber(values.orderSettings.cancelWindowHours),
      followUpDueDays: optionalNumber(values.orderSettings.followUpDueDays),
      invoiceDueDays: optionalNumber(values.orderSettings.invoiceDueDays),
      defaultPaymentTermsDays: optionalNumber(values.orderSettings.defaultPaymentTermsDays),
    }),
    features: omit({
      aiEnabled: values.features.aiEnabled,
      uploadsEnabled: values.features.uploadsEnabled,
      socketEnabled: values.features.socketEnabled,
    }),
    businessHours: buildBusinessHours(values.businessHours),
    notifications: omit({
      email: omit({ ...values.notifications.email }),
      quietHoursEnabled: values.notifications.quietHoursEnabled,
      quietHoursStart: trimmed(values.notifications.quietHoursStart),
      quietHoursEnd: trimmed(values.notifications.quietHoursEnd),
    }),
  });

/* ----------------------------------------------------------------- contact */

export const buildContactPayload = (values: PublicContactInput) =>
  omit({
    name: values.name.trim(),
    email: values.email.trim(),
    phone: trimmed(values.phone),
    organisation: trimmed(values.organisation),
    topic: values.topic,
    message: values.message.trim(),
  });

/* ------------------------------------------------------------------- ai */

export const buildAiAskPayload = (question: string, from?: string, to?: string) =>
  omit({ question: question.trim(), from: trimmed(from), to: trimmed(to) });

/* ----------------------------------------------------------------- export */

export const buildExportParams = (type: string, from?: string, to?: string) => ({
  type,
  format: 'csv',
  ...(from ? { from } : {}),
  ...(to ? { to } : {}),
});
