/**
 * Types mirroring the real Supply Medicals API (`backend/src`).
 *
 * The wire always speaks canonical role values (`CUSTOMER`, `SALESMAN`,
 * `AGENCY_ADMIN`) and camelCase document fields. The UI works with the short
 * `Role` keys defined here; `src/lib/adapters.ts` is the only place that maps
 * between the two.
 */

export type ID = string;

/** UI role keys. Produced by `mapRole`; never sent to the API. */
export type Role = 'customer' | 'salesman' | 'admin';

/** Canonical role values as stored by the backend. */
export type WireRole = 'CUSTOMER' | 'SALESMAN' | 'AGENCY_ADMIN';

export type UserStatus = 'PENDING' | 'ACTIVE' | 'DISABLED';
export type CustomerStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'ACTIVE' | 'DISABLED';
export type SalesmanStatus = 'ACTIVE' | 'INACTIVE' | 'SUSPENDED';
export type OrderStatus =
  | 'PENDING'
  | 'UNDER_REVIEW'
  | 'CONFIRMED'
  | 'PROCESSING'
  | 'PACKED'
  | 'DISPATCHED'
  | 'DELIVERED'
  | 'CANCELLED';
export type InvoiceStatus = 'ISSUED' | 'PARTIALLY_PAID' | 'PAID' | 'VOID';
export type PaymentMethod = 'CASH' | 'BANK_TRANSFER' | 'UPI' | 'CARD' | 'CHEQUE' | 'OTHER';
export type RequirementStatus = 'SUBMITTED' | 'IN_REVIEW' | 'ACCEPTED' | 'REJECTED' | 'CONVERTED';
/** `RESCHEDULED` is accepted defensively; older deployments expose only three. */
export type FollowUpStatus = 'PENDING' | 'COMPLETED' | 'RESCHEDULED' | 'CANCELLED';
export type FollowUpType = 'CALL' | 'VISIT' | 'WHATSAPP' | 'EMAIL' | 'OTHER';
export type BatchStatus = 'ACTIVE' | 'EXPIRED' | 'DEPLETED' | 'QUARANTINED';
export type OrderSource = 'CUSTOMER_PORTAL' | 'SALESMAN' | 'ADMIN' | 'REQUIREMENT' | 'REORDER';
/** `PRODUCT_AVAILABILITIES`; there is no EXPIRING_SOON availability filter. */
export type Availability = 'IN_STOCK' | 'LOW_STOCK' | 'OUT_OF_STOCK';

/** `CONTACT_TOPICS`; an unsupported value is rejected by the public form schema. */
export type ContactTopic =
  | 'NEW_ORDER_ENQUIRY'
  | 'PRODUCT_ENQUIRY'
  | 'PRICING_REQUEST'
  | 'PARTNERSHIP'
  | 'COMPLAINT'
  | 'SUPPORT'
  | 'OTHER';

/** `NOTIFICATION_PREFERENCE_KEYS`. */
export type NotificationPreferenceKey =
  | 'newOrder'
  | 'orderStatusChange'
  | 'paymentRecorded'
  | 'inventoryLow'
  | 'inventoryExpiring'
  | 'requirementUploaded'
  | 'followUpDue'
  | 'contactSubmission';

export interface ApiErrorBody {
  success?: false;
  error?: { code?: string; message?: string; details?: unknown };
}

export interface PageMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
  /** `GET /notifications` also returns the unread total in `meta`. */
  unreadCount?: number;
}

export interface ApiEnvelope<T> {
  success: true;
  data: T;
  meta?: Partial<PageMeta> & Record<string, unknown>;
}

/* ------------------------------------------------------------------ address */

export interface Address {
  line1: string;
  line2?: string;
  city: string;
  state: string;
  country: string;
  postalCode: string;
}

export type AddressInput = Partial<Address>;

/* -------------------------------------------------------------------- user */

