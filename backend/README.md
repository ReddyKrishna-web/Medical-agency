# Supply Medicals — backend

Express + TypeScript + Mongoose + Socket.IO API for a multi-tenant medical
distribution agency. The full HTTP contract is in
[`../docs/API_CONTRACT.md`](../docs/API_CONTRACT.md); this README covers how to
run, configure and reason about the service, including the surface areas added
after the contract was first written (public contact form, product business
fields, one-time salesman credentials, flat dashboard metrics, business hours
and notification preferences). Where this README and the root contract differ,
the endpoints described below are the current ones.

---

## Quick start

```powershell
# 1. Install (from the repository root or inside backend/)
npm install

# 2. Configure
Copy-Item .env.example .env
# Generate two independent secrets, e.g.
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"

# 3. Start MongoDB (Docker is the quickest option, from the repository root)
docker compose up -d mongodb

# 4. Seed the clearly marked DEMO dataset
npm run seed

# 5. Run the API
npm run dev          # http://localhost:5000/api
```

Health check: `GET http://localhost:5000/api/health`

## Commands

| Command | Description |
| --- | --- |
| `npm run dev` | Watch-mode API with `tsx` |
| `npm run build` | Compile TypeScript to `dist/` |
| `npm start` | Run the compiled server (`dist/index.js`) |
| `npm run typecheck` | `tsc --noEmit` over `src` and `tests` |
| `npm run lint` | ESLint (flat config, typescript-eslint) |
| `npm run test` | Vitest + supertest + in-memory MongoDB |
| `npm run seed` | Development-only demo seed |

`node >= 20` is required (Node 22/24 LTS recommended).

## Environment

`backend/.env.example` mirrors the root `.env.example`. Nothing secret is
hardcoded: the app **refuses to boot** when `JWT_SECRET`/`JWT_REFRESH_SECRET` are
missing, shorter than 32 characters, identical to each other, or (in production)
still the example placeholder.

Highlights:

| Variable | Purpose |
| --- | --- |
| `MONGODB_URI` | Connection string and database name |
| `JWT_SECRET` / `JWT_REFRESH_SECRET` | Access and refresh token signing keys |
| `CLIENT_URL`, `CORS_EXTRA_ORIGINS` | Exact CORS allowlist (also used by Socket.IO) |
| `TRUST_PROXY` | Number of reverse proxies (needed for rate limiting and secure cookies) |
| `ALLOW_TRANSACTIONS` | Set to `false` only for a single-node development mongod |
| `FILE_STORAGE_CONFIG` | `local` or `s3`; see *File uploads* below |
| `AI_API_KEY` | Optional. When absent, `POST /api/ai/ask` returns `503 AI_NOT_CONFIGURED` |
| `EMAIL_CONFIG` | `console` (logs the message), `smtp` (real delivery) or `disabled` |

## Public contact endpoint

`POST /api/public/contact` is the website enquiry form. It is **public** (no
authentication), rate limited to 10 submissions per hour per IP, and validated.

```http
POST /api/public/contact
{
  "name": "Ananya Rao",
  "email": "ananya@buyer.example",
  "phone": "+91 98800 11223",
  "organisation": "Rao Chemist Shop",
  "topic": "PRICING_REQUEST",
  "message": "Please share your wholesale price list."
}
```

* The response is a **generic acknowledgement only**:
  `{ "success": true, "data": { "message": "Thank you. Your enquiry has been received..." } }`.
  No stored value is echoed back, so the endpoint cannot be used to probe
  whether an address is already known to the agency.
* **No account is created.** There is no `User`, no `Customer`, no session and
  no password. Only the contact fields a visitor supplied are stored, in the
  tenant-aware `ContactSubmission` collection.
* The submission is assigned to the **single active agency**. If more than one
  agency is `ACTIVE` the request is refused with `400` rather than attributed to
  a guess — a multi-tenant deployment must serve per-tenant public sites.
* Active agency admins receive an in-app notification, and a `contact.submit`
  activity entry is recorded (organisation and topic only, never the message
  body). **No email is sent** — there is no mail integration on this path.

Agency staff manage the inbox with `GET /api/contact-submissions`,
`GET|PATCH|DELETE /api/contact-submissions/:id` (admin/salesman read, admin
write). The list is tenant-scoped; a cross-tenant id returns `404`.

