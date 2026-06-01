"""ETL: bulk-load all municipalities and years from Municipal Money into SQLite.

Loads both budget (ORGB) and actual (grants ACT / incexp AUDA) amount types so the
frontend can offer a Budget vs Actual toggle. Uses paginated drill-down queries.
Run: python3 etl/load.py
"""

import datetime
import pathlib
import sqlite3

import config
from api import CubesClient

ROOT = pathlib.Path(__file__).resolve().parents[1]
DB_PATH = ROOT / "data" / "govspend.db"
SCHEMA_PATH = pathlib.Path(__file__).resolve().parent / "schema.sql"


def is_equitable(label):
    low = (label or "").lower()
    return any(hint in low for hint in config.EQUITABLE_SHARE_HINTS)


def _now():
    return datetime.datetime.now().isoformat(timespec="seconds")


def load_municipalities(conn, client):
    rows = []
    for f in client.facts(config.CUBE_MUNIS, pagesize=2000):
        code = f.get("municipality.demarcation_code")
        if not code:
            continue
        rows.append((code, f.get("municipality.name") or code,
                     f.get("municipality.province_name"), f.get("municipality.category")))
    conn.executemany(
        "INSERT OR REPLACE INTO municipality (code, name, province, category) VALUES (?,?,?,?)", rows)
    conn.commit()
    return len(rows)


def load_grants(conn, client):
    years = set(config.FINANCIAL_YEARS)
    grant_types, total = {}, 0
    for amount_type in config.GRANT_AMOUNT_TYPES:
        cells = client.aggregate_all(
            config.CUBE_GRANTS,
            cut=[f"amount_type.code:{amount_type}"],
            drilldown=["demarcation.code", "financial_year_end.year", "grant.code", "grant.label"],
        )
        rows = []
        for cell in cells:
            amount, year, code = cell.get("amount.sum"), cell.get("financial_year_end.year"), cell.get("demarcation.code")
            if amount is None or year not in years or not code:
                continue
            gcode = cell.get("grant.code") or cell.get("grant.label")
            glabel = cell.get("grant.label") or gcode
            grant_types[gcode] = glabel
            rows.append((code, year, gcode, amount_type, amount))
        conn.executemany(
            "INSERT OR REPLACE INTO grant_received "
            "(muni_code, financial_year, grant_code, amount_type, amount) VALUES (?,?,?,?,?)", rows)
        total += len(rows)
        print(f"  grants {amount_type}: {len(rows)} rows")
    conn.executemany(
        "INSERT OR REPLACE INTO grant_type (code, label, is_conditional) VALUES (?,?,?)",
        [(gc, gl, 0 if is_equitable(gl) else 1) for gc, gl in grant_types.items()])
    conn.commit()
    return total


def load_incexp(conn, client):
    years = set(config.FINANCIAL_YEARS)
    total = 0
    for amount_type in config.INCEXP_AMOUNT_TYPES:
        cells = client.aggregate_all(
            config.CUBE_INCEXP,
            cut=[f"amount_type.code:{amount_type}"],
            drilldown=["demarcation.code", "financial_year_end.year", "item.label", "item.subcategory"],
        )
        rows = []
        for cell in cells:
            amount, year, code = cell.get("amount.sum"), cell.get("financial_year_end.year"), cell.get("demarcation.code")
            if amount is None or year not in years or not code:
                continue
            rows.append((code, year, cell.get("item.label") or "", cell.get("item.subcategory"),
                         amount_type, amount))
        conn.executemany(
            "INSERT OR REPLACE INTO incexp_item "
            "(muni_code, financial_year, item_label, subcategory, amount_type, amount) VALUES (?,?,?,?,?,?)", rows)
        total += len(rows)
        print(f"  incexp {amount_type}: {len(rows)} rows")
    return total


def load_spend_function(conn, client):
    """Expenditure by government function (Water, Electricity, Housing, ...).

    Drills [municipality x year x function x subcategory], keeps only expenditure
    subcategories (so revenue and the NULL-subcategory rollup are excluded), and sums
    by function — a clean "what it was spent on" breakdown.
    """
    revenue = set(config.REVENUE_SUBCATEGORIES)
    years = set(config.FINANCIAL_YEARS)
    total = 0
    for amount_type in config.INCEXP_AMOUNT_TYPES:
        cells = client.aggregate_all(
            config.CUBE_INCEXP,
            cut=[f"amount_type.code:{amount_type}"],
            drilldown=["demarcation.code", "financial_year_end.year", "function.label", "item.subcategory"],
        )
        agg = {}
        for cell in cells:
            sub = cell.get("item.subcategory")
            if sub is None or sub in revenue:
                continue
            amount, year, code = cell.get("amount.sum"), cell.get("financial_year_end.year"), cell.get("demarcation.code")
            if amount is None or year not in years or not code:
                continue
            key = (code, year, cell.get("function.label") or "Other")
            agg[key] = agg.get(key, 0.0) + amount
        rows = [(c, y, f, amount_type, a) for (c, y, f), a in agg.items() if a > 0]
        conn.executemany(
            "INSERT OR REPLACE INTO spend_function "
            "(muni_code, financial_year, function_label, amount_type, amount) VALUES (?,?,?,?,?)", rows)
        total += len(rows)
        print(f"  spend_function {amount_type}: {len(rows)} rows")
    conn.commit()
    return total


def main():
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.executescript(SCHEMA_PATH.read_text())
    client = CubesClient(config.API_BASE, pause=config.API_PAUSE_SECONDS)

    print(f"Bulk load | years {config.FINANCIAL_YEARS} | grants {config.GRANT_AMOUNT_TYPES} | incexp {config.INCEXP_AMOUNT_TYPES}")
    print(f"municipalities: {load_municipalities(conn, client)}")
    n_grants = load_grants(conn, client)
    print(f"grant_received rows: {n_grants}")
    n_incexp = load_incexp(conn, client)
    print(f"incexp_item rows: {n_incexp}")
    n_func = load_spend_function(conn, client)
    print(f"spend_function rows: {n_func}")

    conn.execute("INSERT INTO etl_run (cube, params, rows_loaded, fetched_at) VALUES (?,?,?,?)",
                 ("bulk", "budget+actual", n_grants + n_incexp, _now()))
    conn.commit()
    conn.close()
    print("done.")


if __name__ == "__main__":
    main()