export interface AuthUser {
  id: ID;
  name: string;
  email: string;
  phone?: string;
  role: Role;
  status: UserStatus;
  avatarUrl?: string;
  mustChangePassword: boolean;
  agencyId?: ID;
  createdAt?: string;
  lastLoginAt?: string;
}

export interface User extends AuthUser {
  agency?: AgencySummary | null;
  customer?: CustomerProfile | null;
  salesman?: SalesmanProfile | null;
}

/** Populated `userId` of a customer/salesman document. */
export interface UserStub {
  id: ID;
  name?: string;
  email?: string;
  phone?: string;
  status?: UserStatus;
  avatarUrl?: string;
  lastLoginAt?: string;
}

/** Populated `assignedSalesmanId` of a customer document. */
export interface SalesmanStub {
  id: ID;
  employeeCode: string;
  territory?: string;
  status?: SalesmanStatus;
  userId?: ID | UserStub;
}

/* ----------------------------------------------------------------- agency */

export interface AgencyTaxSettings {
  gstNumber?: string;
  defaultTaxRate: number;
  pricesIncludeTax: boolean;
  invoicePrefix: string;
}

export interface AgencyOrderSettings {
  prefix: string;
  padding: number;
  lowStockThreshold: number;
  expiryAlertDays: number;
  allowCustomerCancellation: boolean;
  cancelWindowHours: number;
  followUpDueDays: number;
  invoiceDueDays: number;
  defaultPaymentTermsDays: number;
}

export interface AgencyFeatures {
  aiEnabled: boolean;
  uploadsEnabled: boolean;
  socketEnabled: boolean;
}

/** `WEEK_DAYS` keys map to free text such as "09:00 - 18:00"; `null` means closed. */
export type BusinessHours = Record<string, string | null>;

/** Business events an agency can opt into emailing its admins about. */
export type NotificationEmailPreferences = Record<NotificationPreferenceKey, boolean>;

export interface NotificationPreferences {
  email: NotificationEmailPreferences;
  quietHoursEnabled: boolean;
  quietHoursStart?: string;
  quietHoursEnd?: string;
}

export interface AgencySettings {
  id: ID;
  name: string;
  slug: string;
  status: 'ACTIVE' | 'SUSPENDED';
  legalName?: string;
  logoUrl?: string;
  website?: string;
  description?: string;
  contact: { email: string; phone: string; address: Address };
  tax: AgencyTaxSettings;
  orderSettings: AgencyOrderSettings;
  features: AgencyFeatures;
  businessHours: BusinessHours;
  notifications: NotificationPreferences;
  createdAt?: string;
  updatedAt?: string;
}

/** `GET /public/agencies` — a name an applicant can pick at registration. */
export interface PublicAgencyOption {
  id: ID;
  name: string;
  slug: string;
  city?: string;
  state?: string;
}

/** `GET /public/agency` — never includes commercial or order settings. */
export interface AgencySummary {
  name: string;
  slug: string;
  legalName?: string;
  logoUrl?: string;
  website?: string;
  description?: string;
  contact?: { email?: string; phone?: string; address?: Address };
  tax?: { gstNumber?: string; defaultTaxRate?: number; pricesIncludeTax?: boolean };
  features?: { uploadsEnabled?: boolean; aiEnabled?: boolean };
  businessHours?: BusinessHours;
  status?: 'ACTIVE' | 'SUSPENDED';
  available?: boolean;
}

/* --------------------------------------------------------------- customers */

export interface CustomerNote {
  id?: ID;
  text: string;
  byUserId: ID;
  byRole: 'SALESMAN' | 'AGENCY_ADMIN';
  at: string;
}

