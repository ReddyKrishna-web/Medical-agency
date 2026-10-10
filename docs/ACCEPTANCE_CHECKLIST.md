# Supply Medicals release acceptance checklist

This checklist is completed against a running environment; source presence alone is not acceptance. Record the build, environment, tester, date, and evidence for each item.

## Public and authentication
- [ ] Public landing, about, solutions, features, and contact pages load on mobile and desktop
- [ ] SEO metadata, semantic content, robots file, and sitemap are served
- [ ] Pending customer registration succeeds and does not create a privileged user
- [ ] Login, refresh, logout, reset request, reset, and expired-session handling work
- [ ] Customer, salesman, and admin receive only their role landing route
- [ ] Direct unauthorized route/API access returns 403 without leaking data

## Customer workflow
- [ ] Approved customer sees only their profile, orders, invoices, messages, uploads, and notifications
- [ ] Catalog search/filter/pagination and availability use backend data
- [ ] Bulk order persists server-priced items and produces a unique agency order number
- [ ] Reorder creates a new draft/order and never mutates history
- [ ] Allowed upload types succeed; spoofed, oversized, and unauthorized files fail
- [ ] Order timeline changes from Socket.IO and remains correct after REST refresh
- [ ] Customer cannot perform agency-only status transitions or mark delivery

## Salesman workflow
- [ ] Salesman sees only assigned active customers and their downstream orders
- [ ] Salesman-created order records `SALESMAN` source and is visible to the selected customer
- [ ] Follow-up create/reschedule/complete persists and appears in due views
- [ ] Call, message, create-order, and customer-note actions are functional
- [ ] Mobile bottom navigation supports Orders, Customers, Create Order, Follow-ups, and Messages

## Agency workflow
- [ ] Admin approves/rejects registration, creates/edits/deactivates salesmen, and assigns customers
- [ ] Product, category, batch, stock receipt, and adjustment workflows persist and audit
- [ ] Multiple batches display, expired stock is not sellable, and stock cannot become negative
- [ ] Every guarded order transition works and invalid transitions are rejected
- [ ] Delivered order creates the correct tenant-scoped invoice
- [ ] Dashboard and reports contain only authorized database aggregates
- [ ] Requirements can be reviewed, downloaded by authorized staff, and converted only after human selection
- [ ] Settings control agency identity, order prefix, low-stock threshold, and expiry warning days

## Realtime and communication
- [ ] Customer order reaches admin and assigned salesman without refresh
- [ ] Agency status update reaches the customer without refresh
- [ ] Text message persists, unread/read state works, and tenant-isolated participants cannot message/read it
- [ ] Notification types are persisted and read state is synchronized
- [ ] Disconnect/reconnect does not lose persisted records or duplicate orders

## Infrastructure and quality
- [ ] Typecheck, unit/integration tests, lint, and production build pass
- [ ] MongoDB indexes exist and common queries are measured
- [ ] CORS, Helmet headers, rate limits, validation, upload controls, and audit logs are verified
- [ ] Cross-customer and cross-agency access tests fail closed
- [ ] Production uses HTTPS, exact origins, secure cookies, private storage, backups, and replica-set MongoDB
- [ ] AI is disabled with a clear state when unconfigured; configured output cannot auto-submit an order
- [ ] Invoice wording, privacy/terms, retention, and tax/statutory behavior are reviewed by the business owner
