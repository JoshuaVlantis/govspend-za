"""Export lens-aware (Budget vs Actual), year-aware JSON for the frontend.

  index.json                          - lenses, years per lens, default year per lens, munis
  national/<lens>/<year>.json         - hero Sankey: National Revenue Fund + Provincial
                                        departments -> grant -> province (+ drill-down data)
  muni/<CODE>.json                    - per-municipality profile, both lenses, all years

Run: python3 etl/export.py
"""

import json
import pathlib
import sqlite3
from collections import defaultdict

import config

ROOT = pathlib.Path(__file__).resolve().parents[1]
DB_PATH = ROOT / "data" / "govspend.db"
OUT = ROOT / "web" / "public" / "data"

MIN_COVERAGE = 50


def dump(path, obj):
    path.write_text(json.dumps(obj, separators=(",", ":")))


def _years(conn, table, amount_type):
    return {
        row[0]
        for row in conn.execute(
            f"SELECT financial_year FROM {table} WHERE amount_type=? AND amount>0 "
            "GROUP BY financial_year HAVING count(DISTINCT muni_code) >= ?",
            (amount_type, MIN_COVERAGE),
        )
    }


def usable_years(conn, lens):
    cfg = config.LENSES[lens]
    return sorted(_years(conn, "grant_received", cfg["grants"]) & _years(conn, "incexp_item", cfg["incexp"]))


def build_index(conn, years_by_lens):
    munis = [
        {"code": code, "name": name, "province": prov, "category": cat}
        for code, name, prov, cat in conn.execute(
            "SELECT DISTINCT m.code, m.name, m.province, m.category FROM municipality m "
            "JOIN grant_received g ON g.muni_code = m.code ORDER BY m.name"
        )
    ]
    provinces = sorted({m["province"] for m in munis if m["province"]})
    return {
        "lenses": [{"key": k, "label": v["label"]} for k, v in config.LENSES.items()],
        "default_lens": config.DEFAULT_LENS,
        "years": years_by_lens,
        "default_year": {lens: (max(ys) if ys else None) for lens, ys in years_by_lens.items()},
        "provinces": provinces,
        "municipalities": munis,
    }


def build_national(conn, lens, year):
    grant_at = config.LENSES[lens]["grants"]
    raw = conn.execute(
        "SELECT gt.label, gt.is_conditional, m.province, m.code, m.name, g.amount FROM grant_received g "
        "JOIN grant_type gt ON g.grant_code = gt.code JOIN municipality m ON m.code = g.muni_code "
        "WHERE g.financial_year = ? AND g.amount_type = ? AND g.amount > 0 AND m.province IS NOT NULL",
        (year, grant_at),
    ).fetchall()

    nodes, index, links = [], {}, []

    def node(node_id, label, kind):
        if node_id not in index:
            index[node_id] = len(nodes)
            nodes.append({"id": node_id, "label": label, "kind": kind})
        return index[node_id]

    nrf = node("nrf", "National Revenue Fund", "source")
    src_grant, grant_prov, cond_of, prov_of = defaultdict(float), defaultdict(float), {}, {}
    prov_muni, muni_name, muni_total = defaultdict(lambda: defaultdict(float)), {}, defaultdict(float)

    for label, is_cond, province, code, name, amount in raw:
        gkey = f"grant:{label}"
        cond_of[gkey] = bool(is_cond)
        prov_of[gkey] = label in config.PROVINCIAL_GRANT_LABELS
        src_grant[gkey] += amount
        grant_prov[(gkey, province)] += amount
        node(gkey, label, "grant-conditional" if is_cond else "grant-equitable")
        prov_muni[province][code] += amount
        muni_name[code] = name
        muni_total[code] += amount

    provdept = node("provdept", "Provincial departments", "source-prov") if any(prov_of.values()) else nrf
    for gkey, total in src_grant.items():
        links.append({"source": provdept if prov_of[gkey] else nrf, "target": index[gkey],
                      "value": round(total), "conditional": cond_of[gkey], "provincial": prov_of[gkey]})
    for (gkey, province), total in grant_prov.items():
        target = node(f"prov:{province}", province, "province")
        links.append({"source": index[gkey], "target": target, "value": round(total),
                      "conditional": cond_of[gkey], "provincial": prov_of[gkey]})

    province_munis = {
        province: sorted(
            ({"code": c, "name": muni_name[c], "value": round(v)} for c, v in munis.items()),
            key=lambda x: -x["value"],
        )
        for province, munis in prov_muni.items()
    }
    return {
        "lens": lens, "year": year, "nodes": nodes, "links": links,
        "muniTotals": {c: round(v) for c, v in muni_total.items()},
        "provinceMunis": province_munis,
    }


