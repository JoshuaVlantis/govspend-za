import { useMemo } from "react";
import { sankey, sankeyLinkHorizontal, sankeyLeft } from "d3-sankey";
import type { FullTreeData } from "../lib/types";
import { formatRand } from "../lib/format";

interface Props {
  data: FullTreeData;
  onSelectMuni: (code: string) => void;
}

const WIDTH = 1500;
const PAD = 12;
const RIGHT_LABEL = 230;
const ROW = 12;

const truncate = (s: string, n = 36) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

// The ENTIRE tree on one page: NRF -> spheres -> departments / provinces -> 257 municipalities
// -> every spend function. ~7,500 nodes. Pre-ordered (DFS) so columns group under parents.
export function FullSankey({ data, onSelectMuni }: Props) {
  const rows = useMemo(() => {
    let fn = 0, mu = 0;
    for (const n of data.nodes) {
      if (n.kind === "function") fn++;
      else if (n.kind === "municipality") mu++;
    }
    return Math.max(fn, mu);
  }, [data]);
  const height = Math.max(900, rows * ROW + 160);

  const graph = useMemo(() => {
    const nodes = data.nodes.map((d) => ({ ...d }));
    const links = data.links.map((d) => ({ ...d }));
    const gen = sankey<any, any>()
      .nodeWidth(12)
      .nodePadding(7)
      .nodeAlign(sankeyLeft)
      .nodeSort((a: any, b: any) => (a.order ?? 0) - (b.order ?? 0))
      .extent([
        [PAD, PAD],
        [WIDTH - RIGHT_LABEL, height - PAD],
      ]);
    return gen({ nodes, links });
  }, [data, height]);

  const linkPath = sankeyLinkHorizontal();

  return (
    <svg className="sankey full-sankey" viewBox={`0 0 ${WIDTH} ${height}`} role="img"
      aria-label={`Full national budget tree, ${data.year}`}>
      <g className="sankey-links">
        {graph.links.map((l: any, i: number) => (
          <path key={i} d={linkPath(l) ?? undefined}
            className={`link ${l.target.kind === "debt" ? "link--debt" : "link--flow"}`}
            style={{ strokeWidth: Math.max(0.4, l.width) }}>
            <title>{l.source.label} → {l.target.label}: {formatRand(l.value)}</title>
          </path>
        ))}
      </g>
      <g className="sankey-nodes">
        {graph.nodes.map((n: any) => {
          const h = Math.max(0.5, n.y1 - n.y0);
          const isMuni = n.kind === "municipality";
          return (
            <g key={n.id} transform={`translate(${n.x0},${n.y0})`}
              className={`node-group ${isMuni ? "node-group--clickable" : ""}`}
              onClick={isMuni ? () => onSelectMuni(n.id.replace("muni:", "")) : undefined}>
              <rect width={n.x1 - n.x0} height={h} rx={1} className={`node node--${n.kind}`}>
                <title>{n.label}: {formatRand(n.value)}{isMuni ? " — open profile" : ""}</title>
              </rect>
              <text className="node-label full-label" x={n.x1 - n.x0 + 5} y={h / 2} dy="0.35em" textAnchor="start">
                {truncate(n.label)}
                <tspan className="node-amount" dx="4">{formatRand(n.value)}</tspan>
              </text>
            </g>
          );
        })}
      </g>
    </svg>
  );
}
