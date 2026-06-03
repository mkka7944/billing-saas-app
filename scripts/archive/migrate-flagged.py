#!/usr/bin/env python3
"""
One-time migration: populate flagged_psids from SID-zubair + PSID dedup.

Steps:
  1. Read SID-zubair.xlsx → upsert to flagged_psids + archive survey_units
  2. Find active SIDs with 2+ PSIDs → pick keeper via payment_history → surplus to flagged_psids
  3. Refresh hierarchy_summary

Usage:
    python scripts/migrate-flagged.py --dry-run
    python scripts/migrate-flagged.py
"""

import os, sys, json, math, argparse, datetime, subprocess, tempfile
from collections import defaultdict
import pandas as pd
from dotenv import load_dotenv
from supabase import create_client

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
ENV_PATH = os.path.join(os.path.dirname(SCRIPT_DIR), ".env.local")
SID_ZUBAIR_PATH = r"F:\qoder\billing-system\01_Local_Engine\inputs\SID-zubair.xlsx"
LOCAL_SID_ZUBAIR = os.path.join(SCRIPT_DIR, "data", "inputs", "SID-zubair.xlsx")
LIFECYCLE_DIR = r"F:\qoder\billing-system\01_Local_Engine\outputs\processed_pdfs"

load_dotenv(ENV_PATH)
SUPABASE_URL = os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")

if not SUPABASE_URL or not SUPABASE_KEY:
    print("Error: SUPABASE env vars not found")
    sys.exit(1)


def sb_query(sql):
    """Execute SQL via Management API."""
    import subprocess, tempfile, os
    from dotenv import load_dotenv
    load_dotenv(ENV_PATH)
    token = os.environ.get("SUPABASE_ACCESS_TOKEN")
    if not token:
        print("Error: SUPABASE_ACCESS_TOKEN not found in .env.local")
        return None
    payload = json.dumps({"query": sql})
    with tempfile.NamedTemporaryFile(mode="w", suffix=".json", delete=False, encoding="utf-8") as f:
        f.write(payload)
        fp = f.name
    r = subprocess.run(
        ["curl.exe", "-s", "-X", "POST",
         "https://api.supabase.com/v1/projects/qrxbsoqepfaryolwcedk/database/query",
         "-H", f"Authorization: Bearer {token}",
         "-H", "Content-Type: application/json",
         "-d", f"@{fp}"],
        capture_output=True, text=True, timeout=60
    )
    os.unlink(fp)
    if r.returncode != 0:
        print(f"  curl error: {r.stderr[:200]}")
        return None
    try:
        return json.loads(r.stdout)
    except json.JSONDecodeError:
        print(f"  JSON parse error: {r.stdout[:200]}")
        return None


def step1_import_sid_zubair(sb, args):
    """Read SID-zubair.xlsx → upsert flagged_psids + archive survey_units."""
    print(f"\n{'='*60}")
    print("  STEP 1: Import SID-zubair deletions")
    print(f"{'='*60}")

    sid_path = SID_ZUBAIR_PATH if os.path.exists(SID_ZUBAIR_PATH) else (
        LOCAL_SID_ZUBAIR if os.path.exists(LOCAL_SID_ZUBAIR) else None
    )
    if not sid_path:
        print("  SID-zubair.xlsx not found")
        return 0

    print(f"  Reading: {sid_path}")
    df = pd.read_excel(sid_path, engine="openpyxl", dtype=str)
    sids = set(str(s).strip().split(".")[0] for s in df["SID"] if pd.notna(s))
    print(f"  Total SIDs in file: {len(sids)}")

    if args.dry_run:
        print(f"  DRY RUN: Would upsert {len(sids)} SIDs to flagged_psids")
        print(f"  DRY RUN: Would set status='ARCHIVED' for matching survey_units")
        return 0

    # Upsert to flagged_psids in batches
    batch = []
    batch_size = 500
    flagged = 0
    for sid in sorted(sids):
        batch.append({
            "psid": sid,
            "reason": "field_deleted",
            "survey_id": sid,
            "notes": "Imported from SID-zubair.xlsx during migration",
        })
        if len(batch) >= batch_size:
            try:
                sb.table("flagged_psids").upsert(
                    batch, on_conflict="psid,reason"
                ).execute()
                flagged += len(batch)
            except Exception as e:
                print(f"  Error at {flagged}: {e}")
            batch = []
    if batch:
        try:
            sb.table("flagged_psids").upsert(
                batch, on_conflict="psid,reason"
            ).execute()
            flagged += len(batch)
        except Exception as e:
            print(f"  Error at final batch: {e}")
    print(f"  Flagged PSIDs inserted: {flagged}")

    # Archive matching survey_units (where not already archived)
    archived = 0
    error_arch = 0
    all_sids = sorted(sids)
    for i in range(0, len(all_sids), batch_size):
        chunk = all_sids[i:i + batch_size]
        try:
            r = sb.table("survey_units").update(
                {"status": "ARCHIVED"}
            ).in_("survey_id", chunk).neq("status", "ARCHIVED").execute()
            archived += len(r.data)
        except Exception as e:
            print(f"  Error archiving at offset {i}: {e}")
            error_arch += len(chunk)
        if (i + batch_size) % 2000 == 0 or (i + batch_size) >= len(all_sids):
            print(f"  Archived: {archived} so far...")
    print(f"  Survey units archived: {archived}, errors: {error_arch}")

    return flagged + archived


