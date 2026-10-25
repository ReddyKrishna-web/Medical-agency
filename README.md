# Supply Medicals

**Smart B2B Medical Distribution & Business Operations Platform**

Supply Medicals connects a medical distribution agency, its salesmen, and medical-shop customers in one tenant-isolated system. It covers customer approval, product ordering, batch-aware inventory, order fulfilment, invoicing, payments, requirements, follow-ups, real-time communication, and database-backed business reporting.

> This is an operations platform. It does not diagnose patients, recommend treatment, or make medical decisions.

## What is included

- Premium responsive public website and SEO basics
- Customer self-registration with agency approval
- Exactly three operational roles: `CUSTOMER`, `SALESMAN`, `AGENCY_ADMIN`
- Multi-tenant Mongoose data model with backend-enforced agency scoping
- JWT access tokens and rotating HttpOnly refresh cookies
- Product catalog, bulk order creation, reordering, and guarded order lifecycle
- Multiple batches, expiry-aware FEFO allocation, and non-negative stock movements
- Salesman CRM and follow-up workflow
- PDF/image/Excel/CSV requirement uploads with a storage abstraction
- Persisted real-time chat, order events, and notifications through Socket.IO
- Invoices, optional payment recording, activity logs, global search, and reports
- Optional, clearly gated AI business-query integration; no fabricated responses
- Responsive customer, salesman, and agency-admin workspaces
- Development-only seed data and integration/security tests

## Architecture

```text
frontend/  React + TypeScript + Vite + Tailwind + TanStack Query
backend/   Express + TypeScript + Mongoose + Socket.IO + Zod
MongoDB    Operational source of truth
storage/   Local development files or pluggable S3-compatible storage
```

The API is described in [`docs/API_CONTRACT.md`](docs/API_CONTRACT.md). Business entities carry an `agencyId`; resource policies are enforced by backend middleware/services rather than by hidden UI controls.

## Prerequisites

- Node.js 20 or newer (Node 22/24 LTS recommended)
- npm 10 or newer
- MongoDB 7/8, either local or hosted
- Optional: an S3-compatible bucket
- Optional: an AI provider API key
- Optional: SMTP credentials for password reset and approval email

## Quick start

1. Install dependencies:

   ```powershell
   npm install
   ```

2. Copy environment templates:

   ```powershell
   Copy-Item .env.example .env
   Copy-Item backend/.env.example backend/.env
   Copy-Item frontend/.env.example frontend/.env.local
   ```

3. Replace both JWT secrets with independent random values. Never use the example values in production.

4. Start MongoDB. With Docker Desktop:

   ```powershell
   docker compose up -d mongodb
   ```

   Or point `MONGODB_URI` at an existing MongoDB deployment.

5. Seed the clearly marked development dataset:

   ```powershell
   npm run seed
   ```

   Generated demo credentials are printed to the development console and documented in `backend/README.md`. Do not use them in production.

6. Start both applications:

   ```powershell
   npm run dev
   ```

7. Open:

   - Web: `http://localhost:5173`
   - API health: `http://localhost:5000/api/health`

## Workspace commands

```powershell
npm run dev          # backend + frontend
npm run build        # production builds
npm run typecheck    # TypeScript checks in both workspaces
npm test             # backend and frontend tests
npm run lint         # lint both workspaces
npm run seed         # development seed
```

Individual commands can also be run with `npm run <script> -w backend` or `-w frontend` when supported by that workspace.

## Environment configuration

The root [`.env.example`](.env.example) documents the full configuration. Important values:

| Variable | Purpose |
| --- | --- |
| `MONGODB_URI` | MongoDB connection and database name |
| `JWT_SECRET` | Signs short-lived access tokens |
| `JWT_REFRESH_SECRET` | Signs rotating refresh tokens |
| `CLIENT_URL` / `SERVER_URL` | CORS, links, and Socket.IO origins |
| `FILE_STORAGE_CONFIG` | `local` or `s3` |
| `LOCAL_STORAGE_PATH` | Private development upload directory |
| `S3_*` | S3-compatible private bucket settings |
| `AI_API_KEY` / `AI_API_BASE_URL` / `AI_MODEL` | Optional authorized business AI |
| `EMAIL_CONFIG` / `SMTP_*` | Optional transactional email |

