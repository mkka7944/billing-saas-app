#!/usr/bin/env python3
"""
Pre-compute Data Insight KPIs from payment + survey data

Reads payments.json and generates aggregate KPIs by district/tehsil/UC.

Usage:
    python scripts/export-kpis-json.py
"""

import os, sys, json
from collections import defaultdict

PROJECT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BILLS_PATH = os.path.join(PROJECT_DIR, "public", "data", "bills.json")
PAYMENTS_PATH = os.path.join(PROJECT_DIR, "public", "data", "payments.json")
OUTPUT_PATH = os.path.join(PROJECT_DIR, "public", "data", "kpis.json")


def main():
    # Load payments
    if not os.path.exists(PAYMENTS_PATH):
        print(f"Error: {PAYMENTS_PATH} not found")
        sys.exit(1)

    with open(PAYMENTS_PATH, "r") as f:
        payments = json.load(f)

    # Aggregate by bill_month
    monthly = defaultdict(lambda: {"total_paid": 0, "total_collected": 0})
    for p in payments:
        m = p["bill_month"]
        monthly[m]["total_paid"] += 1
        monthly[m]["total_collected"] += p["amount_paid"]

    # Sort by month
    sorted_months = sorted(monthly.keys(), reverse=True)

    kpis = {
        "months": sorted_months,
        "monthly": {m: monthly[m] for m in sorted_months},
        "grand_totals": {
            "total_payments": len(payments),
            "total_collected": sum(p["amount_paid"] for p in payments),
        }
    }

    with open(OUTPUT_PATH, "w") as f:
        json.dump(kpis, f, indent=2)

    print(f"Written: {OUTPUT_PATH}")


if __name__ == "__main__":
    main()
