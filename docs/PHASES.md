# Billing SaaS App — Complete Phase Reference

> **Source of truth**: `docs/MASTER.md` (reference-only), `docs/SESSION.md` (session log), `docs/PHASES.md` (phase catalog), `.opencode/context.json` (machine-readable handoff state)
> **Last updated**: 2026-06-21

---

## How to Read This Document

| Status | Meaning |
|--------|---------|
| ✅ Done | Completed and verified |
| 🔜 In Progress | Currently being worked on |
| ⏳ Not Started | Queued, ready to begin |
| ⏸️ Deferred | Deprioritized, no current timeline |
| ❌ Cancelled | No longer needed |

**Priority scale**: P0 (critical) → P1 (high) → P2 (medium) → P3 (low)

---

## PHASE GROUP: Section 10 — Implementation Phases

### Phase 0d — Reference Tables & Filter Fix
| | |
|---|---|---|
| **Status** | ✅ Done |
| **Estimate** | 1.5 hrs |
| **Description** | Create `hierarchy`, `surveyors`, `bill_months` reference tables for filter dropdowns so we never query 212K-row `survey_units` just to populate filter options. Update APIs to use these tables. Delete 6 dead service files. |
| **Sub-items** | |
| | 1. Create reference tables via migration |
| | 2. Populate from `survey_units` via trigger |
| | 3. Update filter dropdown API endpoints to query reference tables |
| | 4. Delete dead services: `finance-service.ts`, `retention-service.ts`, `recovery-service.ts`, `hierarchy-service.ts`, `survey-service.ts`, `route-service.ts` |

### Phase 0e — Stabilize & Clean
| | |
|---|---|---|
| **Status** | ✅ Done |
| **Estimate** | 2 hrs |
| **Description** | Fix payment filter pagination (PSID_PAGE=3000 exceeds Supabase 1000-row limit), billing-stats API returns empty arrays instead of zeros, move routes to API pattern, deduplicate `currentMonth()`, add `survey_units.status` index, fix `FinanceSummary` types. |
| **Sub-items** | |
| | 1. Fix payment filter PSID pagination in `survey-repository.ts` (PSID_PAGE=3000 > PostgREST 1000 limit) |
| | 2. Fix `billing-stats` API returning empty arrays instead of zero values |
| | 3. Deduplicate `currentMonth()` — use single source in `src/lib/constants.ts` |
| | 4. Add `survey_units.status` index for filtered queries |
| | 5. Fix `FinanceSummary` type definitions |

### Phase 0f — Schema Restructuring Foundation
| | |
|---|---|
| **Status** | ⏳ Not Started |
| **Estimate** | 6 hrs |
| **Description** | Add `psid`/`last_verified_month` to `survey_units`. Create `house_corrections` table. Revise 5 RPCs. Create 4 delivery tables + triggers. Archive legacy tables. |
| **Sub-items** | |
| | 1. Add `psid`, `last_verified_month` columns to `survey_units` |
| | 2. Create `house_corrections` table for field corrections |
| | 3. Revise 5 RPCs for new schema |
| | 4. Create 4 delivery-related tables + triggers |
| | 5. Archive legacy tables |

### Phase A — Admin Assignment UI
| | |
|---|---|
| **Status** | ✅ Done |
| **Estimate** | 3 hrs |
| **Description** | Assignment creation/management API + UI. UC list, staff picker, route tab, month dropdown filter. Daily assignments with bill_month auto-populated. |
| **Key files** | `assignment-repository.ts`, `use-assignments.ts`, `manage-assignments-tab.tsx`, migration 041 |

### Phase B1 — Field Staff Delivery Basics
| | |
|---|---|
| **Status** | ✅ Done |
| **Estimate** | 7 hrs |
| **Description** | `/deliver` page, photo capture, offline IndexedDB queue, map, card list, bottom sheet. GPS 50m verification threshold. |

### Phase B2 — QR + One-Tap Delivery
| | |
|---|---|
| **Status** | ✅ Done |
| **Estimate** | 2 hrs |
| **Description** | QR scanner, UnitDeliverySheet, one-tap photo+GPS+auto-verify, auto-advance, Drive images in HDS. |

### Phase B3 — Delivery Stability & Hardening
| | |
|---|---|
| **Status** | ✅ Done |
| **Estimate** | 8 hrs |
| **Description** | 4 sub-phases (B3a-B3d) fixing delivery pipeline reliability issues. |
| **Sub-items** | |
| | **B3a — Data Integrity** (2 hrs) |
| | 1. DB CHECK fix — validate FK constraints on delivery tables |
| | 2. Auth on mark route — verify staff owns the assignment |
| | 3. Webhook `AbortController` — cancel in-flight requests on unmount |
| | 4. Error classification — categorize GAS vs network vs app errors |
| | **B3b — Query & State** (2 hrs) |
| | 5. Query invalidation — ensure all mutations invalidate correct keys |
| | 6. Auto-advance timing — fix race between navigation and state update |
| | 7. GPS retry — retry failed GPS reads before marking |
| | 8. Single GPS watcher — deduplicate `watchPosition` calls |
| | **B3c — Queue & Offline** (2 hrs) |
| | 9. Mark idempotency — prevent duplicate submissions |
| | 10. Photo queue robustness — handle concurrent writes |
| | 11. IndexedDB cache — verify persistence across tab closure |
| | 12. Processing counts — accurate badge numbers |
| | **B3d — Security & Cleanup** (2 hrs) |
| | 13. Dead code cleanup — remove unused files |
| | 14. Target GPS server-side — validate coordinates server-side |
| | 15. Auth on 7 routes — add `requireRole()` to unprotected routes |
| | 16. Shared constants — consolidate magic strings |
| | 17. STALE_TIMES consistency — audit all hooks |
| | 18. RLS on delivery tables — enable row-level security |
| | 19. Multi-assignment fix — handle staff with multiple assignments |
| | 20. Force Complete button — admin override for stuck items |
| | 21. City validation bug — cross-city assignment blocks |
| | 22. Index on `created_at` — for sorting performance |

### Phase C — Admin Dashboard
| | |
|---|---|---|
| **Status** | 🔜 Partial |
| **Estimate** | 3 hrs (originally) |
| **Description** | `/stats` page daily delivery stats, staff performance tracking (notes + rating 1-5), Data Insight delivery KPIs. |
| **Done** | Delivery Quality RPC + Settings tab (2026-06-12). Failed Uploads card in staff stats (2026-06-11). Sidebar Dashboard admin-only gate fix. |
| **Remaining** | Staff performance notes/rating system. Data Insight delivery KPIs. |

### Phase D — Visual Rehaul
| | |
|---|---|---|
| **Status** | 🔜 Partial |
| **Estimate** | 4 hrs (originally) |
| **Description** | Staff mode route guard, mobile layout optimizations, desktop sidebar persistence, admin filter bar polish, theme system, touch target audit for mobile. |
| **Done** | D.1 Canvas renderer (preferCanvas). D.2 Supersede old photos. D.3 Queue state to Zustand. D.4 Dead code cleanup. D.5 CircleMarker swap, ShowAll backend, PulsingRing CSS. Touch targets bumped (2026-06-13). Single GPS watcher consolidated. |
| **Remaining** | Staff route guard. Desktop sidebar persistence. Admin filter bar polish. Theme system expansion. |