export interface CustomerProfile {
  id: ID;
  businessName: string;
  ownerName: string;
  phone: string;
  alternatePhone?: string;
  email?: string;
  gstNumber?: string;
  drugLicenseNumber?: string;
  shopType?: string;
  address: Address;
  creditLimit: number;
  creditUsed: number;
  status: CustomerStatus;
  statusNote?: string;
  approvedAt?: string;
  approvedBy?: ID;
  assignedSalesmanId?: ID;
  notes?: string;
  accountNotes: CustomerNote[];
  lastContactAt?: string;
  lastContactType?: 'NOTE' | 'MESSAGE' | 'FOLLOW_UP' | 'ORDER' | 'CALL';
  /** The login account this customer record belongs to. */
  userId: ID;
  /** Populated `userId` document, when the endpoint returns one. */
  user?: UserStub;
  assignedSalesman?: SalesmanStub | null;
  /** Present when the backend exposes a last-order summary. */
  lastOrderAt?: string | null;
  lastOrderNumber?: string | null;
  orderCount?: number;
  createdAt?: string;
  updatedAt?: string;
}

export type Customer = CustomerProfile;

/* --------------------------------------------------------------- salesmen */

export interface SalesmanProfile {
  id: ID;
  employeeCode: string;
  territory?: string;
  phone?: string;
  status: SalesmanStatus;
  customerIds?: ID[];
  assignedCustomerCount: number;
  monthlyTarget?: number;
  joinedAt?: string;
  notes?: string;
  /** The account this profile belongs to. */
  userId: ID;
  /** Populated `userId` document, when the endpoint returns one. */
  user?: UserStub;
  createdAt?: string;
  updatedAt?: string;
}

export type Salesman = SalesmanProfile;

/** `POST /salesmen` may return a one-time credential. Never persisted. */
export interface SalesmanProvisioned {
  id?: ID;
  employeeCode?: string;
  userId?: ID;
  temporaryPassword?: string;
  message?: string;
}

/* ---------------------------------------------------------------- catalog */