## Product catalogue fields

A product carries the fields a pharmacy actually orders by:

| Field | Notes |
| --- | --- |
| `name` | Trade name |
| `brand` | Marketing brand |
| `genericName` | Salt composition, e.g. `Amoxicillin` |
| `manufacturer` | Manufacturing company, e.g. `Sun Pharma` |
| `sku` | Business product code, unique per agency |
| `mrp` | Listed maximum retail price. **Informational only** |
| `price` | **Authoritative selling price** (server owned) |
| `taxRate` | Percentage |
| `packSize` | e.g. `10 tablets` |
| `reorderLevel` | Catalogue restock trigger |
| `unit` | `BOX`, `STRIP`, `PIECE`, … |

`mrp` may not be lower than `price` (enforced on create and on the merged
document during a partial update). `price` remains the only value that drives
order pricing — `mrp` is never used to compute a total.

`GET /api/products` accepts `search` (matches name, SKU, brand, **generic name**,
**manufacturer** and description), `brand`, `manufacturer` and `availability`.

`availability` is `IN_STOCK`, `LOW_STOCK` or `OUT_OF_STOCK`, derived from **real
nonexpired inventory** (`quantityOnHand - quantityReserved`, expired batches
excluded) and classified against the agency's `lowStockThreshold`. It is
tenant-scoped and paginated. A product with no live inventory rows counts as
`OUT_OF_STOCK`.

## One-time salesman credentials

`POST /api/salesmen` takes an **optional** `password`:

* **Omitted** (recommended) — the server generates a 14-character password from
  a CSPRNG (rejection sampling, no modulo bias, ambiguous glyphs `O 0 I l 1`
  excluded), hashes it with bcrypt, sets `mustChangePassword: true`, and returns
  the plaintext **exactly once** as `temporaryPassword`. It is never stored, never
  logged and never returned again — the list and detail endpoints are verified to
  exclude it.
* **Supplied** — the admin's password is hashed as before and nothing is echoed
  back.

Either way the account is created with `mustChangePassword: true`, so the
salesman must replace the credential at first sign-in. An admin never has to
invent or reuse a secret to onboard staff.

## Dashboard metrics

`GET /api/reports/dashboard` returns the existing rich nested report
(`orders`, `catalog`, `inventory`, `finance`, `followUps`,
`orderStatusBreakdown`) **plus** a flat `metrics` object the UI can bind
directly to stat tiles:

`totalCustomers`, `totalSalesmen`, `totalProducts`, `todayOrders`,
`pendingOrders`, `underReviewOrders`, `confirmedOrders`, `processingOrders`,
`packedOrders`, `dispatchedOrders`, `deliveredOrders`, `todayDeliveredOrders`,
`orderValue` / `totalRevenue`, `monthlyOrders`, `monthlyRevenue`, `lowStock`,
`outOfStock`, `expiringSoon`, `expired`, `followUpsDue`, `unpaidAmount`.

Every value comes from a real MongoDB aggregation or count against the caller's
tenant — nothing is estimated, cached or fabricated. Role scoping is preserved:
a customer sees only their own customers/orders, a salesman only their assigned
customers. `lowStock`/`outOfStock` are **product**-level (the `inventory` block
keeps the batch-level view), and `expiringSoon`/`expired` are batch counts
bounded by the agency's `expiryAlertDays`.

## Agency settings

`GET`/`PATCH /api/settings` (admin) exposes the full tenant configuration:
contact, tax (GST number, default rate, invoice prefix), order settings (prefix,
padding, low-stock threshold, expiry alert days, cancellation window, follow-up
and payment terms), feature flags, **business hours** and **notification
preferences**.

```http
PATCH /api/settings
{
  "businessHours": {
    "MONDAY": "09:00 - 13:00, 16:00 - 20:00",
    "SATURDAY": "09:30 - 14:00",
    "SUNDAY": ""
  },
  "notifications": {
    "email": { "newOrder": false, "contactSubmission": true },
    "quietHoursEnabled": true,
    "quietHoursStart": "21:30",
    "quietHoursEnd": "07:00"
  }
}
```

