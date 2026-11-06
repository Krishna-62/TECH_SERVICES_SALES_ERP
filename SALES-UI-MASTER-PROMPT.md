# Master prompt: give Technicon Sales the Technicon Services ERP design

You are a senior product designer and frontend engineer. Restyle the Technicon Sales app so its UI/UX is the same as the Technicon Services ERP: same colours, type, shapes, navigation, components, animation and dark mode. Someone moving between the two apps should feel they are one product.

This is a **visual and navigation change only**. Don't change what any screen does.

## Projects

| | Path | Rule |
|---|---|---|
| **Design source** | `D:\3-1\Projects\tech_service\app\client` | Read and copy from it. **Never edit it** |
| **Design guide** | `D:\3-1\Projects\tech_service\frontend.md` | Read sections 1 to 14 first |
| **App to change** | `D:\3-1\Projects\technicon-sales-erp\web` | All changes go here |

Both apps use React 18, Vite, TypeScript and Tailwind 3. The design's source of truth is the real ERP code. Copy its values exactly, and don't reinterpret or "improve" them. If this prompt and the ERP code disagree on a visual value, the ERP code wins.

## Before you change anything

1. Run `git status` in `technicon-sales-erp`. The branch has many uncommitted changes. **If the working tree isn't clean, stop and ask me** to commit them, so this restyle stays separate. Don't commit, stash or discard anything yourself.
2. Once it's clean, ask me to approve creating a new branch such as `feat/erp-design`.
3. Read these in the sales app: `web/src/components/Layout.tsx`, `web/src/components/ui.tsx`, `web/tailwind.config.js`, `web/src/index.css`, `web/public/sw.js`, `web/src/lib/roles.ts`.
4. Read these in the ERP: `src/styles.css`, `src/styles/shell.css`, `src/styles/ds.css`, `tailwind.config.js`, `src/components/layout/TopNav.tsx`, `src/components/layout/Dock.tsx`, `src/components/app-header.tsx`, `src/lib/theme.ts`, `src/components/ds/`.
5. Tell me your plan briefly, then start with Phase 1.

## Must not change

- API calls, `web/src/lib/api.ts`, and anything under `api/`, `test/` or the database.
- Business logic, validation, routes and URLs.
- Who sees what. Keep every `show:` rule from the current `NAV`, and the role checks in `App.tsx`.
- Offline support: the outbox, `SyncBanner`, conflict handling, `web/public/sw.js` behaviour, and the installable app.
- Print layout for the weekly report.
- Don't read `.env`, `.env.test` or `.dev-logins.txt`. Don't add sample data or features that don't exist.

## Allowed new dependencies

Only these three: `lucide-react`, `@radix-ui/react-dropdown-menu`, `@fontsource/outfit`. Ask me before adding anything else. Don't add Recharts, shadcn or Radix Select unless I agree.

## Important trap: colour names clash

The two apps use the same Tailwind names for different things. **Don't paste the ERP `tailwind.config.js` over the sales one.** That would silently miscolour hundreds of class uses, with no build error.

| Sales class | Means in sales | Means in ERP | Map to |
|---|---|---|---|
| `ink` | Main text | Inverted colour | `--fg` |
| `ink-muted` | Secondary text | Not defined | `--muted` |
| `ink-faint` | Pale text | Not defined | `--faint` |
| `accent` | Orange | Grey tile | `--cta` |
| `accent-dark` | Dark orange text | Not defined | `--warn` |
| `accent-soft` | Pale orange | Not defined | `--warn-bg` |
| `brand` | Blue | Not defined | `--accent` |
| `brand-dark` | Hover blue | Not defined | `--brand-navy` |
| `brand-soft` | Pale blue | Not defined | `--accent` at 10% |
| `line` | Border | 7% line | `--line-rgb` at 13% |
| `canvas` | Page background | Page background | `--bg` |
| `danger`, `danger-soft` | Error | Not defined | `--bad`, `--bad-bg` |
| `ok`, `ok-soft` | Success | Not defined | `--good`, `--good-bg` |

Keep those sales names, pointing at the ERP variables, so existing screens recolour at once. Use the `t()` helper from the ERP config so opacity modifiers keep working. Also add these ERP names, which don't clash: `surface`, `surface2`, `tile`, `fg`, `subtle`, `faint`, `onaccent`, `cta`, `oncta`, `good`, `goodbg`, `bad`, `badbg`, `warn`, `warnbg`, `line2`.

Then replace values that a config can't fix:

| Find | Replace with | Why |
|---|---|---|
| `bg-white` | `bg-surface2` | Otherwise dark mode breaks |
| `text-white` on `bg-brand` | `text-onaccent` | Accent takes dark text in dark mode |
| `amber-*` classes, stray hex colours | `warn`, `warnbg` and other tokens | They aren't in the palette |
| `font-bold`, `font-semibold` | `font-medium` | The ERP uses weight 500. Keep brand name weights as in `shell.css` |

