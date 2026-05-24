#!/usr/bin/env python3
"""
In-place data fix: bill_month + city in bill_items table.
Fixes data uploaded before regex/column mapping fixes.
"""

import os
from dotenv import load_dotenv
from supabase import create_client

load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env.local"))
url = os.getenv("NEXT_PUBLIC_SUPABASE_URL")
key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
sup = create_client(url, key)

BATCH = 1000

def fix_bill_month():
    print("Fixing bill_month...")
    total = 0
    for bad in ("BHAMay", "SARMay", "KHUMay"):
        data = sup.table("bill_items").select("psid").eq("bill_month", bad).limit(BATCH).execute()
        while data.data:
            psids = [r["psid"] for r in data.data]
            sup.table("bill_items").update({"bill_month": "MAY2026"}).in_("psid", psids).execute()
            total += len(psids)
            print(f"  [{bad}] Updated {total} rows...")
            data = sup.table("bill_items").select("psid").eq("bill_month", bad).limit(BATCH).execute()
    print(f"  bill_month fix done: {total} rows")

def fix_city():
    print("Fixing city...")
    total = 0
    patterns = [
        ("%BHALWAL%", "BHALWAL"), ("%SARGODHA%", "SARGODHA"), ("%KHUSHAB%", "KHUSHAB"),
        ("ZONE-02/KHUSHAB%", "KHUSHAB"), ("ZONE-01/MITHA TIWANA%", "KHUSHAB"),
        ("ZONE-02/JAUHARABAD%", "SARGODHA"), ("ZONE-02/HADALI%", "BHALWAL"),
        ("KHB%", "KHUSHAB"), ("JBD%", "SARGODHA"),
    ]
    for pat, city in patterns:
        data = sup.table("bill_items").select("psid").is_("city", "null").like("uc_name", pat).limit(BATCH).execute()
        while data.data:
            psids = [r["psid"] for r in data.data]
            sup.table("bill_items").update({"city": city}).in_("psid", psids).execute()
            total += len(psids)
            print(f"  [{city}] {len(psids)} rows...")
            data = sup.table("bill_items").select("psid").is_("city", "null").like("uc_name", pat).limit(BATCH).execute()
    # remaining null cities → BHALWAL (all are MC-X Bhalwal names without city suffix)
    data = sup.table("bill_items").select("psid").is_("city", "null").limit(BATCH).execute()
    while data.data:
        psids = [r["psid"] for r in data.data]
        sup.table("bill_items").update({"city": "BHALWAL"}).in_("psid", psids).execute()
        total += len(psids)
        print(f"  [BHALWAL/fallback] {len(psids)} rows...")
        data = sup.table("bill_items").select("psid").is_("city", "null").limit(BATCH).execute()
    print(f"  city fix done: {total} rows")

if __name__ == "__main__":
    fix_bill_month()
    fix_city()
    print("All fixes applied")