def build_profile(conn, code, name, province, category, years_by_lens):
    lenses = {}
    for lens, cfg in config.LENSES.items():
        grant_at, incexp_at = cfg["grants"], cfg["incexp"]
        data, available = {}, []
        for year in years_by_lens[lens]:
            inflows = [
                {"label": label, "conditional": bool(cond),
                 "provincial": label in config.PROVINCIAL_GRANT_LABELS, "amount": round(amount)}
                for label, cond, amount in conn.execute(
                    "SELECT gt.label, gt.is_conditional, g.amount FROM grant_received g "
                    "JOIN grant_type gt ON g.grant_code = gt.code "
                    "WHERE g.muni_code=? AND g.financial_year=? AND g.amount_type=? AND g.amount>0 "
                    "ORDER BY g.amount DESC",
                    (code, year, grant_at),
                )
            ]

            functions = [
                {"label": label, "amount": round(amount)}
                for label, amount in conn.execute(
                    "SELECT function_label, amount FROM spend_function "
                    "WHERE muni_code=? AND financial_year=? AND amount_type=? AND amount>0 "
                    "ORDER BY amount DESC",
                    (code, year, incexp_at),
                )
            ]
            if not inflows and not functions:
                continue
            # Own revenue = genuinely self-raised income only. Exclude transfer/subsidy lines and
            # the fuel levy, which are national/provincial transfers (not money the town raises).
            own_revenue = conn.execute(
                "SELECT COALESCE(sum(amount), 0) FROM incexp_item "
                "WHERE muni_code=? AND financial_year=? AND amount_type=? AND direction='income' "
                "AND item_label NOT LIKE '%ransfer%' AND item_label NOT LIKE '%uel Levy%'",
                (code, year, incexp_at),
            ).fetchone()[0]
            own_revenue = max(round(own_revenue), 0)
            income_total = conn.execute(
                "SELECT COALESCE(sum(amount), 0) FROM incexp_item "
                "WHERE muni_code=? AND financial_year=? AND amount_type=? AND direction='income'",
                (code, year, incexp_at),
            ).fetchone()[0]
            income_total = max(round(income_total), 0)

            equitable = sum(i["amount"] for i in inflows if not i["conditional"])
            provincial = sum(i["amount"] for i in inflows if i["provincial"])
            national_conditional = sum(i["amount"] for i in inflows if i["conditional"] and not i["provincial"])
            conditional = national_conditional + provincial
            grants = equitable + conditional
            # Transfer income booked beyond the itemised grants cube — chiefly the general fuel
            # levy (metros), plus reconciliation between the income and grants source cubes.
            other_transfers = max(income_total - own_revenue - grants, 0)
            spend = sum(f["amount"] for f in functions)
            data[str(year)] = {
                "inflows": inflows,
                "spendByFunction": functions,
                "totals": {
                    "grants": grants, "equitable": equitable, "conditional": conditional,
                    "national_conditional": national_conditional, "provincial": provincial,
                    "other_transfers": other_transfers,
                    "spend": spend, "revenue": own_revenue + grants + other_transfers,
                    "own_revenue": own_revenue,
                },
            }
            available.append(year)
        lenses[lens] = {"years": available, "data": data}

    return {"code": code, "name": name, "province": province, "category": category, "lenses": lenses}


def main():
    conn = sqlite3.connect(DB_PATH)
    (OUT / "muni").mkdir(parents=True, exist_ok=True)

    years_by_lens = {lens: usable_years(conn, lens) for lens in config.LENSES}
    dump(OUT / "index.json", build_index(conn, years_by_lens))

    for lens in config.LENSES:
        (OUT / "national" / lens).mkdir(parents=True, exist_ok=True)
        for year in years_by_lens[lens]:
            dump(OUT / "national" / lens / f"{year}.json", build_national(conn, lens, year))

    munis = conn.execute(
        "SELECT DISTINCT m.code, m.name, m.province, m.category FROM municipality m "
        "JOIN grant_received g ON g.muni_code = m.code"
    ).fetchall()
    for code, name, province, category in munis:
        dump(OUT / "muni" / f"{code}.json", build_profile(conn, code, name, province, category, years_by_lens))

    print(f"exported index + national {({l: years_by_lens[l] for l in config.LENSES})} + {len(munis)} munis")
    conn.close()


if __name__ == "__main__":
    main()
