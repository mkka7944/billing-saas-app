#!/usr/bin/env python3
"""
Export payment data to public/data/payments.json

Reads payment CSV files and writes a flat JSON array.

Output format:
  [{"psid": "...", "bill_month": "APR2026", "amount_paid": 500}, ...]

Usage:
    python scripts/export-payments-json.py
"""

import os, sys, json, math
import pandas as pd

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
SCRAPED_DATA = os.path.join(SCRIPT_DIR, "data", "scraped_data")
OUTPUT_PATH = os.path.join(SCRIPT_DIR, "..", "public", "data", "payments.json")


def safe_int(val):
    try:
        return int(float(str(val).strip()))
    except (ValueError, TypeError):
        return 0


def main():
    if not os.path.exists(SCRAPED_DATA):
        print(f"Error: {SCRAPED_DATA} not found")
        sys.exit(1)

    # Read all payment history files, deduplicate by (psid, bill_month)
    files = sorted(
        f for f in os.listdir(SCRAPED_DATA)
        if "PAID_ALL_HISTORY" in f.upper() and f.endswith(".csv") and not f.startswith("~$")
    )
    # Process combined file first so city-specific files override if needed
    files.sort(key=lambda x: (0 if "COMBINED" in x.upper() else 1))
    # Also include COMBINED_ALL_CITIES
    combined = [f for f in os.listdir(SCRAPED_DATA) if "COMBINED_ALL_CITIES" in f and f.endswith(".csv")]

    records = []
    seen = set()

    for csv_file in combined + files:
        path = os.path.join(SCRAPED_DATA, csv_file)
        if not os.path.exists(path):
            continue
        try:
            df = pd.read_csv(path, encoding="utf-8-sig", engine="python", dtype=str)
        except Exception as e:
            print(f"  Error reading {csv_file}: {e}")
            continue

        count = 0
        for _, row in df.iterrows():
            psid = str(row.get("PSID", "")).strip()
            if not psid:
                continue
            month = str(row.get("Month", "")).upper().strip()
            if not month or month == "NAN":
                continue

            key = (psid, month)
            if key in seen:
                continue
            seen.add(key)

            records.append({
                "psid": psid,
                "bill_month": month,
                "amount_paid": safe_int(row.get("Paid Amount", "0")),
            })
            count += 1

        print(f"  {csv_file}: {count} records")

    print(f"\nTotal: {len(records)} records")

    os.makedirs(os.path.dirname(OUTPUT_PATH), exist_ok=True)
    with open(OUTPUT_PATH, "w", encoding="utf-8") as f:
        json.dump(records, f, indent=2)

    file_size = os.path.getsize(OUTPUT_PATH)
    print(f"Written: {OUTPUT_PATH} ({file_size / 1024 / 1024:.1f} MB)")


if __name__ == "__main__":
    main()
