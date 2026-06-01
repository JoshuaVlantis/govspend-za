import { useEffect, useState } from "react";
import type { Profile } from "../lib/types";
import { MuniSankey } from "./MuniSankey";
import { formatRand, formatRandFull, pct } from "../lib/format";

const BASE = import.meta.env.BASE_URL;

interface Props {
  code: string;
  lens: string;
  lensLabel: string;
  year: number | null;
  onBack: () => void;
}

function inflowPill(g: { conditional: boolean; provincial: boolean }) {
  if (g.provincial) return { cls: "pill--provincial", text: "provincial" };
  if (g.conditional) return { cls: "pill--traceable", text: "conditional" };
  return { cls: "pill--pooled", text: "equitable" };
}

export function MunicipalityProfile({ code, lens, lensLabel, year, onBack }: Props) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    setProfile(null);
    setError(false);
    fetch(`${BASE}data/muni/${code.toUpperCase()}.json`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(setProfile)
      .catch(() => setError(true));
  }, [code]);

  if (error) {
    return (
      <main className="profile">
        <button className="back-link" onClick={onBack}>← All municipalities</button>
        <p className="empty">No data for “{code}”.</p>
      </main>
    );
  }
  if (!profile) {
    return <main className="profile"><p className="empty">Loading…</p></main>;
  }

  const lp = profile.lenses[lens];
  if (!lp || lp.years.length === 0) {
    return (
      <main className="profile">
        <button className="back-link" onClick={onBack}>← All municipalities</button>
        <header className="profile-head">
          <p className="eyebrow">{profile.province ?? "Municipality"}</p>
          <h1 className="profile-title">{profile.name}</h1>
        </header>
        <p className="note">No {lensLabel.toLowerCase()} data available for {profile.name}. Try the other lens.</p>
      </main>
    );
  }

  const latest = lp.years[lp.years.length - 1];
  const wanted = year ?? latest;
  const displayYear = lp.data[String(wanted)] ? wanted : latest;
  const yp = lp.data[String(displayYear)];

  const t = yp.totals;
  const govt = t.grants + t.other_transfers;
  const govtShare = pct(govt, t.revenue);
  const ownShare = pct(t.own_revenue, t.revenue);
  const equitableShare = pct(t.equitable, t.grants);
  const maxSpend = Math.max(...yp.spendByFunction.map((s) => Math.abs(s.amount)), 1);

  return (
    <main className="profile">
      <button className="back-link" onClick={onBack}>← All municipalities</button>

      <header className="profile-head">
        <p className="eyebrow">{profile.province ?? "Municipality"} · {lensLabel} · FY{displayYear}</p>
        <h1 className="profile-title">{profile.name}</h1>
        {displayYear !== wanted && (
          <p className="note">No {lensLabel.toLowerCase()} data for FY{wanted} — showing {profile.name}’s most recent, FY{displayYear}.</p>
        )}
        <p className="profile-lede">
          Of {profile.name}’s <strong>{formatRand(t.revenue)}</strong> in {lensLabel.toLowerCase()} income,{" "}
          <strong>{formatRand(govt)}</strong> ({govtShare}%) comes from government — national grants,
          provincial transfers and the fuel levy — and <strong>{formatRand(t.own_revenue)}</strong> ({ownShare}%)
          it raises itself.
        </p>
      </header>

      <section className="big-numbers">
        <div className="bignum">
          <span className="bignum__value">{formatRand(govt)}</span>
          <span className="bignum__label">Government grants &amp; transfers</span>
        </div>
        <div className="bignum">
          <span className="bignum__value">{formatRand(t.own_revenue)}</span>
          <span className="bignum__label">Raised by the municipality</span>
        </div>
        <div className="bignum">
          <span className="bignum__value">{formatRand(t.spend)}</span>
          <span className="bignum__label">{lens === "actual" ? "Actual spending" : "Budgeted spending"}</span>
        </div>
      </section>

      <section className="section-block">
        <h2 className="panel-title">How {profile.name}’s money flows</h2>
        <p className="section-note">
          National Revenue Fund → {profile.province ?? "province"} → {profile.name}
          {t.provincial > 0 ? ", plus provincial-department transfers" : ""}, plus own revenue — then out
          to each type of spending.
        </p>
        <div className="sankey-wrap">
          <MuniSankey province={profile.province} muniName={profile.name} totals={t} functions={yp.spendByFunction} />
        </div>
        <div className="legend">
          <span className="legend-item"><span className="legend-swatch legend-swatch--traceable" /> conditional grant</span>
          <span className="legend-item"><span className="legend-swatch legend-swatch--pooled" /> equitable share</span>
          {t.provincial > 0 && <span className="legend-item"><span className="legend-swatch legend-swatch--provincial" /> provincial transfer</span>}
          {t.other_transfers > 0 && <span className="legend-item"><span className="legend-swatch legend-swatch--transfer" /> other transfers</span>}
          <span className="legend-item"><span className="legend-swatch legend-swatch--own" /> own revenue</span>
          <span className="legend-item"><span className="legend-swatch legend-swatch--spend" /> spending</span>
        </div>
      </section>

      <section className="honesty">
        <div className="honesty__bar">
          <span className="honesty__seg honesty__seg--pooled" style={{ flexGrow: Math.max(t.equitable, 1) }} />
          <span className="honesty__seg honesty__seg--traceable" style={{ flexGrow: Math.max(t.conditional, 1) }} />
        </div>
        <p className="honesty__note">
          <strong>{equitableShare}%</strong> of itemised grants is the <em>equitable share</em> —
          unconditional, so {profile.name} decides locally how to use it (it’s formula-based and largely
          meant for free basic services). The rest is ring-fenced conditional grants and provincial
          transfers for named purposes.
        </p>
      </section>

      <div className="profile-cols">
        <section className="panel">
          <h2 className="panel-title">Where the money comes from</h2>
          <ul className="inflow-list">
            {yp.inflows.map((g) => {
              const pill = inflowPill(g);
              return (
                <li key={g.label} className="inflow">
                  <span className={`pill ${pill.cls}`}>{pill.text}</span>
                  <span className="inflow__label">{g.label}</span>
                  <span className="inflow__amount">{formatRand(g.amount)}</span>
                </li>
              );
            })}
            {t.other_transfers > 0 && (
              <li className="inflow">
                <span className="pill pill--transfer">transfer</span>
                <span className="inflow__label">Other transfers (incl. general fuel levy)</span>
                <span className="inflow__amount">{formatRand(t.other_transfers)}</span>
              </li>
            )}
          </ul>
          <p className="panel-foot">
            Plus <strong>{formatRand(t.own_revenue)}</strong> ({ownShare}%) raised locally through rates,
            electricity, water and other charges.
          </p>
        </section>

        <section className="panel">
          <h2 className="panel-title">What it’s spent on</h2>
          <div className="flow-bars">
            {yp.spendByFunction.filter((s) => s.amount > 0).map((s) => (
              <div key={s.label} className="bar-row">
                <span className="bar-row__label">{s.label}</span>
                <span className="bar-track">
                  <span className="bar-fill" style={{ width: `${(Math.abs(s.amount) / maxSpend) * 100}%` }} />
                </span>
                <span className="bar-row__amount">{formatRand(s.amount)}</span>
              </div>
            ))}
          </div>
        </section>
      </div>

      <p className="source-note">
        Source: National Treasury Municipal Money. {lensLabel} figures, FY{displayYear}. Spending grouped by
        government function; transfers shown at allocated (gazetted) value. Spending can exceed income where a
        budgeted operating deficit or non-cash items (e.g. depreciation) apply. Government transfers: {formatRandFull(govt)}.
      </p>
    </main>
  );
}
