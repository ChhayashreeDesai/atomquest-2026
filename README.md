# Atomquest Goal Setting & Tracking Portal

Enterprise HR workflow app for annual goal setting, manager approval, quarterly check-ins, analytics, and escalations.

## Deployed project : https://atomquest-2026-1.onrender.com/

## Repository structure

```
Atomquest/
├── backend/                 # Express + Prisma API (port 5001 locally)
│   ├── prisma/              # Schema, migrations, seed
│   ├── src/                 # Controllers, routes, middleware, utils
│   ├── .env.example         # Copy to .env for local development
│   └── railway.toml         # Railway deploy config
├── frontend/                # React + Vite UI (port 5173 locally)
│   ├── src/                 # Pages, components, API client
│   ├── .env.example         # Copy to .env.local for local development
│   └── railway.toml         # Railway deploy config
├── architecture_reference.md
└── README.md
```

## Prerequisites

- Node.js 18+
- PostgreSQL 14+
- npm

## Local development

### 1. Backend

```bash
cd backend
npm install
cp .env.example .env
# Edit .env — set DATABASE_URL to your local PostgreSQL instance
npm run prisma:migrate
npm run prisma:seed
npm run dev
```

API: `http://localhost:5001` · Health: `GET /health`

### 2. Frontend

```bash
cd frontend
npm install
cp .env.example .env.local
# VITE_API_URL defaults to http://localhost:5001/api
npm run dev
```

App: `http://localhost:5173`

### Test users (after seed)

| Role     | Email                 |
|----------|-----------------------|
| Admin    | admin@atomquest.dev   |
| Manager  | manager@atomquest.dev |
| Employee | emp1@atomquest.dev    |
| Employee | emp2@atomquest.dev    |

## Features

- **Goal cycle**: Create up to 8 goals (100% weightage, min 10% each), submit, manager approve/return
- **Check-ins**: Quarterly achievements with manager approval gate
- **Reporting**: CSV export, completion dashboard, analytics (Recharts)
- **Governance**: Audit trail, escalations, shared goals, user management
- **Dev tools**: Role switcher and system date simulator (header-based)

## Environment variables

See `backend/.env.example` and `frontend/.env.example`. Never commit `.env` files.

| Variable | Service  | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Backend | PostgreSQL connection string |
| `PORT` | Backend | Server port (Railway sets this) |
| `FRONTEND_URL` | Backend | Frontend origin for links/CORS |
| `ADMIN_DEV_MODE` | Backend | Enable dev role switching |
| `SMTP_*` | Backend | Optional email (skipped if unset) |
| `VITE_API_URL` | Frontend | Backend API URL including `/api` |

## Deploy on Railway

Use **two services** from this monorepo (one backend, one frontend).

### Backend service

1. Create a new Railway project → **Add PostgreSQL**.
2. Add a service → connect this repo → set **Root Directory** to `backend`.
3. Link the PostgreSQL plugin so `DATABASE_URL` is injected.
4. Set variables (or use defaults from `.env.example`):
   - `NODE_ENV=production`
   - `ADMIN_DEV_MODE=false` (recommended for production)
   - `FRONTEND_URL=https://<your-frontend-service>.up.railway.app`
5. Deploy. Railway runs `npm run build` then `npm run start:prod` (migrations + server).
6. Optional first deploy: run `npm run prisma:seed` once via Railway shell to load demo users.

### Frontend service

1. Add a second service → same repo → **Root Directory** `frontend`.
2. Set build-time variable:
   - `VITE_API_URL=https://<your-backend-service>.up.railway.app/api`
3. Deploy. Railway serves the Vite production build via `npm run start`.

### Health checks

- Backend: `GET /health`
- Frontend: `/` (static app)

## Production build (manual)

```bash
# Backend
cd backend && npm install && npm run build && npm run start:prod

# Frontend
cd frontend && npm install && npm run build && npm run preview
```

## API overview

| Area | Base path |
|------|-----------|
| Auth | `/api/auth` |
| Goal sheets | `/api/goal-sheets` |
| Check-ins | `/api/check-ins` |
| Reporting | `/api/reporting` |
| Escalations | `/api/escalations` |
| Shared goals | `/api/shared-goals` |
| User admin | `/api/admin/users` |

Full endpoint and file-level detail: [architecture_reference.md](./architecture_reference.md).

## Tech stack

| Layer | Technologies |
|-------|----------------|
| Backend | Node.js, Express, TypeScript, Prisma, PostgreSQL |
| Frontend | React 18, Vite, TypeScript, Tailwind CSS, Recharts, Axios |
| Email | Nodemailer (optional SMTP) |

## Security notes

- Do not commit `.env`, `node_modules`, or build output (`dist/`).
- Rotate any credentials that were ever stored in a local `.env` before pushing.
- `ADMIN_DEV_MODE` uses header-based role switching for development only; disable in production.
- Configure real SMTP and authentication before a production HR rollout.

## License

Proprietary — Atomquest Inc.
