# Technicon Sales ERP

Mobile-first field sales CRM for TECHNICON SERVICES: company visits, customer requirements,
follow-ups and the deal pipeline, with views for salespeople, the Sales Manager and the Managing
Director.

This is a **separate application** from the Technicon Services ERP. It has its own repository and
its own PostgreSQL database, and will read customers and quotations from the ERP read-only over
its API. See [docs/architecture-plan.md](docs/architecture-plan.md).

**Status:** Phases 0–4 and 4b done — sign-in, roles, user and salesperson administration, audit log,
shared company registry with duplicate detection and approval, contacts with unique phone numbers,
visit capture, follow-ups, the Today screen, deals with OEM, products, win probability, order value,
tender and market segments, won / lost / abandoned with written reasons, overdue deals, the office's
quotation-request queue, hand-entered quotation links, products, OEMs and market segments, the
performance dashboard, the manager/MD team view with insights, employee handover and Excel export.
Also done: bulk import, company merge and parent/branch companies, daily reminders in the app and by
phone push, an installable app that records visits and follow-ups without signal, stuck-deal alerts,
a Sales analysis screen with the sales funnel and monthly forecast, tender tracking with bid deposits,
an installed base with warranty, AMC and consumables reorder follow-ups, changing many deals or
follow-ups at once, call and WhatsApp from a follow-up with quick logging, and a weekly report.
The ERP sync is built here and switches on once the ERP side is applied (docs/erp-integration/README.md).
Next: staging on Supabase and production release.

## Layout

```
api/        Express API (routes, auth, db wrapper, migrations, the ERP adapter seam in api/erp/)
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

Load the product catalogue from `technicon_products_seed.csv` (put it in `api/db/seeds/`, or pass a
path). Products are added or updated by part number. OEMs and market segments come with the
migrations (local database only):

```bash
npm run products:import
```

Want something to look at? Load fictional sample data — 50 companies, ~150 visits over the last
six months, ~50 deals across every stage including overdue and abandoned, quotations, follow-ups and
companies waiting for approval. It uses the catalogue file if it is in place, otherwise a small set
of `DEMO-` products (local database only, once):

```bash
npm run seed:demo
```

Locked out locally? Set any user's password from the terminal (local database only):

```bash
npm run user:set-password -- dev_admin
```

## Phone reminders (optional)

Without these keys, reminders still appear inside the app. Generate a pair once per environment and
put them in `.env` (`VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`). The private key is a
secret. Push and the offline app need HTTPS in production, and only run in the built app
(`npm run build`, then `NODE_ENV=production npm start`), not under `npm run dev:web`.

```bash
npx web-push generate-vapid-keys
```

## Weekly report by email (optional)

The report is always in the app. To email it each Monday, set `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`,
`SMTP_PASS`, `MAIL_FROM` and `APP_URL` in `.env`, then add addresses under Weekly report. The password
is a secret.

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
- Business records are deactivated or marked, never deleted. Every create, update, close, reopen,
  approval, rejection, handover and transfer is written to an append-only audit log.
- Sign-in is throttled per username and per IP. Sessions are httpOnly cookies, revoked on
  deactivation and password reset.
- Secrets live only in `.env` / the host's secret store — never in the repository or the browser.
