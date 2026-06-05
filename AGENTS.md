# Billing SaaS App — Development Rules

## Source of Truth
**Read `docs/MASTER.md` at session start + append session log at session end.**
All plans, data model, workflow, edge case decisions, and session history live there.
**Section 9** contains edge case decisions (must review before making migration or schema changes).
**Section 11** contains the sequential workflow rule (must follow for all implementation).

## Architecture
- Next.js 16 App Router with `src/` directory
- Standalone app — separate Supabase project (`qrxbsoqepfaryolwcedk`), separate Vercel deploy
- **Reference tables for filter dropdowns** — `hierarchy`, `surveyors`, `bill_months` tables. Never query 212K-row tables for filter options.
- **No RPCs for client-facing features** — RPCs allowed for admin-only aggregate queries (Data Insight, admin dashboards). See `scripts/sql/007-data-insight-rpcs.sql` for approved RPCs.
- **SSR API routes for all client data** — hooks fetch from `/api/*` endpoints, NOT direct Supabase client queries. The server creates the Supabase client (service_role). This reduces egress, hides credentials, enables server-side JOINs.
- **DB triggers for data integrity** — `payment_summary` auto-refreshes on `payment_history` changes (INSERT/UPDATE/DELETE). `hierarchy` reference table upserted on `survey_units` changes. Staff profiles auto-sync to `staff` table via trigger. Tehsil enrichment happens during `enrich-survey-units.py` import, not via DB trigger.
- Photos via Google Drive Apps Script webhook (zero Supabase Storage egress)
- Maps via react-leaflet + Google Maps tiles (not MapTiler)
- Offline photo queue via IndexedDB

## Performance Rules
1. Never `select('*')` — name explicit columns
2. Push filters to the server — `.eq()`, `.in()`, not JS `.filter()`
3. No N+1 queries — use `Promise.all` for independent queries
4. **Reference tables for all filter dropdowns** — hierarchy, surveyors, bill_months. Never DISTINCT on 212K rows.
5. No RPCs — all aggregation in TypeScript (EXCEPTION: admin-only aggregate queries for Data Insight and admin dashboards — see `scripts/sql/007-data-insight-rpcs.sql`)
6. `staleTime: 5min` for billing data (daily updates), `30min` for hierarchy (rarely changes)
7. Index every filtered column in Supabase — especially `survey_units.status`
8. No client-side `.filter()` / `.find()` on large datasets

## Conventions
- Hooks: `src/hooks/use-{feature}.ts`
- Services: `src/services/{feature}-service.ts`
- Components: `src/components/{component-name}.tsx`
- Types: `src/types/index.ts`
- Stores: `src/stores/{store-name}.ts`
- API routes: `src/app/api/{resource}/route.ts`
- Shared query modules: `src/lib/queries/{feature}.ts`

## Data Layer Rules (CRITICAL — prevent duplicate query logic)
1. **All client data goes through SSR API routes** — hooks `fetch('/api/*')`. The only exception is `supabase.auth.*` calls (signInWithPassword, getSession, signOut) which use the Supabase Auth SDK client-side.
2. **No direct `.from('table')` calls outside `src/app/api/`** — this means NO `createClient()` imports in stores, components, or hooks. The auth-store was refactored to call `GET /api/auth/profile` instead of querying `profiles` directly.
3. **Use shared query modules in `src/lib/queries/`** — never hardcode `status` filters or column lists in route files. Import from the shared modules instead:
   - `src/lib/queries/survey-units.ts` — `applyActiveFilter(query)` replaces all `.eq('status', 'ACTIVE')` calls. The correct filter is `or('status.is.null,status.eq.ACTIVE')` because enriched units (those with PSIDs) have `status = NULL`.
   - `src/lib/queries/pagination.ts` — `parsePagination(request)` and `applyPagination(query, p)` for consistent pagination.
   - `src/lib/queries/constants.ts` — `SURVEY_UNIT_COLS`, `STALE_TIMES` constants.
4. **One source of truth for `survey_units.status` filtering:**
   - `ACTIVE` = `or('status.is.null,status.eq.ACTIVE')` (includes enriched null-status units)
   - `ARCHIVED` = `not('status', 'is', null).neq('status', 'ACTIVE')`
   - `DUPLICATES` = filtered via `flagged_psids` join
   Never use bare `.eq('status', 'ACTIVE')` — it misses the 159,924 null-status enriched units.
5. **Never `select('*')`** — always use explicit column lists. For count-only queries (`head: true`), `select('*')` is acceptable since no rows are returned.
6. **Every hook must have explicit `staleTime`** — never leave it at default 0. Use `STALE_TIMES` constants from `src/lib/queries/constants.ts`:
   - `STALE_TIMES.REFERENCE` (30min) for hierarchy, bill_months, staff list
   - `STALE_TIMES.BILLING` (5min) for surveys, data-insight, charts, stats
   - `STALE_TIMES.DELIVERY` (30s) for assignments, delivery photos
   - `STALE_TIMES.PERFORMANCE` (2min) for staff stats/performance
