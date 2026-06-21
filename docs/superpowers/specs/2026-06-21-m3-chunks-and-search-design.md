# M3 — JSON Marker Chunks + Global Search Design

**Date:** 2026-06-21
**Status:** Design approved, awaiting implementation plan
**Depends on:** Monthly enrichment pipeline + daily payment pipeline (office PC)

---

## 1. Problem Statement

### What's wrong

The app is server-dependent for everything. Every single action — searching a unit, loading markers, opening a sheet — makes a network call to Supabase. The old RoutingStation app loaded everything from local JSON files. Instant. No loading states. Staff could search any survey_id in milliseconds.

We have none of that:

1. **No instant global search** — Staff can't type a survey_id or psid and jump to the unit. They have to scroll through the list or tap around the map.
2. **No client-side data cache** — Every time the map re-mounts, it re-fetches from the API. 3000+ markers × 10s+ each time. The markers are the same data until the monthly import.
3. **No offline capability** — If the network is slow (which it is in the field), the app is slow.
4. **The mark-for-delivery flow is on the critical path** — Staff open UDS → see hero image → take photo → POST to API → wait. Every step depends on the server.

### The fix: Client-first architecture, server for writes only

The pattern is: **load once, search locally, write to server.**

JSON marker chunks are generated per-UC during the monthly pipeline, stored in Supabase Storage, fetched once per UC selection, and indexed in browser memory. Search, marker rendering, and QR lookup all read from local memory — zero network calls.

Payment status changes daily. The daily payment injection script (`load-payments.py`) regenerates the chunks with updated `is_paid` values and re-uploads them to Supabase Storage. The chunk always reflects current payment status.

---

## 2. Architecture

```
Month-end script                 Daily payment script
(enrich-survey-units.py add-on)  (load-payments.py add-on)
         │                               │
         └───────────┬───────────────────┘
                     │
                     ▼
         Supabase Storage bucket
         /marker-chunks/{CITY}/{UC}.json
                     │
                     │ (fetched once per UC selection)
                     ▼
         useUcChunk() hook
         → in-memory Map<survey_id, Unit>
         → in-memory Map<psid, Unit>
                     │
       ┌─────────────┼─────────────┐
       ▼             ▼             ▼
  Search bar    Map markers    QR scanner
  (instant)     (local data)   (local lookup)
```

---

## 3. Storage: Supabase Storage Bucket

### Why Supabase Storage (not public/ directory)

- **Vercel Hobby tier** can serve static files from `public/` for free (unlimited bandwidth, CDN-served), but committing 15MB+ of JSON daily to git is impractical.
- **Supabase Storage** allows scripts (which already have the service_role key) to upload files directly — no git involvement.
- **Free tier limits:** 1GB storage, 2GB bandwidth. All chunks combined are ~15MB gzipped — well within both limits.
- **Cache control** set to `public, max-age=3600, s-maxage=86400` — Supabase Storage respects this and CDN-caches the files.

### Bucket setup

```
Bucket name: marker-chunks
Public read:  Yes (anyone can download)
Write access: Via service_role key only (from office PC scripts)
```

### File path scheme

```
marker-chunks/{city_district}/{tehsil}/{uc_name}.json
```

Examples:
- `marker-chunks/SARGODHA/SARGODHA/MC_Sargodha_Ward_1.json`
- `marker-chunks/SARGODHA/BHALWAL/Bhalwal_Ward_3.json`
- `marker-chunks/KHUSHAB/KHUSHAB/Khushab_MC_Ward_5.json`

`uc_name` values from the DB are already URL-safe (no spaces in practice — underscores used per existing conventions). URL-encode in fetch if needed (browser `fetch` handles this automatically for most characters).

### Cache behavior

Each chunk is fetched **once per UC selection per session**. The browser's HTTP cache keeps it for 1 hour (max-age). The CDN keeps it for 24 hours (s-maxage). When the daily payment script re-uploads, the new file has a new upload timestamp but the same URL — CDN serves stale content for up to 24 hours unless we purge.

**Alternative:** Append `?v={generated_at_unix}` to the URL to force cache busting. The `useUcChunk` hook reads `generated_at` from the JSON metadata and can check against a known version.

