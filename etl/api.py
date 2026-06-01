"""Minimal client for the Municipal Money OLAP "cubes" API.

Uses only the standard library so the ETL needs no dependencies.

The cubes API takes pipe-separated `cut` filters and `drilldown` dimensions, e.g.:
  /cubes/incexp_v2/aggregate?cut=demarcation.code:"CPT"|financial_year_end.year:2023
                            &drilldown=item.label&aggregates=amount.sum
Colons and dots must stay raw; quotes and pipes must be percent-encoded.
"""

import json
import time
import urllib.parse
import urllib.request


class CubesClient:
    def __init__(self, base, pause=0.4, timeout=60):
        self.base = base.rstrip("/")
        self.pause = pause
        self.timeout = timeout

    @staticmethod
    def _encode(value):
        # Keep ':' and '.' literal (cube operators); encode quotes, pipes, spaces.
        return urllib.parse.quote(str(value), safe=":.")

    def _get(self, path, params=None):
        params = params or {}
        query = "&".join(f"{k}={self._encode(v)}" for k, v in params.items())
        url = f"{self.base}/{path}"
        if query:
            url = f"{url}?{query}"
        req = urllib.request.Request(url, headers={"User-Agent": "govspend-etl/0.1"})
        with urllib.request.urlopen(req, timeout=self.timeout) as resp:
            data = json.load(resp)
        if self.pause:
            time.sleep(self.pause)
        if data.get("status") != "ok":
            raise RuntimeError(f"API error for {url}: {data.get('status')}")
        return data

    def aggregate(self, cube, cut=None, drilldown=None, aggregates="amount.sum",
                  order=None, page=None, pagesize=None):
        """Return one page of aggregated cells. `cut`/`drilldown` are lists of dim strings."""
        params = {"aggregates": aggregates}
        if cut:
            params["cut"] = "|".join(cut)
        if drilldown:
            params["drilldown"] = "|".join(drilldown)
        if order:
            params["order"] = order
        if page is not None:
            params["page"] = page
        if pagesize is not None:
            params["pagesize"] = pagesize
        return self._get(f"cubes/{cube}/aggregate", params)

    def aggregate_all(self, cube, cut=None, drilldown=None, aggregates="amount.sum", pagesize=10000):
        """Page through an aggregate query and return every cell.

        A single drill-down (municipality x year x item) replaces thousands of per-entity calls.
        """
        cells, page = [], 1
        while True:
            data = self.aggregate(cube, cut=cut, drilldown=drilldown,
                                   aggregates=aggregates, page=page, pagesize=pagesize)
            chunk = data.get("cells", [])
            cells.extend(chunk)
            total = data.get("total_cell_count")
            if not chunk or (total is not None and len(cells) >= total):
                break
            page += 1
        return cells

    def facts(self, cube, pagesize=10000):
        """Return every fact row of a cube (used for the small municipalities cube)."""
        rows, page = [], 1
        while True:
            data = self._get(f"cubes/{cube}/facts", {"pagesize": pagesize, "page": page})
            chunk = data.get("data", [])
            rows.extend(chunk)
            if len(chunk) < pagesize:
                break
            page += 1
        return rows

    def members(self, cube, dimension, pagesize=10000):
        """Return all members of a dimension (e.g. every municipality)."""
        return self._get(f"cubes/{cube}/members/{dimension}", {"pagesize": pagesize})

    def model(self, cube):
        """Return the cube's model (dimensions, attributes, measures)."""
        return self._get(f"cubes/{cube}/model")
