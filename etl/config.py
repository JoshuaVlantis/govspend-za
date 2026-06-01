"""Configuration for the Municipal Money ETL.

All values are intentionally simple constants so the pipeline is easy to read and tweak.
"""

API_BASE = "https://municipaldata.treasury.gov.za/api"

# OLAP cube names (v2 = mSCOA-sourced, 2019-20 onwards)
CUBE_INCEXP = "incexp_v2"   # income & expenditure line items
CUBE_GRANTS = "grants_v2"   # grants received (incl. Local Government Equitable Share)
CUBE_MUNIS = "municipalities"

# Amount types we ingest. AUDA = Audited Actual (confirmed live).
# ORGB = Original Budget — lets the UI toggle "budget vs actual". Verified in explore.py.
AMOUNT_TYPES = ["AUDA", "ORGB"]

# Financial years (calendar year in which the SA financial year ends).
# These are the years with grant (ORGB) data; incexp covers these and more.
FINANCIAL_YEARS = [2020, 2021, 2022, 2023, 2024, 2026]

# The 8 metropolitan municipalities — kept for reference; the ETL now loads ALL
# municipalities via bulk drill-down queries.
METROS = ["BUF", "CPT", "EKU", "ETH", "JHB", "MAN", "NMA", "TSH"]

# A grant whose label contains any of these is treated as unconditional/fungible
# (equitable share). Everything else is a conditional, traceable grant.
EQUITABLE_SHARE_HINTS = ("equitable share",)

# Politeness: seconds to pause between API calls.
API_PAUSE_SECONDS = 0.4

# Income subcategories. Anything with a non-null subcategory that is NOT one of these is
# expenditure. NULL-subcategory items (e.g. "Other expenditure") are per-function rollups
# that double-count the detail, so they are excluded from totals.
REVENUE_SUBCATEGORIES = ("Exchange Revenue", "Non-exchange Revenue")

# Default lens. Original Budget (allocated) is populated for both grants and incexp.
PRIMARY_AMOUNT_TYPE = "ORGB"

# Budget vs Actual lenses, each mapping to the amount-type code used per cube.
#   budget = Original Budget (ORGB) on both cubes
#   actual = Audited Actual spend (AUDA) + Actual grants received (ACT)
LENSES = {
    "budget": {"label": "Budgeted", "grants": "ORGB", "incexp": "ORGB"},
    # Actual spending is audited (AUDA). Actual grant *receipts* (ACT) are badly under-reported
    # in the cube, so transfers are shown at their allocated (gazetted, ORGB) value in both
    # lenses; the lens changes the spending figures, not the transfer amounts.
    "actual": {"label": "Actual spend", "grants": "ORGB", "incexp": "AUDA"},
}
DEFAULT_LENS = "budget"
GRANT_AMOUNT_TYPES = ["ORGB", "ACT"]
INCEXP_AMOUNT_TYPES = ["ORGB", "AUDA"]

# Entries in the grants cube that are really PROVINCIAL-department transfers (labelled by
# department name), not national grants from the National Revenue Fund.
PROVINCIAL_GRANT_LABELS = {
    "Agriculture", "Education", "Health", "Housing and Local Government",
    "Office of the Premier", "Other Departments", "Public Works, Roads and Transport",
    "Social Development", "Sport, Arts and Culture",
}
