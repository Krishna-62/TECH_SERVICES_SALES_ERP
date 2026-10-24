# Technicon Sales ERP — Architecture & Build Plan

Updated 2026-10-24.

A mobile-first field sales CRM for TECHNICON SERVICES: 5–15 salespeople, a Sales Manager and the
Managing Director. It records company visits, customer requirements and follow-ups, tracks deals
through to won/lost, and gives management a live view of the pipeline.

**Customer relationships and deals belong to Technicon Services, not to the salesperson.** When
someone leaves, their login is deactivated, nothing is deleted, and their open deals and tasks are
transferred with a full audit trail.

## 1. Decisions

| # | Decision | Status |
|---|---|---|
| D1 | **Separate application, separate repository, separate database.** Not built inside the Technicon Services ERP (`madhava31/tech_service`). | Decided 2026-10-24 |
| D2 | Roles: `admin`, `managing_director`, `sales_manager`, `salesperson`, `office_staff` | Decided |
| D3 | Sales Manager sees all salespeople (one manager initially) | Decided |
| D4 | CRM records are owned by a `salesperson` row, not a login | Decided |
| D5 | Targets/incentives stay in the separate *Technicon Sales Champion* app; this app shows no incentive figures | Decided |
| D6 | Salespeople *request* quotations; office staff/manager build them in the ERP | Decided |
| D7 | ERP data (companies, quotations) is read **read-only over the ERP's API**; the ERP database is never connected to directly | Decided 2026-10-24 |
| D8 | Staging: a separate Supabase project for this app (owner creates it) | Pending (owner) |
| D9 | No GPS in the MVP; later opt-in only | Decided |
| D10 | How the ERP authorises this app's read-only calls (API key / service account on the ERP side) | **Open — needed before Phase 3** |

## 2. Architecture

```
 Phone / tablet / desktop browser (PWA)
              │  same origin, httpOnly session cookie
              ▼
 Express API (api/) ── role checks on every route ── Postgres (this app's own database)
              │
              └── read-only HTTPS ──► Technicon Services ERP API  (Phase 3: companies, quotations)
```

| Layer | Choice | Why |
|---|---|---|
| Web | React 18 + TypeScript + Vite 7 + Tailwind 3, React Router 7 | Same family as the ERP's frontend; mobile-first layout with bottom tabs |
| API | Express 4 (ESM JavaScript), `pg` | Same conventions as the ERP backend (`db.prepare(sql).get/all/run`, `?` placeholders, `db.transaction`) so people can move between the two |
| Database | PostgreSQL — local for dev/test, dedicated Supabase project for staging/production | Never the ERP's database. TLS certificates are always verified for remote databases (`DATABASE_SSL_CA_FILE`) |
| Auth | Own accounts: scrypt password hashes, opaque session tokens in Postgres, httpOnly `SameSite=Lax` cookie, 30-day sessions | Proven in the ERP; no third-party identity provider needed for ≤20 users |
| Hosting | One Node process serves the API and the built web app (`NODE_ENV=production`) | Single origin, no CORS |

### Data ownership with a separate database

- **Companies:** this app keeps its own `company` table (Phase 2) because field staff must register
  prospects that don't exist in the ERP yet. Each row may carry `erp_company_id` once matched.
  Matching/linking to ERP customers is Phase 3; until then duplicates are prevented within this app
  (normalized name + fuzzy search).
- **Quotations:** stay in the ERP. This app stores only a link (`erp_quotation_id`, number, status
  snapshot) on an opportunity, refreshed from the ERP API.
- **Salespeople:** `salesperson.erp_sales_engineer_id` maps to the ERP's `sales_engineer.id` so ERP
  quotations can be attributed.

## 3. Roles and permissions

| Capability | Salesperson | Sales Manager | Managing Director / Admin | Office Staff |
|---|---|---|---|---|
| Record visits, requirements, follow-ups | Own | All | All | — |
| See records | Own only | All | All | All (read) |
| Request a quotation | Own deals | Yes | Yes | — |
| Link/update quotation on a deal | — | Yes | Yes | Yes |
| Reassign deals and tasks | — | Yes | Yes | — |
| Manage users and salespeople, read audit log | — | — | Yes | — |
| Company-wide analytics | — | Yes | Yes | — |

Enforced in the API (route role checks + `visibleSalespersonIds()` in every list query). Records a
user may not see return **404**, not 403, so their existence isn't revealed.

