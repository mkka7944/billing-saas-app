# Session Log

> Running log of all development sessions. Appended each session.
> Session logs extracted from `docs/MASTER.md` during restructure (2026-06-14).
> For phase catalog, see `docs/PHASES.md`. For current state, see `.opencode/context.json`.

---

## 2026-06-14 â€” Context Handoff System + Proxy Rename

### Phase: Infrastructure â€” Handoff System + Proxy Migration

### What
- Renamed `src/middleware.ts` â†’ `src/proxy.ts`, function `middleware` â†’ `proxy`
- Narrowed proxy matcher to exclude `/api/*` (80% fewer invocations, zero security regression)
- Created `.opencode/context.json` â€” machine-readable state snapshot for session handoff
- Created `docs/SESSION.md` â€” running session log (replaces session logs in MASTER.md)

### Key Decisions
- Option A (narrow matcher) chosen â€” API routes already self-authenticate
- Manual rename over codemod (simpler, safer)
- Handoff files tracked in git so state syncs across office/home PCs

### Build Verification
- `npx next build` â€” compiled successfully, all 48 routes, `Æ’ Proxy (Middleware)` detected

### Next
1. Restructure MASTER.md â€” extract session logs, archive conversation transcripts
2. Correct PHASES.md phase status discrepancies (5 phases actually partial)
3. Update AGENTS.md with handoff instructions

---

## Session Logs from MASTER.md (extracted during restructure)

The following session logs were extracted from the original MASTER.md during the
2026-06-14 restructure. They preserve the full development history.

### 2026-05-25 (Domain Separation Discovery) ΓÇö Location: Home
**Focus:** Fixing month dropdown, surveys API timeout, and discovering fundamental domain coupling bug
**Done:**
- Created `011-performance-indexes.sql` ΓÇö added missing indexes (`survey_units.status`, `survey_units.consumer_name` trigram, `payment_history.payment_status`, `bill_items` composite) ΓÇö fixed surveys API timeout ("canceling statement due to statement timeout")
- Updated `/api/bill-months` to fallback to `payment_history` when `bill_months` reference table is empty
- Re-seeded `bill_months` from `payment_history` (OCT2025ΓÇôMAY2026 now show)
- Ran `run_historical_migration.py --payments-only` ΓÇö confirmed all 122K payment records already exist (duplicate key errors)
- Fixed `get_billing_summary` RPC to use `payment_history` as primary source instead of `bill_items` ΓÇö now shows `total_collected` and `total_paying` for ALL months, not just current
- Fixed surveys API payment filter ΓÇö removed `.eq('bill_month')` from bill_items lookup (psidΓåösurvey_id mapping is stable across months)
**Key discoveries:**
- **Domain coupling bug:** `payment_history` had no direct geography link ΓÇö it relied on `bill_items` (a monthly snapshot) as the bridge. This caused all non-current months to show zero payments.
- **Fix:** `psid` is a stable property-level identifier ΓÇö it belongs on `survey_units`, not as a coupling point. Adding `psid` to `survey_units` decouples billing from payments.
- **PDF bill number** comes from `pdf-bill-printer.py` mapping file, NOT from lifecycle XLSX. Lifecycle only has a boolean `is_issued` (PDF Issued) column.
- **Biller data and payments are separate domains** ΓÇö should never be intermingled in the same query path.
**Next session:**
- Phase 0f: Schema restructuring ΓÇö add `psid`, `last_verified_month`, `house_corrections`, delivery tables, revise RPCs, archive legacy

### 2026-05-25 (Schema Restructuring Plan) ΓÇö Location: Office
**Focus:** Comprehensive schema restructuring to fix domain coupling, add delivery accountability, clean legacy
**Done:**
- Analyzed full DB schema (11 SQL files, all API routes, TypeScript types, 618-line MASTER.md)
- Designed 6-step Phase 0f migration plan:
  1. `012-add-psid-to-survey-units.sql` ΓÇö decouples payments from bill_items via survey_units.psid
  2. `013-add-verification-tracking.sql` ΓÇö last_verified_month for GPS verification tracking
  3. `014-house-corrections-table.sql` ΓÇö replaces `verified_houses` with FK-linked, auditable corrections
  4. `015-revise-rpcs.sql` ΓÇö 5 RPCs updated for survey_units.psid + reference tables
  5. `016-delivery-tracking-tables.sql` ΓÇö 4 new tables (daily_assignments, assignment_items, delivery_photos, staff_daily_stats)
  6. Archive legacy tables (`verified_houses`, `staff_sync_logs`) to JSON before dropping
- Decided: No legacy data import needed (stale corrections, unlinked photo logs)
- Decided: Separate `delivery_photos` table (not array column) ΓÇö better for GAS webhook async flow
- Decided: Composite PK `(psid, bill_month)` for bill_items ΓÇö enables historical billing queries
- Added 3 new edge case decisions (#13-#15): GPS correction flow, legacy archive, primary PSID resolution
- Updated MASTER.md extensively: Section 6 tables, 6.3 Core Schema, 6.4 Triggers, 6.7 Migration Order, Section 9 Edge Cases, Section 10 Phases (0f added, A revised), estimates, changelog
**Key decisions:**
- `delivery_photos` table over array column ΓÇö avoids race conditions with GAS webhook concurrent uploads
- No legacy import ΓÇö corrections stale, photos unlinked. Archive to JSON for reference.
- Composite PK for bill_items ΓÇö enables querying past monthly billing amounts and is_issued history
**Next session:**
- Continue Phase 0f from Step 0f.3 (house_corrections table)

### 2026-05-26 (Storage Crisis ΓåÆ Lean Schema Redesign) ΓÇö Location: Office
**Focus:** Drop from 480MB to 126MB by eliminating bill_items + VACUUM FULL
**Done:**
1. **DB optimization** ΓÇö Dropped `image_urls` column, orphan indexes, unused survey_units columns
2. **Schema restructure** ΓÇö Moved billing columns to survey_units, eliminated bill_items
3. **Data import** ΓÇö Enriched 207K survey_units, imported 122K payments
4. **JSON export scripts** ΓÇö bills.json (146MB), payments.json (12MB), kpis.json
5. **API routes updated** ΓÇö surveys, surveys/payments, billing-stats, data-insight
6. **VACUUM FULL** ΓÇö Ran via Supabase Management API. Reclaimed ~206MB of bloat.
7. **Dropped** `survey_photos_backup` (46MB backup of old image_urls column), `bill_items`, `payment_summary`, `saved_routes` shells
**DB footprint:** survey_units 82MB + payment_history 32MB + reference/delivery tables <1MB = **126MB total**
**Monthly growth:** ~12MB (payment imports). ~31 months runway to 500MB.
**Next session:**
- Phase A.1: `GET /api/assignments` + `POST /api/assignments` endpoints

### 2026-05-26 (Option A Nav Fixes + RPC Aggregation) ΓÇö Location: Office
**Focus:** Navigation audit fixes, eliminating 1MB response limit via aggregation RPCs, Apply/Update buttons
**Done:**
- **Option A navigation fixes (6 changes):**
  - Created shared `AppHeader.tsx` component (replaces 3 different inline headers)
  - Display `pageTitle` from billing-ui-store in header
  - Set `setPageIdentity()` on every page (`/map`, `/assignments`, `/route`, `/deliver`, `/settings`, `/stats`)
  - Renamed "Staff Stats" ΓåÆ "Delivery Stats" with `ClipboardCheck` icon in sidebar
  - Hide bottom tabs on non-map routes
  - Debounced resize handler in AppShell (100ms)
- **`unit_type` column removed** ΓÇö never existed in Supabase DB, was only in TypeScript type, API COLS, and filter components. Removed from `surveys/route.ts`, `types/index.ts`, `house-detail-sheet.tsx` (now uses `billing_category`)
- **`.in(psid)` array chunking** ΓÇö created `chunkArray(arr, 800)` helper. Applied to surveys, data-insight routes for payment_history + assignment_items + delivery_photos queries. Avoids Supabase URL length limits.
- **Discovered PostgREST limitations:**
  - `sum:amount_due` syntax returns column values, NOT SUM aggregates (`"Use of aggregate functions is not allowed"`)
  - `distinct=psid` parameter fails with `400`
  - No way to do server-side SUM or DISTINCT through REST API
- **Created `019-aggregation-rpcs.sql`** ΓÇö two RPCs for server-side aggregation:
  - `get_billing_stats(p_month, p_district, p_tehsil)` ΓÇö grand totals + tehsil/UC/category breakdowns with payment joins
  - `get_hierarchy_stats(p_month, p_district, p_tehsil, p_uc, p_status)` ΓÇö KPIs + grouped rows with payment joins
- **Updated `billing-stats/route.ts`** ΓÇö replaced 172K-row fetch + client-side aggregation with `sup.rpc('get_billing_stats')`. Field names remapped to match frontend expectations.
- **Updated `data-insight/route.ts`** ΓÇö replaced 172K-row fetch with `sup.rpc('get_hierarchy_stats')`. Delivery KPIs computed from independent `assignment_items` queries (no psid dependency). Added try-catch error handling.
- **Added `pendingFilters` to billing-store** ΓÇö `setPendingFilter`, `applyFilters`, `cancelFilters` actions. DesktopFilterBar writes to `s.filters` directly (auto-apply). MobileFilterSheet writes to `pendingFilters` (pendingΓåÆapply pattern). `setFilters` keeps both in sync.
- **Apply/Update buttons** in DesktopFilterBar's `ActionButtons` ΓÇö Update (Γå╗) calls `queryClient.invalidateQueries()`. Apply/Cancel appear when `pendingFilters` Γëá `filters` (after mobile sheet changes).
- **Fixed RPC bug** ΓÇö `ELSE psid` ΓåÆ `ELSE base.psid` in `get_hierarchy_stats` (ambiguous column reference with `pays` CTE).
- **Error display** ΓÇö `DataInsight` component now shows error state with server message.
- **`useDataInsight` hook** ΓÇö forwards server error message instead of generic "Failed to fetch data insight".
**Key discoveries:**
- PostgREST cannot do aggregate functions via REST API at all ΓÇö RPCs are the ONLY path for server-side aggregation
- `.range(0, 1_000_000)` is a band-aid ΓÇö Supabase's 1MB response body limit silently truncates rows, making client-side aggregation unreliable
- `pendingFilters` pattern requires careful sync ΓÇö DesktopFilterBar must write to `s.filters` AND keep `pendingFilters` in sync via `setFilters`
- The 172K `survey_units` table will never fit through REST for aggregation ΓÇö RPCs are mandatory
**Next session:**
- Run fixed `019-aggregation-rpcs.sql` to resolve `psid` ambiguous column error
- Continue Phase A: Admin Assignment UI (`GET/POST /api/assignments` + `/assignments` page)
- Backlog: Remove `.range(0, 1_000_000)` from remaining routes (bill-months, surveys psid query, assignments, routes)

### 2026-05-25 (Phase 0f Start ΓÇö Steps 0f.1 + 0f.2) ΓÇö Location: Office
**Focus:** Execute Phase 0f schema restructuring ΓÇö first 2 migrations
**Done:**
- Created `scripts/sql/012-add-psid-to-survey-units.sql` ΓÇö adds `psid` to `survey_units`, backfills from `bill_items`, creates unique partial index + JOIN index
  - Column already existed from partial prior run (4,682 rows populated)
  - UPDATE backfilled remaining 207K+ rows using `bill_items.survey_id` match
  - Verified: 0 unmatched rows, all survey_units with matching bill_items got psid
- Created `scripts/sql/013-add-verification-tracking.sql` ΓÇö adds `last_verified_month` to `survey_units`, creates partial index
- Updated MASTER.md: Phase 0f progress tracked, changelog v5.2
**Key finding:** `survey_units.psid` already existed from previous partial run (4,682 rows). Migration ran cleanly ΓÇö `ADD COLUMN IF NOT EXISTS` skipped, UPDATE handled remaining rows.
**Next session:**
- Continue Phase 0f ΓåÆ Step 0f.3: `014-house-corrections-table.sql`
- Steps remaining: 0f.3 (house_corrections), 0f.4 (revise RPCs), 0f.5 (delivery tables), 0f.6 (archive legacy)
- Then Phase A: Admin Assignment API + UI

---
### 2026-05-26 (Phase D Visual Rehaul + City Context Selector) ΓÇö Location: Office
**Focus:** Complete Phase D visual rehaul, add city context selector (replacing district/tehsil cascade), fix all cascading bugs
**Done:**
- **Phase D complete (D.1-D.6):** Staff route guard (`/`ΓåÆrole-based redirect), staff mobile layout (bottom tab nav, progress bar, Today's Stats), sidebar review (no changes needed), filter bar polish (already well-implemented), theme system (removed `forcedTheme`, 5 themes, `.staff-light-mode`), touch target audit (h-11 buttons, h-12 primary, min-h-[48px] tabs)
- **Stats/assignments/route pages:** Wrapped in AppShell, tables overflow-x-auto, action bars responsive
- **Burger menu fix:** Removed `hidden lg:flex` wrapper on sidebar in AppShell
- **Bottom tabs reduced:** Map | List | Deliver; Dashboard/Insight moved to sidebar
- **DesktopFilterBar global:** Shown on all admin pages via AppShell
- **AppHeader restructured:** Two-row mobile layout with search + filter row
- **Update button animation:** Spinning icon during fetch, "Updated" checkmark for 2s
- **MobileFilterSheet:** Active filter count badge, backdrop blur, h-12 buttons
- **City selector ΓÇö 6 steps:**
  1. `billing-store.ts` ΓÇö `selectedCity` + `setCity()` with Zustand persist + `merge` for rehydration
  2. `CitySwitcher.tsx` ΓÇö Gradient avatars (emerald=Sargodha, amber=Khushab, blue=Bhalwal, primary=All)
  3. `filter-panel.tsx` ΓÇö Removed District/Tehsil accordions/dropdowns; UC options scoped by city
  4. `kpi-cards.tsx` ΓÇö Passes `selectedCity` + tehsil to billing stats hook
  5. `assignments/` ΓÇö Hook/API/page updated for city + tehsil filtering
  6. `routes/` ΓÇö Hook/API/page updated for city + tehsil filtering
- **Bug fixes:**
  - Uppercase DB values: `SARGODHA` vs title case `Sargodha` ΓÇö fixed `setCity`, `merge`, UC memos
  - Rehydration sync: replaced `onRehydrateStorage` with `merge` (synchronous, triggers re-render)
  - Duplicate UC keys: deduplicated by `value` in UC dropdown
  - 3-city district+tehsil mapping: CitySwitcher passes `(city, district, tehsil)`, UC memos match exact `{district}::{tehsil}` keys, all APIs updated for tehsil filter
  - Clear button: now calls `setFilters` (immediate apply) instead of `setPendingFilter` ΓÇö no Cancel/Apply flash
  - Map flyTo: `CITY_CONFIG` includes `lat`/`lng`, `setCity` updates `mapCenter`, `MapFollower` component calls `map.flyTo()` with 1.2s duration
- **Phase D commit:** pushed to git (`f404b31`)
- **All changes:** `npx tsc --noEmit` passes with zero errors
**Key decisions:**
- 3-city mapping: Sargodha=SARGODHA::SARGODHA, Bhalwal=SARGODHA::BHALWAL, Khushab=KHUSHAB::KHUSHAB (not 2 district-level groups)
- City selector is persisted via Zustand persist (`selectedCity` only); filters not persisted
- `setCity` updates BOTH active and pending filters immediately (city is context, not pending)
- City change clears UC selection (prevents stale cross-city UC filters)
- "Clear" button immediately applies cleared state (no pendingΓåÆapply gap)
- Map flyTo uses Leaflet's native `map.flyTo()` with 1.2s duration (smooth, not jerky)
- Data Insight already wired to global filters ΓÇö no changes needed
**Next session:**
- Decide Phase order: Phase A (Admin Assignment UI) or Phase B (Field Staff Delivery UI) or pending fixes
- Remaining: Remove `.range(0, 1_000_000)` from remaining routes, fix `.in('tehsil', [])` edge case
- Backlog: Payment filter refetch trigger, `.eq('payment_status', ...)` for payment filter optimization

### 2026-06-01 (Data Pipeline Overhaul ΓÇö Phases 1-6 Defined + Migrations 026-028) ΓÇö Location: Home
**Focus:** Complete pipeline analysis, create staff sync trigger, pipeline tables, start_month migration, define Phases 1-6
**Done:**
- **Migration 026** `026-staff-sync-trigger.sql` ΓÇö `trg_sync_profile_to_staff` on `profiles` INSERT/UPDATE/DELETE: auto-creates/updates/deactivates `staff` rows for `field_staff` profiles
- **Migration 027** `027-pipeline-tables.sql` ΓÇö created `flagged_psids`, `bill_print_log`, `ingest_log` with indexes + RLS
- **Migration 028** `028-start-month.sql` ΓÇö added `start_month text` + index to `survey_units`
- Verified `/api/staff` returns both existing + synced field_staff rows
- **Data pipeline deep research (4 Office PC scripts):**
  - `bill-extractor-v4.py` (daily) ΓÇö fetches payment CSV, drops city/tehsil/uc during upsert ΓåÆ "Unknown" chart cities
  - `pdf-psid-extractor.py` (monthly) ΓÇö reads A4 PDFs ΓåÆ lifecycle XLSX with 57+ columns (10 "PDF Issued" booleans, paid flags, etc.)
  - `pdf-bill-printer.py` (monthly) ΓÇö generates sorted A5 PDFs, bill numbers per UC from route_seq sort
  - `survey_filtered.py` ΓÇö survey data from portal
  - Printer cache JSON has psid_map (~105K entries per city) but is NOT loaded to DB
  - Critical: `survey_units` needs 13 new columns from lifecycle (consumer_name, address, city_district, tehsil, uc_name, surveyor_name, survey_date, survey_time, lat, lng, start_month, status/ARCHIVED)
- **Phases 1-6 defined** for pipeline overhaul:
  - Phase 1: Copy reference scripts from Office PC
  - Phase 2: Rewrite `enrich-survey-units.py` (21-field upsert)
  - Phase 3: Create `load-payments.py` (payment CSV ΓåÆ payment_history)
  - Phase 4: Add city/tehsil/uc_name columns to `payment_history` + update RPCs
  - Phase 5: Create `ingest-all.py` orchestrator (interactive menu)
  - Phase 6: Bill metadata display in HouseDetailSheet
  - Phase 2b (deferred): Drop `amount_due` column
- **`SUPABASE_ACCESS_TOKEN` saved to `.env.local`** ΓÇö Management API now accessible (PAT token `sbp_...`)
- Updated `docs/SCHEMA.md` with all new tables, columns, migration 026-028
- Updated `docs/MASTER.md` Section 5 (pipeline flow), Section 7 (monthly workflow), Section 10 (Phases 1-6), Section 16 (pipeline reference replacing aspirational future workflow)
- Updated `AGENTS.md` with new monthly workflow, Supabase access methods, scripts reference
**Key decisions:**
- Lifecycle XLSX is single source of truth for survey_units (21 fields)
- `amount_due` to be dropped ΓÇö SWMC miscalc, app uses `monthly_fee + arrears`
- Payment CSV geography (city_district, tehsil, uc_name) already in source ΓÇö store directly in `payment_history` to eliminate "Unknown" chart cities
- Printer cache JSON stays local ΓÇö bill metadata reconstructable from DB data
- Bill numbering replicable in app: `route_number ASC ΓåÆ route_seq ASC ΓåÆ survey_id DESC` within each UC
- Daily payment upsert keyed on `(psid, bill_month)` ΓÇö idempotent
**Implementation (same session):**
- **Phase 1 executed** ΓÇö Copied 5 scripts + config.py from Office PC to `scripts/ref/`, verified Python syntax
- **Phase 2 executed** ΓÇö Rewrote `enrich-survey-units.py`:
  - Added 12 new fields: consumer_name, address, city_district, tehsil, uc_name, surveyor_name, survey_date, survey_time, lat, lng, start_month, status (ARCHIVED if Deleted=Yes)
  - Added `--exclude-ghosts` flag ΓÇö skips PSIDs in `flagged_psids` table
  - Added diff report (new vs updated vs skipped counts via pre-query of existing survey_ids)
  - Added reference table sync (surveyors, bill_months)
  - Added audit log write to `ingest_log`
- **Phase 3 executed** ΓÇö Created `load-payments.py`:
  - Reads combined payment CSV, upserts to `payment_history` on `(psid, bill_month)` conflict key
  - Includes city_district, tehsil, uc_name from CSV columns (already in DB)
  - Idempotent, batch upsert (500), audit log
- **Phase 4 verified** ΓÇö RPC `get_charts_data` already uses `ph.city_district`/`ph.tehsil` directly ΓÇö no changes needed
- **Phase 5 executed** ΓÇö Created `ingest-all.py` orchestrator:
  - Interactive menu: [1] Full Monthly [2] Daily Update [3] Quick Sync [q] Quit
  - CLI: `--month`, `--daily`, `--file`, `--dry-run`
- **Phase 6 executed** ΓÇö Bill metadata in HouseDetailSheet:
  - Created `GET /api/surveys/[survey_id]/bill-info` ΓÇö returns bill number within UC, route info, paid months, start_month
  - Added `BillInfo` type to `src/types/index.ts`
  - Added `useSurveyBillInfo` hook to `use-survey-data.ts`
  - Replaced "Coming soon" placeholder with live Bill Summary section showing Bill #N/M, route name, paid months, current month
- `npx tsc --noEmit` passes with zero errors
**Next session:**
- Phase 2b (deferred): Drop `amount_due` column
- Deploy ingest scripts to Office PC and test with live data

### 2026-05-29 (Payment History Fix + amount_due ΓåÆ monthly_fee+arrears + KPI Redesign) ΓÇö Location: Home
**Focus:** Fix payment history full timeline, replace amount_due with monthly_fee+arrears, compact KPI cards for dark mode
**Done:**
- **PaymentHistoryCard complete history fix** (`src/app/api/surveys/payments/route.ts`):
  - Removed Supabase `.order('bill_month')` ΓÇö alphabetical sort was wrong ("APR" < "JAN" < "MAR")
  - Added `monthKey()` helper ΓÇö converts `"MMMYYYY"` ΓåÆ `year*12 + monthIndex` for real chronological sort
  - Client-side `.sort()` by monthKey ensures correct oldestΓåÆnewest ordering
  - 24-month lookback (`d.setMonth(d.getMonth() - 23)`) replaces `start_month` (bill_items was dropped, no start_month available)
  - `earliestMonth` = min(oldestPayment, lookback) so all months from 2yr ago to present are generated
- **amount_due ΓåÆ monthly_fee + arrears** across all surfaces (12 files):
  - Added `monthly_fee`, `arrears` to types: `UnitRow`, `RouteUnit`, `UnassignedBill`, `AssignmentItemUnit`
  - Added `monthly_fee, arrears` to API SELECTs: data-insight drill-down, assignments PSID_COLS, staff items query, routes ROUTE_UNIT_COLS
  - Changed UI displays: data-insight unit table "Current Bill" column, route page Amount cell, assignments page Amount cell, deliver-bottom-sheet/map/card-list bill display
  - Data Insight unit table: removed Status + old Due columns, added "Current Bill" (monthly_fee+arrears), renamed Paid header with blue "Current" badge
- **KPI cards compact redesign** (`src/components/data-insight.tsx`):
  - Before: CardHeader (label + badge with value) + CardContent (same value duplicated) ΓÇö double values, broken in dark mode (`bg-blue-100`, `text-blue-600`)
  - After: Single-line compact divs ΓÇö colored dot (bg-*-500) + label (text-muted-foreground) + single value (text-*-500 accent)
  - Dark mode safe: `.500` accent colors are saturated enough on both white/gray backgrounds; text uses CSS variables (auto-adapt)
  - Data KPIs: `grid-cols-2 sm:4 lg:7 gap-2` (was 3 cols with Card gap)
  - Delivery KPIs: same compact pattern ΓÇö icon + label + single value
  - Loading skeleton updated to match compact layout
  - Removed unused `CardHeader`, `CardTitle` imports
- **MASTER.md updated:** bill_items references removed from sections 5, 6, 7, 9. Data model table updated. Pipeline renamed to enrich-survey-units.py. New Section 16 added (future workflow proposal).
**Key decisions:**
- No `start_month` available in database (bill_items was dropped). Using 24-month rolling lookback instead.
- amount_due column kept in DB unchanged ΓÇö only display calculation changed to monthly_fee + arrears
- `.500` accent colors for dark mode compatibility (not `.600`/`.100` light-only colors)
- Supabase's `.order()` uses alphabetical sort, which is wrong for "MMMYYYY" ΓÇö sort client-side with monthKey
- `bill_items` does NOT exist in this Supabase project ΓÇö all enrichment targets `survey_units` directly

### 2026-05-24 (Architecture Reset) ΓÇö Location: Home
**Focus:** MASTER.md rewrite with mobile-first field staff UX + reference table architecture + visual rehaul plan
**Done:**
- Completed full codebase audit (all API routes, hooks, components, stores, types, data flow)
- Identified root cause of all filter/hierarchy issues: PostgREST 1000-row limit on `.select()` queries
- Redesigned filter architecture: 3 reference tables (`hierarchy`, `surveyors`, `bill_months`) replace `SELECT DISTINCT` on 212K-row tables
- Defined two-mode UX: mobile-first field staff (`/deliver`) + desktop-first admin (`/map`)
- Built visual design system for both modes with specific color, typography, and touch target rules
- Restructured implementation phases with realistic hour-based estimates
- Added 4 new edge case decisions (reference table sync, offline photo, staff UC changes)
- Created `GET /api/bill-months` endpoint
- Created `useBillMonths` hook with 60min staleTime
- Updated hierarchy route: RPC-first with fallback to `.range(0, 999999)` (bypasses 1000 limit)
- Updated bill-months route: RPC-first with fallback to direct select
- Fixed level logic in Data Insight route ΓÇö never drops to unit level (stays at UC)
- Fixed `get_survey_group_stats` RPC: `p_uc` is filter-only (no survey_id grouping)
- Fixed `get_billing_group_stats` RPC: same filter-only change
- Added bill month filter to FilterState + billing-store + filter-panel + passed to all API routes
- Added `get_hierarchy`, `get_surveyors`, `get_bill_months` RPCs to `007-data-insight-rpcs.sql`
**Key decisions:**
- Reference tables are the single source of truth for filter dropdowns ΓÇö not RPCs, not DISTINCT queries
- Two separate UX modes with role-based routing (future: route guard)
- Visual rehaul deferred to Phase D (after core data + assignment + delivery work)
- Realistic estimates: ~20 hours total to complete all phases
**Next session:**
- Step 0d.1: Create `010-reference-tables.sql` migration ΓÇö create + populate + trigger
- Step 0d.2: Update hierarchy & bill-months API routes to query reference tables

---
### 2026-05-27 (RBAC System Implementation) ΓÇö Location: Office
**Focus:** Implement RBAC ΓÇö roles table, username-based auth, admin user management, settings page
**Done:**
- **RBAC.1** ΓÇö Created `scripts/sql/020-rbac-system.sql`: `roles` table (super_admin, admin, field_staff), username/role_id/suspended_at/deleted_at on profiles, drops legacy role/permissions columns, RLS policies
- **RBAC.2** ΓÇö Updated `auth-store.ts`: renamed `role` ΓåÆ `roleName`, added `displayName`, `signIn` transforms usernameΓåÆemail via `toEmail()`, checks suspended_at/deleted_at after login, signs out with message
- **RBAC.3** ΓÇö Updated login page: field shows "Username or Email"
- **RBAC.4** ΓÇö `POST /api/admin/users`: validates unique username, creates auth user with service_role key, creates profile row, returns password once
- **RBAC.5** ΓÇö `GET /api/admin/users`: profiles + roles join, status badges
- **RBAC.6** ΓÇö `PATCH/DELETE /api/admin/users/[id]`: edit role, reset password, freeze/unfreeze, soft-delete/restore
- **RBAC.7** ΓÇö `/settings` page: tabs (Appearance/Account/Users), Users tab with data table, add user modal with password reveal, row actions (edit role, reset PW, freeze, delete)
- **RBAC.8** ΓÇö AppHeader shows `displayName` from profile instead of email
- **RBAC.9** ΓÇö All role references updated across 7 files: `role`ΓåÆ`roleName`, `'staff'`ΓåÆ`'field_staff'`, admin checks include super_admin
- **RBAC.10** ΓÇö Applied migration via Supabase Management API (PAT), backfilled admin `kashifkhalil74@gmail.com` as super_admin, E2E tested: create staff user ΓåÆ freeze ΓåÆ login blocked ΓåÆ unfreeze ΓåÆ login works
- **Deleted** `.range(0, 1_000_000)` from 4 remaining routes (bill-months, routes, assignments, surveys)
- **Full app audit** documented 40+ issues in Section 15 (efficiency score 61/100, deferred to Phase Z)
**Key decisions:**
- Username-based auth: app transforms `input` ΓåÆ `input@billing.local` via `toEmail()` for Supabase Auth
- No `permissions` table or `user_roles` join table ΓÇö `role_id` FK on profiles is sufficient for 3-role system
- Soft-delete (`deleted_at`) preserves performance history; hard delete only if GDPR required
- `roleId`ΓåÆ`roleName` join via `roles!inner(name)` on every profile lookup
**Next session:** Phase Z ΓÇö App audit cleanup (10 steps, ~4 hrs) or feature work
**Supabase Access Token:** saved in `.env.local` as `SUPABASE_ACCESS_TOKEN`

---
### 2026-05-27 (Navigation Unification ΓÇö Single Layout for All Users) ΓÇö Location: Home
**Focus:** Eliminate dual-layout system, remove back-button navigation, give staff same search/filter as admin
**Done:**
- **Staff defaults to `/map`** ΓÇö Removed staff redirect to `/deliver` from both `/page.tsx` (home) and `/map/page.tsx`. All users land on `/map`.
- **Deliver page flattened into AppShell** ΓÇö Removed `fixed inset-0` overlay and its own `<AppHeader>`. Deliver page now renders inside standard AppShell layout. Offline/photo/cache indicators moved to a conditional status bar within the deliver page content.
- **Bottom tabs for everyone** ΓÇö Removed `isAdmin` gate on bottom tabs. Map/List/Deliver always visible. Tabs now navigate to `/map` when clicked from other pages.
- **Back-button system fully removed** ΓÇö Removed `forceBack`/`onBack` props, `navHistory` state, `goBack()` method from billing-store. AppHeader always shows burger menu (no dual burger/back). `house-detail-sheet.tsx` replaces `goBack()` with `selectHouse(null)`.
- **Search/filters for staff** ΓÇö Removed `roleName !== 'field_staff'` gate on mobile search/filter row. Removed `isAdmin` gate on DesktopFilterBar. Staff gets full search + filter access on both mobile and desktop.
- **`staff-light-mode`** ΓÇö Moved from deliver page container to AppShell container, applied automatically when `roleName === 'field_staff'`.
- **Cleaned up:** `isDeliverPage`, `isAdmin`, `isMapPage`, `navHistory`, `goBack`, `forceBack`, `onBack` ΓÇö all eliminated. No role-based layout gating remains in AppShell or AppHeader.
- **Sidebar CSS** ΓÇö Fixed `sidebarOpen` translate to use `max-lg:` prefix so desktop sidebar is always visible (no flash on initial load).
**Key decisions:**
- One unified layout for all users (AppShell). Only data access is role-gated, not the UI shell.
- Bottom tabs show on all pages including `/deliver` (creates two tab bars on deliver page: AppShell for page nav, deliver's own for view-mode switching ΓÇö user accepted this tradeoff).
- Back-button system eliminated entirely ΓÇö simpler UX with navigation handled by bottom tabs + sidebar.
- `selectHouse(null)` replaces `goBack()` ΓÇö always returns to map view instead of restoring previous view.
**Edge Cases:**
- Staff on `/deliver` seeing two tab bars (AppShell + internal) is intentional ΓÇö AppShell tabs navigate pages, internal tabs switch delivery view modes.
- `staff-light-mode` applied at AppShell level affects all pages for staff users.
- `navHistory` unbounded growth (L9 in audit) resolved by removing the feature entirely.



### 2026-05-30 (Audit Cleanup + Data Insight Sorting + UI Fixes) ΓÇö Location: Office
**Focus:** Complete audit cleanup items, add global sort system, fix payment history layout and data insight bugs
**Done:**

#### Audit Cleanup (from Phase Z):
- **3 empty `catch {}` blocks** ΓåÆ Added `console.warn()` in `auth-store.ts:110`, `settings/page.tsx:120`, `payments/route.ts:68`
- **3 unused icon imports** ΓåÆ Removed `RotateCw` (`deliver-card-list.tsx`), `PanelLeftOpen` (`BillingSidebar.tsx`), `ArrowRight` (`deliver/page.tsx`)
- **`chunkArray` and `toEmail`** ΓåÆ Extracted to `src/lib/utils.ts`, updated imports in 3 route files (`surveys`, `data-insight`, `admin/users`). Redundant inline definitions removed.
- **Month array consolidation** ΓåÆ 4 redundant `['JAN','FEB',...]` arrays in `payments/route.ts` consolidated into single `MONTHS` export in `constants.ts`. Also used by `currentMonth()` function.
- **`import * as React`** ΓåÆ Replaced with `import type { ReactNode }` in `query-provider.tsx`
- **Dead SQL files archived** ΓåÆ `007-data-insight-rpcs.sql` and `015-revise-rpcs.sql` moved to `scripts/sql/_old/`
- **StaleTime named constants** ΓåÆ `STALE_BILLING` (5min), `STALE_HIERARCHY` (30min), `STALE_ASSIGNMENT` (2min) in `constants.ts`. `query-provider.tsx` updated to use `STALE_BILLING`.

#### Payment History UI Fixes:
- **Column header** ΓåÆ Empty expand chevron column renamed to "History" with `w-8`
- **Repositioned** ΓåÆ History column moved from position 1 to position 7 (just before Action column)
- **Desktop spacing** ΓåÆ Removed `justify-between` from `PaymentHistoryCard` rows (caused month/amount to spread edge-to-edge on wide screens). Replaced with `gap-3`.
- **Right-aligned expanded content** ΓåÆ Expanded row uses `colSpan={8}` with `ml-auto w-fit max-w-[220px]` wrapper so payment info sits under History/Action area
- **Sep 2025 cap** ΓåÆ `allMonths` range in `payments/route.ts` now clamped to `SEP2025` minimum (no unpaid months shown before Sep 2025)

#### House Detail Sheet Improvements:
- **PSID display** ΓåÆ Removed "PSID:" label, shows just `mono bold blue` value + copy button
- **Current Bill badge** ΓåÆ Added below PSID: emerald pill "Current Bill" badge + `monthly_fee + arrears` amount

#### Data Insight State Persistence:
- **CSS hide instead of conditional render** ΓåÆ `DataInsight` component now stays mounted in DOM (hidden via `className`) when switching to detail view. Preserves `drillUC`, `page`, `expandedId` state when returning from house detail sheet.
- One-line change in `map/page.tsx`: `{activeView === 'data-insight' && <DataInsight />}` ΓåÆ `<div className={activeView !== 'data-insight' ? 'hidden' : 'absolute inset-0'}><DataInsight /></div>`

#### MC/UC Sorting Fix:
- **Grouped sort** ΓåÆ MCs sort first (by first numeric value), then UCs, then others. Uses `match(/\d+/)?.[0]` (first number only) instead of `replace(/\D/g, '')` (all digits concatenated). Fixes "MC-17, Block 5/11" sorting as 17 instead of 17511.
- Applied in `data-insight/route.ts` UC sort function.

#### Global Sort System:
- **Types** ΓåÆ Added `SortConfig`, `SortField` (`survey_id`/`surveyor_name`/`survey_date`/`survey_time`), `SortDirection` to `types/index.ts`. Included `sort: SortConfig` in `FilterState`.
- **Store** ΓåÆ Added `setSortConfig` action to `billing-store.ts`. Default sort: `{ field: 'survey_id', direction: 'desc' }` (latest first for drill-down). Sort preserved across filter resets.
- **API routes** ΓÇö Both `surveys/route.ts` and `data-insight/route.ts` accept `sortField`/`sortDirection` query params. Replace hardcoded `.order('consumer_name')` / `.order('psid')` with dynamic sort. Default `survey_id desc` for data insight, `consumer_name` for survey list.
- **Hooks** ΓåÆ `use-survey-data.ts` and `use-data-insight.ts` pass `filters.sort` to API calls.
- **SortSelector component** ΓåÆ `src/components/sort-selector.tsx` ΓÇö reusable dropdown + direction toggle. Field select (Survey ID / Surveyor / Date / Time) + asc/desc arrow button. Placed in `DesktopFilterBar` before ActionButtons.
- **House detail sheet inheritance** ΓåÆ `nextHouse`/`prevHouse` navigation order inherits sort via `houseList` (which is sorted by the same API query).

#### Bug Fix: Duplicate null keys + auto-expand
- **Root cause:** Survey rows with `psid = null` caused `key={row.psid}` to produce duplicate `null` keys. Also `expandedId === row.psid` ΓåÆ `null === null` ΓåÆ `true` for every null-psid row, auto-expanding all of them.
- **Fix:** Changed all keys and expand state to use `row.survey_id` (always unique, non-null) instead of `row.psid`.
- **Note:** Survey records with `psid = null` are **new/unregistered surveys** ΓÇö units surveyed in the field but not yet assigned a PSID from the billing lifecycle system. These have `survey_id` but no matching entry in `payment_history` or `bills.json`.

**Key decisions:**
- `survey_id` as canonical key for frontend lists (not `psid`) ΓÇö it's always unique and non-null
- MC/UC sort grouped: MCs first by first number, then UCs, then others ΓÇö prevents "MC-17, Block 5/11" from sorting after UC-17511
- Sort state lives in `FilterState` and flows through existing filter pipeline (no new mechanism needed)
- CSS hide over Zustand for DataInsight state persistence ΓÇö avoids new store fields, component tree is idle when hidden
- `justify-between` removed from PaymentHistoryCard rows ΓÇö items cluster naturally via `gap-3` at all widths

**Next session:**
- Re-run `019-aggregation-rpcs.sql` to fix `psid` ambiguity in `get_hierarchy_stats` (Data Insight broken until done)
- Phase A: Admin Assignment API (`GET/POST /api/assignments`) + `/assignments` page UI
- Phase B: Field Staff Delivery UI
- Backlog: `.range(0, 1_000_000)` already removed from all routes Γ£à
- Backlog: Refactor audit items from Phase Z as scheduled

### 2026-05-30 (Billing Charts Dashboard ΓÇö RPC Aggregation + Full Data) ΓÇö Location: Home
**Focus:** Build billing charts API with 122K-row aggregation, connect to dashboard, fix month sorting + cycle-relative day labels
**Done:**
- **Created `021-charts-aggregation.sql`** ΓÇö `get_charts_data` PL/pgSQL RPC that aggregates ALL paid `payment_history` rows at DB level:
  - Returns: `monthly_trend`, `daily_detail`, `category_summary`, `tehsil_breakdown`, `monthly_curves`, `kpi`
  - City/tehsil filtering via `EXISTS (SELECT 1 FROM survey_units WHERE psid = ph.psid AND ...)` ΓÇö uses psid index, short-circuits when no filter
  - LATERAL join only for display enrichment (tehsil, billing_category) on the filtered subset
  - Month sorting via `ORDER BY to_date(bill_month, 'MonYYYY')` ΓÇö chronological (Sep ΓåÆ Oct ΓåÆ ... ΓåÆ May)
  - Day calculation: `(paid_date - (to_date(bill_month, 'MonYYYY') + 15) + 1)::int` ΓÇö Day 1 = 16th of bill month
  - Cumulative sum via window function `sum(sum(amount_paid)) OVER (PARTITION BY bill_month ORDER BY paid_date)`
- **Rewrote `/api/billing-charts/route.ts`** ΓÇö 30-line RPC caller + adds `day_label` (from `paid_date.getDate()`) via TypeScript transform. All future display logic lives here, not SQL.
- **Connected Dashboard UI** ΓÇö KPI cards, Monthly Trend, Category Breakdown, Daily Collection Comparison, Office Breakdown all pull from `useBillingCharts`. Removed broken `useBillingStore` dependency. Removed `useBillingStats` dependency.
- **Fixed month sort in chart components** ΓÇö Added `sortMonths()` helper (`year*12 + monthIndex`) to `MonthlyCurvesChart` and `OfficeBreakdownChart`, replacing alphabetical `.sort()` which gave wrong order (APR before FEB).
- **Fixed cycle-relative day display** ΓÇö X-axis tickFormatter shows `16, 17, ...31, 1, ...15` cycle labels. Tooltip shows daily amount in table format (not cumulative). Tooltip `labelMap` uses exact `day_label` from paid_date per row.
- **Removed broken survey_units LATERAL join** (first version timed out on 122K rows). Replaced with EXISTS-based filtering.
- **Dashboard file changes:** `dashboard.tsx`, `monthly-curves.tsx`, `office-breakdown.tsx`, `route.ts`, `types/index.ts`, `021-charts-aggregation.sql`
- **All changes pass `npx tsc --noEmit` with zero errors**.
**Key decisions:**
- Charts aggregation RPC is the **only RPC exception for client-facing features** (beyond admin-only Data Insight). Rationale: 122K payment rows cannot fit through REST API (1MB limit, 1000-row PostgREST limit).
- **Display logic lives in route.ts (TypeScript)**, not SQL. Day labels, formatting, any future presentation tweaks ΓÇö edit `route.ts`, no SQL re-run.
- `+ 15` for cycle offset (16th = Day 1). Month has 30-31 days; X-axis uses approximate labels (16ΓåÆ31, 1ΓåÆ15), tooltip shows exact `paid_date` via `day_label`.
- **No survey_units join in main aggregation** ΓÇö the join caused 30s timeout even with psid index. EXISTS + LATERAL on filtered subset is the fastest approach.
- SQL is `CREATE OR REPLACE FUNCTION` ΓÇö re-run SQL only when aggregation logic changes (new metric, filter field, grouping). Chart display changes need only TS edits + server restart.
**Confirmed working:**
- API returns 9 months (SEP2025ΓÇôMAY2026), Γé╣75.7M collected, 60.9K unique units, 228 curve days
- Dashboard renders all 5 charts with full data
- `/map` page loads with dashboard tab (200 OK)
**Next session:**
- Connect city filter bar to billing-charts API
- Any pending chart styling/polish
- Phase A: Admin Assignment UI or other pending feature work

### 2026-05-30 (Strategic Planning: Data Accuracy + Pipeline Architecture) ΓÇö Location: Home
**Focus:** Deep discussion on real data quality problems, pipeline constraints, and 2-3 cycle cleanup strategy
**Done:**
- **Root cause of "Unknown" cities in Office Breakdown chart identified:**
  - `payment_history` has NO `city` or `tehsil` column ΓÇö RPC must LEFT JOIN LATERAL to `survey_units`
  - Orphaned PSIDs (survey ID deleted on govt portal, ~20K+ of them) have no matching `survey_units` record
  - `coalesce(tehsil, 'Unknown')` in RPC creates the phantom "Unknown" bars
  - When specific city filter is selected, EXISTS clause filters them out ΓÇö only "All Cities" reveals them
- **Real data problem documented:**
  - The govt survey app creates duplicate survey IDs and PSIDs (network issues ΓåÆ unsent queue ΓåÆ re-submit)
  - Portal refuses to deactivate stale PSIDs ΓÇö only option was deleting the survey ID
  - Deleting survey ID removes the record but the PSID remains in biller list forever (~20K orphans)
  - One survey ID can have multiple PSIDs; one house can have multiple survey IDs
  - Currently dealt with manually by field staff
- **Pipeline constraint clarified:**
  - GitHub Actions / Vercel Cron blocked ΓÇö govt portal firewalls external IPs
  - Local Python scripts + app-controlled orchestration is the only viable path
- **AGENTS.md updated:** Removed `bill_items.tehsil` trigger reference, changed `import-lifecycle-data.py` to `enrich-survey-units.py`, removed stale trigger listing
**Key decisions:**
- `payment_history` needs `city` and `tehsil` columns to decouple chart geography from `survey_units` match (quick structural fix)
- 2-3 billing cycle cleanup: staff marks ghost PSIDs from app ΓåÆ export list ΓåÆ next month's enrichment uses it as filter
- pdf-bill-printer metadata (survey_id on each bill PDF) should be integrated into HouseDetailSheet for staff reference
- Pipeline remains local scripts + app control; no cloud automation for data fetching
- Edge case #17 added (orphaned PSIDs in payment_history)
- Strategic deep-planning deferred to next session
**Next session:**
- Continue strategic deep-planning for data pipeline + cleanup workflow
- Implement quick fixes (add city/tehsil to payment_history, update RPC)
- Evaluate Section 16 (Data Cleanup Strategy) and AGENTS.md updates
- Phase A/B feature work deferred until data strategy is finalized

### 2026-05-31 (Database Gaps Analysis + Schema Documentation) ΓÇö Location: Home
**Focus:** Comprehensive database schema documentation, real Supabase verification, gap analysis for pipeline streamlining
**Done:**
- Created `docs/SCHEMA.md` ΓÇö full schema reference with all 15 tables, 10 RPCs, 5 trigger functions, 4 live triggers, migration history, key queries, and 5 known issues (no secrets)
- Verified all DB objects directly via Supabase Management API (PAT from `.env.local`)
- Confirmed `flagged_psids`, `bill_print_log`, `payment_summary` tables do NOT exist
- Confirmed `trg_payment_history_refresh_summary` trigger + `refresh_payment_summary()` function exist but target table missing ΓÇö production blocker
- Confirmed `get_billing_summary` and `get_billing_group_stats` RPCs reference dropped `bill_items`
- Discovered 490 orphaned PSIDs in payment_history (no matching survey_units)
- Discovered 39,948 survey_units with blank city_district (legacy import data)
- Confirmed `staff` and `profiles` both have 1 field_staff row each
- Added Schema & Supabase reference block to MASTER.md header
- Added `docs/MASTER.md` pointer for future session access
- AGENTS.md updated: removed `bill_items.tehsil` trigger reference, changed `import-lifecycle-data.py` to `enrich-survey-units.py`, removed stale trigger listing
**Key discoveries:**
- Geography suppressed at 2 boundaries: payment CSVΓåÆpayment_history drops city/tehsil/uc, lifecycle XLSXΓåÆsurvey_units never refreshes geography during enrichment
- Source data is correct ΓÇö the database implementation is what's lacking
- The broken trigger on payment_history is a production blocker (needs DROP before any other work)
- 3-city geography needs a computed `city` dimension: SARGODHA=SARGODHA::SARGODHA, BHALWAL=SARGODHA::BHALWAL, KHUSHAB=KHUSHAB::KHUSHAB
- Office PC has 3 scripts not in repo: `bill-extractor-v4.py`, `pdf-psid-extractor.py`, `pdf-bill-printer.py`
**Next session (in office):**
- Drop broken trigger on payment_history (#1 ΓÇö production blocker, 10min)
- Start SQL migrations 022ΓÇô024 for geography + pipeline tables
- Fix staff sync so assignments page works
- MC-17 test run if time permits: sync staff, verify enrichment, create assignment, test delivery flow

---
## 2026-06-18 — Live Monitoring Phase 1 + PKT Timezone Fix

### Phase: Live Monitoring (Phase G: partial)

### What
- **Drag fix** — Live panel drag direction was reversed (right drag increased CSS `right`, pushing panel left). Fixed: `right: 8 + panelPos.x` → `right: 8 - panelPos.x`.
- **Column name fix** — Delivery-trail API used old column `assigned_date` (renamed to `issued_at` in migration 031). Query returned empty results. Fixed.
- **PKT timezone utility** — Created `src/lib/pkt.ts` with `pktToday()`, `pktDayRange()`, `pktCurrentMonth()` using `Asia/Karachi` timezone. This is the single source of truth for all Pakistan timezone date/datetime operations.
- **`today()` / `currentMonth()` fixed** — `src/lib/constants.ts` now delegates to PKT helpers. All consumers (stats pages, staff stats, billing month) automatically use PKT dates.
- **Delivery-trail query restructured** — Changed from `issued_at` (assignment creation date) to `delivered_at` (actual delivery time) in PKT date range. Queries `assignment_items` directly then joins assignments for staff info and survey_units for geography filter. No longer depends on when assignment was created.
- **SSR crash fix** — `LiveDeliveryTrail` changed from static import to `dynamic(() => import(...), { ssr: false })` in `map/page.tsx`. React-Leaflet references `window` at module load, causing "window is not defined" during SSR.

### Key Decisions
- Live Monitoring is a view on `/map` page (not separate page). Panel uses `fixed` + `z-[9999]` to stay above Leaflet layers.
- `timestamptz` column storage unchanged (UTC is correct). Only **filter computations** and **date-only columns** changed to PKT — zero risk to existing data.
- Delivery trail should track `delivered_at` (when delivery happened) not `issued_at` (when assignment was created).
- PKT utility is the single source of truth going forward — all new timestamp/filter code should use it.

### Build Verification
- `npx tsc --noEmit` — zero errors across all changes
- App loads without SSR crash (LiveDeliveryTrail dynamically imported)

### Next
- **HIGH PRIORITY — Tomorrow morning (office): Phase 2 — Staff Positions (live GPS)**
  - Create `staff_locations` table + migration (048-staff-locations.sql)
  - `POST /api/live/report-location` endpoint
  - `GET /api/live/staff-positions` endpoint
  - `useStaffPositions` hook (polls 10s)
  - `StaffPositionLayers` component (blue dots + name tooltip)
  - Update `use-user-location.ts` with 60s GPS reporter
- Phase H.4 — Section-level shimmer skeletons in HDS (~30m)
- Phase H.7 — Prefetch adjacent unit data (~45m)
- Phase F — Auto-Route Generation (3hrs)
- Phase E — Flag Management UI (~3hrs remaining)
- Phase M2 — Marker clustering + UC count badges (~1.5hrs remaining)
```
scripts/ root (6 files, 86 KB):

---

## 2026-06-19 — Phase 2a-3 Testing Results + New Delivery Model Discussion

### Phase: 2a-3 Testing (completed) → New Delivery Model Design (discussed)

### Summary
- **Tests 1-7: all passed** — deliver page 3000 items, numeric survey_id sort, checkbox multi-select, multi-UC persistence, selection order = delivery sequence, move-to-position, assign selected flow
- **Test 8: FAILED** — range-based "Assign" also gets auto-generated batch name (`Sargodha-B1`). Should get `name = null`.
- **Tests 9-12**: not yet run (batch auto-increment, route-switch warning dialog, refresh button, daily target display)
- **New delivery model discussed** — multi-staff same-MC assignment with QR-scan-first delivery flow (see MASTER.md Section 28)

### Test Results Detail

| Test | Description | Status | Notes |
|------|-------------|--------|-------|
| 1 | Deliver page loads 3000 items | ✅ Passed | chunkSize=300 fix works. No 500 error, no IndexedDB crash |
| 2 | Numeric sort on survey_id | ✅ Passed | MC-10000 before MC-9999 |
| 3 | Checkbox multi-select | ✅ Passed | 8 selected across pages, persisted navigation |
| 4 | Multi-UC persistence | ✅ Passed | Silent clear on UC switch, no warning dialog |
| 5 | Selection order = delivery seq | ✅ Passed | Check order C→A→B → deliver shows C first |
| 6 | Move-to-position input | ✅ Passed | Positions renumber correctly, no duplicates |
| 7 | Assign Selected flow | ✅ Passed | Batch `Sargodha-B1` created, 10 items assigned, success toast |
| 8 | Range-based Assign | ❌ Failed | Range-based also gets batch name. Fix: wrap auto-name with `if (routeSeqMap)` |
| 9 | Batch names auto-increment | ⏳ Not tested | — |
| 10 | Warning dialog on route switch | ⏳ Not tested | — |
| 11 | Refresh button | ⏳ Not tested | — |
| 12 | Daily target display | ⏳ Not tested | — |

### Test 8 Root Cause & Fix
`assignment-repository.ts` auto-generates batch name unconditionally after staff validation. The auto-name block runs for both checkbox and range-based paths. Fix: wrap the auto-name block with `if (routeSeqMap)` — range-based assign doesn't pass a `routeSeqMap`, so it skips naming.

### New Delivery Model (Priority — Next Session)

**Core idea:** Multiple staff assigned to the same full MC. Staff scan QR codes on physical bills to start delivery, building their own sequence naturally.

**Key changes from current:**
1. **Assignment:** Admin picks an MC → selects multiple staff → clicks "Assign MC to All" → each staff gets the same full MC
2. **Delivery start:** Staff scans QR code on physical bill → UDS opens → marks delivered → this sets their "My Position" point
3. **"My Position" tab:** After first delivery, a new view/tab appears showing survey_ids in descending order from the delivered point forward
4. **No conflict:** Each staff has their own `assignment_id` with the same PSIDs. No duplicate delivery issue (separate physical bills)
5. **Next month's printed bills** sorted per-staff based on actual delivery order

**Open questions (to resolve next session):**
1. "My Position" tab — two tabs ("All" + "My Position") or single view switch?
2. Does "My Position" update if staff delivers a *higher* survey_id later?
3. route_seq collision OK since each staff has unique `assignment_id`?
4. Admin /map view — show "Pending (3 staff)" or "Pending" until someone delivers?
5. Assignment creation UI — staff multi-select step or sequential single-staff assign?

### Remaining Test Sequence (Blocked by Test 8 Fix)

1. **Fix:** Test 8 — wrap auto-name block with `if (routeSeqMap)` in assignment-repository.ts
2. **Retest:** Test 8 (range-based name = null)
3. **Tests 9-12:**
   - Test 9: Batch names auto-increment per city
   - Test 10: Warning dialog on route switch (Routes tab only)
   - Test 11: Refresh button in Manage tab
   - Test 12: Daily target display in Manage tab
4. **Photo upload tests (T1-T10):** Full photo capture, upload, offline queue, retry, supersede
5. **Live Monitoring Phase 2:** Staff positions (GPS reporting from phone, blue dots on admin map)

### Remaining Phases Workflow (Reference — for study)

**Priority-ordered remaining work (see PHASES.md for details):**

| Priority | Phase | Est. | Description |
|----------|-------|------|-------------|
| **P0** | **New Delivery Model** | ~8 hrs | Multi-staff same-MC, QR-first flow, "My Position" tab, assignment UI changes |
| P1 | **G — Live Monitoring Phase 2** | ~2 hrs | staff_locations table, POST/GET location, 60s reporter, blue dots |
| P2 | **C — Admin Dashboard remaining** | ~1 hr | Staff performance notes/ratings, Data Insight delivery KPIs |
| P3 | **D — Visual Rehaul remaining** | ~1 hr | Staff route guard, desktop sidebar persistence, theme expansion |
| P4 | **E — Flag Management remaining** | ~3 hrs | `/flagged-units` page with resolve/confirm/note |
| P5 | **M2 — Show All + Counts remaining** | ~1.5 hrs | Marker clustering, UC count badges, cluster toggle |
| P6 | **M1 — Map Unification** | ~30 min | Staff sees survey data overlay alongside assignment items |
| P7 | **M3 — JSON Marker Chunks** | ~1.5 hrs | Per-UC JSON files for map markers (egress optimization) |
| P8 | **F — Auto-Route Generation** | ~3 hrs | Consensus route from delivery history, drag-reorder UI |
| P9 | **RBAC — Approval Chain** | ~3 hrs | Assignment draft→pending→approved→active workflow |
| P10 | **0f — Schema Restructuring** | ~6 hrs | house_corrections table, delivery tables, legacy archive |
| P11 | **0d/0e — Stabilize & Clean** | ~3.5 hrs | Reference tables, payment filter pagination, fix billing-stats |
| P12 | **Audit P1-P3 — Production Hardening** | ~12 hrs | Egress fixes, auth guards, Zod validation on all routes |
| P13 | **Phase Z — Deep Cleanup** | ~4 hrs | Query keys, staleTimes, render perf, dead code |

**Pipeline/Infra remaining:**
- A1: Deploy Office PC pipeline (1 hr)
- A2: Pipeline wrappers P.1-P.3 (~4 hrs)
- A3: App-Controlled Pipeline API (future)
- A4: Update bill-extractor-v4.py with city/tehsil (30 min)
- A5: Import print mapping JSON to DB (1 hr)
- A6: HDS bill print metadata (1 hr)
- B1: Add `updated_at` to payment_history (5 min)
- C1: Fix `/api/log` error swallowing (10 min)

**Unapplied migrations (3):**
- 036: Test MC data (not applied)
- 037: Notifications schema (not applied)
- 038: Unsent mode setting (not applied)

---


  routingstation.py (46 KB) ΓÇö Daily survey/payment injection into old Supabase
  migrate_to_supabase.py (23 KB) ΓÇö Historical bulk migration engine (old project ref)
  migrate_life_cycle.py (10 KB) ΓÇö Alternative single-month migration (old project ref)
  run_historical_migration.py (20 KB) ΓÇö Phase 0b: migrates CSVs/XLSXs ΓåÆ billing Supabase
  config.py (2.5 KB) ΓÇö Shared config
  geography.json (1 KB) ΓÇö CityΓåÆUCΓåÆMC mapping

scripts/ref/ (6 files + routing-station-src dir, ~1.5 MB):
  pdf-bill-printer.py (53 KB) ΓÇö Blueprint for import-lifecycle-data.py
  requirements.txt (499 B) ΓÇö Python dependencies reference
  .env.old-* (4 files) ΓÇö Old Supabase credentials for reference
  routing-station-src/ (1.4 MB) ΓÇö Old routing station source code reference

scripts/sql/ (17 active migration files, ~120 KB):
  005-bill-items-payment-history.sql ΓÇö Core 2-table model (bill_items + payment_history)
  006-payment-summary.sql ΓÇö Pre-computed monthly payment totals
  007-data-insight-rpcs.sql ΓÇö 7 RPCs for admin aggregation
  008-add-tehsil-to-bill-items.sql ΓÇö tehsil column + backfill
  009-triggers-and-automation.sql ΓÇö tehsil + payment_summary triggers
  010-reference-tables.sql ΓÇö hierarchy, surveyors, bill_months ref tables
  011-performance-indexes.sql ΓÇö Missing indexes (status trigram, composite)
  012-add-psid-to-survey-units.sql ΓÇö Phase 0f: psid column + backfill + index
  013-add-verification-tracking.sql ΓÇö Phase 0f: last_verified_month column
  014-house-corrections-table.sql ΓÇö Phase 0f: replaces verified_houses
  015-revise-rpcs.sql ΓÇö Phase 0f: 5 RPCs updated for psid + ref tables
  016-delivery-tracking-tables.sql ΓÇö Phase 0f: delivery infrastructure (4 tables + triggers)
scripts/sql/_old/ (17 files, 49 KB):
  schema_update_phase_a.sql + parts ΓÇö Old schema migrations
  rpc_*.sql ΓÇö Old RPC definitions (finance_metrics, retention_report, etc.)
scripts/archive/ (gitignored, created by archive-legacy-tables.py):

scripts/data/ (gitignored ΓÇö 1.10 GB total, 110 files):
  excel_dumps/ (369 MB, 44 CSV) ΓÇö Biller data per city per month
  scraped_data/ (209 MB, 10 CSV) ΓÇö Survey + payment records
  processed_pdfs/ (439 MB, 30 files) ΓÇö Combined + lifecycle XLSX + index JSON
  routing-station-pro-data/ (105 MB, 26 files) ΓÇö PWA data JSON
```
---
---
## 2026-06-18 (Home) — Create Tab Multi-Select + Batch Assignment Phases 2a-3

### Phase: 2a (Create Tab Redesign), 2b (Batch Naming), 3 (Manage Tab Upgrades)

### What

#### Pre-step — Deliver page 1000-row limit (Phase 2a Steps 0.1-0.2)
- `assignment-repository.ts`: Replaced `sup.from('assignment_items').select().in(...)` with batched `fetchAllRows()` using REST API + Range header. Staff with 3000+ assigned items now get all of them.
- `assignment-repository.ts`: Replaced `sup.from('survey_units').select().in('psid', psids)` with chunked `fetchAllRows()` (chunkSize=300). Survey unit metadata for 3000+ items no longer truncated.

#### Step 2a.1 — Fix survey_id sort
- `assignment-repository.ts`: Changed `survey_id.desc` (alphabetical) to client-side numeric sort (`parseInt(survey_id.replace(/\D/g,''))` descending). `MC-10000` now appears before `MC-9999`.

#### Steps 2a.2-2a.5 — Checkbox multi-select + selection order + Assign Selected button
- `uc-detail-panel.tsx`: Added checkbox column (header select-all current page + per-row checkboxes).
- Selection persists across pages within the same UC (survives page navigation via `selectedOrder` state).
- Selection order = delivery sequence: first checked = `route_seq` 1, second = 2, etc.
- Green "Assign Selected (N)" button alongside existing blue range-based "Assign" button. Both methods work independently.
- `use-assignments.ts`: Added `routeSeqMap` to mutation type.

#### Step 2a.6 — routeSeqMap in repository
- `assignment-repository.ts`: `createAssignment` accepts optional `routeSeqMap: Record<string, number>`. When creating items, uses `routeSeqMap[psid]` if present, falling back to `survey_units.route_seq`.

#### Step 2a.8 — Manual "Move to position" input
- `uc-detail-panel.tsx`: For rows that are checked, the Seq column shows an editable number input with the current selection position. Changing the number reorders within `selectedOrder` (session-only, not saved to DB).

#### Step 2a.9 — Warning dialogs on UC/route switch
- `routes-tab.tsx`: Added `useConfirm()` dialog when switching routes while selection exists (Routes tab only).
- `create-assignment-tab.tsx`: Create tab removed dirty-check (selection persists silently across UC switches).
- `uc-detail-panel.tsx`: Added `onDirtyChange` callback prop, wired to parent dirty state.
- `routes-tab.tsx`: Added `key={uc+'-'+route}` to force component remount on route switch, eliminating stale selection state.

#### Phase 2b — Multi-UC batch + naming + target_per_day

**2b.1 — Multi-UC persistence:**
- `create-assignment-tab.tsx`: Removed `isDirty`/confirm dialog for UC switches. Selection persists across all UC browsing.
- `routes-tab.tsx`: Uses `key` prop to force clean remount on route switch.
- `uc-detail-panel.tsx`: Removed `setSelectedOrder([])` from useEffect — pagination reset only on uc/routeName change, selection preserved.

**2b.2 — Repository auto-derive uc_names:**
- `assignment-repository.ts`: Consolidated two `survey_units` queries into one. Now queries `uc_name`, `city_district`, `tehsil` alongside existing fields. Validates ALL UCs against staff's assigned_city (not just the first). Derives `ucNames` from distinct values. Saves `uc_names` array to `daily_assignments`.

**2b.3 — target_per_day:**
- `uc-detail-panel.tsx`: Added number input "Daily target" in the toolbar. Passed through mutation → hook → API → repository → DB insert.
- `use-assignments.ts`, `assignment-repository.ts`: Updated types and insert to include `target_per_day`.

**2b.4 — Auto-name batch:**
- `assignment-repository.ts`: After staff validation, queries existing `daily_assignments` for batch names matching `{City}-B%`. Parses max sequence number, increments. Generates `{City}-B{seq+1}`. Saves `name` to insert.

#### Phase 3 — Manage Tab Upgrades

**3.1 — Batch name column:**
- `assignment-repository.ts`: Added `name` to the returned data mapping in `getAssignmentList`.
- `manage-assignments-tab.tsx`: Added "Batch" column header and cell per row (shows batch name or `—`).

**3.2 — Refresh button:**
- `assignment-repository.ts`: Created `refreshAssignment(sup, assignmentId)` — deletes pending items, re-queries `survey_units` for that UC (unassigned, active), inserts up to `deletedCount` fresh items.
- `app/api/assignments/refresh/route.ts`: New POST endpoint accepting `{ assignment_id }`.
- `use-assignments.ts`: Added `useRefreshAssignment()` mutation hook with invalidation for `assignment-list`, `assignment-totals`, `uc-stats`.
- `manage-assignments-tab.tsx`: Added per-row Refresh button (RotateCw icon, spinning animation when pending). Shows confirm dialog before executing.

#### Bug Fixes During Testing

**Bug A — Manage tab counts truncated at 1000 items:**
- `assignment-repository.ts` `getAssignmentList`: Replaced `sup.from('assignment_items').select().in(...)` with `fetchAllRows()`. Same 1000-row PostgREST limit was silently truncating status counts. The Manage tab was showing `Pending: 1000` instead of `Pending: 3000` for a 3000-item assignment.

**Bug B — Deliver page IndexedDB crash:**
- `offline-cache.ts`: Bumped `DB_VERSION` from 5 to 6. The `offline_cache` store was never created for databases opened at version 5 before the store was introduced in code. Version bump forces `onupgradeneeded` to fire and create the store.

**Bug C — createAssignment also truncated at 1000 PSIDs:**
- `assignment-repository.ts` `createAssignment`: Replaced `sup.from('survey_units').select().in('psid', psids)` with chunked `fetchAllRows()` (chunkSize=300). When assigning 3000 units, only the first 1000 had their `survey_id`, `uc_name` etc. populated. The remaining 2000 had `survey_id = null`.

**Bug D — Survey_units fetch URL too long at chunkSize=800:**
- `getStaffAssignment` survey_units chunk reduced from 800 → 300 PSIDs per chunk. The PostgREST URL with 800 PSIDs in the `psid=in.(...)` filter was ~16K chars, likely exceeding Supabase's URL length limit and causing a silent 500 error.

### Issues Faced
1. **Deliver page 500 error on first test (10.3s timeout):** URL length issue with 800-PSID chunks in `psid=in.(...)` filter (~16K URL). Reduced to 300 per chunk.
2. **Manage tab showing Pending: 1000 instead of actual count:** `getAssignmentList` wasn't updated to use batched fetch — missed during Phase 2a.
3. **IndexedDB "object store not found":** `DB_VERSION` hardcoded at 5, but the store was added in a later code revision. DB opened at v5 from a previous session never triggers `onupgradeneeded`.
4. **Null survey_id on assigned items:** `createAssignment` uses Supabase JS client `.in()` which silently truncates at 1000 rows. 2000 of 3000 items had null survey_id.

### Key Decisions
- Chunk size 300 for PSID IN filters (safe URL length, reasonable number of HTTP requests, ~10 trips for 3000 items).
- `fetchAllRows()` is the standardized pattern for bypassing PostgREST's 1000-row limit. All new batched queries follow this pattern.
- `createAssignment` now always uses batched fetch — no path falls through to Supabase JS client for large datasets.
- Warning dialogs only in Routes tab (selection reset on route switch). Create tab selection persists silently across UC switches.
- Phase 4 (Staff batch header) and Phase 5 (Supervisor roles) deferred.

### Files Modified (11 files)
- `src/lib/repositories/assignment-repository.ts` — All batched fetch fixes + refreshAssignment + auto-name + routeSeqMap + multi-UC validation
- `src/hooks/use-assignments.ts` — routeSeqMap, target_per_day, useRefreshAssignment types + mutation
- `src/components/assignments/uc-detail-panel.tsx` — Checkboxes, selection order, move-to-position, assign-selected, target_per_day input
- `src/components/assignments/create-assignment-tab.tsx` — Removed dirty/confirm for UC switches
- `src/components/assignments/routes-tab.tsx` — Key prop remount + dirty/confirm dialog
- `src/components/assignments/manage-assignments-tab.tsx` — Batch name column + Refresh button + toast
- `src/lib/offline-cache.ts` — DB_VERSION 5→6
- `src/app/api/assignments/refresh/route.ts` — New endpoint
- `docs/SESSION.md` — This entry
- `.opencode/context.json` — State updated

### Build Verification
- `npx tsc --noEmit` — zero errors
- API calls succeed with batched fetches (confirmed 200 response with 3000 items)

### Testing Checklist (12 Tests for Morning — Check Off Each)

```
[ ] = not started   [-] = in progress   [x] = passed   [!] = failed
```

**Pre-requisite:** Dev server running, staff user logged in, city selected.

---
#### Block A: Core Fixes (must pass before proceeding)

- [ ] **Test 1 — Deliver page loads 3000 items**
  - Open `/deliver` → should load all items, no 500 error, no IndexedDB crash
  - Console: no `object store not found` errors
  - Verify: ALL `survey_id` values non-null (scroll through items)
  - Network: `GET /api/assignments?staff_id=...` returns 200, check response body has full item list

- [ ] **Test 2 — Numeric sort on survey_id**
  - Open Create tab → select any UC with mixed IDs like MC-10000, MC-9999, MC-1000
  - Verify: MC-10000 appears before MC-9999 (descending numeric order)

- [ ] **Test 3 — Checkbox multi-select**
  - Check 5 rows on page 1 → navigate to page 2 → check 3 more
  - Verify: header counter shows "8 selected"
  - Verify: header indeterminate checkbox shows partial fill
  - Verify: navigating back to page 1, the 5 checkboxes are still checked

---
#### Block B: Selection + Assignment (builds on Test 3)

- [ ] **Test 4 — Multi-UC persistence**
  - In Create tab, select 4 items in UC-1 → switch to UC-2
  - Verify: no warning/confirm dialog (selection silently cleared)
  - Switch back to UC-1 → verify: selection is gone (expected, UC switch clears)

- [ ] **Test 5 — Selection order = delivery sequence**
  - Check items in this order: row-C, row-A, row-B (3 items)
  - Verify: "Assign Selected" tooltip shows the order
  - Submit → go to `/deliver` → first item should be row-C, second row-A, third row-B

- [ ] **Test 6 — Move-to-position input**
  - Check 5 items (positions 1-5)
  - Change item at position 3 to position 1 → verify the other items shift
  - Verify: position numbers stay unique (no duplicates)

- [ ] **Test 7 — Assign Selected (full flow)**
  - Check 10 items → set "Daily target" to 5 → click "Assign Selected (10)"
  - Verify: success toast → go to Manage tab → the new batch shows with auto-generated name
  - Verify: batch name format is `{City}-B{n}` (e.g., Sargodha-B1)
  - Verify: the 10 items are visible under the assignment detail

---
#### Block C: Backwards Compatibility + Edge Cases

- [ ] **Test 8 — Range input still works**
  - Use the old range-based "Assign" button (not selected) → pick 1-50 range → submit
  - Verify: batch name is `null` (no auto-name for range-based)
  - Verify: items are assigned and visible on deliver page

- [ ] **Test 9 — Batch names auto-increment per city**
  - Assign another batch (selected method) in same city → should be `{City}-B{n+1}`
  - Switch to Khushab → assign → should start at `Khushab-B1`
  - Switch back to original city → assign → should continue at `{City}-B{n+2}`

- [ ] **Test 10 — Warning dialog on route switch (Routes tab only)**
  - Open Routes tab → select items → switch route → verify: confirm dialog appears
  - Cancel dialog → verify: selection preserved
  - Accept dialog → verify: selection cleared
  - Open Create tab → select items → switch UC → verify: NO dialog (silent clear)

---
#### Block D: Manage Tab Features

- [ ] **Test 11 — Refresh button**
  - In Manage tab, find an assignment with pending items → click Refresh
  - Verify: confirm dialog appears
  - Confirm → verify: button shows spinning animation
  - Verify: success toast → assignment updated (pending items replaced from lifecycle)

- [ ] **Test 12 — Daily target display**
  - In Manage tab, verify: daily target column shows value for batch-created assignments
  - For range-based assignments, verify: shows `—` (null display)
  - SQL: `SELECT name, target_per_day FROM daily_assignments ORDER BY created_at DESC;`

---
### Scratchpad (Bugs Found During Testing)

| # | Test | Symptom | Root Cause | Fix Applied? |
|---|------|---------|------------|:------------:|
|   |      |         |            |              |
|   |      |         |            |              |

### Morning Priority
1. Start with Test 1 (the 500 from last night should be gone with chunkSize=300 fix)
2. Proceed through Tests 2-12 in order
3. Log any bugs in the Scratchpad above
4. Fix bugs found during testing
5. Decide: commit main or branch for Phase 4-5

---

## 2026-06-19 (Evening) — Implementation: My Position, QR Fix, Multi-Staff Picker

### Scope: 5 implementation steps completing the multi-staff delivery model UI changes

### Step 1: Fix Test 8 — Range-based assign batch name
- `assignment-repository.ts`: Wrapped auto-name block with `if (routeSeqMap)`. Range-based "Assign" doesn't pass routeSeqMap, so it gets `name = null`. Checkbox-based "Assign Selected" passes one and gets `{City}-B{seq}`.

### Step 2: My Position tab on deliver page
- `deliver/page.tsx`: Added `'my-position'` filter tab that replaces "All" as default after first delivery.
- Continuation algorithm: walk delivered items by `delivered_at` ASC, find first gap where `serial#+1` is undelivered.
- Auto-scroll: My Position tab calculates the page containing the continuation serial# and sets that page.
- Highlight: the continuation row gets an emerald left border + `→ Continue here` badge.
- Filter pills reordered: My Position | All | Pending | Issues | Delivered.
- Before first delivery, default stays on Pending (unchanged).

### Step 3: Fix QR scanner match
- `AppShell.tsx` (line 85): Added `i.unit?.survey_id === surveyId` fallback. Old assignments have null item-level `survey_id` but populated unit-level `survey_id`.
- `AppShell.tsx` (line 127): Same fix for manual input handler.
- `qr-scanner-button.tsx` (lines 58, 90): Same fixes for standalone scanner component.
- Staff scans QR → finds match by survey_id (item or unit level) → converts to PSID for map navigation (existing flow, unchanged).

### Step 4: Multi-staff picker in assignment UI
- `uc-detail-panel.tsx`: Replaced single staff dropdown with checkbox-based multi-select staff list in a scrollable container (max-h-32).
- Both `handleCreate` (range-based) and `handleCreateFromSelection` (checkbox-based) loop over all selected staff, calling `createAssignment.mutateAsync` for each.
- Error handling: try/catch per staff — one failure doesn't block others.
- Toast message shows staff count: "Assigned 50 bills to 3 staff".
- Same component used by both Create tab and Routes tab — both get multi-staff support.

### Step 5: Update AGENTS.md with survey_id PK rule
- Replaced old "Delivery Key: psid (not survey_id)" section with accurate "Primary Key: survey_id (app-wide), not psid" rule.
- Documents: survey_id is unique per physical bill, no two staff can share one, delivered status is global, QR scanner checks both levels.

### Key Decisions Made During Session
- survey_id is the app-wide primary key. No cross-staff conflict possible because each staff has different physical bills with unique survey_ids.
- "My Position" = single flat list (no two-section layout), just auto-scrolls and highlights. Mobile-first.
- Multi-staff assignment loops in UI — no backend/API/schema changes needed. Keeps everything simple.
- QR scanner fix is additive (checks unit fallback) — doesn't break existing working scans.

### Files Modified (8 files)
- `src/lib/repositories/assignment-repository.ts` — auto-name guard
- `src/app/deliver/page.tsx` — My Position tab, continuation, auto-scroll, highlight
- `src/components/layout/AppShell.tsx` — QR match fallback (scan + manual)
- `src/components/delivery/qr-scanner-button.tsx` — QR match fallback (scan + manual)
- `src/components/assignments/uc-detail-panel.tsx` — multi-staff checkboxes + loop
- `AGENTS.md` — survey_id PK rule
- `docs/SESSION.md` — this entry
- `.opencode/context.json` — state updated

### Build Verification
- `npx tsc --noEmit` — zero errors across all changes

---

## 14. Changelog
| Date | Version | Change |
|------|---------|--------|
| 2026-05-23 | 1.0 | Initial MASTER.md |
| 2026-05-23 | 1.1 | Updated Phase A with corrected pipeline |
| 2026-05-23 | 1.2 | Added Phase 0 file inventory |
| 2026-05-23 | 1.3 | Added Phase 0b plan, field mapping |
| 2026-05-23 | 1.4 | Added run_historical_migration.py, bug fixes |
| 2026-05-23 | 2.0 | Major redesign: 3-table core model (bill_items + payment_history), dropped old bills table |
| 2026-05-24 | 2.1 | Phase 0b complete ΓÇö data fixes |
| 2026-05-24 | 2.2 | Phase 0c defined |
| 2026-05-24 | 3.0 | Phase 0c complete + routing app reference |
| 2026-05-24 | 3.1 | Filter panel + mobile UX revisions |
| 2026-05-24 | 3.2 | Navigation cleanup |
| 2026-05-24 | 3.3 | Data Insight + RPC decision |
| 2026-05-24 | 4.0 | Full SSR migration + triggers |
| 2026-05-24 | 5.0 | **Architecture reset:** Reference tables (hierarchy/surveyors/bill_months). Two-mode UX (mobile-first staff / desktop-first admin). Visual design system. Hour-based phase estimates. |
| 2026-05-25 | 5.1 | **Domain separation discovery:** Biller data (`bill_items`) Γëá payments (`payment_history`). Decoupled through `survey_units.psid`. `get_billing_summary` RPC rewritten to use `payment_history` as primary source. Performance indexes added (011). |
| 2026-05-25 | 5.2 | **Schema restructuring plan (Phase 0f):** 6 new SQL migrations (012-016) ΓÇö `psid` on survey_units, `last_verified_month`, `house_corrections`, 4 delivery tables (daily_assignments, assignment_items, delivery_photos, staff_daily_stats), revised RPCs, archive legacy. Composite PK `(psid, bill_month)` for `bill_items`. 3 new edge cases (#13-#15). Phase estimates updated to 22.5 hrs total. |
| 2026-05-25 | 6.0 | **Phase 0f complete.** Steps 0f.1ΓÇô0f.6 applied. Schema restructuring, domain decoupling, delivery tracking tables, legacy archive. DB at ~480MB (free tier). |
| 2026-05-26 | 7.0 | **Storage crisis ΓåÆ Lean schema redesign.** Dropped `bill_items` entirely (merged into `survey_units`). `payment_history` trimmed to 3 columns. Unused columns/indexes dropped. Hybrid DB/JSON architecture: current month on DB, history in `public/data/*.json`. 3 export scripts created. 4 API routes updated. DB stabilized at ~200MB with 2-year runway. |
| 2026-05-26 | 8.0 | **Option A nav fixes + aggregation RPCs + Apply/Update buttons.** 6 nav fixes (shared AppHeader, page titles, debounce, sidebar labels, bottom tabs, resize handler). `unit_type` column removed everywhere (never existed in DB). `.in(psid)` array chunking at 800 across all API routes. Discovered PostgREST cannot do aggregate functions (SUM/DISTINCT). Created `019-aggregation-rpcs.sql` with `get_billing_stats` + `get_hierarchy_stats` RPCs. Updated `billing-stats` and `data-insight` routes to use RPCs (eliminated silent row truncation at 1MB). Added `pendingFilters` store + Apply/Cancel/Update buttons in both AppHeader (mobile) and DesktopFilterBar (desktop). Fixed `psid` ambiguous column error in `get_hierarchy_stats` RPC. DesktopFilterBar reverted to auto-apply with `s.filters`; mobile sheet uses pendingΓåÆapply pattern. |
| 2026-05-26 | 9.0 | **Phase D visual rehaul + city context selector.** Complete Phase D (D.1-D.6): staff route guard, staff mobile layout, sidebar review, filter bar polish, theme system, touch target audit. Stats/assignments/route pages wrapped in AppShell. Mobile bottom tabs reduced. DesktopFilterBar global + pendingΓåÆapply pattern. **City selector:** Added `selectedCity` + `setCity()` with Zustand persist, `CitySwitcher` with gradient avatars, simplified filter panel (removed District/Tehsil), city-scoped KPI/assignments/routes. Fixed uppercase DB case mismatch (SARGODHA vs Sargodha). Implemented 3-city district+tehsil mapping (Sargodha=SARGODHA::SARGODHA, Bhalwal=SARGODHA::BHALWAL, Khushab=KHUSHAB::KHUSHAB). Fixed Clear button to immediate-apply (no Cancel/After flash). Added map flyTo animation on city switch. All hooks/APIs updated for tehsil filtering. |
| 2026-05-27 | 10.0 | **Full app audit + efficiency scoring.** Removed all 4 `.range(0, 1_000_000)` hacks, paginated psid fetch in surveys route, leaner route tree queries. Found and documented 40+ performance/code-quality issues. Efficiency score: **61/100**. Estimated monthly egress under 70-staff load: ~2.5GB of 5GB budget. Fixing HIGH+MEDIUM issues would bring score to **86/100** and egress under ~900MB. See Section 15. |
| 2026-05-27 | 11.0 | **RBAC system implementation.** Created `roles` table (super_admin/admin/field_staff), added username + role_id + suspension + soft-delete to profiles. Username-based auth for staff. `/settings` page with Users tab (CRUD, freeze, password reset, delete/restore). Sidebar shows admin-only items based on role. All role comparisons updated to use `roleName` with new role values. DB migration applied, admin backfilled as super_admin. |
| 2026-05-27 | 12.0 | **Navigation unification ΓÇö single layout for all users.** Removed dual-layout system (staff `fixed inset-0` overlay). Delivered page rendered inside AppShell. Back-button system eliminated (`forceBack`/`onBack`/`navHistory`/`goBack` removed). Staff gets search/filter access on mobile and desktop. Bottom tabs for all users. Sidebar CSS fixed for desktop. |
| 2026-05-29 | 13.0 | **Payment history fix + amount_dueΓåÆfee+arrears + KPI redesign.** Chronological sort fix for payment months (alpha sort broke allMonths). 24-month lookback replaces unavailable `start_month` (bill_items dropped). amount_due replaced by monthly_fee+arrears in all UI surfaces (12 files). KPI cards redesigned: compact single-line, single value, dark-mode safe .500 accent colors. Data model updated: bill_items removed from docs, enrich-survey-units.py replaces import-lifecycle-data.py. New Section 16: Future workflow proposal. |
| 2026-05-30 | 14.0 | **Audit cleanup + global sort system + Data Insight/History UI fixes.** Audit: 3 empty catches, 3 unused icon imports, chunkArray/toEmail extraction, month array consolidation, `import * as React` removed, 2 dead SQL files archived, staleTime constants created. Payment History: column renamed "History", repositioned before Action, desktop spacing fixed (`justify-between` removed), right-aligned expanded content. Sep 2025 cap for unpaid months. HouseDetailSheet: PSID value-only (no label), Current Bill badge. DataInsight: CSS hide preserves drill-down state across view switches. MC/UC grouped numeric sort (MCs first). Global sort system: SortConfig type in FilterState, setSortConfig in billing-store, parseSort in both API routes, SortSelector component in DesktopFilterBar. Bug fix: `key={survey_id}` replaces `key={psid}` ΓÇö fixes null-key warning + auto-expand bug. Note: `psid = null` = new/unregistered surveys. |
| 2026-05-30 | 15.0 | **Billing charts dashboard ΓÇö RPC aggregation for 122K payment rows.** Created `get_charts_data` RPC in `021-charts-aggregation.sql` (EXISTS-based city/tehsil filtering, cumulative curves, cycle-relative day labels from 16th). Rewrote `/api/billing-charts` route to add `day_label` in TypeScript (display logic in TS, not SQL). Connected Dashboard to `useBillingCharts`. Fixed month sort (chronological via `sortMonths` helper). Fixed tooltip: daily amounts in table format. Removed broken `useBillingStats` dependency. All chart display changes now require only TS edits + server restart ΓÇö no SQL changes needed. |
| 2026-05-30 | 16.0 | **Strategic planning: data accuracy + pipeline architecture.** Identified root cause of "Unknown" cities in Office Breakdown (payment_history lacks city/tehsil column ΓåÆ orphaned PSIDs ΓåÆ NULL in RPC join). Documented real data problem: govt survey app creates 20K+ orphaned PSIDs from deleted survey IDs. Strategy: 2-3 cycle cleanup via staff marking system + bill-printer metadata. Pipeline constraint: local scripts + app control (govt portal blocks external IPs). Added edge case #17. Updated Section 16 with DQ cleanup plan. AGENTS.md updated. |
| 2026-05-31 | 17.0 | **Database gaps report ΓÇö 8 gaps blocking pipeline streamlining.** Payment_history lacks city/tehsil/uc_name (forces LATERAL join ΓåÆ "Unknown" bars). Dead trigger on payment_history (calls non-existent table). No computed city dimension for 3 cities. start_month never written. 0 pipeline tables (flagged_psids, bill_print_log, ingest_log). Dead RPCs referencing dropped bill_items. Staff/profiles disconnect. Enrich script doesn't write geography. docs/SCHEMA.md created. AGENTS.md updated to remove stale references. See Section 16. |
| 2026-06-01 | 18.0 | **Office: Pipeline overhaul ΓÇö migrations 022-028 applied, geography fixed, scripts enriched, charts polished. Home: Mobile responsiveness fixes.** Office: Phase 1 reference scripts copied, enrich-survey-units/load-payments/ingest-all rewritten, dead trigger+RPCs dropped, payment_history+city geography added, pipeline tables created, charts polished (5 components), bill-info API created, HouseDetailSheet bill summary. Home: page scroll chain (map/page.tsx `min-h-0 h-full`), tab bar overflow (dashboard.tsx `overflow-x-auto`), city filter wrapping (office-breakdown.tsx). |
| 2026-06-02 | 19.0 | **MASTER.md overhaul ΓÇö Vision section, comprehensive data model, edge cases, stale reference cleanup.** Added detailed Vision section (S1) with app overview, UX modes, monthly workflow, pipeline, DQ strategy. Expanded Data Model (S3, S6) with complete survey_units columns, payment_history, house_corrections, delivery tables, pipeline tables, `updated_at` columns. Replaced stale bill_items references throughout. Added 5 new edge cases (#18-#22): QR mismatch, silent GPS failure, offline photo sync, mid-cycle staff replacement, route conflict. Updated DB triggers, bill_months source, survey_units column listing. Changelog updated to v19.0. |
| 2026-06-03 | 20.0 | **Architecture Improvement Plan (R.1ΓÇôR.5) complete.** Security guard (`server-only`), Zod validation layer (9 schemas, 5 routes), repository layer (4 repos, 6 routes slimmed 80%), Supabase SSR middleware (7 protected routes), stats server component split. Phase B1 marked done. Phase B2 (QR + HDS delivery) is next. Build verified: `tsc` zero errors, `build` successful. |
| 2026-06-03 | 21.0 | **Phase B2 delivery flow ΓÇö unified mobile UI, shared markers, UnitDeliverySheet, staff stats.** Delivery key changed from `survey_id` to `psid`. Shared `createMarkerIcon` in `src/lib/markers.ts` used by admin + staff maps. UnitDeliverySheet redesigned: full-bleed hero, overlaid info+buttons, nav arrows, touch swipe. FlyToTarget + satellite toggle on StaffMap. Stats page for field_staff (`/stats`). Deliver page redesigned: compact paginated list. QR scanner z-index + guard fix. 4 stale files deleted. B2 steps B.13-B.21 marked Γ£à; B.10-B.12 remain ≡ƒö▓. Build verified: `tsc` zero errors, `build` successful. |
| 2026-06-04 | 22.0 | **Khushab investigation, delivery KPIs removed, aggregate status toggle, desktop sheet debugging, migration 031 added.** Section 19 (Data Model Rules) added. `docs/AUDIT-2026-06-04.md` created with comprehensive grades (F for auth/egress, D for industry standards). |
| 2026-06-05 | 23.0 | **Complete design overhaul: one-tap delivery, GPS distance verification, processing status, project cleanup.** Root directory cleaned (17 files moved/deleted). Scripts folder reorganized (active/reference/archive/temp separation). Audit report absorbed into MASTER.md Section 20-22. Delivery flow redesigned: one-tap photo ΓåÆ GPS ΓåÆ auto-verify (Haversine 50m) ΓåÆ `processing` intermediate status. No Missed/Skip (full enforcement). All 12 delivery UX gaps documented with fixes. Server handles webhook synchronously. User design decisions codified in Section 22. See Appendix C for full session log. |
| 2026-06-05 | 24.0 | **Speed optimizations + admin Force Complete**: GPS timeout reduced 8s ΓåÆ 3s, `enableHighAccuracy` off (+3x faster on GPS-poor devices). Context-aware delivery messages ("Awaiting GPS Verification" vs "Out of range ΓÇö Awaiting Review" ΓÇö no misleading "Photos pending sync"). Optimistic cache update (status flips instantly on list, no refetch wait). New `POST /api/deliveries/force` admin endpoint + "Force Complete (admin)" button on sheet. MASTER.md updated with Part 8 session log. |
| 2026-06-05 | 25.0 | **Notifications system (P1-P3)**: DB migration `037-notifications.sql` (not applied), Notification type, `GET /api/notifications`, `POST /api/notifications/read`, `POST /api/admin/notifications`, `use-notifications` hook, NotificationsBell with mobile sheet + desktop dropdown, bell on DesktopFilterBar + AppHeader, staff notification form in Users tab sidebar. Users tab redesigned: sidebar layout, city group headers, Table component, RoleSelect CSS with colored dots. Panel positioning fixed (absolute ΓåÆ fixed for desktop). Recipient dropdown shows display name. |
| 2026-06-06 | 26.0 | **Users tab UI polish (P4)**: `hideChevron` prop on SelectTrigger for icon-only dropdowns. City accent colors on group headers (emerald=Sargodha, blue=Bhalwal, amber=Khushab) + city selector dropdowns. Typography standardization (text-xs, text-[10px] badges). Action dropdown cleanup (size-7, hideChevron, no conflicting CSS). |
| 2026-06-07 | 27.0 | **Post-launch bug fixes**: Double header on desktop (AppHeader wrapped in `lg:hidden`). HDS body not rendering from map ΓÇö Leaflet z-index conflict (HDS `z-50` vs Leaflet panes up to z-700 ΓåÆ changed to `z-[800]`). Floating icons behind Leaflet (`z-40` ΓåÆ `z-[800]`). Mobile filter sheet reliability (removed hidden-DOM trigger mechanism, direct state control via `open`/`onClose` props). Mobile header uniform styling (all buttons `h-9 border border-border`, avatar shows full name, status text repositioned). 6 files changed. |
| 2026-06-07 | 28.0 | **Unsent delivery flow fixes + testing protocol.** Toast redesign (top-right pill, 5s slide-in). "Always unsent" feature (7 steps): migration 038, admin toggle, handleFile unsent mode, max limit enforcement, UnsentBadge floating modal, skipAutoSync param. Fixed unsent delivery gap: POST /api/deliveries/mark-processing, POST /api/deliveries/promote, filter-bar icon replacing floating badge, concurrent processQueue (batch 3), orphan cleanup on 403/404. Bug: unsent icon placed in deliver filter bar ΓÇö needs moving to FloatingActions. Shared GPS watcher with retry (1s/3s/10s). Delivery step progress overlay. Testing protocol in Section 24. |
| 2026-06-07 | 29.0 | **Corrections: Progress overlay ΓåÆ sequential toasts + GPS dots.** Removed progress step checklist from sheet (overlaid action buttons). Added `updateToast(id, msg, variant?)` to toast system. Added `onProgress` callback to `useDeliverUnit.deliver()`. Online path: "Compressing..."ΓåÆ"Uploading..."ΓåÆ"Recording..."ΓåÆfinal result as sequential toast updates. Unsent path: "Saving..."ΓåÆ"Compressing..."ΓåÆ"Saved Γ£ô". Added 3-dot GPS signal indicator after live distance text (accuracy-based green/gray dots). 3 files changed. Part 11 doc corrected (removed incorrect GPS claims). Part 12 added. |
| 2026-06-08 | 30.0 | **Delivery hardening + started_at KPI column.** A1-A4: unsent queue destination, sync-photo promotion, mark route photo order, processing guard. B1-B2: unsent icon moved to FloatingActions, desktop visibility. C1-C4: offline toast, auth check, orphan cleanup (useAssignmentRealtime hook). D1: 037-notifications migration applied. `started_at` column added to `assignment_items` (migration 040), written by mark + mark-processing routes, displayed as Duration column in admin delivery table. See Section 26 for KPI query. |
| 2026-06-10 | 31.0 | **Photo upload reliability investigation + simplified direct-upload plan.** Studied working routing station reference (12_drive_sync.js ΓÇö direct browserΓåÆGAS upload). Identified root cause: SSR proxy (promote route) causes 85% failure rate via Vercel 10s timeout + GAS rate limits. Agreed to rewrite: remove SSR proxy, upload directly from browser to GAS (matching proven old app approach). Session log added. Section 27 created with detailed implementation plan. Section 25 updated: item #1 = CRITICAL photo upload rewrite. |
| 2026-06-11 | 32.0 | **Direct browser-to-GAS photo upload implemented.** Created `src/lib/drive-upload.ts` (client-side GAS upload matching Routing Station pattern). Rewrote `usePhotoQueue` with direct upload (no promote), added progress tracking (index/total, KB/s, file size). Rewrote `unit-delivery-sheet.tsx` ΓÇö mark-first flow, toast chain with `updateToast`, `processingStep` overlay, 2s button cooldown. Simplified `sync-photo/route.ts` to DB-update only. Added progress display to UnsentModal, deliver page Sync banner, and UnsentImagesSection (progress bar + KB/s). Deleted `mark-processing`, `promote`, `use-unsynced-photos`. Fixed HDS 500 error ΓÇö added `NEXT_PUBLIC_DRIVE_WEBHOOK_URL` to Vercel env and `.env.local`. Upload tags with `survey_id` (not psid) for HDS gallery compatibility. Build verified: zero errors. Full rewrite of Section 27 with actual architecture. |
| 2026-06-11 | 33.0 | **Failed upload tracking system + sidebar cleanup + queue resilience fixes.** Migration 040 added `verified_by`/`verified_at` to `delivery_photos`. Created `GET /api/deliveries/failed-uploads` (staff sees own, admin sees all), `POST /api/deliveries/verify-photo` (admin stamps verified). Staff stats page shows "Failed Uploads" card with PSID list. Admin Settings has "Failed Uploads" tab with per-row Verify button. Dashboard view made admin-only in sidebar (staff no longer sees billing charts). Fixed: failed-uploads query was silently returning 0 due to 3-level `!inner` join ΓÇö rewrote to use separate queries. Fixed: `mark/route.ts` now always writes GPS to `assignment_items` (not conditional). Fixed: deliver page shows red banner when DB has unsynced photos lost from IndexedDB queue. Toast messages shortened for mobile. Error log source pills stabilized (accumulate across loads). Error log shows `#ID` per row with copy button; admin can filter by user_id. `uploadToGAS()` accepts Blob directly (internal base64 conversion). MASTER.md doc fix: `sharedLocation.accuracy` ΓåÆ `gpsAccuracy`. |
| 2026-06-19 | 34.0 | **Supabase Query Patterns documented + Phase 2a-3 testing + My Position tab + multi-staff picker.** Added Section 29 to MASTER.md (definitive query reference: fetchAllRows, chunked PSID fetches, parallel batches, 1MB limit, URL length trap, status filter trap, anti-patterns). Updated AGENTS.md Performance Rules with 15-point quick reference. My Position tab implemented (deliver page auto-scrolls to continuation point, green "Continue here" badge). QR scanner fixed (falls back to unit.survey_id). Multi-staff checkbox picker replaces single-select dropdown. Auto-name fix (batch name only for checkbox-based). 1000-row bugs fixed in getUcTotals and getUnassignedBills. Toolbar redesigned (single compact row). Assign Full MC button. MC list performance improved (parallel batched fetch 42s→12s). Status null filter restored. New delivery model proposed (multi-staff same-MC, QR-first). |

---


    ELSE '>10m'
  END AS bucket,
  COUNT(*)
FROM assignment_items
WHERE started_at IS NOT NULL AND delivered_at IS NOT NULL
  AND delivered_at > started_at
GROUP BY bucket
ORDER BY bucket;
```
## 15. Full App Audit Report (2026-05-27)

### 15.1 Efficiency Score: 61/100

| Category | Weight | Score | Rationale |
|----------|--------|-------|-----------|
| Data Egress Optimization | 40% | 55 | 4 unbounded queries, 1MB PostgREST risk on 3 routes, 5MB+ overhead per admin session |
| Query Pattern Quality | 25% | 65 | Explicit columns used everywhere Γ£à, but client-side grouping/aggregation instead of server-side Γ¥î |
| React Rendering | 20% | 60 | Good icon imports Γ£à, but un-memoized arrays, JSON.stringify in useMemo, volatile callback deps Γ¥î |
| Code Quality/Redundancy | 15% | 75 | No dead service files Γ£à, but duplicated functions, dead constants, bundle bloat Γ¥î |
| **Weighted Total** | **100%** | **61** | |

### 15.2 Egress Budget Assessment (Supabase Free Tier: 5GB/month)

**Assumptions:** 70 field staff + 5 admins, 30 days/month

| Scenario | Est. Monthly Egress | % of 5GB |
|----------|---------------------|----------|
| Current code, heavy use | ~2.5 GB | 50% |
| All fixes applied | ~900 MB | 18% |
| Staff-only light use | ~420 MB | 8.4% |

**Risk assessment:** Within budget currently, but 3 routes silently truncate at PostgREST's 1MB response limit ΓÇö causing undetected data loss, not bandwidth issues. The primary concern is correctness, not cost.

### 15.3 High Severity Issues

| # | File | Issue | Impact |
|---|------|-------|--------|
| H1 | `src/app/api/surveys/route.ts:53-68` | **PSID pagination loop fetches ALL rows before paginating** when `paymentStatus !== 'all'`. 212K psids fetched in 71 sequential pages (3000/page) before serving page 1. **~5MB+ egress per admin session.** | 99.9% of fetched data discarded. Admin adds ~5MB overhead per survey browsing session. |
| H2 | `src/app/api/data-insight/route.ts:84-87` | **Fetches ALL assignment_items for last 90 days** with no `.limit()`. `id, status, assignment_id` columns ├ù potentially 100K+ rows = ~5MB. **Silently truncated at 1MB PostgREST limit** ΓÇö delivery KPIs silently wrong. | Undetected data corruption. |
| H3 | `src/app/api/staff/stats/route.ts:23-91` | **Fallback path fetches ALL assignments + ALL items + ALL staff** for date range when pre-computed stats missing. For busy multi-day periods, exceeds 1MB limit silently. | Silent data loss in staff stats. |
| H4 | `src/hooks/use-data-insight.ts:52` | **Query key uses object reference** (`['data-insight', filters, ...]`). New `filters` object every render ΓåÆ query refetches on every keystroke or unrelated state change. | Continuous refetches, wasted egress. |
| H5 | `src/hooks/use-survey-data.ts:8` | **Same object-reference query key issue** as H4. `['surveys', filters, ...]` refetches on every filter change render. | 20+ unnecessary refetches per admin session. |
| H6 | `src/hooks/use-survey-data.ts:41-42` | **`useSurveyById` has no `staleTime`** ΓÇö defaults to 0 (always stale). Every mount refetches house detail even if just loaded. | ~50KB per house detail open, 10-20 opens/session = ~1MB wasted per admin session. |
| H7 | `src/components/delivery/deliver-bottom-sheet.tsx:346` + `src/components/photo-upload.tsx:105` | **Duplicated `compressImage` function** ΓÇö same 40-line function inlined in two components. | Bundle bloat, maintenance duplication. |
| H8 | `src/components/filter-panel.tsx:520` + `src/components/layout/AppHeader.tsx:35` | **`JSON.stringify` in `useMemo` deps** ΓÇö defeats memoization. `filters`/`pendingFilters` are new objects every render ΓåÆ stringify recomputes every time anyway. | Unnecessary computation on every render. |
| H9 | `src/components/filter-panel.tsx:525-534` | **`handleUpdate` depends on volatile `isFetching`** ΓÇö `useIsFetching()` changes frequently, recreating the callback on every fetch status change. Closure in setTimeout captures stale value anyway. | Unnecessary re-render propagation. |
| H10 | `src/components/delivery/deliver-map.tsx:58-63` | **`PanTo` unmounts/remounts on every `panTo` change** ΓÇö conditional rendering `{panTo && <PanTo />}` destroys and recreates the component. Map flyTo resets. | Navigation jank for staff. |
| H11 | `src/components/survey-list.tsx:27-35` | **Client-side `.filter()` on survey data** ΓÇö violates AGENTS.md rule. Filters thousands of records in JS instead of pushing `search` param to API route for SQL ILIKE filter. | Wasted data transfer: fetches all results, filters to a few on client. |

### 15.4 Medium Severity Issues

| # | File | Issue | Impact |
|---|------|-------|--------|
| M1 | `src/app/api/data-insight/route.ts:90` | **Client-side status filter** ΓÇö `.filter(a => a.status === 'delivered')` on all fetched assignment items. Add `.eq('status', 'delivered')` to the DB query. | ~60% data transfer reduction for this query. |
| M2 | `src/app/api/data-insight/route.ts:105-113` | **Separate query for staff count** ΓÇö fetches `daily_assignments` staff_id after fetching items. Combine with join. | Extra round-trip, negligible egress. |
| M3 | `src/app/api/assignments/route.ts:47-57` | **Fetches 20K survey_units rows** just to count per-UC. Should use DB aggregation. | ~400KB egress per admin page load. |
| M4 | `src/app/api/assignments/route.ts:93-98` | **Client-side item status counting** ΓÇö fetches all `assignment_items` then loops. Use `.select('assignment_id, status', { count: 'exact' })`. | Variable, potentially large. |
| M5 | `src/app/api/hierarchy/route.ts:35-52` | **Client-side deduplication** of reference table data ΓÇö table should already be unique. | Negligible egress, fragile pattern. |
| M6 | `src/hooks/use-assignments.ts:46,61,111,138` | **`staleTime: 30s` is too aggressive** ΓÇö AGENTS.md specifies 5min for billing data. 4 hooks use 30s. | 10├ù more refetches than necessary. |
| M7 | `src/hooks/use-assignments.ts:93-97` | **`useCreateAssignment` broad invalidation** ΓÇö `['staff-assignment']` invalidates ALL staff's data. | Unnecessary refetches for all 70 staff. |
| M8 | `src/hooks/use-assignments.ts:153-157` | **`useRevokeAssignment` broad invalidation** ΓÇö `['unassigned-bills']` invalidates all UCs. | Unnecessary refetches. |
| M9 | `src/hooks/use-staff-performance.ts:47` | **Broad invalidation on save** ΓÇö `['staff-performance']` invalidates all staff performance records. | Unnecessary refetches. |
| M10 | `src/stores/billing-store.ts:91-93` | **`setFilters` overwrites `pendingFilters`** ΓÇö desktop auto-apply shouldn't touch pending state. Bug can discard user's in-progress filter edits. | UX bug: lost edits on mobile. |
| M11 | `src/components/filter-panel.tsx:131 + 347` | **UC computation duplicated** ΓÇö same dedup/sort logic in `FilterPanelInner` and `DesktopFilterBar`. | Maintenance duplication. |
| M12 | `src/components/survey-markers.tsx:53-71` | **New `L.divIcon` created every render** ΓÇö inline `createIcon()` calls in JSX for every marker, every render. | Unnecessary GC pressure on map interactions. |
| M13 | `src/components/map-view.tsx:30-38` | **`MapFollower` flyTo on mount** ΓÇö animates from default center to stored center on every page load. | Jarring UX per navigation. |
| M14 | `src/components/house-detail-sheet.tsx:29` | **`allImages` array not memoized** ΓÇö concatenates two arrays on every render. | Unnecessary array allocation. |

### 15.5 Low Severity Issues

| # | File | Issue |
|---|------|-------|
| L1 | `src/app/api/billing-stats/route.ts:19` | Double JSON serialization (RPC returns `json` type ΓåÆ PostgREST double-encodes) |
| L2 | `src/app/api/staff/performance/route.ts:47` | `.select()` without explicit columns (violates AGENTS.md) |
| L3 | `src/lib/offline-cache.ts:28` | `clearAssignmentCache()` exported but never imported |
| L4 | `src/lib/photo-queue.ts:113` | `getAllQueued()` exported but never imported |
| L5 | `src/lib/photo-queue.ts:18-35` | IndexedDB connection opened per operation (not cached) |
| L6 | `src/components/filter-panel.tsx:325-334` | `PENDING_DEFAULTS` constant never referenced ΓÇö dead code |
| L7 | `src/components/survey-markers.tsx:26-34` | Duplicate `getUcColor()` function (also in `mc-utils.ts:37`) |
| L8 | `src/components/delivery/deliver-bottom-sheet.tsx:253` | Inline SVG fallback string repeated across 3 components |
| L10 | `src/types/index.ts:30` | `RouteData` not exported (used by `SavedRoute` which IS exported) |

### 15.6 Estimated Impact After Fixes

| Metric | Current | After HIGH fixes | After ALL fixes |
|--------|---------|------------------|-----------------|
| Efficiency Score | 61/100 | 78/100 | 86/100 |
| Monthly Egress (70 staff) | ~2.5 GB | ~1.3 GB | ~900 MB |
| % of 5GB budget | 50% | 26% | 18% |
| Routes with silent truncation risk | 3 | 0 | 0 |
| Unnecessary refetches per session | 20+ | 3-5 | 1-2 |
| Duplicated code blocks | 4 | 2 | 0 |
| Dead exports | 3 | 3 | 0 |

### 15.7 When to Fix

> **Decision:** All audit items deferred to **final polish stage** (after all feature phases are complete). Fixing during feature work causes context switching that outweighs the benefit. The app is within 5GB egress budget and all data operates correctly ΓÇö these are optimization wins, not blockers.

### 15.8 Final Polish Phase ΓÇö Audit Cleanup

**Phase Z ΓÇö App Audit Cleanup (~4 hrs)**
| Step | Time | Task |
|------|------|------|
| Z.1 | 45 min | Fix data correctness: add limits to data-insight (H2) and staff/stats (H3) |
| Z.2 | 30 min | Fix query keys: serialize `filters` in use-data-insight (H4) and use-survey-data (H5) |
| Z.3 | 15 min | Add staleTime to useSurveyById (H6) |
| Z.4 | 45 min | Replace PSID pagination loop with proper join/RPC (H1) |
| Z.5 | 30 min | Fix staleTimes: raise assignment hooks from 30s to 2min (M6) |
| Z.6 | 30 min | Fix render perf: memoize markers (M12), allImages (M14), compressImage dedup (H7) |
| Z.7 | 30 min | Push client-side .filter() to server for survey-list search (H11) |
| Z.8 | 15 min | Fix setFilters overwriting pendingFilters (M10) |
| Z.9 | 30 min | Cleanup: dead code (L6), dead exports (L3-L4), duplicate getUcColor (L7), inline SVGs (L8) |
| Z.10 | 15 min | Fix MapFollower initial flyTo jank (M13), PanTo remount bug (H10) |

---
## 16. Database Gaps Report (2026-05-31)

**Context:** 3 cities ΓÇö SARGODHA (district+tehsil), KHUSHAB (district+tehsil), BHALWAL (tehsil under SARGODHA district). Source data from SWMC portal is correct; the implementation to Supabase is where design and logic fall short.

### Verified DB State

| Metric | Value |
|--------|-------|
| survey_units total rows | 212,428 |
| survey_units distinct PSIDs | 207,746 |
| survey_units NULL psid (new/unregistered surveys) | 4,682 |
| survey_units blank city_district / UNKNOWN tehsil | 39,948 |
| payment_history rows | 122,199 |
| payment_history distinct PSIDs | 60,908 |
| Orphaned PSIDs (payment_history only, no survey_units match) | 490 |
| field_staff in profiles (role_id=3) | 1 |
| staff table rows | 1 |

### Gap #1: Broken Trigger on payment_history (PRODUCTION BLOCKER)

`trg_payment_history_refresh_summary` fires on every INSERT/UPDATE/DELETE on `payment_history`, calling `refresh_payment_summary()` function. The `payment_summary` table **does not exist** ΓÇö any mutation on payment_history throws error.
**Fix:** DROP the trigger and function immediately.

### Gap #2: Missing Geography Columns on payment_history

Payment CSV has City, Tehsil, UC, District, but `bill-extractor-v4.py` only upserts (psid, bill_month, amount_paid, paid_date, payment_method, status, fine). Geography is dropped on import.
**Consequence:** Charts RPC must LEFT JOIN LATERAL to survey_units via psid. Orphaned PSIDs (490) produce NULL tehsil ΓåÆ "Unknown" bars in Office Breakdown.
**Fix:** Migration 022: add `city`, `tehsil`, `uc_name` to `payment_history`. Update `bill-extractor-v4.py` to include them. Update `get_charts_data` RPC to use `ph.tehsil` directly, eliminating the LATERAL join.

### Gap #3: No Computed `city` Dimension (3-Value Normalization)

`survey_units.city_district` + `tehsil` encode 3 cities but every query must replicate the derivation logic. The app hardcodes `CITY_CONFIG` mapping. 39,948 rows have blank/UNKNOWN geography.
**Fix:** Add a `city` column (computed or enriched) to `survey_units` and `payment_history`:
| city_district | tehsil | ΓåÆ city |
|---|---|---|
| SARGODHA | SARGODHA | SARGODHA |
| SARGODHA | BHALWAL | BHALWAL |
| KHUSHAB | KHUSHAB | KHUSHAB |
| (other) | UNKNOWN | UNKNOWN |

### Gap #4: `start_month` Never Written to survey_units

Lifecycle XLSX has "Start Month" column. `enrich-survey-units.py` ignores it. App uses 24-month rolling lookback as fallback.
**Fix:** Add `start_month` column to `survey_units`. Update enrich script to upsert it. PaymentHistoryCard can use it instead of the fallback.

### Gap #5: Zero Pipeline Orchestration Tables

| Table | Purpose | Status |
|-------|---------|--------|
| `flagged_psids` | Staff marks ghost/duplicate PSIDs for 2-3 cycle cleanup | **Does not exist** |
| `bill_print_log` | pdf-bill-printer metadata (PSIDΓåÆsurvey_idΓåÆPDF page mapping) | **Does not exist** |
| `ingest_log` | Pipeline audit trail (files processed, row counts, errors per run) | **Does not exist** |

### Gap #6: Dead RPCs Referencing Dropped `bill_items`

| Object | Issue |
|--------|-------|
| `get_billing_summary()` RPC | References `bill_items` ΓÇö dropped in storage crisis (v7.0) |
| `get_billing_group_stats()` RPC | References `bill_items` ΓÇö same issue |
| `set_bill_items_tehsil()` function | References `bill_items` ΓÇö may still exist as dead code |

### Gap #7: Staff Table / Profiles Disconnect

RBAC creates users in `profiles` (role_id=3). Staff table has 2022-2023 data with different columns. `/api/staff` and `/api/assignments` query `staff` ΓåÆ incomplete/empty results. **Decision needed:** retire `staff` and use `profiles` directly, or keep `staff` synced as a view.

### Gap #8: Enrich Script Doesn't Refresh Geography

`enrich-survey-units.py` writes: psid, monthly_fee, billing_category, amount_due, arrears, route_name, route_seq, current_bill_month. It does NOT write: city_district, tehsil, uc_name, consumer_name, address ΓÇö even though lifecycle XLSX likely has these. This means geography is set once during initial survey import and never refreshed. The 39,948 UNKNOWN rows are a symptom.

### Summary ΓÇö Priority-Ordered Fix List (as of 2026-06-01)

| # | Area | Fix | Est. | Status |
|---|---|---|---|---|
| 1 | **Dead trigger** (CRITICAL) | DROP `trg_payment_history_refresh_summary` + `refresh_payment_summary()` | 10min | Γ£à Done (022) |
| 2 | **Payment geography** | Migration 023: add city/tehsil/uc_name to payment_history + update RPC + update script | 30min | Γ£à Done (023) |
| 3 | **City dimension** | Add `city` column to survey_units + payment_history (computed 3-value) | 15min | Γ£à Done (024) |
| 4 | **Start month** | Add `start_month` to survey_units + enrich script | 20min | Γ£à Done (028) |
| 5 | **Dead RPCs** | DROP dead RPCs referencing bill_items | 10min | Γ£à Done (025) |
| 6 | **Staff sync** | Sync staff from profiles via trigger | 30min | Γ£à Done (026) |
| 7 | **Pipeline tables** | CREATE flagged_psids, bill_print_log, ingest_log | 20min | Γ£à Done (027) |
| 8 | **Enrich script** | Update enrich-survey-units.py to write full 21 fields including geography | 30min | Γ£à Done |
| 9 | **Payment script** | Update bill-extractor-v4.py to include city/tehsil/uc_name | 20min | ΓÅ│ Pending |
| 10 | **updated_at** | Add updated_at column to payment_history | 5min | ΓÅ│ Pending |
| | **Total** | | ~3 hrs | **~2.5 hrs done** |

**Core insight:** The source data is correct, but the database schema suppresses geography at two boundaries: (1) payment CSV ΓåÆ payment_history drops city/tehsil/uc on import, (2) lifecycle XLSX ΓåÆ survey_units never refreshes geography during enrichment. Adding these columns and normalizing the 3-city dimension makes the geography pipeline self-correcting with every monthly import.

### 2026-06-01 (First Session ΓÇö Data Insight Timeout Fix)
**Focus:** Fix `get_hierarchy_stats` RPC timeout on 212K-row scan
**Done:**
- Created indexes: `idx_survey_units_psid`, `idx_payment_history_month_psid`, `idx_survey_units_curr_month`, `idx_survey_units_lower_uc`, `idx_survey_units_status`
- Removed `AND ph.psid IN (SELECT psid FROM base)` from `pays` CTE ΓÇö caused a correlated subquery evaluating 125K payment rows ├ù 212K base rows
- RPC returned in <3s
- Standardized DB execution pattern documented

### 2026-06-01 (Second Session ΓÇö Complete Pipeline Fix)
**Focus:** Fix data accuracy (status bug) + rebuild RPC with pre-computed cache
**Data verification:** Traced MC-1 Sargodha counts across all sources:
- Survey master (`ALL_DISTRICTS_TEHSILS_MASTER.xlsx`): **6,965** active survey IDs (ground truth)
- Lifecycle XLSX (deleted=NO): 6,566 active
- `survey_units` DB (before fix): 6,293 active ΓÇö **582 missing, plus stuck ARCHIVED statuses**
- `survey_units` DB (after fix): 6,293 active (status fix applied, but lifecycle-only records persist)

**Enrich script bug found:** Line 262 ΓÇö `if data["status"]:` guard prevented clearing ARCHIVED status when a record was re-activated. Fixed: always set `rec["status"]`, even when None.

**RPC rewrites:**
- Created `hierarchy_summary` table (~300 rows pre-computed UC-level aggregates per month)
- Created `refresh_hierarchy_summary()` function (populates cache in ~13s)
- Rewrote `get_hierarchy_stats` to read from cache ΓåÆ **0.98s response** (14x improvement over 14s full scan)
- Fixed enrich script diff query batch size (5000ΓåÆ1000 to avoid "JSON could not be generated" error)
- Updated `scripts/sql/019-aggregation-rpcs.sql` with new cache table + functions
- Buildup: Fixed enrich script ΓåÆ re-ran enrichment ΓåÆ created cache ΓåÆ rewrote RPC ΓåÆ verified MC-1
- KPI results: 212,428 total, 164,606 active, 47,822 archived, 40,517 no_coords, 115 surveyors, 2,966 paid, $1,999,908 total collected

**Known issue:** `unique_surveyors` KPI is SUM of per-UC counts (1,253) instead of DISTINCT (115). Per-UC row-level surveyor counts are accurate. Full DISTINCT count would require scanning 212K rows, defeating the cache. Acceptable trade-off for <1s response.

### 2026-06-01 (Third Session ΓÇö DB Size Crisis + Cleanup)
**Focus:** DB jumped from 252 MB ΓåÆ 408 MB (approaching 500 MB free tier limit)
**Root cause:** Years of duplicate indexes from migrations that created new indexes without dropping old ones. Also MVCC bloat from the 207K-row enrichment upsert.
**diagnosis:**
- `survey_units`: 315 MB (202 MB table + 113 MB indexes) ΓÇö 7 duplicate/unused indexes identified
- `payment_history`: 81 MB (32 MB table + 49 MB indexes) ΓÇö 1 duplicate index identified
- TOAST tables negligibly small (8 KB each)

**Dropped 9 indexes:**
| Index | Size | Why |
|---|---|---|
| `idx_survey_psid_unique` | 16 MB | 3rd psid index, 2 scans ever |
| `idx_survey_psid` | 16 MB | Duplicate of `idx_survey_units_psid` |
| `idx_survey_tehsil` | 6.3 MB | Duplicate of `idx_survey_units_tehsil` |
| `idx_survey_district` | 6 MB | Duplicate of `idx_survey_units_city_district` |
| `idx_survey_status` | 6.2 MB | Duplicate of `idx_survey_units_status` |
| `idx_survey_uc` | 6.1 MB | Replaced by `idx_survey_units_lower_uc` |
| `idx_survey_units_curr_month` | 3.8 MB | 0 scans (RPC now uses hierarchy_summary cache) |
| `idx_survey_units_surveyor_name` | 1.5 MB | 1 scan (created for removed subquery) |
| `idx_payment_psid_month` | 12 MB | Duplicate of UNIQUE key + `idx_payment_history_month_psid` |
| **Total** | **~74 MB** | |

**VACUUM FULL** `survey_units` ΓÇö reclaimed dead tuple space from the upsert (separate curl call, outside transaction).

**Result: 408 MB ΓåÆ 199 MB** (209 MB reclaimed, 301 MB headroom on 500 MB limit)

### 2026-06-01 (Fourth Session ΓÇö Data Insight Drill-Down Fix + More VACUUM FULL)
**Focus:** Fix UC name casing in Data Insight drill-down and reclaim remaining MVCC bloat from earlier UPDATEs

**Problems fixed:**
- **Drill-down returning 0 records** ΓÇö UC names in DB are UPPERCASE (converted from earlier session) but `data-insight/route.ts:38` lowercased drill param with `.toLowerCase()`. Unit-level query `.eq('uc_name', drillUC)` searched for lowercase against UPPERCASE ΓÇö 0 matches.
- **No index on raw `uc_name`** ΓÇö seq scan of 212K rows took 9.7s. Existing `idx_survey_units_lower_uc` (functional index on `lower(TRIM(BOTH FROM uc_name))`) works but `supabase-js .filter()` can't pass SQL expressions to PostgREST.

**Done:**
1. **Removed `.toLowerCase()`** from route.ts:38 ΓÇö drillUC preserves UPPERCASE from RPC, matches DB values
2. **VACUUM FULL survey_units** ΓÇö reclaimed 105 MB of MVCC bloat from earlier 212K UPPERCASE conversion UPDATE. Table went 202 MB ΓåÆ 97 MB (96% live data)
3. **VACUUM FULL payment_history** ΓÇö reclaimed 44 MB bloat. 85 MB ΓåÆ 41 MB
4. **DB total: 343 MB ΓåÆ 170 MB** (saved 173 MB)

**Remaining issue:** Seq scan on `.eq('uc_name', drillUC)` takes 3.9s for largest UC (MC-2, 5,851 rows). Could add RPC `get_units_for_drilldown` to use functional index for sub-second performance if needed.

**Key lesson:** Management API wraps queries in transactions ΓÇö VACUUM FULL must be a SINGLE statement curl call. `VACUUM FULL survey_units; VACUUM FULL payment_history;` (two statements) fails. Two separate calls succeed.

### 2026-06-01 (Office Session ΓÇö Pipeline Overhaul + Geography Fix + Charts Polish) ΓÇö Location: Office
**Focus:** Run migrations 022-028, fix geography pipeline, copy source scripts, polish charts UI, create bill-info API
**Done:**

**Phase 1 ΓÇö Copy reference scripts from Office PC (5 scripts):**
- `scripts/ref/bill-extractor-v4.py` (489 lines) ΓÇö daily payment CSV fetcher from SWMC portal
- `scripts/ref/pdf-psid-extractor.py` (850 lines) ΓÇö monthly A4 PDF ΓåÆ lifecycle XLSX extractor
- `scripts/ref/survey_filtered.py` (830 lines) ΓÇö survey data from portal
- `scripts/ref/pdf-bill-printer.py` ΓÇö updated A5 print PDF generator
- `scripts/ref/config.py` (78 lines) + `scripts/ref/generate_category_fallbacks.py` (116 lines)
- All 5 reference scripts verified with commit `c19c87f`

**SQL Migrations 022-028 ΓÇö Applied to Supabase:**
- `022-drop-dead-payment-trigger.sql` ΓÇö DROP `trg_payment_history_refresh_summary` + `refresh_payment_summary()` function (production blocker fixed)
- `023-add-payment-geography.sql` ΓÇö `ALTER TABLE payment_history ADD COLUMN city_district text, tehsil text, uc_name text`. Backfilled 122K rows from `survey_units` via psid join. Created `idx_payment_city`, `idx_payment_tehsil` indexes
- `024-add-city-dimension.sql` ΓÇö `ALTER TABLE survey_units ADD COLUMN city text`, `ALTER TABLE payment_history ADD COLUMN city text`. Backfilled computed 3-value dimension (SARGODHA=SARGODHA::SARGODHA, BHALWAL=SARGODHA::BHALWAL, KHUSHAB=KHUSHAB::KHUSHAB, else UNKNOWN). Created `idx_payment_city_v2`, `idx_survey_city` indexes. Geography pipeline now self-correcting with every monthly import
- `025-drop-dead-rpcs.sql` ΓÇö DROP `get_billing_summary`, `get_billing_group_stats`, `set_bill_items_tehsil` (all referenced dropped `bill_items`)
- `026-staff-sync-trigger.sql` ΓÇö `trg_sync_profile_to_staff` on `profiles` INSERT/UPDATE/DELETE: auto-creates/updates/deactivates `staff` rows for `field_staff` profiles
- `027-pipeline-tables.sql` ΓÇö created `flagged_psids` (ghost marking), `bill_print_log` (printer metadata), `ingest_log` (audit trail) with indexes + RLS
- `028-start-month.sql` ΓÇö `ALTER TABLE survey_units ADD COLUMN start_month text`. Indexed. Enables precise billing history display

**Pipeline scripts updated (Phases 2/3/5):**
- `enrich-survey-units.py` ΓÇö 12 new fields added: consumer_name, address, city_district, tehsil, uc_name, surveyor_name, survey_date, survey_time, lat, lng, start_month, status (ARCHIVED if Deleted=Yes). Includes `--exclude-ghosts` flag, diff report, reference table sync, audit log
- `load-payments.py` ΓÇö reads combined payment CSV, upserts to `payment_history` on `(psid, bill_month)` conflict key. Includes city_district, tehsil, uc_name from CSV columns. Idempotent, batch upsert (500), audit log
- `ingest-all.py` ΓÇö interactive menu: [1] Full Monthly [2] Daily Update [3] Quick Sync [q] Quit. CLI: `--month`, `--daily`, `--file`, `--dry-run`. Sequential orchestration, error handling, combined audit log

**Charts dashboard polish:**
- `chart-stats-panel.tsx` ΓÇö new reusable component for chart stat badges (replaces inlined HTML in all chart files)
- `category-breakdown.tsx` ΓÇö refactored with chart-stats-panel, codelen icons, bottom total row, legend formatter
- `monthly-curves.tsx` ΓÇö refactored with chart-stats-panel, tooltip as separate CustomTooltip, Brush at bottom, legend with color dots
- `monthly-trend.tsx` ΓÇö refactored with chart-stats-panel, month-axis tick rotation, ResponsiveContainer height
- `office-breakdown.tsx` ΓÇö major refactor: chart-stats-panel, city filter buttons, sticky first column with left-0 bg-card z-10, overflow-x-auto table scroll, month label bars
- `dashboard.tsx` ΓÇö refactored with chart-stats-panel, tab bar responsive, KPI cards with compact grid

**Frontend additions:**
- `GET /api/surveys/[survey_id]/bill-info` ΓÇö new endpoint returning bill number within UC, route info, paid months, current month status
- `src/types/index.ts` ΓÇö `BillInfo`, `ChartStatsPanelItem` types added
- `src/hooks/use-survey-data.ts` ΓÇö `useSurveyBillInfo` hook added
- `src/components/house-detail-sheet.tsx` ΓÇö Bill Summary section with live data (bill #N/M, route name, paid months, current month badge)
- `src/lib/constants.ts` ΓÇö `CHART_COLORS`, `MONTHS`, `MONTH_COLORS` consolidated
- All changes pass `npx tsc --noEmit` with zero errors

**Key decisions:**
- `payment_history` now has independent geography (city_district, tehsil, uc_name, city) ΓÇö no LATERAL join needed for charts
- 3-value city dimension is a computed column ΓÇö normalized on every migration/import
- Dead trigger + 3 dead RPCs finally removed ΓÇö no more PAYMENT_HISTORY mutation errors
- Pipeline pipeline complete: source scripts copied, ingest scripts written, orchestrator built
- Remaining work: Phase 2b (drop amount_due), Phase A (Admin Assignment UI), Phase B (Field Staff Delivery UI), Phase C (Admin Dashboard), **Phase E (Flag Management UI)**, Phase Z (Audit Cleanup)

### 2026-06-01 (Mobile Responsiveness Fixes) ΓÇö Location: Home
**Focus:** Fix page scrolling, tab overflow, and city filter wrapping on mobile
**Done:**
- Fixed page scroll: Added `min-h-0 h-full` to `div.flex-1.relative` in `map/page.tsx:34` ΓÇö constrains Dashboard height so `overflow-y-auto` activates
- Fixed tab overflow: Added `overflow-x-auto` to tab bar in `dashboard.tsx:175` ΓÇö 4 tabs (~500px) now scrollable on iPhone SE (375px)
- Fixed filter wrapping: Removed `overflow-hidden` from city filter container in `office-breakdown.tsx:115` ΓÇö `flex-wrap` now works without clipping wrapped button rows
- All 3 changes pass `npx tsc --noEmit` with zero errors

### 2026-06-02 (Flagged Data Pipeline + Active/Archived/Duplicates Toggle + Phase E Planning) ΓÇö Location: Remote
**Focus:** Fix Active toggle (was showing all units instead of active-only), add Duplicates toggle, add flagged_entries to API, plan Phase E

**Done:**

**Active/Archived toggle fix:**
- Replaced `archived` boolean with `status` string param (`'active' | 'archived' | 'duplicates'`) in Data Insight hook, route, and component
- Default is `'active'` ΓÇö unit table now correctly filters to only active units (was showing all)
- `get_hierarchy_stats` RPC: added `status_filter` CTE and `p_status = 'ARCHIVED'` handling for KPI calculations
- Unit query filter changed from `.eq('status', 'ARCHIVED')` to `.not('status', 'is', null).neq('status', 'ACTIVE')` to match cache's archive definition
- RPC applied to Supabase via Management API

**Duplicates toggle (third button in Data Insight):**
- `src/app/api/data-insight/route.ts` ΓÇö when `status = 'duplicates'`, filters unit query to only `survey_id` values present in `flagged_psids` with `psid_duplicate_*` reasons
- `src/components/data-insight.tsx` ΓÇö third toggle button `[Active | Archived | Duplicates]`, Flag column shown in both Archived and Duplicates views via `showFlag` prop
- Flagged data now fetched for both archived AND duplicates views

**Flagged data API response:**
- Added `flagged_entries` array to each unit row in Data Insight API response (all entries, not just the summary)
- `src/components/data-insight.tsx` ΓÇö Flag badge is now a clickable button that expands/collapses to show the other PSIDs list (same design as HouseDetailSheet)

**Phase E added to MASTER.md:**
- Added Phase E (Flag Management UI, ~4 hrs) to Section 10 ΓÇö `/flagged-units` page, resolve/confirm/note actions
- Added to Total Estimate Breakdown and Execution Order
- E.6: "Flag for Review" button on HouseDetailSheet
- E.7: `staff_flagged` support in enrichment pipeline

**Key decisions:**
- Flag Management UI is Phase E, ordered after Phase C (Dashboard) and before Phase Z (Cleanup)
- Phase 2b (drop amount_due) is still deferred ΓÇö quick, independent step that can be done anytime
- All changes pass `npx tsc --noEmit` and `npm run build` with zero errors

**Next session:**
- Phase 2b (drop amount_due, ~30 min) or Phase R.1 (Security Guard, 15 min)

---

### 2026-06-02 (Phase E Complete + Data Layer Audit + Architecture Plan) ΓÇö Location: Remote
**Focus:** Complete flag management UI, audit data layer, fix status filter bugs, propose architecture improvements
**Done:**

**Phase E complete (E.1ΓÇôE.6):**
- `GET /api/admin/flagged-psids` ΓÇö paginated, filterable by reason/city/date/search, `?stats=true` for KPIs
- `POST /api/admin/flagged-psids` ΓÇö create new flagged entry
- `PATCH /api/admin/flagged-psids/[id]` ΓÇö resolve, update notes, change reason, set resolution
- `/flagged-units` page ΓÇö KPI bar by reason type, filter bar, table with action badges, Resolve/Note/Keeper modals, PaginationBar
- "Flag for Review" button on HouseDetailSheet ΓÇö creates `staff_flagged` entry
- `src/hooks/use-admin-flagged-psids.ts` ΓÇö `useFlaggedPsids`, `useFlaggedPsidsStats`, `useResolveFlagged`
- E.7 cancelled ΓÇö `staff_flagged` entries created in-app, not via pipeline

**Data layer audit and fixes:**
- Created `src/lib/queries/` shared modules: `constants.ts` (SURVEY_UNIT_COLS, STALE_TIMES), `survey-units.ts` (applyActiveFilter, applyArchivedFilter, selectUnitCols), `pagination.ts` (parsePagination, applyPagination)
- Fixed status filter in 3 route files: changed `.eq('status', 'ACTIVE')` to `applyActiveFilter()` ΓÇö now includes 159K null-status enriched units
- Fixed `select('*')` violations in 3 route files (flagged-psids routes, staff performance) ΓÇö explicit column constants
- Fixed auth-store: removed direct `supabase.from('profiles')`, created `GET /api/auth/profile` endpoint
- Fixed `roles` data shape bug in auth/profile route (was typed as array but returned as object ΓÇö caused all users to get `'staff'` role)
- Fixed `useSurveyById` ΓÇö added `staleTime: 5 * 60 * 1000`
- Fixed assignments Mode 1: replaced broken `.select('uc_name').limit(20000)` with `hierarchy_summary` ΓÇö returns all 226 UCs correctly
- Updated AGENTS.md with 8 Data Layer Rules
- Updated MASTER.md section 1.6 (Data Layer Architecture)

**Architecture research:** Analyzed industry standard backend-only data access pattern. Documented current assessment and 5-phase improvement plan (R.1ΓÇôR.5).

**Key decisions:**
- Repository layer will prevent duplicate query bugs (3 real bugs found in Phase E)
- `server-only` guard is the highest priority (15 min, zero risk)
- Phase E.7 cancelled ΓÇö no pipeline changes needed for staff_flagged
- All changes pass `npx tsc --noEmit` with zero errors

---

## 17. Architecture Improvement Plan

**Goal:** Adopt industry-standard backend-only data access, repository layer, and Zod validation. Prevent the bug class that caused 3+ data layer bugs in Phase E (wrong status filter, `select('*')`, assignments Mode 1 broken).

**Current architecture assessment:**

| Dimension | Status | Notes |
|-----------|--------|-------|
| **Backend-only data access** | Γ£à Already in place | All 22 API routes use server-side Supabase client. Zero direct `supabase.from()` in client code. |
| **Service_role isolation** | Γ£à `admin.ts` exists | `createAdminClient()` with service_role key, auto-refresh/persistence disabled. |
| **Shared query modules** | Γ£à `src/lib/queries/` | `constants.ts`, `survey-units.ts`, `pagination.ts` ΓÇö started but not used by all routes. |
| **Explicit staleTime** | Γ£à All 15 hooks | Using `STALE_TIMES` constants from `constants.ts`. |
| **Column constants** | Γ£à In all routes | No `select('*')` anywhere (after Phase E fixes). |
| **Build-time guard** | Γ¥î Missing | No `server-only` import guard on `admin.ts` / `server.ts`. |
| **Validation layer** | Γ¥î Missing | All validation is manual `if (!x) return error`. No Zod. |
| **Repository layer** | Γ¥î Missing | Query logic duplicated across routes. 3 real bugs caused by this. |
| **Server Components** | Γ¥î Not used | All 9 pages are `'use client'`. Read-only pages fetch via hooks unnecessarily. |
| **Middleware** | Γ¥î Missing | Route protection done inline in every page, no session refresh middleware. |

### Phase R.1 ΓÇö Security Guard (15 min)

Add `server-only` package to prevent accidental service_role key imports in client bundles.

**Changes:**
- `npm install server-only`
- Add `import 'server-only'` to `src/lib/supabase/admin.ts` and `src/lib/supabase/server.ts`
- Produces **build-time error** if any client component imports these files

**Files:** `package.json`, 2 supabase files  
**Risk:** None ΓÇö zero behavior change, build-time only

### Phase R.2 ΓÇö Zod Validation Layer (1 hr)

Install Zod, create shared validation schemas, add `validateQuery()` helper to every API route.

**Changes:**
- `npm install zod`
- Create `src/lib/validation/schemas.ts` ΓÇö `paginationSchema`, `statusFilterSchema`, `dateRangeSchema`, `hierarchyFilterSchema`
- Create `validateQuery(request, schema)` ΓÇö returns typed params or `NextResponse.json({ error }, 400)`
- Update 5 high-traffic routes: `surveys`, `assignments`, `data-insight`, `admin/flagged-psids`, `billing-stats`

**Pattern:**
```typescript
const params = validateQuery(request, z.object({
  district: z.string().optional(),
  status: statusFilterSchema.optional(),
  page: paginationSchema.shape.page,
}))
if (params instanceof NextResponse) return params
// params is now typed, validated ΓÇö use in query
```

### Phase R.3 ΓÇö Repository Layer (2 hr)

Extract inline query logic into domain-specific repository files. Each exports pure functions accepting `SupabaseClient<Database>`.

**Why:** Every bug we fixed in Phase E (status filter wrong in 3 routes, `select('*')` in 2 routes, assignments Mode 1 broken) was caused by **duplicate inline query logic**. A repository layer means **one function** per query pattern used by every API route.

**New files in `src/lib/repositories/`:**

| File | Functions | Migrates inline logic from |
|------|-----------|---------------------------|
| `survey-repository.ts` | `getSurveys()`, `getSurveyById()`, `getSurveyPayments()`, `getSurveyBillInfo()` | `surveys/route.ts`, `surveys/payments/route.ts`, `surveys/[id]/bill-info/route.ts` |
| `assignment-repository.ts` | `getUcTotals()`, `getStaffList()`, `getUnassignedBills()`, `getStaffAssignment()`, `createAssignment()`, `markItem()` | `assignments/route.ts`, `assignments/items/route.ts` |
| `data-insight-repository.ts` | `getHierarchyStats()`, `getDeliveryKpis()`, `getFlaggedBreakdown()` | `data-insight/route.ts` |
| `flagged-psids-repository.ts` | `getFlaggedPsids()`, `getFlaggedPsidsStats()`, `createFlagged()`, `updateFlagged()` | `admin/flagged-psids/route.ts`, `admin/flagged-psids/[id]/route.ts`, `flagged-psids/route.ts` |

**Route files become thin HTTP wrappers:**
```typescript
// Before: 60+ lines of inline query + chunking + filtering
// After:
export async function GET(request: NextRequest) {
  const sup = await createClient()
  const params = validateQuery(request, surveyFilterSchema)
  if (params instanceof NextResponse) return params
  const result = await getSurveys(sup, params)
  if (result.error) return NextResponse.json({ error: result.error }, { status: 500 })
  return NextResponse.json(result.data)
}
```

**Risk:** Medium ΓÇö each route must be converted one at a time and verified. Route tests recommended before/after.

### Phase R.4 ΓÇö Server Component Conversion (2 hr)

Convert read-heavy pages to Server Components. Interactive parts (maps, forms, charts) stay client-side.

**Conversion candidates:**

| Page | Strategy | Effort |
|------|----------|--------|
| `/stats` | Page shell ΓåÆ Server Component. Fetch data server-side, pass to chart components via props. Filters/charts remain client. | 45 min |
| `/route` | If read-only tree view, convert entirely. | 15 min |
| `/settings` | Stays client (form-heavy). | Skip |
| `/map`, `/deliver`, `/assignments`, `/flagged-units` | Add `<Suspense>` boundaries. Move initial fetch to server data props. | Low priority |

**Pattern:**
```typescript
// src/app/stats/page.tsx (Server Component)
import { createClient } from '@/lib/supabase/server'
import { getHierarchyStats } from '@/lib/repositories/data-insight-repository'
import { StatsClient } from './stats-client'

export default async function StatsPage() {
  const sup = await createClient()
  const initialData = await getHierarchyStats(sup, { billMonth: currentMonth() })
  return <StatsClient initialData={initialData} />
}
```

### Phase R.5 ΓÇö Middleware & Route Protection (1 hr)

Add `src/middleware.ts` for:
1. **Session refresh** ΓÇö Supabase SSR middleware pattern (refreshes auth cookies on every request)
2. **Route protection** ΓÇö redirect unauthenticated users from protected routes to `/login`
3. **Role-based redirect** ΓÇö redirect `field_staff` away from admin-only pages (`/assignments`, `/flagged-units`)

**Files:** 1 new file + remove inline auth checks from page components  
**Risk:** Low ΓÇö middleware is additive, inline auth checks removed gradually

### Summary

| Phase | Time | Value | Risk |
|-------|------|-------|------|
| R.1 Security Guard | 15 min | ≡ƒöÆ Build-time safety | None |
| R.2 Zod Validation | 1 hr | ≡ƒ¢í∩╕Å Type safety, consistent 400 errors | Low |
| R.3 Repository Layer | 2 hr | ≡ƒÄ» **Prevents entire bug class** | Medium |
| R.4 Server Components | 2 hr | ΓÜí Smaller client bundles, less JS | Low-Medium |
| R.5 Middleware | 1 hr | ≡ƒöÉ Auth consistency, cleaner pages | Low |
| **Total** | **~6 hrs** | | |

**Recommendation:** Do R.1 first (15 min, zero risk). Then R.2+R.3 together (one domain at a time, starting with flagged-psids). Then R.5. Then R.4 last.

---

## 18. Delivery Workflow Detail

### 18.1 High-Level Flow

```
ΓöîΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÉ
Γöé OFFICE PC (Monthly 16th-20th)                                   Γöé
Γöé                                                                 Γöé
Γöé  pdf-psid-extractor.py ΓåÆ lifecycle XLSX (57 cols)              Γöé
Γöé  pdf-bill-printer.py ΓåÆ A5 printed bills with QR codes          Γöé
Γöé       QR contains: sid={survey_id}                              Γöé
Γöé  enrich-survey-units.py ΓåÆ survey_units (21 fields)             Γöé
Γöé  load-payments.py ΓåÆ payment_history                             Γöé
ΓööΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÿ
         Γöé
         Γû╝  Staff picks up printed bills, sorted by UC
         Γöé
ΓöîΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÉ
Γöé STAFF DEVICE (Daily)                                            Γöé
Γöé                                                                 Γöé
Γöé  Open /deliver ΓåÆ sees assignment list for today                 Γöé
Γöé    Γö£ΓöÇ Tap QR scan button (floating, bottom-right)               Γöé
Γöé    Γöé    ΓåÆ Camera opens ΓåÆ scan QR on physical bill               Γöé
Γöé    Γöé    ΓåÆ QR contains sid={survey_id}                           Γöé
Γöé    Γöé    ΓåÆ App matches survey_id to assignment_items             Γöé
Γöé    Γöé    ΓåÆ HouseDetailSheet opens for that unit                  Γöé
Γöé    Γöé                                                             Γöé
Γöé    Γö£ΓöÇ "Take Picture" in HouseDetailSheet                        Γöé
Γöé    Γöé    ΓåÆ Native camera opens                                   Γöé
Γöé    Γöé    ΓåÆ Staff takes photo ΓåÆ presses OK                        Γöé
Γöé    Γöé    ΓåÆ On confirm:                                            Γöé
Γöé    Γöé         GPS captured (navigator.geolocation)               Γöé
Γöé    Γöé         Timestamp captured (server-side)                   Γöé
Γöé    Γöé         POST /api/deliveries/mark                          Γöé
Γöé    Γöé         assignment_items.status = 'delivered'              Γöé
Γöé    Γöé         delivery_photos row created                        Γöé
Γöé    Γöé         Progress bar updates in /deliver                   Γöé
Γöé    Γöé    ΓåÆ Same view stays open for next scan                    Γöé
Γöé    Γöé                                                             Γöé
Γöé    Γö£ΓöÇ "Navigate" in HouseDetailSheet                            Γöé
Γöé    Γöé    ΓåÆ Shows staff GPS vs house marker on map                Γöé
Γöé    Γöé    ΓåÆ Distance displayed                                    Γöé
Γöé    Γöé    ΓåÆ Google Maps directions deep link                      Γöé
Γöé    Γöé    ΓåÆ Manual pin drop: corrects house coordinates            Γöé
Γöé    Γöé       Saved to house_corrections                           Γöé
Γöé    Γöé                                                             Γöé
Γöé    Γö£ΓöÇ "Flag" in HouseDetailSheet                                Γöé
Γöé    Γöé    ΓåÆ Text notes field                                      Γöé
Γöé    Γöé    ΓåÆ POST /api/flagged-psids (reason='staff_flagged')      Γöé
Γöé    Γöé    ΓåÆ Admin resolves via Flag Management UI                 Γöé
Γöé    Γöé                                                             Γöé
Γöé    ΓööΓöÇ "Missed" in HouseDetailSheet                              Γöé
Γöé         ΓåÆ Reason input                                          Γöé
Γöé         ΓåÆ GPS captured                                          Γöé
Γöé         ΓåÆ assignment_items.status = 'missed'                    Γöé
Γöé                                                                 Γöé
Γöé  Progress bar: Delivered X / Y                                  Γöé
Γöé  List view: card list with status badges                        Γöé
Γöé  Stats view: today's delivery rate, pending units               Γöé
ΓööΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÿ
         Γöé
         Γû╝  After 2 billing cycles
         Γöé
ΓöîΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÉ
Γöé ADMIN (Route Stabilization)                                     Γöé
Γöé                                                                 Γöé
Γöé  Run "Stabilize Routes":                                        Γöé
Γöé    1. Query assignment_items ordered by delivered_at            Γöé
Γöé       ΓåÆ Per-staff, per-UC delivery sequence                    Γöé
Γöé    2. Compare month 1 vs month 2 sequences                      Γöé
Γöé       ΓåÆ Consensus = stable route order                          Γöé
Γöé    3. Write route_seq to survey_units                           Γöé
Γöé    4. Next month's paper bills sorted by route_seq              Γöé
Γöé    5. New staff inherits existing route ΓÇö immediate onboarding  Γöé
ΓööΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÿ
```

### 18.2 Component Ownership

| Component | Role | Deliver Button? |
|-----------|------|----------------|
| **HouseDetailSheet** (`house-detail-sheet.tsx`) | Shows unit details. Owns the "Take Picture" deliver flow. Has "Navigate", "Flag", "Missed" buttons. | Γ£à Yes |
| **DeliverBottomSheet** (`deliver-bottom-sheet.tsx`) | On /deliver page. Shows unit in assignment context. Also has camera + mark delivered (secondary path). | Γ£à Yes |
| **DeliverMap** (`deliver-map.tsx`) | Map view of assigned markers on /deliver page. | Γ¥î (opens HDS on tap) |
| **DeliverCardList** (`deliver-card-list.tsx`) | Card list on /deliver page. | Γ¥î (opens HDS on tap) |
| **QR Scanner** (new: `qr-scanner-modal.tsx`) | Floating button ΓåÆ camera viewfinder ΓåÆ scan ΓåÆ open HDS. | Γ¥î (scanner only) |
| **Map View** (`map-view.tsx`) | Admin/staff map. QR scan floating button. | Γ¥î (scan opens HDS) |

### 18.3 The `useDeliverUnit()` Hook (Shared)

To avoid duplicating the deliver logic, create a shared hook used by both HouseDetailSheet and DeliverBottomSheet:

```typescript
// Returns: { capturePhoto, markDelivered, markMissed, isUploading, isMarking }
function useDeliverUnit() {
  // 1. Open native camera ΓåÆ capture photo
  // 2. Compress to WebP 1024px
  // 3. Capture GPS (silent, enableHighAccuracy)
  // 4. POST /api/deliveries/mark with:
  //    { assignment_item_id, survey_id, psid, photo, gps_lat, gps_lng, status }
  // 5. Invalidate query keys: ['staff-assignment'], ['assignment-items']
  // 6. If offline: enqueue to IndexedDB photo queue
}
```

### 18.4 API Endpoints

| Endpoint | Method | Purpose | Called By |
|----------|--------|---------|-----------|
| `/api/deliveries/mark` | POST | Mark unit delivered/missed with photo + GPS | `useDeliverUnit()` hook |
| `/api/delivery/photos` | GET | Fetch delivery photos for a PSID | HouseDetailSheet |
| `/api/delivery/photos` | POST | Upload photo from GAS webhook | GAS webhook |
| `/api/hierarchy` | GET | MC/UC filter options | Filter panel |
| `/api/bill-months` | GET | Month filter options | Filter panel |
| `/api/surveys/[survey_id]/bill-info` | GET | Bill number, route, paid status | HouseDetailSheet |

### 18.5 Database Schema Changes (Required)

Add `survey_id` to `assignment_items` so QR scanning can match directly:

```sql
ALTER TABLE public.assignment_items
  ADD COLUMN survey_id text REFERENCES survey_units(survey_id);

CREATE INDEX IF NOT EXISTS idx_assignment_items_survey_id
  ON public.assignment_items(survey_id);
```

This enables the QR scan flow: scan `sid={survey_id}` ΓåÆ `SELECT * FROM assignment_items WHERE survey_id = ? AND status = 'pending'` ΓåÆ open HDS.

### 18.6 Stealth GPS + Timestamp Capture

**Design principle:** Staff does NOT know GPS is being captured. The UI shows only "Take Picture" ΓåÆ "Photo captured" ΓåÆ unit marked delivered. GPS + timestamp are captured in the same API call as the photo upload.

Implementation:
```typescript
async function captureDelivery(assignmentItemId: string, photoBlob: Blob) {
  // 1. Capture GPS (silent ΓÇö no UI indicator)
  const gps = await new Promise<{lat: number; lng: number} | null>((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => resolve(null),  // silent fail ΓÇö don't block delivery
      { timeout: 5000, enableHighAccuracy: true }
    )
  })

  // 2. POST to API (server adds timestamp)
  const formData = new FormData()
  formData.append('photo', photoBlob)
  formData.append('assignment_item_id', assignmentItemId)
  if (gps) {
    formData.append('gps_lat', String(gps.lat))
    formData.append('gps_lng', String(gps.lng))
  }

  await fetch('/api/deliveries/mark', { method: 'POST', body: formData })
}
```

### 18.7 No Sequential Lock ΓÇö Free-Form for First 1-2 Months

Staff is NOT forced to deliver in any specific order for the first 1-2 billing cycles. They walk their natural route. Their delivery timestamps (`assignment_items.delivered_at`) capture the actual walking sequence.

After 2 months:
1. Admin clicks "Stabilize Routes" in the app
2. System groups assignment_items by PSID across last 2 months
3. Orders by delivered_at consensus (the order they MOST OFTEN visited each house)
4. Writes the consensus sequence to `survey_units.route_seq`
5. Subsequent paper bills are printed in this route_seq order
6. Staff follows the sorted paper bill stack naturally

**Edge case:** If staff walks completely different routes in month 1 vs month 2, the system detects the conflict and asks admin to choose or manually reorder.

### 18.8 Key Database Queries

**Staff's today's assignment:**
```sql
SELECT ai.*, su.consumer_name, su.address, su.lat, su.lng
FROM assignment_items ai
JOIN daily_assignments da ON da.id = ai.assignment_id
LEFT JOIN survey_units su ON su.survey_id = ai.survey_id
WHERE da.staff_id = ? AND da.assigned_date = CURRENT_DATE
ORDER BY ai.route_seq;
```

**Match QR scan to assignment:**
```sql
SELECT ai.* FROM assignment_items ai
JOIN daily_assignments da ON da.id = ai.assignment_id
WHERE ai.survey_id = ? AND da.staff_id = ? AND da.assigned_date = CURRENT_DATE
LIMIT 1;
```

**Route stabilization query:**
```sql
SELECT ai.survey_id, ai.psid, ai.gps_lat, ai.gps_lng,
  percentile_cont(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM ai.delivered_at)) as median_delivery_ts
FROM assignment_items ai
JOIN daily_assignments da ON da.id = ai.assignment_id
WHERE da.assigned_date BETWEEN ? AND ?
  AND ai.status = 'delivered'
GROUP BY ai.survey_id, ai.psid, ai.gps_lat, ai.gps_lng
ORDER BY median_delivery_ts;
```

---
## Appendix C: Session Log

### 2026-06-02 ΓÇö MASTER.md Overhaul (v19.0)

**Goal:** Update MASTER.md to reflect current state after 18 versions of development. Fix stale info, add missing sections, ensure accuracy as single source of truth.

**Changes:**
- **Section 1 (Vision):** Added comprehensive vision document with app overview, UX modes, monthly workflow, architecture principles, pipeline, DQ strategy, roadmap placeholder.
- **Section 3 (Data Model):** Expanded table listing with all survey_units columns, payment_history, house_corrections, delivery tables, pipeline tables. Added `updated_at` columns throughout.
- **Section 6 (Data Model DDL):** Added complete DDL for survey_units (including city, division, tehsil, current_bill_month, start_month), payment_history, house_corrections, daily_assignments, assignment_items, delivery_photos, staff_daily_stats, flagged_psids, bill_print_log, ingest_log. Created Subsection 6.3 (Delivery Tables) and 6.4 (Pipeline Tables).
- **Section 6.6 (Performance Indexes):** Created new subsection with all indexes from migrations 011-028.
- **Section 6.7 (Python Upsert):** Created new subsection documenting service_role pattern.
- **Section 8 (Performance Rules):** Updated to 11 rules covering `or()` filter pattern, explicit columns, `staleTime`, mutate-invalidate, column constants.
- **Section 9 (Edge Cases):** Added 5 new decisions: QR mismatch (#18), silent GPS failure (#19), offline photo sync (#20), mid-cycle staff replacement (#21), route conflict (#22).
- **Section 14 (Changelog):** Added v19.0 entry.
- **Stale reference cleanup:** Replaced all bill_items references with current state. Fixed "bill_months populated from bill_items" ΓåÆ payment_history. Fixed "bill_items.tehsil trigger" ΓåÆ removed. Fixed "start_month not stored" ΓåÆ stored since 028. Removed bill_items DDL, replaced with deprecation note. Added survey_id to assignment_items DDL.

**Key decisions:**
- QR scanner should silently record survey_id on assignment_items (enables staff to scan ΓåÆ deliver without manual PSID lookup)
- GPS failure during delivery = silent null GPS (photo timestamp is sufficient proof, but tracked as staff performance metric)
- Offline photos queued in IndexedDB, synced via GAS webhook
- Mid-cycle staff replacement = fresh assignments for remaining units, no transfer of partial completion
- Route conflict >20% = flagged for admin review, not auto-committed

### 2026-06-03 ΓÇö Routes Tab Rewrite + 1000-Limit Fix ΓÇö Location: Home

**Goal:** Fix route tree truncation (20K limit), build route-based assignment workflow, fix 1000-row PostgREST limit in tables.

**Done:**
1. **RPC `get_route_tree`** ΓÇö `scripts/sql/029-route-tree-rpc.sql`. Returns distinct routes per city/UC with counts + `is_unrouted` flag. Replaces old `SELECT ... LIMIT 20000` approach (truncated routes past row 20K).
2. **`GET /api/routes` rewrite** ΓÇö Mode 1 (route detail): batched PostgREST fetch, `surveyor_name/date/time` columns added. Mode 2 (tree): RPC with natural sort fallback.
3. **`GET /api/assignments` Mode 3** ΓÇö Added `route_name` filter param. Sort: `survey_id DESC` for Create tab (no routeName), `route_seq ASC` for Routes tab (with routeName). Batched PostgREST to bypass 1000 max-rows.
4. **`confirm-dialog.tsx`** ΓÇö Created global `ConfirmProvider` + `useConfirm()` promise-based hook. Added ESLint `no-restricted-globals` ban on native `confirm()`.
5. **Routes tab** ΓÇö Two-panel layout: left sidebar (UC groups with collapsible route tree, Unrouted count, hide unrouted-only UCs), right panel reuses `UCDetailPanel` with `routeName` prop.
6. **UCDetailPanel** ΓÇö Replaced PSID column with Address column. Accepts optional `routeName` prop. Pagination properly handles large datasets now.
7. **1000 PostgREST limit fix** ΓÇö Discovered PostgREST max-rows=1000 is a Supabase configuration limit (can't be overridden by `.range()`). Created `fetchAllRows()` helper that fetches in pages of 1000 and concatenates server-side. Applied to both `GET /api/assignments` and `GET /api/routes`.
8. **Hooks** ΓÇö Added `useRouteTree()`, `useRouteUnits()`, modified `useUnassignedBills()` to accept `routeName`.

**Key fixes:**
- `selectedCity` stores display name ("Sargodha") but RPC expects DB district ("SARGODHA") ΓÇö fixed via `CITY_TEHSIL_MAP`
- Route sort: alphabetical (`Route_1, Route_10, Route_2`) ΓåÆ natural (`Route_1, Route_2, ..., Route_10`)
- PSID column removed from create table, Address column added (visible on all screen sizes)
- Create tab sort regressed from `survey_id DESC` to `route_seq ASC` when Mode 3 was unified ΓÇö fixed by branching on `routeName`

**Key decisions:**
- PostgREST max-rows=1000 is a Supabase project config ΓÇö cannot override via headers. All large-table queries must use `fetchAllRows()` batched pattern.
- `fetchAllRows()` pattern: raw REST fetch with `Range` header, fetched in 1000-row pages, concatenated server-side. Defined in `src/app/api/assignments/route.ts` and `src/app/api/routes/route.ts`.
- Route tree RPC approach preferred over raw row fetch: bounded result (~300 rows vs 212K), fast, no limit issues.
- `get_route_tree` RPC returns "Unrouted" rows with `is_unrouted=true` flag ΓÇö frontend hides them from tree but shows count.

**Remaining:**
- DB gap #10: add `updated_at` column to `payment_history` (needs migration SQL + trigger)
- Optional: move `fetchAllRows()` to shared utility (`src/lib/queries/` or `src/lib/supabase/`) for reuse across all API routes
- The `uc-stats` API still uses `selectedCity` display name but does `CITY_TEHSIL_MAP[city]` lookup internally ΓÇö working correctly

### 2026-06-03 (Part 2) ΓÇö Architecture Improvement Plan (R.1ΓÇôR.5) ΓÇö Location: Office

**Goal:** Execute 5-phase Architecture Improvement Plan to harden the codebase before feature work.

**Done:**
1. **R.1 ΓÇö Security Guard (15 min):** Installed `server-only` package. Added `import 'server-only'` to `src/lib/supabase/admin.ts` + `server.ts` ΓÇö build-time protection against service_role key leaks.
2. **R.2 ΓÇö Zod Validation Layer (1 hr):** Created `src/lib/validation/schemas.ts` (9 shared Zod schemas) + `src/lib/validation/validate-query.ts` helper. Updated 5 routes (billing-stats, flagged-psids, data-insight, assignments, surveys) to use typed validation.
3. **R.3 ΓÇö Repository Layer (2 hr):** Created 4 repository files in `src/lib/repositories/` ΓÇö `flagged-psids-repository.ts` (6 fns), `survey-repository.ts` (2 fns), `assignment-repository.ts` (6 fns), `data-insight-repository.ts` (2 fns). Rewrote 6 API routes as thin HTTP wrappers (~80% code reduction).
4. **R.5 ΓÇö Middleware (1 hr):** Created `src/middleware.ts` ΓÇö Supabase SSR session refresh + auth guard for 7 protected routes. Removed inline `useEffect` auth guards from 6 pages (`/`, `/map`, `/assignments`, `/stats`, `/route`, `/flagged-units`). `/deliver` retains `field_staff` role guard; `/flagged-units` retains admin role check client-side.
5. **R.4a ΓÇö Stats Server Component (30 min):** Split `/stats/page.tsx` into server component (fetches staff list from Supabase) + `stats-client.tsx` (filters, table, KPI cards, performance modal).
6. **R.4b ΓÇö Route page (abandoned):** Skipped as impractical ΓÇö depends on Zustand `useBillingStore` (client-only); server pre-fetching all cities yields marginal benefit.

**Key decisions:**
- Route page stays `'use client'` ΓÇö interactive expand/collapse + city-selection + route-units fetch make Server Component split counterproductive.
- Stats page uses `placeholderData` pattern: server fetches initial staff list, client shows it while React Query refreshes.
- `html5-qrcode` chosen for QR scanner, single HouseDetailSheet with `mode` prop, floating QR button on Map view (confirmed in planning discussion).

**Verified:**
- `npx tsc --noEmit` ΓÇö zero errors
- `npm run build` ΓÇö successful. `/stats` changed from `Γùï` (Static) to `╞Æ` (Dynamic) ΓÇö correct since server component now fetches from Supabase. Middleware shows as `╞Æ Proxy (Middleware)`.
- Build output shows 23 API routes, 7 pages, middleware registered correctly.

**Updated in MASTER.md:**
- Execution Order table: Orders 1-4 (R.1-R.5, 2b, A, B1) marked Γ£à Done. B2 moved to Order 5.
- Phase B section: B1 marked Γ£à with status per step. B2 marked as current with ΓÅ│.
- Changelog v20.0 added.

**Next step:**
- Phase B2 ΓÇö Step B.13: Add `survey_id` to `assignment_items` (DB migration + code update)

### 2026-06-03 (Part 3) ΓÇö Phase B2 Delivery Flow Implementation ΓÇö Location: Office

**Goal:** Complete Phase B2 delivery flow: unified mobile UI with QR scanning, marker-based map navigation, delivery bottom sheet, and staff stats.

**Done:**
1. **Delivery target key changed from `survey_id` to `psid`** ΓÇö Fixes null-equality bug where all markers appeared selected. `deliver/page.tsx`, `map/page.tsx`, `staff-map-markers.tsx`, `qr-scanner-button.tsx` all use `psid`.
2. **QR scanner fixed** ΓÇö Added `activeView === 'map'` guard; z-index bumped `z-[100]` ΓåÆ `z-[1000]`; passes `psid` not `id`; overlay z-index also `z-[1000]`.
3. **`src/lib/markers.ts` created** ΓÇö Shared `createMarkerIcon(color, opts?)` ΓÇö 12px default size, `2px solid rgba(0,0,0,0.35)` border, no shadow. Selected markers get `2px solid #1e40af` border + CSS pulse ring. Keyframes injected once into `<head>`.
4. **`survey-markers.tsx` updated** ΓÇö Uses shared `createMarkerIcon` with `{ size: 10 }`.
5. **`staff-map-markers.tsx` updated** ΓÇö Uses shared `createMarkerIcon` with `{ selected }`. Removed `<Popup>` (sheet replaces it). Selection compares `psid` with `deliverTargetId != null` guard.
6. **`FlyToTarget` on StaffMap** ΓÇö Flies to selected marker (zoom 18, 1s) when `deliverTargetId` changes.
7. **Satellite toggle on StaffMap** ΓÇö Reads `mapType` from billing store same as `MapView`.
8. **UnitDeliverySheet redesigned** ΓÇö Full-bleed hero image with gradient overlay, all info + action buttons overlaid on image, close button top-left (white X on dark bg). Delivered state shows centered green checkmark overlay. Navigation arrows (`z-20`, `top-1/3`) + touch swipe (50px threshold, `onTouchStart`/`onTouchEnd`). Arrow buttons have `onTouchEnd` with `stopPropagation` + ref clear to prevent swipe conflict. Photo preview replaces portal image in-place.
9. **`AssignmentItemUnit` type expanded** ΓÇö Added `survey_id: string | null` and `image_urls: string[]`. API query in `assignment-repository.ts` updated to select them. `UnitDeliverySheet` uses proper types (removed `as any` casts). `onViewDetails` uses `unit.survey_id`.
10. **Stats page for field_staff** ΓÇö Bottom tab now goes to `/stats` route. `StatsClient` shows `StaffPersonalStats` component for non-admin users ΓÇö today's assignment progress (delivered/missed/pending cards + progress bar) + 7/30/90 day historical performance KPIs. Uses `useStaffAssignment` + `useStaffStats` hooks.
11. **Deliver page redesigned** ΓÇö Compact mobile list ΓÇö progress header bar with thin progress meter, pagination (50/page with prev/next), route seq circles, consumer name + status dot, delivered timestamp, amount right-aligned. Removed camera icon per row, border-left accent cards.
12. **Stale files deleted** ΓÇö `deliver-map.tsx`, `deliver-bottom-sheet.tsx`, `deliver-action.tsx`, `deliver-card-list.tsx`.
13. **Arrow buttons moved higher** ΓÇö `top-1/2` ΓåÆ `top-1/3` to avoid overlapping bottom info text.

**Verified:**
- `npx tsc --noEmit` ΓÇö zero errors
- `npm run build` ΓÇö successful (all 23 API routes, 7 pages, middleware)

**Key decisions:**
- `psid` used as delivery target key instead of `survey_id` ΓÇö always populated, no backfill needed for existing assignments.
- `createMarkerIcon` lives in `src/lib/markers.ts` ΓÇö single source of truth for all map markers (admin + staff), with size and selected-state options.
- UnitDeliverySheet uses full-bleed hero image with overlaid buttons ΓÇö more compact, shows more of the portal image, matches modern mobile UI patterns.
- Stats tab on mobile navigates to `/stats` route ΓÇö staff see personal progress, admins see full dashboard.

**Remaining (from home):**
- **B.10 ΓÇö Wire HDS toolbar Deliver/Missed buttons to real camera + GPS + mark actions via shared `useDeliverUnit()` hook.** Currently buttons are present but not wired to real actions. Need to:
  1. Create or reuse `useDeliverUnit()` hook that captures photo via native camera, gets GPS via Geolocation API, creates `delivery_photos` row, marks `assignment_items.status='delivered'`.
  2. Wire "Take Picture" button ΓåÆ opens native camera ΓåÆ photo confirm ΓåÆ GPS + timestamp captured silently ΓåÆ mark delivered.
  3. Wire "Missed" button ΓåÆ reason dialog ΓåÆ GPS ΓåÆ mark missed.
  4. Wire "Navigate" button ΓåÆ show distance/direction to house marker.
  5. After marking delivered/missed, auto-advance to next pending unit (or show overlay confirming action).
- **B.11 ΓÇö "Flag" button** ΓåÆ text notes ΓåÆ POST to `flagged_psids`.
- **B.12 ΓÇö Auto-advance**: After marking delivered in HDS, keep view open for next QR scan. Deliver page progress updates in real-time via query invalidation.

**Updated in MASTER.md:**
- Phase B2 section: B.13, B.14, B.9, B.15, B.16, B.17, B.18, B.19, B.20, B.21 marked Γ£à. B.10, B.11, B.12 remain ≡ƒö▓.
- Execution Order: B2 changed from ΓÅ│ Next to ΓÅ│ In Progress.
- Changelog v21.0 added.

### Next Session (From Home)
Start with **B.10**:
1. Create a shared `useDeliverUnit()` hook in `src/hooks/use-deliver-unit.ts` that:
   - Accepts photo capture (via file input or native camera)
   - Captures GPS via `navigator.geolocation.getCurrentPosition()`
   - POSTs to `POST /api/deliver/unit` which creates `delivery_photos` row + marks `assignment_items.status='delivered'`
   - Returns mutation state for loading/error display
2. Wire the "Take Picture" button in `UnitDeliverySheet` to this hook
3. Wire "Missed" button ΓåÆ reason dialog ΓåÆ GPS ΓåÆ POST with status='missed'
4. Run `npx tsc --noEmit` and `npm run build` to verify

---
### 2026-06-04 ΓÇö Khushab Investigation + Delivery KPIs Removal + Aggregate Status Toggle ΓÇö Location: Office

**Goal:** Investigate Khushab data failing in Create Assignments and Data Insight; fix client-reported issues.

**Investigation:**
- Confirmed Khushab data IS correct: 65,122 survey_units with `current_bill_month='MAY2026'`, API returns data (KHB 01: 814 unassigned, KHB 02: 4157, UC-23 GIROTE: 2128).
- No mismatches between `hierarchy_summary` and `survey_units` for Khushab UCs.
- "All bills assigned" message appeared for UCs with 0 active units (JBD 02: 181 archived, UC-7 PADHRAR: 1008 archived) ΓÇö this is **correct behavior**, not a bug.
- The UC list panel already shows `active_units` count per UC.
- Root cause of confusion: UCs with 0 active units were visible and selectable, leading to empty detail panel.

**Done:**
1. **Delivery KPIs removed entirely** (4 files):
   - Deleted `getDeliveryKpis` function + `DeliveryKpis` interface from `data-insight-repository.ts`
   - Removed from API route (`data-insight/route.ts`) ΓÇö no more `kpisPromise` or `delivery_kpis` in responses
   - Removed from hook (`use-data-insight.ts`) ΓÇö `DeliveryKpis` type and `delivery_kpis` field removed
   - Removed from component: `DeliveryKpiCards`, `dkpiConfig`, unused icons (Truck, Camera, PersonStanding, Percent)

2. **Status toggle now visible at aggregate level** (2 files):
   - `use-data-insight.ts:89` ΓÇö `if (status)` always sends status param (was `if (drillUC && status)`)
   - `data-insight.tsx` ΓÇö toggle bar moved outside `{level === 'unit'}` block, shows Active/Archived at both levels. "Duplicates" only at drill-down (RPC can't filter duplicates at aggregate).
   - The RPC `get_hierarchy_stats` already supports `p_status` ΓÇö no DB changes needed.

3. **UC list hides 0-active UCs** (1 file):
   - `uc-list-panel.tsx:34-37` ΓÇö added `.filter(u => u.active_units > 0)` so archived-only UCs don't appear.

4. **Aggregate table hides 0-total rows** (1 file):
   - `data-insight.tsx:336` ΓÇö `.filter(r => r.total_units > 0)` so toggle state hides empty rows.

**Key decisions:**
- Status filter at aggregate level uses the same RPC `p_status` param as drill-down ΓÇö the RPC already handles it.
- "Duplicates" excluded from aggregate toggle ΓÇö RPC doesn't support duplicates filtering at group level.
- 0-active-unit UCs hidden from assignment list ΓÇö no point clicking a UC with nothing to assign.

**Verified:**
- `npx tsc --noEmit` ΓÇö zero errors.
- `npm run build` ΓÇö successful after clearing `.next/` cache (Turbopack had cached stale `getDeliveryKpis` import).

**Next session:**
- Phase B2 remaining: B.10 (wire deliver buttons to real camera/GPS/actions), B.11 (Flag button), B.12 (auto-advance).
- Backlog: DB gap #10 ΓÇö add `updated_at` to `payment_history`.

### 2026-06-04 (Part 2) ΓÇö Desktop Deliver Sheet Debugging ΓÇö Location: Office

**Goal:** Make the `UnitDeliverySheet` (staff delivery bottom sheet) appear on desktop when clicking a marker on `/map`.

**Investigation:**
1. **Admin gate removed** (line 46 of `map/page.tsx`): `if (!deliverTargetId || roleName !== 'field_staff')` ΓåÆ `if (!deliverTargetId)` ΓÇö allowed sheet to render for any role. Did not fix staff desktop issue (staff already passed the gate).
2. **URL param approach** (`?target=PSID` from `/deliver` to `/map`): Added `useEffect` to read `?target=` on mount. Did not fix the marker-click flow (the user tested by clicking markers directly on `/map`, not via `/deliver` navigation).
3. **Inline sheet on `/deliver` page**: Replaced `router.push('/map')` with local `selectedItemId` state + inline `UnitDeliverySheet` on `/deliver` page. Avoided cross-page state entirely but **broke everything** ΓÇö reverted.
4. **Debug badge overlay**: Added a top-right debug badge showing all condition states (`activeView`, `deliverTargetId`, `deliveryUnit`, `roleName`, `staffItems.length`, `match`). All showed Γ£ô ΓÇö confirming the JSX condition was met but the sheet was not visible.
5. **Green "SHEET RENDERED Γ£ô" indicator**: Rendered with the same JSX condition as the sheet ΓÇö confirmed the condition WAS true.
6. **Sheet CSS investigation**: Added red border, `minWidth: 400px`, `minHeight: 200px` to the sheet's outermost div, plus a debug return path inside the sheet component ΓÇö sheet became visible.

**Root cause:**
The `UnitDeliverySheet` component rendered in the DOM but was visually invisible on desktop due to CSS layout collapse:
- The sheet used `position: fixed; bottom: 0; left: 50%; right: auto;` with no explicit `width`
- Inside, `flex-1 min-h-[300px]` children had no extrinsic height reference because the parent had `max-h-[80vh]` but no definite `h-*`
- On desktop (sidebar open, narrower content area), the collapsed layout made the sheet effectively 0px ├ù 0px ΓÇö invisible to the user
- The `lg:left-1/2 lg:-translate-x-1/2 lg:max-w-md` centered the element, but a collapsed element has nothing to display

**Done:**
1. Removed admin gate from `deliveryItem` resolver in `map/page.tsx`
2. Added URL param (`?target=PSID`) reading in `map/page.tsx` for deliver ΓåÆ map flow
3. Added `?target=` param to `router.push` in `deliver/page.tsx`
4. Added debug badge overlay (z-[9999], top-right) for diagnosing condition states
5. Added green confirmation indicator at same condition as sheet
6. Added `minWidth`, `minHeight`, and red border to sheet for visibility
7. Added debug null-return path in `UnitDeliverySheet` with red banner explaining why

**Verified:**
- `npx tsc --noEmit` ΓÇö zero errors
- `npm run build` ΓÇö successful

**Key decisions:**
- The debug badge + green indicator pattern proved the condition was met but CSS was hiding the sheet ΓÇö useful diagnostic approach for future visual bugs.
- `minWidth` and `minHeight` on `fixed` elements prevent layout collapse on desktop when the element has no intrinsic size.
- Two session log locations exist in MASTER.md (Section 12 + Appendix C) ΓÇö this entry appended to Appendix C for consistency with recent format.

**Remaining:**
- The CSS fix (minWidth/minHeight) is a diagnostic aid, not a permanent fix. The actual `UnitDeliverySheet` needs proper responsive layout.
- Phase B2: B.10, B.11, B.12 still ≡ƒö▓

### 2026-06-05 ΓÇö Design Overhaul + File Cleanup + Audit Absorption ΓÇö Location: Home

**Focus:** Redesign delivery verification system, clean up project structure, absorb audit report into MASTER.md.

**Done:**
1. **Root directory cleanup** (17 files):
   - Moved 9 Python test scripts + 3 diagnostic files ΓåÆ `scripts/`
   - Moved 5 test JSON fixtures ΓåÆ `scripts/data/`
2. **Scripts folder reorganization**:
   - Moved 6 reference files (routingstation, config, geography, etc.) ΓåÆ `scripts/ref/`
   - Moved 8 one-time migration scripts ΓåÆ `scripts/archive/`
   - Deleted 12 temp debug files (check_*.py, diagnostic.*, test_batch.py)
   - Removed duplicate `config.py` (already existed in ref/)
3. **Delivery flow redesign** (new design, not yet implemented):
   - **One-tap flow**: Take Picture ΓåÆ auto-saves ΓåÆ no "Confirm Delivery" button
   - **New status**: `pending` ΓåÆ `processing` ΓåÆ `delivered`
   - **GPS distance verification**: Haversine distance Γëñ 50m = auto-verify
   - **Full enforcement**: No Missed/Skip statuses
   - **Missing GPS/distance >50m** ΓåÆ `processing` (admin review)
   - **Server handles webhook synchronously** ΓÇö response includes verification result
   - **Photo target**: WebP q0.6, 1024px, 30-70KB (same as legacy app)
4. **Audit report absorbed**:
   - Created Section 20 (Delivery Verification System) ΓÇö full design doc
   - Created Section 21 (Audit Findings Summary) ΓÇö grades, risks, phased plan from `AUDIT-2026-06-04.md`
   - Created Section 22 (User Design Decisions) ΓÇö 10 design decisions with rationale
   - Updated B.10-B.12 to reflect new one-tap design
   - Updated Execution Order with audit-based phases (P1-P6)
   - Updated Changelog to v23.0
   - Updated Table of Contents with new sections

**Key decisions (see Section 22 for full detail):**
- Map-centric delivery is correct by design (staff needs spatial awareness + house photo)
- One-tap flow eliminates staff complaint #1 ("too slow")
- Silent GPS prevents gaming ΓÇö staff never knows GPS is captured or verified
- 50m distance threshold accounts for survey + delivery GPS imprecision
- No Missed/Skip ΓÇö full enforcement with processing status for edge cases
- Two Drive accounts should be consolidated to one webhook
- Debug artifacts (badge + red border) must be removed before production use

**Remaining work (in order):**
1. B.10 ΓÇö Implement `useDeliverUnit()` hook + `POST /api/deliveries/mark` + one-tap flow
2. B.11 ΓÇö Auto-advance + distance badge + current-location dot on StaffMap
3. P1 ΓÇö Fix H1-H3 egress bugs (PSID loop, unbounded fetches, staff stats)
4. P2 ΓÇö Authorization hardening (requireRole, RLS, ownership checks)
5. C ΓÇö Admin Dashboard (staff performance, delivery KPIs)
6. Continue with remaining phases per execution order

### 2026-06-05 (Part 2) ΓÇö Universal UnitDeliverySheet ΓÇö Location: Office

**Focus:** Fix desktop sheet invisibility, make UnitDeliverySheet work for both staff and admin, add filter-aware navigation.

**Problem statement:** The UnitDeliverySheet (the action sheet with photo capture) was:
1. Hidden on desktop due to a CSS bug (`left-1/2 -translate-x-1/2` removed right anchor without setting width)
2. Only accessible to staff with assignment (admin couldn't open it)
3. Only navigable through `staffItems` (not the visible filtered set)

**Files changed (5):**

1. **`src/components/delivery/unit-delivery-sheet.tsx`**
   - Line 91: Replaced broken centering CSS `fixed bottom-0 left-0 right-0 ... lg:left-1/2 lg:-translate-x-1/2 lg:max-w-md lg:right-auto` with `fixed bottom-0 inset-x-0 ... min-h-[300px] mx-auto w-full max-w-md`
   - Line 84: Removed `!assignmentItemId` from null-return guard ΓÇö admin can now see the sheet
   - Lines 208-249: Action buttons are now role-aware. When `assignmentItemId` is present (staff with assignment): show "Take Picture & Deliver" + secondary "Details" button. When null (admin or no assignment): hide delivery button, show only prominent "View Details" button.

2. **`src/stores/billing-store.ts`**
   - Added `deliverTargetUnit: AssignmentItemUnit | null` to state
   - Added `deliverableList: AssignmentItemUnit[]` and `deliverableIndex: number` for filter-aware navigation
   - Updated `setDeliverTarget(id, unit?)` ΓÇö now stores unit data directly, removes role-specific lookup dependency
   - Added `setDeliverableList(list)` ΓÇö populates from filtered markers
   - Added `nextDeliverable()` and `prevDeliverable()` ΓÇö navigate through the visible set

3. **`src/components/survey-markers.tsx`** (admin markers)
   - Marker click: changed from `selectHouse(survey_id)` to `setDeliverTarget(s.psid, unitData)`
   - Added `toAssignmentUnit()` helper to convert SurveyUnit ΓåÆ AssignmentItemUnit shape
   - Added useEffect that populates `deliverableList` from filtered markers
   - Filter excludes markers without `psid` (98% have one)

4. **`src/components/delivery/staff-map-markers.tsx`** (staff markers)
   - Marker click: now passes `item.unit` directly to `setDeliverTarget(psid, unit)` instead of relying on a lookup

5. **`src/app/map/page.tsx`**
   - Removed `roleName !== 'field_staff'` gate from sheet rendering
   - Reads `deliverTargetUnit` directly from store (no more `staffItems.find()` lookup)
   - Added useEffect that populates `deliverableList` from `staffItems` for field_staff
   - Added sync useEffect that updates `deliverTargetUnit` when URL-param target ID is found in the loaded deliverableList
   - Sheet `onPrev`/`onNext` now use store's `prevDeliverable`/`nextDeliverable` (works for both roles)

**New behavior:**
- **Staff with assignment:** Tap any marker on `/map` ΓåÆ UnitDeliverySheet opens with "Take Picture & Deliver" + "Details" buttons. Prev/next navigates through staff's assignment.
- **Staff without assignment / Admin:** Tap any marker on `/map` ΓåÆ UnitDeliverySheet opens with ONLY "View Details" button (no delivery action). Prev/next navigates through currently filtered set.
- **Desktop:** Sheet now visible at 28rem wide, centered at viewport bottom (was hidden before).

**Key data flow:**
- Admin map ΓåÆ SurveyMarkers click ΓåÆ setDeliverTarget(psid, unit) ΓåÆ sheet opens with unit data
- Staff map ΓåÆ StaffMapMarkers click ΓåÆ setDeliverTarget(psid, unit) ΓåÆ sheet opens with unit data
- `/deliver` flow ΓåÆ URL param ΓåÆ setDeliverTarget(psid) ΓåÆ staff data loads ΓåÆ sync effect updates unit ΓåÆ sheet opens

**Build verification:** `tsc --noEmit` zero errors. `npm run build` successful.

**Remaining work (unchanged from prior session):**
1. B.10 ΓÇö Implement `useDeliverUnit()` hook + `POST /api/deliveries/mark` + one-tap flow
2. B.11 ΓÇö Auto-advance + distance badge + current-location dot on StaffMap
3. P1 ΓÇö Fix H1-H3 egress bugs (PSID loop, unbounded fetches, staff stats)
4. P2 ΓÇö Authorization hardening (requireRole, RLS, ownership checks)

### 2026-06-05 (Part 3) ΓÇö UnitDeliverySheet Persistence Across HDS ΓÇö Location: Office

**Focus:** When user opens HDS (HouseDetailSheet) via "View Details" on UnitDeliverySheet, then closes HDS, the delivery sheet should still be open on the map.

**Problem:** `onViewDetails` was calling `setDeliverTarget(null)` which cleared `deliverTargetId` and `deliverTargetUnit`. When HDS closed and `activeView` reverted to `'map'`, the sheet condition (`activeView === 'map' && deliverTargetId && deliveryUnit`) was false because the target was cleared.

**Files changed (1):**

1. **`src/app/map/page.tsx`**
   - Removed `setDeliverTarget(null)` from the `onViewDetails` handler (lines 117-121)
   - The handler now only calls `selectHouse(unitSurveyId)` to open HDS
   - `deliverTargetId` and `deliverTargetUnit` stay in the store while HDS is open
   - When HDS closes, `activeView` reverts to `'map'`, sheet reopens with same unit

**New behavior:**

```
1. Map ΓåÆ click marker ΓåÆ UnitDeliverySheet opens (unit A)
2. Click "View Details" ΓåÆ HDS opens (sheet hidden behind)
3. Browse HDS freely (navigate to units B, C, D)
4. Close HDS ΓåÆ map returns
5. UnitDeliverySheet still open for unit A Γ£ô
```

**No regression for explicit close:** Clicking X on the sheet still calls `setDeliverTarget(null)` ΓÇö explicit user intent is honored.

**No regression for delivery:** `handleDeliver` still calls `setDeliverTarget(null)` after enqueuing the photo ΓÇö sheet closes after successful delivery.

**Build verification:** `tsc --noEmit` zero errors. `npm run build` successful.

### 2026-06-05 (Part 4) ΓÇö Minimal Marker Tooltip ΓÇö Location: Office

**Focus:** Replace verbose Leaflet Popup (4 fields) with sleek hover Tooltip (1 field: survey_id). Industry-standard pattern for large-scale maps.

**Problem:** Clicking an admin marker opened BOTH a Leaflet Popup (consumer name, survey_id, uc, address) AND the UnitDeliverySheet ΓÇö fighting for screen space. Staff markers had no hover info at all.

**Files changed (3):**

1. **`src/components/survey-markers.tsx`**
   - Imported `Tooltip` from react-leaflet (replaced `Popup`)
   - Marker now shows `<Tooltip direction="top" offset={[0,-8]} className="survey-tooltip">{s.survey_id}</Tooltip>`
   - Click handler still calls `setDeliverTarget(s.psid, unit)` ΓÇö no longer fights with a Popup

2. **`src/components/delivery/staff-map-markers.tsx`**
   - Added Tooltip showing `survey_id` (or `psid` fallback) for consistency
   - Staff now gets hover-to-peek at survey_id like admin

3. **`src/app/globals.css`**
   - Added `.leaflet-tooltip.survey-tooltip` styles in `@layer base`
   - Styled to match project theme: popover background, mono font (Geist Mono), 11px, 6px border-radius
   - Customized all 4 directional arrows (top/bottom/left/right) to match the popover background color

**New behavior:**
- **Hover** marker ΓåÆ small sleek tooltip appears with `survey_id` only (no Popup, no sheet)
- **Click** marker ΓåÆ tooltip dismisses, UnitDeliverySheet opens directly (no Popup fighting)
- **Staff markers** now have consistent hover tooltip like admin
- **Dark mode** automatically uses the dark theme's `--popover` variable

**Industry standard:** Google Maps, Uber, Lyft all use hover tooltips for quick peeks and click for full info. This pattern is now implemented.

**Tooltip CSS:**
```css
.leaflet-tooltip.survey-tooltip {
  background: var(--popover);
  color: var(--popover-foreground);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 2px 8px;
  font-family: var(--font-geist-mono);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.02em;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.12);
  white-space: nowrap;
}
```

**Build verification:** `tsc --noEmit` zero errors. `npm run build` successful.

### 2026-06-05 (Part 5) ΓÇö Heartbeat on Admin Map Markers ΓÇö Location: Office

**Focus:** Bring the selected-marker heartbeat animation (previously only on staff delivery markers) to the normal admin map.

**Problem:** `SurveyMarkers` (admin) rendered static markers. Clicking a marker opened the UnitDeliverySheet but the marker had no visual feedback indicating it was the active target. The pulse/heartbeat animation only worked on `StaffMapMarkers`.

**Files changed (1):**

1. **`src/components/survey-markers.tsx`**
   - Read `deliverTargetId` from `useBillingStore` (already imported)
   - For each marker, compute `isSelected = deliverTargetId != null && s.psid === deliverTargetId`
   - Pass `{ size: 10, selected: isSelected }` to `createMarkerIcon` (reusing the existing heartbeat logic in `src/lib/markers.ts`)

**How it works (existing infrastructure):**
- `createMarkerIcon(color, { selected: true })` renders a pulse ring around the marker
- The pulse uses `@keyframes marker-pulse` injected once in `markers.ts` (1.5s ease-in-out infinite, scale 0.6 ΓåÆ 2.5, opacity 0.5 ΓåÆ 0)
- Selected border: `2px solid #1e40af` (blue) vs `2px solid rgba(0,0,0,0.35)` (default)

**New behavior:**
- Open `/map` as admin ΓåÆ click any marker ΓåÆ that marker now pulses with a blue border + expanding ring
- Navigate prev/next via sheet ΓåÆ heartbeat follows the active marker
- Close sheet (X) ΓåÆ all markers return to static state
- Same behavior on staff map (was already working)

**Build verification:** `tsc --noEmit` zero errors. `npm run build` successful.

### 2026-06-05 (Part 6) ΓÇö GPS Enforcement Toggle + Test Data + Live GPS Tracking ΓÇö Location: Remote

**Focus:** GPS enforcement settings (toggle + threshold), test survey units in DB, live distance indicator in sheet, pre-warmed GPS fix, query invalidation, staff location marker on map

**Done:**
- **Test data** ΓÇö `scripts/sql/032-test-data.sql`: 5 survey units at admin PC coordinates (32.071639, 72.657694) with distances 20m/30m/40m/55m/70m, status=NULL, SARGODHA/SARGODHA/TESTMC. Pre-assigned batch for staff 'zubair' (uuid `671dd08c-...`).
- **GPS badge in sheet** ΓÇö `POST /api/deliveries/mark` now returns `gps_lat`, `gps_lng`, `target_lat`, `target_lng`. `useDeliverUnit` returns all GPS fields. Sheet overlay shows GPS coords + distance after delivery.
- **App settings table** ΓÇö `scripts/sql/033-app-settings.sql`: `app_settings(key, value jsonb)` + seed `gps_enforcement = {"enforce":true,"threshold":50}`.
- **Settings API** ΓÇö `GET/PATCH /api/settings`. PATCH admin-only (checks role via profiles).
- **Settings UI** ΓÇö New "Delivery" tab in Settings page (admin-only): toggle + threshold input + save.
- **Enforcement wired** ΓÇö Mark route reads `gps_enforcement` from DB. `enforce=false` ΓåÆ always `delivered`. Configurable threshold instead of hardcoded 50.
- **Live GPS distance** ΓÇö Sheet shows continuous distance via `watchPosition`: green Γëñ50m, amber 51-200m, white >200m.
- **Fix: GPS timeout** ΓÇö `captureGPS` timeout 3sΓåÆ8s. Sheet stores pre-warmed GPS from `watchPosition`, passes as `gpsOverride` to `deliver()` ΓÇö instant GPS, no cold fix wait.
- **Fix: Stale cache** ΓÇö `queryClient.invalidateQueries(['staff-assignment'])` fires after delivery ΓÇö status updates instantly on `/deliver` list and map markers.
- **Fix: Staff location marker** ΓÇö `useUserLocation()` hook (reusable `watchPosition` wrapper). Blue dot on staff map, no accuracy circle.
- **Switch component** ΓÇö `src/components/ui/switch.tsx` (base-ui Switch primitive).

**New files:**
- `src/hooks/use-user-location.ts`
- `src/app/api/settings/route.ts`
- `src/components/ui/switch.tsx`
- `scripts/sql/032-test-data.sql`
- `scripts/sql/033-app-settings.sql`

**Modified files:**
- `src/components/delivery/unit-delivery-sheet.tsx`
- `src/components/delivery/staff-map.tsx`
- `src/hooks/use-deliver-unit.ts`
- `src/app/api/deliveries/mark/route.ts`
- `src/app/settings/page.tsx`

**Key discoveries:**
- 3s GPS timeout was too short for `enableHighAccuracy` on mobile ΓÇö caused null GPS ΓåÆ `processing` for every delivery
- `app_settings` table had `text` column (pre-existing) instead of `jsonb` ΓÇö had to DROP and recreate
- `city` column (migration 024) not applied to this Supabase project ΓÇö omitted from test data INSERT
- No query invalidation existed after `POST /api/deliveries/mark` ΓÇö delivery status was stale for 30s

**Testing Verification:**
1. Staff `/deliver` ΓåÆ tap item ΓåÆ sheet shows live distance + blue dot on map
2. Take photo at 5m ΓåÆ instant `delivered` (no GPS timeout "processing")
3. Status updates immediately on `/deliver` list and map marker color
4. Admin Settings ΓåÆ Delivery ΓåÆ toggle OFF ΓåÆ any distance = `delivered`
5. Change threshold to 80m ΓåÆ 55m delivery now `delivered` instead of `processing`
6. Staff map shows blue dot following their position

**Remaining phases (priority order):**
1. **B3** Delivery Stability & Hardening (CHECK fix, auth on mark, webhook timeout, GPS reliability, photo queue, state machine, remaining auth, RLS) ΓÇö 8h ΓåÉ **CURRENT FOCUS**
2. **P1** Egress & Stability (PSID pagination loop, unbounded fetches, staff stats fallback) ΓÇö 6h
3. **P2** Authorization Hardening (`requireRole()`, RLS policies, ownership checks) ΓÇö 4h
4. **C** Admin Dashboard (staff performance, delivery KPIs) ΓÇö 3h
5. **E** Flag Management UI ΓÇö 4h
6. **RBAC** Approval Chain (draftΓåÆpendingΓåÆapprovedΓåÆactive) ΓÇö 3h
7. P3-P6 Validation, logging, egress caching ΓÇö 17h
8. **F** Auto-Route Generation ΓÇö 3h
9. **G** Live Admin Monitoring ΓÇö 3h
10. **D** Visual Rehaul ΓÇö 4h
11. **Z** Audit Cleanup ΓÇö 4h
12. **Deploy** Office PC pipeline ΓÇö 1h

### 2026-06-05 (Part 7) ΓÇö Fix Invisible "Processing" Status ΓÇö Location: Remote

**Focus:** Items with `status='processing'` (GPS null or distance > threshold) showed as blue "Pending" instead of amber "Processing" because `STATUS_CONFIG` and `STATUS_COLORS` had no `processing` key.

**Files changed (3):**

1. **`src/types/index.ts:121`** ΓÇö Added `'processing'` to `AssignmentItem.status` union type (`'pending' | 'processing' | 'delivered' | 'missed' | 'skipped'`).

2. **`src/app/deliver/page.tsx`** ΓÇö Added `processing: { label: 'Processing', dot: 'bg-amber-500' }` to `STATUS_CONFIG` (line 20). Added `item.status === 'processing' && 'text-amber-600'` to label color class (line 189).

3. **`src/components/delivery/staff-map-markers.tsx:11`** ΓÇö Added `processing: '#f59e0b'` to `STATUS_COLORS`.

**Effect:** Items with `status='processing'` now show amber dot + "Processing" label on `/deliver` list and amber markers on the staff map. No longer falsely shown as "Pending".

**Build verification:** `npx tsc --noEmit` zero errors. `npm run build` successful.

**Remaining phases (updated):**
1. **B3** Delivery Stability & Hardening ΓÇö 8h ΓåÉ **CURRENT FOCUS**
2. **P1** Egress & Stability ΓÇö 6h
3. **P2** Authorization Hardening ΓÇö 4h
4. **C** Admin Dashboard ΓÇö 3h
5. **E** Flag Management UI ΓÇö 4h
6-12. Remaining phases per priority order

### 2026-06-05 (Part 8) ΓÇö Speed Optimizations + Admin Force Complete ΓÇö Location: Home

**Focus:** Speed up the delivery flow, eliminate GPS wait, improve post-delivery messages, add optimistic cache update, admin Force Complete for stuck processing items.

**Done (4 changes, 1 file addition):**

1. **Fast GPS timeout** (use-deliver-unit.ts): `captureGPS` timeout 8s ΓåÆ 3s. `enableHighAccuracy: false` (per Section 20 design ΓÇö silent GPS, cached positions via `maximumAge: 5000`). Button fires request in ~3s max, even on GPS-poor devices.

2. **Context-aware delivery messages** (unit-delivery-sheet.tsx): Replaced generic "Photos pending sync" with two clear messages:
   - `deliveryDistance == null` ΓåÆ "Saved ΓÇö Awaiting GPS Verification" (no GPS available)
   - `deliveryDistance != null` ΓåÆ "Out of range ΓÇö Awaiting Review" (GPS worked but beyond threshold)
   - Removed emoji from GPS coords display (professional UI).

3. **Optimistic cache update** (unit-delivery-sheet.tsx): After successful `POST /api/deliveries/mark`, immediately `setQueryData(['staff-assignment', userId])` to flip the item's status + set `delivered_at`. List updates instantly (no refetch round-trip). Fallible invalidate still fires for eventual consistency.

4. **Admin Force Complete** (new route + sheet button):
   - New `POST /api/deliveries/force/route.ts`: Accepts `{ psid }`, verifies admin/super_admin role, finds the latest pending/processing assignment_item for that PSID, sets status='delivered'. Uses `createAdminClient()` (service_role key).
   - Sheet button: Shows "Force Complete (admin)" amber button in the action section when `deliveryStatus === 'idle'` and role is admin/super_admin. Uses `useConfirm()` for accidental-click protection. Invalidates staff-assignment + assignment-totals queries.

**Files changed:**
- `src/hooks/use-deliver-unit.ts` ΓÇö 3 edits (timeout, accuracy, fallback)
- `src/components/delivery/unit-delivery-sheet.tsx` ΓÇö 3 edits (messages, optimistic update, force complete button)
- `src/app/api/deliveries/force/route.ts` ΓÇö NEW (38 lines)

**Key discoveries:**
- `enableHighAccuracy: true` on the office PC (no GPS chip) caused the full 8s timeout to elapse before every delivery attempt ΓÇö the 3-step flow was 8s GPS wait + photo compression + upload = ~12-15s per delivery
- The generic "Photos pending sync" message was misleading ΓÇö staff interpreted as sync failure when it was actually GPS failure
- No optimistic cache update meant status stayed "pending" in the list until the server refetch completed (30s staleTime)
- Admin had no way to clear stuck processing items without SQL

**Testing Verification:**
1. Staff `/deliver` ΓåÆ tap item ΓåÆ sheet opens ΓåÆ GPS resolves in Γëñ3s (was 8s+) ΓÇö button feels snappy
2. No GPS device ΓåÆ request fires within 3s ΓåÆ amber "Saved ΓÇö Awaiting GPS Verification" instead of "Photos pending sync"
3. Successfully delivered ΓåÆ list shows green immediately (no 30s wait)
4. Admin `/map` ΓåÆ click marker ΓåÆ "Force Complete (admin)" button shown ΓåÆ confirm ΓåÆ item flips to delivered
5. Force Complete from admin map ΓåÆ staff's list reflects green on next refetch (or instantly if cache invalidated)
6. `tsc --noEmit` ΓÇö zero errors

---

### 2026-06-05 (Part 9) ΓÇö Notifications System (P1-P3) + Users Tab Restructure ΓÇö Location: Home

**Focus:** Build in-app notification system ΓÇö DB, API, hooks, bell UI, and admin notification form. Restructure Users tab.

**Done (P1 ΓÇö Notifications Infrastructure):**
- **P1a** ΓÇö Created `scripts/sql/037-notifications.sql` (table, indexes, RLS). **Not applied to Supabase** ΓÇö needs PAT token.
- **P1b** ΓÇö Added `Notification` interface to `src/types/index.ts`
- **P1c** ΓÇö `GET /api/notifications/route.ts`: Returns notifications + unread count + admin summary. Auto-creates `admin_alert` when `pending + processing > 0` with no existing unread alert.
- **P1d** ΓÇö `POST /api/notifications/read/route.ts`: Mark single or all as read.
- **P1e** ΓÇö `POST /api/admin/notifications/route.ts`: Admin sends to individual staff or all staff.
- **P1f** ΓÇö `src/hooks/use-notifications.ts`: 3 React Query hooks (fetch, mark read, mark all read).

**Done (P2 ΓÇö Notifications Bell UI):**
- **P2a** ΓÇö `notifications-bell.tsx`: Bell icon + unread badge + bottom sheet (mobile) + dropdown anchored fixed (desktop). Admin summary block, notification list with type icons and deep links, "Mark all read" button, empty state, polling every 30s.
- **P2b** ΓÇö `DesktopFilterBar ActionButtons`: `NotificationsBell` + satellite toggle (`Layers` button) side-by-side.
- **P2c** ΓÇö `AppHeader` (mobile): `NotificationsBell` added after refresh button in header row 1.

**Done (P3 ΓÇö Staff Notification Form):**
- Created staff notification form: recipient dropdown (all staff + individual field staff), subject, message, Send ΓåÆ `POST /api/admin/notifications`.
- **Moved from Delivery tab to Users tab sidebar** ΓÇö more discoverable.
- **Panel positioning fix** ΓÇö desktop dropdown uses `fixed` (not `absolute`) + `top-[48px] right-2`.
- **Recipient dropdown fix** ΓÇö `SelectValue` now shows display name via `notifyUserLabel` memo instead of UUID.

**Done (Users Tab Redesign):**
- Flex row layout (sidebar 260px + main `flex-1`).
- City group header rows (Γÿà Super Admin / Admin / City name / Unassigned) using `<Table>` component.
- Sorted by role ΓåÆ city ΓåÆ name.
- `RoleSelect` CSS with colored dots (blue for admin, muted for staff).

**Known issue:** `037-notifications.sql` not yet applied to Supabase ΓÇö PAT token required.

### 2026-06-06 ΓÇö Users Tab UI Polish (P4) ΓÇö Location: Home

**Focus:** Polish Users tab ΓÇö city accent colors, typography consistency, dropdown styling.

**Done (P4 ΓÇö Users Tab UI Polish):**
- **P4.1** ΓÇö Added `hideChevron` prop to `SelectTrigger` in `src/components/ui/select.tsx`. Enables clean icon-only action dropdowns without a visible chevron icon.
- **P4.2** ΓÇö City accent colors on group headers (emerald=Sargodha, blue=Bhalwal, amber=Khushab) matching CitySwitcher. Same colors applied to city selector dropdowns in Add User + Edit City dialogs.
- **P4.3** ΓÇö Typography consistency: table header `text-[11px]` ΓåÆ `text-xs`, group headers `text-[11px]` ΓåÆ `text-xs`, badges `text-[9px]` ΓåÆ `text-[10px]`.
- **P4.4** ΓÇö Action dropdown cleanup: removed conflicting CSS (`min-w-[32px] w-8 h-8 p-0 flex items-center justify-center`), replaced with `size="sm" className="size-7 p-0"` + `hideChevron`.

**Key decisions:**
- `hideChevron` is a prop on the shared `SelectTrigger` ΓÇö reusable for any icon-only select
- City accent colors match `CitySwitcher.tsx` exactly (emerald-600/dark:emerald-400 for Sargodha, etc.)
- `size-7` matches `data-[size=sm]:h-7` ΓÇö no fighting CSS dimensions

**Testing Verification:**
1. Open `/settings` ΓåÆ Users tab ΓåÆ city group headers show colored text (emerald=Sargodha, blue=Bhalwal, amber=Khushab)
2. Add User / Edit City dialogs ΓåÆ city dropdown items show colored city names
3. Action dropdown (Γï«) has no chevron ΓÇö just the three dots icon
4. `npx tsc --noEmit` ΓÇö zero errors

### 2026-06-07 (Part 10) ΓÇö Post-Launch Bug Fixes: Double Header, HDS z-index, FloatingActions, Mobile Header ΓÇö Location: Home

**Focus:** Fix 4 post-launch bugs identified in field use ΓÇö double header on desktop, HDS body not rendering from map, floating icons behind map, mobile header styling.

**Done (Double Header Fix):**
- **`AppShell.tsx:64`**: Wrapped `<AppHeader />` in `<div className="lg:hidden">` ΓÇö hides mobile top bar on desktop (ΓëÑ1024px). Desktop now shows sidebar-only header.

**Done (HDS Body Not Rendering from Map):**
- **Fixes applied in 2 files:**
  1. `map/page.tsx:127`: Added `setDeliverTarget(null, null)` before `selectHouse(survey_id)` ΓÇö closes UnitDeliverySheet first when tapping "View Details". Prevents z-index clash between two overlapping fixed overlays (UnitDeliverySheet at z-[1001] vs HDS at z-50).
  2. `house-detail-sheet.tsx:168`: Changed HDS mobile z-index from `z-50` ΓåÆ `z-[800]`. Root cause: Leaflet's internal panes use z-indexes up to **700** (tile pane 200, marker pane 600, popup pane 700). The HDS at z-50 rendered BELOW Leaflet tiles, so the map covered the HDS body. HDS header appeared because it sits above the map container's top edge. Works on list page because no Leaflet map is present.
  - `transform-gpu` tested and reverted ΓÇö not the root cause.
  - `min-h-0` tested and reverted ΓÇö not the root cause.

**Done (Mobile Floating Actions):**
- **`floating-actions.tsx`**: Changed `z-40` ΓåÆ `z-[800]` ΓÇö floating icons were behind Leaflet's tile pane (z-200). Added direct `mobileFilterOpen` state for filter sheet control, removing broken `document.getElementById('mobile-filter-trigger')?.click()` mechanism. Added `active` prop to Satellite icon ΓåÆ blue tint when satellite mode active. Added `active` prop to `ActionButton` for dynamic coloring.
- **`filter-panel.tsx`**: `MobileFilterSheet` interface changed from `{ triggerId?: string }` to `{ open: boolean; onClose: () => void }`. Removed internal `useState`, hidden trigger button, and fragile hidden-DOM click mechanism (the hidden `<div className="absolute opacity-0 pointer-events-none w-px h-px overflow-hidden">` wrapper). Filter sheet now opens reliably via direct state prop.
- **`map/page.tsx`**: Removed hidden `MobileFilterSheet` wrapper div and its import.

**Done (Mobile Header Styling):**
- **`AppHeader.tsx`**: 3 changes for uniform mobile header:
  1. Status text (`Syncing...`/`Updated`) moved from between Bell and Avatar to **before the Refresh button** ΓÇö clean icon grouping.
  2. Refresh button: `h-11 w-11` (no border) ΓåÆ `h-9 w-9 border border-border` ΓÇö matches NotificationsBell exact style.
  3. Avatar: `w-5 h-5` initial-only badge ΓåÆ `h-9 border` button with initial + truncated display name.
  All 3 right-side elements share uniform `h-9 border border-border rounded-lg hover:bg-muted` styling.

**Known Issues (Carried Forward):**
- `037-notifications.sql` not yet applied to Supabase ΓÇö PAT token required.
- F1 (GAS webhook timeout) still ≡ƒö┤ Blocker ΓÇö needs office PC verification.
- Search in FloatingActions uses `setPendingFilter` instead of `setFilters` ΓÇö search text does not apply to data queries (pending fix).
- Mobile Filter icon lacks active filter indicator (pending fix).
- Map view does not update markers after filter Apply on mobile (pending investigation).

### 2026-06-07 (Part 11) ΓÇö Toast Redesign + "Always Unsent" Feature + Delivery Fixes ΓÇö Location: Office

**Focus:** Redesign toast system, implement "always unsent" delivery mode, fix the delivery status gap in unsent mode, establish testing protocol.

**Done:**

**GPS Accuracy field:**
- `src/hooks/use-user-location.ts` ΓÇö Added `accuracy` field to return type. `gpsAccuracy` returns meters. GPS retry logic with exponential backoff (1s, 3s, 10s) on watch failure.

**Toast Redesign (1 file):**
- `src/hooks/use-toast.tsx` ΓÇö Redesigned from bottom-right card stack to top-right slim pill below header. Styled as `rounded-full bg-white/90 backdrop-blur-sm` with variant-colored border + icon. `animate-slide-in-right` animation. 5s duration. `max-w-[260px]` on mobile. Keyframes added to globals.css.

**"Always Unsent" Feature ΓÇö 7 steps:**
1. **Step 1** ΓÇö `scripts/sql/038-unsent-mode-setting.sql`: INSERT into `app_settings` with `key='unsent_mode'`, value `{"enabled":false,"max_limit":50}`. Applied to Supabase.
2. **Step 2** ΓÇö `src/app/settings/page.tsx`: Admin toggle in Delivery tab sidebar: switch + max limit input + summary line "Unsent: On (max 50)". Saved via existing `PATCH /api/settings`.
3. **Step 3** ΓÇö `src/components/delivery/unit-delivery-sheet.tsx`: handleFile unsent mode path ΓÇö compress ΓåÆ enqueue to IndexedDB with `skipAutoSync: true` ΓåÆ local `setDeliveryStatus('processing')` ΓåÆ auto-advance 1.5s. No webhook call. Max limit enforcement: if queueCount >= unsentMaxLimit ΓåÆ toast + return early.
4. **Step 4** ΓÇö `src/components/delivery/unsent-badge.tsx`: Floating bottom-right button with queue count badge + slim modal ("Sync All" + progress bar + error display).
5. **Step 5** ΓÇö `src/hooks/use-photo-queue.ts`: `skipAutoSync` param on `enqueuePhoto` ΓÇö when true, skips `processQueue()` call.
6. Step 6 ΓÇö `src/hooks/use-unsent-photos.ts`: Blob storage deferred blob-to-base64 in `retrySingle`.
7. Step 7 ΓÇö Verify all pass `npx tsc --noEmit`.

**Fixed: Unsent Delivery Status Gap (5 fixes):**
1. **Fix 1** ΓÇö `src/app/api/deliveries/mark-processing/route.ts`: NEW endpoint. Auth check (getUser + ownership), creates delivery_photos placeholder (`photo_url = 'pending://unsent/{id}'`), sets assignment_items.status = 'processing'. Returns { status: 'processing' }.
2. **Fix 1b** ΓÇö `src/components/delivery/unit-delivery-sheet.tsx`: handleFile calls POST /api/deliveries/mark-processing BEFORE enqueue. Catches error with distinct message.
3. **Fix 2** ΓÇö `src/components/delivery/unsent-badge.tsx` ΓåÆ refactored to `UnsentModal` (just modal content, no floating button). `src/app/deliver/page.tsx`: Added ≡ƒô╖ icon in filter pills row (between "All" pill and right edge) with queue count badge. *Note: user requested this be in FloatingActions instead ΓÇö deferred to next session.*
4. **Fix 3** ΓÇö `src/app/api/deliveries/promote/route.ts`: NEW endpoint. Finds placeholder delivery_photos row (synced_to_drive=false), updates with real Drive URL + gdrive_file_id. Updates assignment_items.status = 'delivered'. Uses promote instead of duplicate insert. `src/hooks/use-photo-queue.ts`: uploadSingle calls POST /api/deliveries/promote instead of POST /api/delivery/photos.
5. **Fix 4** ΓÇö `src/hooks/use-photo-queue.ts`: processQueue now processes in batches of 3 concurrently via Promise.allSettled. uploadSingle returns 'ok' | 'retry' | 'orphan'. Orphan on 403/404 = remove from queue silently.
6. **Fix 5** ΓÇö Orphan cleanup: promote endpoint errors with 403/404 ΓåÆ uploadSingle returns 'orphan' ΓåÆ removed from queue.

**Key decisions:**
- Blob storage in IndexedDB eliminates FileReader UI freeze on main thread.
- Delivery status must be recorded at capture time (`processing`), even if photo upload is deferred.
- "Always unsent" default OFF ΓÇö admin must enable. Staff sees filter-bar icon with count badge when queue is non-empty.
- Unsent icon should be in FloatingActions (map page floating panel), not in deliver page filter bar ΓÇö deferred to next session.
- Progress steps were overlaid on action buttons area ΓÇö confusing for staff. Redesigned to sequential toast updates in Part 12.
- GPS signal 3-dot indicator was described in documentation but never rendered in the sheet. Implemented in Part 12.
- All 5 fixes pass `npx tsc --noEmit` with zero errors.

**Testing Verification:**
1. **Pre-cleanup**: Delete IndexedDB databases, reset 10 test items to `pending`, ensure unsent_mode ON
2. Staff `/deliver` ΓåÆ tap pending ΓåÆ take picture ΓåÆ "Saved to queue" ΓåÆ auto-advance 1.5s
3. DB: status = `processing`, delivery_photos placeholder row
4. Filter bar ≡ƒô╖ badge increments
5. Sync All ΓåÆ photos upload (batch 3 concurrent) ΓåÆ status = `delivered`, real Drive URL
6. Max limit: 50th item blocks 51st with toast
7. Orphan: revoke assignment ΓåÆ Sync All ΓåÆ photo removed silently
8. Admin toggles OFF ΓåÆ normal online upload resumes

### 2026-06-07 (Part 12) ΓÇö Progress Steps ΓåÆ Sequential Toasts + GPS Signal Dots ΓÇö Location: Home

**Focus:** Fix the progress overlay in delivery sheet (moved to sequential toast updates), implement GPS signal 3-dot indicator.

**Done:**

**Sequential Toast Updates (3 files):**
- `src/hooks/use-toast.tsx` ΓÇö Added `updateToast(id, message, variant?)`. Reuses existing toast ID, clears old timer, updates message/variant in-place, sets new 5s auto-dismiss. Returns toast ID from `toast()` for chaining.
- `src/hooks/use-deliver-unit.ts` ΓÇö Added optional `onProgress: (step: DeliveryProgress) => void` callback parameter to `deliver()`. Called at each progress state transition (compressing, uploading, saving) so the sheet can fire toast updates. Backward compatible.
- `src/components/delivery/unit-delivery-sheet.tsx`:
  - **Removed** progress step checklist (the `Γ£ô Γùï spinner` step list that replaced action buttons during delivery)
  - **Online path**: One toast ID, updates through `Compressing photo...` ΓåÆ `Uploading to Drive...` ΓåÆ `Recording delivery...` ΓåÆ final `Delivered (Xm away) Γ£ô` or `Processing ΓÇö awaiting review`
  - **Unsent path**: One toast ID, updates through `Saving to queue...` ΓåÆ `Compressing photo...` ΓåÆ `Saved to queue Γ£ô`
  - Action buttons always visible ΓÇö button shows `Processing...` and disabled during delivery

**GPS Signal Dots (1 file):**
- `src/components/delivery/unit-delivery-sheet.tsx` ΓÇö 3 dots after live distance text:
  - Accuracy Γëñ 10m ΓåÆ 3 green dots
  - Accuracy Γëñ 50m ΓåÆ 2 green, 1 gray
  - Accuracy > 50m ΓåÆ 1 green, 2 gray
  - No accuracy ΓåÆ all gray
  - Conditionally rendered when `liveGpsStatus === 'ready'` and `gpsAccuracy != null`

**Key decisions:**
- Progress steps no longer block the action buttons area ΓÇö staff sees button state throughout delivery.
- Sequential toasts use a single toast slot ΓÇö updates in-place without stacking multiple toasts.
- `updateToast` is a general-purpose utility (not delivery-specific) ΓÇö reusable for any progressive workflow.
- GPS dots use local `gpsAccuracy` state (set from sheet's own watchPosition success callback).

**Testing Verification:**
1. `/deliver` ΓåÆ tap pending ΓåÆ tap "Take Picture & Deliver" ΓåÆ toast shows "Compressing photo..." ΓåÆ updates to "Uploading to Drive..." ΓåÆ final "Delivered (Xm away) Γ£ô"
2. Action buttons visible throughout delivery ΓÇö button shows "Processing..." and disabled
3. GPS signal 3 dots render near live distance text (3 green = strong, 2 green = fair, 1 green = poor)
4. Unsent path: "Saving to queue..." ΓåÆ "Compressing photo..." ΓåÆ "Saved to queue Γ£ô"
5. `npx tsc --noEmit` ΓÇö zero errors

---

### 2026-06-07 (Part 13) ΓÇö GPS Debugging Black Hole + lfsvc Discovery ΓÇö Location: Home

**Focus:** Debug why restored watchPosition code still showed "Locating..." and later "GPS unavailable" on desktop.

**Done:**

**GPS regression analysis (git archaeology):**
- Working version = commit `ac1bfc8` (5pm 6-6-26). Three effects: (1) fast `getCurrentPosition` low-accuracy init, (2) `watchPosition` high-accuracy live tracking, (3) unmount cleanup.
- Office commit `248e6b6` replaced (2)+(3) with a sync effect reading from shared `useUserLocation` hook ΓÇö B3b.2 "Single GPS watcher" optimization.
- On desktop: fast init still ran and set `'ready'` via Wi-Fi in ~1-2s, but the sync effect's `sharedLocation` dependency caused a race that sometimes overrode to `'unavailable'`.
- After reverting to the three-effect pattern, the same desktop showed "GPS unavailable" ΓÇö both `getCurrentPosition` and `watchPosition` failed.

**Root cause (non-code):**
- Windows **Geolocation Service** (`lfsvc`) was set to **Disabled**. Settings UI showed "Location on" but the service never started.
- `navigator.geolocation` calls were silently failing everywhere ΓÇö including Google Maps.
- Fix: `sc.exe config lfsvc start=auto` + `sc.exe start lfsvc` ΓÇö service now running.

**Key decisions:**
- **B3b.2 was premature production optimization.** Two `watchPosition` calls (map + sheet) share the same GPS chip ΓÇö the second callback adds negligible battery drain. Keeping both is fine during development.
- **Deferred: Real battery optimization** ΓÇö `useUserLocation` should use `enableHighAccuracy: false` by default (Wi-Fi/cell, GPS chip off), briefly switch to high accuracy only when the sheet opens for distance calculation. Marked in Remaining Corrections below.
- **Code remains at proven three-effect pattern.** No shared-watcher complexity. Simple, worked before, will work again.

**Testing Verification:**
1. Verify lfsvc is Running: `Get-Service lfsvc` ΓåÆ Status: Running
2. Hard refresh `/deliver` ΓåÆ tap pending ΓåÆ GPS shows distance within 1-2s
3. GPS dots render based on accuracy (3 green = strong, etc.)
4. Toast delivery feedback works through all steps
---
### 2026-06-08 ΓÇö Delivery Photo Proxy Hardening + Data Insight Fixes ΓÇö Location: Home

**Focus:** Fix data insight images, proxy endpoint for delivery photos, refresh cache, dashboard overflow fix

**Done:**

- **Created `/api/delivery/photo/[fileId]` proxy endpoint** ΓÇö serves delivery photos from `lh3.googleusercontent.com` server-side with 24h cache (no more direct Google Drive URLs)
- **Changed all `photo_url` formats** ΓÇö `mark/route.ts`, `sync-photo/route.ts`, `use-photo-queue.ts`, `use-unsent-photos.ts` now store `/api/delivery/photo/{gdrive_file_id}` instead of direct Google thumbnail URLs
- **Added `survey_id` upload key** ΓÇö GAS webhook receives `surveyId: survey_id || psid` for consistent Drive image organization matching HDS query
- **Fixed HDS thumbnail grid** ΓÇö `flex overflow-x-auto` ΓåÆ `grid grid-cols-3 gap-2 aspect-square` for natural mobile wrapping
- **Preserved photos on revoke** ΓÇö removed `delivery_photos.delete()` from revoke handler; photos persist across revoke-test cycles
- **Split delivery timestamps** ΓÇö `startedAt` (before upload) vs `deliveredAt` (after upload) for accurate admin table duration
- **Added `image_urls` to Data Insight drill-down** ΓÇö `data-insight-repository.ts` `.select()` and `UnitRow` type now include `image_urls`; portal images show in HDS when opened from Data Insight
- **Fixed Data Insight `selectHouse` call** ΓÇö passes full `unitRows` instead of stripped `{ survey_id }` objects (was discarding all fields)
- **Created `POST /api/data-insight/refresh`** ΓÇö calls `refresh_hierarchy_summary()` RPC via admin client; admin-only endpoint
- **Added "Refresh Cache" button** ΓÇö in Data Insight toolbar with spinner + toast feedback; placed in same row as Active/Archived/Duplicates filter tabs
- **Regrouped toolbar layout** ΓÇö Back button on its own row above; filter tabs + Refresh button in `justify-between` row
- **Fixed Dashboard/Office Breakdown overflow** ΓÇö added `overflow-x-auto min-w-0` to Dashboard wrapper, `min-w-0` to map content flex parent, `w-full overflow-x-auto` to table wrapper
- **Added `overflow-x-auto` to Dashboard loading skeleton** ΓÇö consistent overflow behavior during loading state

**Key decisions:**
- Proxy endpoint over direct Google URLs ΓÇö images served from same domain eliminate all browser auth/cookie/CORS issues
- Google Drive stays as source of truth ΓÇö app fetches server-side and caches for 24h
- Always INSERT delivery_photos (never UPSERT) ΓÇö preserves full history across months
- Revoke keeps photos ΓÇö only resets assignment_item status, historical record preserved
- Data Insight cache requires manual "Refresh Cache" after payment imports

**Testing Verification:**
1. Staff `/deliver` ΓåÆ tap pending ΓåÆ take photo ΓåÆ toast stack shows progress ΓåÆ auto-advance
2. Admin `/map` ΓåÆ Data Insight ΓåÆ drill into MC ΓåÆ "Open" shows portal images in HDS
3. Data Insight ΓåÆ "Refresh Cache" ΓåÆ spinner ΓåÆ toast ΓåÆ KPI numbers update
4. Dashboard ΓåÆ Office Breakdown tab ΓåÆ horizontal scrollbar on wide table
5. Revoke delivery ΓåÆ re-test ΓåÆ old photos persist in HDS gallery
6. Offline ΓåÆ capture photo ΓåÆ amber "Processing" overlay ΓåÆ syncs when online

**Next session:**
- Delivery hardening end-to-end testing protocol
- Apply `037-notifications.sql` migration
- Fix remaining P0/P1 items from Section 25 (unsent mode queue, sync-photo promote, redelivery photo drop)

### 2026-06-09 ΓÇö Delivery Flow Harden: GPS Fixes, Redelivery Sync, Map Zoom ΓÇö Location: Home

**Focus:** Fix 4 critical delivery flow bugs, add configurable map zoom with Settings UI.

**Done:**

**Bug 1: Delivery status wiped by GPS updates (reset effect deps)**
- Root cause: `initialLat`/`initialLng` in reset effect deps (`unit-delivery-sheet.tsx:76-84`) ΓÇö parent GPS updates re-fired effect, overwriting `deliveryStatus` back to `'idle'` mid-delivery.
- Fix: removed `initialLat`/`initialLng` from deps array. Effect now depends only on `[unit?.psid]`.

**Bug 2: GPS unavailable after auto-advance (watch effect deps)**
- Root cause: GPS watch effect had `deliveryStatus` in deps ΓÇö rapid stop/restart of GPS hardware caused geolocation timeout.
- Fix: split into two effects ΓÇö watch lifecycle on `[unit?.lat, unit?.lng, unit?.psid]` only, indicator show/hide on `[deliveryStatus]` (later removed entirely ΓÇö JSX condition `deliveryStatus === 'idle'` already hides indicator).

**Bug 3: Redelivery photo never syncs (ALLOWED_STATUSES)**
- Root cause: mark API returns early for `status === 'delivered'` with `delivery_photo_id: null`. Unsent-mode promoted to `delivered` but redelivery path skipped photo capture.
- Fix: added `'delivered'` to `ALLOWED_STATUSES` in `mark/route.ts:59-69`, removed early return for `'delivered'` (kept `'missed'` guard).

**Bug 4: Staff map redundant flyTo on every delivery (cache re-render)**
- Root cause: `FlyToTarget` effect depended on `items` which changes on optimistic cache update ΓÇö re-fired `map.flyTo()` on every delivery.
- Fix: added `lastTargetRef` guard (`staff-map.tsx:34-59`), changed `duration: 1` ΓåÆ `0.5`.

**GPS seeding fix:**
- Added `setUserLat(initialLat)` / `setUserLng(initialLng)` back to reset effect body ΓÇö but kept out of deps array. Fires only on unit change (psid), not on every parent GPS update. Fixes marker-click case where sheet opens without GPS lock.

**Map zoom feature:**
- Created `useMapZoom` hook (`src/hooks/use-map-zoom.ts`): React Query on `GET /api/settings?key=map_zoom`, staleTime 30min, defaults to 18.
- Added zoom slider (10ΓÇô20) to Settings ΓåÆ Delivery sidebar (admin-only): range input, number input, descriptive label (Area/Street/Neighborhood/Building), saved state display.
- Added read-only zoom display in Settings ΓåÆ Appearance tab via `MapZoomReadOnly` component (staff-visible).
- Updated `MapFollower` in `map-view.tsx:30-39` to use `mapZoom` from hook.
- Updated both `MapContainer` initial zooms (`staff-map.tsx:74`, `map-view.tsx:68`) from hardcoded `12` to `mapZoom` from hook.
- **Final fix: FlyToTarget compound guard** ΓÇö replaced `lastTargetRef` + `zoomRef` with compound `{ target, zoom }` ref. Same `mapZoom` in effect deps now re-fires when zoom query resolves, updating staff map to configured zoom. Guard skips only when BOTH target AND zoom match (handles `items` cache re-render without blocking zoom change).

**Key decisions:**
- GPS seeding from parent kept out of effect deps ΓÇö read only at unit-change time, prevents Bug 1 re-introduction.
- Compound guard (`target + zoom`) in FlyToTarget replaces dual ref pattern ΓÇö allows re-fly when zoom setting changes while still preventing redundant items-change fires.

**Testing Verification (from session):**
1. `/deliver` ΓåÆ tap pending ΓåÆ GPS shows distance ΓåÆ take photo ΓåÆ delivered ΓåÆ auto-advance to next ΓåÆ GPS still works (Bug 2 fixed)
2. Map marker click ΓåÆ sheet opens with GPS position seeded from parent (Bug 1 fixed)
3. Redelivery: deliver ΓåÆ sync ΓåÆ redeliver ΓåÆ photo persists (Bug 3 fixed)
4. Map: tap prev/next ΓåÆ single flyTo, no redundant animation (Bug 4 fixed)
5. Settings ΓåÆ Delivery ΓåÆ zoom slider 10-20 ΓåÆ saved ΓåÆ staff map opens at configured zoom

**Next session:**
- Verify FlyToTarget compound guard in production (zoom change after query resolves)
- Apply `037-notifications.sql` migration
- Remaining Section 25 items


## 19. Data Model Rules (Comprehensive Reference)

This section codifies every data-modeling rule discovered during development. Violations cause bugs. Read before making any schema or query changes.

### 19.1 Geography Model (3 Cities, 1 District Overlap)

Sargodha is BOTH a district AND a tehsil. Bhalwal is a tehsil within Sargodha district. This creates a containment trap ΓÇö filtering only by `city_district` when "Sargodha" is selected also returns Bhalwal UCs.

**Rules:**
- Every city-scoped query MUST filter by BOTH `city_district` AND `tehsil` ΓÇö never just one.
- Use `CITY_TEHSIL_MAP` from `src/lib/queries/hierarchy.ts` to get the correct pair:
  ```
  Sargodha ΓåÆ { district: 'SARGODHA', tehsil: 'SARGODHA' }
  Bhalwal  ΓåÆ { district: 'SARGODHA', tehsil: 'BHALWAL' }
  Khushab  ΓåÆ { district: 'KHUSHAB', tehsil: 'KHUSHAB' }
  ```
- `useBillingStore.selectedCity` stores **display name** (`"Sargodha"`). Always convert via `CITY_TEHSIL_MAP[selectedCity]` before passing to APIs.
- `getCityFromTehsil(district, tehsil)` reverses the lookup ΓÇö useful for city resolution from DB row data.

**Broken patterns (historical):**
- `/map` filter bar ΓÇö `District/Tehsil` cascade was replaced by CitySwitcher for this reason
- `getAssignmentList` in Manage tab ΓÇö was filtering by `city_district` only (fixed: now also filters by `tehsil`)
- Routes tab ΓÇö was passing display name directly instead of via `CITY_TEHSIL_MAP` (fixed)

### 19.2 survey_units.status Semantics

Three distinct states:

| status value | Meaning | Count |
|-------------|---------|-------|
| `NULL` | Enriched from lifecycle (has PSID, monthly_fee, etc.) ΓÇö effectively active | ~160K |
| `'ACTIVE'` | Explicitly set active (survey-only, no lifecycle enrichment) | ~53K |
| `'ARCHIVED'` | Lifecycle `Deleted in Portal = Yes` | ~5K |

**Rules:**
- NEVER use bare `.eq('status', 'ACTIVE')` ΓÇö it misses the 160K null-status enriched units.
- ACTIVE filter: `or('status.is.null,status.eq.ACTIVE')` via `applyActiveFilter()` from `src/lib/queries/survey-units.ts`.
- ARCHIVED filter: `not('status', 'is', null).neq('status', 'ACTIVE')` via `applyArchivedFilter()`.
- DUPLICATES: filtered via `flagged_psids` join (not a status value).

### 19.3 Delivery Target Key: psid (not survey_id)

| Field | survey_units coverage | Purpose |
|-------|----------------------|---------|
| `psid` | 207,746 / 212,428 (98%) ΓÇö always populated after enrichment | Delivery target, QR fallback, payment join |
| `survey_id` | 212,428 (100%) ΓÇö PK, always non-null | Frontend list keys, QR primary scan target |

**Rules:**
- `psid` is the delivery target key ΓÇö all assignment items, delivery tracking, and map markers use psid.
- `survey_id` is the canonical frontend list key (always non-null, avoids React duplicate-key warnings).
- Frontend expand states use `survey_id` instead of `psid` ΓÇö prevents `null === null` auto-expand bug.
- QR scanning matches by `survey_id` (from `sid={survey_id}` in QR code) ΓåÆ looks up assignment item by `survey_id`.
- `psid = null` means **new/unregistered survey** ΓÇö no lifecycle PSID assigned yet.

### 19.4 Domain Separation: Biller Data Γëá Payment Data

These are two independent domains bridged only by `psid`. Never couple their queries.

| Domain | Table | Source | Update frequency |
|--------|-------|--------|-----------------|
| Biller data | `survey_units` (21 enriched fields) | Lifecycle XLSX via `enrich-survey-units.py` | Monthly (16thΓÇô20th) |
| Payments | `payment_history` | Payment CSV via `load-payments.py` | Daily (multiple times) |

**Rules:**
- `survey_units` holds the **current month snapshot** of billing data (monthly_fee, arrears, route_name, etc.) ΓÇö overwritten each month.
- `payment_history` is **append-only** ΓÇö all months historically complete, keyed on `(psid, bill_month)` with upsert.
- The bridge is `psid`: `payment_history.psid ΓåÆ survey_units.psid`.
- `amount_due` is DROPPED ΓÇö SWMC miscalcs it. App computes `monthly_fee + arrears` in UI.
- Billing charts aggregate directly from `payment_history` via the `get_charts_data` RPC ΓÇö no `survey_units` join in aggregation (caused 30s timeout on 122K rows).
- For geography filtering in charts: payment_history now stores `city_district`, `tehsil`, `uc_name` directly ΓÇö no LATERAL join needed.
- **Orphaned PSIDs** (490 rows in payment_history without matching survey_units) exist because govt portal allows deleting survey IDs without deactivating PSIDs. Charts show "Unknown" for these.

### 19.5 Assignment & Delivery Model

| Table | Key concept | Key columns |
|-------|-------------|-------------|
| `daily_assignments` | Creation event per staff+UC | `id`, `staff_id`, `issued_at` (not assigned_date), `uc_name`, `total_items` |
| `assignment_items` | Individual PSID delivery | `assignment_id`, `psid`, `survey_id`, `status` (pending/delivered/missed/skipped) |
| `delivery_photos` | Photo proof per delivery event | `assignment_item_id`, `photo_url`, `gps_lat/lng`, `captured_at` |
| `staff_daily_stats` | Per-assignment rollup | `staff_id`, `assignment_id`, `delivered`, `missed` |

**Rules:**
- `issued_at` = creation timestamp, NOT a delivery deadline. Staff sees ALL pending items across ALL batches.
- `staff_daily_stats` keyed on `(staff_id, assignment_id)` ΓÇö one row per assignment batch, not per day.
- Trigger `refresh_staff_daily_stats` recomputes stats on `assignment_items` INSERT/UPDATE/DELETE.
- `delivery_photos` is linked to `assignment_items` (not `survey_units`) ΓÇö one house has 12 photos across 12 monthly deliveries.
- GPS is captured silently on photo confirm ΓÇö staff does not know. GPS failure silently produces NULL (photo timestamp alone is sufficient proof).
- `survey_id` on `assignment_items` enables QR scan ΓåÆ match by `survey_id` directly without extra psid lookup.

### 19.6 Staff-City Assignment

**Rules:**
- `staff.assigned_city` is set in Settings ΓåÆ Users ΓåÆ Edit City.
- Only field_staff with `assignedCity` set will be filtered in assignment UI dropdowns (no fallback to unassigned staff).
- Cross-city assignments are blocked server-side: `createAssignment` looks up staff's `assigned_city`, validates against UC's district/tehsil via `CITY_TEHSIL_MAP`, returns 400 on mismatch.
- CitySwitcher auto-filters: staff with `assignedCity` see only that city's option, chevron hidden, button disabled.
- AppShell auto-selects assigned city on mount for field_staff (calls `setCity` with correct district/tehsil).
- Staff with no `assignedCity` (fallback for unconfigured accounts) see all 4 options.
- Admin writes to `staff` table (e.g., PATCH assigned_city) must use `createAdminClient()` (service_role key) ΓÇö `createClient()` uses anon key and triggers RLS violations.

### 19.7 Auth & User Model

| Table | Purpose | Key |
|-------|---------|-----|
| `auth.users` | Supabase Auth ΓÇö actual login | id (UUID) |
| `profiles` | App-level user metadata: role_id, username, display_name, suspended_at, deleted_at | id ΓåÆ auth.users |
| `staff` | Field staff operational data: assigned_city, is_active | id ΓåÆ auth.users |
| `roles` | Role definitions: super_admin (1), admin (2), field_staff (3) | id |

**Rules:**
- Username-based auth: app transforms `input` ΓåÆ `input@billing.local` via `toEmail()` for Supabase Auth.
- Frozen accounts (`suspended_at != NULL`) blocked with "Account is frozen. Contact your admin." message.
- Soft-delete (`deleted_at`) preserves performance history ΓÇö hard delete only if GDPR required.
- `trg_sync_profile_to_staff` trigger auto-syncs field_staff profiles ΓåÆ `staff` table on INSERT/UPDATE/DELETE.
- `GET /api/staff` uses two-query approach (profiles ΓåÆ staff rows) because no FK exists between them ΓÇö both reference `auth.users` independently.
- Staff without a `staff` table row default to `is_active: true` (from the two-query approach).

### 19.8 Reference Tables (Filter Dropdowns)

Three reference tables replace `SELECT DISTINCT` on 212K-row tables:

| Table | Populated from | Maintenance |
|-------|---------------|-------------|
| `hierarchy` | `survey_units` DISTINCT (city_district, tehsil, uc_name) for ACTIVE units | Trigger `trg_survey_units_upsert_hierarchy` on survey_units changes |
| `surveyors` | `survey_units` DISTINCT surveyor_name for ACTIVE units | Manual re-seed from `enrich-survey-units.py` |
| `bill_months` | `payment_history` DISTINCT bill_month | Manual re-seed from `load-payments.py` |

**Rules:**
- All filter dropdowns query these tables ΓÇö never DISTINCT on survey_units.
- These three tables never exceed 1000 rows total ΓÇö zero PostgREST row limit issues.
- Hierarchy trigger handles INSERT/UPDATE/DELETE on survey_units ΓÇö new UC combos added, orphaned combos removed.
- If reference tables go stale (e.g., after bulk import), re-run the import script which upserts them.

### 19.9 Billing Cycle

**Critical: A billing month runs from 16th of current month to 15th of next month.**

- `MAY2026` billing cycle = May 16, 2026 ΓåÆ June 15, 2026 (midnight)
- `JUN2026` billing cycle = June 16, 2026 ΓåÆ July 15, 2026 (midnight)
- `currentMonth()` in `src/lib/constants.ts`: if `new Date().getDate() < 16`, use previous calendar month.
- **May 31 does NOT signify end of billing cycle.** The cycle always runs 16th ΓåÆ 15th.
- Charts use cycle-relative day numbering: Day 1 = 16th of bill month. Formula: `(paid_date - (to_date(bill_month, 'MonYYYY') + 15) + 1)`.
- `sortMonths()` helper converts `"MMMYYYY"` ΓåÆ `year*12 + monthIndex` for correct chronological sort (alphabetical is wrong: APR < FEB < JAN < ...).

### 19.10 Database Trigger Inventory

| Trigger | Table | Event | Function | Purpose |
|---------|-------|-------|----------|---------|
| `trg_payment_history_refresh_summary` | `payment_history` | AFTER INSERT/UPDATE/DELETE | `refresh_payment_summary()` | Recomputes `payment_summary` for affected bill_month |
| `trg_survey_units_upsert_hierarchy` | `survey_units` | AFTER INSERT/UPDATE/DELETE | `sync_hierarchy()` | Maintains `hierarchy` reference table |
| `trg_refresh_staff_stats` | `assignment_items` | AFTER INSERT/UPDATE/DELETE | `refresh_staff_daily_stats()` | Recomputes `staff_daily_stats` for affected staff+assignment |
| `trg_sync_profile_to_staff` | `profiles` | AFTER INSERT/UPDATE/DELETE | `sync_profile_to_staff()` | Auto-syncs field_staff profiles ΓåÆ staff table |

### 19.11 API Route Data Flow

```
Browser hook ΓåÆ fetch('/api/...') ΓåÆ Next.js API route ΓåÆ Supabase client ΓåÆ DB
                                  Γåæ
                          imports from
                      src/lib/queries/
                      src/lib/repositories/
```

**Rules:**
- All client data goes through SSR API routes ΓÇö NO direct `createClient()` calls in hooks, stores, or components (except `supabase.auth.*` SDK calls).
- API routes use `createClient()` (anon key, respects RLS) for reads. Admin writes use `createAdminClient()` (service_role, bypasses RLS).
- Shared query modules in `src/lib/queries/` are the single source of truth for filters and column lists.
- Repositories in `src/lib/repositories/` encapsulate complex multi-step query logic.
- `select('*')` is BANNED ΓÇö always name explicit columns. Exception: count-only queries (`head: true`).
- PostgREST 1000-row hard limit: use `fetchAllRows()` batched fetch for queries returning >1000 rows.
- Every hook must have explicit `staleTime` from `STALE_TIMES` constants ΓÇö never default 0.
- Mutation ΓåÆ invalidate pattern: every mutation invalidates affected query keys by prefix.

### 19.12 Approved RPCs (All Others Banned)

RPCs are banned for client-facing features. Only these exceptions are allowed:

| RPC | Purpose | Source |
|-----|---------|--------|
| `get_charts_data` | Billing charts aggregation (122K payment rows) | `scripts/sql/021-charts-aggregation.sql` |
| `get_survey_group_stats` | Data Insight admin aggregation | `scripts/sql/007-data-insight-rpcs.sql` |
| `get_billing_group_stats` | Data Insight admin aggregation | `scripts/sql/007-data-insight-rpcs.sql` |
| `get_billing_summary` | Admin billing KPI cards | `scripts/sql/007-data-insight-rpcs.sql` |
| `get_payment_summary` | Admin payment summary | `scripts/sql/007-data-insight-rpcs.sql` |
| `get_route_tree` | Route tree sidebar | `scripts/sql/029-route-tree-rpc.sql` |

All other aggregation must happen in TypeScript (repository layer).

### 19.13 Data Integrity Rules

| Rule | Enforcement | Notes |
|------|-------------|-------|
| `payment_history.(psid, bill_month)` unique | DB constraint + upsert | Idempotent ΓÇö safe to run daily import multiple times |
| `assignment_items.(assignment_id, psid)` unique | DB constraint | Same PSID can't be in the same batch twice |
| `staff_daily_stats.(staff_id, assignment_id)` unique | DB constraint | One stats row per assignment batch |
| `hierarchy.(city_district, tehsil, uc_name)` unique | DB constraint | No duplicate geography entries |
| `survey_units.psid` partial unique index | DB index | `WHERE psid IS NOT NULL` ΓÇö allows multiple NULLs for unregistered surveys |
| Payment CSV upsert idempotent | `ON CONFLICT DO NOTHING` | Safe to re-run multiple times daily |
| Lifecycle enrichment overwrites current month | Upsert on survey_id | Old enrichment remains until overwritten |
| City validation on assignment creation | Server-side in `createAssignment` | Rejects cross-city with 400 |
| Staff-city auto-restriction | CitySwitcher + AppShell | Single-option for assigned staff, chevron hidden

---

## 20. Delivery Verification System

### 20.1 Design Principle: Silent Verification

Staff does NOT know GPS is being captured or verified. The UI shows only "Take Picture" ΓåÆ green checkmark or yellow "Processing" badge. GPS + timestamp + distance check all happen server-side.

This prevents gaming: staff cannot fake deliveries because every photo is geotagged and verified against the survey marker coordinates. Over months, GPS drift reveals systematic cheating.

### 20.2 Status Flow

```
pending ΓåÆ [Take Picture + GPS + Upload] ΓåÆ DELIVERED (if distance Γëñ 50m)
                                         ΓåÆ PROCESSING (if distance > 50m or GPS null)
                                              ΓåÆ admin review ΓåÆ delivered OR flagged
```

| Status | Meaning | Staff sees | Admin sees |
|--------|---------|-----------|------------|
| `pending` | Assigned, not acted | Blue dot | Blue dot |
| `processing` | Photo taken, awaiting verification | Yellow badge "Under Review" | Yellow dot, click to verify |
| `delivered` | Photo + GPS verified within threshold | Green checkmark | Green checkmark |
| `missed` | _(not used ΓÇö full enforcement)_ | ΓÇö | ΓÇö |
| `skipped` | _(not used ΓÇö full enforcement)_ | ΓÇö | ΓÇö |

### 20.3 One-Tap Delivery Flow

```
1. Staff taps "≡ƒô╖ Take Picture" in UnitDeliverySheet
2. Native camera opens (capture="environment")
3. Staff takes photo ΓåÆ sheet shows brief preview ΓåÆ auto-dismisses
4. Background (non-blocking for staff):
   a. Compress to WebP (OffscreenCanvas, q0.6, 1024px ΓåÆ 30-70KB)
   b. Capture GPS (navigator.geolocation, 3s timeout, enableHighAccuracy: false)
   c. POST FormData to /api/deliveries/mark
5. Server processes:
   a. Upload photo to GAS webhook (staff_sync_logs table)
   b. Save Drive URL to delivery_photos
   c. Calculate Haversine distance(delivery_gps, survey_marker_gps)
   d. If Γëñ50m ΓåÆ status='delivered' ELSE ΓåÆ status='processing'
6. Sheet shows result ΓåÆ auto-advance to next pending item
```

**Total staff time per delivery:** ~2-3 seconds (photo ΓåÆ snap ΓåÆ done)
**No "Confirm Delivery" button** ΓÇö one tap, auto-saves.

### 20.4 Distance Verification

**Formula:** Haversine distance between `delivery_photos.gps_lat/lng` and `survey_units.lat/lng`

**Default threshold:** 50 meters (street-level precision in Pakistani urban areas)

**Configurable:** Per-city threshold via admin settings (future)

**Edge cases:**
| Condition | Result |
|-----------|--------|
| GPS null (timeout/denied/unavailable) | status = `processing` ΓÇö admin review |
| Survey marker lat/lng null | status = `processing` ΓÇö admin review |
| Distance Γëñ 50m | status = `delivered` ΓÇö auto-verified |
| Distance > 50m | status = `processing` ΓÇö admin reviews, may adjust marker or accept |
| Staff corrects marker (long-press map) | New coordinates saved to `house_corrections`, delivery re-verified |

### 20.5 Photo Pipeline

```
Camera ΓåÆ OffscreenCanvas compress ΓåÆ WebP blob (q0.6, 1024px)
  ΓåÆ FormData ΓåÆ POST /api/deliveries/mark
    ΓåÆ Server: POST to GAS webhook ΓåÆ Drive URL
    ΓåÆ Server: INSERT INTO delivery_photos (photo_url, gps_lat/lng, captured_at)
    ΓåÆ Server: INSERT INTO staff_sync_logs (email, survey_id, file_id, synced_at)
    ΓåÆ Server: UPDATE assignment_items SET status = [delivered|processing]
    ΓåÆ Response: { status, verified, distance }
```

**Key properties:**
- Photos stored in Google Drive (not Supabase Storage) ΓÇö zero egress cost
- WebP format, 30-70KB per photo (existing legacy app achieves this)
- Https://drive.google.com/thumbnail?id={fileId}&sz=w200 for display
- Two GAS webhook URLs exist (legacy + current) ΓÇö consolidate to one

### 20.6 Staff Speed Optimization

| Bottleneck | Fix | Impact |
|------------|-----|--------|
| Two-step confirm (Take Picture ΓåÆ Confirm) | One-tap: photo taken ΓåÆ auto-saves | -1 tap, -2s per delivery |
| Canvas compression on main thread | OffscreenCanvas or WebP capture natively | No UI freeze |
| Base64 encoding | FormData with raw Blob | -30% CPU, -200ms |
| GPS timeout 5s | Reduce to 3s, enableHighAccuracy: false | -2s per delivery |
| Webhook blocking UI | Handle webhook server-side synchronously | Staff not blocked |
| All map markers rendered | Cluster at low zoom, cull out-of-viewport | Smoother map |
| Battery drain from constant GPS | GPS only when sheet opens, release on close | Less background drain |

---

## 21. Audit Findings Summary (2026-06-04)

### 21.1 Grades

| Area | Grade | Verdict |
|------|-------|---------|
| Code architecture | B | Backend-only data access Γ£à, shared query modules Γ£à, Zod validation started Γ£à |
| Debugging velocity | C- | No tests, no API docs, no structured logging, partial repositories |
| Industry standard compliance | D | No CI, no observability, no rate limiting, no security headers |
| Egress budget (70 staff) | F | ~12 GB/month projected ΓÇö 2.4├ù over free tier. After fixes: ~3-4 GB/mo |
| Security / Authorization | F | Any logged-in user can create admin accounts, mark any delivery. RLS is `USING (true)` everywhere |
| Data integrity | C | Race condition in createAssignment, no FK on assignment_items.survey_id |
| Input validation | C- | 18 of 23 routes lack Zod validation |

### 21.2 Top 3 Immediate Risks

1. **Authorization gap** ΓÇö field staff can manipulate each other's data, create admin accounts
2. **Egress budget blow-up** ΓÇö 2.4├ù over free tier under realistic 70-staff load
3. **No tests** ΓÇö every change risks regressions

### 21.3 Phased Mitigation Plan

| Phase | Time | What | When |
|-------|------|------|------|
| **P1** Egress & Stability (H1-H3) | ~6 hrs | Fix PSID pagination loop (survey-repository.ts), unbounded assignment_items fetch (data-insight-repository.ts), staff/stats fallback (route.ts) | **Next after B2** |
| **P2** Authorization Hardening | ~4 hrs | `requireRole()` helper on all 23 routes, RLS policies, ownership checks on assignment_items/delivery_photos | **Before 10+ staff** |
| **P3** Input Validation | ~2 hrs | Migrate 18 routes to Zod, GPS range checks, text length caps, ILIKE wildcard sanitization | After P1-P2 |
| **P4** Debugging Velocity | ~6 hrs | API docs/OWNERS file, barrel exports, structured logger, ESLint rules, consolidate 3 sheetsΓåÆ1 | After P1-P2 |
| **P5** Industry Standards | ~10 hrs | Vitest + tests, Playwright E2E, CI (GitHub Actions), Sentry, rate limiting | **Deferred** |
| **P6** Egress Optimization | ~3 hrs | HTTP cache headers, Vercel Edge Cache, React Query ΓåÆ IndexedDB persistence, service worker | After P1 |

### 21.4 Key Known Issues (Unfixed)

| ID | File | Issue | Severity |
|----|------|-------|----------|
| H1 | `survey-repository.ts:48-63` | PSID pagination loop fetches ALL 200K+ PSIDs | ≡ƒö┤ Egress |
| H2 | `data-insight-repository.ts:15-19` | Fetches ALL assignment_items for 90 days with no .limit() | ≡ƒö┤ Egress |
| H3 | `staff/stats/route.ts:23-91` | Fallback path fetches ALL assignments + items + staff for date range | ≡ƒö┤ Egress |
| H4 | `use-data-insight.ts:52` | Query key uses object reference, re-fetches on every render | ≡ƒƒí Cache |
| H5 | `use-survey-data.ts:8` | Same object-reference query key issue | ≡ƒƒí Cache |
| M6 | `use-assignments.ts` | staleTime: 30s too aggressive for mobile data | ≡ƒƒí Data |
| M12 | `survey-markers.tsx:53-71` | New L.divIcon created every render ΓÇö marker flicker | ≡ƒƒó Perf |
| ΓÇö | `map/page.tsx:130-143` | Debug badge visible in production | ≡ƒƒó UX |
| ΓÇö | `unit-delivery-sheet.tsx:94` | Red border (debug CSS) in production | ≡ƒƒó UX |
| F1 | `api/deliveries/mark/route.ts:60-81` | **2026-06-05 field test**: live delivery stuck on "Processing" ΓÇö DB status not updating, photo not syncing to Drive. Suspected: GAS webhook hangs/times out (10s Vercel function limit), so `await` blocks the response, client falls through to offline IndexedDB queue. Photo + status lost on page reload. **Needs office PC investigation:** Network tab on `/api/deliveries/mark`, Vercel function logs, GAS `Executions` log, confirm `NEXT_PUBLIC_DRIVE_WEBHOOK_URL` env var set. Likely fix: 5s `AbortController` timeout on webhook + move DB write before webhook (fire-and-forget). | ≡ƒö┤ Blocker |

### 21.5 Staff Counting & Egress Reality

| Scenario | Monthly Egress | Free Tier (5GB) |
|----------|---------------|-----------------|
| Staff-only (70), no admins | ~480 MB | Γ£à Safe |
| + 5 admins browsing daily with H1-H3 bugs | ~12 GB | Γ¥î 2.4├ù over |
| After P1 fixes (H1-H3 done) | ~3-4 GB | Γ£à Near limit |
| After P6 (caching + SW) | ~1.5 GB | Γ£à Comfortable |
| **Recommendation** | Plan Supabase Pro ($25/mo) after crossing ~1 GB/mo | |

---

## 22. User Design Decisions

_This section captures the developer's explicit design decisions and prompts. Read before changing any delivery-related behavior._

### 22.1 Delivery is Map-Centric (Not List-Centric)

**Decision:** Staff navigates from `/deliver` list ΓåÆ `/map?target=PSID`. The map is the primary delivery tool, not an intermediate page.

**Rationale:** Staff needs spatial awareness ΓÇö where they are vs where the delivery marker is. Pakistani urban areas are congested; street-level navigation requires map context. The portal photo in UnitDeliverySheet helps identify the house.

**Original GPS accuracy context:** Survey GPS coordinates may be imprecise (some are portal-placed, some field-collected). The 50m distance threshold accounts for this. Staff can long-press map to correct coordinates ΓåÆ saved to `house_corrections`.

### 22.2 Photo is the Only Required Proof

**Decision:** No Missed/Skip statuses. Full enforcement ΓÇö every assigned bill must have a photo taken. If the house is genuinely unreachable, admin handles it via Flag Management.

**Rationale:** "Missed" and "Skipped" create loopholes staff exploit. The photo is the atomic unit of proof. GPS coordinates are captured silently for verification but never displayed to staff (prevents gaming).

**What happens if house is demolished / no such house:** Staff flags it via the "Flag" button ΓåÆ admin resolves in Flag Management UI ΓåÆ removed from future assignments.

### 22.3 One-Tap Flow (No Confirm Step)

**Decision:** Take Picture ΓåÆ auto-saves ΓåÆ done. No "Confirm Delivery" button.

**Rationale:** Two-step flow ("Take Picture" ΓåÆ preview ΓåÆ "Confirm Delivery") hinders delivery speed ΓÇö staff complaint #1. Auto-saving after photo capture eliminates one tap and ~2 seconds per delivery. The photo is always saved; poor quality photos are audited via processing queue, not blocked at capture.

**Trade-off accepted:** Some photos may be blurry or dark. These go to `processing` status. Admin reviews and can request retake.

### 22.4 Silent GPS (Staff Does Not Know)

**Decision:** GPS is captured silently on photo confirm. No UI indicator. No "GPS failed" message.

**Rationale:** If staff knows GPS is being captured, they may try to game it (stand at a different location). Silent capture produces genuine walking patterns. GPS failure silently produces NULL (edge case #19) ΓÇö photo timestamp alone is sufficient proof, but failure rate is tracked as a staff performance metric.

**Implementation:** `navigator.geolocation.getCurrentPosition()` with `enableHighAccuracy: false` (faster, less battery) and 3s timeout. Null GPS = `processing` status (admin review required).

### 22.5 Processing Status (New Intermediate State)

**Decision:** New `processing` status between `pending` and `delivered`. Represents "photo taken, awaiting verification."

**Rationale:** Without an intermediate status, there's no way to distinguish "auto-verified delivered" from "needs admin review." The `processing` status flags items that either:
- GPS was null (timeout/denied)
- Distance > 50m from survey marker
- Survey marker coordinates are missing

Admin reviews `processing` items in the Assignments tab or Flag Management UI.

### 22.6 Distance Threshold (50m Default)

**Decision:** Haversine distance Γëñ 50m = auto-verify. Configurable per city.

**Rationale:** Urban Pakistani streets are narrow; houses are close together. 50m accounts for:
- Survey GPS imprecision (portal-placed vs field-collected)
- Delivery GPS imprecision (enableHighAccuracy: false)
- Street-level navigation accuracy
- Staff standing at the gate vs at the house front

**Future enhancement:** After 2-3 months of verified deliveries, the threshold can be tuned per UC based on historical distance distributions.

### 22.7 Server Handles Webhook Synchronously

**Decision:** `POST /api/deliveries/mark` uploads to GAS webhook ΓåÆ saves to Drive ΓåÆ calculates distance ΓåÆ returns result ΓÇö all synchronously before responding.

**Rationale:** Staff won't notice the ~1-2s extra latency because they're viewing the success overlay. The benefit is instant `delivered` status if distance is valid. No need for a separate async queue for this path (the IndexedDB queue is only for offline fallback).

### 22.8 Two Google Drive Accounts (Consolidate)

**Decision:** Legacy routing station has its own GAS webhook URL (hardcoded in `12_drive_sync.js`). Current app has `NEXT_PUBLIC_DRIVE_WEBHOOK_URL` in `.env.local`. These should be consolidated to one.

**Rationale:** Two webhooks = two Drive folders = fragmented photo storage. `staff_sync_logs` table already stores the file_id; the Drive folder it goes to depends on which webhook processes it. Consolidate to one webhook URL (the current app's) and migrate legacy photos.

### 22.9 Photo Size Target (30-70KB WebP)

**Decision:** Compress to WebP, q0.6, 1024px max width ΓåÆ 30-70KB per photo. Same as legacy routing station.

**Rationale:** Larger photos increase upload time (staff complaints about speed) and consume Drive storage. 30-70KB is sufficient for house identification on mobile. Quality 0.6 is visually acceptable for door/gate/facade identification.

**Implementation:** `OffscreenCanvas.toBlob('image/webp', 0.6)` ΓÇö non-blocking, background thread.

### 22.10 Debug Artifacts Must Be Removed Before Production

**Decision:** The debug badge (`map/page.tsx:130-143`) was removed during the June 5 office session. Red border (`unit-delivery-sheet.tsx:94`) was also removed. The `min-h-[300px]` diagnostic survives as a functional style (prevents sheet collapse on desktop with no intrinsic height) but should be verified before production.

**Rationale:** Debug overlay shows internal state (role, items count, conditions). Red border on sheet is unprofessional. Both were added for CSS layout debugging and should be cleaned before staff go-live.

---

## 23. Industry Complexity & Engineering Reality (2026-06-05)

_This section captures an honest meta-assessment of the app's complexity versus industry norms, what we got right, what we over-built, and what we under-built. Read this before deciding to add new features or refactor existing ones._

### 23.1 Difficulty Rating (Industry Standard)

**Comparable apps in this space:**
- Field service apps (ServiceTitan, Jobber): 3-6 months senior-team build
- Municipal billing + delivery (custom): 4-8 months
- Courier tracking (small scale, 1 city): 2-3 months
- Meter reading apps (utility, photo proof): 1-2 months
- Custom Zoho Creator / AppSheet: 2-3 weeks for prototype

**Our app is a 3-4 month senior-team project** for: 212K records, 3 cities, 70 staff, photo proof, GPS verification, admin assignment management, reference data.

**Pace check:** Core flow built, 4-5 sessions in. Roughly the right pace for a solo dev with legacy migration overhead.

### 23.2 What's Over-Engineered

For a 3-city, 70-staff operation, the following are oversized for actual daily use:

| Module | Lines | Reality | Verdict |
|---|---|---|---|
| Data Insight (4 tabs, 4-level drill-down) | ~590 | Single sortable table covers 90% | Over-built |
| Dashboard (4 charts, 6 KPI cards) | ~225 | Used monthly. 3-line KPI strip would do | Over-built |
| Filter Panel (4 components: DesktopFilterBar, MobileFilterSheet, ActionButtons, FilterDropdown) | ~660 | 4 layers for 6 dropdowns | Over-componentized |
| Settings themes (5 options) | ~30 | Only light + dark used; 3 are dead | Over-built |
| 27 API routes for ~8 features | n/a | Many routes are 1-2 endpoints for the same data | Over-built |

**Pattern:** Enterprise BI thinking (drill-down, multiple chart types, theme systems) applied to small-data, small-team operation.

### 23.3 What's Right-Sized (Industry Standard)

These match what experienced teams build. Do NOT simplify.

1. **Delivery flow** ΓÇö one-tap + photo + GPS + status is exactly what every delivery app does
2. **Status state machine** (`pending ΓåÆ processing ΓåÆ delivered`) ΓÇö standard. `processing` is a smart intermediate for "GPS failed" and "out of range"
3. **DB triggers for `staff_daily_stats`** ΓÇö industry best-practice for pre-computed aggregates; most teams get this wrong
4. **Reference tables** (hierarchy, surveyors, bill_months) ΓÇö senior-level optimization for filter dropdowns on 212K-row tables
5. **City-scoped queries** with district+tehsil filter ΓÇö correct handling of Sargodha-contains-Bhalwal geography
6. **Silent GPS capture** ΓÇö privacy-preserving, anti-gaming
7. **50m Haversine distance threshold** ΓÇö industry standard for urban last-mile delivery
8. **One-tap flow** (no confirmation step) ΓÇö correct speed-vs-accuracy trade-off
9. **Offline IndexedDB queue** ΓÇö standard for mobile delivery apps
10. **Photo: WebP q0.6 1024px ΓåÆ 30-70KB** ΓÇö correct mobile optimization

### 23.4 What's Under-Engineered (Behind Industry Standard)

Gaps where we're below industry baseline for delivery enforcement:

1. **No realtime admin visibility** ΓÇö staff delivers, admin doesn't see it live. Industry uses WebSockets / Supabase Realtime / Pusher. We have polling.
2. **No photo anti-tamper** ΓÇö staff could upload any old photo. Industry: EXIF timestamp verification, photo hash chain.
3. **No face/house verification** ΓÇö photo of a house Γëá proof of right house. Industry (high-stakes delivery): face match, signature, QR scan.
4. **GAS webhook for Drive** ΓÇö non-standard. Industry: Supabase Storage or S3 with signed URLs. The GAS approach is legacy from old routing station.
5. **No customer signature** ΓÇö bill delivery often requires signature (Pakistan Post). We only have photo.
6. **No service worker for PWA offline** ΓÇö we have IndexedDB queue but no service worker for full offline. Industry standard for mobile delivery.
7. **10s Vercel function timeout fighting slow GAS** ΓÇö root cause of F1 field failure. Industry: longer timeouts (Pro tier) or fire-and-forget webhook pattern.

### 23.5 Delivery Enforcement ΓÇö Why It's Inherently Hard

**Enforcement is the hard part of delivery apps.** Without enforcement, "take photo, mark done" is a 1-week project. With enforcement, you're building a verification system, not a workflow.

**Minimum viable enforcement pipeline (4 steps, each with failure modes):**
1. **Capture** ΓÇö photo, GPS, timestamp. Failure: GPS denied, camera failed, slow network
2. **Verify** ΓÇö distance, photo quality, timestamp window. Failure: distance > threshold, blurry photo, wrong time
3. **Store** ΓÇö DB row, file upload, audit trail. Failure: webhook timeout, DB conflict, RLS rejection
4. **Surface** ΓÇö admin review queue, exceptions. Failure: admin not checking, queue backlog, lost exceptions

**Industry enforcement stacks (by complexity):**
- Photo + GPS (our level) ΓÇö basic, ~70% of last-mile delivery apps
- Photo + GPS + signature ΓÇö common for legal/medical/courier
- Photo + GPS + barcode/QR ΓÇö common for package delivery
- Photo + GPS + face match ΓÇö high-stakes (banking, government)
- Photo + GPS + hash chain ΓÇö legal evidence (chain of custody)

**We are at the minimum viable enforcement level.** Not over-built; actually slightly under-built. Adding any one of: realtime admin view, EXIF verification, or signature capture, would push us above industry standard for this app's size.

### 23.6 Were There Simpler Paths?

**Yes. Four paths existed:**

| Path | Effort | Trade-off | Verdict |
|---|---|---|---|
| **No-code** (Zoho Creator / AppSheet) | 2-3 weeks | Limited offline, vendor lock-in, scale ceiling, no realtime | Not viable at 70 staff + 212K records |
| **Supabase + Next.js minimal** (boilerplate-first, direct from client) | ~40% less code | Less server-side control, harder custom business rules | Right call for staff mobile flow; we didn't take it |
| **Outsource delivery** (ePost, local courier) | 1-2 weeks integration | Cost per delivery, data ownership loss, less control | What most small municipal bodies actually do |
| **Custom full-stack** (what we did) | 3-4 months | Maximum flexibility, full control, integration with legacy | Right for organizations needing 100% control |

**For SWMC Sargodha, Path 3 (outsource) was probably the right call at the start.** But we've already invested in Path 4 ΓÇö no value in second-guessing now.

### 23.7 Honest Assessment of Our Position

**What we did right:**
- Clean DB schema with proper indexes
- Trigger-based aggregates (no client-side computation on 212K rows)
- Reference tables (saves 200K-row DISTINCT queries)
- Mobile-first delivery flow (matches industry standard)
- Smart state machine (pending ΓåÆ processing ΓåÆ delivered)
- Silent GPS (privacy-preserving, anti-gaming)
- One-tap flow (no confirmation step)
- Honest severity ratings in audit (61/100, not 99/100 hype)

**Where we overspent:**
- 30-40% of admin code isn't used in real workflow
- 5 themes, 4 chart tabs, 4-level drill-downs ΓÇö all overkill
- 27 API routes where 15 would do

**Where we under-spent:**
- No realtime admin view
- No anti-tamper
- 10s Vercel timeout fighting a slow GAS webhook (this caused F1 field failure)
- No signature, no EXIF verification

**The architecture is defensible but over-polished on the admin side and slightly under-built on the enforcement side.** The field-test failure is not a sign of bad design ΓÇö it's a sign of the gap between "demo on office PC" and "real-world 4-step pipeline with timeouts and slow networks."

### 23.8 Direct Answers to Common Questions

> "Is this app complex because the domain is complex, or because we made it complex?"

**Both.** The app is inherently medium-complex (delivery enforcement is the hard part). But we made it ~40% more complex than needed on the admin/analytics side. Stripping the over-built admin features would make the app 40% smaller and 80% as capable in the field ΓÇö which is the only place it actually runs.

> "How complex is a delivery mechanism involving enforcement?"

**Enforcement is the right amount of complex for what we have.** Photo + GPS + distance + state machine is the standard baseline. We're not over-built on enforcement. We're slightly under-built (no realtime, no anti-tamper). The reason the field test failed isn't bad design ΓÇö it's that the implementation pipeline (webhook ΓåÆ DB) is fragile to slow networks, and our 10s Vercel timeout doesn't forgive it.

> "Is there a simpler way to build this?"

**Yes, three simpler paths exist** (no-code, boilerplate-first, outsource). For SWMC's scale and need for control, custom full-stack is defensible. But the simpler paths exist and were rejected for valid reasons.

### 23.9 Recommended Path Forward (Post-Field-Fix)

After the F1 field bug is fixed at office PC, the priority order should be:

1. **Fix live pipeline** (F1) ΓÇö 1-2 hours. Webhook timeout + fire-and-forget. **Highest priority.**
2. **Add realtime admin view** ΓÇö 1 day. Industry standard gap.
3. **Cut admin bloat 30-40%** ΓÇö 2-3 days. Data Insight, Dashboard, Filter Panel, Settings.
4. **Add field flag button + daily summary** ΓÇö 1-2 days. Vision gaps.
5. **Address F1 root cause** (P1 egress audit H1-H3) ΓÇö 2-3 days. Audit compliance.

**Do NOT add more features until the live system is stable.** The F1 failure is a sign that the implementation pipeline is fragile to real-world conditions, not a sign of missing features.

---

## 24. Deliver ΓÇö Testing Protocol for Unsent Flow

### 24.1 Pre-Cleanup (Before Testing from Step 1)

| # | Step | Details |
|---|------|---------|
| 1 | Clear IndexedDB | DevTools ΓåÆ Application ΓåÆ IndexedDB ΓåÆ delete `billing-saas-photo-queue` + `billing-saas-unsent-photos` |
| 2 | Reset test data (admin) | Verify 10 test items (2 dummy MCs, TST_PSID_*) are all `pending`. Revoke any with `processing` status |
| 3 | Clear stale delivery_photos | `DELETE FROM delivery_photos WHERE synced_to_drive = false AND assignment_item_id IN (SELECT id FROM assignment_items WHERE psid LIKE 'TST_%')` |
| 4 | Ensure unsent_mode ON | Settings ΓåÆ Delivery tab ΓåÆ toggle "Always Queue Unsent" = ON, max limit = 50 ΓåÆ Save |

### 24.2 Test Flow

| # | Action | Expected Result | Verification |
|---|--------|----------------|-------------|
| 1 | Staff opens `/deliver` | Sees assignment list with 10 pending items (blue dots) | List loads, progress bar shows 0/10 |
| 2 | Tap a pending unit ΓåÆ sheet opens ΓåÆ take picture | Sheet shows progress (compressing/uploading/saving) ΓåÆ toast "Saved to queue" ΓåÆ auto-advances 1.5s to next pending | Network tab: `POST /api/deliveries/mark-processing` returns 200 |
| 3 | Check DB | `SELECT status FROM assignment_items WHERE psid = ?` ΓåÆ `'processing'` | `delivery_photos` has row with `photo_url = 'pending://unsent/...'`, `synced_to_drive = false` |
| 4 | Check filter bar | ≡ƒô╖ icon visible with badge "1" | No floating button at bottom-right |
| 5 | Deliver 2 more units | Badge increments: "2" ΓåÆ "3" | Queue count reflects total |
| 6 | Tap ≡ƒô╖ icon in filter bar | Modal opens: "3 photos queued" + "Sync All" button | Queue count matches expected |
| 7 | Tap "Sync All" | Photos upload in batches of 3 concurrent. Progress bar animates. Badge counts down. | Network tab: `POST /api/deliveries/promote` calls with sequential 3 concurrent uploads to GAS webhook |
| 8 | After sync completes | Badge disappears (queue empty) | `SELECT status FROM assignment_items` ΓåÆ `'delivered'`, `delivery_photos.photo_url` = real Drive thumbnail, `synced_to_drive = true` |
| 9 | Tap delivered unit marker | Sheet shows "View Details" only (no delivery button for admin) | Green checkmark visible |
| 10 | Max limit test | Queue 50 photos ΓåÆ try to deliver 51st ΓåÆ toast "Clear unsent queue first (50/50)" ΓåÆ button blocked | Items remain `pending` |
| 11 | Orphan test | Admin revokes test assignment ΓåÆ Staff Sync All ΓåÆ photo silently removed from queue | `SELECT status FROM assignment_items WHERE psid = ?` ΓåÆ item still `pending` (if orphaned) |
| 12 | Admin disables unsent mode | Settings ΓåÆ toggle OFF ΓåÆ Save | Staff delivery goes back to normal online upload (direct POST /api/deliveries/mark with webhook) |

### 24.3 Admin Verification Queries

```sql
-- Check item statuses
SELECT id, psid, status, delivered_at, gps_lat, gps_lng 
FROM assignment_items 
WHERE psid LIKE 'TST_%'
ORDER BY psid;

-- Check photo records
SELECT ai.psid, dp.photo_url, dp.synced_to_drive, dp.gdrive_file_id
FROM delivery_photos dp
JOIN assignment_items ai ON ai.id = dp.assignment_item_id
WHERE ai.psid LIKE 'TST_%'
ORDER BY ai.psid;
```

### 24.4 Edge Cases

| Edge Case | Expected Behavior |
|-----------|------------------|
| No GPS during capture | status = `processing` with null GPS fields. Photo queue handles without GPS. |
| Offline during capture | Photo queued to IndexedDB. Auto-syncs when online via `online` event listener. |
| Tab closed before sync | `sendBeacon` fires on `beforeunload` (best-effort ping). Full queue survives in IndexedDB. |
| Duplicate photo attempt (double-tap) | Mark-processing endpoint is idempotent ΓÇö early return if already `delivered`/`missed`. |
| Webhook fails during Sync All | Retries up to 3 times per photo. After 3 failures, removed from queue with `lastError`. |
| 403/404 from promote (orphan) | Photo silently removed from queue. Item stays `processing` in DB (admin must Force Complete or revoke). |
| Max limit exactly 50 | 50th item enqueued successfully. 51st blocked with toast. "Sync All" clears ΓåÆ counter resets. |

---


---

### 2026-06-09 ΓÇö Offline Photo Queue & Delivery Refactor (Phase 6 Completion) ΓÇö Location: Home

**Goal:** Fix the P0-P2 delivery pipeline bugs from Section 25.1. Replace the broken multi-round-trip photo flow with an IndexedDB-backed offline queue + atomic sync-photo endpoint.

**Done (P0-P2 items 1-13 from Section 25.1):**

**Architecture redesign:**
- **Old flow:** `POST /mark` ΓåÆ client captures photo ΓåÆ `POST promote` ΓåÆ `POST mark-processing` ΓåÆ `POST sync-photo` (GAS upload in route) ΓåÆ `POST ping-process`/`ping` (tracking). Multiple round trips, no offline queue, dueling `processing`/`delivered` status cascade.
- **New flow:** `POST /mark` (creates `delivery_photos` placeholder row, sets status) ΓåÆ staff captures photo client-side ΓåÆ IndexedDB queue stores blob ΓåÆ `POST /sync-photo` (single atomic upload to GAS webhook + DB update `photo_url` + `synced_to_drive=true`) ΓåÆ queue resolves to `ok`/`orphan`/`retry`
- **Key change:** Only one path to Drive upload. No intermediate "pending" URLs. No separate promote/mark-processing route. Queue retries on failure, orphans after `MAX_RETRIES`.

**Files created:**
1. `scripts/sql/030-delivery-photos.sql` ΓÇö `delivery_photos` table with indexes + trigger `trg_refresh_assignment_on_photo` (updates `assignment_items.photo_count` on INSERT) + cleanup RPC `cleanup_orphan_delivery_photos`
2. `src/lib/geo.ts` ΓÇö `haversine()` function for GPS distance calculation
3. `src/lib/photo-queue.ts` ΓÇö IndexedDB queue (add, getAll, count, remove, incrementRetry)
4. `src/hooks/use-photo-queue.ts` ΓÇö React hook wrapping photo-queue lib with `enqueuePhoto`, `processQueue`, `queueCount`, `isProcessing`
5. `src/app/api/deliveries/unsynced/route.ts` ΓÇö GET endpoint listing unsynced photos for retry UI (`synced_to_drive=false`)

**Files rewritten:**
6. `src/app/api/deliveries/mark/route.ts` ΓÇö JSON-only. Creates `delivery_photos` placeholder (`photo_url=null`, `synced_to_drive=false`). GPS enforcement from `app_settings`. Correct early-return for delivered/missed (fixes #10). Processing guard (fixes #11).
7. `src/app/api/deliveries/sync-photo/route.ts` ΓÇö Single route: uploads to GAS webhook, then atomically updates `delivery_photos` with `photo_url`, `gdrive_file_id`, `synced_to_drive=true`. Also promotes `assignment_items` status to `delivered` if currently `processing` (fixes #9).

**Files refactored:**
8. `src/components/delivery/unit-delivery-sheet.tsx` ΓÇö Uses `usePhotoQueue` for offline-first enqueue. Added live GPS accuracy indicator with colored dot (10m green / 50m amber / Γê₧ red). Unsupported mode uses `enqueueUnsent` (fixes #8).
9. `src/app/deliver/page.tsx` ΓÇö Queue badge ("3 photos waiting to sync") + manual retry button
10. `src/components/delivery/unsent-badge.tsx` ΓÇö Updated for new queue lib
11. `src/components/settings/unsent-images-section.tsx` ΓÇö Updated for new queue lib
12. `src/components/layout/floating-actions.tsx` ΓÇö Uses new hook for badge count (fixes #12)
13. `src/components/ui/toast.tsx` ΓÇö Default duration 4s ΓåÆ 12s for delivery workflow
14. `src/app/api/deliveries/unsynced/route.ts` ΓÇö New endpoint for retry UI

**Files deleted:**
15. `src/app/api/deliveries/promote/route.ts` ΓÇö Removed (replaced by atomic sync-photo)
16. `src/app/api/deliveries/mark-processing/route.ts` ΓÇö Removed (status set directly in /mark)
17. All `src/app/api/deliveries/ping*` variants ΓÇö Removed (no tracking round trips needed)

**Key decisions:**
- IndexedDB over `localStorage` ΓÇö Blob storage needed for photo binary data (base64 conversion only at upload time)
- Blob stored directly in IndexedDB (not base64) ΓÇö avoids double encoding overhead
- `removeFromQueue` resolves in `tx.oncomplete` ΓÇö but `incrementRetry` has a race condition (resolves immediately, not in `tx.oncomplete`). Documented in audit.
- `onupgradeneeded` only creates indexes on initial store creation ΓÇö upgrade from v3 to v4 won't create `deliveryPhotoId` index. Documented in audit.
- No auth check on `sync-photo` ΓÇö relies on JWT for authentication but doesn't verify staff_id ownership of the `delivery_photos` record. Documented in audit.

**Audit report:** `docs/AUDIT-2026-06-09.md` ΓÇö 13 findings (2 P1, 5 P2, 6 P3)

**Remaining:**
- Apply `030-delivery-photos.sql` to Supabase (needs PAT token)
- Apply `037-notifications.sql` (needs PAT token from office PC)
- Data cleanup: stale IndexedDB + DB records from prior testing
- Fix P1 bugs from audit (incrementRetry race condition, sync-photo auth check)
- Consider P2 fixes (unsynced admin auth, GPS target validation, IndexedDB schema migration, usePhotoQueue state dedup, toast duration)

### 2026-06-10 ΓÇö Photo Upload Reliability Investigation + Simplified Direct-Upload Plan ΓÇö Location: Office

**Goal:** Investigate why photos fail to sync (GAS 404 after URL fix, only 15% success rate), compare against working routing station implementation, propose simplified direct-upload approach.

**Done:**

**Root cause analysis:**
- Reviewed error logs from error-log-2026-06-10.json ΓÇö 50 photos all failed with GAS HTTP 404
- Timeline: 10:56-10:59 UTC ΓåÆ promote endpoint returned 404 (wrong GAS webhook URL)
- After URL fixed: 15/41 old queue photos synced, then all revoked
- Fresh test: 13 new deliveries, only 2 synced ΓÇö **85% failure rate persists**
- The `sync-photo/promote` SSR proxy adds an extra hop (browser ΓåÆ SSR ΓåÆ GAS) with Vercel serverless timeout (10s Hobby)

**Working reference studied:** `F:\qoder\billing-system\routing-station-src\js\12_drive_sync.js` (1128 lines)
- Old app uploads directly from browser to GAS webhook via CORS POST ΓÇö no SSR proxy
- Staff-paced uploads avoid GAS rate limits
- Simple DB logging to `staff_sync_logs` table ΓÇö no multi-step status flow, no assignment tracking
- Manual sync button ΓÇö staff controls when to upload

**Key architectural difference identified:**
| Aspect | Old App (works) | Current App (broken) |
|--------|-----------------|---------------------|
| Upload path | Browser ΓåÆ GAS (1 hop) | Browser ΓåÆ SSR ΓåÆ GAS (2 hops) |
| Queue | IndexedDB fallback only | Primary path with auto-sync |
| DB logging | Simple upsert after success | 3-step DB flow (mark-processing ΓåÆ enqueue ΓåÆ promote) |
| Upload trigger | Manual/staff-paced | Auto-sync (burst ΓåÆ rate limited) |

**Agreed priority:** Rewrite photo upload to match the old app's proven approach ΓÇö direct browser-to-GAS upload, no SSR proxy, simplified DB logging. Details in Section 27.

**Files reviewed:**
- `src/app/api/deliveries/promote/route.ts` ΓÇö SSR proxy, the likely bottleneck
- `src/app/api/deliveries/mark/route.ts` ΓÇö current mark endpoint (176 lines, over-engineered)
- `src/app/api/deliveries/mark-processing/route.ts` ΓÇö redundant intermediate step
- `src/components/delivery/unit-delivery-sheet.tsx` ΓÇö handleFile flow (585 lines)
- `src/hooks/use-photo-queue.ts` ΓÇö queue with promote dependency (178 lines)
- `src/hooks/use-deliver-unit.ts` ΓÇö deliver unit hook (72 lines)
- `src/hooks/use-unsynced-photos.ts` ΓÇö unsynced tracking hook
- `src/app/api/deliveries/unsynced/route.ts` ΓÇö unsynced endpoint
- `src/lib/photo-queue.ts` ΓÇö IndexedDB queue
- `src/lib/image/compress.ts` ΓÇö WebP compression
- `src/lib/drive.ts` ΓÇö GAS webhook helpers
- `F:\qoder\billing-system\routing-station-src\js\12_drive_sync.js` ΓÇö working reference (1128 lines)
- `F:\qoder\billing-system\routing-station-src\js\06_list_view.js` ΓÇö old app list/capture UI

---


## Session Log ΓÇö 2026-06-11 (Direct Browser-to-GAS Photo Upload)

### Summary
Implemented the direct browser-to-GAS photo upload system that was planned on 2026-06-10. The implementation differed from the original plan in one key way: **mark-first instead of upload-first**. The delivery record (GPS + timestamp + status) is created FIRST by the `mark` endpoint; photo upload happens as a second independent step. This ensures GPS enforcement is never lost and no orphan GAS files exist without DB rows.

### Changes Made
1. **New: `src/lib/drive-upload.ts`** ΓÇö Client-side `uploadToGAS(dataUrl, surveyId, email)` matching old Routing Station pattern. Uses `mode: 'cors'`, `Content-Type: text/plain` (avoids preflight). Tags images with `survey_id` for HDS gallery compatibility.

2. **Rewritten: `src/hooks/use-photo-queue.ts`** ΓÇö `processSingle` now calls `uploadToGAS()` then `fetch('/api/deliveries/sync-photo')`. No promote dependency. Added progress tracking (`processingIndex`, `totalToProcess`, `currentFileSize`, `uploadSpeed`) returned from hook.

3. **Rewritten: `src/components/delivery/unit-delivery-sheet.tsx`** ΓÇö `handleFile` calls `mark()` instead of `mark-processing`. Toast chain with `updateToast` across phases (SavingΓåÆUploadingΓåÆDone). `processingStep` overlay in sheet. `inputCooldown` 2s button guard on unit change.

4. **Simplified: `sync-photo/route.ts`** ΓÇö Now accepts `{ deliveryPhotoId, gdriveFileId }`, just updates `delivery_photos` row (photo_url, gdrive_file_id, synced_to_drive=true). ~142ΓåÆ~50 lines.

5. **Modified: `src/lib/photo-queue.ts`** ΓÇö Added `surveyId` and `email` to `QueuedPhoto`.

6. **Modified: `src/app/deliver/page.tsx`** ΓÇö Sync banner shows "Syncing 2/5 (45 KB) ┬╖ 12 KB/s".

7. **Modified: `src/components/delivery/unsent-badge.tsx`** ΓÇö Real progress bar (`width%`), index/total, KB/s, current item amber highlight.

8. **Modified: `src/components/settings/unsent-images-section.tsx`** ΓÇö Same progress display + progress bar.

9. **Deleted:** `mark-processing/route.ts`, `promote/route.ts`, `use-unsynced-photos.ts`.

10. **Env fix:** Added `NEXT_PUBLIC_DRIVE_WEBHOOK_URL` to Vercel env + `.env.local`. HDS drive images 500 resolved.

### Key Design Decisions
- **Mark-first (not upload-first):** Delivery record always created before photo upload. GPS enforcement is set once by `mark` at capture time. Photo upload does not re-evaluate GPS.
- **Manual Sync ON/OFF toggle:** ON ΓåÆ always queue (never upload during delivery). OFF ΓåÆ immediate GAS upload, queue only for retry on failure.
- **Upload tags with `survey_id` (not `psid`):** HDS queries Drive images by `survey_id`. Using `psid` was why new uploads didn't appear in HDS gallery.
- **No status promotion in `sync-photo`:** Status is set by `mark` ΓÇö upload should not change it.
- **Queue progress shared:** `usePhotoQueue` consumers (UnsentModal, deliver page, UnsentImagesSection) all show real-time index/total, KB/s, file size.
- **2s button cooldown:** Prevents accidental double-tap during unit transition without blocking deliberate quick taps.

### Build Verification
- `npm run build` ΓÇö compiled successfully, TypeScript zero errors, all 45 pages generated.
- No leftover references to `mark-processing`, `promote`, or `useUnsyncedPhotos` detected.

### Next Steps
1. **PRIORITY:** Execute systematic testing protocol (see below) ΓÇö must complete before deploy.
2. Deploy to Vercel.

### Discovery: HDS 500 Error Root Cause
The HDS Drive Images tab returned `{"error":"DRIVE_WEBHOOK_URL not configured"}` because `NEXT_PUBLIC_DRIVE_WEBHOOK_URL` was never set on Vercel. Found the GAS webhook URL in old Routing Station source `12_drive_sync.js:7`. Added to `.env.local` and Vercel Dashboard. Old Routing Station images now visible in HDS.

---

## Session Log ΓÇö 2026-06-11 (Bug Fixes: Failed Uploads, Sidebar, Queue Resilience)

### Summary
Five combined change sets: (1) Failed upload tracking with admin verification, (2) Sidebar cleanup ΓÇö Dashboard admin-only, (3) Queue resilience ΓÇö DB fallback when IndexedDB lost, (4) Error log polish, (5) BlobΓåÆbase64 optimization. Key fixes included rewriting the failed-uploads query (was silently dropping rows due to deeply nested `!inner` join), storing GPS unconditionally on assignment_items, and adding a red banner on the deliver page when DB has unsynced photos not in IndexedDB.

### Changes Made
1. **Migration 040** (`scripts/sql/040-delivery-photo-verification.sql`) ΓÇö added `verified_by uuid REFERENCES auth.users(id)` and `verified_at timestamptz` to `delivery_photos`.

2. **New: `GET /api/deliveries/failed-uploads`** ΓÇö returns delivery_photos where `synced_to_drive=false AND verified_by IS NULL`. Staff sees only own items, admin sees all with staff filter. Uses two separate queries instead of a 3-level `!inner` join to avoid silent row dropping when `staff` table is missing entries.

3. **New: `POST /api/deliveries/verify-photo`** ΓÇö admin-only endpoint, stamps `verified_by` and `verified_at` on a delivery_photo row via service_role client.

4. **New: `src/components/settings/failed-uploads-tab.tsx`** ΓÇö admin table showing all unverified failed uploads with staff name, PSID, date, GPS coords, and "Verify" button per row. Staff filter pills.

5. **Modified: `src/app/stats/stats-client.tsx`** ΓÇö `StaffPersonalStats` now fetches and shows a "Failed Uploads" card with PSID + date list (read-only, expandable).

6. **Modified: `BillingSidebar.tsx`** ΓÇö moved `{ id: 'stats', title: 'Dashboard', isView: true }` into admin-only conditional (alongside Data Insight). Staff no longer sees billing dashboard. Staff sidebar: Map, List, Deliver, Settings.

7. **Fixed: `src/app/api/deliveries/failed-uploads/route.ts`** ΓÇö rewrote to avoid 3-level `!inner` join. Two separate queries: first gets `delivery_photos` + `assignment_items` (1-level join), second fetches staff names. Photos show up even when `staff` table row is missing.

8. **Fixed: `src/app/api/deliveries/mark/route.ts`** ΓÇö changed GPS write from conditional (`if (gps_lat != null)`) to unconditional (`update.gps_lat = gps_lat ?? null`). GPS coords always stored on `assignment_items`.

9. **Modified: `src/app/deliver/page.tsx`** ΓÇö added DB unsynced fallback check on mount. When IndexedDB queue is empty but DB has unsynced photos (e.g., after screen-off data loss), shows red banner: "X photos stuck in database ΓÇö queue was cleared."

10. **Shortened toast messages** in `unit-delivery-sheet.tsx`: "Queue full (50/50)", "Queued ΓÇö upload failed", "Queued ΓÇö tap Sync", "Nearly full ΓÇö tap Sync".

11. **Fixed: error log source pills** in `error-log-section.tsx` ΓÇö sources now accumulate across all loaded pages instead of recomputing from 50 displayed rows. Source filter buttons stay stable.

12. **Enhanced: error log** ΓÇö each row shows error `#ID`, copy button per row copies "Error #ID: message" to clipboard, admin-only user_id text filter.

13. **Optimized: `src/lib/drive-upload.ts`** ΓÇö `uploadToGAS()` now accepts `Blob` directly instead of `dataUrl`. Base64 conversion happens internally.

14. **Doc fix: MASTER.md** ΓÇö `sharedLocation.accuracy` ΓåÆ `gpsAccuracy` (3 references).

### Key Design Decisions
- **Failed uploads are permanent records.** Staff cannot delete or reset them. Admin verifies by stamping `verified_by`. Clean audit trail without deleting historical data.
- **Deeply nested `!inner` joins are fragile.** PostgREST silently drops parent rows when any FK in the join chain is missing. Always prefer multiple shallow queries over deep nested joins for reliability.
- **GPS always stored unconditionally.** Even if momentarily null, the field is explicitly set to `null` rather than left unset. Ensures `assignment_items` always has explicit GPS values.
- **IndexedDB cannot be trusted for reliability.** Mobile Chrome may clear IndexedDB when under memory pressure. Always provide a DB-based fallback for queue state.

### Build Verification
- `npm run build` ΓÇö compiled successfully, TypeScript zero errors, all 47 pages generated.

### Next Steps
1. Apply migration 040 to production DB.
2. Deploy to Vercel.
3. Staff verifies: `/stats` shows Failed Uploads card, sidebar no longer has Dashboard.
4. Admin verifies: Settings ΓåÆ Failed Uploads tab shows stuck photos, can tap Verify.

---


## Session Log ΓÇö 2026-06-12 (Phase C + D: Delivery Quality, Performance, Cleanup)

### Completed
- **C.6 ΓÇö Delivery Quality RPC + Settings tab**: Migration `042-delivery-quality-rpc.sql` created `get_delivery_quality(p_month)` RPC returning per-staff aggregates (total_assigned, total_delivered, photo_fail_count, gps_oor_count, fail_rate, quality_score). API `GET /api/deliveries/quality?month=JUN2026` calls RPC admin-only. `DeliveryQualityTab` component with month selector, sortable table, quality score badges. Registered in Settings ΓåÆ Administration.
- **GAS referer check** (Item 5): `ALLOWED_ORIGIN` constant added to GAS script. `referer: window.location.origin` added to `drive-upload.ts` POST body. Protects webhook from unauthorized callers.
- **Error message propagation**: `drive-upload.ts` now includes GAS response body in HTTP errors and `result.message` in business-logic errors. Error log shows meaningful messages like "GAS: Unauthorized origin" instead of "GAS returned status='forbidden'".
- **D.1 ΓÇö Map performance**: `preferCanvas: true` added to both MapContainers (map-view.tsx, staff-map.tsx). `updateWhenIdle: true` added to both TileLayers. Canvas renderer replaces SVG ΓÇö fixes marker lag on low-end devices. GPS watcher deduplication deferred to D.3.
- **D.2 ΓÇö Supersede old photos**: Migration `043-add-superseded-at.sql` added `superseded_at timestamptz` column to `delivery_photos` with partial index. Mark route now sets `superseded_at` on previous active photos when creating a new one for the same `assignment_item_id`.
- **D.3 ΓÇö Queue state to Zustand**: `photo-queue-store.ts` expanded with `isProcessing`, `processingIndex`, `totalToProcess`, `currentFileSize`, `uploadSpeed`, `lastError`. `usePhotoQueue` hook now reads/writes store instead of local `useState`. All 5 consumers share the same state.
- **D.4 ΓÇö Dead code cleanup**: Removed unused `extractFileId()` from `drive.ts`. Removed unused POST handler from `delivery/photos/route.ts`.

### Files Changed
- `scripts/sql/042-delivery-quality-rpc.sql` ΓÇö NEW
- `scripts/sql/043-add-superseded-at.sql` ΓÇö NEW
- `src/app/api/deliveries/quality/route.ts` ΓÇö NEW
- `src/components/settings/delivery-quality-tab.tsx` ΓÇö NEW
- `src/app/settings/page.tsx` ΓÇö import + tab def + render
- `src/lib/drive-upload.ts` ΓÇö referer, error msg fix
- `src/components/map-view.tsx` ΓÇö preferCanvas, updateWhenIdle
- `src/components/delivery/staff-map.tsx` ΓÇö preferCanvas, updateWhenIdle
- `src/app/api/deliveries/mark/route.ts` ΓÇö supersede old photos
- `src/stores/photo-queue-store.ts` ΓÇö expanded state
- `src/hooks/use-photo-queue.ts` ΓÇö store reads/writes
- `src/lib/drive.ts` ΓÇö removed extractFileId
- `src/app/api/delivery/photos/route.ts` ΓÇö removed POST handler

### Migrations Applied
- `042-delivery-quality-rpc.sql` ΓÇö creates `get_delivery_quality(p_month)` RPC
- `043-add-superseded-at.sql` ΓÇö adds `superseded_at` column + index

### Testing Verification Needed
1. Settings ΓåÆ Administration ΓåÆ "Delivery Quality" tab ΓÇö month selector works, data loads, sorting works, quality score badges show
2. `GET /api/deliveries/quality?month=MAY2026` returns staff rows with all metrics
3. Revoke + re-deliver same assignment_item ΓÇö old photo has `superseded_at` set, new photo created
4. Map loads with Canvas renderer ΓÇö markers render as `<canvas>` elements, not DOM `<img>` tags
5. Photo queue processing ΓÇö all 5 consumers show same `isProcessing` state (badge, deliver page, settings)
6. `POST /api/delivery/photos` ΓÇö returns 404 (handler removed)
7. GAS referer check ΓÇö upload from different origin returns `forbidden`

## Session Log ΓÇö 2026-06-12 (Phase D.5: CircleMarker + Canvas, MC ShowAll, PulsingRing CSS)

### Summary
Three changes in one session: (1) Replaced all DOM-based `<Marker>` + `L.divIcon` map markers with `<CircleMarker>` to enable true Canvas rendering for 5k-50k markers. (2) Fixed the map MC filter showing only 50 markers by adding `showAll` mode with batched PostgREST fetching. (3) Replaced rAF-based pulsing ring animation with a CSS `@keyframes` compositor-thread animation for smoothness and satellite visibility.

### Completed

#### D.5a ΓÇö CircleMarker Swap (DOM ΓåÆ Canvas)
- **`src/lib/markers.ts`** ΓÇö DELETED. Removed `createMarkerIcon()` (L.divIcon with inline HTML), pulse keyframe injection, and all marker helper code. No consumers remain.
- **`src/components/delivery/staff-map-markers.tsx`** ΓÇö Replaced `<Marker icon={divIcon}>` with `<CircleMarker pathOptions={...}>`. Removed `L` and `createMarkerIcon` imports, `markerIcons` useMemo, and `L.DivIcon` typing. Markers now rendered as Leaflet vector layers: radius 6 (normal) / 7 (selected), `color` = border color, `fillColor` = status color, `weight: 2`. Selected marker gets `color: '#1e40af'` (dark blue border) + `<PulsingRing>`.
- **`src/components/survey-markers.tsx`** ΓÇö Same replacement. Radius 5 (normal) / 6 (selected). Removed `grayIcon` dead constant. UC color hash function unchanged. Selected marker gets PulsingRing.
- **`src/components/delivery/staff-map.tsx`** ΓÇö `UserMarker` changed from `<Marker icon={L.divIcon}>` to `<CircleMarker>`. Removed `USER_DOT_ICON` constant. Blue fill, white 3px border, radius 7.
- **`src/components/ui/pulsing-ring.tsx`** ΓÇö NEW. CSS-animated pulsing ring. Uses `useMap()` + `latLngToContainerPoint()` to track marker position on pan/zoom via direct DOM manipulation (no React re-render during animation). Injects `@keyframes marker-pulse-overlay` once. White ring (`rgba(255,255,255,0.9)`, 2.5px border) with `boxShadow: 0 0 8px rgba(0,0,0,0.5)` for visibility on satellite tiles. Animation: 1.5s ease-in-out infinite, scale 0.6ΓåÆ2.5, opacity 0.9ΓåÆ0. Runs on compositor thread ΓÇö auto-pauses when tab hidden.

#### D.5b ΓÇö MC Filter ShowAll (Fix 50-row map limit)
- **Root cause**: `useSurveyData` defaulted to `pageSize=50`. `map-view.tsx` passed no override, so the map always showed only the first 50 markers regardless of MC filter.
- **`src/lib/queries/constants.ts`** ΓÇö Added `MAP_PAGE_SIZE = 50000`.
- **`src/lib/validation/schemas.ts`** ΓÇö Raised `surveyQuerySchema.pageSize` max from 100 to 50000.
- **`src/hooks/use-survey-data.ts`** ΓÇö Added `showAll` boolean param (default `false`). When true, forces `page=1, pageSize=MAP_PAGE_SIZE`. Added `placeholderData: keepPreviousData` so old markers stay visible while new data loads (no blank-map flash).
- **`src/components/map-view.tsx`** ΓÇö `showAll = filters.ucs.length > 0`. Only applies `showAll` mode when at least one MC/UC is selected. Without MC filter, defaults to `pageSize=50` (prevents 150k+ city-wide fetch on clear).
- **`src/lib/repositories/survey-repository.ts`** ΓÇö Extracted `applyFilters()` to remove filter-application duplication. Added `fetchAll()` function that iterates through PostgREST in batches of 1000 rows (bypasses Supabase 1000-row-per-request limit). Used when `pageSize > 1000` in the `paymentStatus === 'all'` path. Existing callers using small pageSize are unaffected.

#### Unchanged / Confirmed Unaffected
- Staff delivery (`/deliver`) ΓÇö uses assignment hooks, never calls `useSurveyData` or the surveys API. Zero impact.
- List view (`survey-list.tsx`) ΓÇö calls `useSurveyData(filters, listPage, pageSize)` without `showAll`. Defaults to `false`, stays paginated.
- All other consumers of `useSurveyData` ΓÇö optional 4th param with default `false`.

### Files Changed
- `src/components/ui/pulsing-ring.tsx` ΓÇö NEW (CSS div pulse ring)
- `src/components/delivery/staff-map-markers.tsx` ΓÇö REWRITTEN (MarkerΓåÆCircleMarker)
- `src/components/survey-markers.tsx` ΓÇö REWRITTEN (MarkerΓåÆCircleMarker, dead code removed)
- `src/components/delivery/staff-map.tsx` ΓÇö EDITED (UserMarker MarkerΓåÆCircleMarker)
- `src/lib/markers.ts` ΓÇö DELETED
- `src/lib/queries/constants.ts` ΓÇö EDITED (added MAP_PAGE_SIZE)
- `src/lib/validation/schemas.ts` ΓÇö EDITED (surveyQuerySchema pageSize max 100ΓåÆ50000)
- `src/hooks/use-survey-data.ts` ΓÇö EDITED (showAll param, keepPreviousData)
- `src/components/map-view.tsx` ΓÇö EDITED (showAll guard)
- `src/lib/repositories/survey-repository.ts` ΓÇö REWRITTEN (applyFilters, batched fetchAll)

### Testing Verification
1. DevTools Elements ΓåÆ Ctrl+F `canvas` ΓåÆ single `<canvas>` element in map container, zero `<div class="leaflet-marker-icon">`
2. Select MC in filter bar ΓåÆ Apply ΓåÆ network tab shows `GET /api/surveys?uc=MC_NAME&pageSize=50000` ΓåÆ all MC markers visible on map
3. Clear MC filter ΓåÆ Apply ΓåÆ `pageSize=50` (default paginated view), no 150k city-wide fetch
4. Switch between two MCs ΓåÆ old markers stay visible (keepPreviousData), no blank flash
5. Click marker ΓåÆ white expanding ring visible on both streets + satellite tiles
6. Pan map ΓåÆ ring follows marker position
7. `/deliver` ΓåÆ staff markers render as CircleMarker, click selects, ring appears
8. `/map` list tab ΓåÆ pagination still works (not affected by showAll)
9. `npx tsc --noEmit` ΓÇö zero errors

## Session Log ΓÇö 2026-06-12 (Full MASTER.md Audit ΓÇö 20 Unlisted Items Discovered)

### Summary
Performed a systematic audit of the entire `docs/MASTER.md` (6292 lines) against `docs/PHASES.md` to find every proposed phase, feature, TODO, gap, or planned work item not yet captured in PHASES.md. Found 20 items across 5 categories. Updated PHASES.md with a new appendix section. Created `docs/PHASES.md` Appendix section with all 20 items organized by category, kept separate from existing phases. Corrected status tracking tables for items found already complete.

### Audit Method
1. Read PHASES.md to establish baseline of all captured phases
2. Read MASTER.md from start to finish, section by section
3. For each discovered item: traced against actual codebase (`src/`, `scripts/`, `scripts/sql/`) to verify current implementation status
4. Categorized as Done / Partial / Not Started / Deferred / Gap

### Findings: 20 Items

#### A. Pipeline & Deployment (6 items ΓÇö all Not Started)
- **A1** Deploy Office PC pipeline ΓÇö Phase 25, 1 hr. `ingest-all.py` exists but never deployed.
- **A2** Pipeline wrapper scripts P.1-P.3 ΓÇö 4 hrs. Standalone scripts for payments, lifecycle, bill mapping.
- **A3** App-Controlled Pipeline API ΓÇö Future. 4 endpoints to trigger scripts via Next.js server.
- **A4** Update bill-extractor-v4.py to write city/tehsil ΓÇö 30 min. Reference copy has columns; Office PC copy not updated.
- **A5** Import printer mapping JSON to DB (DQ.8) ΓÇö 1 hr. `bill_print_log` table exists; no import script.
- **A6** HDS show bill print metadata (DQ.9) ΓÇö 1 hr. Depends on A5.

#### B. Database Gaps (1 item ΓÇö Not Started)
- **B1** Add `updated_at` to `payment_history` ΓÇö 5 min. DB Gap #10; every other main table has it.

#### C. Code Quality Gaps (4 items ΓÇö 1 Not Started, 1 Deferred, 1 Resolved, 1 Info)
- **C1** Fix `/api/log` error swallowing in `global-error-logger.tsx` ΓÇö 10 min. `use-photo-queue.ts` fixed; 2 silent catches remain in global-error-logger.
- **C2** GPS thresholds: verify on mobile ΓÇö Info/testing item.
- **C3** GPS battery optimization ΓÇö Deferred. Currently uses high-accuracy-first approach.
- **C4** Merge two IndexedDB unsent queues ΓÇö Resolved. Audit confirmed only one queue ever existed; no merge needed.

#### D. Industry / Feature Gaps (7 items ΓÇö all unplanned gaps)
- **D1** Realtime admin visibility (WebSocket) ΓÇö No Supabase Realtime subscriptions exist; all polling.
- **D2** Photo anti-tamper (EXIF/hash) ΓÇö No photo integrity verification.
- **D3** Customer signature capture ΓÇö No signature component exists.
- **D4** PWA service worker + manifest ΓÇö No PWA infrastructure.
- **D5** Cut admin bloat 30-40% ΓÇö 2-3 days. Settings (991 lines), FilterPanel (640 lines), Dashboard (225 lines).
- **D6** Field flag button + daily staff summary ΓÇö 1-2 days. No flag button in delivery sheet.
- **D7** Consolidate two Google Drive accounts ΓÇö Partial. Webhook URLs consolidated; legacy photo migration not done.

#### E. Resolved (2 items ΓÇö Found Done)
- **E1** Orphaned PSID cleanup ΓÇö Γ£à Done. Fully implemented (hook, API, UI, enrich script, photo queue).
- **E2** Stale GPS dots doc ΓÇö Γ£à Partial. Part 12 narrative fixed; tracking tables still need cleanup.

### Files Changed
- `docs/PHASES.md` ΓÇö Added Appendix section with all 20 items. Updated Correction Items (added orphan PSID cleanup as Done). Updated Quick Stats. Updated Execution Priority Order with appendix gaps table.
- `docs/MASTER.md` ΓÇö This session log entry.

### Remaining Tracking Updates Needed
- Remove stale GPS dots entries from Section 25 and Section 26 tracking tables.
- Mark Phase 25 (Deploy Office PC) as visible in execution order table.

## Session Log ΓÇö 2026-06-13 (Staff Delivery Harden & Efficiency ΓÇö 8 Steps)

### Summary
Performed 8 targeted hardening steps for the staff delivery experience, identified through an audit of remaining gaps after Phase B3. Focused on: silent failure visibility, GPS battery optimization, dead code removal, field flagging, touch targets, and future-proofing IndexedDB migrations.

### Completed

#### Step 1 ΓÇö Settings fetch silent failure (P0, 10m)
- **`src/hooks/use-photo-queue.ts`**: Changed `.catch(console.error)` on `/api/settings` fetch to also show `toast('Could not load settings...', 'warning')`.
- **`src/components/delivery/unit-delivery-sheet.tsx`**: Changed `.catch(() => {})` on `/api/settings` fetch to show `toast('Could not load settings...', 'warning')`.

#### Step 2 ΓÇö "No assignment" misleading error (P0, 15m)
- **`src/app/deliver/page.tsx`**: Added explicit `isError && !useCache` render branch with "Server error ΓÇö tap to retry" + `refetch()` button. Previously showed "No assignment for today" when API failed and no cache.

#### Step 3 ΓÇö Double GPS watcher consolidation (P0, 30m)
- **`src/components/delivery/unit-delivery-sheet.tsx`**: Removed `watchIdRef`, `getCurrentPosition` effect, and `watchPosition` effect. Now reads from singleton `useUserLocation()` hook. Derived values: `deliveryLat`, `deliveryLng`, `gpsAccuracy`, `liveDistance` (useMemo), `liveGpsStatus` (computed). Removed 5 state variables and 2 useEffect blocks.

#### Step 4 ΓÇö Dead `isDelivering` state removal (P1, 5m)
- **`src/hooks/use-deliver-unit.ts`**: Removed `isDelivering`, `setIsDelivering`, `lastResult`, `setLastResult`, `progress`, `setProgress`, `reset` ΓÇö none were consumed by the sheet (which only destructures `{ mark }`). Hook now returns only `{ mark }`.

#### Step 5 ΓÇö Field Flag button (P1, 1h)
- **`src/components/delivery/unit-delivery-sheet.tsx`**: Added "Flag for Review" button in idle state, visible when `assignmentItemId` exists. Uses existing `useConfirm()` dialog. POSTs to existing `/api/admin/flagged-psids` with `reason: 'staff_flagged'`. No new API route needed.

#### Step 6 ΓÇö Mobile touch targets (P1, 1h)
- **`src/components/delivery/unit-delivery-sheet.tsx`**: Bumped "Photo not working?" button from `h-8` (32px) ΓåÆ `h-9` (36px). Bumped "Flag for Review" from `h-7` (28px) ΓåÆ `h-8` (32px). Bumped bottom content padding from `pb-5` ΓåÆ `pb-6`.
- **`src/app/deliver/page.tsx`**: Bumped list item button rows from `py-2.5` ΓåÆ `py-3` (larger tap target).

#### Step 8 ΓÇö IndexedDB migration pattern (P2, 15m)
- **`src/lib/photo-queue.ts`**: Replaced flat `onupgradeneeded` handler with structured `switch(event.oldVersion)` pattern. Each version case falls through for cumulative migrations. Currently all versions 0-5 are no-ops ΓÇö ready for future destructive schema changes.

### Files Changed
- `src/hooks/use-photo-queue.ts` ΓÇö EDITED (settings toast, 2 locations)
- `src/components/delivery/unit-delivery-sheet.tsx` ΓÇö EDITED (settings toast, GPS singleton, flag button, touch targets)
- `src/app/deliver/page.tsx` ΓÇö EDITED (isError branch, touch targets)
- `src/hooks/use-deliver-unit.ts` ΓÇö REWRITTEN (removed dead state)
- `src/lib/photo-queue.ts` ΓÇö EDITED (structured migration pattern)

### Verification
- `npx tsc --noEmit` — zero errors
- `npm run lint` — zero new errors in modified files

---

## 2026-06-14 — MASTER.md Restructure + PHASES.md Correction

### Phase: Infrastructure — Handoff System Completion

### What
- Restructured `docs/MASTER.md`: 6384 → 2728 lines (extracted session logs to SESSION.md, archived conversation transcripts)
- Created `docs/archive/transcript-2026-06-11-night-session.md` (490 lines)
- Created `docs/archive/transcript-2026-06-11-performance-audit.md` (70 lines)
- Corrected PHASES.md: 4 phases reclassified Not Started → Partial (C, D, E, M2)
- Updated PHASES.md Quick Stats: 4 partial, 9 not started, 3 deferred
- Updated AGENTS.md Source of Truth section — now references `.opencode/context.json` + `docs/SESSION.md`
- Updated `.opencode/context.json` with current state

### Key Decisions
- Phases C, D, E, M2 marked Partial (substantial work completed in June 12-13 sessions)
- HR app proxy.ts confirmed as correct Next.js 16 convention (not dead code)
- Correction Items: 10/11 Done, 1 Not Started (incrementRetry race — low risk)
- Unapplied Migrations: status unchanged (cannot verify DB state remotely)

### Files Modified
- `docs/MASTER.md` — restructured (2728 lines)
- `docs/PHASES.md` — 4 phases corrected
- `AGENTS.md` — handoff instructions updated
- `.opencode/context.json` — current state
- `docs/archive/transcript-2026-06-11-night-session.md` — created
- `docs/archive/transcript-2026-06-11-performance-audit.md` — created

### Verification
- All handoff files written and synced
- PHASES.md has correct statuses for all 44 phases
- AGENTS.md updated with handoff instructions

---

## 2026-06-15 — Performance Optimization + Bug Fix Audit

### Phase: Performance Optimization

### What
- **MAP_COLS** — kept `image_urls` in `MAP_COLS` for immediate portal images in delivery sheet and HDS; the old 9s bottleneck was the cross-table join (eliminated by migration 045 `is_paid` column), not the column size
- **HDS `useSurveyById`** — reverted to conditional `useSurveyById(houseListSurvey ? null : selectedHouseId)`, `survey = houseListSurvey || apiSurvey` priority, restored `keepPreviousData`
- **MapMarkerCount** — removed duplicate `useSurveyData()` subscription; reads from store `mapMarkers` array instead
- **`setInterval` 100ms timers** — removed from both AppHeader and filter-panel; replaced with static "..." during fetch
- **`mapMarkers` sync guard** — only closes HDS when current unit is filtered out; no unnecessary `selectHouse()` calls on data refresh
- **Migration 047** (`uc_name` + `uc_status` indexes) — applied; map query uses Bitmap Index Scan (0.6ms) instead of seq scan

### Bugs Fixed
- Delivery sheet portal images not showing (MAP_COLS was missing `image_urls`)
- HDS showing wrong portal images during navigation (`keepPreviousData` stale data)
- HDS drive images not showing (wrong `psid` from stale `survey` data)
- HDS double re-render on every nav (unconditional `useSurveyById`)
- Map marker pill triggering duplicate survey fetch (independent `useSurveyData`)
- AppHeader/filter-panel re-rendering 10x/sec during loading (100ms `setInterval`)
- HDS re-rendering on every map data refresh (unconditional `selectHouse` in sync effect)

### Key Decisions
- MAP_COLS keeps `image_urls` — portal images immediate, map query fast enough with `is_paid` denormalization
- Conditional `useSurveyById` + `houseListSurvey` priority — zero extra fetches during HDS navigation
- `keepPreviousData` restored — prevents flash of empty content on the rare fallback fetch
- Store-based marker count eliminates duplicate query entirely
- Static "..." timer display avoids per-frame re-renders

### Files Modified
- `src/lib/repositories/survey-repository.ts` — MAP_COLS includes image_urls
- `src/components/house-detail-sheet.tsx` — conditional useSurveyById, houseListSurvey priority
- `src/hooks/use-survey-data.ts` — restored keepPreviousData
- `src/components/map-marker-count.tsx` — removed duplicate useSurveyData
- `src/components/layout/AppHeader.tsx` — removed 100ms setInterval
- `src/components/filter-panel.tsx` — removed 100ms setInterval + unused useIsFetching
- `src/app/map/page.tsx` — guarded mapMarkers sync effect
- `src/components/survey-list.tsx` — setHouseSource on open
- `src/components/data-insight.tsx` — setHouseSource on open
- `.opencode/context.json` — updated
- `docs/SESSION.md` — appended

### Verification
- `npx tsc --noEmit` — 0 errors
- `npx next build` — compiled successfully
- All 6 performance regressions identified and fixed

---

## 2026-06-16 — H.1 Compound Endpoint + HDS Redesign

### Phase: H.1 + HDS Redesign + F.2 Cleanup

### What
- **H.1 — Compound endpoint:** Added `surveyData` to `GET /api/house-detail/extra`, removed `useSurveyById` from HDS (1 call instead of 2). Drive photos separated into independent `useDrivePhotos` hook (non-blocking, async load, no longer blocks extra endpoint).
- **HDS hero overlay:** Name + address + UC chip rendered on gradient bar at bottom of hero image. `pointer-events-none` on overlay allows click-through to gallery. All interactive elements (nav arrows, dots, counter, status badge, source badge) have `z-30`.
- **Gallery accordion:** First 3 thumbnails in a 3-col grid, "Show all (X more)" button expands inline with chevron. Thumbnails call `setImgIdx(i)` only (change hero image) — hero tap opens lightbox.
- **2-column content layout:** Left: PSID + collapsible PaymentHistoryCard. Right: Bill #/total, paid/since, Current Month badge, Current Bill badge (red, uses `billData.bill.amount_due`), survey info (surveyor, tehsil, date, time, category), flagged/archived banners, route info (wraps with `break-words`).
- **Route info moved** to bottom of right column, wraps with `break-words`.
- **Current Month badge** on its own line with emerald badge + month name.
- **Current Bill badge** changed from blue to red.
- **Status badge** moved from `bottom-3 left-3` to `bottom-3 right-3` (no overlap with UC chip in overlay).
- **F.2 — Dead fields removed:** `unitType` removed from FilterState, defaultFilters, useSurveyData, filter-panel, data-insight. `'overdue'` removed from payment status SelectItem.
- **Floating search instant-apply:** Changed `setPendingFilter({ search: v })` → `setFilters({ search: v })`.
- **Floating actions UI:** Labels visible next to buttons, larger icons, stronger shadow, bigger badge with ring-2 cutout.
- **Dots position:** `bottom-3` with `z-30` (was `bottom-12 z-10` — overlapped with overlay text).
- **Nav arrows:** Added `z-30` (were hidden under overlay).

### Key Decisions
- HDS compound endpoint approach: add to existing extra route (not new route) — simpler, backward compatible
- Drive photos via separate `useDrivePhotos` hook (already existed, was unused) — removes 5s webhook bottleneck from HDS response
- Hero overlay: `pointer-events-none` prevents blocking gallery click, all interactive elements get explicit `z-30`
- Gallery: accordion over inline +X more button that opened lightbox — keeps user in context
- Two-column layout at all widths (no mobile single-column) — content wraps with `break-words`

### Build Verification
- `npx tsc --noEmit` — 0 errors
- Commits: `dc7b8f4`, `c619e90`, `d0e0809`, `0db5830`

### Next
1. H.6 — URL-encode PSID in api/surveys/payments (5m, critical, deferred)
2. ~~Plan S — Unified map for staff~~ **SCRAPPED** — risk > benefit, staff rarely switches modes
3. F.1 — Eliminate pendingFilters fully from store
4. F.3 — Add PSID to search ILIKE
5. F.4-F.8 — Filter chips, UC selector, mobile UX, city switcher
6. H.2 — Collapsible sections in HDS
7. H.4-H.7 — Skeletons, proxy, prefetch

---

## 2026-06-16 — Evening Session: Plan Review + Plan S Scrapped

### Phase: Optimization Plan Review

### What
- Reviewed current state after last session's commits (HDS overhaul, F.2 dead fields, staffMode with pill, map jitter fix)
- Discussed Plan S (unified map) — decided to scrap. Dual-map (StaffMap + MapView) stays. Risk of breaking marker clicks, fly-to, and GPS marker outweighs marginal benefit of avoiding 1-second map reset on mode switch.
- Remaining items: H.4 (skeletons), H.5 (proxy images), H.7 (prefetch), F.1 (pendingFilters elimination), F.4-F.8 (filter polish)

### Key Decisions
- Plan S scrapped — StaffMap stays separate. No unified MapView.
- Next session will tackle specific remaining plans in discussion order.

### Files Changed
- `.opencode/context.json` — updated nextActions, removed Plan S from pending
- `docs/OPTIMIZATION-PLAN.md` — Plan S section marked as SCRAPPED, priority table updated
- `docs/SESSION.md` — this entry appended

---

## 2026-06-17 — F.3 PSID Search + H.6 Closure

### Phase: Optimization Plan — F.3, H.6

### What
- **F.3 — Added PSID to search:** Changed `survey-repository.ts:27` — added `psid.ilike.%${q.search}%` to the OR clause. Staff can now search by PSID and get results.
- **H.6 — Closed as "no action needed":** Analysis showed `URLSearchParams.set()` already auto-encodes values. PSIDs are alphanumeric with hyphens — no encoding bug exists. The plan's file reference to `api/surveys/payments/route.ts` was incorrect (that route takes `surveyId` and looks up PSID server-side).

### Key Decisions
- H.6 requires no fix — `URLSearchParams` handles encoding correctly
- F.3 implemented as a 9-character inline change (not a search module) — dedicated search module deferred to future optimization pass

### Files Changed
- `src/lib/repositories/survey-repository.ts` — 1-line edit
- `.opencode/context.json` — updated
- `docs/OPTIMIZATION-PLAN.md` — priority table + quick wins updated
- `docs/SESSION.md` — this entry appended

### Build Verification
- `npx tsc --noEmit` — 0 errors

### Next
1. F.1 — Eliminate pendingFilters from store (~1h)
2. F.4 — Active filter chips (~30m)
3. F.5 — Unify UC selector (~45m)
4. F.6 — Mobile filter sheet Show Results (~30m)
5. F.7 — CitySwitcher browse-all for staff (~15m)
6. F.8 — ucs[] across API routes (~30m)
7. H.4 — Section skeletons (~30m)
8. H.5 — Proxy images (~30m)
9. H.7 — Prefetch adjacent (~45m)

---

## 2026-06-17 — Arrears Pipeline Fix + Remaining Workflow Review

### Phase: Pipeline Fix + Optimization Plan Completion

### What
- **Root cause identified:** `enrich-survey-units.py` line 210 summed arrears across duplicate XLSX rows (1821 + 1821 = 3642). Changed to skip extras.
- **5 file changes implemented:**
  1. `enrich-survey-units.py` — duplicate rows now `pass` instead of summing arrears
  2. `export-bills-json.py` — added Office PC path fallback (same as enrich pattern)
  3. `export-bills-json.py` — copied from `archive/` to `scripts/` (active pipeline)
  4. `ingest-all.py` — added export-bills to Full Monthly Import (runs after enrich, before payments)
  5. `house-detail/extra/route.ts` — returns `latestArrears` from bills.json
  6. `house-detail-sheet.tsx` — uses `latestArrears` first, falls back to `survey.arrears`
- **Remaining workflow surveyed** — comprehensive summary of all unstarted/partial phases saved to docs.

### Key Decisions
- Duplicate rows: skip extras instead of summing arrears (fixes 1821+1821=3642 bug)
- F.1 cancelled (keep pendingFilters), F.4 skipped (low value), H.5 dropped (portal images fine direct), F.8 unnecessary (no cross-UC comparison need)
- F.6/F.7 low priority — revisit if staff requests mobile filter improvements
- Next big phases: Delivery hardening, Auto-Route, Live Monitoring, Flag Management

### Files Changed
- `scripts/enrich-survey-units.py` — line 210 sum → pass
- `scripts/archive/export-bills-json.py` — Office PC path
- `scripts/export-bills-json.py` — new file (copy from archive/)
- `scripts/ingest-all.py` — added BILLS_SCRIPT to option 1
- `src/app/api/house-detail/extra/route.ts` — latestArrears in response
- `src/components/house-detail-sheet.tsx` — use latestArrears for Current Bill
- `docs/PHASES.md` — Phase 0d/0e marked Done
- `.opencode/context.json` — updated with current state and next actions
- `docs/SESSION.md` — this entry appended

### Build Verification
- `npx tsc --noEmit` — pending (no TypeScript changes, only logic edits)
- All edits verified by re-reading each modified section

### Next
1. Delivery hardening — define specific scope (offline queue, sheet performance, assignment flow)
2. Phase F — Auto-Route Generation (3hrs)
3. Phase G — Live Admin Monitoring (3hrs)
4. Phase E — Flag Management UI (~3hrs remaining)
5. Phase M2 — Marker clustering + UC count badges (~1.5hrs remaining)

---

## 2026-06-17 — Map Navigation Smoothing + Pulsing Ring Fix

### Phase: Performance Optimization

### What
- **Full map navigation audit** — identified 3 lag sources and fixed all:
  1. Invisible map doing full work (fetching 50K markers, rendering all markers, flyTo animation) during list view
  2. 50K marker re-evaluation on every HDS prev/next step in map view
  3. Rubber-band zoom-out on view switch (FitBounds then flyTo)
- **7 performance fixes applied:**
  1. `Effect B` guarded with `activeView === 'map'` — invisible map stops flying
  2. `visible` prop on MapView — skips markers, data writes, flyTo subscriptions when hidden
  3. Markers memoized (`memo(MarkerItem)`) — only 2 markers re-render per HDS step, not 50K
  4. `MapFollower` duration 1.2s → 0.5s — snappier flyTo
  5. `FitBoundsOnFilter` skips when house selected — no rubber-band zoom
  6. `MapFollower` dedup (`lastCenterRef`) — no duplicate animations
  7. Removed dead `staffMode` subscription — one less re-render trigger
- **Pulsing ring fixed for new-survey units** (no psid) — `houseList` markers merged into rendered set, psid filter dropped for list markers so ring shows for any house with coordinates
- **`highlightedPsid` removed entirely** — ring now uses `selectedHouseId` directly, eliminating fragile sync mechanism

### Key Decisions
- `survey_id` adoption needed for map markers — new-survey units without `psid` should still show ring and render as clickable markers. **Priority work for next home session.**
- Map performance now at acceptable level — list view zero background work, map view snappy 0.5s animation with minimal re-render

### Files Changed
- `src/stores/billing-store.ts` — removed `highlightedPsid`/`setHighlightedPsid`
- `src/components/survey-markers.tsx` — memoized MarkerItem, use `selectedHouseId` directly, merged `houseList` markers, removed `staffMode` subscription, dropped psid filter for list markers
- `src/components/house-detail-sheet.tsx` — removed `setHighlightedPsid` effect/subscription
- `src/components/map-view.tsx` — `visible` prop guard, MapFollower dedup + 0.5s, FitBoundsOnFilter skip when selected
- `src/app/map/page.tsx` — Effect B guarded with `activeView`, dedup ref, pass `visible` to MapView
- `src/components/survey-list.tsx` — `showOnMap` uses `selectHouse` instead of `setHighlightedPsid`
- `.opencode/context.json` — updated
- `docs/SESSION.md` — this entry appended

### Build Verification
- `npx tsc --noEmit` — clean, zero errors
- All edits verified by re-reading each modified file

### Next
1. **`survey_id` adoption for map markers** — modify `handleMarkerClick` + marker rendering to use `survey_id` as primary identifier alongside `psid`. No-psid units render as clickable markers, ring shows, click opens HDS instead of delivery sheet.
2. Delivery hardening — define specific scope (offline queue, sheet performance, assignment flow)
3. Phase F — Auto-Route Generation (3hrs)
4. Phase G — Live Admin Monitoring (3hrs)
5. Phase E — Flag Management UI (~3hrs remaining)
6. Phase M2 — Marker clustering + UC count badges (~1.5hrs remaining)

---

## 2026-06-18 — Live Monitoring Bug Fixes + Assignment Model Documentation

### Phase: Live Monitoring — Bug Fixes

### What
- **Map zoom in Live view:** `MapFollower` was unmounted during Live view because `MapView` only rendered internals when `visible=true`, but `visible={activeView === 'map'}` was false for Live view. Fixed by mounting `MapFollower`, `FitBoundsOnFilter`, and `MapFlyToTarget` when `visible || activeView === 'live'`. SurveyMarkers stays gated behind `visible` only (delivery trail draws its own markers). Added `activeView` store selector to MapView.
- **Map zoom control:** Added `mapZoom` state + `setMapZoom` action to billing store (default 18). Updated `MapFollower` to read zoom from store instead of `useMapZoom` hook. `setCity` also resets zoom to 12. `LivePanel` calls `setMapZoom(12)` for city changes and `setMapZoom(15)` for UC clicks.
- **Staff list empty in Live view:** `LiveStaffList` was using `useStaffStats` which queries by `issued_at` date (when assignment was *created*). Amir's assignment was issued June 16, not today, so it returned all staff with 0 assigned. Rewrote to use `useDeliveryTrail` — group markers by `staff_name`, compute stats per staff — matching how all other live panel components work (LiveUcCards, LiveActivityFeed, LiveSummaryBar).
- **Added `staff_id` to delivery trail API:** Added `staff_id` column to `daily_assignments` select, passes through as `staff_id` on `DeliveryMarker` type, enabling GPS toggle in LiveStaffList.
- **Assignment model documented:** Added Section 17 to MASTER.md covering daily target system, multi-assignment flexibility, weekend handling, schema changes TBD.
- **Removed redundant API call:** LiveStaffList no longer calls `/api/staff/stats` — one less query per 5s poll.

### Key Decisions
- LiveStaffList now uses the same data source as all other live components (useDeliveryTrail), ensuring consistency and fixing the staff-empty bug.
- `mapZoom` in billing store lets any caller control zoom independently — default 18, city view 12, UC view 15, house click stays 18.
- Assignment model documented as "post-production" — schema changes deferred to discussion.

### Files Modified
| File | Change |
|------|--------|
| `src/stores/billing-store.ts` | Added `mapZoom` state (18) + `setMapZoom` action; `setCity` resets zoom to 12 |
| `src/components/map-view.tsx` | MapFollower reads zoom from store; mount nav components when `visible || activeView === 'live'` |
| `src/components/live/live-panel.tsx` | Added `setMapZoom(12)` on city change, `setMapZoom(15)` on UC click |
| `src/components/live/live-staff-list.tsx` | Rewrote to use `useDeliveryTrail` instead of `useStaffStats` |
| `src/hooks/use-delivery-trail.ts` | Added `staff_id` to `DeliveryMarker` interface |
| `src/app/api/live/delivery-trail/route.ts` | Select `staff_id` from daily_assignments; pass through to markers |
| `docs/MASTER.md` | Added Section 17 — Assignment Model Evolution & Daily Target System |
| `.opencode/context.json` | Updated |
| `docs/SESSION.md` | This entry |

### Build Verification
- `npx tsc --noEmit` — clean, zero errors

### Next
1. Continue assignment model discussion (daily target schema fields, Sunday handling, target-vs-actual dashboard)
2. Section 17 in MASTER.md marks the direction — implement after production readiness

---

## 2026-06-18 (continued) — Batch Assignment Model Phase 1

### Phase: Batch Assignment Model — Schema & Types

### What
- Discussion and finalized design for batch assignment model:
  - **Batch = assignment.** No new table. Extended `daily_assignments` with `name`, `target_per_day`, `uc_names`.
  - **Naming:** `{City}-B{seq}` (global per-city, never resets). Month dropped — batch is permanent.
  - **Start date:** First `delivered_at` — automatic.
  - **Monthly refresh:** Admin clicks Refresh — system deletes pending items, inserts fresh from lifecycle, keeps history.
  - **Staff changes:** Admin reassigns batch by updating `staff_id`. Batch is not permanently tied to a staff.
  - **Supervisor role:** Creates batches, full read-only (no settings, no revoke). City-scoped via `assigned_cities`.
  - **Revoke:** Admin only.
  - **Manage tab:** Grouped by UC (unchanged). Batch name shown as column.
- Created and applied migration `048-batch-assignment-model.sql` via Supabase CLI
- Updated TypeScript types: `DailyAssignment`, `AssignmentWithStats`, `StaffMember`
- Updated `ASSIGNMENT_COLS` in repository to include new columns
- Added `assigned_cities` to staff API route (`/api/staff`) and stats page

### Key Decisions
- Batch is permanent but staff is not — reassign, don't recreate.
- Month not in name — batch identity is permanent, `bill_month` on the row tracks current cycle.
- Super simplified from earlier discussion: no new tables, no new concepts. Just 3 columns on existing table.

### Files Modified
| File | Change |
|------|--------|
| `scripts/sql/048-batch-assignment-model.sql` | New migration: 3 columns + supervisor role + assigned_cities |
| `src/types/index.ts` | Added `name`, `target_per_day`, `uc_names` to `DailyAssignment` |
| `src/hooks/use-assignments.ts` | Added fields to `AssignmentWithStats` + `StaffMember` |
| `src/lib/repositories/assignment-repository.ts` | Added new columns to `ASSIGNMENT_COLS` |
| `src/app/api/staff/route.ts` | Returns `assigned_cities` |
| `src/app/stats/page.tsx` | Selects `assigned_cities` |
| `docs/MASTER.md` | Rewrote Section 17 with finalized design |
| `docs/SCHEMA.md` | Updated daily_assignments and staff table docs |
| `.opencode/context.json` | Updated |
| `docs/SESSION.md` | This entry |

### Build Verification
- `npx supabase db query --linked --file scripts/sql/048-batch-assignment-model.sql` — migrated successfully
- `npx tsc --noEmit` — clean, zero errors

### Next
1. Phase 2 — Create batches UI: multi-UC selector, auto-naming, target input
2. Phase 3 — Manage tab: batch name column, Refresh button
3. Phase 4 — Staff `/deliver`: batch header with target progress
4. Phase 5 — Supervisor role gates in API + sidebar

---

## 2026-06-18 (continued) — Page Loader 3-Dot Animation + Final Cleanup

### Phase: UI Polish — Page Transitions

### What
- Created `PageLoader` component — 3 bouncing dots with staggered animation (300ms delay, 3s timeout)
- Created `navigation-store` — zustand store that tracks `isNavigating` state
- Integrated into `AppShell`: watches `useNavStore.isNavigating`, shows PageLoader after 300ms delay
- Integrated into `BillingSidebar`: calls `useNavStore.start()` on nav link clicks
- Added `@keyframes bounce-dot` CSS animation in globals.css
- Enabled `experimental: { viewTransition: true }` in next.config.ts for smooth page transitions
- Committed leftover changes: `live-store.ts` panelPos offset fix, `live-uc-cards.tsx` onUcClick prop
- Pushed to main — Vercel auto-deploys

### Files Modified
| File | Change |
|------|--------|
| `src/components/page-loader.tsx` | New — 3-dot bouncing animation component |
| `src/stores/navigation-store.ts` | New — nav state store with 3s auto-clear |
| `src/components/layout/AppShell.tsx` | Import + render PageLoader based on isNavigating |
| `src/components/layout/BillingSidebar.tsx` | Call useNavStore.start() on nav clicks |
| `src/app/globals.css` | Added bounce-dot keyframes + animate class |
| `next.config.ts` | experimental viewTransition: true |
| `src/stores/live-store.ts` | panelPos offset fix |
| `src/components/live/live-uc-cards.tsx` | onUcClick prop for map zoom |

### Build Verification
- `npx tsc --noEmit` — clean, zero errors
- `git push` — main updated

---

## 2026-06-19 (continued) — UI Fixes: 1000-row Bugs, Popover Staff, Progress, Single-Row Toolbar

### Phase: Bug fixes + toolbar redesign

### What
- Fixed two more 1000-row bugs in `assignment-repository.ts` (`getUcTotals` line 69-72, `getUnassignedBills` line 174-178) using `fetchAllRows()` PostgREST batched pattern
- Replaced scrollable staff checkbox list with a popover-style dropdown (button + absolute div, same pattern as UC dropdown in deliver page)
- Added `assignProgress` state with progress text on active buttons ("1/3 staff", "2/3 staff")
- Redesigned bottom toolbar to a single compact row: `[Staff▼(N)] [1-200] [daily] [Selected(N)] [Full MC] [Assign]`
- Added "Assign Full MC" button — assigns ALL unassigned bills in one click (auto-ranges to total)
- All three buttons (Selected / Full MC / Assign) show progress text during multi-staff loop

### Files Modified
| File | Change |
|------|--------|
| `src/lib/repositories/assignment-repository.ts` | Fix 1000-row truncation in getUcTotals + getUnassignedBills |
| `src/components/assignments/uc-detail-panel.tsx` | Popover staff picker, single-row toolbar, progress indicator, Assign Full MC button |

### Build Verification
- `npx tsc --noEmit` — zero errors

### Next
- Test all in browser (counts, toolbar, staff popover, progress, Assign Full MC, My Position tab, QR scan)

---

## 2026-06-19 (late) — MC List Performance + Egress Fix: GROUP BY + total_items

### Phase: Performance — MC list counts

### What
- Rewrote `GET /api/uc-stats` to fetch just `uc_name` column from survey_units via parallel batched PostgREST fetches, count per UC in JS
- **Assigned per UC**: sum `daily_assignments.total_items` (stored at creation time) per UC, capped at `total` to prevent cross-city same-name-UC collisions
- Replaced `fetchAllRows` (sequential) with `fetchAllParallel` (HEAD for total count, then all pages in parallel) — cut response time from 42s to 12.6s on slow connection
- Fixed `status=in.(null,ACTIVE)` bug (silently excluded ~160K null-status enriched units) — restored `or=(status.is.null,status.eq.ACTIVE)`
- Fixed UI flash when switching MCs: added `key={selectedUc}` to `<UCDetailPanel>` so old data never shows

### Pending (Option B — future)
- Dedicated admin-only RPC for GROUP BY count (`SELECT uc_name, COUNT(*) ... GROUP BY uc_name`) — bypasses PostgREST's 1000-row limit and aggregate syntax limitations. Response would be ~2 KB in ~200ms. Allowed under AGENTS.md admin-only aggregate exception.

### Files Modified
| File | Change |
|------|--------|
| `src/app/api/uc-stats/route.ts` | Parallel batched uc_name fetch + total_items for assigned (no hierarchy_summary, no GROUP BY, no assignment_items) |
| `src/components/assignments/create-assignment-tab.tsx` | Added `key={selectedUc}` to prevent flash |
| `src/components/assignments/uc-detail-panel.tsx` | Popover staff picker, single-row toolbar, progress indicator, Assign Full MC button |
| `src/lib/repositories/assignment-repository.ts` | Fix 1000-row truncation in getUcTotals + getUnassignedBills |

### Build Verification
- `npx tsc --noEmit` — zero errors

### Next
- **HIGH — Test all** in browser: MC list loads with correct counts, create table works, toolbar layout, staff popover, progress indicator, Assign Full MC, My Position tab, QR scan
- **PENDING —** Create admin-only RPC for uc_name GROUP BY count (performance optimization ~200ms)

---

## 2026-06-20 — UDS Redesign: Planning + Implementation

### Phase: UDS Redesign — Complete (tweaks pending)

### What
- **UDS redesign fully planned and implemented** in a single session:
  - GPS row moved from bottom to top (shares row with close + survey_id)
  - Survey ID now pill-style with `bg-black/50 backdrop-blur-sm px-2 py-0.5 rounded-md`
  - Brighter GPS colors: `text-green-300`, `text-amber-300`, `drop-shadow-sm` for contrast
  - GPS dots bumped from `h-1.5` to `h-2.5`
  - Amount removed from info block
  - No-photo mode: "Mark Delivery" primary button (single tap, no camera, no confirm dialog)
  - "Photo not working?" fallback removed entirely
  - Flag collapsed to icon-only (`Flag` icon, `h-11 w-11` square button) in single action row
  - Single action row: `flex-row` with primary (flex-1) | Details (shrink) | Flag (icon)
  - Thumbnail strip (max 5, `h-8 w-8` buttons, active border-white) with tap-to-swap hero image via `selectedImageIdx` state
  - Gallery lightbox (`yet-another-react-lightbox` with Counter + Zoom plugins) — portal overlay, stays above UDS
  - Gallery icon (`Image` icon) on hero image at `top-12 right-3`
  - Admin can flag — condition changed from `assignmentItemId` to `assignmentItemId || isAdmin`
  - Swipe handlers moved from hero div `onTouchStart/onTouchEnd` to outer `fixed bottom-0` container
  - Success overlay `z-30` inside hero div with `bg-black/80 backdrop-blur-sm` covers full sheet
  - `handleSkipPhoto` replaced with `handleNoPhotoMark` (direct mark, no confirm)
  - Nav arrows moved from `top-1/3` to `top-1/2` for better vertical centering
  - House info moved higher: bottom area padding `p-4 pb-6` → `pt-1 pb-5 px-4`
  - Previous photos badge repositioned from `right-3` to `right-12` to avoid survey_id collision
- **Risk analysis**: 2 breaking risks mitigated (swipe moved to outer container, success overlay covers hero div), 3 moderate, 7 low
- **Checkpoint committed** at `b34039f` — full rollback instructions in MASTER.md Section 30
- **Final commit**: `6f650e9` — all changes pushed to `main`

### Key Decisions
- Gallery is UDS's own `<Lightbox>` instance (not shared with HDS) — no cross-component coupling, `unit.image_urls` only (portal images)
- No-photo mode removes the "Photo not working?" fallback entirely — single "Mark Delivery" button IS the complete flow
- `handleNoPhotoMark` calls `mark(..., true)` directly — same as old skip-photo logic but no confirm dialog
- `handleFile` (camera path) preserved unchanged — only used when `allowNoPhoto=false`
- Survey ID gets visual priority (pill background, `text-sm font-bold`) since it's the primary identifier on physical bills
- GPS text uses `drop-shadow-sm` for contrast against varying hero image brightness — no opaque background needed

### Remaining Tweaks (Home Session)
- z-index confirm dialog bug still exists for Flag and Force Complete paths (less frequent, but should fix)
- Verify GPS color readability against different hero image backgrounds
- End-to-end no-photo flow test on mobile (single tap, toast, auto-advance)
- Verify gallery Lightbox on slow devices

### Files Modified
- `src/components/delivery/unit-delivery-sheet.tsx` — Complete rewrite (~207 insertions, ~163 deletions)
- `docs/MASTER.md` — Section 30 updated with implementation status + remaining tweaks
- `docs/SESSION.md` — this entry appended
- `.opencode/context.json` — updated