def step2_psid_dedup(sb, args):
    """Find active SIDs with 2+ PSIDs in survey_units → pick keeper via payment_history."""
    print(f"\n{'='*60}")
    print("  STEP 2: PSID Deduplication")
    print(f"{'='*60}")

    # Query DB for SIDs with 2+ PSIDs that are active
    print("  Querying survey_units for duplicate PSIDs...")
    r = sb.table("survey_units").select("survey_id,psid").neq("status", "ARCHIVED").execute()
    if not r.data:
        print("  No survey_units found")
        return 0, 0

    sid_psids = defaultdict(set)
    for row in r.data:
        sid = (row.get("survey_id") or "").strip().upper()
        psid = (row.get("psid") or "").strip()
        if sid and psid:
            sid_psids[sid].add(psid)

    dup_sids = {sid: psids for sid, psids in sid_psids.items() if len(psids) >= 2}
    print(f"  Active SIDs with 2+ PSIDs: {len(dup_sids)}")

    if not dup_sids:
        print("  No duplicates to process.")
        return 0, 0

    if args.dry_run:
        print(f"  DRY RUN: Would process {len(dup_sids)} duplicate SIDs")
        for sid, psids in list(dup_sids.items())[:10]:
            print(f"    {sid}: {sorted(psids)}")
        return 0, 0

    # Get current psid for each dup SID
    dup_sid_list = list(dup_sids.keys())
    current_psids = {}
    for i in range(0, len(dup_sid_list), 1000):
        chunk = dup_sid_list[i:i + 1000]
        try:
            r2 = sb.table("survey_units").select("survey_id,psid").in_("survey_id", chunk).execute()
            for row in r2.data:
                if row["survey_id"] in dup_sids:
                    current_psids[row["survey_id"]] = row.get("psid", "")
        except Exception as e:
            print(f"  Error at offset {i}: {e}")

    # Build payment history cache
    print("  Loading payment_history cache...")
    paid_psids = set()
    try:
        r3 = sb.table("payment_history").select("psid").eq("payment_status", "paid").execute()
        paid_psids = {row["psid"] for row in r3.data}
        print(f"  PSIDs with payment history: {len(paid_psids)}")
    except Exception as e:
        print(f"  Warning: could not load payment_history: {e}")

    # Also load all flagged PSIDs so we don't double-flag
    already_flagged = set()
    try:
        r4 = sb.table("flagged_psids").select("psid").execute()
        already_flagged = {row["psid"] for row in r4.data}
    except Exception:
        pass

    batch_flags = []
    flagged_count = 0
    dedup_count = 0

    for sid, psids in dup_sids.items():
        psid_list = sorted(psids)
        current = current_psids.get(sid, "")

        # Determine keeper
        paid_list = [p for p in psid_list if p in paid_psids]
        if len(paid_list) >= 1:
            keeper = paid_list[0]
        else:
            keeper = psid_list[0]

        # Flag surplus PSIDs (only if not already flagged)
        surplus = [p for p in psid_list if p != keeper and p not in already_flagged]
        for sp in surplus:
            batch_flags.append({
                "psid": sp,
                "reason": "duplicate_psid_no_payment",
                "survey_id": sid,
                "notes": f"Keeper: {keeper}",
            })
            already_flagged.add(sp)

        # Batch write flagged PSIDs
        if len(batch_flags) >= 500:
            try:
                sb.table("flagged_psids").upsert(
                    batch_flags, on_conflict="psid,reason"
                ).execute()
                flagged_count += len(batch_flags)
            except Exception as e:
                print(f"  Error flagging: {e}")
            batch_flags = []

        # Update survey_units if keeper differs from current
        if keeper != current:
            try:
                sb.table("survey_units").update({"psid": keeper}).eq("survey_id", sid).execute()
                dedup_count += 1
            except Exception as e:
                print(f"  Error updating {sid}: {e}")

    if batch_flags:
        try:
            sb.table("flagged_psids").upsert(
                batch_flags, on_conflict="psid,reason"
            ).execute()
            flagged_count += len(batch_flags)
        except Exception as e:
            print(f"  Error flagging final batch: {e}")

    print(f"  Surplus PSIDs flagged: {flagged_count}")
    print(f"  Survey units PSID updated: {dedup_count}")
    return flagged_count, dedup_count