Business hours are free text per weekday; an empty string clears a day to
`null`. Notification toggles are a partial patch, so unspecified keys keep their
stored value. `GET /api/public/agency` publishes `businessHours` and the safe
contact/tax/feature fields only — `orderSettings` and `notifications` stay
private.

> **Honest limitation:** business hours and notification preferences are
> persisted, validated and exposed, but they are **not yet consulted by the
> notification dispatcher or order placement**. In-app notifications are still
> always sent. Wiring the toggles into dispatch is follow-up work, not something
> this repository currently does — the settings are storage, not behaviour.

## Demo seed

`npm run seed` is **development only** and refuses to run when
`NODE_ENV=production`. Everything it writes is marked `DEMO` and every write is an
upsert keyed on a stable natural key (agency slug, user email, product SKU,
batch number), so re-running it is safe and never duplicates data.

Printed credentials (also documented here; override with `SEED_*_PASSWORD`):

| Role | Email | Password |
| --- | --- | --- |
| `AGENCY_ADMIN` | `admin@demo.supplymedicals.test` | `AdmDemo1!` |
| `SALESMAN` | `salesman@demo.supplymedicals.test` | `SlsDemo1!` |
| `CUSTOMER` (approved) | `owner@demo.supplymedicals.test` | `CstDemo1!` |
| `CUSTOMER` (approved) | `citycare@demo.supplymedicals.test` | `CityDemo1!` |
| `CUSTOMER` (pending) | `pending@demo.supplymedicals.test` | `PendDemo1!` |

The three demo customer records are **Sri Sai Medicals** (approved), **City Care Medicals** (approved), and **Lakshmi Pharmacy** (pending approval). All names and records are prefixed `DEMO` in the database.

Passwords are stored only as bcrypt hashes. The pending customer cannot sign in
until an admin approves it:

```http
POST /api/customers/:id/status   { "status": "APPROVED" }
```

## MongoDB transactions and standalone development

**This is the most important operational caveat.**

A production deployment should run MongoDB as a replica set (or a sharded
cluster) so that multi-document transactions are available. The backend probes
this at startup and reports the result in `GET /api/health`:

```json
{ "database": { "connected": true, "transactions": true } }
```

### With transactions (replica set / sharded)

`reserveStock`, `commitStock`, `releaseStock` and `returnStock` run inside
`session.withTransaction`, so a confirmation or deduction is atomic across the
order, every inventory row and every stock movement.

### Without transactions (single-node standalone mongod)

A standalone server cannot start a transaction. The backend then logs

```
WARN MongoDB transactions unavailable; using compensated saga for stock safety
```

and switches to a documented saga that preserves the same safety properties:

1. **Conditional updates instead of locks.** Every reservation and deduction is a
   single `findOneAndUpdate` whose filter carries the invariant
   (`quantityOnHand - quantityReserved >= take`, `expiryDate > now`,
   `quantityOnHand >= take`). A concurrent writer that loses the race simply
   matches zero documents — there is no read-then-write window to lose.
2. **All-or-nothing allocation.** The FEFO plan is checked for *every* line
   before anything is written. If any line is short, the request fails with
   `409 INSUFFICIENT_STOCK` and nothing is reserved.
3. **Compensation.** If a later line fails after earlier lines were reserved, each
   reservation taken by that request is released again and a compensating
   `RELEASE` movement is recorded, so a failed order never leaves stock stranded.
   The same applies to a failed deduction (`SALE_REVERSAL`).
4. **Physical stock never goes negative.** Reservations do not touch
   `quantityOnHand`; deductions are conditional on enough unreserved stock, and
   manual adjustments are rejected when they would go below zero.
5. **Auditability.** Every reserve, deduct, release, return and adjustment writes
   a `StockMovement` with the resulting balances, so a standalone deployment can
   be reconciled after the fact.

The trade-offs that remain on a standalone server are crash-window and isolation
level related: if the process dies between the reservation writes and the
compensating release, reservations can be left behind. Recover them with the
movements audit (`GET /api/inventory/movements?type=RESERVE`) and the order's
`allocationState` field (`RESERVED` orders with no live order activity).
**For a real trading deployment, use a replica set and exercise concurrency,
reservation recovery and invoice numbering under production-like load before
go-live.**

