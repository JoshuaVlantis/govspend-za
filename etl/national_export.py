"""Export the consolidated national-budget Sankeys (FY2026).

  budget/2026.json       - NRF -> 4 spheres, with drill-down children
  budget/2026-full.json  - the ENTIRE tree on one page: NRF -> spheres -> departments /
                           provincial components / provinces -> all 257 municipalities ->
                           EVERY municipal spend function. DFS-ordered so children group
                           under parents. Deliberately enormous.

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

NOTE = (
    "2025/26 main budget. National departments from the ENE (own spend, net of transfers to "
    "other spheres); provincial equitable share + conditional grants and debt-service from the "
    "2025 Budget Review; local government from Municipal Money. Fully consolidated total "
    "(incl. public entities & social-security funds) is ~R2.59tn."
)
FULL_NOTE = NOTE + (
    " The local-government arm continues into EVERY municipality's spending by function. A "
    "municipality spends far more than the national money reaching it — the gap is its own "
    "revenue (rates, electricity, water), which is not drawn as an inflow, so municipal bars are "
    "wider than their inflow. At this scale the smallest towns' slices can be sub-pixel."
)


def dump(path, obj):
    path.write_text(json.dumps(obj, separators=(",", ":")))


def gather(conn):
    dept_total, dept_down = defaultdict(float), defaultdict(float)
    for dept, ec3, amount in conn.execute(
        "SELECT department, ec3, amount FROM national_expenditure WHERE financial_year=?", (YEAR,)
    ):
        dept_total[dept] += amount
        if ec3 == "Provinces and municipalities":
            dept_down[dept] += amount
    dept_own = {d: dept_total[d] - dept_down[d] for d in dept_total if dept_total[d] - dept_down[d] > 0}

    local_by_prov = defaultdict(float)
    for province, amount in conn.execute(
        "SELECT m.province, sum(g.amount) FROM grant_received g JOIN municipality m ON m.code=g.muni_code "
        "WHERE g.financial_year=? AND g.amount_type='ORGB' AND m.province IS NOT NULL GROUP BY m.province",
        (YEAR,),
    ):
        local_by_prov[province] += amount

    muni_by_prov = defaultdict(list)
    for prov, code, name, amount in conn.execute(
        "SELECT m.province, m.code, m.name, sum(g.amount) FROM grant_received g "
        "JOIN municipality m ON m.code=g.muni_code "
        "WHERE g.financial_year=? AND g.amount_type='ORGB' AND m.province IS NOT NULL AND g.amount>0 "
        "GROUP BY m.province, m.code, m.name",
        (YEAR,),
    ):
        muni_by_prov[prov].append((code, name, amount))

    muni_functions = defaultdict(list)
    for code, fn, amount in conn.execute(
        "SELECT muni_code, function_label, amount FROM spend_function "
        "WHERE financial_year=? AND amount_type='ORGB' AND amount>0 ORDER BY muni_code, amount DESC",
        (YEAR,),
    ):
        muni_functions[code].append((fn, amount))

    return {
        "dept_own": dept_own,
        "national_own": sum(dept_own.values()),
        "local_by_prov": dict(local_by_prov),
        "local_total": sum(local_by_prov.values()),
        "muni_by_prov": muni_by_prov,
        "muni_functions": muni_functions,
        "debt": config.DIRECT_CHARGES_2026["Debt-service cost"],
        "prov_total": sum(config.PROVINCIAL_SHARE_2026.values()),
    }


def build_overview(g):
    nodes, index, links = [], {}, []

    def node(node_id, label, kind):
        if node_id not in index:
            index[node_id] = len(nodes)
            nodes.append({"id": node_id, "label": label, "kind": kind})
        return index[node_id]

    nrf = node("nrf", "National Revenue Fund", "source")
    for sid, label, kind, value in [
        ("sphere:national", "National departments", "sphere", g["national_own"]),
        ("sphere:provincial", "Provinces", "sphere", g["prov_total"]),
        ("sphere:local", "Local government", "sphere", g["local_total"]),
        ("sphere:debt", "Debt-service cost", "debt", g["debt"]),
    ]:
        links.append({"source": nrf, "target": node(sid, label, kind), "value": round(value)})

    children = {
        "sphere:national": sorted(
            ({"label": d, "value": round(v)} for d, v in g["dept_own"].items()), key=lambda x: -x["value"]),
        "sphere:provincial": [{"label": k, "value": round(v)} for k, v in config.PROVINCIAL_SHARE_2026.items()],
        "sphere:local": sorted(
            ({"label": p, "value": round(v)} for p, v in g["local_by_prov"].items()), key=lambda x: -x["value"]),
    }
    return {
        "year": YEAR,
        "total": round(g["national_own"] + g["prov_total"] + g["local_total"] + g["debt"]),
        "nodes": nodes, "links": links, "children": children, "note": NOTE,
    }


def build_full(g):
    """The entire tree, DFS-ordered so each column groups children under their parent."""
    nodes, index, links, counter = [], {}, [], [0]

    def node(node_id, label, kind):
        if node_id not in index:
            index[node_id] = len(nodes)
            nodes.append({"id": node_id, "label": label, "kind": kind, "order": counter[0]})
            counter[0] += 1
        return index[node_id]

    def link(s, t, v):
        links.append({"source": s, "target": t, "value": round(v)})

    nrf = node("nrf", "National Revenue Fund", "source")
    spheres = sorted([
        ("sphere:national", "National departments", "sphere", g["national_own"], "national"),
        ("sphere:provincial", "Provinces", "sphere", g["prov_total"], "provincial"),
        ("sphere:local", "Local government", "sphere", g["local_total"], "local"),
        ("sphere:debt", "Debt-service cost", "debt", g["debt"], "debt"),
    ], key=lambda s: -s[3])

    for sid, slabel, skind, sval, stype in spheres:
        si = node(sid, slabel, skind)
        link(nrf, si, sval)
        if stype == "national":
            for dept, value in sorted(g["dept_own"].items(), key=lambda x: -x[1]):
                link(si, node(f"dept:{dept}", dept, "child"), value)
        elif stype == "provincial":
            for label, value in sorted(config.PROVINCIAL_SHARE_2026.items(), key=lambda x: -x[1]):
                link(si, node(f"provcomp:{label}", label, "child"), value)
        elif stype == "local":
            for prov, ptotal in sorted(g["local_by_prov"].items(), key=lambda x: -x[1]):
                pi = node(f"province:{prov}", prov, "province")
                link(si, pi, ptotal)
                for code, name, amount in sorted(g["muni_by_prov"].get(prov, []), key=lambda x: -x[2]):
                    mi = node(f"muni:{code}", name, "municipality")
                    link(pi, mi, amount)
                    for fn, fval in g["muni_functions"].get(code, []):  # every function, no cap
                        link(mi, node(f"fn:{code}:{fn}", fn, "function"), fval)

    return {
        "year": YEAR,
        "total": round(g["national_own"] + g["prov_total"] + g["local_total"] + g["debt"]),
        "nodes": nodes, "links": links, "note": FULL_NOTE,
    }


def main():
    conn = sqlite3.connect(DB_PATH)
    OUT.mkdir(parents=True, exist_ok=True)
    g = gather(conn)
    dump(OUT / f"{YEAR}.json", build_overview(g))
    full = build_full(g)
    dump(OUT / f"{YEAR}-full.json", full)
    fns = sum(1 for n in full["nodes"] if n["kind"] == "function")
    print(f"budget/{YEAR}.json + {YEAR}-full.json | full tree: {len(full['nodes'])} nodes, "
          f"{len(full['links'])} links ({fns} spend-function leaves)")
    conn.close()


if __name__ == "__main__":
    main()