Also copy from the ERP config: `darkMode: ["class"]`, `fontFamily`, `borderRadius`, `boxShadow`, `transitionTimingFunction`, `keyframes`, `animation`, and the custom `screens`.

## Phase 1: design foundation

1. Copy `src/styles/shell.css` and `src/styles/ds.css` from the ERP into `web/src/styles/`, unchanged. Import them after `index.css` in `web/src/main.tsx`, in the same order as the ERP.
2. Into `web/src/index.css`, copy these parts of the ERP `src/styles.css`, keeping the current `@tailwind` lines:
   - Lines 13 to 78: tokens and base rules
   - Lines 80 to 87: theme reveal and reduced motion
   - Lines 89 to 114: scrollbars
   - Lines 252 to 287 and 301 to 316: base input and select rules
   - Lines 318 to 360: searchable select, if you use it for `CompanyPicker`
   - Lines 798 to 800: modal centring

   **Don't copy the rest.** The other lines are old styling.
3. Keep the sales rule that makes inputs 16px below 640px, and place it last so it beats `input.ts-fi` in `ds.css`. It stops iPhones zooming on focus.
4. Load Outfit (weights 300 to 700) from `@fontsource/outfit`, not Google Fonts, so offline use still works. Offline, the ERP's Google Fonts link would fall back to another font.
5. Copy `src/lib/theme.ts` and the theme script in the ERP's `index.html`, so the theme applies before first paint. Update `theme-color` for the new palette.
6. Copy `src/components/ds/` (`CountUp`, `Seg`, `Spark`, `Gauge`, `RevenueBars`, `format.ts`).
7. Build. Screens should already be in the new colours and font.

## Phase 2: app shell and navigation

**The ERP has no sidebar.** Remove the 240px white sidebar and use the ERP layout: top bar and pill navigation in the centre, with a floating dark dock. Rewrite `web/src/components/Layout.tsx` using `ts-shell`, `ts-top`, `ts-navwrap`, `ts-nav`, `ts-acts`, `ts-main` and `ts-page`, porting `TopNav.tsx` and its sliding indicator. Key `ts-page` by pathname, as in `AppShell.tsx`, so each page plays the entrance animation.

### The 15 sections

Every section keeps its current route, name and `show:` rule. Hide a group when the user's role can see nothing in it.

| Menu | Section | Route | Description in the menu |
|---|---|---|---|
| **Today** (direct link) | Today | `/` | |
| **Sales** | Visits | `/visits` | Customer visits, newest first |
| | Pipeline | `/pipeline` | Deals by stage |
| | Follow-ups | `/tasks` | What needs doing next |
| | Quotation requests | `/quotation-requests` | Requests waiting for a quotation |
| **Accounts** | Companies | `/companies` | Shared list of customer companies |
| | Tenders | `/tenders` | Deals marked as tenders |
| | Renewals | `/renewals` | Renewals and reorders |
| | Products | `/products` | What we sell, by make |
| **Insights** | Performance | `/performance` | Your numbers, or the team's |
| | Sales analysis | `/analysis` | Where deals drop out, and what should close when |
| | Weekly report | `/reports` | Weekly sales report |
| **Manage** | Team | `/team` | Salespeople and their work |
| | Approvals | `/approvals` | New companies to check and approve |
| | Admin | `/admin` | Users, catalogue, imports and audit log |

These descriptions follow the wording already on each page. Keep them true if a page changes.

### Top bar

- **Brand (left):** keep the Sales logo. Don't use the ERP's `technicon-logo.png`, because it says "Technicon Services". Use `/icon-64.png` in `ts-logo-wrap`, with `TECHNICON` in bold and `SALES` beside it, inside `ts-brand-name`.
- **Main action (right):** `ts-newq` in orange, labelled "Log a visit" as it is today, linking to `/visits/new`. Show it only when `canWriteCrm` allows. Press `N` to open it, ignoring keypresses while typing, as in `app-header.tsx`.
- **Reminders:** the existing `ReminderBell` as `ts-iconbtn`, linking to `/notifications` with the unread count.
- **Account:** a `ts-iconbtn ts-avatar` with initials. It opens a `ts-menu` showing the username, the role label and "Sign out".

### Dock

Use `ts-dock` and `ts-dk`. There is no global search or AI assistant in this app, so don't add those buttons.

