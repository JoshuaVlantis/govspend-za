# GovSpend ZA — where South Africa's money goes

A public, civic tool that visualises the flow of South African government money as a
**drill-down Sankey diagram**: Revenue → Division of Revenue → spheres/departments →
spending. The hero is the national flow; any municipality can be opened to see its own
inflows and spend. Searchable entity profiles back it up.

## Audience
Ordinary citizens. Tone: clear, visual, honest. Not a dashboard for analysts.

## The honesty mechanic (core design principle)
Money reaches a municipality two ways:
- **Equitable Share** — unconditional. Pooled with own revenue; cannot be traced to a
  specific expenditure. Shown as a *pooled* (hatched) flow.
- **Conditional grants** — ring-fenced and reported on. Traceable end-to-end. Shown as a
  *traceable* (solid) flow.
Making this distinction visible is the product's whole point — we never imply precision
the data can't support.

## Data sources (verified live, June 2026)
- **Municipal Money API** — `https://municipaldata.treasury.gov.za/api` (OLAP "cubes").
  - `grants_v2` — grants received per municipality, incl. Local Government Equitable Share. **Inflows.**
  - `incexp_v2` — income & expenditure line items. **Spend + own revenue.**
  - `uifwexp` — unauthorised/irregular/fruitless/wasteful expenditure (future layer).
  - `audit_opinions` — Auditor-General outcomes (future layer).
  - Join key: `demarcation.code` (e.g. CPT, JHB). 292 municipalities. Updated quarterly.
- **National/provincial budgets** — Vulekamali was rebuilt; the old CSV route is gone.
  Sourcing the new API is **phase 2**. Not blocking: the national→municipality arm is
  fully derivable from `grants_v2`.

## Architecture
```
Municipal Money API ──(ETL, Python)──▶ SQLite (local source of truth)
                                          │
                                          ├─(export)─▶ compact JSON
                                                         │
                                          Vite + React + TS + d3-sankey (static site)
```
- **ETL**: Python (stdlib `sqlite3` + `urllib`, zero install). `etl/`.
- **DB**: SQLite at `data/govspend.db` (gitignored). Pre-computes the graphs.
- **Frontend**: static React app reading exported JSON. Cheap, fast, resilient to API downtime.

## v1 scope
National → any municipality. Hero Sankey (sum of all municipalities' grants = the
national→local-government flow) + drill-down to per-municipality inflows/outflows + search.

## Phasing
1. ETL metros → SQLite (prove pipeline)  ← current
2. Classify income/expenditure + equitable-vs-conditional
3. Export JSON
4. Frontend Sankey + profiles
5. Scale ETL to all municipalities + years
6. Phase 2: national-department & provincial budget arms

## Open items
- Valid `amount_type` codes per cube (AUDA = audited actual; confirm ORGB/budget).
- Income vs expenditure tagging from the `incexp_v2` item dimension.
- National budget data source (phase 2).
