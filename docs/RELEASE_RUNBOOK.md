# Supply Medicals release runbook

Use this checklist for a controlled release to a real agency environment. Record evidence instead of checking boxes from source inspection alone.

## 1. Change control

- Review the current commit and dependency audit.
- Confirm no `.env`, credential, customer document, uploaded requirement, or private storage file is staged.
- Confirm seed data is marked demo/test and production seed execution is refused.
- Update the API contract when a route or payload changes.

## 2. Infrastructure prerequisites

- MongoDB replica set is reachable over a private network with authentication, encryption, backups, and monitoring.
- `ALLOW_TRANSACTIONS=true` and `/api/health` reports `database.transactions=true`.
- Reverse proxy handles WebSocket upgrades and does not buffer Socket.IO responses.
- HTTPS is enforced; refresh cookies are `Secure`, `HttpOnly`, and scoped to `/api/auth`.
- `CLIENT_URL`/`CORS_EXTRA_ORIGINS` list only real origins.
- Private file storage has a durable volume or private S3-compatible bucket.
- Log, metric, error, and alerting providers are configured without recording request bodies, tokens, or sensitive documents.

## 3. Secrets and optional services

- Generate independent random `JWT_SECRET` and `JWT_REFRESH_SECRET` values.
- Configure SMTP for approval and password-reset email before relying on those flows.
- Configure `AI_API_KEY` only after reviewing provider retention, region, and data-handling terms.
- Verify `SITE_URL` is the real public origin and regenerate robots/sitemap during build.
- Configure agency name, legal/contact details, address, tax/GST number, order prefix, invoice prefix, thresholds, expiry warning days, business hours, and notification preferences through the admin API.

## 4. Verification

```powershell
npm ci
npm run verify
npm run seed       # non-production only
npm run build
```

With the application running and disposable development/test credentials configured:

```powershell
npm run smoke
```

`SMOKE_ALLOW_MUTATION=true` performs a real priced customer order and salesman order, then verifies customer self-delivery is denied. Run it only against a disposable database.

Execute the complete role checklist in `ACCEPTANCE_CHECKLIST.md` using:

- one active customer,
- one pending customer,
- one active salesman with assigned customers,
- one second agency used only to prove cross-tenant denial.

## 5. Real-time acceptance

1. Open a customer session and a salesman/admin session in separate browsers.
2. Submit a customer order.
3. Confirm the agency dashboard receives `order.created` without refresh.
4. Move the order to `UNDER_REVIEW` and `CONFIRMED`.
5. Confirm the customer sees the verified status without refresh.
6. Disconnect the network briefly, reconnect, and confirm REST refetch restores the same state without duplicating records.

## 6. Data and recovery

- Take and verify a database backup before bulk imports or destructive migrations.
- Test database restore and object-storage restore in an isolated environment.
- Define upload retention, deletion, and legal-hold procedures with the agency owner.
- Document index creation and monitor slow queries before catalog growth.
- Run low-stock and expiry sweeps; confirm expired stock never becomes sellable.

## 7. Go-live communications

- Give the agency owner the login URL, support contact, and initial training.
- Explain that pending customers cannot order until an admin approves them.
- Explain the temporary salesman credential flow and mandatory password change.
- Explain invoice/payment records are operational records and require accountant/legal review for statutory use.
- Schedule a first-week business review covering unfulfilled orders, low stock, expiring batches, and follow-ups.

## 8. Rollback

- Stop writes or place the application in maintenance mode if data integrity is uncertain.
- Preserve logs and audit/activity records; do not delete them during diagnosis.
- Roll back the application artifact only when its schema migration is backward compatible.
- For a data incident, restore into an isolated database first, validate tenant scopes and stock balances, then promote through the owner's approval.
- Revoke refresh sessions and rotate affected secrets if compromise is suspected.

## 9. Post-release

- Verify health, login, one read-only page per role, one notification, and one socket connection.
- Review error rate, latency, database health, storage errors, and low disk capacity.
- Reconcile counts of customers, orders, invoices, and payments against the agency's own records.
- Record the release version, date, operator, outstanding issues, and next review date.
