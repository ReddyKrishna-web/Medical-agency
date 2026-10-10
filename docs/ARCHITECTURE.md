# Supply Medicals architecture

## System boundaries

Supply Medicals is a modular monolith: one deployable TypeScript API and one browser application, with MongoDB as the operational source of truth. This is appropriate for the first real-agency deployment because transactions, authorization, and business rules remain explicit in one codebase. Module boundaries allow later extraction of search, messaging, reporting, or integrations without coupling every route to a single file.

```text
Browser
  ├── REST/JSON ──> Express routes ──> Zod validation
  │                     │                 └── RBAC + resource policy
  │                     └── services ──> Mongoose tenant-scoped repositories
  └── Socket.IO ───> authenticated rooms ──> same services / persisted events
                                           │
                                MongoDB + private file storage
```

## Tenant boundary

The authenticated `agencyId` comes from the verified access/refresh token and request identity, never from an accepted body field. Middleware requires it for every business route. Service queries include it in every find/update/delete. Object IDs are checked only after tenant-scoped lookup. Refresh sessions retain an agency claim and are rechecked against the user on use.

The three roles are:

- `CUSTOMER`: own profile, orders, invoices, payments, requirements, notifications, and conversations
- `SALESMAN`: assigned active customers, orders, requirements, follow-ups, and authorized conversations
- `AGENCY_ADMIN`: all records belonging to the current agency

UI capabilities improve usability but are not authorization controls.

## Request lifecycle

1. Helmet, CORS, body limits, compression, and rate limits apply.
2. Access token identity establishes actor, role, and tenant.
3. Zod validates params, query, and body with coercion/strictness appropriate to each route.
4. RBAC guards broad capability.
5. Service/resource policy checks ownership, assignment, and state.
6. Repository query includes `agencyId`.
7. Domain service executes validation and persistence.
8. Activity and domain events are written safely.
9. Socket.IO emits minimal records only after successful persistence.
10. Standard error middleware returns a stable code/message and never leaks stack traces.

## Domain modules

- Identity: agency, user, customer, salesman, sessions/password resets
- Catalog: category, product, tenant-specific business price/tax visibility
- Supply: batch, inventory balance, stock movement, expiry and FEFO allocation
- Orders: human order number, embedded priced items, state machine, timeline, reorders
- Revenue: invoice and optional internal payment ledger
- Relationships: assigned customers, notes, follow-ups
- Communication: persisted messages, read state, Socket.IO
- Intake: secure requirement files and human-verified conversion
- Insight: database aggregations, CSV exports, audit activity, optional authorized AI

## Inventory consistency

The target production deployment is a MongoDB replica set. Multi-document reservation, order, movement, and invoice operations use transactions. Each stock update includes a non-negative quantity predicate. Expired batches are excluded. Allocation follows first-expiry-first-out. Cancellation and processing transition functions define the compensating movement needed for reserved versus consumed stock.

Standalone MongoDB is accepted for local pilot development but cannot promise multi-document atomicity. The development implementation uses conditional updates and explicit compensation; operators should test recovery and use replica-set transactions before real trading.

## Order state machine

```text
PENDING → UNDER_REVIEW → CONFIRMED → PROCESSING → PACKED → DISPATCHED → DELIVERED
    └──────────────┴──────────→ CANCELLED (role/state dependent)
CONFIRMED / PROCESSING / PACKED / DISPATCHED / DELIVERED → RETURNED (admin policy)
any active nonterminal state → REJECTED (admin, with reason)
```

Allowed edges are centralized in the domain service. Each transition appends a timestamped timeline entry and an activity log. Role-specific policy allows a customer only to cancel an eligible early order. Agency staff can advance processing according to permission. A delivery event creates the invoice through an idempotent domain operation.

## Files

A storage interface implements local private disk and S3-compatible object storage. API validation combines allowed extension, declared MIME type, and file signature where practical. Names are random and do not contain customer input. Authorization is repeated at download. Object storage should have private ACLs and short-lived signed URLs when added. Malware scanning belongs at the storage adapter boundary for a public production deployment.

## Events

Socket events are delivery mechanisms, not the source of truth. The server persists the order, message, notification, or movement first, then emits a minimal event to user/agency rooms. A client invalidates relevant query keys. Reconnect uses REST refetching. Multi-instance production deployment should add a shared Socket.IO Redis adapter.

## Optional AI

AI accepts business questions, not clinical questions. The server injects tenant context and supplies report tools/results from authorized aggregations. The provider never receives unrestricted database objects or another tenant's identifiers. If no provider is configured, the API returns `CONFIG_REQUIRED`. OCR results and any generated order draft carry confidence and require human selection. AI cannot call order submission on the user's behalf.

## Observability and operations

- Structured HTTP/error logs without secrets or customer payloads
- Request correlation ID and safe operational error codes
- Health/readiness endpoint for process and database state
- Graceful shutdown closes HTTP and MongoDB resources
- Indexes begin with `agencyId` for tenant/common query patterns
- Database backups, object-storage versioning/retention, and restore drills are deployment responsibilities
- Central logs/metrics and alerts are deployment-specific and intentionally not tied to a vendor
