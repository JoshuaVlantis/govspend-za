"""ETL: national budget (Estimates of National Expenditure) -> SQLite.

Downloads the ENE "pivot" CSV from Vulekamali and loads national-department spending
(vote -> programme -> economic classification) into the national_expenditure table.

Only FY2026 is currently published at this resource path; ENE_YEARS can grow as the
per-year resource URLs are found.

Run: python3 etl/national.py
"""

import csv
import io
import pathlib
import sqlite3
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parents[1]
DB_PATH = ROOT / "data" / "govspend.db"

ENE_URL = ("https://vulekamali.gov.za/datasets/estimates-of-national-expenditure/"
           "resources/Budget_{year}_-_ENE_and_Appropriation_Pivot.csv")
ENE_YEARS = [2026]

SCHEMA = """
CREATE TABLE IF NOT EXISTS national_expenditure (
  financial_year INTEGER NOT NULL,
  vote_number    INTEGER,
  department     TEXT NOT NULL,
  programme      TEXT,
  ec2            TEXT,   -- economic classification level 2 (e.g. 'Transfers and subsidies')
  ec3            TEXT,   -- level 3 (e.g. 'Provinces and municipalities', 'Households')
  function_group TEXT,
  amount         REAL
);
CREATE INDEX IF NOT EXISTS idx_natexp_year_dept ON national_expenditure (financial_year, department);
"""


def num(v):
    try:
        return float(v)
    except (TypeError, ValueError):
        return 0.0


def fetch(year):
    req = urllib.request.Request(ENE_URL.format(year=year), headers={"User-Agent": "govspend-etl/0.1"})
    with urllib.request.urlopen(req, timeout=120) as resp:
        text = resp.read().decode("utf-8-sig")
    return list(csv.DictReader(io.StringIO(text), delimiter=";"))


def main():
    conn = sqlite3.connect(DB_PATH)
    conn.executescript(SCHEMA)
    conn.execute("DELETE FROM national_expenditure")
    total = 0
    for year in ENE_YEARS:
        rows = fetch(year)
        recs = [
            (
                year,
                int(num(r.get("VoteNumber"))),
                r.get("Department"),
                r.get("Programme"),
                r.get("EconomicClassification2"),
                r.get("EconomicClassification3"),
                r.get("FunctionGroup1"),
                num(r.get("Value")),
            )
            for r in rows
            if r.get("BudgetPhase") == "Main appropriation" and r.get("FinancialYear") == str(year)
        ]
        conn.executemany(
            "INSERT INTO national_expenditure "
            "(financial_year, vote_number, department, programme, ec2, ec3, function_group, amount) "
            "VALUES (?,?,?,?,?,?,?,?)",
            recs,
        )
        total += len(recs)
        print(f"  ENE {year}: {len(recs)} rows, R{sum(x[7] for x in recs) / 1e9:.1f}bn")
    conn.commit()
    conn.close()
    print(f"national_expenditure rows: {total}")


if __name__ == "__main__":
    main()
