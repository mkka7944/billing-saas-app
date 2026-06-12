# Billing SaaS App — Complete Phase Reference

> **Source of truth**: `docs/MASTER.md` Sections 10, 25, 28.10, Appendix C.
> **Last updated**: 2026-06-12

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
|---|---|
| **Status** | ⏳ Not Started |
| **Estimate** | 1.5 hrs |
| **Description** | Create `hierarchy`, `surveyors`, `bill_months` reference tables for filter dropdowns so we never query 212K-row `survey_units` just to populate filter options. Update APIs to use these tables. Delete 6 dead service files. |
| **Sub-items** | |
| | 1. Create reference tables via migration |
| | 2. Populate from `survey_units` via trigger |
| | 3. Update filter dropdown API endpoints to query reference tables |
| | 4. Delete dead services: `finance-service.ts`, `retention-service.ts`, `recovery-service.ts`, `hierarchy-service.ts`, `survey-service.ts`, `route-service.ts` |

### Phase 0e — Stabilize & Clean
| | |
|---|---|
| **Status** | ⏳ Not Started |
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
| **Status** | ⏳ Not Started |
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
|---|---|
| **Status** | ⏳ Not Started |
| **Estimate** | 3 hrs |
| **Description** | `/stats` page daily delivery stats, staff performance tracking (notes + rating 1-5), Data Insight delivery KPIs. |

### Phase D — Visual Rehaul
| | |
|---|---|
| **Status** | ⏳ Not Started |
| **Estimate** | 4 hrs |
| **Description** | Staff mode route guard, mobile layout optimizations, desktop sidebar persistence, admin filter bar polish, theme system, touch target audit for mobile. |

### Phase E — Flag Management UI
| | |
|---|---|
| **Status** | ⏳ Not Started |
| **Estimate** | 4 hrs |
| **Description** | `/flagged-units` page with table of flagged PSIDs. Resolve, confirm, and note actions per flagged unit. "Flag for Review" button on HDS. Support for `staff_flagged` enrichment data. |

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
|---|---|
| **Status** | ⏳ Not Started |
| **Estimate** | 3 hrs |
| **Description** | Marker cluster counts at city zoom level. "Show All" toggle to load full dataset. Unit count badges per UC in filter dropdown. Marker clustering for sparse zoom levels. |
| **Note** | The `showAll` backend (batched fetch for map) was implemented in 2026-06-12 session. This phase now covers: marker clustering, unit counts in UI, and cluster toggle. |

### Phase M3 — Post-Enrichment JSON Marker Chunks
| | |
|---|---|
| **Status** | ⏳ Not Started |
| **Estimate** | 1.5 hrs |
| **Description** | During enrichment, export per-UC JSON files with marker data. Static file serving for map markers. Eliminates API query entirely for map view — reduces egress and latency. |

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
| **Status** | ⏳ Not Started |
| **Estimate** | 6 hrs |
| **Description** | Fix PSID pagination loop (H1 — unbounded fetch). Fix unbounded `assignment_items` fetch (H2 — no row limit). Fix `staff/stats` fallback (H3 — crashes when staff row missing). |
| **Sub-items** | |
| | H1: PSID pagination loop in payment filter — add max page guard |
| | H2: `assignment_items` fetch — add LIMIT clause for safety |
| | H3: `staff/stats` — graceful fallback when staff profile row missing |

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

---

## PHASE GROUP: Remaining Correction Items (from Night Audit, Section 28.10)

| # | Priority | Item | Est. | Status |
|---|----------|------|------|--------|
| 1 | P0 | **Add `bill_month` to `daily_assignments`** | 2 hrs | ✅ Done (migration 041, 2026-06-09) |
| 2 | P1 | **`haversine()` NaN guard** | 10 min | ⏳ Not Started |
| 3 | P1 | **`incrementRetry` race condition** | 30 min | ⏳ Not Started |
| 4 | P1 | **IndexedDB v3→v4 index upgrade** | 15 min | ⏳ Not Started |
| 5 | P2 | **Toast on offline queue fallback** | 15 min | ⏳ Not Started |
| 6 | P2 | **Referer check on GAS webhook** | 5 min | ✅ Done (2026-06-12 AM) |
| 7 | P2 | **Delivery Quality RPC + Settings tab** | 2 hrs | ✅ Done (migration 042, 2026-06-12 AM) |
| 8 | P3 | **Supersede old `delivery_photos` on redelivery** | 30 min | ✅ Done (migration 043, 2026-06-12 AM) |
| 9 | P3 | **Move queue state to Zustand** | 1 hr | ✅ Done (2026-06-12 AM) |
| 10 | P3 | **Dead code cleanup** | 15 min | ✅ Done (2026-06-12 AM) |

---

## PHASE GROUP: Unapplied Migrations

| Migration | File | Status | Action Needed |
|-----------|------|--------|---------------|
| 030 | `scripts/sql/030-delivery-photos.sql` | ⏳ Not Applied | Requires PAT token execution |
| 036 | `scripts/sql/036-test-mc-data.sql` | ⏳ Not Applied | Test data for MC filtering, requires PAT |
| 037 | `scripts/sql/037-notifications.sql` | ⏳ Not Applied | Notifications schema, requires PAT |

---

## Execution Priority Order (Next Up)

From MASTER.md Section 10 (lines 1141–1169):

| Priority | Phase | Est. | Why |
|----------|-------|------|-----|
| 1 | **B3** (Delivery Stability) | 8 hrs | Fixes production delivery reliability — most impactful for daily staff use |
| 2 | **M1** (Map Unification) | 30 min | Quick win — staff sees overlay data |
| 3 | **M2** (Show All + Counts) | 3 hrs | Map UX improvement, clustering for performance |
| 4 | **M3** (JSON Marker Chunks) | 1.5 hrs | Egress optimization for map data |
| 5 | **0d** (Reference Tables) | 1.5 hrs | Performance: fix 212K-row filter queries |
| 6 | **0e** (Stabilize & Clean) | 2 hrs | Fix payment filter pagination bug |
| 7 | **0f** (Schema Restructuring) | 6 hrs | Foundation for delivery+house tables |
| 8 | **Phase C** (Admin Dashboard) | 3 hrs | Staff performance visibility |
| 9 | **Phase E** (Flag Management) | 4 hrs | Flag workflow completion |
| 10 | **Phase F** (Auto-Route) | 3 hrs | Route optimization |
| 11 | **Phase G** (Live Monitoring) | 3 hrs | Real-time admin view |
| 12 | **Phase RBAC** (Approval Chain) | 3 hrs | Access control |
| 13 | **Phase D** (Visual Rehaul) | 4 hrs | UI polish |
| 14 | **Phase Z** (App Audit Cleanup) | 4 hrs | Deep cleanup (deferred) |
| 15 | **Audit P1-P6** | 21 hrs | Production hardening (deferred) |

---

## Quick Stats

| Metric | Count |
|--------|-------|
| **Total phases** | 43 |
| **✅ Completed** | 27 |
| **🔜 In Progress** | 0 |
| **⏳ Not Started** | 13 |
| **⏸️ Deferred** | 3 |
| **Completed work estimate** | ~42 hrs |
| **Remaining work estimate** | ~40 hrs |
| **Unapplied SQL migrations** | 3 |