Simpler approach: Use `?v={date}` query param from the script's run date. The hook includes this in the URL. When the payment script runs daily, it generates a new `v`. The browser fetches the new version. This avoids CDN staleness entirely.

### Data size calculations

| Metric | Value |
|--------|-------|
| Total survey units | ~200,000 |
| Total UCs | ~50 |
| Avg units per UC | ~4,000 |
| Per-unit JSON size (uncompressed) | ~350 bytes |
| Per-UC chunk size (uncompressed) | ~1.4 MB |
| Per-UC chunk size (gzipped) | ~200-250 KB |
| All chunks on Storage (gzipped) | ~12-15 MB |
| Storage free tier limit | 1,000 MB ✅ |
| Bandwidth per staff session (1 UC) | ~250 KB |
| Monthly bandwidth for 20 staff | ~5 MB ✅ |
| Phone memory per UC chunk (uncompressed) | ~1.4 MB (typical phone has 4GB+) ✅ |

---

## 4. Chunk JSON Format

Each file contains all active units for one UC, with full marker data + payment status.

```json
{
  "city_district": "SARGODHA",
  "tehsil": "SARGODHA",
  "uc_name": "MC Sargodha Ward 1",
  "generated_at": "2026-06-21T10:30:00Z",
  "version": 2,
  "unit_count": 2847,
  "units": [
    {
      "survey_id": "SURV-001",
      "psid": "PSID-12345",
      "lat": 32.08361,
      "lng": 72.67123,
      "consumer_name": "Muhammad Ali",
      "address": "House 12, Street 5, Mohalla Abbas",
      "image_urls": ["https://..."],
      "is_paid": false,
      "monthly_fee": 500,
      "billing_category": "Residential",
      "route_name": "R1",
      "route_seq": 15
    }
  ]
}
```

### Fields rationale

| Field | Used for | Changes? |
|-------|----------|----------|
| `survey_id` | Primary key, search, QR match, UDS open | Never |
| `psid` | Search, delivery flow, payment join | Never |
| `lat`, `lng` | Map marker position, search distance sort | Never |
| `consumer_name` | Search, display in UDS/list | Rarely |
| `address` | Search | Rarely |
| `image_urls` | Hero image, gallery | Occasionally (portal) |
| `is_paid` | Marker color (green/red), payment badge | Daily |
| `monthly_fee` | UDS amount display | Monthly |
| `billing_category` | Filter | Monthly |
| `route_name`, `route_seq` | Route sequencing | Monthly |

The chunk is **not** a full `survey_units` row. It omits: `status` (implicitly filtered to active at generation time), `survey_date`, `survey_time`, `surveyor_name`, `city_district`, `tehsil`, `uc_name`, `start_month`, `current_bill_month`, `arrears`.

Total omitted: 10 fields. Total kept: 13 fields. This keeps the chunk ~65% of a full row — compact enough for fast transfer.

### Generation SQL

Both monthly and daily scripts use the same query:

```sql
SELECT
  survey_id, psid, lat, lng,
  consumer_name, address, image_urls,
  is_paid, monthly_fee, billing_category,
  route_name, route_seq
FROM survey_units
WHERE city_district = '{CITY}'
  AND tehsil = '{TEHSIL}'
  AND uc_name = '{UC}'
  AND (status IS NULL OR status = 'ACTIVE')
ORDER BY survey_id;
```

---

## 5. Client-Side Hook: `useUcChunk`

### File: `src/hooks/use-uc-chunk.ts`

```ts
function useUcChunk(city: string, tehsil: string, uc: string | null): {
  units: ChunkUnit[]           // raw array for markers/display
  getBySurveyId: (id: string) => ChunkUnit | undefined
  getByPsid: (id: string) => ChunkUnit | undefined
  search: (query: string) => ChunkUnit[]   // searches survey_id, psid, consumer_name, address
  isLoading: boolean
  error: Error | null
}
```

### Behavior