## 4. Data model

Built so far (migrations 0001–0003): `app_user`, `session`, `login_attempt`, `salesperson`,
`audit_log` (append-only by trigger), `schema_migrations`.

Planned:

| Table | Purpose |
|---|---|
| `company` | Canonical prospect/customer record; `normalized_name` (trigram index) for duplicate detection; optional `erp_company_id` |
| `company_contact` | Multiple contacts per company (name, designation, phone, email) |
| `visit` | Company, contact, salesperson (never changes), visited_at, `draft`→`completed`, outcome, notes, `client_uuid` for idempotent offline sync |
| `requirement` | Product/category, specification, quantity, budget, urgency, timeline, decision maker |
| `opportunity` | Owner + original owner, stage, estimated value, probability, expected close, won value / lost reason |
| `opportunity_history` | Every stage and ownership change, with who/when/why |
| `task` | Follow-up actions: assignee salesperson, due date, type, status |
| `quotation_link` | Opportunity ↔ ERP quotation id/number/status snapshot |

Pipeline stages: New prospect → Visit completed → Qualified → Quotation requested → Quotation sent
→ Negotiation → Won / Lost. A visit is not automatically a lead; a quotation is not a won deal.

## 5. Build phases

| Phase | Scope | Status |
|---|---|---|
| 0 | Repository, migration runner, test harness against a local `*_test` database, CORS and sign-in throttling | **Done** |
| 1 | Roles, user accounts and salesperson register, deactivate-not-delete, append-only audit log, admin screens | **Done** |
| 2 | Companies (dedupe), contacts, visit capture (draft → complete), requirements, follow-up tasks, salesperson "Today" screen | **Done** |
| 3 | Opportunities and stages, ERP read-only integration (customer matching, quotation links), salesperson dashboard | Needs D10 |
| 4 | Manager/MD dashboards with drill-down, bulk reassignment and employee handover | |
| 5 | Installable PWA, offline drafts + sync queue, reminders, staging acceptance run, production release | |

Each phase ends with tests green and a stop for review. Nothing is deployed without explicit
approval.

### Visit rules (Phase 2)

| Outcome | Requirement needed | Follow-up needed | Default follow-up |
|---|---|---|---|
| Interested | Yes | Yes | Call in 3 days |
| Needs follow-up | Yes | Yes | Call in 3 days |
| Wants a quotation | Yes | Yes | Send quotation in 2 days (high priority) |
| Couldn't meet | No | Yes | Revisit in 3 days |
| Not interested | No | No | — |

- A visit is started as a **draft** on arrival and **completed** after the meeting; completion,
  requirements and the follow-up are saved in one transaction. Completed visits are not edited.
- Unfinished drafts are listed on Today ("Visits to finish"); the half-filled completion form is
  also kept on the device so a refresh doesn't lose it.
- Duplicate companies: an exact match (same normalized name and city) is refused; similar names
  (trigram similarity ≥ 0.4) or the same phone number require "it's a different company".
- Records another salesperson owns return 404. Managers can record on behalf of a named
  salesperson and are the only ones who can reassign a follow-up (audited).

## 6. Metric definitions (one module, used by every dashboard)

| Metric | Definition |
|---|---|
| Companies visited | Distinct companies with a completed visit in the range |
| New prospects | Companies whose first completed visit is in the range |
| Quotation requests | Opportunities entering *Quotation requested* in the range (from history) |
| Deals won / value | Opportunities closed *Won* in the range; value = won value, never the quotation total |
| Conversion | Won ÷ (won + lost) closed in the range |
| Follow-ups due / overdue | Open tasks by assignee with due date ≤ today |
| Pipeline / weighted | Σ estimated value of open opportunities; weighted by probability |

All date ranges use `Asia/Kolkata`.

## 7. Acceptance criteria before launch

- Each salesperson sees only their own records; managers and the MD see all.
- Visits and requirements persist across refresh and re-login; drafts are never silently lost.
- Existing companies are reused instead of duplicated.
- Follow-ups stay visible until completed or reassigned.
- Deactivating an employee deletes nothing; open deals and tasks transfer with an audit trail.
- Quotation links point at the right ERP quotation and company.
- Automated tests cover access control, data integrity and the main workflows.
- Staging uses its own database; production is untouched until release approval.
