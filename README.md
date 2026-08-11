# Mini ERP / CRM

A production-quality Mini ERP case study: customer CRM, products, inventory with
an immutable audit ledger, and sales challans with atomic stock deduction.

> **Status:** Local development build — tested backend business logic, working
> frontend, Prisma schema ready for **Amazon RDS PostgreSQL**. Nothing is
> deployed to AWS yet.

---

## 1. Project overview

- **Authentication** — production validates **AWS Cognito JWTs** (RS256 via the
  pool's JWKS). Passwords are never stored; `User.cognitoSub` maps the Cognito
  identity to the application user. Local development uses a clearly separated
  dev token endpoint (see §9).
- **Role-based access control** — enforced **server-side** by middleware, not
  just hidden buttons (see the RBAC matrix in §8).
- **CRM** — customers (types, statuses, GST, follow-up scheduling) with a
  follow-up history per customer.
- **Products & inventory** — product master + current stock, with **every**
  stock change written to an immutable `InventoryMovement` audit ledger.
- **Sales challans** — created as **DRAFT**, then **CONFIRMED** in a single
  database transaction that locks inventory rows, verifies stock, decrements it,
  and records OUT movements atomically. Insufficient stock rejects the whole
  transaction. Challan items store **product snapshots** (name, SKU, price) so
  history survives later product edits. Cancelling a confirmed challan returns
  stock with compensating IN movements.
- **Dashboard** — KPIs, low-stock alerts, and a merged recent-activity feed.

## 2. Architecture

```
Browser
   │  HTTPS / SPA (React)
   ▼
Frontend  :5173  (Vite dev server; proxies /api → backend)
   │  JSON REST
   ▼
Backend   :5000  (Express + TypeScript + Prisma)
   │  PostgreSQL wire protocol
   ▼
Database  :5432  (local: Docker postgres:16-alpine — AWS RDS in production)
```

Layering inside the backend: `routes → middleware (auth/RBAC/validate) →
controllers → services → Prisma → PostgreSQL`. Business logic lives in
services; validation lives in Zod schemas; route handlers stay thin.

## 3. Technology stack

| Layer     | Tech |
|-----------|------|
| Frontend  | React 18, TypeScript (strict), Vite 6, Tailwind CSS 4, React Router 6, Axios, aws-amplify (Cognito), lucide-react |
| Backend   | Node.js ≥ 20, TypeScript (strict), Express 4, Prisma 6, Zod 3, Helmet, CORS, aws-jwt-verify (Cognito JWT), jsonwebtoken (dev tokens only) |
| Database  | PostgreSQL (local Docker image `postgres:16-alpine`, RDS-ready schema), Prisma migrations |
| Testing   | Vitest + Supertest (backend, isolated `mini_erp_test` DB) · Vitest + Testing Library (frontend, jsdom) |

Money is stored as `Decimal(12,2)` — never floats.

## 4. Local setup

Prerequisites: Node ≥ 20, npm, Docker (for local PostgreSQL).

```bash
# 1. Start local PostgreSQL (container, port 5432)
docker compose up -d db

# 2. Install dependencies
npm run setup            # installs backend + frontend

# 3. Backend environment
cp backend/.env.example backend/.env   # dev defaults are pre-filled

# 4. Prisma generate + migrate + seed
cd backend
npx prisma generate
npx prisma migrate dev
npx prisma db seed

# 5. Frontend environment (Cognito identifiers — public, not secrets)
cp frontend/.env.example frontend/.env   # fill in the pool/client ids from §5

# 6. Run both apps
npm run dev              # backend :5000 + frontend :5173
```

Open http://localhost:5173 and sign in with a **Cognito user** that has a
matching `User` row (provisioned by `cognitoSub`). In development you can
also exercise the backend API with the dev-login endpoint (see §9).

### Database without Docker

Any PostgreSQL 14+ works. Point `DATABASE_URL` at it and run the same Prisma
commands. The local dev password in `docker-compose.yml` is a throwaway
development value only.

## 5. Environment variables

See `backend/.env.example`:

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | PostgreSQL connection (dev: local Docker; prod: RDS via tunnel or private network) |
| `PORT` | Backend port (default 5000) |
| `NODE_ENV` | `development` \| `test` \| `production` |
| `CORS_ORIGIN` | Allowed frontend origin(s), comma-separated |
| `AWS_REGION` | Cognito user pool region (default `us-east-1`) |
| `COGNITO_USER_POOL_ID` | Required in production — backend refuses to boot without it |
| `COGNITO_CLIENT_ID` | Required in production — Cognito app client |
| `DEV_JWT_SECRET` | Signs dev-only tokens; never needed in production |
| `DEV_AUTH_ENABLED` | Default `true`; disables the dev login route when `false` |

Cognito **admin operations** (invite / disable / enable / resend — see §9)
use the AWS SDK default credential provider chain — no access keys live in
the repo. Local development uses your configured AWS CLI profile/credentials
(`~/.aws/credentials`); on EC2 the instance IAM role supplies them. The
credentials must include the `cognito-idp:AdminCreateUser`,
`AdminDisableUser`, `AdminEnableUser` and `AdminDeleteUser` permissions for
the pool.

Frontend (`frontend/.env.example` — copy to `frontend/.env`):

| Variable | Purpose |
|----------|---------|
| `VITE_AWS_REGION` | Cognito user pool region (default `us-east-1`) |
| `VITE_COGNITO_USER_POOL_ID` | Cognito User Pool ID (e.g. `us-east-1_AbCdEfGhI`) |
| `VITE_COGNITO_CLIENT_ID` | Cognito App Client ID (public client, no secret) |
| `VITE_COGNITO_ALLOW_SIGNUP` | Legacy flag (unused by the UI since onboarding moved to the first-ADMIN bootstrap + ADMIN invitations, §9) |
| `VITE_API_BASE_URL` | Backend base URL (default `/api`, proxied by Vite in dev) |

Cognito pool/client identifiers are **public** by design — they ship to the
browser. Never commit `.env` files; only the `.env.example` templates are
tracked.

## 6. Prisma commands

```bash
npx prisma generate          # regenerate Prisma Client
npx prisma migrate dev       # create/apply dev migration
npx prisma migrate deploy    # apply migrations (CI / production)
npx prisma db seed           # idempotent development seed
npx prisma studio            # browse the DB
```

## 7. Database schema

Eight core tables (Prisma is the source of truth — see
`backend/prisma/schema.prisma`):

1. **users** — id, cognitoSub (unique), name, email (unique), role, status
   (INVITED/ACTIVE/DISABLED), isActive (derived convenience flag), createdAt,
   updatedAt — no password fields, ever
2. **customers** — customerCode (unique), name, mobile, email?, businessName,
   gstNumber?, customerType, status, address?, nextFollowUpDate?, notes?
3. **customer_follow_ups** — customer, followUpDate, notes, status,
   assignedTo?, createdBy?
4. **products** — sku (unique), name, category, unitPrice `Decimal(12,2)`,
   minimumStock, warehouseLocation, isActive
5. **inventory** — productId (unique), quantity — current stock only
6. **inventory_movements** — product, quantity, movementType IN/OUT, reason,
   createdBy — the immutable stock audit ledger
7. **sales_challans** — challanNumber (unique), customer, totalQuantity,
   status DRAFT/CONFIRMED/CANCELLED, createdBy
8. **sales_challan_items** — challan, product, quantity + snapshot fields
   (`productNameSnapshot`, `skuSnapshot`, `unitPriceSnapshot`)

Enums: `UserRole`, `CustomerType`, `CustomerStatus`, `FollowUpStatus`,
`MovementType`, `ChallanStatus`. Foreign keys use sensible `onDelete`
behaviour (history-bearing links are `Restrict`, owned children `Cascade`,
actor references `SetNull`).

## 8. API structure

Base path `/api`. Consistent envelopes:

```json
{ "success": true, "data": ... }
{ "success": false, "error": { "code": "...", "message": "...", "details": [...] } }
```

All routes except `/api/health` and `/api/auth/dev-login` require a bearer
token. Every list endpoint supports `page`, `limit`, `search`, `sortBy`,
`sortOrder`; domain filters also exist (customer type/status, product
category/low-stock, challan status/customer/date range, movement type, …).

| Method & path | Purpose | Access |
|---|---|---|
| GET `/api/health` | Health (ALB-ready) | public |
| GET `/api/auth/me` | Current user | any authenticated |
| GET `/api/auth/bootstrap-status` | Is the first ADMIN created? | public |
| POST `/api/auth/bootstrap-admin` | First-ADMIN bootstrap (one-time, race-safe) | verified Cognito identity only |
| POST `/api/auth/dev-login` | Dev-only sign-in (disabled in production) | public* |
| GET/PATCH `/api/users`, `/api/users/:id` | User list (page/search/role/status filter) / name update | ADMIN |
| POST `/api/users/invite` | Invite employee (SALES/WAREHOUSE/ACCOUNTS only) | ADMIN |
| PATCH `/api/users/:id/role` | Change role (last-ADMIN protected) | ADMIN |
| POST `/api/users/:id/disable` · `.../enable` | Disable/enable (last-ADMIN protected) | ADMIN |
| POST `/api/users/:id/resend-invitation` | Re-send Cognito invitation (INVITED only) | ADMIN |
| GET/POST `/api/customers`, GET/PATCH/DELETE `/api/customers/:id` | CRM | admin+sales (read: +accounts) |
| GET/POST `/api/customers/:customerId/followups` | Follow-ups | admin+sales |
| GET/PATCH `/api/followups`, `/api/followups/:id` | Follow-up hub | admin+sales |
| GET/POST/PATCH/DELETE `/api/products*` | Products | admin+warehouse (read: +sales) |
| GET `/api/inventory`, GET `/api/inventory/:productId` | Stock | admin+sales+warehouse |
| POST `/api/inventory/:productId/adjust` | Stock adjust → ledger | admin+warehouse |
| GET `/api/inventory/movements` | Audit ledger | admin+warehouse |
| GET/POST/PATCH `/api/challans*`, POST `.../:id/confirm`, POST `.../:id/cancel` | Challans | admin+sales (read: +accounts) |
| GET `/api/dashboard/summary` / `low-stock` / `recent-challans` / `recent-activity` | Reporting | admin+sales+accounts |

**RBAC matrix** (enforced in middleware — the frontend only mirrors this for
UX):

| Resource | ADMIN | SALES | WAREHOUSE | ACCOUNTS |
|---|---|---|---|---|
| Users | ✓ | – | – | – |
| Customers read | ✓ | ✓ | – | ✓ |
| Customers write / follow-ups | ✓ | ✓ | – | – |
| Products read | ✓ | ✓ | ✓ | – |
| Products write | ✓ | – | ✓ | – |
| Inventory read | ✓ | ✓ | ✓ | – |
| Inventory adjust / movements | ✓ | – | ✓ | – |
| Challans read | ✓ | ✓ | – | ✓ |
| Challans create / confirm / cancel | ✓ | ✓ | – | – |
| Dashboard | ✓ | ✓ | – | ✓ |

### The challan confirm transaction

1. Open a Prisma interactive transaction.
2. Load the challan; must exist and be **DRAFT**.
3. Lock every referenced inventory row with `SELECT … FOR UPDATE`
   (deterministic product order → no deadlocks).
4. Re-check stock per item; any shortage aborts the whole transaction with
   `409 INSUFFICIENT_STOCK` and per-item details — nothing is updated.
5. Decrement inventory, write an `OUT` movement per item
   (`reason`: challan number, `createdBy`: actor).
6. Set status `DRAFT → CONFIRMED`, commit.

Cancellation: `DRAFT → CANCELLED` (no stock effect) or
`CONFIRMED → CANCELLED` with compensating `IN` movements that restore stock.
History is never silently mutated.

## 9. Authentication & onboarding

Cognito owns **identity** (email, password, verification, invitations,
temporary passwords, sessions). PostgreSQL owns the **ERP user** (role,
status, active/inactive, application authorization). The two are joined by
`User.cognitoSub` — email is never the identity relationship.

```
React (Amplify) ──signIn / confirmSignIn──▶ AWS Cognito User Pool
   │  Cognito session (access token; nothing persisted to localStorage)
   ▼
Express authenticate middleware (aws-jwt-verify, RS256 + JWKS)
   │  sub → User.cognitoSub → role/status/isActive from PostgreSQL
   ▼
GET /api/auth/me  →  { user: { name, email, role, status, isActive, ... } }
```

### Onboarding model

- **First ADMIN (bootstrap).** Before any ADMIN exists, `GET
  /api/auth/bootstrap-status` reports `initialized: false` and the UI shows
  `/signup` (name/email/password — **no role field**). The flow is: Cognito
  `signUp` → verify the emailed code → sign in. At sign-in the backend calls
  `POST /api/auth/bootstrap-admin`, which verifies the Cognito token, then
  creates the `User` row with `role: ADMIN` inside a transaction guarded by a
  Postgres advisory lock — exactly **one** ADMIN can ever be created this
  way, even under concurrency. After bootstrap, `bootstrap-admin` returns
  `409 ADMIN_ALREADY_INITIALIZED` and the `/signup` page shows a
  "managed by an administrator" screen. The backend enforces this — hiding
  the form in the UI is only UX.
- **Employees (invitations only).** Public employee registration does not
  exist. An ADMIN calls `POST /api/users/invite` (role must be
  SALES/WAREHOUSE/ACCOUNTS — **ADMIN is not a valid invite role**). The
  backend verifies the ADMIN JWT, calls Cognito `AdminCreateUser`, which
  emails the invitation with a temporary password, then creates the `User`
  row with `status: INVITED`. No password ever passes through the
  application.
- **First login (NEW_PASSWORD_REQUIRED).** The invited employee signs in
  with the temporary password; Cognito answers with the
  `NEW_PASSWORD_REQUIRED` challenge. The UI shows "Set your new password"
  (new + confirm) and completes the challenge via Amplify
  `confirmSignIn`. On the first authenticated request afterwards the backend
  flips `status: INVITED → ACTIVE`.
- **User lifecycle.** ADMIN can change roles, disable, enable and re-send
  invitations. `status` transitions: `INVITED → ACTIVE` (onboarding),
  `ACTIVE → DISABLED` / `DISABLED → ACTIVE` (admin). A `DISABLED` user is
  rejected by the middleware even if Cognito authentication succeeds —
  `403 USER_DISABLED`. The final ADMIN can never be disabled or demoted
  (server-side guard; self-demotion that would leave zero ADMINS is
  rejected with `409 LAST_ADMIN`).
- **Cognito admin operations** run exclusively in
  `backend/src/services/cognitoAdminService.ts` (AWS SDK v3, default
  credential chain). The frontend never calls `AdminCreateUser` /
  `AdminDisableUser` / `AdminEnableUser` / `AdminDeleteUser` — it only talks
  to the backend API. Cognito Groups are **not** used for roles; PostgreSQL
  is the single source of authorization state.

### Audit logging

Every admin user-management action writes a structured audit line (via the
existing logger): actor, action (`user.invite`, `user.role_change`,
`user.disable`, `user.enable`, `user.resend_invitation`), target email,
role, timestamp. No passwords or tokens are ever logged.

### Consistency strategy (app DB ↔ Cognito)

- **Invite:** Cognito `AdminCreateUser` first (gets the `sub`), then the
  `User` row; if the DB insert fails, the Cognito user is deleted as
  compensation.
- **Disable/enable:** the application database is updated **first** — it is
  the authorization authority, so even if the Cognito call fails the user is
  locked out of the app. Cognito failures are logged; state is re-synced on
  the next admin action.

### Development

- The backend still offers `POST /api/auth/dev-login` (email only, HS256,
  not mounted when `DEV_AUTH_ENABLED=false`, never in production) for API
  testing. The web app always signs in through Cognito.
- Cognito admin operations need working AWS credentials locally (see §5).
  The test suite mocks the AWS SDK completely — it never touches AWS.
- Seeded users (`prisma/seed.ts`) act as the dev "first ADMIN" plus three
  employees — they are `ACTIVE`, so `bootstrap-status` returns `true` in a
  freshly seeded dev database. To exercise the bootstrap flow, reset the DB
  without seeding.

## 10. AWS deployment plan (later phase — documented, not executed)

Target: EC2 (backend) + private RDS PostgreSQL + Cognito.

1. **Database:** create an RDS PostgreSQL instance in a **private subnet** with
   a security group that only allows TCP 5432 from the EC2 security group.
   Never `0.0.0.0/0`. Apply migrations with
   `npx prisma migrate deploy` (or run inside the app container).
2. **Connect locally:** the RDS endpoint is private. Development connects
   through an SSH tunnel via the EC2 bastion:
   ```bash
   ssh -L 5433:RDS_ENDPOINT:5432 ec2-user@EC2_PUBLIC_IP
   # DATABASE_URL=postgresql://erp_postgres:PASSWORD@localhost:5433/mini_erp
   ```
   (The real password lives in AWS Secrets Manager / env — never in the repo.)
3. **Backend:** `npm run build && npm start` with production env vars
   (Cognito pool/client ids required). The app binds all interfaces, honours
   `PORT`, handles SIGTERM gracefully, and exposes `/api/health` for an ALB
   target check. A `Dockerfile` is included for containerised deployment.
4. **Auth:** create the Cognito user pool + app client, provision a `User`
   row per Cognito identity (`cognitoSub`), and set the backend env vars.
5. **Frontend:** build statically (`npm run build --prefix frontend`) and
   serve from S3 + CloudFront (or any static host), pointing the API base URL
   at the EC2 endpoint.

**Not done (per project brief):** no EC2/RDS/security-group changes, no ALB,
no CodePipeline, no S3 deploy, no public RDS access, no hardcoded credentials.

## Testing

```bash
npm test                      # backend: vitest + supertest — 54 tests
npm test --prefix frontend    # frontend: vitest + Testing Library — auth flows
npm run typecheck             # backend + frontend TypeScript (strict)
```

The backend suite runs against `mini_erp_test` (migrations applied
automatically by the Vitest global setup; every test starts from a clean
database) and covers: customer CRUD + validation, product CRUD + low-stock
filter, inventory adjustments, the full challan lifecycle, the
**stock 100 → challan 20 → inventory 80 / OUT 20 / CONFIRMED** invariant,
the **120-unit rejection with full rollback** invariant, snapshot
preservation, RBAC denials per role, dashboard endpoints, and **Cognito JWT
verification** (real RS256 tokens minted in-test against an ephemeral key,
plus expired/bad-signature/wrong-audience rejections).

The frontend suite runs in jsdom with the Amplify/auth services mocked and
covers: unauthenticated redirect to `/login`, authenticated access to the
dashboard, logout returning to a protected login, and the Cognito sign-in
flow (credentials validation, success, and failure messages).

## Project structure

```
├── backend/
│   ├── prisma/           schema.prisma · seed.ts · migrations/
│   ├── src/
│   │   ├── config/       env (zod) + Prisma client
│   │   ├── controllers/  thin HTTP layer
│   │   ├── middleware/   authenticate (Cognito/dev) · requireRole · validate · errorHandler
│   │   ├── routes/       /api routers
│   │   ├── services/     business logic (challan transactions etc.)
│   │   ├── utils/        ApiError, pagination, response envelope, codes, logger
│   │   ├── validators/   Zod schemas
│   │   ├── types/        shared types + Express augmentation
│   │   └── server.ts     bootstrap + graceful shutdown
│   └── tests/            Vitest + Supertest suites
└── frontend/
    ├── src/
    │   ├── components/ui/  cards, buttons, fields, badges, modals, tables, feedback
    │   ├── pages/          login, register, confirm-signup, dashboard, customers(+detail),
    │   │                   followups, products, inventory(+movements), challans(new/detail), users
    │   ├── layouts/        sidebar + topbar shell
    │   ├── hooks/          auth context (Cognito session + ERP user) · toast notifications
    │   ├── services/       typed Axios clients per domain + apiClient (Bearer auth, 401 retry)
    │   ├── config/         Amplify/Cognito init (once) + feature flags
    │   ├── routes/         protected + role-gated routing
    │   ├── test/           jsdom auth tests (Amplify mocked)
    │   └── utils/          formatting + constants (nav, RBAC mirror, labels)
    └── vite.config.ts      dev proxy :5173 → :5000
```

---

*Mini ERP — local application + Prisma schema + AWS RDS compatibility +
tested business logic. Deploy phases intentionally not executed.*