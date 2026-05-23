#!/usr/bin/env python3
"""
Historical Data Migration — CSV/XLSX → billing Supabase
Phase 0b: Populates survey_units + bills tables from local data dumps.

Usage:
    python scripts/run_historical_migration.py              # Full migration
    python scripts/run_historical_migration.py --fast        # Incremental (skip existing Survey IDs)
    python scripts/run_historical_migration.py --reset       # Purge tables first
"""

import os, sys, json, re, math
from collections import defaultdict
import pandas as pd
import argparse
from datetime import datetime

from dotenv import load_dotenv
from supabase import create_client

# --- Paths ---
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(SCRIPT_DIR, "data")
EXCEL_DUMPS = os.path.join(DATA_DIR, "excel_dumps")
SCRAPED_DATA = os.path.join(DATA_DIR, "scraped_data")
PROCESSED_PDFS = os.path.join(DATA_DIR, "processed_pdfs")
GEO_PATH = os.path.join(SCRIPT_DIR, "geography.json")
ENV_PATH = os.path.join(os.path.dirname(SCRIPT_DIR), ".env.local")

# --- Credentials ---
load_dotenv(ENV_PATH)
SUPABASE_URL = os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")

if not SUPABASE_URL or not SUPABASE_KEY:
    print("Error: NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not found in .env.local")
    sys.exit(1)