The frontend reads only `VITE_API_URL` and `VITE_SOCKET_URL`. No privileged secret belongs in a `VITE_*` variable.

A migration from MongoDB to **Supabase** (PostgreSQL for application data, Supabase Auth for credentials) is in progress. Phase 1 adds the Prisma schema, Supabase clients and readiness tooling; the running API still uses MongoDB until the auth cutover is applied. See [`docs/SUPABASE_MIGRATION.md`](docs/SUPABASE_MIGRATION.md) for the required variables, migration commands and remaining phases.

## Database and tenant design

- `Agency` is the tenant boundary and owns configuration/counters.
- `User` stores authentication and role data, never plaintext passwords.
- Customer and salesman business profiles reference their tenant user and agency.
- Products, categories, batches, inventory, movements, orders, invoices, payments, messages, notifications, requirements, follow-ups, and activity are agency-scoped.
- Composite indexes begin with `agencyId` for common tenant operations.
- Password reset tokens are stored as hashes and expire.
- Every protected query includes the authenticated actor's tenant; IDs alone are not authorization.
- Salesmen are limited to assigned customers and downstream records; customers are limited to their own records.

### MongoDB transactions and standalone development

A production MongoDB deployment should be a replica set so order/inventory work can use multi-document transactions. A single-node MongoDB server can support the app in development, but cannot provide transaction guarantees. The backend uses explicit allocation/consumption safeguards and compensating movement behavior for standalone operation. Validate the exact reservation policy against the target deployment before launch and use transactions there.

## Order and inventory safety

1. The server resolves active products and authoritative prices/tax; browser totals are never trusted.
2. It validates integer quantities and all-or-nothing stock availability across nonexpired batches.
3. It allocates batches by earliest expiry (FEFO).
4. A guarded state machine controls `PENDING → UNDER_REVIEW → CONFIRMED → PROCESSING → PACKED → DISPATCHED → DELIVERED`.
5. Customers can cancel only in the explicitly allowed early states; customers cannot mark orders delivered.
6. Every stock change creates a `StockMovement` and activity/audit event.
7. Expired inventory is excluded from sellable stock and conditional updates prevent negative balances.
8. A delivered order creates an invoice record.

Concurrency, reservation recovery, and invoice numbering should be exercised under production-like replica-set load before the first real trading day.

## Real-time configuration

The web client connects to `VITE_SOCKET_URL` and sends the short-lived access token in Socket.IO handshake authentication. The server authenticates the socket and joins only `user:<id>` and `agency:<agencyId>` rooms.

Key events:

- `order.created`
- `order.updated`
- `message.created`
- `notification.created`
- `inventory.alert`

Messages and notifications are persisted before emission. Query caches are invalidated by the client. REST refetching remains available if the socket disconnects.

For a same-origin reverse proxy, route `/socket.io` to the backend. In a split deployment, set `VITE_SOCKET_URL` to the public backend origin and include that origin in backend CORS configuration.

## File storage

Allowed requirement types are PDF, JPEG, PNG, XLSX, and CSV with server-enforced size limits. Files are stored with random names outside the public web root and served only through authorized download endpoints.

- `FILE_STORAGE_CONFIG=local` is intended for development or a persistent private server volume.
- `FILE_STORAGE_CONFIG=s3` uses an S3-compatible object store; the bucket must remain private.
- For regulated or public deployments, add malware scanning, retention rules, backups, and access auditing before enabling uploads.

Product images can use the same abstraction; public product images may use a separate CDN policy.

## AI integration

