# MongoDB → Supabase migration

The platform is moving from MongoDB (Mongoose) to Supabase: hosted PostgreSQL for
application data and Supabase Auth for credentials. The migration is phased so the
working application is never left half-broken.

## Current status

**Phase 1 — foundation (in this repository).**

- Prisma schema and the first SQL migration for the authentication domain
  (`agencies`, `users`).
- Lazy Prisma client, server-only Supabase clients and configuration validation.
- `npm run supabase:check` readiness probe.
- Health endpoint reports whether PostgreSQL/Supabase are configured.

**The running API still authenticates through the existing MongoDB/JWT path.**
The auth cutover is the next step and is applied only once a Supabase project is
configured and verified. Business collections (orders, inventory, invoices,
messaging, reports) stay in MongoDB until later phases.

## Target architecture (end of migration)

```
Browser ── HTTPS ──> Express API ──┬── Supabase Auth (auth.users)
                                   ├── PostgreSQL via Prisma (app data)
                                   └── Socket.IO (Supabase access token)
```

- The browser never talks to Supabase directly and never stores a refresh token
  in `localStorage`. The API proxies Supabase Auth and keeps the refresh token in
  the existing `HttpOnly`, `SameSite`, path-scoped cookie.
- Supabase Auth owns passwords, email verification, password reset, lockouts and
  refresh-token rotation. The application owns tenant (`agencyId`), role, approval
  status and business profile.
- Authorization remains server-side in Express middleware and tenant-scoped
  queries. Connecting to PostgreSQL with a privileged role bypasses Row Level
  Security, so RLS is defence in depth, not the access-control layer.

## Required configuration

Add these to `backend/.env` (never to `frontend/.env.local`, never with a `VITE_`
prefix):

| Variable | Where to find it |
| --- | --- |
| `SUPABASE_URL` | Supabase dashboard → Project Settings → API → Project URL |
| `SUPABASE_ANON_KEY` | Project Settings → API → Project API keys → `anon` / public |
| `SUPABASE_SERVICE_ROLE_KEY` | Project Settings → API → `service_role` (server secret) |
| `DATABASE_URL` | Project Settings → Database → Connection string → **Transaction pooler**, port `6543` |
| `DIRECT_URL` | Project Settings → Database → Connection string → **Direct**, port `5432` |
| `SUPABASE_JWT_SECRET` | Optional. Only for projects that still sign access tokens with the legacy HS256 secret; otherwise asymmetric JWKS is used. |

`DATABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are secrets. They must not be
committed, logged, or exposed to the frontend bundle.

## Applying the schema

```powershell
# from the repository root
npm run prisma:migrate:deploy -w backend   # or: npx prisma migrate deploy --schema backend/prisma/schema.prisma
npm run supabase:check -w backend
```

`prisma migrate deploy` uses `DIRECT_URL` for the migration connection and the
pooled `DATABASE_URL` at runtime.

Schema changes during development:

```powershell
npm run prisma:migrate:dev -w backend -- --name describe_change
```

## Identity and ID strategy

- Supabase Auth user IDs are UUIDs (`users.auth_user_id UUID UNIQUE`).
- Application primary keys stay 24-character hex strings, the same format as the
  existing MongoDB `ObjectId`s. MongoDB-resident business documents therefore
  continue to reference the same agency and user IDs while both stores are live.
- `users.email` remains globally unique, matching the current login rule.
- Removing `passwordHash`, reset-token and `tokenVersion` fields is intentional:
  those responsibilities move to Supabase Auth.

## Login flow after the cutover

1. `POST /api/auth/login` validates input, calls Supabase Auth with the password
   grant, then loads the application profile from PostgreSQL.
2. A `DISABLED` or `PENDING` application account is refused after successful
   credential verification, preserving the approval rules.
3. The Supabase refresh token is written to the `HttpOnly` cookie; the access
   token and application user are returned to the client exactly as today.
4. `POST /api/auth/refresh` rotates the Supabase session and the cookie.
5. `POST /api/auth/logout` revokes the Supabase session and clears the cookie.
6. Protected routes verify the Supabase JWT (JWKS, or HS256 when
   `SUPABASE_JWT_SECRET` is set) and still load the current role/status from the
   database on every request.

### Password recovery

Supabase sends the recovery email. To keep reset tokens out of URLs that reach
our API, set the Supabase **Reset password** email template to pass the token
hash to the application:

```html
<a href="{{ .SiteURL }}/reset-password?token_hash={{ .TokenHash }}&type=recovery">
  Reset your password
</a>
```

Add `${CLIENT_URL}/reset-password` to Supabase → Authentication → URL
Configuration → Redirect URLs. The application exchanges the token hash with
Supabase, sets the new password and revokes existing sessions.

## Remaining phases

| Phase | Scope |
| --- | --- |
| 1 (next) | Cut over Supabase Auth + agencies/users to Prisma; seed and tests; remove the custom credential path. |
| 2 | Orders, customers, salesmen, catalogue, inventory, stock movements. |
| 3 | Invoices, payments, requirements, messaging, notifications, activity, counters, idempotency keys. |
| 4 | Reports/analytics queries, Socket.IO state, MongoDB decommission. |

Each phase must keep `npm run typecheck`, `npm test`, `npm run build` and the
browser login/role-dashboard checks green before the next one starts.