class HistoricalMigration:
    def __init__(self):
        self.sb = create_client(SUPABASE_URL, SUPABASE_KEY)

        # Lookup maps
        self.sid_to_psid = {}           # survey_id -> {psid, total_payable, inf_d, inf_t}
        self.psid_to_sid = {}           # psid -> survey_id
        self.psid_to_payment = {}       # (psid, month) -> {status, amount, date, method}
        self.billing_history = defaultdict(list)  # survey_id -> [{m, psid, amt, date, src, inf_d, inf_t}]
        self.survey_financials = {}     # survey_id -> {monthly_fee, billing_category}
        self.lifecycle_data = defaultdict(dict)   # psid -> {month: is_issued}
        self.lifecycle_enrich = {}      # psid -> {arrears, deleted_in_portal, start_month}

        # Output rows
        self.records_to_upload = []     # survey_units rows
        self.bills_to_upload = []       # bills rows
        self.seen_survey_ids = set()

        # Geography mapping
        self.geo_config = {}
        if os.path.exists(GEO_PATH):
            with open(GEO_PATH) as f:
                self.geo_config = json.load(f)

        self.session_start = datetime.now()

    # --- Helpers ---
    @staticmethod
    def normalize_sid(sid):
        if not sid or str(sid).lower() == "nan":
            return ""
        s = str(sid).strip().lstrip("0").upper()
        return s if s else "0"

    @staticmethod
    def safe_float(val):
        try:
            f = float(val)
            if math.isnan(f) or math.isinf(f):
                return None
            return f
        except (ValueError, TypeError):
            return None

    @staticmethod
    def safe_int(val):
        try:
            return int(float(str(val).strip()))
        except (ValueError, TypeError):
            return 0

    @staticmethod
    def clean_time(val):
        if not val or str(val).strip().lower() in ("", "nan", "none", "nat"):
            return None
        return str(val).strip()

    @staticmethod
    def normalize_month(m):
        if not m or str(m).lower() == "nan":
            return ""
        return str(m).upper().replace(" ", "")

    @staticmethod
    def get_col(row, aliases):
        for a in aliases:
            if a in row:
                v = row[a]
                return str(v).strip() if pd.notna(v) else ""
            for k in row.keys():
                if k.lower() == a.lower():
                    v = row[k]
                    return str(v).strip() if pd.notna(v) else ""
        return ""

    @staticmethod
    def parse_date(val):
        if not val:
            return None
        try:
            dt = pd.to_datetime(str(val).strip(), errors="coerce")
            return dt.strftime("%Y-%m-%d") if pd.notna(dt) else None
        except Exception:
            return None

    def resolve_hierarchy(self, raw_district, raw_tehsil):
        rules = self.geo_config.get("mapping_rules", {})
        raw_t = raw_tehsil.upper()
        raw_d = raw_district.upper()
        if raw_t in rules:
            r = rules[raw_t]
            return r["district"], r["tehsil"]
        if raw_d in rules:
            r = rules[raw_d]
            return r["district"], r["tehsil"]
        return raw_district, raw_tehsil

    # --- Load: Biller CSVs ---
    def load_biller_data(self, quick=False):
        if not os.path.exists(EXCEL_DUMPS):
            print(f"  [SKIP] excel_dumps not found: {EXCEL_DUMPS}")
            return

        files = sorted(
            f for f in os.listdir(EXCEL_DUMPS)
            if f.endswith(".csv")
            and "BILLER" in f.upper()
            and not f.startswith("~$")
            and not f.upper().startswith("TESTING")
        )
        # Quick mode: only latest month for each city
        if quick:
            latest = defaultdict(list)
            for f in files:
                match = re.search(r"([A-Z]{3}20[0-9]{2})", f.upper())
                if match:
                    city = f.split("_")[1] if "_" in f else "UNKNOWN"
                    latest[city].append((match.group(1), f))
            files = []
            for city, items in latest.items():
                items.sort(key=lambda x: x[0], reverse=True)
                files.append(items[0][1])
            print(f"  Quick mode: {len(files)} latest Biller files")

        print(f"  Loading {len(files)} Biller files...")

        for fi, bf in enumerate(files, 1):
            try:
                bdf = pd.read_csv(os.path.join(EXCEL_DUMPS, bf), encoding="utf-8-sig", engine="python")
                match = re.search(r"([A-Z]{3}20[0-9]{2})", bf.upper())
                file_month = match.group(1) if match else "UNKNOWN"

                if "Survey ID" not in bdf.columns or "Biller PSID" not in bdf.columns:
                    continue

                rules = self.geo_config.get("mapping_rules", {})
                bf_up = bf.upper()
                inf_d, inf_t = "UNKNOWN", "UNKNOWN"
                for key, rule in rules.items():
                    if key in bf_up:
                        inf_d, inf_t = rule["district"], rule["tehsil"]
                        break

                count = 0
                for _, row in bdf.iterrows():
                    sid = self.normalize_sid(row.get("Survey ID", ""))
                    psid = str(row.get("Biller PSID", "")).strip()
                    if not sid or not psid or psid == "nan":
                        continue

                    total_payable = str(row.get("Total Payable", "0")).strip()
                    self.billing_history[sid].append({
                        "m": file_month, "psid": psid, "amt": total_payable,
                        "date": str(row.get("Bill Date", "")).strip(),
                        "src": "biller", "inf_d": inf_d, "inf_t": inf_t,
                    })
                    self.sid_to_psid[sid] = {
                        "psid": psid, "total_payable": total_payable,
                        "inf_d": inf_d, "inf_t": inf_t,
                    }
                    self.psid_to_sid[psid] = sid

                    m_fee = self.safe_int(row.get("Monthly Fee", "0"))
                    b_cat = str(row.get("Billing Category", "")).strip()
                    self.survey_financials[sid] = {
                        "monthly_fee": m_fee,
                        "billing_category": b_cat if b_cat and b_cat.lower() != "nan" else "UNKNOWN",
                    }
                    count += 1

                print(f"    [{fi}/{len(files)}] {bf}: {count} records")
            except Exception as e:
                print(f"    Error loading {bf}: {e}")

    # --- Load: Payment History ---
    def load_payment_history(self):
        if not os.path.exists(SCRAPED_DATA):
            return

        files = sorted(
            f for f in os.listdir(SCRAPED_DATA)
            if f.endswith(".csv") and "PAID_ALL_HISTORY" in f.upper() and not f.startswith("~$")
        )
        # Prefer combined file first
        files.sort(key=lambda x: (0 if "COMBINED" in x.upper() else 1))

        for pf in files:
            try:
                pdf = pd.read_csv(os.path.join(SCRAPED_DATA, pf), encoding="utf-8-sig", engine="python")
                if "Paid Date" in pdf.columns:
                    pdf["Paid Date"] = pd.to_datetime(pdf["Paid Date"], errors="coerce")
                    pdf["Paid Date"] = pdf["Paid Date"].apply(lambda x: x.strftime("%Y-%m-%d") if pd.notna(x) else None)

                psid_col = "PSID" if "PSID" in pdf.columns else ("Biller PSID" if "Biller PSID" in pdf.columns else None)
                month_col = "Month" if "Month" in pdf.columns else None
                if not psid_col:
                    continue

                for _, row in pdf.iterrows():
                    psid = str(row.get(psid_col, "")).strip()
                    if not psid or psid == "nan":
                        continue
                    m = self.normalize_month(row.get(month_col, "")) if month_col else ""
                    key = (psid, m)
                    if key in self.psid_to_payment:
                        continue  # Combined already has it
                    raw_date = row.get("Paid Date")
                    self.psid_to_payment[key] = {
                        "status": str(row.get("Status", "unpaid")).strip().lower(),
                        "amount": str(row.get("Paid Amount", "0")).strip(),
                        "date": raw_date if pd.notna(raw_date) and raw_date else None,
                        "method": str(row.get("Channel", "-")).strip(),
                    }
            except Exception as e:
                print(f"    Error loading payment {pf}: {e}")

    # --- Load: Lifecycle XLSX ---
    def load_lifecycle(self):
        if not os.path.exists(PROCESSED_PDFS):
            return

        files = sorted(
            f for f in os.listdir(PROCESSED_PDFS)
            if "test_lifecycle" in f.lower() and f.endswith(".xlsx") and not f.startswith("~$")
        )
        print(f"  Loading {len(files)} Lifecycle files...")

        for fi, lf in enumerate(files, 1):
            try:
                ldf = pd.read_excel(os.path.join(PROCESSED_PDFS, lf), engine="openpyxl", dtype=str)
                psid_col = "Biller PSID" if "Biller PSID" in ldf.columns else None
                if not psid_col:
                    continue

                issued_cols = [c for c in ldf.columns if "PDF Issued" in c]
                rows_count = 0
                for _, row in ldf.iterrows():
                    psid_val = row.get(psid_col, "")
                    if pd.isna(psid_val):
                        continue
                    psid = f"{int(float(psid_val))}" if isinstance(psid_val, (float, int)) else str(psid_val).strip()
                    if not psid:
                        continue

                    for col in issued_cols:
                        match = re.search(r"([A-Z]{3})-([0-9]{2})", col.upper())
                        if match:
                            m_norm = f"{match.group(1)}20{match.group(2)}"
                            val = str(row.get(col, "")).strip().upper()
                            self.lifecycle_data[psid][m_norm] = (val == "YES" or val == "1" or val == "ISSUED")

                    arrears = row.get("Arrears", "0")
                    deleted = row.get("Deleted in Portal", "")
                    start_m = row.get("Start Month", "")
                    try:
                        self.lifecycle_enrich[psid] = {
                            "arrears": float(arrears) if arrears and str(arrears).lower() != "nan" else 0,
                            "deleted_in_portal": str(deleted).strip() if pd.notna(deleted) else None,
                            "start_month": str(start_m).strip() if pd.notna(start_m) else None,
                        }
                    except (ValueError, TypeError):
                        pass
                    rows_count += 1

                print(f"    [{fi}/{len(files)}] {lf}: {rows_count} rows processed")
            except Exception as e:
                print(f"    Error loading lifecycle {lf}: {e}")

    # --- Load: Survey CSVs ---
    def load_surveys(self, max_db_id=0):
        if not os.path.exists(SCRAPED_DATA):
            return

        files = sorted(
            f for f in os.listdir(SCRAPED_DATA)
            if f.endswith(".csv")
            and "SURVEY" in f.upper()
            and "MASTER" not in f.upper()
            and "PAID_ALL_HISTORY" not in f.upper()
            and not f.startswith("~$")
        )
        print(f"  Loading {len(files)} Survey files...")

        for fi, csv_file in enumerate(files, 1):
            try:
                df = pd.read_csv(os.path.join(SCRAPED_DATA, csv_file), encoding="utf-8-sig", engine="python")
                loaded = 0
                skipped = 0
                for _, row in df.iterrows():
                    if loaded > 0 and loaded % 10000 == 0:
                        sys.stdout.write(f"\r    [{fi}/{len(files)}] {csv_file}: {loaded} loaded, {skipped} skipped")
                        sys.stdout.flush()
                    sid = self.normalize_sid(self.get_col(row, ["Survey ID", "SurveyID", "SID"]))
                    if not sid or sid in self.seen_survey_ids:
                        skipped += 1
                        continue

                    self.seen_survey_ids.add(sid)

                    try:
                        if max_db_id > 0 and int(sid) <= max_db_id:
                            continue
                    except ValueError:
                        pass

                    lat = self.safe_float(self.get_col(row, ["Latitude", "Lat"]))
                    lon = self.safe_float(self.get_col(row, ["Longitude", "Lng", "Long"]))

                    images = []
                    for i in range(1, 5):
                        url = self.get_col(row, [f"Image URL {i}", f"URL {i}"])
                        if url and url.lower() != "nan":
                            images.append(url)

                    raw_district = self.get_col(row, ["District", "City"]).upper()
                    raw_tehsil = self.get_col(row, ["Tehsil"]).upper()
                    district, tehsil = self.resolve_hierarchy(raw_district, raw_tehsil)

                    rec = {
                        "survey_id": sid,
                        "status": "ACTIVE",
                        "city_district": district,
                        "tehsil": tehsil,
                        "uc_name": self.get_col(row, ["Union Council", "UC", "Area"]).upper(),
                        "uc_type": self.get_col(row, ["UC Type", "Type"]).upper(),
                        "consumer_name": self.get_col(row, ["Name", "Consumer"]),
                        "address": self.get_col(row, ["Address"]),
                        "house_type": self.get_col(row, ["House Type"]),
                        "unit_type": self.get_col(row, ["Consumer Type", "Unit Type"]),
                        "lat": lat,
                        "lng": lon,
                        "image_urls": images,
                        "surveyor_name": self.get_col(row, ["Surveyor Name", "Surveyor"]),
                        "survey_date": self.parse_date(self.get_col(row, ["Survey Date", "Date"])),
                        "survey_time": self.clean_time(self.get_col(row, ["Survey Time", "Time"])),
                        "monthly_fee": self.survey_financials.get(sid, {}).get("monthly_fee", 0),
                        "billing_category": self.survey_financials.get(sid, {}).get("billing_category", "UNKNOWN"),
                    }
                    self.records_to_upload.append(rec)
                    loaded += 1

                print(f"\r    [{fi}/{len(files)}] {csv_file}: {loaded} loaded, {skipped} skipped (duplicate SIDs)")
            except Exception as e:
                print(f"\r    Error loading survey {csv_file}: {e}")

    # --- Build Bills ---
    def build_bills(self):
        print("  Building bill records...")
        # Pre-index payment data: {psid: {month: info}}
        psid_payments = defaultdict(dict)
        for (psid, month), info in self.psid_to_payment.items():
            psid_payments[psid][month] = info

        # Pre-index best payment date per PSID for duplicate resolution
        psid_best_paid = {}
        for psid, month_dict in psid_payments.items():
            best = "0000-00-00"
            for m, info in month_dict.items():
                if info.get("status") == "paid":
                    d = info.get("date", "0000-00-00")
                    if d and d != "-" and d > best:
                        best = d
            psid_best_paid[psid] = best

        count = 0
        total = len(self.billing_history)
        for sid, entries in self.billing_history.items():
            # Group by PSID
            psid_groups = defaultdict(list)
            for e in entries:
                psid_groups[e["psid"]].append(e)

            unique_psids = list(psid_groups.keys())
            if len(unique_psids) > 1:
                winner_psid = max(
                    unique_psids,
                    key=lambda p: (0 if psid_best_paid.get(p, "0000-00-00") == "0000-00-00" else 1, psid_best_paid.get(p, "0000-00-00"), p)
                )
            else:
                winner_psid = unique_psids[0]

            for e in entries:
                is_win = e["psid"] == winner_psid
                m_norm = self.normalize_month(e["m"])
                pay_info = psid_payments.get(e["psid"], {}).get(m_norm, {})

                enrich = self.lifecycle_enrich.get(e["psid"], {})
                is_issued = self.lifecycle_data.get(e["psid"], {}).get(m_norm, False)

                self.bills_to_upload.append({
                    "psid": e["psid"],
                    "bill_month": e["m"],
                    "survey_id": sid,
                    "amount_due": self.safe_float(e["amt"]),
                    "total_payable": self.safe_float(e["amt"]),
                    "payment_status": pay_info.get("status", "unpaid").upper(),
                    "paid_date": pay_info.get("date") if pay_info.get("date") and str(pay_info.get("date")).lower() not in ("-", "nan", "none") else None,
                    "payment_method": pay_info.get("method") if pay_info.get("method") and str(pay_info.get("method")).lower() not in ("-", "nan", "none") else None,
                    "amount_paid": self.safe_float(pay_info.get("amount", 0)),
                    "is_primary": is_win,
                    "is_issued": is_issued,
                    "arrears": enrich.get("arrears", 0),
                    "deleted_in_portal": enrich.get("deleted_in_portal"),
                    "start_month": enrich.get("start_month"),
                    "recon_notes": "Original" if is_win else "Duplicate",
                })
                count += 1
                if count % 100000 == 0:
                    print(f"    {count}/{total} bill records built...")

        print(f"    Total: {len(self.bills_to_upload)} bill records")

    # --- Identify Archived ---
    def identify_archived(self):
        count = 0
        for sid, entries in self.billing_history.items():
            if sid not in self.seen_survey_ids:
                sample = entries[0]
                self.records_to_upload.append({
                    "survey_id": sid,
                    "status": "ARCHIVED",
                    "city_district": sample.get("inf_d", "UNKNOWN"),
                    "tehsil": sample.get("inf_t", "UNKNOWN"),
                    "uc_name": "ARCHIVED_CENTER",
                    "consumer_name": "Archived Biller Data",
                    "address": "Archived Address",
                    "monthly_fee": 0,
                    "billing_category": "UNKNOWN",
                })
                count += 1
        print(f"  Archived records: {count}")

    # --- Batch Upsert ---
    def upload_chunked(self, table, rows, chunk_size=500):
        # Deduplicate for bills table (composite PK: psid + bill_month)
        if table == "bills":
            seen = set()
            deduped = []
            skip = 0
            for r in rows:
                key = (r.get("psid", ""), r.get("bill_month", ""))
                if key in seen:
                    skip += 1
                    continue
                seen.add(key)
                deduped.append(r)
            if skip:
                print(f"  Deduplicated {skip} duplicate bill records")
            rows = deduped

        total = len(rows)
        if total == 0:
            print(f"  No rows to upload to '{table}'.")
            return
        print(f"  Uploading {total} rows to '{table}'...")
        ok = 0
        fail = 0
        for i in range(0, total, chunk_size):
            chunk = rows[i:i+chunk_size]
            try:
                self.sb.table(table).upsert(chunk, ignore_duplicates=False).execute()
                ok += len(chunk)
            except Exception as e:
                print(f"    Error at chunk {i}: {e}")
                fail += len(chunk)
            sys.stdout.write(f"\r    Progress: {ok}/{total} OK, {fail} failed")
            sys.stdout.flush()
        print()

    # --- Fetch Max Survey ID ---
    def fetch_max_survey_id(self):
        try:
            res = self.sb.table("survey_units").select("survey_id").order("survey_id", desc=True).limit(1).execute()
            if res.data and len(res.data) > 0:
                max_id = int(res.data[0]["survey_id"])
                print(f"  Max existing Survey ID: {max_id}")
                return max_id
        except Exception as e:
            print(f"  Could not fetch max ID: {e}")
        return 0

    # --- Purge ---
    def purge_tables(self):
        print("  Purging bills...")
        try:
            while True:
                res = self.sb.table("bills").delete().neq("psid", "NONE").limit(10000).execute()
                if not res.data or len(res.data) == 0:
                    break
                print(f"    Deleted {len(res.data)} bills...")
        except Exception as e:
            print(f"  Purge bills error (continuing): {e}")

        print("  Purging survey_units...")
        try:
            while True:
                res = self.sb.table("survey_units").delete().neq("survey_id", "NONE").limit(10000).execute()
                if not res.data or len(res.data) == 0:
                    break
                print(f"    Deleted {len(res.data)} survey_units...")
        except Exception as e:
            print(f"  Purge survey_units error (continuing): {e}")

        print("  Purge complete.")
        except Exception as e:
            print(f"  Purge error: {e}")

    # --- Summary ---
    def print_summary(self):
        elapsed = datetime.now() - self.session_start
        print(f"\n{'='*50}")
        print(f"Migration complete in {elapsed}")
        print(f"  survey_units: {len(self.records_to_upload)} rows prepared")
        print(f"  bills:        {len(self.bills_to_upload)} rows prepared")
        print(f"{'='*50}")

    # --- Run ---
    def run(self):
        parser = argparse.ArgumentParser(description="Historical Data Migration → billing Supabase")
        parser.add_argument("--fast", action="store_true", help="Incremental: skip existing Survey IDs")
        parser.add_argument("--reset", action="store_true", help="Purge tables before upload")
        parser.add_argument("--dry-run", action="store_true", help="Process files but skip upload")
        parser.add_argument("--quick", action="store_true", help="Only latest month per city")
        parser.add_argument("--skip-lifecycle", action="store_true", help="Skip lifecycle XLSX loading (faster)")
        args = parser.parse_args()

        print(f"Historical Migration — Phase 0b")
        print(f"Supabase: {SUPABASE_URL}")
        print(f"Data:     {DATA_DIR}")

        # Load all data sources
        print("\n[1/6] Loading Biller CSVs...")
        self.load_biller_data(quick=args.quick)

        print("\n[2/6] Loading Payment History...")
        self.load_payment_history()

        if not args.skip_lifecycle:
            print("\n[3/6] Loading Lifecycle XLSX...")
            self.load_lifecycle()
        else:
            print("\n[3/6] Skipping Lifecycle XLSX (--skip-lifecycle)")

        max_id = 0
        if args.fast:
            print("\n[4/6] FAST MODE: Fetching max Survey ID...")
            max_id = self.fetch_max_survey_id()

        print(f"\n[4/6] Loading Survey CSVs (max_db_id={max_id})...")
        self.load_surveys(max_db_id=max_id)

        print(f"\n[5/6] Building bill records...")
        self.build_bills()

        print(f"\n[5/6] Identifying archived records...")
        self.identify_archived()

        if args.dry_run:
            print("\n[DRY RUN] Skipping upload.")
            self.print_summary()
            return

        if args.reset:
            print("\n[6/6] Purging existing data...")
            self.purge_tables()

        print(f"\n[6/6] Uploading to Supabase...")
        self.upload_chunked("survey_units", self.records_to_upload)
        self.upload_chunked("bills", self.bills_to_upload)

        self.print_summary()


if __name__ == "__main__":
    print("Usage: python scripts/run_historical_migration.py [--dry-run] [--quick] [--fast] [--reset]")
    HistoricalMigration().run()