### Phase E — Flag Management UI
| | |
|---|---|---|
| **Status** | 🔜 Partial |
| **Estimate** | 4 hrs (originally) |
| **Description** | `/flagged-units` page with table of flagged PSIDs. Resolve, confirm, and note actions per flagged unit. "Flag for Review" button on HDS. Support for `staff_flagged` enrichment data. |
| **Done** | "Flag for Review" button in delivery sheet (2026-06-13). Posts to existing `/api/admin/flagged-psids` with `reason: 'staff_flagged'`. |
| **Remaining** | `/flagged-units` page. Resolve/confirm/note actions. |

### Phase F — Auto-Route Generation
| | |
|---|---|
| **Status** | ⏳ Not Started |
| **Estimate** | 3 hrs |
| **Description** | Generate consensus route from delivery history. Drag-reorder UI for route sequence. Write sorted sequence back to `survey_units.route_seq`. Integration with PDF bill printer for route-ordered printing. |

### Phase G — Live Admin Monitoring
| | |
|---|---|
| **Status** | ⏳ Not Started |
| **Estimate** | 3 hrs |
| **Description** | Staff Mode map layer on admin view. Staff breadcrumbs (polyline of GPS positions collected during delivery). Near-real-time polling (30s). Admin quick-view tooltip on staff marker. |

### Phase RBAC — Approval Chain
| | |
|---|---|
| **Status** | ⏳ Not Started |
| **Estimate** | 3 hrs |
| **Description** | Assignment draft → pending_approval → approved → active workflow. Approval queue UI for supervisors. Route protection per role. Audit log for status transitions. |

### Phase M1 — Map Unification
| | |
|---|---|
| **Status** | ⏳ Not Started |
| **Estimate** | 30 min |
| **Description** | Staff map shows survey data overlay alongside assignment items. Mirrors admin map behavior but restricted to staff's assigned city/UC. |

### Phase M2 — "Show All" Markers + Unit Counts per UC
| | |
|---|---|---|
| **Status** | 🔜 Partial |
| **Estimate** | 3 hrs (originally, remaining ~1.5 hrs) |
| **Description** | Marker cluster counts at city zoom level. "Show All" toggle to load full dataset. Unit count badges per UC in filter dropdown. Marker clustering for sparse zoom levels. |
| **Done** | `showAll` backend (batched fetch with MAP_PAGE_SIZE=50000, keepPreviousData, applyFilters refactor) — 2026-06-12 session. |
| **Remaining** | Marker clustering. Unit count badges in filter dropdown. Cluster toggle. |

### Phase M3 — Post-Enrichment JSON Marker Chunks
| | |
|---|---|
| **Status** | ⏳ Not Started |
| **Estimate** | 1.5 hrs |
| **Description** | During enrichment, export per-UC JSON files with marker data. Static file serving for map markers. Eliminates API query entirely for map view — reduces egress and latency. |

### Phase T1 — Transition & Zoom Uniformity
| | |
|---|---|
| **Status** | ⏳ Not Started |
| **Estimate** | 2 hrs (Session 1: 30 min — safe fixes. Session 2: 1.5 hrs — behavior changes) |
| **Description** | Fix inconsistent zoom levels and state resets during view/page transitions. Three risk-separated sessions per the transition audit in MASTER.md Section 32. |
| **Session 1 — Safe (30 min)** | |
| | 1. Persist `mapZoom` in zustand (survives page navigation) |
| | 2. HDS "Show on Map" flies to zoom 20 (was current store zoom) |
| | 3. SurveyList "Map" button flies to zoom 20 (was current store zoom) |
| **Session 2 — Behavior Changes (1.5 hrs)** | |
| | 4. Keep `selectedHouseId` across all view switches (stats/live no longer close HDS) |
| | 5. Default UC for staff browse mode (list page + map default to assignment UC) |
| | 6. Persist `filters` across page navigation |
| **Session 3 — Deferred (skip for now)** | |
| | 7. Unified map component (replace dual MapContainer with single + conditional markers) |

### Phase Z — App Audit Cleanup
| | |
|---|---|
| **Status** | ⏸️ Deferred |
| **Estimate** | 4 hrs |
| **Description** | Fix data correctness issues (H1-H3). Audit all query keys for proper invalidation. Normalize STALE_TIMES. Audit render performance (unnecessary re-renders). Push more filters to server-side. Dead code cleanup across entire app. Fix MapFollower jank on slow connections. |

---

## PHASE GROUP: Ingest Pipeline

### Phase 1 — Copy Reference Scripts from Office PC
| | |
|---|---|
| **Status** | ✅ Done |
| **Estimate** | 30 min |
| **Description** | Copied `bill-extractor-v4.py`, `pdf-psid-extractor.py`, `pdf-bill-printer.py`, `survey_filtered.py`, `generate_category_fallbacks.py` from office PC. |

### Phase 2 — Rewrite `enrich-survey-units.py`
| | |
|---|---|
| **Status** | ✅ Done |
| **Estimate** | 2 hrs |
| **Description** | 21-field upsert from lifecycle XLSX to `survey_units`. Flagging, diff report generation, reference table upsert, audit log writing, shared config module. |

### Phase 3 — Create `load-payments.py`
| | |
|---|---|
| **Status** | ✅ Done |
| **Estimate** | 1 hr |
| **Description** | Payment CSV → `payment_history` upsert with flagging, audit log, city geography mapping. |

### Phase 4 — Add city/tehsil/uc_name to `payment_history`
| | |
|---|---|
| **Status** | ✅ Done |
| **Estimate** | 30 min |
| **Description** | Already in DB via migration 023. Adds geography columns to payment data for per-city queries. |

### Phase 5 — Create `ingest-all.py` Orchestrator
| | |
|---|---|
| **Status** | ✅ Done |
| **Estimate** | 1 hr |
| **Description** | Interactive CLI menu with options for full monthly import, daily update, and quick sync. Sequential orchestration of sub-scripts, combined audit log, error handling, rollback support. |

### Phase 6 — Bill Metadata in HouseDetailSheet
| | |
|---|---|
| **Status** | ✅ Done |
| **Estimate** | 1.5 hrs |
| **Description** | Bill info API, bill count per UC, paid status indicators, PSID list in HDS. |

### Phase 2b — Drop `amount_due`
| | |
|---|---|
| **Status** | ✅ Done |
| **Estimate** | 30 min |
| **Description** | Remove `amount_due` column from `survey_units` (duplicated by `monthly_fee` + `arrears`). |

---

## PHASE GROUP: Notifications

### Phase P1 — Notification System
| | |
|---|---|
| **Status** | ✅ Done |
| **Estimate** | 4 hrs |
| **Description** | DB migration (not yet applied to production), types, 3 API routes, hooks for fetching/creating/dismissing notifications. |

