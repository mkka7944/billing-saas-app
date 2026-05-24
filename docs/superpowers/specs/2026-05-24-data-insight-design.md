# Data Insight Page — Design Spec

**Date**: 2026-05-24
**Status**: Approved

---

## 1. Overview

New SPA view inside `/map` hub for admin-only data analysis. Shows aggregate KPIs and a drill-down table filtered by the same global filters (District, Tehsil, MC/UC, Surveyor, Status, Search). Field staff never see this view.

---

## 2. Approach

**Approach A (chosen)**: Add `'data-insight'` to the existing `ActiveView` union type. Renders inside the `/map` SPA hub when selected, sharing the same `AppShell`, `DesktopFilterBar`, and global filter state.

---

## 3. API Route: `GET /api/data-insight`

### Query Params
Same as global filter state:
- `district` (string, optional)
- `tehsil` (string, optional)
- `uc` (string, optional)
- `surveyor` (string, optional)
- `status` (string, optional: `all`, `active`, `archived`)
- `page` (number, default 1)
- `pageSize` (number, default 50)

### Response
```ts
interface DataInsightResponse {
  kpis: {
    total_units: number
    active_units: number
    archived_units: number
    billed_units: number
    paid_units: number
    total_collected: number
    recovery_rate: number
    unique_surveyors: number
    no_coords: number
  }
  rows: AggregationRow[]
  total: number
}

interface AggregationRow {
  level: 'district' | 'tehsil' | 'uc' | 'unit'
  district: string
  tehsil?: string
  uc_name?: string
  total_units: number
  active: number
  billed: number
  paid: number
  collected: number
  recovery_rate: number
  surveyors: number
  no_coords: number
}
```

### Drill-down Logic
- **No filters** → `GROUP BY city_district` (level: `district`)
- **District selected** → `GROUP BY tehsil` (level: `tehsil`)
- **District + Tehsil selected** → `GROUP BY uc_name` (level: `uc`)
- **District + Tehsil + UC selected** → individual `survey_id` rows (level: `unit`)

### Implementation
- Uses service role key (same as `/api/hierarchy`)
- Chunked pagination for survey_units queries (batches of 1000)
- Joins with `bill_items` on `survey_id` for billing counts
- Joins with `payment_history` on `psid` + `bill_month` for payment data
- Revalidate: `revalidate = 300` (5 min)

---

## 4. Frontend Components

### New Files
| File | Purpose |
|------|---------|
| `src/components/data-insight.tsx` | Main view: KPI cards row + aggregation table + pagination |
| `src/hooks/use-data-insight.ts` | TanStack Query hook wrapping `/api/data-insight` |
| `src/app/api/data-insight/route.ts` | API endpoint |

### Modified Files
| File | Change |
|------|--------|
| `src/types/index.ts` | Add `'data-insight'` to `ActiveView` union type |
| `src/stores/billing-store.ts` | Add `'data-insight'` to `ActiveView` type (line 4) |
| `src/app/map/page.tsx` | Import `DataInsight`, add `{activeView === 'data-insight' && <DataInsight />}` |
| `src/components/layout/BillingSidebar.tsx` | Add "Data Insight" nav item with `FileSpreadsheet` icon under Navigation group (show only if user role is admin) |
| `src/components/layout/AppShell.tsx` | Add `data-insight` tab (5th) at position 4 in bottom tab nav (show only if admin) |

### Layout
**Desktop:**
- Top: filter bar (same as all views)
- KPI row: 5 cards in a row — Total Units, Active, Billed, No Coords, Recovery Rate
- Below: aggregation table with columns matching `AggregationRow`
- Pagination: page size selector (10/25/50/100) + prev/next

**Mobile:**
- KPIs: horizontal scrollable card carousel
- Table: horizontal scroll within card
- Bottom tab: Data Insight tab visible only for admin users

### Surveyor Filter
Already exists in global `FilterState` and `DesktopFilterBar`. No extra work needed — the API reads `surveyor` from query params.

---

## 5. Role Gating

- No role infrastructure exists yet. Need to:
  - Add `role: string` to `auth-store` (default `'staff'`)
  - On `checkSession()`, query `profiles` table: `select role from profiles where id = user.id`
  - If no profile found, default to `'staff'`
  - Store `role` alongside `user` in the store
- Show nav items / tabs only if `role === 'admin'`
- For now, only `kashifkhalil74@gmail.com` has admin role (from seed data)

---

## 6. Performance

- Chunked pagination for all Supabase queries (bypasses 1000-row limit)
- API response cached for 5 minutes
- No impact on field staff — component never mounts for non-admin users
- `use-hierarchy.ts` filter data already cached at 30min via `/api/hierarchy` — no additional calls
