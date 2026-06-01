"""Task 2: tag incexp items income/expenditure (grants are flagged on load).

Rule, from the mSCOA `item.subcategory`:
  income       — subcategory is a revenue subcategory
  expenditure  — subcategory present and not revenue
  excluded     — subcategory NULL: duplicative per-function rollups ("Other expenditure")
                 that would double-count. Kept in the DB but omitted from totals.

Run: python3 etl/classify.py
"""

import pathlib
import sqlite3

import config

DB_PATH = pathlib.Path(__file__).resolve().parents[1] / "data" / "govspend.db"


def main():
    conn = sqlite3.connect(DB_PATH)
    rev = config.REVENUE_SUBCATEGORIES
    holes = ",".join("?" * len(rev))

    conn.execute(f"UPDATE incexp_item SET direction='income' WHERE subcategory IN ({holes})", rev)
    conn.execute(
        f"UPDATE incexp_item SET direction='expenditure' "
        f"WHERE subcategory IS NOT NULL AND subcategory NOT IN ({holes})",
        rev,
    )
    conn.execute("UPDATE incexp_item SET direction='excluded' WHERE subcategory IS NULL")
    conn.commit()

    print("incexp_item by direction:")
    for direction, count in conn.execute(
        "SELECT direction, count(*) FROM incexp_item GROUP BY direction"
    ):
        print(f"  {direction or '(unset)'}: {count}")

    print(f"\nGrant types flagged: equitable (pooled) vs conditional (traceable):")
    for cond, count in conn.execute(
        "SELECT is_conditional, count(*) FROM grant_type GROUP BY is_conditional"
    ):
        print(f"  {'conditional' if cond else 'equitable '}: {count}")

    conn.close()


if __name__ == "__main__":
    main()
