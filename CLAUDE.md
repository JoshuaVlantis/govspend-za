# GovSpend ZA — Claude Code project guide

Civic visualiser of South African government spending. Live National Treasury **Municipal Money**
data → Python ETL → SQLite → JSON → React/d3-sankey static site. See `README.md` for the product
overview; this file is the operational guide.

## Commands

```bash
# Rebuild dataset from the live API (stdlib only, ~30 calls, a few minutes)
python3 etl/load.py && python3 etl/classify.py && python3 etl/export.py

# Frontend (from repo root)
cd web && npm install
npm run dev                      # http://localhost:5173
npm run build --prefix web       # tsc + vite build — USE THIS TO TYPE-CHECK
```

After **any** change to `etl/` or `etl/config.py`, re-run `export.py` (and `load.py` if the schema
or pulled fields changed), then `npm run build` to type-check the frontend against the new JSON.

## Layout

- `etl/api.py` — Municipal Money cubes client. `aggregate_all` paginates; `_encode` keeps `:`/`.`
  literal and percent-encodes quotes/pipes (do not "simplify" this).
- `etl/config.py` — cube names, `LENSES`, `GRANT/INCEXP_AMOUNT_TYPES`, `REVENUE_SUBCATEGORIES`,
  `PROVINCIAL_GRANT_LABELS`, `FINANCIAL_YEARS`.
- `etl/load.py` — bulk drill-down loads: grants, income/expenditure, and `spend_function`.
- `etl/classify.py` — sets `incexp_item.direction` (income / expenditure / excluded).
- `etl/export.py` — writes `web/public/data/{index,national/<lens>/<year>,muni/<CODE>}.json`.
- `data/govspend.db` — generated SQLite (gitignored; rebuild via ETL).
- `web/src/` — `App.tsx` (routing + lens/year state), `NationalSankey.tsx` (province drill-down),
  `MuniSankey.tsx` (per-muni flow), `MunicipalityProfile.tsx`, `lib/types.ts`, `lib/format.ts`.

## Data-model gotchas (read before touching the ETL)

- **Amount types:** `ORGB` = budget, `AUDA` = audited actual spend. **`ACT` (actual grants) is
  unreliable — never display it.** Lenses: `budget` = ORGB grants + ORGB spend; `actual` = ORGB
  grants + AUDA spend. Transfers are always allocated (ORGB) value.
- **Period grain:** only `period_length = year` exists for these amount types — do not sum across
  periods (would double-count).
- **incexp `item.subcategory`:** NULL = per-function rollup ("Other expenditure") → marked
  `excluded` (summing it double-counts). Revenue = `REVENUE_SUBCATEGORIES` (Exchange / Non-exchange).
- **`spend_function`** = expenditure only (revenue subcats + NULL rollups filtered out), grouped by
  government function. Matches subcategory-expenditure totals exactly.
- **Grants:** Local Government Equitable Share = unconditional; everything else conditional.
  `PROVINCIAL_GRANT_LABELS` are provincial-department transfers, split to a "Provincial departments"
  source (only present FY2020 & FY2023).
- **Revenue split:** `own_revenue` = self-raised income (excludes transfer/subsidy lines and the fuel
  levy). `other_transfers = income_total − own_revenue − grants` (chiefly the metro fuel levy + cube
  reconciliation). `revenue = own_revenue + grants + other_transfers`.
- **Spend > income is expected** (budgeted operating deficits / non-cash). Municipal Sankeys are
  intentionally unbalanced by this gap.

## Frontend notes

- d3-sankey uses `nodeAlign(sankeyLeft)`. `NationalSankey` appends municipality nodes on province
  expand; `MuniSankey` guards the no-links case (d3-sankey emits NaN geometry otherwise).
- JSON shapes are mirrored exactly in `lib/types.ts`. Keep them in sync.

## Principle

Preserve the honesty model: never imply national money funds specific spending beyond what
conditional grants allow; keep equitable-vs-conditional and national-vs-provincial distinctions intact.

## Not yet done

Phase 2 — national-department and provincial *own* spending (the Sankey above municipal transfers).