1. **Input:** `city`, `tehsil`, `uc` from filter bar selection. `uc = null` means no UC selected (don't fetch).
2. **Cache:** Module-level `Map<string, { data, timestamp }>` keyed by `"city/tehsil/uc"`. Persists across component remounts (e.g., navigating between `/map` and `/deliver`).
3. **Fetch:** Only when cache miss or cache older than `staleTime` (5 minutes).
4. **Parse:** JSON parse → build `Map<survey_id, ChunkUnit>` and `Map<psid, ChunkUnit>` for O(1) lookups.
5. **Search:** `search(query)` filters all indexes by substring match on `consumer_name`, `address`, `survey_id`, `psid`. Returns top 20 results sorted by relevance (exact prefix match first, then substring).
6. **Loading/Error:** Standard React Query pattern — `isLoading`, `error` states.
7. **Version check:** Includes `?v={version}` from the filter bar's known data version.

### Query key

```ts
['uc-chunk', city, tehsil, uc]
```

### Stale time

```ts
staleTime: 5 * 60 * 1000  // 5 minutes — same as survey data
```

After 5 minutes without UC change, re-fetches the chunk. In practice, staff rarely stay on one UC for 5+ minutes without changing filters.

---

## 6. Global Search UI

### Files

- `src/components/map/global-search.tsx` — Search modal with input + results list
- `src/components/map/global-search-button.tsx` — Floating action button that opens the search

### Wireframe

```
┌─────────────────────────────────────────────┐
│  Map (existing)                              │
│                                              │
│                                    [🔍]      │ ← floating search button
│                                              │
│  ┌─ Global Search ──────────────────────┐   │
│  │                                      │   │ ← modal overlay (opens on 🔍 tap)
│  │  🔍 Search survey ID or PSID...      │   │
│  │                                      │   │
│  │  ┌─ Results (appear after 3+ chars) ┐│   │
│  │  │ Muhammad Ali                      ││   │
│  │  │ PSID-12345 · #351 out of 2847     ││   │
│  │  │ House 12, Street 5, Mohalla Abbas ││   │
│  │  │ 📍 45m · ●●●●● Paid              ││   │
│  │  ├───────────────────────────────────┤│   │
│  │  │ Ahmad Khan                        ││   │
│  │  │ PSID-12346 · #352 out of 2847     ││   │
│  │  │ House 13, Street 5, Mohalla Abbas ││   │
│  │  │ 📍 89m · ●●●●○ Due               ││   │
│  │  └───────────────────────────────────┘│   │
│  │                                      │   │
│  └──────────────────────────────────────┘   │
└─────────────────────────────────────────────┘
```

### Interaction

1. Staff taps floating 🔍 button → modal opens, input auto-focused
2. Starts typing (3+ characters) → results appear instantly from local Map index
3. Each result row shows: consumer_name, survey_id/psid, address, GPS distance, payment status badge
4. Distance calculated client-side using Haversine formula against stored `userLocation`
5. Tapping a result → map flies to unit's lat/lng at zoom 20 → UDS opens
6. Tapping outside or pressing Esc → modal closes

### Search algorithm

Pure client-side substring matching across four fields:
- `survey_id` (prefix match first, then substring)
- `psid` (prefix match first, then substring)
- `consumer_name` (word-prefix match first, then substring)
- `address` (substring only, lower score)

Results sorted by: exact match > prefix match > substring match > address match. Capped at 20 results.

### Integration with current map flow

The search result handler calls the existing `setDeliverTarget(psid, unit)` or `selectHouse(surveyId, markers)` — same functions that marker clicks use. The map already handles fly-to via `MapFlyToTarget` (admin) or `FlyToTarget` (staff).

```ts
// In global-search.tsx, on result select:
const handleSelect = (unit: ChunkUnit) => {
  closeSearch()                           // close modal
  if (unit.psid) {
    setDeliverTarget(unit.psid, toAssignmentUnit(unit))  // open UDS
  } else {
    selectHouse(unit.survey_id, [fromChunkUnit(unit)])   // open HDS
  }
  flyTo(unit.lat, unit.lng, 20)           // fly map to location
}
```

---

## 7. Marker Source Swap (Optional Phase 2)

After the search feature is live and stable, optionally swap the map marker source from API to chunk data when a UC is selected.

Currently, when an admin selects a UC in the filter bar:
1. `useSurveyData(filters, 1, 50000, true)` fires → batched fetch from Supabase → 10s+ wait
2. Results synced to `mapMarkers` store → rendered as `<CircleMarker>` components

With chunk source:
1. `useUcChunk()` already loaded the data (for search)
2. `units` array from chunk → directly to `mapMarkers` store
3. Zero API calls. Zero seconds of wait.
4. Fallback: if chunk not loaded yet, show loading state (spinner overlay), fall back to API after timeout

**This is a separate change** with no dependency on the search feature. Can be implemented later without touching the search code.

### Chunk vs API: admin map load time comparison

| Scenario | Current (API) | With chunk |
|----------|--------------|------------|
| First load, UC selected | ~10-15s (batched fetch) | ~600ms (chunk download) |
| Subsequent UC changes | ~10-15s | ~100ms (chunk cached in memory) |
| Filter change (same UC) | ~5s (re-query) | ~5ms (local filter) |

---

## 8. Pipeline Integration

### 8.1 Monthly: `enrich-survey-units.py` add-on

After the lifecycle XLSX → survey_units upsert completes:

1. Query all distinct `(city_district, tehsil, uc_name)` combinations where `status IS NULL OR status = 'ACTIVE'`
2. For each UC, run the generation SQL and write a JSON file
3. Upload each file to Supabase Storage bucket `marker-chunks/`
4. Overwrite existing files (same path)

```python
# Pseudocode for the add-on
def generate_uc_chunks(supabase_client):
    # Get all distinct UC names
    result = supabase_client.table("survey_units").select(
        "city_district, tehsil, uc_name"
    ).or_("status.is.null,status.eq.ACTIVE").execute()
    ucs = set((r["city_district"], r["tehsil"], r["uc_name"]) for r in result.data)

    for city, tehsil, uc in ucs:
        # Query unit data for this UC
        units = supabase_client.table("survey_units").select(
            "survey_id, psid, lat, lng, consumer_name, address, image_urls, "
            "is_paid, monthly_fee, billing_category, route_name, route_seq"
        ).eq("city_district", city).eq("tehsil", tehsil).eq("uc_name", uc).or_(
            "status.is.null,status.eq.ACTIVE"
        ).order("survey_id").execute()

        # Build chunk JSON
        chunk = {
            "city_district": city,
            "tehsil": tehsil,
            "uc_name": uc,
            "generated_at": datetime.utcnow().isoformat() + "Z",
            "version": version,
            "unit_count": len(units.data),
            "units": units.data,
        }

        # Upload to Supabase Storage
        path = f"marker-chunks/{city}/{tehsil}/{uc}.json"
        supabase_client.storage.from_("marker-chunks").upload(
            path,
            json.dumps(chunk, default=str).encode("utf-8"),
            {"content-type": "application/json", "cache-control": "public, max-age=3600"},
            upsert=True,
        )

        log(f"Uploaded {path}: {len(units.data)} units")
```

### 8.2 Daily: `load-payments.py` add-on

After the payment CSV → payment_history upsert completes:

1. Same query and upload as the monthly script
2. Overwrites the same file paths with updated `is_paid` values
3. `version` increments (or uses timestamp-based versioning)

The `is_paid` field on `survey_units` is already kept in sync by the DB trigger on `payment_history` changes (see `scripts/sql/009-triggers-and-automation.sql`). So after `load-payments.py` upserts to `payment_history`, the `survey_units.is_paid` column already reflects the latest data. The chunk generation query just reads it.

### 8.3 Supabase client for uploads

Both scripts already use the service_role key:

```python
supabase = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
```

The storage upload uses the same client:

```python
supabase.storage.from_("marker-chunks").upload(path, data, ..., upsert=True)
```

---

## 9. Implementation Order

### Phase 1: Infrastructure
1. **Create Supabase Storage bucket** `marker-chunks` (public read, service_role write)
2. **Add chunk generation to `enrich-survey-units.py`** (monthly pipeline)
3. **Add chunk generation to `load-payments.py`** (daily pipeline)
4. **Generate initial chunks** by running the monthly pipeline

### Phase 2: Client-Side Hook
5. **`src/hooks/use-uc-chunk.ts`** — fetch, index, cache, search
6. **`src/types/index.ts`** — add `ChunkUnit` type

### Phase 3: Search UI
7. **`src/components/map/global-search-button.tsx`** — floating button
8. **`src/components/map/global-search.tsx`** — modal with input + results
9. **`src/app/map/page.tsx`** — integrate search button and hook
10. **Wire fly-to + UDS open on result select**

### Phase 4: Marker Source Swap (Optional)
11. **`src/components/map-view.tsx`** — source markers from chunk when UC selected
12. **`src/hooks/use-survey-data.ts`** — add chunk-fast-path flag
13. **Gradual rollout** — feature flag, A/B test in dev

---

## 10. Questions for Further Discussion

This design was presented and discussed on 2026-06-21. The following topics were deferred to the implementation planning phase:

1. **Chunk generation script location** — Should it be a standalone Python script (`scripts/generate-marker-chunks.py`) called from `ingest-all.py`, or inline in `enrich-survey-units.py` / `load-payments.py`?
2. **Versioning scheme** — Timestamp-based (`?v=20260621`) vs counter-based (`?v=3`). Timestamp is simpler since the script knows the current date.
3. **Error handling** — If a single UC fails to generate/upload, should the entire script fail, or skip and log? Partial success is acceptable.
4. **UTM/UC naming** — UC names in the DB use underscores (e.g., `MC_Sargodha_Ward_1`). Confirm URL-safe for file paths.
5. **Supabase Storage bucket** — Does the service_role key need a Storage policy grant, or is it automatically authorized?
6. **Marker source swap scope** — Should chunk markers replace API markers entirely for UC-level views, or only when the chunk is already loaded for search?
7. **Search on `/deliver` page** — Staff in `/deliver` view also need search. Should the same component be available there, or is `/map` sufficient since staff navigate there on unit select?
8. **Consumer name script (Urdu)** — Does the search need to handle Urdu script (e.g., consumer names in Nastaliq)? The current data has names in Urdu script — substring matching may not work well without proper Unicode normalization.
9. **Chunk preload on app load** — When staff opens the app, should we immediately fetch the chunk for their assigned UC (anticipating map use) rather than waiting for UC selection?
10. **Admin experience** — Should admins also get the search bar? Admin search would work across all UCs (need all chunks loaded or on-demand fetch per UC).

---

## 11. Risk Analysis

### Breaking risks
None — the entire feature is additive. Nothing is rewritten or removed.

### Moderate risks
1. **Supabase Storage permission** — Need to verify the service_role key can write to a bucket. The Python client uses `supabase.storage.from_("bucket").upload()`. May need a Storage bucket policy allowing service_role writes.
2. **Chunk generation performance** — Generating 50 chunks sequentially may take 5-10 minutes during the monthly pipeline. This is acceptable for a batch process but should run with progress logging.
3. **UC name encoding** — If UC names contain characters that are invalid in URLs (spaces, slashes, Unicode), the file path and fetch URL may break. UC names in the DB currently use underscores (safe). Verify during implementation.

### Low risks
4. **Memory usage** — 1.4MB per chunk uncompressed in browser memory. If admin switches between 5 UCs in a session, ~7MB cumulative. Totally fine.
5. **Stale chunk after daily payment update** — CDN may serve stale chunk for up to 24 hours. Mitigated by `?v=` query parameter that changes daily.
6. **Search on 4000-unit UC** — Building substring indexes for 4000 units takes <50ms on modern phones. 20-result cap ensures fast rendering.
7. **Empty search results** — "No results found" message with suggestion to try fewer characters.

---

## 12. Testing Verification Plan

### Script-level testing (office PC)
```
python scripts/generate-marker-chunks.py --city SARGODHA
→ Verify chunk files exist in Supabase Storage bucket
→ Verify a known psid exists in the JSON
→ Verify JSON is valid (json.loads)
```

### Client-side testing (dev)
1. Open `/map` → select a UC → Network tab shows `GET .../marker-chunks/...json`
2. Tap 🔍 search button → modal opens → type "PSID-123" → shows result in <100ms
3. Tap result → map flies to unit → UDS opens with correct unit data
4. Change UC → new chunk fetched → search works for new UC
5. Switch to another tab → switch back → search works (cache hit, no new fetch)

### Edge cases
6. No UC selected → search button disabled (or says "Select a UC first")
7. No network → search button visible but shows "Offline — data not available"
8. Empty UC (0 units) → chunk has `unit_count: 0`, search shows "No units in this UC"
9. Typed characters that match nothing → "No results found for '{query}'"
10. Very long query (50+ chars) → search still works (simple substring)
11. UC name with special characters → file path is properly encoded
12. Script fails for one UC → continues to next UC, logs error, exits non-zero