### Phase P2 — Notifications Bell UI
| | |
|---|---|
| **Status** | ✅ Done |
| **Estimate** | 2 hrs |
| **Description** | Bell icon with unread badge. Mobile slide-down panel, desktop dropdown. Deep links to relevant pages on click. |

### Phase P3 — Staff Notification Form
| | |
|---|---|
| **Status** | ✅ Done |
| **Estimate** | 1 hr |
| **Description** | Admin form to send notifications to all staff or individual staff members. |

### Phase P4 — Users Tab UI Polish
| | |
|---|---|
| **Status** | ✅ Done |
| **Estimate** | 1 hr |
| **Description** | Chevron icons, city accent colors, typography cleanup, dropdown menu improvements. |

---

## PHASE GROUP: Architecture (R Series)

### R.1 — Security Guard
| | |
|---|---|
| **Status** | ✅ Done |
| **Estimate** | 15 min |
| **Description** | `server-only` import on `admin.ts` / `server.ts` — build-time guard against service_role key leaks to client bundle. |

### R.2 — Zod Validation Layer
| | |
|---|---|
| **Status** | ✅ Done |
| **Estimate** | 1 hr |
| **Description** | Zod schemas for API input validation. `validateQuery()` helper. Applied to 5 high-traffic routes. |

### R.3 — Repository Layer
| | |
|---|---|
| **Status** | ✅ Done |
| **Estimate** | 2 hrs |
| **Description** | 4 repository files extracting inline query logic from API routes: `survey-repository.ts`, `assignment-repository.ts`, notification repositories. |

### R.4 — Server Component Conversion
| | |
|---|---|
| **Status** | ✅ Done |
| **Estimate** | 2 hrs |
| **Description** | Read-heavy pages converted from Client Components to Server Components for reduced client JS and faster initial load. |

### R.5 — Middleware & Route Protection
| | |
|---|---|
| **Status** | ✅ Done |
| **Estimate** | 1 hr |
| **Description** | Session refresh on navigation, route protection based on role, redirect unauthenticated users. |

---

## PHASE GROUP: Audit Mitigation (Audit P Series)

### Audit P1 — Egress & Stability
| | |
|---|---|
| **Status** | 🔜 Partial |
| **Estimate** | 6 hrs |
| **Description** | Fix PSID pagination loop (H1), unbounded `assignment_items` fetch (H2), `staff/stats` fallback (H3). |
| **Sub-items** | |
| | H1: PSID pagination loop in payment filter — REPLACED with `is_paid` column on `survey_units`. No more per-session PSID fetch. Residual: `fetchAll()` in `survey-repository.ts` still runs for map markers when `showAll` or `pageSize > 1000`. Needs max-page guard or chunk-based approach. **Status: 🔜 Partial** |
| | H2: `assignment_items` fetch — resolved. `data-insight-repository.ts` no longer has an unbounded query. Uses paginated range queries. **Status: ✅ Done** |
| | H3: `staff/stats` fallback — `.limit(200)` added to `daily_assignments` fallback query. Graceful fallback when staff profile row missing (returns zero-filled data). **Status: ✅ Done** |

### Audit P2 — Authorization Hardening
| | |
|---|---|
| **Status** | ⏳ Not Started |
| **Estimate** | 4 hrs |
| **Description** | Add `requireRole()` guard on all 23 unprotected API routes. Write RLS policies for `delivery_photos`, `daily_assignments`, `assignment_items`. Ownership checks on staff-mutation endpoints. |
| **Sub-items** | |
| | 1. Audit all 23+ API routes for missing auth guards |
| | 2. Add `requireRole()` to unprotected routes |
| | 3. Enable RLS on delivery tables |
| | 4. Add ownership checks (staff can only modify own items) |

### Audit P3 — Input Validation
| | |
|---|---|
| **Status** | ⏳ Not Started |
| **Estimate** | 2 hrs |
| **Description** | Migrate remaining 18 routes to Zod validation. Add GPS range checks (±90 lat, ±180 lng). Text field caps. ILIKE sanitization. |

### Audit P4 — Debugging Velocity
| | |
|---|---|
| **Status** | ⏳ Not Started |
| **Estimate** | 6 hrs |
| **Description** | API documentation generation. Structured logger (pino or similar). ESLint rules for banned APIs (confirm, alert). Consolidate bottom sheets into shared components. |

### Audit P5 — Industry Standards
| | |
|---|---|
| **Status** | ⏸️ Deferred |
| **Estimate** | 10 hrs |
| **Description** | Vitest for unit tests. Playwright for E2E tests. GitHub Actions CI pipeline. Sentry for error tracking. Rate limiting on API routes. |

### Audit P6 — Egress Optimization
| | |
|---|---|
| **Status** | ⏳ Not Started |
| **Estimate** | 3 hrs |
| **Description** | HTTP cache headers on API responses. Vercel Edge Cache configuration. React Query → IndexedDB persistence layer. Service worker for offline API response caching. |

---

## PHASE GROUP: Sessions (Completed Work)

### 2026-06-02 — MASTER.md Overhaul (v19.0)
| | |
|---|---|
| **Status** | ✅ Done |
| **Description** | Full MASTER.md rewrite from scattered notes. Consolidated data model, 19 rules, API docs, workflow, edge case decisions. Session log format established. |

### 2026-06-05 — Phase A (Admin Assignments) + B.10+D
| | |
|---|---|
| **Status** | ✅ Done |
| **Description** | Assignment creation API + UI. Staff delivery: photo capture, GPS, offline queue, auto-advance after delivery. Map markers with status colors, progress bar, Drive images in HDS. |

### 2026-06-09 — Queue v2, Photos Supersede, GPS Fixes
| | |
|---|---|
| **Status** | ✅ Done |
| **Description** | IndexedDB queue v2 (retry, persist, sync). Photo superseding on re-delivery. GPS watcher deduplication. Billing month on assignments (migration 041). Error log section fix (nested button). Error swallowing fixed. |

### 2026-06-10 — Notification System + Users Tab + Assignments Fix
| | |
|---|---|
| **Status** | ✅ Done |
| **Description** | Full notification system (migration, types, routes, hooks, bell UI, staff form). Users tab polish. Assignments tab fix (Bhalwal leak, UC grouping, selectedCity→district conversion). |

### 2026-06-11 — Direct Browser-to-GAS Photo Upload
| | |
|---|---|
| **Status** | ✅ Done |
| **Description** | Direct browser→GAS upload (bypass SSR proxy, 85%→98% success). Failed uploads tab (staff read-only list, admin verify). DB unsynced fallback banner. Error log format cleanup. Staff sidebar: Dashboard made admin-only. Admin writes use `createAdminClient()`. Toast messages shortened. Error source pills simplified. `uploadToGAS()` accepts Blob directly. |

### 2026-06-12 (AM) — Phase C + D: Delivery Quality, Performance, Cleanup
| | |
|---|---|
| **Status** | ✅ Done |
| **Description** | Delivery Quality RPC + Settings tab (migration 042). GAS referer check. Error message propagation. Map performance (preferCanvas, updateWhenIdle). Supersede old photos (migration 043). Queue state to Zustand (shared across 5 consumers). Dead code cleanup. |

