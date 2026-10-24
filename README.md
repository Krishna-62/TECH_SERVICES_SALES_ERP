# Technicon Sales ERP

Mobile-first field sales CRM for TECHNICON SERVICES: company visits, customer requirements,
follow-ups and the deal pipeline, with views for salespeople, the Sales Manager and the Managing
Director.

This is a **separate application** from the Technicon Services ERP. It has its own repository and
its own PostgreSQL database, and will read customers and quotations from the ERP read-only over
its API. See [docs/architecture-plan.md](docs/architecture-plan.md).

**Status:** Phases 0–2 done — sign-in, roles, user and salesperson administration, audit log,
shared company registry with duplicate detection, contacts, visit capture (draft → complete with
requirements and next follow-up), follow-up tasks and the Today screen. Opportunities and ERP
quotation links come next.

## Layout

```
api/        Express API (routes, auth, db wrapper, migrations)
web/        React + TypeScript + Vite + Tailwind web app
test/       node:test suites run against a real local Postgres test database
docs/       Architecture plan, migration guide
```

## Prerequisites

- Node.js 22+
- PostgreSQL running locally (developed against 17)

## Setup

```bash
npm install
npm --prefix web install
cp .env.example .env              # set DATABASE_URL to a local database
cp .env.test.example .env.test    # set TEST_DATABASE_URL to a local *_test database
npm run db:migrate
```

Create the local databases first if they don't exist (the test database is created automatically).

## Run locally

```bash
npm run dev:api     # API on http://localhost:4100
npm run dev:web     # web app on http://localhost:5175 (proxies /api to the API)
```

The first visit asks you to create the initial administrator. Then add salespeople
(Admin → Salespeople) and give each person a login (Admin → Users).

## Test

```bash
npm test            # API, access control, accounts, migrations (needs .env.test)
npm run typecheck   # web app
```

## Production

```bash
npm run build                          # builds web/dist
NODE_ENV=production npm start          # serves API + web app from one origin
```

Environment variables are documented in [.env.example](.env.example). Apply migrations to a remote
database only as described in [docs/database-migrations.md](docs/database-migrations.md).

## Security notes

- Access is enforced by the API on every route; the web app only hides what a role can't use.
- Accounts and salespeople are deactivated, never deleted. Every account change is written to an
  append-only audit log.
- Sign-in is throttled per username and per IP. Sessions are httpOnly cookies, revoked on
  deactivation and password reset.
- Secrets live only in `.env` / the host's secret store — never in the repository or the browser.