- **Desktop (left edge):** Log a visit (if allowed), Pipeline, Follow-ups, a divider, then the theme switch.
- **Phones (860px and below, bottom centre):** this replaces the bottom tab bar, with the same five destinations: Today, Visits, Pipeline, Follow-ups, More. Every button needs an `aria-label`. Move the theme switch to the More page.
- Keep `web/src/pages/More.tsx` working. It's how phone users reach the other sections.

Keep `SyncBanner` directly under the top bar. Keep `print:hidden` on the top bar and dock.

## Phase 3: shared components

Restyle `web/src/components/ui.tsx` **without changing any component's name or props**. This updates most screens at once.

| Component | New styling |
|---|---|
| `Button` primary | `ts-btn ts-dark` |
| `Button` secondary | `ts-btn ts-ghost` |
| `Button` danger | `ts-btn ts-danger-t`, plus a `ts-ghost` surface |
| `Button` ghost | `ts-btn` with no surface |
| `Button` size `sm` | Add `ts-xs` |
| `TextField`, `SelectField`, `TextAreaField` | `ts-lbl` label, `ts-fi` control, `ts-hint` hint |
| `Card` | `ts-card ts-white !p-0`, since `CardHeader` and children set their own padding. Support `--i` for stagger |
| `CardHeader` | `ts-rhead`, with a 15px medium title and a `ts-muted` description. Use a dashed bottom line |
| `Badge` neutral, muted | `ts-st` |
| `Badge` brand | `ts-st ts-sent` |
| `Badge` ok | `ts-st ts-tone-good` |
| `OverdueBadge` | `ts-st ts-tone-bad` |
| `StuckBadge` | `ts-st ts-tone-warn` |
| `Notice` error, success | `ts-warnbox`, `ts-okbox`. Keep `role` and dismiss |
| `PageHeader` | `ts-phead` with `ts-title` and a `ts-muted` description |
| `EmptyState` | `ts-dempty`, centred, in `text-subtle` |

Also restyle:
- `BulkBar`: `ts-card ts-white ts-selbar`
- `CompanyPicker`: `.searchable-select-*` styling, keeping its behaviour
- `TenderCard`, `TaskItem`, `ContactLogCard`, `DealFields`, `InstalledBase`: move to `ts-` classes and tokens

Keep touch targets at least 44px on phones. Status colours must always come with text. Use `ts-tone-*` rather than `ts-st ts-active`, which has a colour conflict in `ds.css`.

## Phase 4: pages

Work on **one page at a time, in this order**. Run the build after each, fix every error, then continue. Follow the ERP page named in each row, and keep all existing behaviour.

| # | Section | File | ERP page to follow | Layout |
|---:|---|---|---|---|
| 1 | Today | `pages/Today.tsx` | `Dashboard.tsx` | `ts-phead`, `ts-grid ts-kpis` with `ts-kpi-sm` and `CountUp`, then lists as `ts-row-half` |
| 2 | Pipeline | `pages/pipeline/Pipeline.tsx`, `DealDetail.tsx` | `sales/SalesPipeline.tsx`, `QuotationDetail.tsx` | Desktop `ts-kboard`, `ts-kcol`, `ts-kcard`. Keep the one-stage view on phones |
| 3 | Visits | `pages/visits/Visits.tsx`, `NewVisit.tsx`, `VisitDetail.tsx` | `DeliveryChallans.tsx`, `DeliveryChallanForm.tsx` | List, form and detail recipes below |
| 4 | Follow-ups | `pages/tasks/Tasks.tsx` | `FollowUpsDueToday.tsx` | List with `ts-tabs` or `Seg` |
| 5 | Companies | `pages/companies/Companies.tsx`, `CompanyDetail.tsx` | `Companies.tsx`, `CompanyHealth.tsx` | List and detail |
| 6 | Tenders | `pages/tenders/Tenders.tsx` | `PurchaseOrders.tsx` | List |
| 7 | Renewals | `pages/renewals/Renewals.tsx` | `PurchaseOrders.tsx` | List with `ts-due` and `ts-tone-*` chips |
| 8 | Products | `pages/products/Products.tsx` | `Products.tsx` | List and detail |
| 9 | Quotation requests | `pages/pipeline/QuotationQueue.tsx` | `DeliveryChallans.tsx` | List |
| 10 | Approvals | `pages/companies/Approvals.tsx` | `FollowUpsDueToday.tsx` | List with clear approve and reject actions |
| 11 | Performance | `pages/Performance.tsx` | `BusinessHealth.tsx` | KPIs, `ts-hbar`, `ts-list`, charts only where real data fits |
| 12 | Sales analysis | `pages/Analysis.tsx` | `BusinessHealth.tsx` | `ts-toolbar` filters, then `ts-row2`, `ts-row3` or `ts-row-half` grids |
| 13 | Weekly report | `pages/reports/WeeklyReports.tsx` | `Reports.tsx` | Form and document. **Test printing** |
| 14 | Team | `pages/team/Team.tsx`, `Handover.tsx` | `EngineerList.tsx` | List and form |
| 15 | Admin | `pages/admin/*.tsx` | `Admin.tsx` | Cards, tables, forms |
| Also | Other screens | `pages/SignIn.tsx`, `More.tsx`, `Notifications.tsx`, `SyncStatus.tsx` | `Login.tsx`, `FollowUpsDueToday.tsx` | Sign-in uses the ERP's two-panel login |

