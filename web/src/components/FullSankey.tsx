import { useMemo } from "react";
import { sankey, sankeyLinkHorizontal, sankeyLeft } from "d3-sankey";
import type { FullTreeData } from "../lib/types";
import { formatRand } from "../lib/format";

interface Props {
  data: FullTreeData;
  onSelectMuni: (code: string) => void;
}

const WIDTH = 1320;
const PAD = 12;
const RIGHT_LABEL = 250;
const ROW = 15;

const truncate = (s: string, n = 34) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

// The entire budget tree on one page: NRF -> spheres -> departments / provinces -> 257
// municipalities. Nodes are pre-ordered (DFS) so each column groups under its parent.
export function FullSankey({ data, onSelectMuni }: Props) {
  const muniCount = useMemo(() => data.nodes.filter((n) => n.kind === "municipality").length, [data]);
  const height = Math.max(900, muniCount * ROW + 140);

  const graph = useMemo(() => {
    const nodes = data.nodes.map((d) => ({ ...d }));
    const links = data.links.map((d) => ({ ...d }));
    const gen = sankey<any, any>()
      .nodeWidth(14)
      .nodePadding(4)
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
            style={{ strokeWidth: Math.max(0.5, l.width) }}>
            <title>{l.source.label} → {l.target.label}: {formatRand(l.value)}</title>
          </path>
        ))}
      </g>
      <g className="sankey-nodes">
        {graph.nodes.map((n: any) => {
          const h = Math.max(1, n.y1 - n.y0);
          const isMuni = n.kind === "municipality";
          return (
            <g key={n.id} transform={`translate(${n.x0},${n.y0})`}
              className={`node-group ${isMuni ? "node-group--clickable" : ""}`}
              onClick={isMuni ? () => onSelectMuni(n.id.replace("muni:", "")) : undefined}>
              <rect width={n.x1 - n.x0} height={h} rx={1.5} className={`node node--${n.kind}`}>
                <title>{n.label}: {formatRand(n.value)}{isMuni ? " — open profile" : ""}</title>
              </rect>
              <text className="node-label full-label" x={n.x1 - n.x0 + 6} y={h / 2} dy="0.35em" textAnchor="start">
                {truncate(n.label)}
                <tspan className="node-amount" dx="5">{formatRand(n.value)}</tspan>
              </text>
            </g>
          );
        })}
      </g>
    </svg>
  );
}
