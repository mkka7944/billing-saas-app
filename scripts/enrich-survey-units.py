#!/usr/bin/env python3
"""
Enrich survey_units from Lifecycle XLSX

Reads current month lifecycle files and updates survey_units with all 19 fields:
  psid, monthly_fee, billing_category, arrears,
  route_name, route_seq, current_bill_month,
  consumer_name, address, city_district, tehsil, uc_name,
  surveyor_name, survey_date, survey_time, lat, lng,
  start_month, status

Usage:
    python scripts/enrich-survey-units.py
    python scripts/enrich-survey-units.py --dry-run
"""

import os, sys, json, math, re, argparse, datetime
from collections import defaultdict
import pandas as pd
from dotenv import load_dotenv
from supabase import create_client

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
LOCAL_PDFS = os.path.join(SCRIPT_DIR, "data", "processed_pdfs")
OFFICE_PC_PDFS = r"F:\qoder\billing-system\01_Local_Engine\outputs\processed_pdfs"
PROCESSED_PDFS = OFFICE_PC_PDFS if os.path.exists(OFFICE_PC_PDFS) else LOCAL_PDFS
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
    month_order = {
        "Jan": 1, "Feb": 2, "Mar": 3, "Apr": 4,
        "May": 5, "Jun": 6, "Jul": 7, "Aug": 8,
        "Sep": 9, "Oct": 10, "Nov": 11, "Dec": 12
    }
    def sort_key(fname):
        m = re.search(r"(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)(20[0-9]{2})", fname)
        if m:
            return (int(m.group(2)), month_order.get(m.group(1), 0))
        return (0, 0)
    latest = []
    for city, files in city_files.items():
        files.sort(key=sort_key, reverse=True)
        latest.append(files[0])
        if len(files) > 1:
            print(f"  {city}: using {files[0]} (skipping {len(files)-1} older)")
    return sorted(latest)


