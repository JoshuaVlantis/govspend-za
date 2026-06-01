import { useEffect, useMemo, useState } from "react";
import { sankey, sankeyLinkHorizontal, sankeyLeft } from "d3-sankey";
import type { NationalData } from "../lib/types";
import { formatRand } from "../lib/format";

interface Props {
  data: NationalData;
  onSelectMuni: (code: string) => void;
}

const WIDTH = 1160;
const PAD = 10;
const ROW = 22;

const truncate = (s: string, n = 30) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

export function NationalSankey({ data, onSelectMuni }: Props) {
  const [hovered, setHovered] = useState<number | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  // Collapse any open province when the dataset (lens/year) changes.
  useEffect(() => {
    setExpanded(null);
  }, [data]);

  const expandedMunis = useMemo(
    () => (expanded ? data.provinceMunis[expanded] ?? [] : []),
    [data, expanded],
  );
  const grantCount = data.nodes.filter((n) => n.kind.startsWith("grant")).length;
  const height = Math.max(760, grantCount * 20 + 60, expandedMunis.length * ROW + 60);

  const graph = useMemo(() => {
    const nodes = data.nodes.map((d) => ({ ...d }));
    const links = data.links.map((d) => ({ ...d }));

    if (expanded) {
      const provIndex = nodes.findIndex((n) => n.id === `prov:${expanded}`);
      if (provIndex >= 0) {
        for (const m of expandedMunis) {
          const idx = nodes.length;
          nodes.push({ id: `muni:${m.code}`, label: m.name, kind: "municipality" });
          links.push({ source: provIndex, target: idx, value: m.value, conditional: false });
        }
      }
    }

    const generator = sankey<any, any>()
      .nodeWidth(15)
      .nodePadding(11)
      .nodeAlign(sankeyLeft)
      .extent([
        [PAD, PAD],
        [WIDTH - PAD, height - PAD],
      ]);
    return generator({ nodes, links });
  }, [data, expanded, expandedMunis, height]);

  const linkPath = sankeyLinkHorizontal();

  return (
    <svg className="sankey" viewBox={`0 0 ${WIDTH} ${height}`} role="img"
      aria-label={`National grant flow, ${data.lens} ${data.year}`}>
      <g className="sankey-links">
        {graph.links.map((l: any, i: number) => {
          const active = hovered === null || hovered === l.source.index || hovered === l.target.index;
          const cls =
            l.target.kind === "municipality"
              ? "link--muni"
              : l.conditional
                ? "link--traceable"
                : "link--pooled";
          return (
            <path
              key={i}
              d={linkPath(l) ?? undefined}
              className={`link ${cls}`}
              style={{ strokeWidth: Math.max(1, l.width), opacity: active ? undefined : 0.08 }}
            >
              <title>
                {l.source.label} → {l.target.label}: {formatRand(l.value)}
              </title>
            </path>
          );
        })}
      </g>
      <g className="sankey-nodes">
        {graph.nodes.map((n: any) => {
          const h = Math.max(1, n.y1 - n.y0);
          const leftHalf = n.x0 < WIDTH / 2;
          const clickable = n.kind === "province" || n.kind === "municipality";
          const onClick =
            n.kind === "province"
              ? () => setExpanded(expanded === n.label ? null : n.label)
              : n.kind === "municipality"
                ? () => onSelectMuni(n.id.replace("muni:", ""))
                : undefined;
          const open = n.kind === "province" && expanded === n.label;
          return (
            <g
              key={n.id}
              transform={`translate(${n.x0},${n.y0})`}
              className={`node-group ${clickable ? "node-group--clickable" : ""}`}
              onMouseEnter={() => setHovered(n.index)}
              onMouseLeave={() => setHovered(null)}
              onClick={onClick}
            >
              <rect width={n.x1 - n.x0} height={h} rx={2} className={`node node--${n.kind} ${open ? "node--open" : ""}`}>
                <title>
                  {n.label}: {formatRand(n.value)}
                  {n.kind === "province" ? " — click to expand" : ""}
                </title>
              </rect>
              <text
                className="node-label"
                x={leftHalf ? n.x1 - n.x0 + 7 : -7}
                y={h / 2}
                dy="0.35em"
                textAnchor={leftHalf ? "start" : "end"}
              >
                {truncate(n.label)}
              </text>
            </g>
          );
        })}
      </g>
    </svg>
  );
}