`GET /api/ai/status` reports whether business AI is configured. `POST /api/ai/ask` uses the authenticated agency scope. If `AI_API_KEY` is absent, the server returns an explicit configuration-required response—never invented analysis. AI output is advisory, may cite authorized report data, and can never submit an order without a user reviewing and confirming a new order.

OCR/document extraction is an optional provider boundary. Human verification is mandatory for low confidence or ambiguous product/quantity matches.

## Invoices and payments

Invoice records and browser print views are included. Payment recording is an internal ledger, not an online payment gateway. Tax-compliant invoices, statutory numbering, credit notes, and jurisdiction-specific rules require review by the agency's accountant/legal adviser before production claims are made.

## Testing and quality checks

Run:

```powershell
npm run typecheck
npm test
npm run build
npm run lint
npm run verify
```

Backend integration tests use an isolated in-memory MongoDB and cover authentication, authorization, tenant isolation, invalid input, order workflows, transitions, and stock safety. Frontend tests cover utilities, payload/adapter behavior, and role-route guards.

A live read-only API smoke test can be run against a running development server by supplying development-only credentials in the shell/environment:

```powershell
$env:SMOKE_ADMIN_EMAIL = "..."
$env:SMOKE_ADMIN_PASSWORD = "..."
$env:SMOKE_SALESMAN_EMAIL = "..."
$env:SMOKE_SALESMAN_PASSWORD = "..."
$env:SMOKE_CUSTOMER_EMAIL = "..."
$env:SMOKE_CUSTOMER_PASSWORD = "..."
npm run smoke
```

Set `SMOKE_ALLOW_MUTATION=true` only for a disposable development database. The mutating check creates a real priced order, creates a salesman-sourced order, and verifies that a customer cannot self-deliver. Cross-tenant tests remain part of the isolated automated backend suite.

Frontend production SEO generation requires a real public origin:

```powershell
$env:SITE_URL = "https://your-real-domain.example"
npm run build -w frontend
```

Do not use an example domain in an actual deployment.

## Production build and deployment

1. Set production environment values in the deployment platform; do not commit `.env`.
2. Use a MongoDB replica set with backups, authentication, private networking, and monitoring.
3. Build with `npm run build`.
4. Run the backend compiled entry point with `npm start -w backend`.
5. Serve the frontend `dist` directory through a static host/CDN with SPA fallback to `index.html`.
6. Configure HTTPS, exact CORS origins, secure cookies, reverse-proxy WebSocket support, and persistent private storage.
7. Back up the database and object store; define log retention and incident response.
8. Run migrations/index creation, seed only a controlled bootstrap admin in a non-production-safe way, then smoke-test each role.
9. Have the agency owner review branding, contact information, invoice language, privacy/terms, retention, and local medical-distribution regulations.

## Repository layout

```text
.
├── backend/
│   └── src/
│       ├── config/
│       ├── controllers/
│       ├── middleware/
│       ├── models/
│       ├── routes/
│       ├── services/
│       ├── sockets/
│       ├── validators/
│       ├── jobs/
│       └── utils/
├── frontend/
│   └── src/
│       ├── api/
│       ├── components/
│       ├── features/
│       ├── hooks/
│       ├── layouts/
│       ├── pages/
│       ├── routes/
│       ├── services/
│       ├── types/
│       ├── utils/
│       └── validations/
├── docs/
├── docker-compose.yml
├── .env.example
└── package.json
```

## Security and release operations

See [`SECURITY.md`](SECURITY.md). Do not expose development credentials, use shared accounts, or place secrets in frontend variables. Report vulnerabilities privately to the deployment owner.

For deployment, use [`docs/RELEASE_RUNBOOK.md`](docs/RELEASE_RUNBOOK.md) and complete [`docs/ACCEPTANCE_CHECKLIST.md`](docs/ACCEPTANCE_CHECKLIST.md) against a running environment.

## Current scope boundaries

The product deliberately does not provide patient care, clinical recommendations, treatment advice, automatic medical decisions, or unattended AI order submission. Optional external providers remain disabled until configured and are labeled accordingly in the UI.