export interface Category {
  id: ID;
  name: string;
  slug: string;
  description?: string;
  parentId?: ID;
  displayOrder: number;
  isActive: boolean;
  imageUrl?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface ProductCategoryRef {
  id?: ID;
  name?: string;
  slug?: string;
}

/**
 * Catalog product. The parallel backend release adds `genericName`,
 * `manufacturer`, `mrp` and `reorderLevel`; they are declared optional so the UI
 * also works against the current contract and simply omits empty values.
 */
export interface Product {
  id: ID;
  name: string;
  slug?: string;
  sku: string;
  brand?: string;
  genericName?: string;
  manufacturer?: string;
  description?: string;
  hsnCode?: string;
  price: number;
  mrp?: number;
  taxRate: number;
  unit: string;
  packSize?: string;
  minOrderQuantity: number;
  maxOrderQuantity?: number;
  imageUrl?: string;
  tags: string[];
  isActive: boolean;
  isFeatured: boolean;
  categoryId?: ID;
  category?: ProductCategoryRef | null;
  reorderLevel?: number;
  /** Availability summary exposed by the list endpoint when supported. */
  availability?: Availability;
  stockOnHand?: number;
  stockReserved?: number;
  stockAvailable?: number;
  createdAt?: string;
  updatedAt?: string;
}

/* -------------------------------------------------------------- inventory */

export interface InventoryRow {
  id: ID;
  productId: ID;
  product?: { id?: ID; name?: string; sku?: string; unit?: string; isActive?: boolean } | string | null;
  batchId: ID;
  batchNumber: string;
  expiryDate: string;
  location?: string;
  unitCost: number;
  quantityOnHand: number;
  quantityReserved: number;
  quantityAvailable: number;
  reorderLevel: number;
  isActive: boolean;
  isExpired: boolean;
  lastMovementAt?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface InventoryMovement {
  id: ID;
  productId: ID;
  productName?: string;
  batchId: ID;
  batchNumber: string;
  inventoryId: ID;
  type: string;
  direction: 'IN' | 'OUT';
  quantity: number;
  balanceOnHand: number;
  balanceReserved: number;
  unitCost?: number;
  referenceType?: string;
  referenceId?: ID;
  referenceNumber?: string;
  reason?: string;
  note?: string;
  actorRole?: string;
  createdAt: string;
}

export interface Batch {
  id: ID;
  productId: ID | { id?: ID; name?: string; sku?: string; unit?: string } | null;
  batchNumber: string;
  manufacturer?: string;
  mfgDate?: string;
  expiryDate: string;
  supplier?: string;
  receivedAt?: string;
  status: BatchStatus;
  note?: string;
  isExpired: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface AvailabilityLine {
  productId: ID;
  productName: string;
  sku: string;
  requested: number;
  sellable: number;
  expiredQuantity: number;
  isAvailable: boolean;
  shortfall: number;
  earliestExpiry: string | null;
  willUseBatches: Array<{ batchNumber: string; expiryDate: string; quantity: number }>;
  batches?: Array<{
    inventoryId: ID;
    batchId: ID;
    batchNumber: string;
    expiryDate: string;
    available: number;
    unitCost: number;
  }>;
}

export interface StockValidation {
  ok: boolean;
  lines: AvailabilityLine[];
}

export interface ReceiveStockResult {
  batchId: ID;
  batchNumber: string;
  inventoryId: ID;
  quantityOnHand: number;
  quantityAvailable: number;
  product?: { id?: ID; name?: string; sku?: string };
}

export interface AdjustStockResult {
  inventoryId: ID;
  quantityOnHand: number;
  quantityReserved: number;
  quantityAvailable: number;
}

/* ------------------------------------------------------------------ orders */

export interface OrderAllocation {
  batchId: ID;
  inventoryId: ID;
  batchNumber: string;
  expiryDate: string;
  quantity: number;
  committedQuantity: number;
  releasedQuantity: number;
}

export interface OrderItem {
  productId: ID;
  productName: string;
  sku: string;
  unit: string;
  quantity: number;
  unitPrice: number;
  taxRate: number;
  lineSubtotal: number;
  taxAmount: number;
  lineTotal: number;
  allocations: OrderAllocation[];
}

export interface OrderTimelineEntry {
  from: OrderStatus | null;
  to: OrderStatus;
  at: string;
  byRole?: string;
  note?: string;
}

export interface OrderPermissions {
  canCancel: boolean;
  allowedTransitions: OrderStatus[];
  allowedStatuses: OrderStatus[];
}

export interface Order {
  id: ID;
  orderNumber: string;
  orderYear: number;
  customerId: ID;
  customerName: string;
  salesmanId?: ID;
  items: OrderItem[];
  status: OrderStatus;
  statusTimestamps: Partial<Record<OrderStatus, string>>;
  timeline: OrderTimelineEntry[];
  currency: string;
  subtotal: number;
  taxTotal: number;
  grandTotal: number;
  source: OrderSource;
  allocationState: 'NONE' | 'RESERVED' | 'COMMITTED' | 'RELEASED';
  notes?: string;
  customerNotes?: string;
  requirementUploadId?: ID;
  reorderedFromOrderId?: ID;
  cancellation?: {
    reason?: string;
    at?: string;
    stockDisposition?: 'NOT_ALLOCATED' | 'RELEASED' | 'RESTORED';
  };
  invoiceId?: ID;
  deliveredAt?: string;
  createdAt?: string;
  updatedAt?: string;
  permissions?: OrderPermissions;
}

/** `POST /orders/:id/status` and `/cancel` wrappers. */
export interface OrderMutationResult {
  order: Order;
  previousStatus: OrderStatus;
  status: OrderStatus;
  stockDisposition?: 'NOT_ALLOCATED' | 'RELEASED' | 'RESTORED';
}

/** `GET /orders/:id/timeline`. */
export interface OrderTimelineResponse {
  orderId: ID;
  orderNumber: string;
  status: OrderStatus;
  statusTimestamps: Partial<Record<OrderStatus, string>>;
  timeline: OrderTimelineEntry[];
}

/* ---------------------------------------------------------------- invoices */

export interface InvoiceLine {
  productId: ID;
  productName: string;
  sku: string;
  unit: string;
  quantity: number;
  unitPrice: number;
  taxRate: number;
  taxAmount: number;
  lineTotal: number;
}

export interface InvoiceAgencySnapshot {
  name: string;
  legalName?: string;
  gstNumber?: string;
  email: string;
  phone: string;
  address: Address;
}

export interface Invoice {
  id: ID;
  invoiceNumber: string;
  invoiceYear: number;
  orderId: ID;
  orderNumber: string;
  customerId: ID;
  customerName: string;
  customerPhone?: string;
  customerGstNumber?: string;
  agencySnapshot: InvoiceAgencySnapshot;
  lines: InvoiceLine[];
  currency: string;
  subtotal: number;
  taxTotal: number;
  grandTotal: number;
  amountPaid: number;
  amountDue: number;
  status: InvoiceStatus;
  issuedAt: string;
  dueAt?: string;
  paymentTermsDays: number;
  voidedAt?: string;
  voidReason?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface Payment {
  id: ID;
  reference: string;
  invoiceId?: ID;
  invoiceNumber?: string;
  orderId?: ID;
  orderNumber?: string;
  customerId: ID | { id?: ID; businessName?: string };
  customerUserId?: ID;
  amount: number;
  method: PaymentMethod;
  paidAt: string;
  note?: string;
  recordedBy: ID;
  createdAt?: string;
}

/* ------------------------------------------------------------ requirements */

export interface RequirementFile {
  storageProvider: 'local' | 's3';
  originalName: string;
  mimeType: string;
  extension: string;
  sizeBytes: number;
  uploadedAt: string;
}

export interface ExtractedRequirementItem {
  id?: ID;
  rawText: string;
  rawQuantity?: number;
  quantity?: number;
  productId?: ID;
  productName?: string;
  sku?: string;
  confidence: number;
  needsVerification: boolean;
  reason?: string;
}

export interface RequirementExtraction {
  status: 'NOT_REQUESTED' | 'PENDING' | 'NEEDS_REVIEW' | 'COMPLETE' | 'FAILED';
  provider?: 'deterministic-csv' | 'openai-compatible';
  model?: string;
  requestedAt?: string;
  completedAt?: string;
  items: ExtractedRequirementItem[];
  errorCode?: string;
}

export interface Requirement {
  id: ID;
  customerId: ID | { id?: ID; businessName?: string } | null;
  customerUserId?: ID;
  title: string;
  notes?: string;
  file: RequirementFile;
  status: RequirementStatus;
  review?: { byUserId?: ID; at?: string; note?: string };
  extraction: RequirementExtraction;
  convertedOrderId?: ID;
  createdAt?: string;
  updatedAt?: string;
}

export interface RequirementConverted {
  order: Order;
  requirementId: ID;
  orderNumber: string;
}

/* --------------------------------------------------------------- messaging */

export interface Message {
  id: ID;
  conversationKey: string;
  senderId: ID;
  receiverId: ID;
  /** Populated only when a deployment chooses to populate participants. */
  sender?: UserStub | null;
  receiver?: UserStub | null;
  body: string;
  orderId?: ID;
  orderReference?: string;
  readAt?: string | null;
  createdAt: string;
}

export interface ConversationPartner {
  id: ID;
  name: string;
  email?: string;
  role?: string;
  avatarUrl?: string;
}

export interface Conversation {
  partner: ConversationPartner;
  conversationKey: string;
  lastMessageAt: string;
  lastBody: string;
  unreadCount: number;
}

export interface DirectoryContact {
  id: ID;
  name: string;
  email?: string;
  role: string;
}

/* -------------------------------------------------------------- follow-ups */

export interface FollowUp {
  id: ID;
  salesmanId: ID | { id?: ID; employeeCode?: string; territory?: string } | null;
  customerId: ID | { id?: ID; businessName?: string; phone?: string } | null;
  title: string;
  notes?: string;
  type: FollowUpType;
  dueAt: string;
  status: FollowUpStatus;
  completedAt?: string;
  outcome?: string;
  nextFollowUpAt?: string;
  relatedOrderId?: ID;
  createdAt?: string;
  updatedAt?: string;
}

/* ----------------------------------------------------------- notifications */

export interface AppNotification {
  id: ID;
  type: string;
  title: string;
  message: string;
  data?: Record<string, unknown>;
  entityType?: string;
  entityId?: ID;
  readAt?: string | null;
  createdAt: string;
}

/* -------------------------------------------------------- contact enquiries */

export type ContactSubmissionStatus = 'NEW' | 'IN_REVIEW' | 'CONTACTED' | 'CLOSED' | 'SPAM';

export interface ContactSubmission {
  id: ID;
  name: string;
  email: string;
  phone?: string;
  organisation?: string;
  topic: ContactTopic;
  message: string;
  status: ContactSubmissionStatus;
  notes?: string;
  handledBy?: UserStub;
  handledAt?: string;
  createdAt: string;
  updatedAt: string;
}

/* ---------------------------------------------------------------- activity */

export interface ActivityLog {
  id: ID;
  action: string;
  entity: string;
  entityId?: ID;
  summary?: string;
  meta?: Record<string, unknown>;
  actorRole?: string;
  actorUserId?: ID | UserStub | null;
  createdAt: string;
}

/* ------------------------------------------------------------------ search */

export type SearchGroupType = 'orders' | 'products' | 'batches' | 'customers' | 'invoices' | 'staff';

export interface SearchHit {
  id: ID;
  type: SearchGroupType;
  title: string;
  subtitle?: string;
  status?: string;
  value?: number;
  due?: number;
  phone?: string;
  role?: string;
  price?: number;
  unit?: string;
  date?: string;
  expiryDate?: string;
  /** Route the UI can open for this hit, derived from the group type. */
  path: string;
}

export interface SearchResponse {
  term: string;
  groups: Array<{ type: SearchGroupType; label: string; items: Array<Omit<SearchHit, 'type' | 'path'>> }>;
  total: number;
}

/* ----------------------------------------------------------------- reports */

export interface DashboardReport {
  agency: { id?: ID; name: string };
  range?: { from: string; to: string };
  scope?: string;
  /** The flat tenant-scoped counters block added by the extended report. */
  metrics?: DashboardMetrics;
  orders: {
    total: number;
    delivered: number;
    cancelled: number;
    open: number;
    revenue: number;
    taxCollected: number;
    averageOrderValue: number;
  };
  catalog: { activeProducts: number; visibleCustomers: number };
  inventory: {
    sellableUnits: number;
    stockValue: number;
    expiredUnits: number;
    expiringUnits: number;
    lowStockBatches: number;
    outOfStockBatches: number;
  };
  finance: {
    outstandingAmount: number;
    outstandingInvoices: number;
    collectedAmount: number;
    paymentsRecorded: number;
  };
  followUps: { pending: number };
  orderStatusBreakdown: Array<{ status: string; count: number; value: number }>;
  /** Flat aliases the parallel backend release may add; absent means 0/—. */
  totals?: {
    orderValue?: number;
    tax?: number;
    customers?: number;
    products?: number;
    salesmen?: number;
  };
}

/** `metrics` on the dashboard, or the equivalent root-level aliases. */
export interface DashboardMetrics {
  totalCustomers?: number;
  totalSalesmen?: number;
  totalProducts?: number;
  todayOrders?: number;
  todayDeliveredOrders?: number;
  pendingOrders?: number;
  underReviewOrders?: number;
  confirmedOrders?: number;
  processingOrders?: number;
  packedOrders?: number;
  dispatchedOrders?: number;
  deliveredOrders?: number;
  orderValue?: number;
  totalRevenue?: number;
  monthlyOrders?: number;
  monthlyRevenue?: number;
  lowStock?: number;
  outOfStock?: number;
  expiringSoon?: number;
  expired?: number;
  followUpsDue?: number;
  unpaidAmount?: number;
}

export interface DailyPoint {
  date: string;
  count: number;
  value: number;
}

export interface OrderReportRow {
  id: ID;
  orderNumber: string;
  status: string;
  customerName: string;
  itemCount: number;
  units: number;
  subtotal: number;
  taxTotal: number;
  grandTotal: number;
  createdAt: string;
  deliveredAt: string | null;
}

export interface OrdersReport {
  range: { from: string; to: string };
  totals: { count: number; units: number; value: number; tax: number };
  daily: DailyPoint[];
  orders: OrderReportRow[];
}

export interface CustomerReportRow {
  id: ID;
  businessName: string;
  city: string;
  status: string;
  orderCount: number;
  orderValue: number;
  lastOrderAt: string | null;
}

export interface CustomersReport {
  range: { from: string; to: string };
  totals: { customers: number; withOrders: number; value: number };
  byStatus: Array<{ _id: string; count: number }>;
  customers: CustomerReportRow[];
}

export interface ProductReportRow {
  id: ID;
  productName: string;
  sku: string;
  isActive: boolean;
  unitsSold: number;
  revenue: number;
  orderLines: number;
  stockOnHand: number;
  batches: number;
  stockValue: number;
  earliestExpiry: string | null;
}

export interface ProductsReport {
  range: { from: string; to: string };
  totals: { products: number; unitsSold: number; revenue: number };
  products: ProductReportRow[];
}

export interface SalesmanReportRow {
  id: ID;
  employeeCode: string;
  name: string;
  territory: string | null;
  status: string;
  assignedCustomers: number;
  orders: number;
  revenue: number;
  averageOrderValue: number;
  target: number | null;
  targetAchievement: number | null;
  customersServed: number;
  followUps: number;
  followUpsCompleted: number;
}

export interface SalesmenReport {
  range: { from: string; to: string };
  salesmen: SalesmanReportRow[];
}

export type InventoryReportStatus = 'EXPIRED' | 'OUT_OF_STOCK' | 'LOW_STOCK' | 'OK';

export interface InventoryReportItem {
  id: ID;
  productId: ID;
  productName: string;
  sku: string;
  unit: string;
  batchNumber: string;
  expiryDate: string;
  quantityOnHand: number;
  quantityReserved: number;
  quantityAvailable: number;
  stockValue: number;
  location: string | null;
  status: InventoryReportStatus;
}

export interface InventoryReport {
  generatedAt: string;
  thresholds: { lowStock: number; expiryAlertDays: number };
  totals: {
    batches: number;
    unitsOnHand: number;
    unitsAvailable: number;
    stockValue: number;
    expiredBatches: number;
    lowStockBatches: number;
    outOfStockBatches: number;
    expiringSoon: number;
  };
  items: InventoryReportItem[];
}

export type ExportType = 'orders' | 'customers' | 'products' | 'salesmen' | 'inventory' | 'invoices' | 'payments';

/* ---------------------------------------------------------------------- ai */

export interface AiStatus {
  configured: boolean;
  provider: string | null;
  model: string | null;
  enabledForAgency: boolean;
  reason: string | null;
  requirementExtraction?: {
    configured: boolean;
    deterministicCsv: true;
    humanConfirmationRequired: true;
    canCreateOrders: false;
    minConfidence: number;
    supportedFiles: string[];
  };
  disclaimer: string;
}

export interface AiAnswer {
  question: string;
  answer: string;
  model: string;
  generatedAt: string;
  dataWindow: { from: string; to: string };
  authorizedContext: unknown;
  disclaimer: string;
}

/* ----------------------------------------------------------------- contact */

/** `POST /public/contact`. The exact accepted keys are owned by the backend. */
export interface PublicContactInput {
  name: string;
  email: string;
  phone?: string;
  organisation?: string;
  topic: ContactTopic;
  message: string;
}

export interface PublicContactResult {
  message: string;
}
