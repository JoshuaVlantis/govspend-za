-- GovSpend ZA — local SQLite schema
-- Source: National Treasury Municipal Money API (municipaldata.treasury.gov.za)
-- Idempotent: safe to run on every ETL invocation.

PRAGMA journal_mode = WAL;

-- One row per municipality (the join universe, keyed on demarcation code).
CREATE TABLE IF NOT EXISTS municipality (
  code        TEXT PRIMARY KEY,   -- demarcation code, e.g. 'CPT'
  name        TEXT NOT NULL,
  province    TEXT,               -- enriched from the municipalities cube (later)
  category    TEXT,               -- A=metro, B=local, C=district (later)
  population  INTEGER             -- for per-capita figures (later)
);

-- Grant types, with the fungibility flag that powers the honesty mechanic.
CREATE TABLE IF NOT EXISTS grant_type (
  code           TEXT PRIMARY KEY,
  label          TEXT NOT NULL,
  is_conditional INTEGER NOT NULL DEFAULT 1  -- 0 = equitable share (pooled), 1 = conditional (traceable)
);

-- INFLOWS: money received from national/provincial government, by grant.
CREATE TABLE IF NOT EXISTS grant_received (
  muni_code      TEXT NOT NULL,
  financial_year INTEGER NOT NULL,
  grant_code     TEXT NOT NULL,
  amount_type    TEXT NOT NULL,   -- AUDA, ORGB, ...
  amount         REAL,
  PRIMARY KEY (muni_code, financial_year, grant_code, amount_type)
);

-- SPEND + OWN REVENUE: income & expenditure line items.
CREATE TABLE IF NOT EXISTS incexp_item (
  muni_code      TEXT NOT NULL,
  financial_year INTEGER NOT NULL,
  item_label     TEXT NOT NULL,
  subcategory    TEXT,            -- mSCOA revenue/expenditure subcategory (drives direction)
  direction      TEXT,            -- 'income' | 'expenditure' (classified in a later step)
  amount_type    TEXT NOT NULL,
  amount         REAL,
  PRIMARY KEY (muni_code, financial_year, item_label, amount_type)
);

-- Provenance: one row per cube fetch, for transparency and debugging.
CREATE TABLE IF NOT EXISTS etl_run (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  cube        TEXT NOT NULL,
  params      TEXT,
  rows_loaded INTEGER,
  fetched_at  TEXT NOT NULL
);

-- SPEND BY FUNCTION: expenditure grouped by government function (Water, Housing, ...).
CREATE TABLE IF NOT EXISTS spend_function (
  muni_code      TEXT NOT NULL,
  financial_year INTEGER NOT NULL,
  function_label TEXT NOT NULL,
  amount_type    TEXT NOT NULL,
  amount         REAL,
  PRIMARY KEY (muni_code, financial_year, function_label, amount_type)
);

CREATE INDEX IF NOT EXISTS idx_grant_received_muni_year ON grant_received (muni_code, financial_year);
CREATE INDEX IF NOT EXISTS idx_incexp_muni_year ON incexp_item (muni_code, financial_year);
CREATE INDEX IF NOT EXISTS idx_spend_function_muni_year ON spend_function (muni_code, financial_year);
