import { useMemo } from "react";
import { sankey, sankeyLinkHorizontal, sankeyLeft } from "d3-sankey";
import type { Flow, Totals } from "../lib/types";
import { formatRand } from "../lib/format";

interface Props {
  province: string | null;
  muniName: string;
  totals: Totals;
  functions: Flow[];
}

const WIDTH = 1080;
const PAD = 10;
const ROW = 24;

const truncate = (s: string, n = 28) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

// National Revenue Fund -> Province -> Municipality, plus Provincial departments, Other
// transfers (fuel levy) and Own revenue feeding the municipality, then out to spend functions.
export function MuniSankey({ province, muniName, totals, functions }: Props) {
  const visible = functions.filter((f) => f.amount > 0);
  const height = Math.max(440, visible.length * ROW + 80);

  const graph = useMemo(() => {
    const nodes: any[] = [];
    const idx: Record<string, number> = {};
    const links: any[] = [];
    const node = (id: string, label: string, kind: string) => {
      if (!(id in idx)) {
        idx[id] = nodes.length;
        nodes.push({ id, label, kind });
      }
      return idx[id];
    };

    const nrf = node("nrf", "National Revenue Fund", "source");
    const prov = node("prov", province ?? "Province", "province");
    const muni = node("muni", muniName, "municipality");

    if (totals.equitable > 0) {
      links.push({ source: nrf, target: prov, value: totals.equitable, kind: "equitable" });
      links.push({ source: prov, target: muni, value: totals.equitable, kind: "equitable" });
    }
    if (totals.national_conditional > 0) {
      links.push({ source: nrf, target: prov, value: totals.national_conditional, kind: "conditional" });
      links.push({ source: prov, target: muni, value: totals.national_conditional, kind: "conditional" });
    }
    if (totals.provincial > 0) {
      const pd = node("provdept", "Provincial departments", "source-prov");
      links.push({ source: pd, target: muni, value: totals.provincial, kind: "provincial" });
    }
    if (totals.other_transfers > 0) {
      const ot = node("other", "Other transfers (fuel levy)", "transfer");
      links.push({ source: ot, target: muni, value: totals.other_transfers, kind: "transfer" });
    }
    if (totals.own_revenue > 0) {
      const own = node("own", "Own revenue", "own");
      links.push({ source: own, target: muni, value: totals.own_revenue, kind: "own" });
    }
    for (const f of visible) {
      const fi = node(`fn:${f.label}`, f.label, "function");
      links.push({ source: muni, target: fi, value: f.amount, kind: "spend" });
    }

    const gen = sankey<any, any>()
      .nodeWidth(15)
      .nodePadding(12)
      .nodeAlign(sankeyLeft)
      .extent([
        [PAD, PAD],
        [WIDTH - PAD, height - PAD],
      ]);
    return gen({ nodes, links });
  }, [province, muniName, totals, visible, height]);

  // Guard: with no links d3-sankey emits NaN geometry — show a message instead.
  if (graph.links.length === 0) {
    return <p className="empty">No financial breakdown available for this year.</p>;
  }

  const linkPath = sankeyLinkHorizontal();
  const linkClass = (kind: string) =>
    kind === "equitable" ? "pooled" : kind === "conditional" ? "traceable" : kind;

  return (
    <svg className="sankey muni-sankey" viewBox={`0 0 ${WIDTH} ${height}`} role="img"
      aria-label={`${muniName} money flow into spending`}>
      <g className="sankey-links">
        {graph.links.map((l: any, i: number) => (
          <path key={i} d={linkPath(l) ?? undefined} className={`link link--${linkClass(l.kind)}`}
            style={{ strokeWidth: Math.max(1, l.width) }}>
            <title>{l.source.label} → {l.target.label}: {formatRand(l.value)}</title>
          </path>
        ))}
      </g>
      <g className="sankey-nodes">
        {graph.nodes.map((n: any) => {
          const h = Math.max(1, n.y1 - n.y0);
          const leftHalf = n.x0 < WIDTH / 2;
          return (
            <g key={n.id} transform={`translate(${n.x0},${n.y0})`} className="node-group">
              <rect width={n.x1 - n.x0} height={h} rx={2} className={`node node--${n.kind}`}>
                <title>{n.label}: {formatRand(n.value)}</title>
              </rect>
              <text className="node-label" x={leftHalf ? n.x1 - n.x0 + 7 : -7} y={h / 2} dy="0.35em"
                textAnchor={leftHalf ? "start" : "end"}>
                {truncate(n.label)}
              </text>
            </g>
          );
        })}
      </g>
    </svg>
  );
}
