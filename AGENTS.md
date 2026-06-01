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
- Migrations: `scripts/sql/` files `005`–`028` (apply in order)
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
