#!/usr/bin/env python3
"""
Export ALL lifecycle data to public/data/bills.json

Reads every lifecycle XLSX (all months, all cities) and writes
a flat JSON array to public/data/bills.json.

Output format:
  [{"psid": "...", "bill_month": "MAY2026", "amount_due": 1000, "arrears": 0}, ...]

Usage:
    python scripts/export-bills-json.py
"""

import os, sys, json, re, math
from collections import defaultdict
import pandas as pd

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROCESSED_PDFS = os.path.join(SCRIPT_DIR, "data", "processed_pdfs")
OUTPUT_PATH = os.path.join(SCRIPT_DIR, "..", "public", "data", "bills.json")
COLUMN_MAP_PATH = os.path.join(SCRIPT_DIR, "column_mapping.json")


def safe_int(val):
    try:
        return int(float(str(val).strip()))
    except (ValueError, TypeError):
        return 0


def main():
    if not os.path.exists(PROCESSED_PDFS):
        print(f"Error: {PROCESSED_PDFS} not found")
        sys.exit(1)

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

    # Find ALL lifecycle files (not just latest per city)
    all_files = sorted(
        f for f in os.listdir(PROCESSED_PDFS)
        if "test_lifecycle" in f.lower() and f.endswith(".xlsx") and not f.startswith("~$")
    )

    if not all_files:
        print("No lifecycle files found")
        sys.exit(1)

    print(f"Found {len(all_files)} lifecycle files")
    records = []
    seen = set()

    for lf in all_files:
        match = re.search(r"(Apr|Aug|Dec|Feb|Jan|Jul|Jun|Mar|May|Nov|Oct|Sep)(20[0-9]{2})", lf)
        bill_month = match.group(1).upper()[:3] + match.group(2) if match else "UNKNOWN"

        try:
            df = pd.read_excel(os.path.join(PROCESSED_PDFS, lf), engine="openpyxl", dtype=str,
                               usecols=[psid_col, sid_col, amount_col, arrears_col])
        except Exception as e:
            print(f"  Error reading {lf}: {e}")
            continue

        count = 0
        for _, row in df.iterrows():
            psid_raw = row.get(psid_col)
            if pd.isna(psid_raw):
                continue
            psid = f"{int(float(psid_raw))}" if isinstance(psid_raw, (float, int)) else str(psid_raw).strip()
            if not psid:
                continue

            key = (psid, bill_month)
            if key in seen:
                continue
            seen.add(key)

            sid = str(row.get(sid_col, "")).strip().upper()
            if not sid or sid == "NAN":
                sid = ""

            records.append({
                "psid": psid,
                "survey_id": sid,
                "bill_month": bill_month,
                "amount_due": safe_int(row.get(amount_col, "0")),
                "arrears": safe_int(row.get(arrears_col, "0")),
            })
            count += 1

        print(f"  {lf}: {count} records")

    print(f"\nTotal: {len(records)} records")

    # Write output
    os.makedirs(os.path.dirname(OUTPUT_PATH), exist_ok=True)
    with open(OUTPUT_PATH, "w", encoding="utf-8") as f:
        json.dump(records, f, indent=2)

    file_size = os.path.getsize(OUTPUT_PATH)
    print(f"Written: {OUTPUT_PATH} ({file_size / 1024 / 1024:.1f} MB)")


if __name__ == "__main__":
    main()