### 2026-06-12 (PM) — Phase D.5: CircleMarker Swap, MC ShowAll, PulsingRing CSS
| | |
|---|---|
| **Status** | ✅ Done |
| **Description** | Replaced DOM `<Marker>` + `L.divIcon` with Canvas `<CircleMarker>` across all 3 marker components. Deleted `markers.ts`. MC filter showAll with batched PostgREST fetch (fix 50-row map limit). CSS pulsing ring animation replaces rAF. keepPreviousData for smooth filter transitions. |

### 2026-06-13 — Staff Delivery Harden & Efficiency (8 Steps)
| | |
|---|---|---|
| **Status** | ✅ Done |
| **Description** | Settings fetch silent failure toast. Server error branch in `/deliver`. Double GPS watcher consolidation (sheet uses singleton `useUserLocation`). Dead `isDelivering` state removal from `useDeliverUnit`. "Flag for Review" button on HDS. Mobile touch targets (larger buttons, list items). Structured IndexedDB migration pattern. |

### 2026-06-14 — Context Handoff System + Proxy Rename
| | |
|---|---|
| **Status** | ✅ Done |
| **Description** | Renamed `src/middleware.ts` → `src/proxy.ts` (Next.js 16 convention). Narrowed proxy matcher to exclude `/api/*` (80% fewer invocations). Created `.opencode/context.json` (machine-readable handoff state). Created `docs/SESSION.md` (replaces session logs in MASTER.md). Restructured MASTER.md (session logs extracted). Corrected PHASES.md phase status discrepancies. |

### 2026-06-22 (Evening) — Performance & UI Polish (5 Phases)
| | |
|---|---|
| **Status** | ✅ Done |
| **Description** | **Phase 1 — Bugfixes**: dropdown z-index (filter-panel.tsx:631), sort icon right position, spinner layout shift, unused code cleanup. **Phase 2 — Polling reduction**: delivery trail 5s→60s, notifications 30s→120s. **Phase 2b — Admin-controllable polling settings**: live polling toggle + interval (10-300s), notifications polling toggle + interval (30-600s). Saved/loaded via `/api/settings` ↔ `app_settings` table. **Phase 3 — Context-aware refresh system**: created `src/lib/queries/refresh.ts` with `refreshCurrentPage(pathname, queryClient)`. Wired into AppHeader refresh button, FloatingActions hexagon Refresh button, and DesktopFilterBar `handleUpdate`. **Phase 4 — Settings restructure**: "Appearance" → "General" tab, Account merged into General as sub-card, separate Account tab removed. |

### 2026-06-22 (Late) — Steps 1-3: Button Consistency, Spinner Fix, Data Usage
| | |
|---|---|
| **Status** | ✅ Done |
| **Description** | **Step 1 — Desktop button consistency**: satellite toggle `h-8 w-8` → `h-9 w-9`, refresh `h-8 w-8` → `h-9 w-9` + added `border border-border`. **Step 2 — Refresh spinner timing bug fixed**: added `refreshTriggeredRef` + `wasFetchingRef` in AppHeader.tsx and filter-panel.tsx to track real fetch cycle completion. **Step 3 — Data Usage card moved**: from Delivery tab → General tab (3rd card, 3-column grid). Separate `handleSaveDataUsage()`, `hasDataUsageChanges`, own Save button. Loading `useEffect` fires for both `'delivery'` and `'general'`. Non-admins see read-only summary. |

### 2026-06-22 (Late) — H3 fix: Staff Stats Fallback Limit
| | |
|---|---|
| **Status** | ✅ Done |
| **Description** | Added `.limit(200)` to fallback `daily_assignments` query in `src/app/api/staff/stats/route.ts:36` — prevents silent truncation, URL length crash, and blocked stats when `staff_daily_stats` trigger table is empty. |

---

## PHASE GROUP: Remaining Correction Items (from Night Audit, Section 28.10)

| # | Priority | Item | Est. | Status |
|---|----------|------|------|--------|
| 1 | P0 | **Add `bill_month` to `daily_assignments`** | 2 hrs | ✅ Done (migration 041, 2026-06-09) |
| 2 | P1 | **`haversine()` NaN guard** | 10 min | ✅ Done (verified already guarded in B3) |
| 3 | P1 | **`incrementRetry` race condition** | 30 min | ⏳ Not Started (low risk — sequential await chain protects it) |
| 4 | P1 | **IndexedDB v3→v4 index upgrade** | 15 min | ✅ Done (2026-06-13 — structured migration pattern added) |
| 5 | P2 | **Toast on offline queue fallback** | 15 min | ✅ Partial (2026-06-13 — toast added on settings fetch failure) |
| 6 | P2 | **Referer check on GAS webhook** | 5 min | ✅ Done (2026-06-12 AM) |
| 7 | P2 | **Delivery Quality RPC + Settings tab** | 2 hrs | ✅ Done (migration 042, 2026-06-12 AM) |
| 8 | P3 | **Supersede old `delivery_photos` on redelivery** | 30 min | ✅ Done (migration 043, 2026-06-12 AM) |
| 9 | P3 | **Move queue state to Zustand** | 1 hr | ✅ Done (2026-06-12 AM) |
| 10 | P3 | **Dead code cleanup** | 15 min | ✅ Done (2026-06-12 AM) |
| 11 | P3 | **Orphaned PSID cleanup** | 2 hrs across cycles | ✅ Done (hook, API, UI, enrich script — verified 2026-06-12 audit) |

---

## PHASE GROUP: Unapplied Migrations

| Migration | File | Status | Action Needed |
|-----------|------|--------|---------------|
| 036 | `scripts/sql/036-test-mc-data.sql` | ⏳ Not Applied | Test data for MC filtering (separate from 036-index-created-at which was applied) |
| 037 | `scripts/sql/037-notifications.sql` | ⏳ Not Applied | Notifications schema |
| 038 | `scripts/sql/038-unsent-mode-setting.sql` | ⏳ Not Applied | "Always Unsent" mode setting |

---

## Appendix: MASTER.md Audit Gaps (Discovered 2026-06-12)

> **Origin**: Comprehensive audit of `docs/MASTER.md` Sections 10, 16, 23, 25, 26, 28.10. These items were mentioned or implied in MASTER.md but were never captured as formal phases in this document. They are separate from the structured Section 10 phases listed above.
>
> **Status legend**: ✅ Done (implemented) · ⏳ Not Started (queued) · ⏸️ Deferred (no timeline) · ⚠️ Gap (acknowledged but not formally planned)

### A. Pipeline & Deployment Gaps

**A1 — Deploy Office PC Pipeline**
| | |
|---|---|
| **Status** | ⏳ Not Started |
| **Estimate** | 1 hr |
| **Source** | MASTER.md S10:1168 (Phase 25) |
| **Description** | `ingest-all.py` exists but has never been deployed or tested on the Office PC. No deploy documentation, no Office PC setup guide, no config sharing mechanism, no procedure for copying updated scripts to the Office PC. Last step before the pipeline is operational. |