`ALLOW_TRANSACTIONS=false` forces the saga path even on a replica set, which is
useful for testing that path explicitly.

## Order lifecycle

```
PENDING -> UNDER_REVIEW -> CONFIRMED -> PROCESSING -> PACKED -> DISPATCHED -> DELIVERED
   |            |             |             |          |            |
   +------------+-------------+-------------+----------+------------+--> CANCELLED
```

* `CONFIRMED` performs the FEFO allocation and stores the per-batch allocation on
  each order line.
* `PROCESSING` commits the allocation: physical stock is deducted and the
  reservation is released.
* `CANCELLED` before processing releases reservations; cancelling a committed
  order (admin only) returns physical stock as `RETURN` and voids the invoice.
* `DELIVERED` generates the invoice (`INV-<year>-<sequence>`) and refuses to
  create a second one thanks to a unique `(agencyId, orderId)` index.
* Customers may only cancel in `PENDING`, `UNDER_REVIEW` or `CONFIRMED` and can
  never mark an order delivered; fulfilment stages are agency-only.
* Order numbers are `SM-2026-000001`: an atomic upsert-increment on a
  `(agencyId, key, year)` counter with a unique index, so two concurrent creates
  can never receive the same number.

## Realtime (Socket.IO)

The client sends the access token in `socket.handshake.auth.token`. A socket is
authenticated against the database record (not just the signature) and joins only
`user:<userId>` and `agency:<agencyId>`. Events: `order.created`,
`order.updated`, `message.created`, `notification.created`, `inventory.alert`.
Messages and notifications are persisted before they are emitted, and only
already-authorized, minimal projections are sent. CORS uses the same allowlist as
HTTP.

## File uploads

`FILE_STORAGE_CONFIG=local` writes to `LOCAL_STORAGE_PATH` (default
`./storage/uploads`), which is outside any served directory; the API never serves
that path statically. `FILE_STORAGE_CONFIG=s3` uses the optional
`@aws-sdk/client-s3` dependency against a private bucket.

Accepted types are **PDF, PNG, JPEG, XLSX and CSV** only. Validation checks the
extension, the declared MIME type *and* the magic bytes (an executable renamed to
`.pdf` is rejected with `415 UNSUPPORTED_MEDIA_TYPE`). Files are stored under a
random UUID key and served only through the authorised download endpoint.

## AI

`GET /api/ai/status` reports whether a provider is configured. `POST /api/ai/ask`
returns **503 `AI_NOT_CONFIGURED`** when `AI_API_KEY` is absent — the server never
invents analysis. When configured, the request is answered from aggregates that
were already filtered to the caller's authorised tenant scope, and the answer is
returned with the exact context that was sent plus a disclaimer. AI output is
advisory and can never create or submit an order.

## Testing

```powershell
npm test
```

The suite runs on `mongodb-memory-server` (a single-node **replica set**, so the
transaction path is exercised) started and stopped per test file — no local
MongoDB is required, and the first run downloads the mongod binary once.

| File | Coverage |
| --- | --- |
| `tests/auth.test.ts` | registration always creates a pending customer, no role self-selection, HttpOnly refresh cookie, rotation + reuse detection, no user enumeration on forgot-password, logout, bearer-token enforcement |
| `tests/tenant-isolation.test.ts` | cross-tenant reads return 404, search/report scoping, salesman limited to assigned customers, writes stay inside the caller's tenant |
| `tests/rbac.test.ts` | admin-only endpoints, customer messaging rules, follow-up ownership, catalogue visibility, export permissions |
| `tests/order-lifecycle.test.ts` | server pricing, sequential numbers, invalid quantities, guarded transitions, FEFO reservation, commit, release/restore policies, invoice on delivery, reorder, idempotency |
| `tests/inventory.test.ts` | no oversell, compensation of partial allocations, concurrent reservations, expired stock never sellable, no negative balances, movements audit |
| `tests/platform.test.ts` | health, structured 404, requirement upload/download authorisation, magic-byte rejection, requirement→order conversion, database-derived dashboard, CSV export, payments, notifications, messages, AI not-configured, settings, activity |
| `tests/socket.test.ts` | handshake authentication, room membership, rejection of missing/invalid tokens, persist-then-emit, REST on the same server |
| `tests/seed.test.ts` | deterministic, upsert-safe demo data shape and a pending customer that cannot sign in |
| `tests/integration-gaps.test.ts` | public contact endpoint (validation, tenant assignment, no account created, tenant-scoped inbox), one-time salesman credentials (absence from list/detail, uniqueness, policy compliance), product business fields/facets/availability/search, flat dashboard metrics, settings business hours and notification preferences, `id`/`_id` DTO shape |

