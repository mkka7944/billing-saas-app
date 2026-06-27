# JUN2026 Full Monthly Import — Design

**Date:** 2026-06-27
**Context:** Today is June 27. The JUN2026 billing cycle runs June 16 → July 15. TestCity staff training is scheduled for June 28. Data must be current for training.

## What We're Doing

Run the full monthly import pipeline for JUN2026: enrich survey units from lifecycle XLSX, then load latest payment data.

## Data Sources

| Source | Location | Used By |
|--------|----------|---------|
| `test_lifecycle_Biller_{City}_JUN2026.xlsx` | `F:\qoder\billing-system\01_Local_Engine\outputs\processed_pdfs\` | `enrich-survey-units.py` |
| `COMBINED_ALL_CITIES_paid_ALL_HISTORY_Full.csv` | `F:\qoder\billing-system\01_Local_Engine\outputs\scraped_data\` | `load-payments.py` |

Fallback to `scripts/data/` if F: drive unavailable.

## Pipeline

### Step 1: Pre-flight
- Check that lifecycle XLSX files exist matching "JUN2026"
- Check that payment CSV exists
- Check current survey_units count per bill_month for baseline

### Step 2: Interactive import (`ingest-all.py` → option [1])
```
python scripts/ingest-all.py
→ Select [1] Full Monthly Import
→ Enter month: JUN2026
```

This triggers in sequence:
1. `enrich-survey-units.py --month JUN2026`
   - Reads 3 city XLSX files
   - Upserts ~21 fields to `survey_units` (keyed on `survey_id`)
   - Sets `current_bill_month = 'JUN2026'`
   - Sets `status = 'ARCHIVED'` for portal-deleted rows
   - Syncs reference tables (`surveyors`, `bill_months`)
   - Writes `ingest_log` entry

2. `export-bills-json.py`
   - Exports current billing snapshot as JSON (local reference)

3. `load-payments.py`
   - Reads combined payment CSV
   - Upserts to `payment_history` keyed on `(psid, bill_month)`
   - Writes `ingest_log` entry

### Step 3: Post-import verification
- Check `ingest_log` for both scripts
- Query row counts by `current_bill_month`
- Spot-check in app

## Safety
- **Idempotent:** Both upserts safe to re-run
- **Dry-run available** via CLI flags if needed
- **No data loss:** Existing rows updated in place, nothing deleted
- **Reference tables** auto-synced

## Risks
- If `--exclude-ghosts` matters, run enrich separately with that flag afterward
- If F: drive path changes, scripts auto-fallback to `scripts/data/`
