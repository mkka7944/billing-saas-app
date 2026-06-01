#!/usr/bin/env python3
"""
Load payments from combined payment CSV into payment_history.

Reads the COMBINED_ALL_CITIES_paid_ALL_HISTORY_Full.csv produced by
bill-extractor-v4.py and upserts to payment_history.

Usage:
    python scripts/load-payments.py
    python scripts/load-payments.py --file path/to/file.csv
    python scripts/load-payments.py --dry-run
"""

import os, sys, math, argparse, datetime
import pandas as pd
from dotenv import load_dotenv
from supabase import create_client

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
LOCAL_SCRAPED = os.path.join(os.path.dirname(SCRIPT_DIR), "scripts", "data", "scraped_data")
OFFICE_PC_SCRAPED = r"F:\qoder\billing-system\01_Local_Engine\outputs\scraped_data"
SCRAPED_DATA = OFFICE_PC_SCRAPED if os.path.exists(OFFICE_PC_SCRAPED) else LOCAL_SCRAPED
ENV_PATH = os.path.join(os.path.dirname(SCRIPT_DIR), ".env.local")

load_dotenv(ENV_PATH)
SUPABASE_URL = os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")

if not SUPABASE_URL or not SUPABASE_KEY:
    print("Error: SUPABASE env vars not found")
    sys.exit(1)


def safe_float(val):
    try:
        f = float(val)
        return f if not (math.isnan(f) or math.isinf(f)) else 0
    except (ValueError, TypeError):
        return 0


def find_latest_payment_csv():
    if not os.path.exists(SCRAPED_DATA):
        print(f"Error: {SCRAPED_DATA} not found")
        return None
    files = sorted(
        f for f in os.listdir(SCRAPED_DATA)
        if f.startswith("COMBINED_ALL_CITIES") and f.endswith("_Full.csv") and not f.startswith("~$")
    )
    if not files:
        # Try excel_dumps as fallback
        excel_dumps = os.path.join(os.path.dirname(SCRIPT_DIR), "scripts", "data", "excel_dumps")
        if os.path.exists(excel_dumps):
            files = sorted(
                f for f in os.listdir(excel_dumps)
                if f.startswith("COMBINED_ALL_CITIES") and f.endswith("_Full.csv") and not f.startswith("~$")
            )
    if files:
        latest = files[-1]
        print(f"  Using latest payment CSV: {latest}")
        return latest
    return None


def main():
    parser = argparse.ArgumentParser(description="Load payments from CSV into payment_history")
    parser.add_argument("--file", type=str, help="Path to payment CSV file")
    parser.add_argument("--dry-run", action="store_true", help="Preview without upserting")
    args = parser.parse_args()
    started_at = datetime.datetime.now(datetime.timezone.utc)

    sb = create_client(SUPABASE_URL, SUPABASE_KEY)

    # Find CSV file
    if args.file:
        csv_path = args.file
    else:
        csv_name = find_latest_payment_csv()
        if not csv_name:
            print("No payment CSV found")
            return
        csv_path = os.path.join(SCRAPED_DATA, csv_name)
        if not os.path.exists(csv_path):
            csv_path = os.path.join(
                os.path.dirname(SCRIPT_DIR), "scripts", "data", "excel_dumps", csv_name
            )

    if not os.path.exists(csv_path):
        print(f"File not found: {csv_path}")
        return

    print(f"Loading: {csv_path}")
    df = pd.read_csv(csv_path, low_memory=False, encoding="utf-8-sig")
    print(f"  Rows: {len(df)}")

    if len(df) == 0:
        print("Nothing to do.")
        return

    # Detect city column — try "City" then "District"
    city_col = "City" if "City" in df.columns else ("District" if "District" in df.columns else None)
    tehsil_col = "Tehsil" if "Tehsil" in df.columns else None
    uc_col = "UC" if "UC" in df.columns else None

    # Build upsert records
    records = []
    skipped = 0
    for _, row in df.iterrows():
        psid = str(row.get("PSID", "")).strip()
        if not psid or psid == "nan":
            skipped += 1
            continue
        bill_month = str(row.get("Month", "")).strip().upper()
        if not bill_month:
            skipped += 1
            continue

        paid_date_raw = row.get("Paid Date", "")
        paid_date = None
        if pd.notna(paid_date_raw):
            try:
                paid_date = pd.to_datetime(paid_date_raw).strftime("%Y-%m-%d")
            except (ValueError, TypeError):
                paid_date = str(paid_date_raw).strip()

        rec = {
            "psid": psid,
            "bill_month": bill_month,
            "amount_paid": safe_float(row.get("Paid Amount", 0)),
            "paid_date": paid_date,
            "payment_method": str(row.get("Channel", "")).strip(),
            "payment_status": str(row.get("Status", "")).strip(),
            "fine": safe_float(row.get("Fine", 0)),
        }
        if city_col:
            rec["city_district"] = str(row.get(city_col, "")).strip().upper()
        if tehsil_col:
            rec["tehsil"] = str(row.get(tehsil_col, "")).strip().upper()
        if uc_col:
            rec["uc_name"] = str(row.get(uc_col, "")).strip()
        records.append(rec)

    print(f"  Valid records: {len(records)}, Skipped: {skipped}")

    if not records:
        print("Nothing to upsert.")
        return

    if args.dry_run:
        print(f"\nDRY RUN: Would upsert {len(records)} records")
        return

    # Upsert in batches keyed on (psid, bill_month)
    print(f"\nUpserting {len(records)} records to payment_history...")
    batch_size = 500
    upserted = 0
    errors = 0
    batch = []

    for rec in records:
        batch.append(rec)
        if len(batch) >= batch_size:
            try:
                sb.table("payment_history").upsert(batch, on_conflict="psid,bill_month").execute()
                upserted += len(batch)
            except Exception as e:
                print(f"  Error at {upserted}: {e}")
                errors += len(batch)
            batch = []
            print(f"  Progress: {upserted}/{len(records)}")

    if batch:
        try:
            sb.table("payment_history").upsert(batch, on_conflict="psid,bill_month").execute()
            upserted += len(batch)
        except Exception as e:
            print(f"  Error at final batch: {e}")
            errors += len(batch)

    print(f"\nDone: {upserted} upserted, {errors} errors, {skipped} skipped")

    # Write audit log
    completed_at = datetime.datetime.now(datetime.timezone.utc)
    duration_ms = int((completed_at - started_at).total_seconds() * 1000)
    try:
        log_entry = {
            "script_name": "load-payments",
            "bill_month": "MULTI",
            "status": "partial" if errors > 0 and upserted > 0 else ("failed" if errors > 0 else "success"),
            "rows_processed": len(records),
            "rows_inserted": len(records),
            "rows_updated": len(records),
            "rows_errors": errors,
            "error_message": None if errors == 0 else f"{errors} batch errors",
            "started_at": started_at.isoformat(),
            "completed_at": completed_at.isoformat(),
            "metadata": {
                "file": os.path.basename(csv_path),
                "skipped": skipped,
                "duration_ms": duration_ms,
            }
        }
        sb.table("ingest_log").insert(log_entry).execute()
        print(f"  ingest_log: written ({duration_ms}ms)")
    except Exception as e:
        print(f"  Error writing ingest_log: {e}")


if __name__ == "__main__":
    main()
