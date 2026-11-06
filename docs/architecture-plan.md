# Technicon Sales ERP — Architecture & Build Plan

Updated 2026-11-05.

A mobile-first field sales CRM for TECHNICON SERVICES (Hyderabad), a distributor of laboratory
instruments and consumables: 5–15 salespeople, a Sales Manager, the Managing Director and office
staff. It records company visits, customer requirements and follow-ups, tracks deals through to won,
lost or abandoned, and gives management a live view of the pipeline.

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
| D10 | How the ERP authorises this app's read-only calls: a read-only route with its own key, because no ERP login is both safe and useful. See `docs/erp-integration/README.md` | **Built here; ERP patch awaits owner's go-ahead** |
| D11 | Quotation documents are recorded as a link for now; uploading files needs a storage decision | **Open** |
| D12 | Reminders: built as in-app plus phone push. WhatsApp would need a paid provider; it can be added beside push later | Push decided; WhatsApp open |
| D14 | Email provider for the weekly report: any SMTP service. Until one is set, the report stays in the app | **Open** |
| D13 | Daily digest time: 9 am India time, Monday to Saturday, one message per person | Default, easy to change |

## 2. Architecture

```
 Phone / tablet / desktop browser (PWA)
              │  same origin, httpOnly session cookie
              ▼
 Express API (api/) ── role checks on every route ── Postgres (this app's own database)
              │
              └── api/erp/adapter.js ── read-only HTTPS ──► Technicon Services ERP API  (Phase 3b, after D10)
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
- **Quotations:** are prepared in the ERP. This app stores only a record of them on a deal (number,
  date, value, status, document link), entered by hand until the ERP sync exists.
- **Products:** come from this app's `product` table through `api/erp/adapter.js`. Routes never call
  the ERP directly: switching to the ERP's catalogue and quotation status means adding an adapter
  there, with nothing else changing.
- **Salespeople:** `salesperson.erp_sales_engineer_id` maps to the ERP's `sales_engineer.id` so ERP
  quotations can be attributed.

## 3. Roles and permissions

| Capability | Salesperson | Sales Manager | Managing Director / Admin | Office Staff |
|---|---|---|---|---|
| Record visits, requirements, follow-ups | Own | All | All | — |
| See companies | All (shared) | All | All | All (read) |
| See deals, visits, follow-ups | Own only | All | All | All (read) |
| Create a company | Yes (pending approval) | Yes (auto-approved) | Yes (auto-approved) | — |
| Approve or reject companies | — | Yes | Yes | — |
| Create, edit and close deals (Won / Lost / Abandoned) | Own | All | All | — |
| Reopen a closed deal | — | Yes | Yes | — |
| Request a quotation | Own deals | Yes | Yes | — |
| Add or update quotations | — | Yes | Yes | Yes |
| Hand over or transfer deals | — | Yes | Yes | — |
| Team view and insights | — | Yes | Yes | Yes |
| Export deals to Excel | Own deals | All | All | All |
| Manage products | — | — | Yes | Yes |
| Manage OEMs and market segments | — | — | Yes | — |
| Manage users, read audit log | — | — | Yes | — |

Enforced in the API (route role checks + `visibleSalespersonIds()` in every list query). Records a
user may not see return **404**, not 403, so their existence isn't revealed.

## 4. Data model

| Migration | Tables and changes |
|---|---|
| 0001_auth | `app_user`, `session`, `login_attempt` (plus `schema_migrations`, kept by the runner) |
| 0002_salespeople | `salesperson` |
| 0003_audit_log | `audit_log`, append-only by trigger |
| 0004_companies_contacts | `company` (with `normalized_name` and a trigram index for duplicate detection), `company_contact` |
| 0005_visits_requirements_tasks | `visit` (`draft`→`completed`, `client_uuid` for idempotent offline sync), `requirement`, `task` |
| 0006_opportunities | `opportunity` (owner + original owner, stage, order value in `estimated_value`, comments in `notes`), `opportunity_history`, `quotation_link` |
| 0007_catalogue | `oem`, `product`, `market_segment`, seeded with the six OEMs and four segments |
| 0008_company_approval_contacts | `company`: `category` (was `industry`), `state`, `contact_person`, approval status with approver, date and rejection reason. One company per normalized name; one live contact per phone number |
| 0010_company_structure | `company`: `parent_company_id` (one level), `merged_into_company_id`. Name unique among top-level companies; branches of one parent unique by name and city |
| 0011_reminders_offline | `notification` (one digest per person per day), `push_subscription`, `request_idempotency` (safe retries) |
| 0012_stage_settings | `stage_setting`: days a deal may stay in each open stage before it counts as stuck |
| 0014_contact_log_weekly_report | `contact_log`, `weekly_report` (figures saved as they stood), `report_recipient` |
| 0015_erp_sync | `erp_customer`, `erp_quotation`, `erp_order` (read-only copies), `erp_sync_run`, `product.erp_product_id` |
| 0013_tenders_installed_base | `tender`, `installed_instrument`, `reorder_plan`, `auto_followup` (one follow-up per end date), `renewal` and `reorder` follow-up types |
| 0009_deal_fields | `opportunity`: `oem_id`, `contact_id`, `probability_reason`, `tender`, `close_reason`, the `abandoned` stage. `opportunity_product`, `opportunity_segment`. Field changes in `opportunity_history`. `quotation_link.document_url` |

Pipeline stages: New prospect → Visited → Qualified → Quote requested → Quote sent → Negotiation →
Won / Lost / Abandoned. A visit is not automatically a lead; a quotation is not a won deal.

## 5. Build phases

| Phase | Scope | Status |
|---|---|---|
| 0 | Repository, migration runner, test harness against a local `*_test` database, CORS and sign-in throttling | **Done** |
| 1 | Roles, user accounts and salesperson register, deactivate-not-delete, append-only audit log, admin screens | **Done** |
| 2 | Companies (dedupe), contacts, visit capture (draft → complete), requirements, follow-up tasks, salesperson "Today" screen | **Done** |
| 3 | Opportunities and stages, quotation requests and links, performance dashboard | **Done** — quotations are entered by hand (number, amount, status) until D10 |
| 3b | ERP read-only sync: products, customers, quotations and orders | **Done on this side**, tested against a stand-in. Needs the ERP patch and keys to go live |
| 4 | Manager/MD team view, insights, bulk handover and single-deal transfer | **Done** |
| 4b | Deal fields, Abandoned, close reasons, overdue, products/OEMs/segments, weighted pipeline, company approval, inline "+ Add customer number", Excel export | **Done** — needs `technicon_products_seed.csv` loaded (`npm run products:import`) |
| 5a | Bulk import, company merge and branches, reminders, installable PWA, offline visits and follow-ups with conflict handling | **Done** — push not yet tried on a real phone |
| 5b | Staging on Supabase (D8), acceptance run, production release | Not started |
| 6 | Sales funnel, stuck-deal alerts, monthly forecast | **Done** |
| 7 | Tender tracking, installed base with renewals, consumables reorders | **Done** |
| 8 | Change many at once, call and WhatsApp with logging, weekly report | **Done** — email not yet tried against a real mail server |

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
- Duplicate companies: an exact match (same normalized name) is refused; similar names (trigram
  similarity ≥ 0.4) or the same phone number require "it's a different company".
- A company added by a salesperson is **pending** until a manager approves it. Visits can be logged
  against a pending company; a deal cannot be opened on one, from the pipeline or from a visit.
  Rejecting needs a reason. A rejected company is kept and marked, leaves the search lists, takes no
  new visits or deals, and no longer holds its name.
- A contact's phone number is unique across live contacts (last 10 digits). "+ Add customer number"
  selects the contact if the number is already on this company, and refuses it, naming the company,
  if it is on another.
- Records another salesperson owns return 404. Managers can record on behalf of a named
  salesperson and are the only ones who can reassign a follow-up (audited).

### Deal rules (Phase 3)

| Stage | Rule |
|---|---|
| New prospect / Visited / Qualified | Free to move between open stages; every move is in the deal history |
| Quote requested | Set by "Request quotation" or a "wants a quotation" visit; appears in the office's **Quotation requests** queue until a quotation is recorded |
| Quote sent / Negotiation | Need at least one recorded quotation. Recording a non-draft quotation moves the deal to Quote sent automatically |
| Won | Needs the order value (`won_value`, never taken from the quotation automatically) and a written reason. Probability becomes 100% |
| Lost | Needs a category (price, competitor, no budget, need went away, timing, product fit, no response, other) and a written reason. Probability becomes 0% |
| Abandoned | Needs a written reason. Probability becomes 0% |

- Required on every new or edited deal: name, company (approved), OEM, at least one product of that
  OEM, expected closing date and order value. Changing the OEM clears the products. Deactivated
  products and segments can't be newly chosen, but a deal keeps the ones it already has. Deals made
  before these fields existed are asked for them the next time they are edited.
- Win probability is chosen from 25 / 50 / 75 / 100% (default 25%) and doesn't change with the stage.
  Weighted pipeline = Σ order value × win probability over open deals.
- **Overdue:** not closed and the expected closing date is before today, India time. Orange badge
  everywhere, listed first, an Overdue filter, listed on Today, counted per salesperson on Team.
- Visits move a linked deal forward only (interested → Qualified, needs follow-up → Visited, wants a
  quotation → Quote requested); never backwards, and "not interested" never closes a deal.
- Closed deals are read-only. Only a manager can reopen one; reopening clears the result and is audited.
- `opportunity_history` is append-only (same trigger as the audit log) and keeps every stage, owner
  and field change. All of them are also in the audit log.
- Excel export uses the list's current filters; a salesperson only ever gets their own deals.
- Quotations are recorded by office staff and managers (D6); salespeople cannot add them.

### Import, merge and branches (Phase 5a)

- **Import** (MD, admin): Excel or CSV, in order: companies, contacts, open deals. A preview changes
  nothing. The import checks the file again and adds valid rows in one transaction. Rows with errors are
  reported and left out; rows already present are skipped, so loading a file twice adds nothing. All
  the usual rules apply to imported deals. One audit entry lists every id created.
- **Branches**: one level, parent and branch. A branch may share its parent's name in another city.
  Anyone can register a branch; only a manager changes an existing company's parent.
- **Merge** (managers): moves contacts, visits, follow-ups, requirements and deals to the company kept,
  fills any details it lacks, and archives the duplicate with a pointer to the one kept. The audit entry
  lists every record moved. Changes queued on a phone before a merge follow the pointer.

### Reminders and offline (Phase 5a)

- **Reminders**: one digest each working morning. Salespeople hear about their own follow-ups and
  overdue deals; managers about the team's overdue work; office staff get none. Kept in the app, and
  pushed to phones that turned it on. Runs in the API process, so it needs one long-running server.
- **Offline**: a service worker keeps the app itself available. Pages already seen are readable from a
  copy on the device (not accounts or team reports), cleared on sign-out. These work without signal: start
  and finish a visit, add a follow-up, mark one done, reschedule one. New deals and new companies need
  a connection, because they depend on live checks.
- **Sync**: waiting changes go in order when the connection returns. Each has its own key, so a retry
  can't apply twice, and a visit keeps its real arrival time.
- **Conflicts**: a change the server refuses (a follow-up someone else closed or moved, a number another
  contact holds, a company rejected in the meantime) stays on the phone with the reason, for the person
  to try again or discard. Nothing typed in the field is dropped silently.

### Sales analysis (Phase 6)

- **Stuck deals**: in the current stage longer than that stage's limit, in India-time days. Only a stage
  change restarts the clock; edits and transfers don't. Limits start at 14 / 14 / 21 / 7 / 21 / 30 days
  (New prospect through Negotiation), and MD/Admin can change them (audited). Shown as a badge, a
  Pipeline filter, on Today, on Performance and Team, and in the morning reminder. This differs from
  "going quiet", which is no activity of any kind, and from overdue, which is about the closing date.
- **Funnel**: deals opened in the period and how far each got. A skipped stage counts as passed, so each
  stage can only be as big as the one before. Also shows the share going on to the next stage, deals
  lost or abandoned at each stage, and average days in each stage.
- **Forecast**: open deals by the month of their expected closing date, for six months, split by win
  probability: Commit (75–100%), Best case (50%), Pipeline (25%). No separate field to fill in. Deals past
  their date, beyond six months, or with no date are shown apart, so the buckets add up to the whole
  open pipeline. Orders already won in each month are shown beside it, not added to it.

### Tenders and repeat business (Phase 7)

- **Tenders**: a deal marked as a tender can have a tender number, authority, bid due date, pre-bid date,
  EMD (bid deposit) amount and status, bid status and document link. The bid result is separate from the
  deal's outcome: winning a bid doesn't close the deal, because the order value isn't known yet. Details
  stay editable after a deal closes, because the deposit usually returns later. A paid deposit on a
  decided bid or closed deal shows under "EMD to recover" until it's marked refunded or forfeited.
- **Installed base**: what each customer owns, with serial number and warranty and AMC end dates. A
  company's page shows all of it to everyone, because it's a fact about the customer. The Renewals screen
  shows a salesperson their own. Salespeople change only their own; managers and office staff change
  any, because contracts usually reach the office first. Retired, never deleted.
- **Reorders**: an item a customer buys repeatedly and how often. Marking it ordered sets the next date.
- **Automatic follow-ups**: the morning job puts an ordinary follow-up on the responsible salesperson's
  list 60 days before a warranty or AMC ends, and 7 days before a reorder is due. Each date creates one,
  so finishing it doesn't bring it back. Renewing or ordering finishes it; retiring or stopping cancels
  it. Dates more than 30 days past are ignored, so entering old records doesn't create a pile of tasks.
  Records of someone who has left wait for handover, which moves them with the rest of that person's work.

### Working faster (Phase 8)

- **Change many at once**: tick several deals for a new closing date, an open stage, or (managers) a
  transfer with a reason; tick several follow-ups for a new date, done, or (managers) a new assignee. Up
  to 200 at a time. Each gets the same history and audit entry as changing it alone. One that can't change
  is reported and the rest go ahead. Closing isn't offered, because each close needs its own reason and value.
- **Call and WhatsApp**: a follow-up shows the best number: the deal's contact, then the visit's, then the
  instrument's or reorder's, then anyone at the company, then the company's line. Call opens the phone's
  dialer. WhatsApp opens the person's own WhatsApp with a message they can change, so no provider or
  template approval is needed, and nothing is sent automatically. The app can't see whether a call
  connected, so the person says: reached finishes the follow-up, with an optional next one; no answer
  moves it (tomorrow unless a date is chosen). Works offline, and the log counts as deal activity.
- **Weekly report**: made once for the last finished Monday-to-Sunday week, on the first check after 9 am,
  so a Monday outage only delays it. Figures are saved as they stood, because pipeline and overdue
  counts can't be worked out again later. Team-view roles can read it; managers are notified; MD/Admin
  keep the email list. A failed email is saved and shown, and can be sent again.

### Team view and handover (Phase 4)

- **Team** (managers, MD, admin, office staff): every salesperson side by side using the same
  `computeMetrics()` as their own dashboard, so rows add up to the team total. People who have left
  stay listed while anything still counts toward them. Plus: won value for the last six months, won
  and open pipeline by product category (the deal's first product, or first requirement on older
  deals), city, OEM and market segment (a deal in two segments counts in both), open deals with no
  activity for 21+ days ("going quiet"), and deals still owned by someone who has left.
- **Handover** (managers, MD, admin): move a salesperson's open deals — all or chosen ones — with
  their open follow-ups, plus follow-ups not tied to a deal, to an active salesperson. A reason is
  required. One transaction; each deal gets an `owner` history row; one audit entry lists every
  deal and follow-up moved. Closed deals, visits, requirements and the original owner never change.
- **Single deal transfer** from the deal page, same rules, audited as `opportunity.transferred`.
- A salesperson record can't be deactivated while it still owns open deals or follow-ups.
- Order for an employee leaving: deactivate the login (signs them out at once) → hand over their
  work → deactivate the salesperson record.

## 6. Metric definitions (one module, used by every dashboard)

| Metric | Definition |
|---|---|
| Companies visited | Distinct companies with a completed visit in the range |
| New prospects | Companies whose first completed visit is in the range |
| Quotation requests | Opportunities entering *Quotation requested* in the range (from history) |
| Deals won / value | Opportunities closed *Won* in the range; value = won value, never the quotation total |
| Conversion | Won ÷ (won + lost) closed in the range. Abandoned deals are counted on their own, not in this rate |
| Overdue deals | Open deals whose expected closing date is before today, right now |
| Follow-ups due / overdue | Open tasks by assignee with due date ≤ today |
| Pipeline / weighted | Σ order value of open deals; weighted by each deal's win probability |

All date ranges use `Asia/Kolkata`. Implemented in `api/crm/metrics.js`; attribution per metric:
visits and new prospects → who visited; deals opened → original owner; quotation requests, quotations
sent, won/lost and pipeline → current owner.

## 7. Acceptance criteria before launch

- Each salesperson sees only their own records; managers and the MD see all.
- Visits and requirements persist across refresh and re-login; drafts are never silently lost.
- Existing companies are reused instead of duplicated.
- Follow-ups stay visible until completed or reassigned.
- Deactivating an employee deletes nothing; open deals and tasks transfer with an audit trail.
- Quotation links point at the right ERP quotation and company.
- Automated tests cover access control, data integrity and the main workflows.
- Staging uses its own database; production is untouched until release approval.
