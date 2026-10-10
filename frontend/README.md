# Supply Medicals frontend

Responsive React + TypeScript frontend for the Supply Medicals medical-supply platform. Every request is built against the real API under `backend/src`; the frontend never simulates a response the service does not expose.

## Stack

- React 18, TypeScript, Vite, React Router (lazy, route-level code splitting)
- Tailwind CSS with deep-blue / medical-green design tokens
- TanStack Query, React Hook Form, Zod
- Recharts and Lucide React
- Axios API client and Socket.IO client

## Setup

```bash
npm install
cp .env.example .env.local
npm run dev
```

Set `VITE_API_URL` to the API root including `/api`. `VITE_SOCKET_URL` is optional. `SITE_URL` is used by `npm run generate:seo`. `VITE_CONTACT_EMAIL` is only a fallback when `GET /public/agency` exposes no contact email. Never put a refresh token, API secret or other credential in a `VITE_*` variable: Vite variables are public browser configuration.

## Commands

```bash
npm run typecheck   # tsc -b
npm run test        # vitest run
npm run lint        # eslint --max-warnings=0
npm run build       # typecheck + production Vite build
npm run preview
```

## API contract layer

The contract is isolated in three modules so the pages never touch raw wire shapes:

- `src/lib/api.ts` — Axios instance, envelope unwrapping, bearer token, silent refresh, `api` / `apiMeta` / `apiSend` / `apiBlob`. Optional query params are dropped rather than sent as `''`.
- `src/lib/payloads.ts` — one pure builder per mutation. Each produces exactly the keys the matching Zod schema accepts, omitting optional fields instead of sending empty strings.
- `src/lib/adapters.ts` — response adapters that map wire documents (with or without `populate`) into the view models the pages consume. Missing values stay `undefined` or `0`; nothing is inferred.

`src/lib/validation.ts` mirrors the backend password and phone rules so a request is not sent only to be rejected.

## Authentication model

- `GET /auth/me` returns `{ user, profile }`; `mapAuthUser` folds both into one authenticated user, attaching the customer or salesman profile.
- The access token is returned by login/refresh and kept in memory. The refresh token is an HttpOnly cookie and is never read by JavaScript.
- Registration sends the real `registerSchema` fields and never a role. The API always creates a **pending** customer account, so every role guard routes a `PENDING` user to `/pending-approval`.
- Admin-provisioned staff carry `mustChangePassword`; the profile page shows a forced-change warning.
- Route guards shape navigation only. The API remains authoritative for authentication, tenant scope, role, price, tax, stock and order transitions.

## Roles

- `/customer/*` — catalog, order builder, orders, repeat order, requirements, invoices, messages, notifications, profile
- `/salesman/*` — assigned customers, customer detail, order creation, orders, follow-ups, messages, notifications, profile
- `/admin/*` — command center, order processing, customers, salesmen, products, categories, inventory, requirements, invoices, payments, reports/exports, AI status, activity log, settings

## Contract behaviours worth knowing

- **Orders.** Totals come from `grandTotal` / `taxTotal` / `subtotal`. The builder submits only `{ customerId?, items: [{ productId, quantity }], notes? }` after a `POST /inventory/validate` dry run. Status and cancel mutations return `{ order, previousStatus, status }`; the detail page offers only the `permissions.allowedTransitions` the service allows. Repeat order calls `POST /orders/reorder` and never edits history.
- **Inventory.** Adjustments are keyed on `inventoryId` with a signed `delta` and a mandatory `reason`. The backend exposes no stock-movement listing route, so the inventory screen shows stock and batches only.
- **Catalog.** `POST/PATCH /products` take JSON, not multipart, and the API has no product image upload: the product image is an `imageUrl`. The list filters on `brand`, `manufacturer` and `availability` (`IN_STOCK` / `LOW_STOCK` / `OUT_OF_STOCK` only). The catalog returns no per-product stock counts, so no availability badge is derived client-side — the availability filter is still applied server-side.
- **Salesmen.** Creation sends no client password. When the service returns a one-time `temporaryPassword` it is shown once with a forced-change warning and then cleared from component state.
- **Requirements.** Upload is multipart with the field name `file` and required `title` and `notes`. Download uses an authenticated blob fetch, because `/requirements/:id/file` needs the bearer token.
- **Messaging.** Conversations are `{ partner, conversationKey, lastMessageAt, lastBody, unreadCount }`. Message records carry raw `senderId` / `receiverId` unless a deployment populates them.
- **Follow-ups.** Statuses are `PENDING` / `COMPLETED` / `CANCELLED`, sorted by `dueAt`. `RESCHEDULED` is rendered if a deployment returns it but is never offered as a target, because the service's transition table does not accept it.
- **Notifications.** Mark-read sends `{ notificationIds: [...] }` or `{ all: true }`.
- **Settings.** `PATCH /settings` is strictly nested (`contact`, `tax`, `orderSettings`, `features`, `businessHours`, `notifications`). A flat payload is silently dropped by the backend, so `buildSettingsPayload` rebuilds the shape. `businessHours` is free text per `WEEK_DAYS` key (`"09:00 - 18:00"`, or `null` for closed) so a split shift can be expressed. `notifications.email` is keyed by `NOTIFICATION_PREFERENCE_KEYS`, plus a quiet-hours window.
- **Contact.** `POST /public/contact` takes a `CONTACT_TOPICS` value, records an enquiry and returns only a message. The configured email is a secondary `mailto:` action, never the primary path.
- **Dashboards and reports.** `mapDashboard` reads the nested blocks, then the flat `metrics` block, then root-level aliases. Report charts use the real `daily: { date, count, value }` points and the real inventory-report statuses.
- **Search.** `GET /search` returns grouped results; the command menu flattens them and navigates to the matching role route.

## Honest integration states

- Payment recording is an administrative ledger entry, not a payment gateway.
- The AI assistant shows the real `/ai/status` state and never fabricates an answer.
- Privacy and terms are informative review placeholders, not approved legal text.
- The public site shows no invented statistics, testimonials or company history; the agency name, contact details and tax data come from `GET /public/agency`.

## Structure

- `src/lib` — API client, payload builders, response adapters, shared status/format helpers
- `src/components/ui` — buttons, forms, cards, tables, modals, states
- `src/components/layout` — public, auth and role application shells
- `src/contexts` — auth, toasts and sockets
- `src/routes` — route guards and the pending-approval state
- `src/pages` — public, auth and role workspaces
- `src/types` — API and entity types
- `src/test` — Vitest coverage for the adapters, payload builders and route guards
