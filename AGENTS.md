# Billing SaaS App — Development Rules

## Source of Truth
**Read `docs/MASTER.md` at session start + append session log at session end.**
All plans, data model, workflow, and session history live there.

## Architecture
- Next.js 16 App Router with `src/` directory
- Standalone app — separate Supabase project (`qrxbsoqepfaryolwcedk`), separate Vercel deploy
- No RPCs — all aggregation in TypeScript services
- Photos via Google Drive Apps Script webhook (zero Supabase Storage egress)
- Maps via react-leaflet + Google Maps tiles (not MapTiler)
- Offline photo queue via IndexedDB

## Performance Rules
1. Never `select('*')` — name explicit columns
2. Push filters to the server — `.eq()`, `.in()`, not JS `.filter()`
3. No N+1 queries — use `Promise.all` for independent queries
4. No RPCs — all aggregation in TypeScript
5. `staleTime: 5min` for billing data (daily updates)
6. Index every filtered column in Supabase
7. No client-side `.filter()` / `.find()` on large datasets

## Conventions
- Hooks: `src/hooks/use-{feature}.ts`
- Services: `src/services/{feature}-service.ts`
- Components: `src/components/{component-name}.tsx`
- Types: `src/types/index.ts`
- Stores: `src/stores/{store-name}.ts`

## Phase 0 — File Inventory
All legacy files copied from office PC (`F:\qoder\billing-system\` + `F:\Routing-Station-Pro`) into `scripts/`:
- **scripts/ root**: `routingstation.py`, `migrate_to_supabase.py`, `migrate_life_cycle.py`, `config.py`, `geography.json`
- **scripts/ref/**: `pdf-bill-printer.py`, `requirements.txt`, old `.env` files, `routing-station-src/`
- **scripts/sql/_old/**: 17 SQL files from old routing station (for reference)
- **scripts/data/** (gitignored, ~1.1 GB): `excel_dumps/`, `scraped_data/`, `processed_pdfs/`, `routing-station-pro-data/`

## Monthly Workflow
1. **19-20th each month**: Gov portal → lifecycle XLSX downloaded to `processed_pdfs/`
2. Run `python scripts/process_bill_documents.py --path <lifecycle_dir> --month <Month-YYYY>`

## Key Supabase Info
- URL: `https://qrxbsoqepfaryolwcedk.supabase.co`
- Superadmin: `kashifkhalil74@gmail.com` (credentials in `scripts/sql/superadmin-credentials.txt`)
- Schema: `scripts/sql/reset-and-create.sql` (current) + `scripts/sql/004-bill-verification-system.sql` (pending)
