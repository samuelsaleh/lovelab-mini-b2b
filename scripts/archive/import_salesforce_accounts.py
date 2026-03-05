#!/usr/bin/env python3
"""
Import Salesforce account export into clients table with source tagging.

Usage:
  python3 scripts/import_salesforce_accounts.py \
    "/Users/samuelsaleh/Desktop/New Accounts Report-2026-03-04-19-34-58.xlsx"
"""

import json
import os
import re
import sys
from datetime import datetime, timezone
import urllib.parse
import urllib.request
import zipfile
import xml.etree.ElementTree as ET
from pathlib import Path

NS = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"


def read_env_file(path):
    env = {}
    if not path.exists():
        return env
    for line in path.read_text(encoding="utf-8", errors="ignore").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        env[key.strip()] = value.strip()
    return env


def title_case(value):
    if not value:
        return ""
    clean = re.sub(r"\s+", " ", value.strip())
    return " ".join(w[:1].upper() + w[1:].lower() for w in clean.split(" "))


def normalize_key(company, country, city):
    return (
        (company or "").strip().lower(),
        (country or "").strip().lower(),
        (city or "").strip().lower(),
    )


def get_shared_strings(zf):
    if "xl/sharedStrings.xml" not in zf.namelist():
        return []
    root = ET.fromstring(zf.read("xl/sharedStrings.xml"))
    out = []
    for si in root.findall(f"{NS}si"):
        out.append("".join(t.text or "" for t in si.iter(f"{NS}t")))
    return out


def read_cell_value(cell, shared_strings):
    ctype = cell.attrib.get("t")
    if ctype == "inlineStr":
        inline = cell.find(f"{NS}is")
        if inline is None:
            return ""
        return "".join(t.text or "" for t in inline.iter(f"{NS}t"))

    v = cell.find(f"{NS}v")
    if v is None or v.text is None:
        return ""
    raw = v.text
    if ctype == "s":
        try:
            return shared_strings[int(raw)]
        except Exception:
            return raw
    return raw


def parse_accounts_from_xlsx(path):
    with zipfile.ZipFile(path) as zf:
        shared_strings = get_shared_strings(zf)
        sheet = ET.fromstring(zf.read("xl/worksheets/sheet1.xml"))
        rows = sheet.findall(f".//{NS}sheetData/{NS}row")

        header_row_idx = None
        header_map = {}
        parsed = []

        for idx, row in enumerate(rows, start=1):
            by_col = {}
            for cell in row.findall(f"{NS}c"):
                ref = cell.attrib.get("r", "")
                col = re.sub(r"\d", "", ref)
                by_col[col] = read_cell_value(cell, shared_strings).strip()

            values = list(by_col.values())
            if header_row_idx is None:
                labels = {v.lower() for v in values if v}
                if "account name" in labels and "billing city" in labels and "billing country" in labels:
                    header_row_idx = idx
                    for col, val in by_col.items():
                        if val:
                            header_map[val.strip().lower()] = col
                    continue
            else:
                company_col = header_map.get("account name")
                city_col = header_map.get("billing city")
                country_col = header_map.get("billing country")
                company = by_col.get(company_col, "").strip()
                city = title_case(by_col.get(city_col, ""))
                country = title_case(by_col.get(country_col, ""))
                if not company:
                    continue
                parsed.append(
                    {
                        "company": re.sub(r"\s+", " ", company).strip(),
                        "city": city or None,
                        "country": country or None,
                    }
                )
        return parsed


def supabase_request(base_url, service_key, method, path, params=None, payload=None, prefer=None):
    query = f"?{urllib.parse.urlencode(params)}" if params else ""
    url = f"{base_url}/rest/v1/{path}{query}"
    req = urllib.request.Request(url, method=method)
    req.add_header("apikey", service_key)
    req.add_header("Authorization", f"Bearer {service_key}")
    req.add_header("Content-Type", "application/json")
    if prefer:
        req.add_header("Prefer", prefer)
    data = None
    if payload is not None:
        data = json.dumps(payload).encode("utf-8")
    with urllib.request.urlopen(req, data=data, timeout=60) as res:
        body = res.read().decode("utf-8")
        return json.loads(body) if body else []