For sign-in, use the ERP layout and the wording that's true of this app. Don't invent claims. The decorative curve is fine, because it isn't data.

### Page recipes

**Every page:**
```
ts-page-pad
  ts-phead: ts-title, ts-muted description, ts-grow, actions
  Notice (only on error or success)
  content
```

**List:** `ts-card ts-white ts-tcard ts-tbl`, with `ts-tbar` on top (`ts-search`, `select.ts-fi.ts-sel`, `ts-showing`), then `ts-tblwrap`. Use `ts-r` for figures, `ts-st` for status and `ts-racts` for actions.

**Phones:** the ERP's tables scroll sideways, which is poor for field use. At 860px and below, keep this app's existing card rows, styled with `ts-list` and `ts-li`, wherever a page has them. This is a deliberate difference.

**Detail:** `ts-back`, title and status, `ts-steps` if there's a real workflow, `ts-dw-meta` for facts, then the content cards. Keep the existing tabs and sections.

**Form:** `ts-fgrid` with `ts-g2`, `ts-g3` or `ts-g4` in `ts-card ts-white`. Use `ts-qgrid` with a sticky summary only where a summary already exists.

**Modal:** `fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-[2px]`, containing `ts-modal max-w-md w-full`, with `role="dialog"` and `aria-modal="true"`. Replace the one `window.confirm()` in this app with this.

## Animation

Use the ERP's animation as it comes. `ts-card`, `ts-tbl` rows, `ts-title`, `ts-modal`, `ts-menu` and `ts-page` already animate.

- Set `--i` on cards (55ms stagger) and `--r` on table rows (30ms stagger).
- Use `CountUp` for KPI numbers.
- Don't add other entrance animations on top.
- Never use fill mode `both` on a page wrapper. A held transform traps fixed modals under the header.
- Respect `prefers-reduced-motion`, using `reducedMotion()` in JavaScript.
- Avoid motion in print output.

## States on every screen

| State | Use |
|---|---|
| Loading | `ts-skel`, shaped like the content |
| Empty | `EmptyState` with a plain, specific message |
| Error | `Notice` as `ts-warnbox` |
| Success | `Notice` as `ts-okbox` |
| Offline | Existing `SyncBanner` and saved data |

## Don't copy these ERP problems

- Old classes from the ERP `styles.css`: `.btn`, `.card`, `.stat`, `.badge`, `.field`, `.modal-overlay`, `.data-table`.
- Undefined variables: `--hairline`, `--shadow-card`, `--shadow-lift`.
- The ERP's `PageSkeleton.tsx`, which uses slate and indigo. Use `ts-skel`.
- Emoji icons. Use `lucide-react`.
- `text-faint` for anything people must read. Its contrast is too low, so use `text-subtle`.
- New `alert()` or `confirm()` calls.

## Check after every phase

Run `npm --prefix web run typecheck` and `npm --prefix web run build`. Ask me before running `npm test`, because it may use a test database. Report failures honestly, and don't skip or weaken a test.

Don't connect the app to a production database to test it. If you need data, ask me which test setup to use.

Check in the browser, in light and dark mode, at 390px, 768px, 1280px and 1440px. Compare against the ERP:

- [ ] Same top bar, pill navigation and dock
- [ ] Same card, button, field, table and status chip styling
- [ ] Same title size, font and animation
- [ ] All 15 sections reachable, for every role that had them
- [ ] A salesperson doesn't see Team, Weekly report, Approvals or Admin
- [ ] No sideways page scroll on phones; touch targets at least 44px; inputs don't zoom on iPhone
- [ ] Offline still works: the app opens, shows saved data, queues changes and uses the right font
- [ ] Weekly report prints cleanly, without the top bar or dock
- [ ] No `bg-white`, `amber-*` or hardcoded hex colours left in `web/src`
- [ ] No changes in `api/`, `web/src/lib/api.ts` or the ERP project

## Finish

Don't commit, push or deploy unless I ask. Give me:

1. What changed, by phase
2. What you verified, with screenshots of Today, Pipeline and one list page, in both themes
3. Anything you couldn't check
4. Anywhere you had to differ from the ERP, and why

Start with "Before you change anything". Stop after Phase 1 and show me before moving on.
