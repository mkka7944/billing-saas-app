#!/usr/bin/env python3
"""
Orchestrator for data ingestion into Supabase.

Wraps enrich-survey-units.py (Phase 2) and load-payments.py (Phase 3)
into a single interactive menu or CLI-driven pipeline.

Usage:
    python scripts/ingest-all.py                     # Interactive menu
    python scripts/ingest-all.py --month May2026     # Full monthly
    python scripts/ingest-all.py --daily             # Payments only
    python scripts/ingest-all.py --month May2026 --dry-run
    python scripts/ingest-all.py --daily --file path/to/file.csv
"""

import os, sys, subprocess, argparse, datetime

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
ENRICH_SCRIPT = os.path.join(SCRIPT_DIR, "enrich-survey-units.py")
PAYMENTS_SCRIPT = os.path.join(SCRIPT_DIR, "load-payments.py")


def run_script(script_path, args_list, label):
    print(f"\n{'='*60}")
    print(f"  [{label}] Running: {os.path.basename(script_path)}")
    print(f"{'='*60}")
    result = subprocess.run(
        [sys.executable, script_path] + args_list,
        capture_output=False,
    )
    return result.returncode


def interactive_menu():
    while True:
        print(f"\n{'='*60}")
        print("  Ingest to Supabase")
        print(f"{'='*60}")
        print("  [1] Full Monthly Import (lifecycle + payments)")
        print("  [2] Daily Update (payments only)")
        print("  [3] Quick Survey Sync (new records only)")
        print("  [q] Quit")
        choice = input("\n  Select: ").strip().lower()

        if choice == "1":
            month = input("  Month (e.g. May2026): ").strip() or "May2026"
            print(f"\n  Full monthly import for {month}...")
            rc1 = run_script(ENRICH_SCRIPT, ["--month", month], "Survey Enrichment")
            rc2 = run_script(PAYMENTS_SCRIPT, [], "Payment Load")
            if rc1 == 0 and rc2 == 0:
                print(f"\n  Full import complete.")
            else:
                print(f"\n  Full import finished with errors (rc: {rc1}, {rc2})")

        elif choice == "2":
            print(f"\n  Daily payment update...")
            rc = run_script(PAYMENTS_SCRIPT, [], "Payment Load")
            if rc == 0:
                print(f"\n  Daily update complete.")
            else:
                print(f"\n  Daily update failed (rc: {rc})")

        elif choice == "3":
            month = input("  Month (e.g. May2026): ").strip() or "May2026"
            print(f"\n  Quick sync for {month}...")
            rc = run_script(ENRICH_SCRIPT, ["--month", month, "--dry-run"], "Dry Run")
            confirm = input(f"\n  Run without --dry-run? (y/N): ").strip().lower()
            if confirm == "y":
                rc = run_script(ENRICH_SCRIPT, ["--month", month], "Survey Enrichment")
                if rc == 0:
                    print(f"\n  Quick sync complete.")
                else:
                    print(f"\n  Quick sync failed (rc: {rc})")
            else:
                print(f"  Skipped.")

        elif choice == "q":
            print("  Goodbye.")
            break
        else:
            print(f"  Invalid choice.")


def main():
    parser = argparse.ArgumentParser(description="Orchestrate data ingestion")
    parser.add_argument("--month", type=str, help="Full monthly import for given month (e.g. May2026)")
    parser.add_argument("--daily", action="store_true", help="Daily payment update only")
    parser.add_argument("--file", type=str, help="Specific CSV file for payment import")
    parser.add_argument("--dry-run", action="store_true", help="Preview mode (no DB writes)")
    args = parser.parse_args()

    # CLI mode
    if args.month:
        enrich_args = ["--month", args.month]
        pay_args = []
        if args.dry_run:
            enrich_args.append("--dry-run")
        if args.file:
            pay_args = ["--file", args.file]
        if args.dry_run:
            pay_args.append("--dry-run")
        rc1 = run_script(ENRICH_SCRIPT, enrich_args, "Survey Enrichment")
        if not args.dry_run:
            rc2 = run_script(PAYMENTS_SCRIPT, pay_args, "Payment Load")
        sys.exit(rc1 if rc1 != 0 else 0)

    if args.daily:
        pay_args = []
        if args.file:
            pay_args = ["--file", args.file]
        if args.dry_run:
            pay_args.append("--dry-run")
        rc = run_script(PAYMENTS_SCRIPT, pay_args, "Payment Load")
        sys.exit(rc)

    # Interactive mode (default)
    interactive_menu()


if __name__ == "__main__":
    main()