**A2 — Pipeline Wrapper Scripts (P.1-P.3)**
| | |
|---|---|
| **Status** | ⏳ Not Started |
| **Estimate** | ~4 hrs total |
| **Source** | MASTER.md S16.10.4:1514-1547 |
| **Description** | Three standalone wrapper scripts that go beyond the existing orchestrator: |
| | **P.1** `scripts/ingest-payments.py` — Standalone payment CSV ingestion with `--upload` flag to hit API endpoint |
| | **P.2** `scripts/ingest-lifecycle.py` — Standalone lifecycle XLSX enrichment with `--exclude-ghosts` flag |
| | **P.3** `scripts/export-bill-mapping.py` — Reads PDF print mapping from pdf-bill-printer.py, creates `bill_print_log` linking PSID→survey_id→PDF page number→print batch |

**A3 — App-Controlled Pipeline API**
| | |
|---|---|
| **Status** | ⏳ Not Started |
| **Estimate** | Future phase |
| **Source** | MASTER.md S16.10.5:1548-1558 |
| **Description** | Four API endpoints on the Next.js server to remotely trigger Office PC scripts: |
| | `POST /api/ingest/payments` — triggers payment ingestion |
| | `POST /api/ingest/lifecycle` — triggers lifecycle enrichment |
| | `GET /api/ingest/status` — returns result report |
| | `GET /api/export/ghosts` — exports flagged PSIDs |

**A4 — Update Office PC `bill-extractor-v4.py` to Write City/Tehsil**
| | |
|---|---|
| **Status** | ⏳ Not Started (Office PC side only) |
| **Estimate** | 30 min |
| **Source** | MASTER.md S16.9.6:1448 (DQ.2), S16:2357 |
| **Description** | The reference copy in `scripts/ref/` already has City/District/Tehsil CSV output columns. The `load-payments.py` already reads those columns. The DB columns exist (migration 023). **Remaining**: update the actual `bill-extractor-v4.py` running on the Office PC to include these columns in its output. |

**A5 — Import `pdf-bill-printer` Mapping JSON to DB (DQ.8)**
| | |
|---|---|
| **Status** | ⏳ Not Started |
| **Estimate** | 1 hr |
| **Source** | MASTER.md S16.9.6:1454 |
| **Description** | The `bill_print_log` table exists (migration 027). The `pdf-bill-printer.py` generates a mapping JSON (PSID → survey_id → PDF page number). **Remaining**: create an import script that reads the printer JSON and populates `bill_print_log`. Proposed as P.3 above. |

**A6 — HouseDetailSheet: Show Bill Print Metadata (DQ.9)**
| | |
|---|---|
| **Status** | ⏳ Not Started (depends on A5) |
| **Estimate** | 1 hr |
| **Source** | MASTER.md S16.9.6:1455 |
| **Description** | After A5 is done, update HDS to display bill print metadata per PSID (batch name, page number, print date). |

### B. Database Gaps