7. **Mutate → invalidate pattern**: Every mutation must invalidate the query keys it affects. Invalidating the prefix (e.g., `['assignment-totals']`) invalidates all sub-keys (e.g., `['assignment-totals', month, district]`).
8. **Column constants in API routes** — define once at the top of the route file (e.g., `const COLS = 'col1, col2, col3'`). These are per-route because each endpoint needs different columns. Only shared column lists (like `SURVEY_UNIT_COLS`) go in `src/lib/queries/constants.ts`.

## Two User Modes
- **Field Staff:** Mobile-first. Route: `/deliver`. Sees only assigned bills. Full-screen map, bottom sheet detail, photo capture flow, progress bar.
- **Admin:** Desktop-first. Route: `/map`. Full filter bar, all survey markers, data-insight tables, assignment management.

## Dead Services (Do Not Use)
Files in `src/services/` that reference the dropped `bills` table or are otherwise broken:
- `finance-service.ts`, `retention-service.ts`, `recovery-service.ts`, `hierarchy-service.ts`, `survey-service.ts`, `route-service.ts`
These will be deleted in Phase 0d.5. All functionality replaced by SSR API routes.

## Phase 0 — File Inventory
All legacy files copied from office PC (`F:\qoder\billing-system\` + `F:\Routing-Station-Pro`) into `scripts/`:
- **scripts/ root**: `routingstation.py`, `migrate_to_supabase.py`, `migrate_life_cycle.py`, `config.py`, `geography.json`
- **scripts/ref/**: `pdf-bill-printer.py`, `requirements.txt`, old `.env` files, `routing-station-src/`
- **scripts/sql/_old/**: 17 SQL files from old routing station (for reference)
- **scripts/data/** (gitignored, ~1.1 GB): `excel_dumps/`, `scraped_data/`, `processed_pdfs/`, `routing-station-pro-data/`

## Batched PostgREST Fetch (Bypass 1000 max-rows)
PostgREST has a hard limit of 1000 rows per request (Supabase project config). `.range()` cannot override this. For queries that return more than 1000 rows, use batched fetching:

```ts
async function fetchAllRows(url: string, batchSize = 1000): Promise<any[]> {
  const svcKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
  const all: any[] = []
  let offset = 0
  while (true) {
    const res = await fetch(url, {
      headers: {
        apikey: svcKey,
        Authorization: `Bearer ${svcKey}`,
        Range: `${offset}-${offset + batchSize - 1}`,
      },
    })
    if (!res.ok) throw new Error(`PostgREST ${res.status}`)
    const chunk = await res.json()
    if (!chunk?.length) break
    all.push(...chunk)
    offset += chunk.length
    if (chunk.length < batchSize) break
  }
  return all
}
```

Usage: construct a PostgREST URL with all filters + order, then pass to `fetchAllRows(url)`. The service role key is used directly via REST headers.

## Route Tree RPC
`get_route_tree(p_city text DEFAULT '')` — returns distinct routes per city/UC with `unit_count` and `is_unrouted` flag. Source: `scripts/sql/029-route-tree-rpc.sql`. Called by `GET /api/routes` Mode 2.

## `selectedCity` vs DB District Name
`useBillingStore.selectedCity` stores **display name** (`"Sargodha"`, `"Bhalwal"`, `"Khushab"`). When querying APIs that filter by DB column `city_district` (`"SARGODHA"`), always convert via `CITY_TEHSIL_MAP[selectedCity].district`. The Routes tab was broken because it passed the display name directly — fixed.

## No Native `confirm()` — Must Use `useConfirm()`
Native browser `confirm()` is banned by ESLint (`no-restricted-globals`). Always use:
```ts
import { useConfirm } from '@/components/ui/confirm-dialog'
const confirm = useConfirm()
const ok = await confirm({ title, message, confirmLabel, variant })
```

## No Native `alert()` — Must Use `useToast()`
Native browser `alert()` is banned. Always use the global toast system:
```ts
import { useToast } from '@/hooks/use-toast'
const { toast } = useToast()
toast('Message here', 'success')   // 'success' | 'error' | 'info' | 'warning'
```
The `ToastProvider` is already in `layout.tsx` — no additional setup needed.
Toasts auto-dismiss after 4 seconds. Click to dismiss early.

## Admin Writes Must Use `createAdminClient()`
`src/lib/supabase/server.ts` uses the **anon key** (`NEXT_PUBLIC_SUPABASE_ANON_KEY`) — it respects RLS policies.
`src/lib/supabase/admin.ts` uses the **service_role key** (`SUPABASE_SERVICE_ROLE_KEY`) — it bypasses RLS.
- **Reads**: Use `createClient()` (anon key) — fine for SELECT with RLS.
- **Admin writes** (user management, staff table mutations, role changes): Use `createAdminClient()` (service_role key) to avoid RLS violations.
Example:
```ts
const admin = createAdminClient()
await (admin.from('staff') as any).upsert({ id, assigned_city }, { onConflict: 'id' })
```
The `as any` cast is needed because the admin client lacks generated Supabase types.

## Implementation Workflow (Permanent Rule)
Every task is broken into short atomic steps (max 1-2 file changes per step).
1. Present the next step with clear description + time estimate
2. Wait for user approval
3. Implement only that step
4. Wait for user verification
5. Present the next step
**Never skip ahead or batch multiple steps without explicit approval.**
**When in a phase/step and the user asks a question:** Answer the question, then return to the current phase/step without advancing unless told to proceed.

## Monthly Workflow

### CRITICAL: Billing Cycle Definition
A billing month runs from the **16th of the current month to the 15th of the next month** (midnight).
- **MAY2026** billing cycle = May 16, 2026 → June 15, 2026 (midnight)
- **JUN2026** billing cycle = June 16, 2026 → July 15, 2026 (midnight)
- The `currentMonth()` helper in `src/lib/constants.ts` implements this: if `d.getDate() < 16`, use previous calendar month.
- **May 31 does NOT signify end of billing cycle.** The cycle always runs 16th → 15th.

### Monthly (16th–20th) — Office PC
1. **16th**: SWMC portal → biller list CSV + original A4 PDFs
2. **16th–18th**: Run `python pdf-psid-extractor.py` → generates `test_lifecycle_Biller_{City}_{Month}.xlsx` (57 cols)
3. **19th–20th**: Run `python pdf-bill-printer.py` → generates A5 print PDFs + `index_cache_{city}_{month}.json`
4. **18th–20th**: Run `python scripts/ingest-all.py` → select `[1] Full Monthly Import`
   - Runs `enrich-survey-units.py` → lifecycle XLSX → survey_units (21 fields)
   - Runs `load-payments.py` → payment CSV → payment_history
   - Writes audit log to `ingest_log`

### Daily — Office PC
1. Run `python bill-extractor-v4.py --status PAID` → fetches updated payment CSV
2. Run `python scripts/ingest-all.py` → select `[2] Daily Update`
   - Runs `load-payments.py` → upserts new records to `payment_history` (idempotent, safe to run multiple times)
3. Optional: After `survey_filtered.py`, run `ingest-all.py` → `[3] Quick Sync`

### Output File Paths (Ingest Scripts Read from Office PC)
Ingest scripts (`load-payments.py`, `enrich-survey-units.py`) read directly from the Office PC output folders:
- **Lifecycle XLSX**: `F:\qoder\billing-system\01_Local_Engine\outputs\processed_pdfs\` (monthly)
- **Payment CSV**: `F:\qoder\billing-system\01_Local_Engine\outputs\scraped_data\COMBINED_ALL_CITIES_paid_ALL_HISTORY_Full.csv` (daily)
With local fallback to `scripts/data/` when Office PC folder is unavailable.

### Daily — App
1. Admin opens `/assignments` → picks UC → picks staff → sets count → creates daily chunk
2. Staff opens `/deliver` → sees assigned bills → navigates house-to-house
3. Staff captures photo + GPS → marks delivered/missed

## Supabase Access Methods

### Project Info
- Ref: `qrxbsoqepfaryolwcedk`
- URL: `https://qrxbsoqepfaryolwcedk.supabase.co`
- Superadmin: `kashifkhalil74@gmail.com`
- DB password: in `.env.local` (`SUPABASE_DB_PASSWORD`) and `scripts/sql/superadmin-credentials.txt`
- Service role key: in `.env.local` (`SUPABASE_SERVICE_ROLE_KEY`) — used by SSR API routes
- PAT token: in `.env.local` (`SUPABASE_ACCESS_TOKEN` = `sbp_...`)

### Management API (Direct SQL via PAT)
```bash
# Execute SQL directly against Supabase DB (no Dashboard needed)
curl -X POST https://api.supabase.com/v1/projects/qrxbsoqepfaryolwcedk/database/query \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"query": "SELECT COUNT(*) FROM survey_units;"}'
```
Used for: running migrations, VACUUM FULL, ad-hoc queries via CLI/Python.

### Python Upsert (service_role)
Python scripts (enrich-survey-units.py, load-payments.py, ingest-all.py) use:
```python
supabase = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
supabase.table("survey_units").upsert(rows, on_conflict="survey_id").execute()
```

### Schema
- Base: `scripts/sql/reset-and-create.sql`
- Migrations: `scripts/sql/` files `005`–`029` (apply in order)
- RPCs: `scripts/sql/007-data-insight-rpcs.sql` — admin-only aggregate functions
- Triggers: `scripts/sql/009-triggers-and-automation.sql`, `010-reference-tables.sql`, `026-staff-sync-trigger.sql`

## Pipeline Scripts Reference

### Source Scripts (Office PC — `F:\qoder\billing-system\01_Local_Engine\scripts\`)
| Script | When | Produces |
|--------|------|----------|
| `pdf-psid-extractor.py` | Monthly 16th-18th | Lifecycle XLSX (57 cols, master reference) |
| `bill-extractor-v4.py` | Daily | Combined payment CSV (19 cols) |
| `survey_filtered.py` | Monthly/on-demand | Survey data CSV |
| `pdf-bill-printer.py` | Monthly 19th-20th | A5 print PDFs + index cache JSON |
| `generate_category_fallbacks.py` | Monthly | Fallback mapping CSV |

### Ingest Scripts (in `scripts/`)
| Script | Purpose | Depends On |
|--------|---------|------------|
| `enrich-survey-units.py` | Lifecycle XLSX → survey_units (21 fields) | Phase 2 (rewrite existing) |
| `load-payments.py` | Payment CSV → payment_history | Phase 3 (create) |
| `ingest-all.py` | Orchestrator (interactive menu) | Phases 2+3 (create) |

## Testing Verification (Permanent Rule)
After every implementation step (atomic step OR phase/sub-phase completion), provide the user with a concrete **Testing Verification** section. This must cover:

- **What to do** — exact UI actions, API calls, or commands
- **What to expect** — the specific behavior change to observe
- **Edge cases** — boundary conditions, error states, null values
- **Where to inspect** — URL path, DB query, network tab, console

Format (required at end of every implementation message):
```
**Testing Verification:**
1. Open `/page` → do X → expect Y
2. Network tab shows `GET /api/endpoint` returning `{...}`
3. DB: `SELECT ... FROM table` confirms write
4. Edge case: no data / null / error → expect graceful fallback
5. Edge case: offline / slow network → expect fallback behavior
```

Real example from session 2026-06-05 (B.10+D phases):
```
**Testing Verification:**
1. Staff `/deliver` → tap pending → sheet shows "Take Picture & Deliver"
2. Tap → camera → photo → green checkmark "Delivered (14m from target)" → auto-advance
3. Network tab: POST /api/deliveries/mark → returns {status, distance, photo_url}
4. DB: delivery_photos has new row, assignment_items.status = 'delivered'
5. Offline: amber "Processing" overlay → auto-syncs when online
6. Admin `/map` → click marker → sheet shows "View Details" (no delivery action)
7. Open HDS → gallery shows portal images + old Drive images (via webhook)
```

## Data Model Rules (Critical — Avoid the Lost-Hour Traps)

### Geography: Sargodha Contains Bhalwal
Sargodha is both a district AND tehsil. Bhalwal is a tehsil WITHIN Sargodha district.
- **CRITICAL: city-scoped queries must filter by BOTH `city_district` AND `tehsil`** — never just `city_district`.
- Use `CITY_TEHSIL_MAP` (`src/lib/queries/hierarchy.ts`): `{ Sargodha: {district:'SARGODHA',tehsil:'SARGODHA'}, Bhalwal: {district:'SARGODHA',tehsil:'BHALWAL'}, Khushab: {district:'KHUSHAB',tehsil:'KHUSHAB'} }`.
- The Manage tab in `/assignments` was broken because it filtered only by `city_district` — Bhalwal UCs leaked into Sargodha view. Fixed by adding `tehsil` filter.

### survey_units.status: NULL = Active
- ~160K enriched units have `status = NULL`, not `status = 'ACTIVE'`.
- NEVER use `.eq('status', 'ACTIVE')` — use `applyActiveFilter()` which does `or('status.is.null,status.eq.ACTIVE')`.

### Delivery Key: psid (not survey_id)
- `psid` is always populated (98% coverage). It's the delivery target, assignment key, and payment join.
- `survey_id` (100%, PK) is for frontend list keys and QR scanning.
- The old code used `survey_id` for delivery targets — caused null-equality bugs.

### Staff-City Enforcement
- Staff with `assignedCity` set in `staff` table: CitySwitcher restricts them, chevron hidden.
- Cross-city assignments blocked server-side: `createAssignment` validates staff city vs UC city.
- Admin writes to `staff` table must use `createAdminClient()` (service_role key).

### Reference: MASTER.md Section 19
For ALL data model rules (geography model, status semantics, domain separation, assignment model, auth model, reference tables, billing cycle, trigger inventory, API data flow, approved RPCs, data integrity rules), see `docs/MASTER.md` Section 19 (Data Model Rules Comprehensive Reference). Read before making any schema or query changes.
