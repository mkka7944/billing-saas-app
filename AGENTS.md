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
- **DB triggers for data integrity** — `payment_summary` auto-refreshes on `payment_history` changes (INSERT/UPDATE/DELETE). `hierarchy` reference table upserted on `survey_units` changes. Tehsil enrichment happens during `enrich-survey-units.py` import, not via DB trigger.
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
1. **16th**: SWMC portal → biller list CSV + original A4 PDFs
2. **16th-18th**: Run `python pdf-psid-extractor.py` → generates lifecycle XLSX
3. **19th-20th**: Run `python pdf-bill-printer.py` → generates A5 print PDFs
4. **18th-20th**: Run `python scripts/enrich-survey-units.py --city <city> --month <Month-YYYY>` → enriches `survey_units` columns (monthly_fee, arrears, route_name, route_seq, current_bill_month) + upserts reference tables (hierarchy, surveyors, bill_months)
5. **Daily**: Run `bill-extractor-v4.py` → updates `payment_history`
6. **Daily (Admin)**: `/assignments` → create staff daily chunks
7. **Daily (Staff)**: `/deliver` → navigate, capture photo, mark delivered/missed

## Key Supabase Info
- URL: `https://qrxbsoqepfaryolwcedk.supabase.co`
- Superadmin: `kashifkhalil74@gmail.com` (credentials in `scripts/sql/superadmin-credentials.txt`)
- Schema: `scripts/sql/reset-and-create.sql` (base) + migration files `005`–`010` (apply in order)
- RPCs: `scripts/sql/007-data-insight-rpcs.sql` — approved admin-only aggregate functions
- Triggers: `scripts/sql/009-triggers-and-automation.sql` + `010-reference-tables.sql` — payment_summary refresh on payment_history changes, hierarchy reference table upsert on survey_units changes