def main():
    parser = argparse.ArgumentParser(description="Enrich survey_units from lifecycle XLSX")
    parser.add_argument("--dry-run", action="store_true", help="Process files but skip upload")
    parser.add_argument("--month", type=str, default="May2026", help="Month filter (e.g. May2026)")
    parser.add_argument("--exclude-ghosts", action="store_true", help="Skip PSIDs in flagged_psids table")
    args = parser.parse_args()
    started_at = datetime.datetime.now(datetime.timezone.utc)

    sb = create_client(SUPABASE_URL, SUPABASE_KEY)

    # Load flagged PSIDs and flagged SIDs to exclude
    excluded_psids = set()
    excluded_sids = set()
    if args.exclude_ghosts:
        try:
            r = sb.table("flagged_psids").select("psid,survey_id").execute()
            for row in r.data:
                if row.get("psid"):
                    excluded_psids.add(row["psid"])
                if row.get("survey_id"):
                    excluded_sids.add(row["survey_id"].upper())
            print(f"Excluding {len(excluded_psids)} flagged PSIDs, {len(excluded_sids)} flagged SIDs")
        except Exception as e:
            print(f"Warning: could not load flagged_psids: {e}")

    # Load column mappings
    lc = {}
    if os.path.exists(COLUMN_MAP_PATH):
        with open(COLUMN_MAP_PATH) as f:
            col_map = json.load(f)
        lc = col_map.get("lifecycle", {})

    psid_col = lc.get("psid", "Biller PSID")
    sid_col = lc.get("survey_id", "Survey ID")
    arrears_col = lc.get("arrears", "Arrears")
    fee_col = lc.get("monthly_fee", "Monthly Fee")
    cat_col = lc.get("billing_category", "Billing Category")
    route_col = lc.get("route_name", "Route Segment")
    route_seq_col = lc.get("route_seq", "Route Seq")
    name_col = lc.get("consumer_name", "Name")
    address_col = lc.get("address", "Address")
    city_col_candidates = lc.get("city", ["City Name", "City", "District"])
    tehsil_col = lc.get("tehsil", "Tehsil")
    uc_col = lc.get("uc_name", "UC")
    surveyor_col = lc.get("surveyor_name", "Surveyor Name")
    survey_date_col = lc.get("survey_date", "Survey Date")
    survey_time_col = lc.get("survey_time", "Survey Time")
    lat_col = lc.get("latitude", "Lat")
    lng_col = lc.get("longitude", "Lng")
    start_month_col = lc.get("start_month", "Start Month")
    deleted_col = lc.get("deleted_in_portal", "Deleted in Portal")

    def safe_str(val):
        if pd.isna(val):
            return ""
        s = str(val).strip()
        return s if s.upper() != "NAN" else ""

    def first_found(candidates, row):
        if isinstance(candidates, list):
            for c in candidates:
                v = row.get(c, "")
                if pd.notna(v) and str(v).strip():
                    return str(v).strip()
            return safe_str(row.get(candidates[0], ""))
        return safe_str(row.get(candidates, ""))

    # Find lifecycle files
    files = [f for f in find_latest_lifecycle_files() if args.month in f]
    if not files:
        print(f"No lifecycle files found for {args.month}")
        sys.exit(1)

    print(f"Loading {len(files)} lifecycle files...")

    # Build enrichment map: survey_id -> {psid, monthly_fee, amount_due, arrears, ...}
    enrichment = {}
    seen_surveys = set()
    all_psids_for_sid = defaultdict(set)  # SID -> {all PSIDs seen across all rows}

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

            # Track ALL PSIDs for duplicate detection (before exclude check)
            all_psids_for_sid[sid].add(psid)

            if excluded_psids and psid in excluded_psids:
                continue

            if sid not in seen_surveys:
                seen_surveys.add(sid)
                deleted = safe_str(row.get(deleted_col, "")).upper()
                # Force archive if SID is in flagged_psids (from SID-zubair or admin)
                if args.exclude_ghosts and sid in excluded_sids:
                    deleted = "YES"
                enrichment[sid] = {
                    "psid": psid,
                    "monthly_fee": safe_int(row.get(fee_col, "0")),
                    "billing_category": str(row.get(cat_col, "")).strip().upper()[:10],
                    "arrears": safe_int(row.get(arrears_col, "0")),
                    "route_name": safe_str(row.get(route_col, "")) or None,
                    "route_seq": safe_int(row.get(route_seq_col, "0")),
                    "consumer_name": safe_str(row.get(name_col, "")),
                    "address": safe_str(row.get(address_col, "")),
                    "city_district": first_found(city_col_candidates, row).upper(),
                    "tehsil": safe_str(row.get(tehsil_col, "")).upper(),
                    "uc_name": safe_str(row.get(uc_col, "")),
                    "surveyor_name": safe_str(row.get(surveyor_col, "")),
                    "survey_date": safe_str(row.get(survey_date_col, "")) or None,
                    "survey_time": safe_str(row.get(survey_time_col, "")) or None,
                    "lat": safe_float(row.get(lat_col, 0)),
                    "lng": safe_float(row.get(lng_col, 0)),
                    "start_month": safe_str(row.get(start_month_col, "")).upper(),
                    "status": "ARCHIVED" if deleted == "YES" else None,
                }
            else:
                # Multiple rows for same survey — keep first occurrence, skip extras
                pass

            count += 1

        print(f"  {lf}: {count} rows -> {len(seen_surveys)} unique survey_ids so far")

    print(f"Total survey_ids to enrich: {len(enrichment)}")

    # Write lifecycle deletions to flagged_psids
    dup_flagged = 0
    if args.exclude_ghosts:
        flagged_batch = []
        for sid, data in enrichment.items():
            if data["status"] == "ARCHIVED" and sid not in excluded_sids:
                flagged_batch.append({
                    "psid": data["psid"],
                    "reason": "portal_deleted",
                    "survey_id": sid,
                    "notes": "Deleted in Portal from lifecycle file",
                })
                if len(flagged_batch) >= 500:
                    try:
                        sb.table("flagged_psids").upsert(
                            flagged_batch, on_conflict="psid,reason"
                        ).execute()
                    except Exception as e:
                        print(f"  Error flagging portal_deleted: {e}")
                    flagged_batch = []
        if flagged_batch:
            try:
                sb.table("flagged_psids").upsert(
                    flagged_batch, on_conflict="psid,reason"
                ).execute()
            except Exception as e:
                print(f"  Error flagging portal_deleted (final): {e}")
        flagged_count = sum(1 for sid, d in enrichment.items() if d["status"] == "ARCHIVED" and sid not in excluded_sids)
        print(f"  Flagged portal_deleted: {flagged_count}")

        # --- PSID Duplicate Detection ---
        dup_sids = {sid: psids for sid, psids in all_psids_for_sid.items() if len(psids) >= 2}
        print(f"  SIDs with 2+ PSIDs: {len(dup_sids)}")

        if dup_sids:
            # Bulk-fetch payment history for all PSIDs involved
            all_dup_psids = set()
            for psids in dup_sids.values():
                all_dup_psids.update(psids)
            paid_psids = set()
            try:
                r = sb.table("payment_history").select("psid").eq("payment_status", "paid").execute()
                paid_psids = {row["psid"] for row in r.data}
            except Exception as e:
                print(f"  Warning: could not load payment_history: {e}")

            dup_flag_batch = []
            for sid, psids in dup_sids.items():
                keeper = enrichment[sid]["psid"]
                surplus = [p for p in psids if p != keeper and p not in excluded_psids]
                for sp in surplus:
                    has_payment = sp in paid_psids
                    reason = "psid_duplicate_superseded" if has_payment else "psid_duplicate_orphan"
                    dup_flag_batch.append({
                        "psid": sp,
                        "reason": reason,
                        "survey_id": sid,
                        "notes": f"Keeper: {keeper}. This PSID {'had payments' if has_payment else 'never paid'}.",
                    })
                    if len(dup_flag_batch) >= 500:
                        try:
                            sb.table("flagged_psids").upsert(
                                dup_flag_batch, on_conflict="psid,reason"
                            ).execute()
                            dup_flagged += len(dup_flag_batch)
                        except Exception as e:
                            print(f"  Error flagging duplicates: {e}")
                        dup_flag_batch = []
            if dup_flag_batch:
                try:
                    sb.table("flagged_psids").upsert(
                        dup_flag_batch, on_conflict="psid,reason"
                    ).execute()
                    dup_flagged += len(dup_flag_batch)
                except Exception as e:
                    print(f"  Error flagging duplicates (final): {e}")
            print(f"  Surplus PSIDs flagged: {dup_flagged}")

    if not enrichment:
        print("Nothing to do.")
        return

    # Diff report: check which survey_ids already exist
    if args.dry_run:
        print(f"\nDRY RUN: Would update {len(enrichment)} survey_units rows")
        return

    print(f"\nComputing diff...")
    existing_ids = set()
    all_sids = list(enrichment.keys())
    for i in range(0, len(all_sids), 1000):
        chunk = all_sids[i:i+1000]
        try:
            r = sb.table("survey_units").select("survey_id").in_("survey_id", chunk).execute()
            existing_ids.update(row["survey_id"] for row in r.data)
        except Exception as e:
            print(f"  Warning: diff query at offset {i}: {e}")
    new_count = len(all_sids) - len(existing_ids)
    update_count = len(existing_ids)
    print(f"  New: {new_count}  Existing (will update): {update_count}  Skipped (ghosts): {len(excluded_psids)}  Flagged SIDs: {len(excluded_sids)}")

    # Update survey_units in batches
    print(f"\nUpdating survey_units ({len(enrichment)} rows)...")
    batch = []
    batch_size = 500
    upserted = 0
    errors = 0

    for sid, data in enrichment.items():
        rec = {
            "survey_id": sid,
            "psid": data["psid"],
            "monthly_fee": data["monthly_fee"],
            "billing_category": data["billing_category"] if data["billing_category"] and data["billing_category"] != "NAN" else "UNKNOWN",
            "arrears": data["arrears"],
            "route_name": data["route_name"],
            "route_seq": data["route_seq"],
            "current_bill_month": bill_month,
            "consumer_name": data["consumer_name"],
            "address": data["address"],
            "city_district": data["city_district"],
            "tehsil": data["tehsil"],
            "uc_name": data["uc_name"],
            "surveyor_name": data["surveyor_name"],
            "survey_date": data["survey_date"] or None,
            "survey_time": data["survey_time"] or None,
            "lat": data["lat"] if data["lat"] else None,
            "lng": data["lng"] if data["lng"] else None,
            "start_month": data["start_month"],
        }
        rec["status"] = data["status"]
        batch.append(rec)

        if len(batch) >= batch_size:
            try:
                sb.table("survey_units").upsert(batch, ignore_duplicates=False).execute()
                upserted += len(batch)
            except Exception as e:
                print(f"  Error at {upserted}: {e}")
                errors += len(batch)
            batch = []
            print(f"  Progress: {upserted}/{len(enrichment)}")

    # Final batch
    if batch:
        try:
            sb.table("survey_units").upsert(batch, ignore_duplicates=False).execute()
            upserted += len(batch)
        except Exception as e:
            print(f"  Error at final batch: {e}")
            errors += len(batch)

    print(f"\nDone: {upserted} upserted ({new_count} new, {update_count} updated), {errors} errors, {len(excluded_psids)} skipped")

    # Sync reference tables
    print(f"\nSyncing reference tables...")
    try:
        surveyor_names = {d["surveyor_name"] for d in enrichment.values() if d["surveyor_name"]}
        for name in surveyor_names:
            sb.table("surveyors").upsert({"name": name}, on_conflict="name").execute()
        print(f"  surveyors: {len(surveyor_names)} names")
        sb.table("bill_months").upsert({"month": bill_month}, on_conflict="month").execute()
        print(f"  bill_months: {bill_month}")
    except Exception as e:
        print(f"  Error syncing reference tables: {e}")

    # Write audit log to ingest_log
    completed_at = datetime.datetime.now(datetime.timezone.utc)
    duration_ms = int((completed_at - started_at).total_seconds() * 1000)
    cities = sorted({d["city_district"] for d in enrichment.values() if d["city_district"]})
    try:
        log_entry = {
            "script_name": "enrich-survey-units",
            "bill_month": bill_month,
            "city_district": ", ".join(cities) if cities else "ALL",
            "status": "partial" if errors > 0 and upserted > 0 else ("failed" if errors > 0 else "success"),
            "rows_processed": len(enrichment),
            "rows_inserted": new_count,
            "rows_updated": update_count,
            "rows_errors": errors,
            "error_message": None if errors == 0 else f"{errors} batch errors during upsert",
            "started_at": started_at.isoformat(),
            "completed_at": completed_at.isoformat(),
            "metadata": {
                "files": files,
                "excluded_psids": len(excluded_psids),
                "excluded_sids": len(excluded_sids),
                "duplicates_flagged": dup_flagged,
                "duration_ms": duration_ms,
            }
        }
        sb.table("ingest_log").insert(log_entry).execute()
        print(f"  ingest_log: written ({duration_ms}ms)")
    except Exception as e:
        print(f"  Error writing ingest_log: {e}")


if __name__ == "__main__":
    main()