def step3_refresh_hierarchy(args):
    """Refresh hierarchy_summary for affected months."""
    print(f"\n{'='*60}")
    print("  STEP 3: Refresh hierarchy_summary")
    print(f"{'='*60}")

    months = ["May2026"]
    print(f"  Refreshing months: {months}")

    if args.dry_run:
        print("  DRY RUN: Would refresh hierarchy_summary")
        return 0

    for m in months:
        print(f"  Refreshing {m}...")
        r = sb_query(f"SELECT refresh_hierarchy_summary('{m}');")
        if r:
            print(f"    Done.")
        else:
            print(f"    Failed.")
    return len(months)


def main():
    parser = argparse.ArgumentParser(description="One-time flagged PSID migration")
    parser.add_argument("--dry-run", action="store_true", help="Preview without writing")
    parser.add_argument("--step", type=int, choices=[1, 2, 3], help="Run specific step only")
    args = parser.parse_args()

    started_at = datetime.datetime.now(datetime.timezone.utc)

    sb = create_client(SUPABASE_URL, SUPABASE_KEY)

    results = {}

    if args.step is None or args.step == 1:
        results["step1"] = step1_import_sid_zubair(sb, args)

    if args.step is None or args.step == 2:
        results["step2_flagged"], results["step2_dedup"] = step2_psid_dedup(sb, args)

    if args.step is None or args.step == 3:
        results["step3"] = step3_refresh_hierarchy(args)

    if not args.dry_run:
        completed_at = datetime.datetime.now(datetime.timezone.utc)
        duration_ms = int((completed_at - started_at).total_seconds() * 1000)
        try:
            log_entry = {
                "script_name": "migrate-flagged",
                "bill_month": "MIGRATION",
                "status": "success",
                "rows_processed": results.get("step1", 0) + results.get("step2_flagged", 0),
                "rows_inserted": results.get("step1", 0),
                "rows_updated": results.get("step2_dedup", 0),
                "rows_errors": 0,
                "error_message": None,
                "started_at": started_at.isoformat(),
                "completed_at": completed_at.isoformat(),
                "metadata": {
                    "duration_ms": duration_ms,
                    "sid_zubair_flagged": results.get("step1", 0),
                    "psid_dedup_flagged": results.get("step2_flagged", 0),
                    "psid_dedup_updated": results.get("step2_dedup", 0),
                    "hierarchy_refreshed": results.get("step3", 0),
                }
            }
            sb.table("ingest_log").insert(log_entry).execute()
            print(f"\n  ingest_log: written ({duration_ms}ms)")
        except Exception as e:
            print(f"  Error writing ingest_log: {e}")

    print(f"\n{'='*60}")
    print("  Migration complete")
    print(f"{'='*60}")


if __name__ == "__main__":
    main()
