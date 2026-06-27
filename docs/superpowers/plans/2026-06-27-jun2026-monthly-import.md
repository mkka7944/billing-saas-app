# JUN2026 Full Monthly Import — Implementation Plan

> **For agentic workers:** This is an operational pipeline execution — running existing Python scripts, not writing code. Tasks use checkbox syntax for tracking. No subagent dispatch needed (single sequential pipeline).

**Goal:** Load JUN2026 lifecycle data into `survey_units` and latest payments into `payment_history` ahead of June 28 training.

**Architecture:** Run existing `ingest-all.py` interactive menu → option [1] Full Monthly Import. Pipeline: `enrich-survey-units.py` (lifecycle XLSX → survey_units) → `export-bills-json.py` (billing snapshot) → `load-payments.py` (payment CSV → payment_history).

**Tech Stack:** Python 3.12.7, Supabase-py, pandas, openpyxl, Supabase CLI (for verification queries).

## Global Constraints

- Scripts read from `F:\qoder\billing-system\01_Local_Engine\outputs\` (Office PC path) — fallback to `scripts/data/` if unavailable
- Enrich upsert on `survey_id` (PK). Payment upsert on `(psid, bill_month)` — both idempotent
- Lifecycle XLSX files use filename pattern `test_lifecycle_Biller_{City}_Jun2026.xlsx` — note **case-sensitive**: `Jun2026`, not `JUN2026`
- DB verification via `npx supabase db query --linked`

---

### Task 1: Pre-flight verification

**Files:** none (read-only checks)

- [ ] **Step 1: Confirm source files exist**

```bash
# Lifecycle XLSX files (3 cities)
Get-ChildItem "F:\qoder\billing-system\01_Local_Engine\outputs\processed_pdfs" -Filter "*Jun2026*"
# Expected: 3 files for Bhalwal, Khushab, Sargodha

# Payment CSV
Test-Path "F:\qoder\billing-system\01_Local_Engine\outputs\scraped_data\COMBINED_ALL_CITIES_paid_ALL_HISTORY_Full.csv"
# Expected: True
```

- [ ] **Step 2: Check current DB row counts for baseline**

```bash
npx supabase db query --linked "SELECT current_bill_month, COUNT(*) FROM survey_units GROUP BY current_bill_month ORDER BY current_bill_month;"
npx supabase db query --linked "SELECT bill_month, COUNT(*) FROM payment_history GROUP BY bill_month ORDER BY bill_month DESC LIMIT 5;"
```

Save these as baseline numbers for post-import comparison.

- [ ] **Step 3: Verify Python deps and .env.local**

```bash
python -c "import pandas; import openpyxl; from supabase import create_client; print('ok')"
Test-Path ".env.local"
# Expected: ok, True
```

---

### Task 2: Run full monthly import

**Files:** none (runs existing scripts)

**⚠️ Case-sensitive month:** When prompted for month, enter `Jun2026` (matches filename casing, e.g. `test_lifecycle_Biller_Sargodha_Jun2026.xlsx`). The script correctly derives `JUN2026` for the DB `bill_month` field.

- [ ] **Step 1: Launch ingest-all.py interactive menu**

```bash
python scripts/ingest-all.py
```

- [ ] **Step 2: Select option [1] Full Monthly Import**

Enter `1` at the menu prompt.

- [ ] **Step 3: Enter month**

Type `Jun2026` when prompted for month.

- [ ] **Step 4: Wait for pipeline completion**

The pipeline runs three scripts sequentially:
1. `enrich-survey-units.py` — reads 3 XLSX files, upserts to `survey_units`, syncs reference tables, writes `ingest_log`
2. `export-bills-json.py` — exports billing data
3. `load-payments.py` — reads payment CSV, upserts to `payment_history`, writes `ingest_log`

**Expected output per script:**
```
=== [Survey Enrichment] Running: enrich-survey-units.py ===
Loading 3 lifecycle files...
  test_lifecycle_Biller_Bhalwal_Jun2026.xlsx: N rows -> N unique survey_ids
  test_lifecycle_Biller_Khushab_Jun2026.xlsx: N rows -> N unique survey_ids
  test_lifecycle_Biller_Sargodha_Jun2026.xlsx: N rows -> N unique survey_ids
Total survey_ids to enrich: ~200K
Updating survey_units (N rows)...
Done: N upserted (X new, Y updated)
Syncing reference tables...
ingest_log: written (Nms)

=== [Export Bills JSON] Running: export-bills-json.py ===

=== [Payment Load] Running: load-payments.py ===
Loading: COMBINED_ALL_CITIES_paid_ALL_HISTORY_Full.csv
  Rows: ~120K
Upserting N records to payment_history...
Done: N upserted, 0 errors
ingest_log: written (Nms)
```

- [ ] **Step 5: If errors occur, note which batch and which script**

The scripts handle batch-level errors and continue. If any batch errors appear:
- Note the error count and message from the output
- The `ingest_log` table captures `rows_errors` and `error_message`
- Both scripts are idempotent — safe to re-run for retry

---

### Task 3: Post-import verification

**Files:** none (DB queries)

- [ ] **Step 1: Check ingest_log for both scripts**

```bash
npx supabase db query --linked "SELECT script_name, status, rows_processed, rows_inserted, rows_updated, rows_errors, error_message, started_at, completed_at FROM ingest_log ORDER BY started_at DESC LIMIT 10;"
```

Expected: Two entries — `enrich-survey-units` and `load-payments` — both with `status = 'success'` and `rows_errors = 0`.

- [ ] **Step 2: Verify survey_units row count for JUN2026**

```bash
npx supabase db query --linked "SELECT current_bill_month, COUNT(*) FROM survey_units GROUP BY current_bill_month ORDER BY current_bill_month;"
```

Expected: `JUN2026` has row count matching or closely tracking the lifecycle XLSX data count. Compare with pre-import baseline.

- [ ] **Step 3: Verify payment_history row count**

```bash
npx supabase db query --linked "SELECT bill_month, COUNT(*) FROM payment_history GROUP BY bill_month ORDER BY bill_month DESC LIMIT 10;"
```

Expected: Total payment rows increased. No `errors` column — just check that the count is reasonable for June.

- [ ] **Step 4: Spot-check a sample survey_id**

```bash
npx supabase db query --linked "SELECT survey_id, psid, current_bill_month, monthly_fee, consumer_name, city_district, status FROM survey_units WHERE current_bill_month = 'JUN2026' LIMIT 5;"
```

Expected: Correctly enriched records with consumer_name, address, monthly_fee populated.

- [ ] **Step 5: Verify reference tables synced**

```bash
npx supabase db query --linked "SELECT * FROM bill_months WHERE month = 'JUN2026';"
```

Expected: `JUN2026` entry exists in `bill_months`.

---

### Task 4: Document results

- [ ] **Step 1: Record import summary**

Create a brief summary note with:
- Script execution results (status, row counts, errors)
- Pre-vs-post row counts
- Any anomalies encountered

- [ ] **Step 2: Update context.json**

Update `.opencode/context.json` with:
- `gitCurrentHead` updated to reflect the import as a checkpoint
- Brief note about JUN2026 data imported, ready for June 28 training
