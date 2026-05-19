# Atomquest — Architecture Reference

**Last updated**: May 2026  
**Version**: 1.0

Technical reference for the Goal Setting & Tracking Portal. For setup and deployment, see [README.md](./README.md).

---

## Table of contents

1. [System overview](#system-overview)
2. [Backend architecture](#backend-architecture)
3. [Frontend architecture](#frontend-architecture)
4. [Workflow flows](#workflow-flows)
5. [Database schema](#database-schema)
6. [Deployment](#deployment)
7. [Quick file lookup](#quick-file-lookup)

---

## System overview

```
┌─────────────────┐     HTTPS / REST      ┌──────────────────┐
│  React (Vite)   │ ────────────────────► │ Express + Prisma │
│  frontend/      │   VITE_API_URL + /api   │  backend/        │
└─────────────────┘                         └────────┬─────────┘
                                                     │
                                                     ▼
                                            ┌──────────────────┐
                                            │   PostgreSQL     │
                                            └──────────────────┘
```

| Service  | Local port | Root path   |
|----------|------------|-------------|
| Frontend | 5173       | `frontend/` |
| Backend  | 5001       | `backend/`  |

---

## Backend architecture

### Entry point

**File**: `backend/src/index.ts`

- Express server; port from `process.env.PORT` (default 5000, local `.env` typically 5001)
- Middleware: Helmet, CORS, JSON, dev auth
- Routes mounted under `/api/*`
- `GET /health` for load balancers and Railway health checks
- `GET /api/system/config` — dev mode, phase, date presets

### Controllers

| File | Responsibility |
|------|----------------|
| `userManagementController.ts` | Employee CRUD, manager list (ADMIN) |
| `goalSheetController.ts` | Goals lifecycle: DRAFT → SUBMITTED → LOCKED |
| `checkInController.ts` | Quarterly achievements, manager approval |
| `reportingController.ts` | Dashboards, analytics, CSV export, audit |
| `escalationController.ts` | Deadline rules and HR escalations |
| `sharedGoalController.ts` | Admin KPI distribution to multiple employees |

### Routes

| Prefix | File |
|--------|------|
| `/api/auth` | `authRoutes.ts` |
| `/api/team` | `teamRoutes.ts` |
| `/api/goal-sheets` | `goalSheetRoutes.ts` |
| `/api/check-ins` | `checkInRoutes.ts` |
| `/api/reporting` | `reportingRoutes.ts` |
| `/api/escalations` | `escalationRoutes.ts` |
| `/api/shared-goals` | `sharedGoalRoutes.ts` |
| `/api/admin/users` | `userManagementRoutes.ts` |

### Middleware

**File**: `backend/src/middleware/authMiddleware.ts`

Development headers (when `ADMIN_DEV_MODE=true`):

| Header | Purpose |
|--------|---------|
| `X-Dev-Role` | `EMPLOYEE` \| `MANAGER` \| `ADMIN` |
| `X-System-Date` | ISO date or preset (`may1`, `july15`, …) |
| `X-User-Id` | Optional user override |

`requireRole('ADMIN')` protects admin-only routes.

### Utilities

| File | Purpose |
|------|---------|
| `lib/prisma.ts` | Prisma client, connect/disconnect |
| `utils/calculationEngine.ts` | Progress scores by UoM type |
| `utils/emailService.ts` | Nodemailer templates |
| `utils/cycleService.ts` | Fiscal phase from system date |

### Progress score formulas

| UoM type | Formula |
|----------|---------|
| `MIN_NUMERIC` | (Achievement ÷ Target) × 100 |
| `MAX_NUMERIC` | (Target ÷ Achievement) × 100 |
| `TIMELINE` | 100% if on time, else 0% |
| `ZERO` | 100% if achievement = 0, else 0% |

---

## Frontend architecture

### Pages (role-based)

| Page | File | Roles |
|------|------|-------|
| Login | `pages/Login.tsx` | All |
| Employee dashboard | `pages/EmployeeDashboard.tsx` | Employee |
| Manager dashboard | `pages/ManagerDashboard.tsx` | Manager |
| Admin dashboard | `pages/AdminDashboard.tsx` | Admin |
| Analytics | `pages/AnalyticsDashboard.tsx` | Admin, Manager |

### Key components

| Component | Purpose |
|-----------|---------|
| `GoalCreationForm` | Create/edit goals, weightage validation |
| `EmployeeCheckInForm` | Quarterly achievement submission |
| `ManagerCheckInDashboard` | Approve / rework check-ins |
| `AdminUserManagement` | Employee CRUD |
| `Layout` | Nav, dev role/date bar |

### State & API

**AuthContext** (`context/AuthContext.tsx`): user, `systemDate`, login/logout, dev role.

**API client** (`utils/api.ts`):

- Base URL: `VITE_API_URL` or `http://localhost:5001/api`
- Injects `X-Dev-Role`, `X-System-Date`, `X-User-Id` from session storage

**Vite** (`vite.config.ts`): dev proxy `/api` → `http://localhost:5001`

---

## Workflow flows

### Phase 1 — Goal setting (May)

```
Employee → create goals (≤8, 100% weight) → submit (SUBMITTED)
Manager  → approve (LOCKED) or return for rework (DRAFT)
```

### Phase 2 — Quarterly check-ins

```
Employee → submit achievement (PENDING)
Manager  → approve (APPROVED) or request rework (REWORK_REQUESTED)
Admin    → analytics use APPROVED check-ins only
```

### Phase 3 — Governance

- Escalations for missed submission/approval deadlines
- Audit logs for post-lock changes
- Shared goals synced from primary owner

---

## Database schema

**File**: `backend/prisma/schema.prisma`

| Model | Purpose |
|-------|---------|
| `User` | Employee / Manager / Admin |
| `GoalSheet` | Annual sheet per user per cycle |
| `Goal` | Individual KPI with weightage & progress |
| `CheckInComment` | Quarterly comment + approval status |
| `AuditLog` | Change history |
| `Escalation` | Workflow escalations |
| `Notification` | Email queue |

**Enums**: `Role`, `GoalSheetStatus`, `CheckInApprovalStatus`, `UoMType`, `CompletionStatus`, `Quarter`

Migrations live in `backend/prisma/migrations/` and are applied on Railway via `npm run start:prod`.

---

## Deployment

### Railway (recommended)

| Service | Root directory | Start command | Notes |
|---------|----------------|---------------|-------|
| API | `backend` | `npm run start:prod` | Requires PostgreSQL `DATABASE_URL` |
| UI | `frontend` | `npm run start` | Set `VITE_API_URL` at build time |

Config files: `backend/railway.toml`, `frontend/railway.toml`

### What not to commit

- `node_modules/`
- `dist/`, `build/`
- `.env`, `.env.local`
- Local database files (`*.db`)

### Post-deploy checklist

- [ ] `DATABASE_URL` set and migrations applied
- [ ] `FRONTEND_URL` matches frontend Railway URL
- [ ] `VITE_API_URL` points to backend `/api`
- [ ] `ADMIN_DEV_MODE=false` in production
- [ ] Optional: `npm run prisma:seed` once for demo users
- [ ] Verify `GET /health` and login flow

---

## Quick file lookup

| Task | Location |
|------|----------|
| New API endpoint | `backend/src/controllers/` → `routes/` → `index.ts` |
| New page | `frontend/src/pages/` → `App.tsx` |
| Schema change | `backend/prisma/schema.prisma` → `npx prisma migrate dev` |
| Calculation change | `backend/src/utils/calculationEngine.ts` |
| API base URL | `frontend/src/utils/api.ts`, `frontend/.env.example` |
| Auth / headers | `backend/src/middleware/authMiddleware.ts` |
| Railway backend | `backend/railway.toml`, `backend/package.json` |
| Railway frontend | `frontend/railway.toml`, `frontend/package.json` |

---

## Support matrix

| Issue | Check |
|-------|-------|
| 401 / wrong role | `authMiddleware.ts`, `ADMIN_DEV_MODE`, headers in Network tab |
| Wrong scores | `calculationEngine.ts` |
| API 404 | Route file + mount in `index.ts` |
| Blank UI | `App.tsx` routes, browser console |
| DB errors | `DATABASE_URL`, migrations, `prisma/schema.prisma` |
| Frontend can't reach API | `VITE_API_URL`, CORS, backend URL |

---

*End of architecture reference*
