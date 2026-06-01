import { useMemo } from "react";
import { sankey, sankeyLinkHorizontal, sankeyLeft } from "d3-sankey";
import type { BudgetData } from "../lib/types";
import { formatRand } from "../lib/format";

interface Props {
  data: BudgetData;
  onExploreLocal: () => void;
}

const WIDTH = 1200;
const PAD = 12;
const RIGHT_LABEL = 260; // room for the right-hand (leaf) labels
const ROW = 22;

const truncate = (s: string, n = 40) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

// Fully expanded by default: NRF -> spheres -> their parts (44 departments, the provincial
// split, the 9 provinces under local government). "Local government" opens the municipal tool.
export function BudgetSankey({ data, onExploreLocal }: Props) {
  const totalChildren = useMemo(
    () => Object.values(data.children).reduce((sum, kids) => sum + kids.length, 0),
    [data],
  );
  const height = Math.max(760, totalChildren * ROW + 90);

  const graph = useMemo(() => {
    const nodes = data.nodes.map((d) => ({ ...d }));
    const links = data.links.map((d) => ({ ...d }));

    // Rank spheres by value so children can be grouped under their parent (largest first).
    const sphereValue: Record<string, number> = {};
    data.links.forEach((l) => { sphereValue[data.nodes[l.target].id] = l.value; });
    const sphereRank: Record<string, number> = {};
    Object.keys(sphereValue)
      .sort((a, b) => sphereValue[b] - sphereValue[a])
      .forEach((id, i) => { sphereRank[id] = i; });
    nodes.forEach((n: any) => { n.order = n.kind === "source" ? -1 : sphereRank[n.id] ?? 99; });

    for (const [sphereId, kids] of Object.entries(data.children)) {
      const si = nodes.findIndex((n) => n.id === sphereId);
      if (si < 0) continue;
      kids.forEach((c, i) => {
        nodes.push({
          id: `child:${sphereId}:${i}`,
          label: c.label,
          kind: sphereId === "sphere:local" ? "child-local" : "child",
          order: (sphereRank[sphereId] ?? 99) * 1000 + i,
        } as any);
        links.push({ source: si, target: nodes.length - 1, value: c.value } as any);
      });
    }

    const gen = sankey<any, any>()
      .nodeWidth(16)
      .nodePadding(10)
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
    <svg className="sankey" viewBox={`0 0 ${WIDTH} ${height}`} role="img"
      aria-label={`National budget ${data.year}, fully expanded`}>
      <g className="sankey-links">
        {graph.links.map((l: any, i: number) => (
          <path key={i} d={linkPath(l) ?? undefined}
            className={`link ${l.target.kind === "debt" ? "link--debt" : "link--flow"}`}
            style={{ strokeWidth: Math.max(1, l.width) }}>
            <title>{l.source.label} → {l.target.label}: {formatRand(l.value)}</title>
          </path>
        ))}
      </g>
      <g className="sankey-nodes">
        {graph.nodes.map((n: any) => {
          const h = Math.max(1, n.y1 - n.y0);
          const local = n.id === "sphere:local" || n.kind === "child-local";
          return (
            <g key={n.id} transform={`translate(${n.x0},${n.y0})`}
              className={`node-group ${local ? "node-group--clickable" : ""}`}
              onClick={local ? onExploreLocal : undefined}>
              <rect width={n.x1 - n.x0} height={h} rx={2} className={`node node--${n.kind}`}>
                <title>
                  {n.label}: {formatRand(n.value)}{local ? " — open the municipal tool" : ""}
                </title>
              </rect>
              <text className="node-label budget-label" x={n.x1 - n.x0 + 7} y={h / 2} dy="0.35em" textAnchor="start">
                {truncate(n.label)}
              </text>
            </g>
          );
        })}
      </g>
    </svg>
  );
}