Test accounts use the `@test.local` domain and exist only in the in-memory
database.

## Scope and honest limitations

What this service **is**: a tenant-isolated B2B API with server-authoritative
pricing, a guarded order state machine, FEFO stock handling, and tests that
exercise those invariants against a real MongoDB replica set.

What it **is not** — stated plainly so nothing is over-claimed:

* **No regulatory certification.** Nothing here is audited, certified or
  compliant with HIPAA, GDPR, PCI-DSS, ISO 27001, MDR/ISO 13485 or any other
  regime. Encryption at rest, backups, retention policy, breach response and
  access reviews are deployment responsibilities that this repository does not
  implement or verify.
* **No penetration test or external security review** has been performed. The
  security properties described in this README are design properties backed by
  the test suite, not third-party assurance.
* **`npm audit` is clean for production dependencies** (`npm audit --omit=dev`).
  Remaining advisories are in the dev toolchain (`vitest` → `vite`/`esbuild`);
  clearing them requires a `vitest@5` major upgrade, which is a separate,
  independently reviewed change.
* **Email is optional and never faked.** With `EMAIL_CONFIG=console` messages
  are written to the log; with `disabled` they are dropped. There is no
  "integration" that pretends to deliver. `POST /api/public/contact` sends no
  email in any mode.
* **The AI endpoints require a real provider.** Without `AI_API_KEY` they return
  `503 AI_NOT_CONFIGURED`; the server never invents analysis.
* **The public contact form targets a single-agency deployment.** With more
  than one `ACTIVE` agency it returns `400` instead of guessing a tenant.
* **Reporting is capped.** Orders, customers, products and inventory reports
  materialise at most 500–2000 rows; totals are computed over that page, not
  the whole history.
* **Stock classification is instantaneous.** `availability`, `lowStock` and
  `outOfStock` reflect the database at request time and do not model incoming
  purchase orders.
* **Business hours and notification preferences are stored, not enforced.** See
  the note under *Agency settings*.

## Project layout

```text
src/
├── app.ts                  Express app factory (helmet, cors, compression, parsers, logging)
├── index.ts                bootstrap: db → http → socket.io → scheduler, graceful shutdown
├── config/                 env schema (zod), mongoose connection + transaction probe
├── constants/              roles, statuses, transition map
├── controllers/            thin HTTP handlers
├── middleware/             auth, rbac, validation, sanitisation, rate limits, uploads, idempotency, errors
├── models/                 one file per collection + tenant plugin
├── routes/                 /api route modules
├── services/               business logic (stock, orders, invoices, reports, AI, storage)
├── sockets/                Socket.IO server, handshake auth, emitters
├── jobs/                   expiry sweep scheduler
├── seed/                   development seed
├── utils/                  errors, logger, response envelope, pagination, tenant helpers, CSV
└── validators/             zod request schemas
```

## Operational notes

* **Health**: `GET /api/health` reports status, database connectivity, whether
  transactions are available and the reason when they are not.
* **404/500**: every failure returns
  `{ "success": false, "error": { "code", "message", "details?" } }`; internal
  errors are logged, never leaked.
* **Rate limits**: global, auth (stricter, skips successful logins), writes and
  uploads. Tune with `RATE_LIMIT_MAX` / `AUTH_RATE_LIMIT_MAX` and set
  `TRUST_PROXY` when running behind a load balancer.
* **Graceful shutdown**: `SIGTERM`/`SIGINT` stop the scheduler, close Socket.IO,
  drain the HTTP server and close MongoDB, with a 15 second force-exit guard.
* **Logging**: structured JSON in production, readable lines in development, with
  passwords, tokens and API keys redacted.
* **Indexes**: created automatically outside production; in production they are
  synchronised explicitly at boot.
