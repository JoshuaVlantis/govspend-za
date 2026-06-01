"""Export the consolidated national-budget Sankey (FY2026) for the frontend.

Combines four spheres into web/public/data/budget/<year>.json (NRF -> spheres + drill-down):
  - national departments' OWN spend (ENE, net of transfers down to provinces/municipalities)
  - provinces (equitable share + conditional grants — seeded from the Budget Review)
  - local government (our Municipal Money transfer totals, by province)
  - debt-service cost (seeded from the Budget Review)

Run: python3 etl/national_export.py
"""

import json
import pathlib
import sqlite3
from collections import defaultdict

import config

ROOT = pathlib.Path(__file__).resolve().parents[1]
DB_PATH = ROOT / "data" / "govspend.db"
OUT = ROOT / "web" / "public" / "data" / "budget"
YEAR = 2026


def main():
    conn = sqlite3.connect(DB_PATH)
    OUT.mkdir(parents=True, exist_ok=True)

    # National departments' own spend = department total minus what it passes down to provinces/munis.
    dept_total, dept_down = defaultdict(float), defaultdict(float)
    for dept, ec3, amount in conn.execute(
        "SELECT department, ec3, amount FROM national_expenditure WHERE financial_year=?", (YEAR,)
    ):
        dept_total[dept] += amount
        if ec3 == "Provinces and municipalities":
            dept_down[dept] += amount
    dept_own = {d: dept_total[d] - dept_down[d] for d in dept_total}
    national_own = sum(v for v in dept_own.values() if v > 0)

    # Local government: municipal transfer totals by province (reuse the grants we already have).
    local_by_prov = defaultdict(float)
    for province, amount in conn.execute(
        "SELECT m.province, sum(g.amount) FROM grant_received g JOIN municipality m ON m.code=g.muni_code "
        "WHERE g.financial_year=? AND g.amount_type='ORGB' AND m.province IS NOT NULL GROUP BY m.province",
        (YEAR,),
    ):
        local_by_prov[province] += amount
    local_total = sum(local_by_prov.values())

    debt = config.DIRECT_CHARGES_2026["Debt-service cost"]
    prov_total = sum(config.PROVINCIAL_SHARE_2026.values())

    nodes, index, links = [], {}, []

    def node(node_id, label, kind):
        if node_id not in index:
            index[node_id] = len(nodes)
            nodes.append({"id": node_id, "label": label, "kind": kind})
        return index[node_id]

    nrf = node("nrf", "National Revenue Fund", "source")
    spheres = [
        ("sphere:national", "National departments", "sphere", national_own),
        ("sphere:provincial", "Provinces", "sphere", prov_total),
        ("sphere:local", "Local government", "sphere", local_total),
        ("sphere:debt", "Debt-service cost", "debt", debt),
    ]
    for sid, label, kind, value in spheres:
        links.append({"source": nrf, "target": node(sid, label, kind), "value": round(value)})

    children = {
        "sphere:national": sorted(
            ({"label": d, "value": round(v)} for d, v in dept_own.items() if v > 0),
            key=lambda x: -x["value"],
        ),
        "sphere:provincial": [{"label": k, "value": round(v)} for k, v in config.PROVINCIAL_SHARE_2026.items()],
        "sphere:local": sorted(
            ({"label": p, "value": round(v)} for p, v in local_by_prov.items()),
            key=lambda x: -x["value"],
        ),
    }

    out = {
        "year": YEAR,
        "total": round(national_own + prov_total + local_total + debt),
        "nodes": nodes,
        "links": links,
        "children": children,
        "note": (
            "2025/26 main budget. National departments from the ENE (own spend, net of transfers to "
            "other spheres); provincial equitable share + conditional grants and debt-service from the "
            "2025 Budget Review; local government from Municipal Money. The fully consolidated total "
            "(incl. public entities & social-security funds) is ~R2.59tn."
        ),
    }
    (OUT / f"{YEAR}.json").write_text(json.dumps(out, separators=(",", ":")))
    print(
        f"budget/{YEAR}.json: total R{out['total'] / 1e9:.0f}bn | "
        f"{len(children['sphere:national'])} national depts | "
        f"local across {len(children['sphere:local'])} provinces"
    )
    conn.close()


if __name__ == "__main__":
    main()
