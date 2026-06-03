#!/usr/bin/env python3
"""
Archive Legacy Tables — Phase 0f.6

Reads verified_houses and staff_sync_logs to JSON files in scripts/archive/,
then drops both tables from the database.

Usage:
    python scripts/archive-legacy-tables.py          # Archive then drop
    python scripts/archive-legacy-tables.py --dry-run  # Read + write JSON only (no drop)
"""

import os, sys, json, argparse
from datetime import datetime
from dotenv import load_dotenv
from supabase import create_client

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
ARCHIVE_DIR = os.path.join(SCRIPT_DIR, "archive")
ENV_PATH = os.path.join(os.path.dirname(SCRIPT_DIR), ".env.local")

load_dotenv(ENV_PATH)
SUPABASE_URL = os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")

if not SUPABASE_URL or not SUPABASE_KEY:
    print("Error: NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not found in .env.local")
    sys.exit(1)


def archive_table(sb, table_name: str, archive_path: str) -> int:
    """Fetch all rows from table and write to JSON. Returns row count."""
    print(f"  Reading {table_name}...", end=" ", flush=True)
    rows = []
    page_size = 1000
    offset = 0

    while True:
        resp = sb.table(table_name).select("*").range(offset, offset + page_size - 1).execute()
        data = resp.data if hasattr(resp, 'data') else resp[1] if isinstance(resp, tuple) else []
        if not data:
            break
        rows.extend(data)
        offset += page_size
        if len(data) < page_size:
            break

    os.makedirs(os.path.dirname(archive_path), exist_ok=True)
    with open(archive_path, "w", encoding="utf-8") as f:
        json.dump(rows, f, default=str, indent=2)

    print(f"{len(rows)} rows -> {archive_path}")
    return len(rows)


def print_drop_sql():
    """Print SQL commands to drop legacy tables."""
    print("\nRun this SQL in the Supabase SQL Editor:")
    print("-- Drop legacy tables (Phase 0f.6)")
    print("DROP TABLE IF EXISTS public.verified_houses CASCADE;")
    print("DROP TABLE IF EXISTS public.staff_sync_logs CASCADE;")


def main():
    parser = argparse.ArgumentParser(description="Archive and drop legacy tables")
    parser.add_argument("--dry-run", action="store_true", help="Read + write JSON only, do not drop tables")
    args = parser.parse_args()

    sb = create_client(SUPABASE_URL, SUPABASE_KEY)
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")

    tables = [
        ("verified_houses", f"verified_houses_{timestamp}.json"),
        ("staff_sync_logs", f"staff_sync_logs_{timestamp}.json"),
    ]

    total_rows = 0
    for table_name, filename in tables:
        archive_path = os.path.join(ARCHIVE_DIR, filename)
        count = archive_table(sb, table_name, archive_path)
        total_rows += count

    print(f"\nTotal rows archived: {total_rows}")
    print(f"Archive files in: {ARCHIVE_DIR}/")
    print_drop_sql()


if __name__ == "__main__":
    main()
