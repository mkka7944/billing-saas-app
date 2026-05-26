#!/usr/bin/env python3
"""
Enrich survey_units from Lifecycle XLSX

Reads current month lifecycle files and updates survey_units with:
  psid, monthly_fee, billing_category, amount_due, arrears,
  route_name, route_seq, current_bill_month

Usage:
    python scripts/enrich-survey-units.py
    python scripts/enrich-survey-units.py --dry-run
"""

import os, sys, json, math, re, argparse
from collections import defaultdict
import pandas as pd
from dotenv import load_dotenv
from supabase import create_client

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROCESSED_PDFS = os.path.join(SCRIPT_DIR, "data", "processed_pdfs")
ENV_PATH = os.path.join(os.path.dirname(SCRIPT_DIR), ".env.local")
COLUMN_MAP_PATH = os.path.join(SCRIPT_DIR, "column_mapping.json")

load_dotenv(ENV_PATH)
SUPABASE_URL = os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")

if not SUPABASE_URL or not SUPABASE_KEY:
    print("Error: SUPABASE env vars not found")
    sys.exit(1)


def safe_int(val):
    try:
        return int(float(str(val).strip()))
    except (ValueError, TypeError):
        return 0


def safe_float(val):
    try:
        f = float(val)
        return f if not (math.isnan(f) or math.isinf(f)) else 0
    except (ValueError, TypeError):
        return 0


def find_latest_lifecycle_files():
    if not os.path.exists(PROCESSED_PDFS):
        print(f"Error: {PROCESSED_PDFS} not found")
        return []
    all_files = sorted(
        f for f in os.listdir(PROCESSED_PDFS)
        if "test_lifecycle" in f.lower() and f.endswith(".xlsx") and not f.startswith("~$")
    )
    city_files = defaultdict(list)
    for f in all_files:
        parts = f.replace(".xlsx", "").split("_")
        if len(parts) >= 4:
            city = parts[3]
            city_files[city].append(f)
    latest = []
    for city, files in city_files.items():
        files.sort(reverse=True)
        latest.append(files[0])
        if len(files) > 1:
            print(f"  {city}: using {files[0]} (skipping {len(files)-1} older)")
    return sorted(latest)


def main():
    parser = argparse.ArgumentParser(description="Enrich survey_units from lifecycle XLSX")
    parser.add_argument("--dry-run", action="store_true", help="Process files but skip upload")
    parser.add_argument("--month", type=str, default="May2026", help="Month filter (e.g. May2026)")
    args = parser.parse_args()

    sb = create_client(SUPABASE_URL, SUPABASE_KEY)

    # Load column mappings
    lc = {}
    if os.path.exists(COLUMN_MAP_PATH):
        with open(COLUMN_MAP_PATH) as f:
            col_map = json.load(f)
        lc = col_map.get("lifecycle", {})

    psid_col = lc.get("psid", "Biller PSID")
    sid_col = lc.get("survey_id", "Survey ID")
    amount_col = lc.get("amount_due", "Total Payable")
    arrears_col = lc.get("arrears", "Arrears")
    fee_col = lc.get("monthly_fee", "Monthly Fee")
    cat_col = lc.get("billing_category", "Billing Category")
    route_col = lc.get("route_name", "Route Segment")
    route_seq_col = lc.get("route_seq", "Route Seq")

    # Find lifecycle files
    files = [f for f in find_latest_lifecycle_files() if args.month in f]
    if not files:
        print(f"No lifecycle files found for {args.month}")
        sys.exit(1)

    print(f"Loading {len(files)} lifecycle files...")

    # Build enrichment map: survey_id -> {psid, monthly_fee, amount_due, arrears, ...}
    enrichment = {}
    seen_surveys = set()

    for lf in files:
        match = re.search(r"(Apr|Aug|Dec|Feb|Jan|Jul|Jun|Mar|May|Nov|Oct|Sep)(20[0-9]{2})", lf)
        bill_month = match.group(1).upper()[:3] + match.group(2) if match else args.month

        df = pd.read_excel(os.path.join(PROCESSED_PDFS, lf), engine="openpyxl", dtype=str)
        count = 0

        for _, row in df.iterrows():
            psid_raw = row.get(psid_col, "")
            if pd.isna(psid_raw):
                continue
            psid = f"{int(float(psid_raw))}" if isinstance(psid_raw, (float, int)) else str(psid_raw).strip()
            if not psid:
                continue

            sid = str(row.get(sid_col, "")).strip().upper()
            if not sid or sid == "NAN" or not sid.lstrip("0"):
                continue

            if sid not in seen_surveys:
                seen_surveys.add(sid)
                enrichment[sid] = {
                    "psid": psid,
                    "monthly_fee": safe_int(row.get(fee_col, "0")),
                    "billing_category": str(row.get(cat_col, "")).strip().upper()[:10],
                    "amount_due": safe_int(row.get(amount_col, "0")),
                    "arrears": safe_int(row.get(arrears_col, "0")),
                    "route_name": str(row.get(route_col, "")).strip() if pd.notna(row.get(route_col)) else None,
                    "route_seq": safe_int(row.get(route_seq_col, "0")),
                }
            else:
                # Multiple PSIDs for same survey — sum amounts, keep first psid
                enrichment[sid]["amount_due"] += safe_int(row.get(amount_col, "0"))
                enrichment[sid]["arrears"] += safe_int(row.get(arrears_col, "0"))

            count += 1

        print(f"  {lf}: {count} rows -> {len(seen_surveys)} unique survey_ids so far")

    print(f"Total survey_ids to enrich: {len(enrichment)}")

    if not enrichment:
        print("Nothing to do.")
        return

    # Update survey_units in batches
    if args.dry_run:
        print(f"\nDRY RUN: Would update {len(enrichment)} survey_units rows")
        return

    print(f"\nUpdating survey_units ({len(enrichment)} rows)...")
    batch = []
    batch_size = 500
    updated = 0
    errors = 0

    for sid, data in enrichment.items():
        rec = {
            "survey_id": sid,
            "psid": data["psid"],
            "monthly_fee": data["monthly_fee"],
            "billing_category": data["billing_category"] if data["billing_category"] and data["billing_category"] != "NAN" else "UNKNOWN",
            "amount_due": data["amount_due"],
            "arrears": data["arrears"],
            "route_name": data["route_name"],
            "route_seq": data["route_seq"],
            "current_bill_month": bill_month,
        }
        batch.append(rec)

        if len(batch) >= batch_size:
            try:
                sb.table("survey_units").upsert(batch, ignore_duplicates=False).execute()
                updated += len(batch)
            except Exception as e:
                print(f"  Error at {updated}: {e}")
                errors += len(batch)
            batch = []
            print(f"  Progress: {updated + len(batch)}/{len(enrichment)}")

    # Final batch
    if batch:
        try:
            sb.table("survey_units").upsert(batch, ignore_duplicates=False).execute()
            updated += len(batch)
        except Exception as e:
            print(f"  Error at final batch: {e}")
            errors += len(batch)

    print(f"\nDone: {updated} updated, {errors} errors")

    # Count how many survey_units now have current_bill_month set
    r = sb.table("survey_units").select("survey_id", count="exact").not_.is_("current_bill_month", "null").execute()
    if hasattr(r, 'count'):
        print(f"survey_units with current_bill_month: {r.count}")

    r = sb.table("survey_units").select("survey_id", count="exact").not_.is_("psid", "null").execute()
    if hasattr(r, 'count'):
        print(f"survey_units with psid: {r.count}")


if __name__ == "__main__":
    main()