**B1 — Add `updated_at` to `payment_history`**
| | |
|---|---|
| **Status** | ⏳ Not Started |
| **Estimate** | 5 min |
| **Source** | MASTER.md S16:2358 (DB Gap #10) |
| **Description** | `payment_history` has `created_at` but no `updated_at`. Every other main table has `updated_at` with a trigger. Add column + trigger. |

### C. Code Quality Gaps

**C1 — Fix `/api/log` Error Swallowing in `global-error-logger.tsx`**
| | |
|---|---|
| **Status** | ⏳ Not Started |
| **Estimate** | 10 min |
| **Source** | MASTER.md S28.10:5560 |
| **Description** | `use-photo-queue.ts` was fixed but `src/components/providers/global-error-logger.tsx` still has **2 instances** of silent `.catch(() => {})` for `/api/log` fetches (lines 21 and 37 — window.onerror and unhandled promise rejection handlers). |

**C2 — GPS Thresholds: Verify on Mobile**
| | |
|---|---|
| **Status** | ⏳ Not Started |
| **Estimate** | Info — testing |
| **Source** | MASTER.md S25:5003 |
| **Description** | GPS proximity thresholds (10m for green, 50m for processing, Infinity for missed) are defined in the delivery workflow but have never been tested on actual mobile GPS hardware. Must verify all three thresholds produce correct behavior on real devices. |

**C3 — GPS Battery Optimization**
| | |
|---|---|
| **Status** | ⏸️ Deferred |
| **Estimate** | Unknown |
| **Source** | MASTER.md S19.13:3650, S25:5004 |
| **Description** | Current `useUserLocation` uses `enableHighAccuracy: true` by default (GPS chip on continuously). Proposed: default to `enableHighAccuracy: false` (Wi-Fi/cell), switch to high accuracy only when delivery sheet opens for distance calculation. |

**C4 — Merge Two IndexedDB Unsent Queues**
| | |
|---|---|
| **Status** | ⏸️ Deferred (merge not needed — only one queue exists) |
| **Estimate** | N/A |
| **Source** | MASTER.md S26.7:4793, S26.9:4824 |
| **Description** | Audit found only **one** IndexedDB queue (`billing-saas-photo-queue` / `photo_queue` store). All 7 consumers share it. No second queue was ever built. The item is effectively resolved — no action needed. |

### D. Industry / Feature Gaps

**D1 — Realtime Admin Visibility (WebSocket)**
| | |
|---|---|
| **Status** | ⚠️ Gap (not formally planned) |
| **Source** | MASTER.md S23.4:4242 |
| **Description** | All "realtime" behavior uses HTTP polling (30s intervals). No Supabase Realtime subscriptions, no WebSocket connections, no Pusher integration. Phase G proposes polling-based live monitoring (every 10s), not true realtime. Industry standard uses WebSockets for live staff tracking. |

**D2 — Photo Anti-Tamper (EXIF Verification / Hash Chain)**
| | |
|---|---|
| **Status** | ⚠️ Gap (not formally planned) |
| **Source** | MASTER.md S23.4:4243 |
| **Description** | Staff could upload any old photo — no EXIF timestamp verification, no photo hash chain, no content integrity check. Photos submitted during delivery are not cryptographically bound to the delivery event. |

**D3 — Customer Signature Capture**
| | |
|---|---|
| **Status** | ⚠️ Gap (not formally planned) |
| **Source** | MASTER.md S23.4:4245 |
| **Description** | Bill delivery in Pakistan Post context often requires customer signature as proof. Current app only has GPS + photo. No signature pad or capture component exists. |

**D4 — PWA Service Worker + Manifest**
| | |
|---|---|
| **Status** | ⚠️ Gap (not formally planned) |
| **Source** | MASTER.md S23.4:4247 |
| **Description** | No `manifest.json`, no `sw.js`, no PWA config in `next.config.ts`. App is not installable on mobile home screen. Audit P6 mentions service worker for caching but does not cover full PWA (manifest, standalone mode, install prompt). |

**D5 — Cut Admin Bloat 30-40%**
| | |
|---|---|
| **Status** | ⚠️ Gap (not formally planned) |
| **Estimate** | 2-3 days |
| **Source** | MASTER.md S23.9:4327 |
| **Description** | Simplify Data Insight, Dashboard, Filter Panel, Settings. The Settings page is 991 lines with 8 tabs, FilterPanel is 640 lines, Dashboard is 225 lines. Acknowledged as overbuilt for a 3-city, 70-staff operation. No reduction pass has been performed (sidebar cleanup was the only step). |

**D6 — Field Flag Button + Daily Staff Summary**
| | |
|---|---|
| **Status** | ✅ Partial (2026-06-13 — flag button added to HDS) |
| **Estimate** | 1-2 days |
| **Source** | MASTER.md S23.9:4328 |
| **Description** | "Flag for Review" button now exists in the staff delivery sheet (Step 5). Posts to existing `/api/admin/flagged-psids` with `reason: 'staff_flagged'`. **Remaining**: staff-facing daily summary page/section. |

**D7 — Consolidate Two Google Drive Accounts**
| | |
|---|---|
| **Status** | ⏳ Partial |
| **Estimate** | Unknown |
| **Source** | MASTER.md S22.8:4171-4175 |
| **Description** | The webhook URLs are consolidated (same Apps Script URL used by both old routing station and new app). **Remaining**: migrate legacy photos from old Drive folder structure to match current app's upload key convention. |

### E. Resolved (Found Done During Audit)

**E1 — Orphaned PSID Cleanup**
| | |
|---|---|
| **Status** | ✅ Done |
| **Source** | MASTER.md S16.9.2:1363-1378 |
| **Description** | Fully implemented across: `use-orphan-psids.ts` hook, `GET /api/orphan-psids` route, `OrphanPsidTable` component, Dashboard "Orphans" tab, `flagged-psids-repository.ts` with `psid_duplicate_orphan` handling, `data-insight-repository.ts` orphan filter, HDS orphan flag display, `enrich-survey-units.py` with `--exclude-ghosts` flag, and photo queue orphan detection for 403/404 GAS responses. |

**E2 — Stale GPS Dots Doc in MASTER.md**
| | |
|---|---|
| **Status** | ✅ Partial (narrative fixed, tracking tables stale) |
| **Source** | MASTER.md S25:5005, S26.7:4797 |
| **Description** | Part 12 narrative (line 3620) was corrected to say "GPS dots use local `gpsAccuracy` state". Two tracking tables (Sections 25, 26) still list it as a stale entry. The tracking table entries should be removed. |

---

## Execution Priority Order (Next Up)

### Primary Phases — From MASTER.md Section 10

| Priority | Phase | Est. | Why | Status |
|----------|-------|------|-----|--------|
| — | **B3** (Delivery Stability) | 8 hrs | ✅ Done |
| — | **Nav Button Dimming** (staffMode) | 15 min | ✅ Done |
| — | **T1** (Transition & Zoom Uniformity) — Session 1 | 30 min | Persist mapZoom, HDS/List fly-to zoom 20 | ⏳ |
| 1 | **0e** (Stabilize & Clean) | 2 hrs | Fix payment filter pagination bug (maps showing wrong paid/unpaid data) | ⏳ |
| 2 | **0d** (Reference Tables) | 1.5 hrs | Performance: fix 212K-row filter queries | ⏳ |
| 3 | **T1 Session 2** (Transition behavior) | 1.5 hrs | selectedHouseId persistence, default UC, filter persistence | ⏳ |
| 4 | **M2** (Show All + Counts) | ~1.5 hrs | Backend done; clustering, badges, toggle remaining | 🔜 |
| 5 | **M1** (Map Unification) | 30 min | Quick win — staff sees overlay data | ⏳ |
| 6 | **Phase E** (Flag Management) | ~3 hrs | Flag button done; `/flagged-units` page remaining | 🔜 |
| 7 | **M3** (JSON Marker Chunks) | 1.5 hrs | Egress optimization for map data | ⏳ |
| 8 | **0f** (Schema Restructuring — superseded) | 6 hrs | Most steps done via prior migrations | ✅ done (prior work) |
| 9 | **Phase C** (Admin Dashboard) | ~1 hr remaining | Quality tab + stats done; perf notes/ratings remaining | 🔜 |
| 10 | **Phase D** (Visual Rehaul) | ~1 hr remaining | Canvas, supersede, Zustand, CircleMarker done; route guard + sidebar persistence + theme remaining | 🔜 |
| 11 | **Phase F** (Auto-Route) | 3 hrs | Route optimization | ⏳ |
| 12 | **Phase G.1** (Live Monitoring — Delivery Trail) | ~3 hrs | Phase 1 done (delivery trail dots, panel, UC cards, staff list, activity feed). Phase 2 (staff positions) pending. | 🔜 Partial |
| 13 | **Phase RBAC** (Approval Chain) | 3 hrs | Access control | ⏳ |
| 14 | **Phase Z** (App Audit Cleanup) | 4 hrs | Deep cleanup | ⏸️ |
| 15 | **Audit P1** (Egress & Stability) | 6 hrs | H2/H3 fixed, H1 residual (is_paid column, fetchAll still used) | 🔜 Partial |
| 16 | **Audit P2-P6** | 19 hrs | Production hardening | ⏸️ |

### Appendix Gaps — Quick Fixes (from Appendix above)

| Priority | Item | Est. | Why |
|----------|------|------|-----|
| 1 | **C1** — Fix `/api/log` error swallowing | 10 min | Easy fix, prevents silent error loss in global-error-logger |
| 2 | **B1** — Add `updated_at` to `payment_history` | 5 min | 5-min migration |
| 3 | **A5** — Import printer JSON to DB (DQ.8) | 1 hr | Unlocks HDS print metadata (A6) |
| 4 | **A6** — HDS bill print metadata (DQ.9) | 1 hr | Visible UX improvement — shows print batch info per PSID |
| 5 | **A4** — Update Office PC bill-extractor (city/tehsil) | 30 min | Closes the geography gap between Office PC and DB |
| 6 | **A1** — Deploy Office PC pipeline | 1 hr | Last step before pipeline goes live |
| 7 | **D6** — Field flag button + daily summary | remaining: ~1 day | ✅ Button done (Step 5). Staff daily summary page remaining. |
| 8 | **D5** — Cut admin bloat | 2-3 days | Simplify overbuilt admin features |
| 9 | **A2** — Pipeline wrapper scripts (P.1-P.3) | ~4 hrs | Enhances pipeline flexibility |
| 10 | **C3** — GPS battery optimization | Deferred | Low urgency |
| 11 | **A3** — App-Controlled Pipeline API | Future | Depends on A2 being done |

---

## Quick Stats

| Metric | Count |
|--------|-------|
| **Total phases** | 48 |
| **✅ Completed** | 33 |
| **🔜 In Progress (partial)** | 5 (C, D, E, M2, Audit P1) |
| **⏳ Not Started** | 9 (T1, 0d, 0e, M1, M3, F, G, RBAC) |
| **⏸️ Deferred** | 3 (Z, Audit P5, C3 GPS) |
| **Completed work estimate** | ~48 hrs |
| **Remaining work estimate (Section 10 phases only)** | ~37 hrs |
| **Appendix Gaps (A-D): ⏳ Not Started** | 9 items |
| **Appendix Gaps (A-D): ⏸️ Deferred** | 2 items |
| **Appendix Gaps (A-D): ⚠️ Unplanned Gap** | 6 items |
| **Appendix Gaps (A-D): ✅ Partial/Resolved** | 2 items |
| **Appendix Gaps (E): ✅ Done** | 1 item |
| **Unapplied SQL migrations** | 3 |

---

## Testing Verification — All Phases

> Follow this protocol at home after each deployment or major change. Organised by feature area. Each section is independent — test only what changed.

### 1. Auth & Login

| Test | Steps | Expected |
|------|-------|----------|
| Staff login (username) | Open `/login`, enter `abdul_rehman`, enter password → tap Sign in | Redirected to `/deliver` (not `/map`). No "Account is frozen" message. |
| Admin login (email) | Open `/login`, enter `kashifkhalil74@gmail.com`, enter password → tap Sign in | Redirected to `/map`. Sidebar shows all admin links. |
| Wrong password | Enter wrong password for any user | Red error toast: "Invalid login credentials" |
| Frozen account | Ask admin to freeze a staff account, then try logging in as that staff | Redirected to `/login` with "Account is frozen. Contact your admin." |
| Username vs email | Try both `abdul_rehman` and `abdul_rehman@billing.local` | Both work for field_staff (app transforms username → username@billing.local) |
| Suspended/deleted user | Ask admin to delete a user, then try logging in | "Invalid login credentials" (auth.users row deleted) |

### 2. Admin — Map View

| Test | Steps | Expected |
|------|-------|----------|
| Map loads | Open `/map` | Map centered on selected city. Markers visible. No blank map. |
| Marker type | DevTools → Elements → Ctrl+F `canvas` | Single `<canvas>` element. Zero `<div class="leaflet-marker-icon">`. (Canvas rendering) |
| Pulsing ring | Click a marker on the map | White expanding ring appears, visible on both street and satellite tiles |
| Markers from MC filter | Select one MC/UC → Apply | Network tab: `GET /api/surveys?uc=MC_NAME&pageSize=50000`. All MC markers visible. |
| Clear MC filter | Tap Clear button | Network tab: `pageSize=50`. Only 50 markers visible (city-wide default). |
| Switch MCs | Select MC-1 → Apply → select MC-2 → Apply | Old markers stay visible during load (no blank flash). New markers replace them. |
| Satellite tiles | Tap Layers button → Satellite Hybrid | Map switches to satellite tiles. Markers and pulsing ring still visible. |
| House Detail Sheet | Click a marker | Bottom sheet with consumer name, address, amount, UC. Right chevron → view full details. |

### 3. Admin — Filter Bar

| Test | Steps | Expected |
|------|-------|----------|
| City switcher | Click city avatar (Sargodha/Khushab/Bhalwal) | Map flies to that city. UC filter clears. UC dropdown shows only that city's UCs. |
| Desktop filters | On desktop, expand filter chips | Inline chips for Tehsil, MC/UC, Month, Surveyor, Status. Mobile: bottom sheet accordions. |
| Month filter | Select a specific month | Map/data restricted to that month's data. |
| Apply/Cancel | Mobile flow: change pending filter → see Apply/Cancel buttons | Apply calls API. Cancel reverts to previous filter state. |

### 4. Admin — Data Insight

| Test | Steps | Expected |
|------|-------|----------|
| KPI cards | Open Data Insight view (sidebar) | KPI grid loads with totals. Tehsil drill-down works. |
| Drill-down | Click a row → expand tehsil → see UC rows | Nested table expands inline. Shows per-UC counts. |
| Month selector | Change month | All KPIs update. No zeros in tehsil/UC/category stats. |
| Error state | Disconnect network, switch view | Shows error message from server, not generic "Failed to fetch". |

### 5. Admin — Assignments

| Test | Steps | Expected |
|------|-------|----------|
| Manage tab | Open `/assignments` → Manage tab | UC list with totals for each UC. Pending/delivered/processing counts. |
| Create assignment | Click a UC → pick staff → enter count → Create | Assignment created. Staff can now see it in `/deliver`. |
| Routes tab | Open Routes tab | Routes grouped by city → UC → route name. Unit counts shown. |
| City filter | Switch city in CitySwitcher | Manage tab UC list scoped to that city's UCs. Routes tab also scoped. |
| Cross-city block | Assign staff from Bhalwal to a Sargodha UC | Server blocks: validation error toast. |

### 6. Staff — `/deliver` Page

| Test | Steps | Expected |
|------|-------|----------|
| Assignment loads | Open `/deliver` | Shows today's assignment list with progress bar. Items grouped by UC. |
| Progess bar | After some deliveries | "X of Y delivered" with percentage. Green bar fills proportionally. |
| Filter tabs | Tap Pending / Issues / Delivered / All | List filters accordingly. Count badges update. |
| UC dropdown | Tap All UCs → select a specific UC | List scoped to that UC. Pagination appears (50/page). |
| Offline banner | Disconnect network | Amber "Offline" banner appears. Cached assignment shown. |
| Server error | Disconnect network → clear cache → reload | "Server error — tap to retry" with retry button (not "No assignment for today"). |
| Server error + cache | Have cache, then disconnect | "Server error — showing cached data" red banner. Cached list shown. |
| List item tap target | Tap a list item → must be easy with thumb | Button height is 48px (py-3). Easy tap. |
| All caught up | Deliver or mark all items | Green checkmark: "All caught up!" |
| No assignment | If admin hasn't assigned anything today | "No assignment for today" message. |
| Photo queue badge | Take photo offline → see badge | Amber bar shows "X photos waiting to sync". Sync button. |
| Processing bar | Tap Sync while photos uploading | Shows "Syncing 3/5 (1.2 MB) — 450 KB/s". |

### 7. Staff — Delivery Sheet (HDS)

| Test | Steps | Expected |
|------|-------|----------|
| Sheet opens | Tap a list item or map marker | Full-bleed bottom sheet with hero image (or dark gradient fallback). Close button top-left. Survey ID badge top-right. |
| Consumer info | Sheet visible | Name, address, UC, amount displayed over gradient overlay. |
| Main button | IDLE state | "Take Picture & Deliver" button. If previously delivered: "Redeliver". |
| GPS distance | Sheet opens with GPS fix | Shows "45m away" in green (≤50m), amber (≤200m), or white (>200m). Dots show accuracy level. |
| GPS unavailable | Deny location permission | "GPS unavailable — proceed manually" (not stuck on "Locating...") |
| One GPS watcher | Open browser DevTools → check Sensor panel | Only ONE active GPS watcher (no duplicate from sheet + map). |
| Photo capture | Tap "Take Picture" → capture photo | Photo queue appears. Delivery marked. Green "Delivered (45m away)" overlay or amber "Out of range — Awaiting Review". |
| Auto-advance | After delivered (green) | Auto-advances to next item after 2s. If processing: 3.5s. |
| Photo not working | Admin enables no-photo mode → button appears | "Photo not working? Tap to deliver without photo" button. Taller: 36px (h-9). |
| Skip photo | Tap "Photo not working?" → confirm → skip | Delivered without photo. Toast shows result. GPS still recorded. |
| Flag for Review | Tap "Flag for Review" button | Confirm dialog: "Mark PSID X as needing review?" Confirm → POST to `/api/admin/flagged-psids` → Toast "Flagged for review". |
| Touch nav | Swipe left/right on hero image | Moves to next/prev item (if available). Nav arrows also visible. |
| Details button | Tap "Details" chevron | Opens full HouseDetailSheet with all photos, payment history, bill info. |
| Delivered overlay | Status is 'delivered' | Green checkmark + distance badge + GPS coords overlay covers hero. |
| Processing overlay | GPS out of range | Amber "Processing" overlay. "Out of range — Awaiting Review". Force Complete button for admins. |
| Force Complete (admin) | Admin opens a processing item | "Force Complete (admin)" button visible. Tap → confirm → marks as delivered bypassing GPS. |
| Redeliver | Tap on already-delivered item | Button says "Redeliver". Creates new delivery_photo. Old photo marked superseded. |
| Settings fetch fails | Block `/api/settings` in DevTools | Orange toast: "Could not load settings — some features may be unavailable". No-photo button hidden gracefully. |

### 8. Staff — Photo Queue & Offline

| Test | Steps | Expected |
|------|-------|----------|
| Photo queue | Take photo online → auto-syncs | Toast shows upload progress → success. No entry in queue. |
| Offline photo | Go offline → take photo | Photo queued in IndexedDB. Queue badge shows count. |
| Auto-sync on online | Go back online | Queue processes automatically. Photos uploaded. |
| Manual sync | With `unsent_mode` enabled, take photo offline | Queue badge shows count. "Sync" button visible. Tap → queue processes. |
| Photo retry | Upload fails → retries 3 times (1s, 3s, 10s delays) | After 3 failures: photo stays in queue with `lastError`. Red error text shown on unsent modal. |
| Orphan detection | Assignment revoked while photo in queue | On sync: photo removed from queue. Toast: "Photo for PSID skipped — assignment was revoked". |
| DB unsynced fallback | Clear IndexedDB while photos exist in DB | Red banner: "X photos stuck in database — queue was cleared". |
| Unsent modal | Open Settings → Failed Uploads | Shows failed photos with per-photo error text in red. Retry or Remove buttons. |

### 9. Settings Page

| Test | Steps | Expected |
|------|-------|----------|
| Users tab (admin) | Settings → Users tab | Table of all users. Search, filter by role. Role badges. City accent colors. |
| Create user (admin) | Tap Add User → fill form → Create | User created. Row appears in table. Staff auto-syncs to staff table. |
| Freeze user (admin) | Freeze a staff account | Login blocked for that user. "Account is frozen" shown. |
| Delete/restore (admin) | Delete a user → check list → Restore | User soft-deleted (deleted_at set). Restore unsets it. |
| Delivery Quality tab (admin) | Settings → Administration → Delivery Quality | Month selector, sortable table, quality score badges (green/amber/red). |
| Staff daily summary | (Future) Staff opens Settings | Sees their own delivery stats for today. |
| Error log (admin) | Settings → Error Log | Table of logged errors with source pills, timestamps, expandable details. Format: `[SOURCE] message`. |

### 10. Notifications

| Test | Steps | Expected |
|------|-------|----------|
| Bell icon | Any page | Bell icon in header with unread badge count. |
| Notification panel | Tap bell | Desktop: dropdown. Mobile: bottom sheet. Shows notification list with timestamps. Admin summary at top. |
| Mark as read | Tap a notification | Slide-out animation. Badge count decreases. |
| Mark all read | Tap "Mark all as read" | Clear all. Badge disappears. |
| Send notification (admin) | Settings → Users → Notification Form → select recipient → send | Staff receives notification. Bell badge appears. |

### 11. Flag Management (Admin)

| Test | Steps | Expected |
|------|-------|----------|
| Flag list | Open `/flagged-units` | Table of flagged PSIDs with reason, flagged_by, flagged_at. Filterable by reason, city, date range. |
| Resolve flag | Tap Resolve → confirm | Row marked with `resolved_at`. Disappears from unresolved filter. |
| Update notes | Tap Edit → change notes | Notes updated. |
| Stats | Tab toggles to flagged stats | Counts by reason type. Pipeline-automated vs staff-flagged breakdown. |

### 12. Mobile — Touch & Layout

| Test | Steps | Expected |
|------|-------|----------|
| Touch targets (sheet) | All sheet buttons | Minimum 36px height. Primary "Take Picture" button: 44px. |
| Touch targets (list) | List items | 48px tap target (`py-3`). Easy to tap with thumb. |
| Safe area padding | Open sheet on notched phone | Content avoids notch/home indicator (`pb-6`). |
| Bottom tabs (staff) | `/deliver` page | Bottom tab nav visible on mobile. Map/List tabs. |
| Bottom sheet max height | Sheet open | `max-h-[80vh]`. Not covering full screen. Scrollable if content long. |

### 13. Database & Migrations

| Test | Steps | Expected |
|------|-------|----------|
| Migration applied check | `npx supabase db query --linked "SELECT version FROM supabase_migrations.schema_migrations ORDER BY version DESC LIMIT 5;"` | All expected migrations present (036, 042, 043). No failed entries. |
| Processing status | `SELECT DISTINCT status FROM assignment_items;` | Includes `'processing'` (not just pending/delivered/missed/skipped). |
| Delivery photos supersede | `SELECT COUNT(*) FROM delivery_photos WHERE superseded_at IS NOT NULL;` | Non-zero if redeliveries happened. |
| Staff stats trigger | Deliver an item → `SELECT * FROM staff_daily_stats WHERE staff_id = X AND assigned_date = CURRENT_DATE` | Counts updated: total_assigned, delivered, processing. |
| Index present | `SELECT indexname FROM pg_indexes WHERE tablename = 'daily_assignments' AND indexname = 'idx_daily_assignments_created';` | Index exists. |

### 14. Edge Cases

| Test | Steps | Expected |
|------|-------|----------|
| Double-tap mark | Rapidly tap "Take Picture" twice | Only one delivery marked. Duplicate prevented by 2s dedup window on server. |
| Null GPS coords | GPS returns null → deliver | Delivery created with `gps_lat = null, gps_lng = null`. Status: 'processing'. Toast: "GPS out of range — sent for review". |
| Tab hidden during upload | Switch tabs while photo uploading | Upload continues (AbortController not triggered by tab switch). |
| Large assignment (2000+) | Admin creates large assignment | List paginated (50/page). Offline cache handles IndexedDB (not localStorage — no 5MB cap). |
| Cross-device login | Login same staff on two devices | Both devices show same assignment. Deliveries sync via server (cache may lag). |
| Empty UC | Select UC with zero active bills | "No items in this view" or "All caught up!" |
| Null consumer name | Bill with missing name | Shows "Unknown" in list + sheet. No crash. |
| Null survey_id | Bill with no survey_id | Uses `psid` for display. Keyed by `item.id` in lists (stable). |
| Concurrent queue processing | Two tabs both trying to process queue | `processingRef` guard prevents double-processing. Second caller is no-op. |
