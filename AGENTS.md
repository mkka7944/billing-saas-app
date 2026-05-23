# Billing SaaS App — Development Rules

## Architecture
- Next.js 16 App Router with `src/` directory
- Separate Supabase project (not the HR project)
- No RPCs — all aggregation in TypeScript services
- Photos via Google Drive Apps Script (zero Supabase Storage egress)
- Maps via react-leaflet + MapTiler tiles

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
