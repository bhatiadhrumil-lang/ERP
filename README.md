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
| Frontend  | React 18, TypeScript (strict), Vite 6, Tailwind CSS 4, React Router 6, Axios, lucide-react |
| Backend   | Node.js ≥ 20, TypeScript (strict), Express 4, Prisma 6, Zod 3, Helmet, CORS, jose (Cognito JWT), jsonwebtoken (dev tokens only) |
| Database  | PostgreSQL (local Docker image `postgres:16-alpine`, RDS-ready schema), Prisma migrations |
| Testing   | Vitest + Supertest against an isolated `mini_erp_test` database |

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

# 5. Run both apps
npm run dev              # backend :5000 + frontend :5173
```

Open http://localhost:5173 and sign in with a seeded development user
(see §9 for the account list).

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

`.env` files are git-ignored. No secrets are committed.

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

1. **users** — id, cognitoSub (unique), name, email (unique), role, isActive
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
| POST `/api/auth/dev-login` | Dev-only sign-in (disabled in production) | public* |
| GET/PATCH `/api/users`, `/api/users/:id` | User management | ADMIN |
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

## 9. Development authentication approach

- **Production:** `authenticate` resolves the token via the Cognito JWKS
  (`RS256`, issuer + audience checked). The app **refuses to start** in
  `NODE_ENV=production` without `COGNITO_USER_POOL_ID`/`COGNITO_CLIENT_ID`.
  Confirmed by test: a validly-signed dev token gets **401** in production.
- **Development:** the backend issues its own short-lived HS256 token for a
  seeded user through `POST /api/auth/dev-login` (email only — no passwords).
  This route is **not mounted** when `DEV_AUTH_ENABLED=false`, and the dev
  verifier is never used in production. User `role`/`isActive` are always read
  from the database on each request, so permission changes apply immediately.

Seeded sign-in accounts (development only — placeholder Cognito subs,
marked `DEVELOPMENT SEED USER` in `prisma/seed.ts`):

| Email | Role |
|---|---|
| admin@mini-erp.local | ADMIN |
| sales@mini-erp.local | SALES |
| warehouse@mini-erp.local | WAREHOUSE |
| accounts@mini-erp.local | ACCOUNTS |

In production, Cognito owns credentials end-to-end; the `User` row is
provisioned by `cognitoSub` out-of-band (documented in the deployment plan).

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
npm test                    # vitest (backend) — 38 tests
```

The suite runs against `mini_erp_test` (migrations applied automatically by
the Vitest global setup; every test starts from a clean database) and covers:
customer CRUD + validation, product CRUD + low-stock filter, inventory
adjustments, the full challan lifecycle, the **stock 100 → challan 20 →
inventory 80 / OUT 20 / CONFIRMED** invariant, the **120-unit rejection with
full rollback** invariant, snapshot preservation, RBAC denials per role, and
dashboard endpoints.

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
    │   ├── pages/          login, dashboard, customers(+detail), followups,
    │   │                   products, inventory(+movements), challans(new/detail), users
    │   ├── layouts/        sidebar + topbar shell
    │   ├── hooks/          auth context (dev-login) · toast notifications
    │   ├── services/       typed Axios clients per domain
    │   ├── routes/         protected + role-gated routing
    │   └── utils/          formatting + constants (nav, RBAC mirror, labels)
    └── vite.config.ts      dev proxy :5173 → :5000
```

---

*Mini ERP — local application + Prisma schema + AWS RDS compatibility +
tested business logic. Deploy phases intentionally not executed.*