import { useEffect, useMemo, useState } from "react";
import type { IndexData, NationalData } from "./lib/types";
import { NationalSankey } from "./components/NationalSankey";
import { MunicipalityProfile } from "./components/MunicipalityProfile";
import { formatRand } from "./lib/format";

const BASE = import.meta.env.BASE_URL;

type Route = { view: "home" } | { view: "muni"; code: string };

function parseHash(): Route {
  const parts = window.location.hash.replace(/^#\/?/, "").split("/");
  if (parts[0] === "muni" && parts[1]) return { view: "muni", code: parts[1] };
  return { view: "home" };
}

export default function App() {
  const [route, setRoute] = useState<Route>(parseHash());
  const [index, setIndex] = useState<IndexData | null>(null);
  const [indexError, setIndexError] = useState(false);
  const [lens, setLens] = useState<string>("budget");
  const [year, setYear] = useState<number | null>(null);
  const [national, setNational] = useState<NationalData | null>(null);
  const [nationalError, setNationalError] = useState(false);

  useEffect(() => {
    const onHash = () => setRoute(parseHash());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  useEffect(() => {
    fetch(`${BASE}data/index.json`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d: IndexData) => {
        setIndex(d);
        setLens(d.default_lens);
        setYear(d.default_year[d.default_lens]);
      })
      .catch(() => setIndexError(true));
  }, []);

  useEffect(() => {
    if (year == null) return;
    setNational(null);
    setNationalError(false);
    fetch(`${BASE}data/national/${lens}/${year}.json`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(setNational)
      .catch(() => setNationalError(true));
  }, [lens, year]);

  const changeLens = (next: string) => {
    if (!index) return;
    setLens(next);
    const ys = index.years[next] ?? [];
    if (year == null || !ys.includes(year)) {
      setYear(index.default_year[next] ?? (ys.length ? ys[ys.length - 1] : null));
    }
  };

  const goMuni = (code: string) => {
    window.location.hash = `#/muni/${code}`;
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const goHome = () => {
    window.location.hash = "#/";
  };

  const lensLabel = index?.lenses.find((l) => l.key === lens)?.label ?? "";
  const years = index?.years[lens] ?? [];

  if (indexError && !index) {
    return (
      <div className="app">
        <p className="error-banner">
          Couldn’t load the data. If you’re running this locally, make sure the dev server is serving{" "}
          <code>/data/index.json</code>.
        </p>
      </div>
    );
  }

  return (
    <div className="app">
      <header className="site-header">
        <button className="brand" onClick={goHome} aria-label="GovSpend ZA home">
          <span className="brand-mark" aria-hidden="true" />
          <span className="brand-text">GovSpend<span className="brand-accent"> ZA</span></span>
        </button>
        <div className="header-controls">
          {index && (
            <div className="lens-toggle" role="group" aria-label="Budget or actual">
              {index.lenses.map((l) => (
                <button key={l.key} className={lens === l.key ? "active" : ""} onClick={() => changeLens(l.key)}>
                  {l.label}
                </button>
              ))}
            </div>
          )}
          {index && year != null && (
            <select className="year-select" value={year} aria-label="Financial year"
              onChange={(e) => setYear(Number(e.target.value))}>
              {years.map((y) => (
                <option key={y} value={y}>FY{y}{y === index.default_year[lens] ? " (latest)" : ""}</option>
              ))}
            </select>
          )}
          {index && (
            <select className="muni-select" value={route.view === "muni" ? route.code : ""}
              onChange={(e) => e.target.value && goMuni(e.target.value)} aria-label="Search a municipality">
              <option value="">Search municipality…</option>
              {index.provinces.map((p) => (
                <optgroup key={p} label={p}>
                  {index.municipalities.filter((m) => m.province === p).map((m) => (
                    <option key={m.code} value={m.code}>{m.name}</option>
                  ))}
                </optgroup>
              ))}
            </select>
          )}
        </div>
      </header>

      {route.view === "muni" ? (
        <MunicipalityProfile code={route.code} lens={lens} lensLabel={lensLabel} year={year} onBack={goHome} />
      ) : (
        <Home index={index} national={national} nationalError={nationalError} lens={lens} lensLabel={lensLabel}
          year={year} onSelectMuni={goMuni} />
      )}

      <footer className="site-footer">
        <p>
          Data: National Treasury <a href="https://municipaldata.treasury.gov.za">Municipal Money</a> API
          (grants_v2, incexp_v2). Budgeted = original budget; Actual spend = audited actuals, with transfers
          shown at their allocated (gazetted) value. A civic project — not affiliated with government.
        </p>
      </footer>
    </div>
  );
}

interface HomeProps {
  index: IndexData | null;
  national: NationalData | null;
  nationalError: boolean;
  lens: string;
  lensLabel: string;
  year: number | null;
  onSelectMuni: (code: string) => void;
}

function Home({ index, national, nationalError, lens, lensLabel, year, onSelectMuni }: HomeProps) {
  const [province, setProvince] = useState<string>("All");
  const [query, setQuery] = useState("");
  const [showAll, setShowAll] = useState(false);

  const totals = national?.muniTotals ?? {};
  const grandTotal = useMemo(() => Object.values(totals).reduce((s, v) => s + v, 0), [totals]);
  const hasProvincial = useMemo(() => (national?.links ?? []).some((l) => l.provincial), [national]);

  const filtered = useMemo(() => {
    if (!index) return [];
    const q = query.trim().toLowerCase();
    return index.municipalities
      .filter((m) => (province === "All" || m.province === province) && (!q || m.name.toLowerCase().includes(q)))
      .map((m) => ({ ...m, total: totals[m.code] ?? 0 }))
      .sort((a, b) => b.total - a.total);
  }, [index, province, query, totals]);

  const capped = province === "All" && !query && !showAll ? filtered.slice(0, 60) : filtered;
  const maxTotal = filtered.length ? filtered[0].total || 1 : 1;

  return (
    <main>
      <section className="hero">
        <p className="hero-eyebrow">Follow the money · South Africa{year ? ` · ${lensLabel} FY${year}` : ""}</p>
        <h1 className="hero-title">
          Where does national government money <em>actually</em> go?
        </h1>
        <p className="hero-lede">
          Every year, billions flow from the National Revenue Fund to municipalities. This traces that
          flow — grant by grant, province by province, town by town — and is honest about where the trail
          goes cold.
        </p>
        {national && (
          <div className="hero-stats">
            <Stat value={formatRand(grandTotal)} label={`Transfers to municipalities · FY${national.year}`} />
            <Stat value={String(index?.municipalities.length ?? 0)} label="Municipalities covered" />
            <Stat value={String(index?.years[lens]?.length ?? 0)} label={`Years (${lensLabel.toLowerCase()})`} />
          </div>
        )}
      </section>

      <section className="section">
        <div className="section-head">
          <h2 className="section-title">The national money flow</h2>
          <p className="section-note">
            {hasProvincial ? (
              <>Two sources on the left — <strong>National Revenue Fund</strong> and (in purple){" "}
                <strong>Provincial departments</strong> — flow through each grant to the provinces. </>
            ) : (
              <>National Revenue Fund → grant → province. </>
            )}
            <strong>Click a province to expand its municipalities</strong>; click a municipality to open it.
          </p>
        </div>
        <div className="legend">
          <span className="legend-item">
            <span className="legend-swatch legend-swatch--traceable" /> Conditional grant — ring-fenced, traceable
          </span>
          <span className="legend-item">
            <span className="legend-swatch legend-swatch--pooled" /> Equitable share — pooled, the municipality decides
          </span>
          {hasProvincial && (
            <span className="legend-item">
              <span className="legend-swatch legend-swatch--provincial" /> Provincial departments — source
            </span>
          )}
        </div>
        <div className="sankey-wrap">
          {national ? (
            <NationalSankey data={national} onSelectMuni={onSelectMuni} />
          ) : nationalError ? (
            <p className="empty">Couldn’t load the flow for {lensLabel} FY{year}.</p>
          ) : (
            <p className="empty">Loading the flow…</p>
          )}
        </div>
      </section>

      <section className="section" id="browse">
        <div className="section-head">
          <h2 className="section-title">Browse {index?.municipalities.length ?? ""} municipalities</h2>
          <p className="section-note">
            National transfers received{year ? ` · ${lensLabel} FY${year}` : ""}, biggest first.
          </p>
        </div>
        {index && (
          <div className="chips">
            <button className={`chip ${province === "All" ? "chip--active" : ""}`} onClick={() => setProvince("All")}>
              All
            </button>
            {index.provinces.map((p) => (
              <button key={p} className={`chip ${province === p ? "chip--active" : ""}`} onClick={() => setProvince(p)}>
                {p}
              </button>
            ))}
          </div>
        )}
        <div className="browse-tools">
          <input className="search-input" placeholder="Filter by name…" value={query}
            onChange={(e) => setQuery(e.target.value)} />
          <span className="browse-count">{filtered.length} shown</span>
        </div>
        <div className="muni-list">
          {capped.map((m) => (
            <button key={m.code} className="muni-row" onClick={() => onSelectMuni(m.code)}>
              <span className="muni-row__name">
                {m.name}
                {province === "All" && m.province ? <span className="muni-row__prov"> · {m.province}</span> : null}
              </span>
              <span className="muni-row__amount">{m.total ? formatRand(m.total) : "—"}</span>
              <span className="muni-row__bar" aria-hidden="true">
                <span className="muni-row__bar-fill" style={{ width: `${(m.total / maxTotal) * 100}%` }} />
              </span>
            </button>
          ))}
        </div>
        {capped.length < filtered.length && (
          <button className="show-all" onClick={() => setShowAll(true)}>Show all {filtered.length}</button>
        )}
      </section>
    </main>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="stat">
      <span className="stat-value">{value}</span>
      <span className="stat-label">{label}</span>
    </div>
  );
}
