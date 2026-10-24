# Database migrations and tests

## Layout

| Path | Purpose |
|---|---|
| `api/db/migrations/NNNN_name.sql` | Forward-only migrations, applied in order, one transaction each |
| `api/db/migrate.js` | Runner + CLI; records each migration with a SHA-256 checksum in `schema_migrations` |
| `test/**/*.test.js` | `node:test` suites that boot the real Express app against a local `*_test` database |
| `.env.test` (git-ignored) | `TEST_DATABASE_URL` — copy from `.env.test.example` |

Never edit a migration once it has been applied anywhere: the runner refuses to continue if a
checksum changes. Add a new migration instead.

## Commands

```bash
npm test                    # resets the local test DB, applies all migrations, runs every suite
npm run db:migrate:status   # applied/pending on DATABASE_URL (.env); never writes
npm run db:migrate          # apply pending migrations to DATABASE_URL (local only)
npm run db:migrate:test     # apply pending migrations to TEST_DATABASE_URL
```

Any database host other than `localhost`/`127.0.0.1`/`::1` is refused unless you pass `--remote`
**and** set `CONFIRM_REMOTE_DATABASE` to that exact hostname, e.g.

```bash
CONFIRM_REMOTE_DATABASE=db.xxxx.supabase.co node api/db/migrate.js latest --remote
```

Remote connections verify the server certificate. For Supabase, download the CA certificate from
the project's database settings and set `DATABASE_SSL_CA_FILE` to its path.

## Migrations

| Version | What it does |
|---|---|
| 0001 | `app_user` (roles, active/deactivated, reporting manager), `session`, `login_attempt` |
| 0002 | `salesperson` register; `app_user.salesperson_id` (unique; required for the salesperson role) |
| 0003 | `audit_log`, append-only by trigger (UPDATE/DELETE/TRUNCATE raise an error) |
| 0004 | `pg_trgm`; `company` (normalized name + trigram index, unique name+city among live companies), `company_contact` |
| 0005 | `visit` (draft → completed, idempotent `client_uuid`), `requirement`, `task` (follow-ups) — all owned by a salesperson |

| 0006 | `opportunity` (stage, owner + original owner, won value / lost reason), append-only `opportunity_history`, `quotation_link` (manual now, `erp_quotation_id` for sync later); `opportunity_id` on visits, requirements and tasks |

`0004` runs `CREATE EXTENSION pg_trgm`. On Supabase it is available by default; on a self-managed
server the migrating role needs permission to create extensions.
