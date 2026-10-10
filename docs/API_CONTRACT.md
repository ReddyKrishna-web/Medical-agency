# Supply Medicals API contract

All routes are under `/api`, use JSON unless noted, and return either `{ success: true, data }` or `{ success: true, data, meta }`. Errors use `{ success: false, error: { code, message, details? } }`. Mutating requests that act as the current actor use `POST`, not PUT. Access JWT is returned as `data.accessToken`; the refresh token is an HttpOnly cookie.

Authenticated requests use `Authorization: Bearer <accessToken>`. List endpoints support `page`, `limit`, `search`, `sort`, and role-specific filters.

## Auth
- `POST /auth/register` public customer registration
- `POST /auth/login`
- `POST /auth/refresh`
- `POST /auth/logout`
- `GET /auth/me`
- `POST /auth/forgot-password`
- `POST /auth/reset-password`
- `PATCH /auth/profile`
- `PATCH /auth/password`

## Settings/public
- `GET /public/agency` (safe public contact/business fields only)
- `POST /public/contact` `{name,email,phone?,organisation,topic,message}` (rate-limited business enquiry; never a clinical/patient-data channel)
- `GET /health`

## Customers, salesmen, users
- `GET/POST /customers` (admin list/create; salesman list assigned)
- `GET/PATCH /customers/:id`
- `POST /customers/:id/status` (admin approve/reject/activate/disable)
- `GET /salesmen` (admin; salesman may list only self)
- `POST /salesmen` (admin; when `password` is omitted, the service generates a strong temporary password, hashes it, forces a change, and returns `temporaryPassword` exactly once)
- `GET/PATCH /salesmen/:id`
- `POST /salesmen/:id/status`
- `POST /salesmen/:id/assign-customers` (admin)

## Catalog
- `GET/POST /products` (authenticated list; admin create). Product fields include `name`, `genericName`, `brand`, `manufacturer`, `sku` (public product code), `categoryId`, `packSize`, `unit`, `imageUrl`, authoritative `price` (business price), `mrp`, `taxRate`, `reorderLevel`, `minOrderQuantity`, `maxOrderQuantity`, `isActive`, and optional tags. List filters include `search`, `categoryId`, `brand`, `manufacturer`, and `availability` (`IN_STOCK`, `LOW_STOCK`, `OUT_OF_STOCK`).
- `GET/PATCH/DELETE /products/:id` (admin mutation; delete is a safe archive)
- `GET/POST /categories` and admin `PATCH /categories/:id`

## Inventory and batches
- `GET /inventory` with lowStock/outOfStock/expiring/expired filters
- `POST /inventory/batches` receive stock
- `POST /inventory/adjust` signed adjustment
- `GET /inventory/movements`
- `GET/POST/PATCH /batches` and `PATCH /batches/:id`
- `POST /inventory/validate` validates proposed order against sellable batch stock

## Orders, invoice, payment
- `GET/POST /orders`
- `GET /orders/:id`
- `POST /orders/reorder` (creates a new order from a source order; history is never modified)
- `POST /orders/:id/status`
- `POST /orders/:id/cancel`
- `GET /invoices`, `GET /invoices/:id`
- `GET /payments`, `POST /payments` (admin record only)
- `GET /orders/:id/timeline`

Order create body: `{ customerId?, notes?, items:[{productId,quantity}] }`. Server resolves tenant-visible customer, prices, tax, totals, source, and order number. The current customer can only order for self. Salesman can order only for assigned active customers. Never accept client price/tax as authoritative.

Lifecycle: PENDING -> UNDER_REVIEW -> CONFIRMED -> PROCESSING -> PACKED -> DISPATCHED -> DELIVERED. Allowed side transitions are explicitly encoded server-side; customers may cancel only PENDING/UNDER_REVIEW/CONFIRMED. Inventory is allocated atomically on confirmation and committed on processing with movements. Delivered creates an invoice.

## Requirements
- `GET/POST /requirements` (customer uploads; multipart field `file`)
- `GET /requirements/:id`, `GET /requirements/:id/file`
- `POST /requirements/:id/status`
- `POST /requirements/:id/convert-order` (admin/salesman; body items)

## Messaging
- `GET /messages?conversationWith=...`
- `POST /messages` `{ receiverId, body, orderReference? }`
- `POST /messages/read`
- `GET /conversations`

## Follow-ups
- `GET/POST /follow-ups`
- `GET/PATCH /follow-ups/:id`
- `POST /follow-ups/:id/status`

## Notifications/search/reports/AI/activity
- `GET /notifications`, `POST /notifications/read`
- `GET /search?q=...`
- `GET /reports/dashboard`
- `GET /reports/orders`
- `GET /reports/customers`
- `GET /reports/products`
- `GET /reports/salesmen`
- `GET /reports/inventory`
- `GET /reports/export?type=...&format=csv` (real exports)
- `GET /ai/status`
- `POST /ai/ask` (tenant-authorized natural-language reporting; explicit not-configured response if absent)
- `GET /activity`

## Settings
- admin: `GET/PATCH /settings` for public identity, nested `contact`, `tax`, `orderSettings`, `features`, `businessHours`, and `notificationPreferences`
- customer: `GET /invoices`, `GET /notifications`, own profile

## Socket.IO
The access token is sent in `socket.handshake.auth.token`. Authenticated sockets join `user:<userId>` and `agency:<agencyId>` rooms. Persist messages before emitting. Event names:
- `order.created` with `{ order }`
- `order.updated` with `{ order, previousStatus, status }`
- `message.created` with `{ message }`
- `notification.created` with `{ notification }`
- `inventory.alert` with alert records

Clients subscribe to notifications and update query caches. Server remains source of truth and emits only tenant-authorized minimal records.
