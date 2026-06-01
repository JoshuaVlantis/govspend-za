# GovSpend ZA — follow South Africa's money

A public, civic tool that visualises how South African government money flows from the
**National Revenue Fund → grants → provinces → municipalities → actual spending**, as
interactive Sankey diagrams. Built entirely on **live National Treasury "Municipal Money"
data**, stored locally and pre-computed into a fast static site.

> Civic project — **not affiliated with government**. Figures come from National Treasury;
> they can contain source-data quirks (noted below).

## What it shows

- **National flow** — `National Revenue Fund` (and, where present, `Provincial departments`)
  → each grant → the 9 provinces. Click a province to **drill into its municipalities**.
- **Municipality profiles** — `National → Province → Municipality` (+ own revenue + fuel levy)
  → **spending by function** (Electricity, Water, Housing, Roads…). All 257 municipalities, searchable.
- **Budget vs Actual-spend** toggle and a **year selector** (FY2020–2026 for budget).
- An **honesty model** baked into the visuals:
  - **Equitable share** — unconditional/pooled (the municipality decides how to spend it).
  - **Conditional grants** — ring-fenced, traceable to a named purpose.
  - **Provincial transfers** — from provincial departments, not the National Revenue Fund.
  - **Own revenue** — rates, electricity, water charges the municipality raises itself.

## Data sources

National Treasury **Municipal Money** API (`https://municipaldata.treasury.gov.za/api`) — OLAP
"cubes":
- `grants_v2` — transfers received per municipality (incl. the Local Government Equitable Share).
- `incexp_v2` — income & expenditure line items (mSCOA), by item, subcategory and function.
- `municipalities` — names, provinces, categories.

## Architecture

```
Municipal Money API ──(ETL, Python stdlib)──▶ SQLite ──(export)──▶ JSON
                                                                     │
                                          Vite + React + TS + d3-sankey (static site)
```

## Layout

```
etl/    Python ETL (stdlib only — no pip install)
  api.py        Municipal Money cubes client (pagination, encoding)
  config.py     cubes, amount types, lenses, provincial-grant labels
  schema.sql    SQLite schema
  load.py       bulk-load grants + income/expenditure + spend-by-function
  classify.py   tag income vs expenditure (mSCOA subcategory)
  export.py     SQLite → web/public/data/*.json
data/
  govspend.db   generated SQLite (gitignored — rebuild via ETL)
  samples/      a few API fixtures
web/    Vite + React + TypeScript frontend
  public/data/  exported JSON the site reads (committed, so it runs on clone)
  src/          App, NationalSankey, MuniSankey, MunicipalityProfile, lib/
docs/PLAN.md    design notes
```

## Running it

**Prerequisites:** Python 3 (standard library only) and Node 18+.

The exported JSON is committed, so you can run the site immediately:

```bash
cd web
npm install
npm run dev        # http://localhost:5173
npm run build      # production build (type-checks + bundles) to web/dist
```

To **rebuild the dataset** from the live API (≈30 calls, a couple of minutes):

```bash
python3 etl/load.py       # → data/govspend.db
python3 etl/classify.py   # tag income/expenditure
python3 etl/export.py     # → web/public/data/*.json
```

## Data model & honesty decisions

- **Amount types:** budget = `ORGB` (original budget); actual spend = `AUDA` (audited actual).
  Actual grant *receipts* (`ACT`) are badly under-reported in the cube, so **transfers are always
  shown at their allocated (gazetted) value**; the Budget/Actual toggle changes the *spending*
  figures, not the transfer amounts.
- **No double-counting:** only the annual (`year`) period grain is summed; NULL-subcategory
  "Other expenditure" rollups are excluded; spend-by-function is **expenditure only** (revenue and
  rollups filtered out via mSCOA subcategory).
- **Own revenue** = genuinely self-raised income (rates, service charges, fines, interest). Transfer
  and fuel-levy income lines are excluded. The general **fuel levy** (a national transfer to metros)
  plus minor cube-reconciliation differences appear as **"Other transfers."** So
  `revenue = own revenue + grants + other transfers`, reconciling to the operating statement.
- **Spending can exceed income** — SA municipalities budget operating deficits and non-cash items
  (e.g. depreciation), so the spend side of a municipal Sankey is often larger than its inflows.

## Known limitations / caveats

- **Provincial-department transfers** (Health, Education, etc.) are only present in the budget data
  for **FY2020 and FY2023**; the "Provincial departments" source only appears in those years.
- **Actual grant data** (`ACT`) is too sparse to display; transfers use the allocated value.
- A few grants share a label under different Treasury codes (e.g. "Municipal Systems Improvement
  Grant"); they are shown as Treasury publishes them.
- **Phase 2 (not built yet):** national-department and provincial *own* spending — i.e. the part of
  the Sankey *above* the transfers to municipalities (sourcing the rebuilt Vulekamali / ENE data).

## Provenance

Audited by multiple independent passes (data-pipeline, frontend, data-integrity reconciliation,
and domain/claims). All 257 municipalities reconcile to the SQLite source to the rand.