def fetch_existing_clients(base_url, service_key):
    rows = supabase_request(
        base_url,
        service_key,
        "GET",
        "clients",
        params={"select": "id,company,country,city", "limit": 5000},
    )
    by_key = {}
    for row in rows:
        key = normalize_key(row.get("company"), row.get("country"), row.get("city"))
        if key[0]:
            by_key.setdefault(key, row["id"])
    return by_key


def supports_source_columns(base_url, service_key):
    try:
        supabase_request(
            base_url,
            service_key,
            "GET",
            "clients",
            params={"select": "id,source,source_comment", "limit": 1},
        )
        return True
    except Exception:
        return False


def main():
    if len(sys.argv) < 2:
        print("Usage: python3 scripts/import_salesforce_accounts.py <xlsx-path>")
        sys.exit(1)

    xlsx_path = Path(sys.argv[1]).expanduser().resolve()
    if not xlsx_path.exists():
        print(f"File not found: {xlsx_path}")
        sys.exit(1)

    repo_root = Path(__file__).resolve().parents[1]
    env = {}
    env.update(read_env_file(repo_root / ".env"))
    env.update(os.environ)

    base_url = env.get("NEXT_PUBLIC_SUPABASE_URL")
    service_key = env.get("SUPABASE_SERVICE_ROLE_KEY")
    created_by = env.get("SALESFORCE_IMPORT_CREATED_BY")  # optional UUID

    if not base_url or not service_key:
        print("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env")
        sys.exit(1)

    accounts = parse_accounts_from_xlsx(xlsx_path)
    if not accounts:
        print("No accounts parsed from file.")
        sys.exit(1)

    existing = fetch_existing_clients(base_url, service_key)
    has_source_columns = supports_source_columns(base_url, service_key)
    now_iso = datetime.now(timezone.utc).isoformat()

    inserted = 0
    updated = 0
    skipped = 0
    failed = 0

    for acc in accounts:
        key = normalize_key(acc["company"], acc.get("country"), acc.get("city"))
        payload = {
            "name": None,
            "company": acc["company"],
            "country": acc.get("country"),
            "city": acc.get("city"),
            "updated_at": now_iso,
        }
        if has_source_columns:
            payload["source"] = "salesforce"
            payload["source_comment"] = "Under Salesforce"
            payload["source_imported_at"] = now_iso
        else:
            # Backward-compatible marker when source columns are not migrated yet.
            payload["vat"] = "UNDER_SALESFORCE"
        if created_by:
            payload["created_by"] = created_by

        try:
            existing_id = existing.get(key)
            if existing_id:
                supabase_request(
                    base_url,
                    service_key,
                    "PATCH",
                    "clients",
                    params={"id": f"eq.{existing_id}"},
                    payload=payload,
                    prefer="return=minimal",
                )
                updated += 1
            else:
                payload["created_at"] = now_iso
                supabase_request(
                    base_url,
                    service_key,
                    "POST",
                    "clients",
                    payload=payload,
                    prefer="return=minimal",
                )
                inserted += 1
                # do not append to existing map for exact duplicates in file
                existing[key] = "__new__"
        except Exception as exc:
            # likely duplicate row inside source file after first insert
            if "__new__" == existing.get(key):
                skipped += 1
            else:
                failed += 1
                print(f"[FAIL] {acc['company']}: {exc}")

    print("Salesforce import completed")
    print(
        json.dumps(
            {
                "file": str(xlsx_path),
                "source_columns": has_source_columns,
                "parsed": len(accounts),
                "inserted": inserted,
                "updated": updated,
                "skipped": skipped,
                "failed": failed,
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
