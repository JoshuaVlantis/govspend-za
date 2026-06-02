import { useMemo } from "react";
import type { FullTreeData } from "../lib/types";
import { layoutFullTree } from "../lib/fullTreeLayout";
import { formatRand } from "../lib/format";

interface Props {
  data: FullTreeData;
  onSelectMuni: (code: string) => void;
}

const truncate = (s: string, n = 46) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

// A single horizontal cubic bezier from the right edge of the source node to the left edge
// of the target — the same shape d3-sankey strokes, but driven by our even-grid centres.
const ribbon = (x0: number, y0: number, x1: number, y1: number) => {
  const xm = (x0 + x1) / 2;
  return `M${x0},${y0}C${xm},${y0} ${xm},${y1} ${x1},${y1}`;
};

const linkClass = (kind: string) =>
  kind === "debt"
    ? "link--debt"
    : kind === "function"
      ? "link--spend"
      : kind === "municipality"
        ? "link--muni-flow"
        : "link--flow";

const CHAR_W = 6; // approx width of a label glyph at 11px, for sizing the backing pill

// The ENTIRE tree on one page: NRF -> spheres -> departments / provinces -> 257
// municipalities -> every spend function. Laid out on an even grid so labels never overlap;
// rendered at true size (the wrapper scrolls). PDF export reuses the same layout module.
export function FullSankey({ data, onSelectMuni }: Props) {
  const layout = useMemo(() => layoutFullTree(data), [data]);
  const { width, height, nodeW, nodes, links } = layout;

  return (
    <svg
      className="sankey full-sankey"
      viewBox={`0 0 ${width} ${height}`}
      style={{ width: `${width}px`, height: `${height}px` }}
      role="img"
      aria-label={`Full national budget tree, ${data.year}`}
    >
      <g className="sankey-links">
        {links.map((l, i) => (
          <path
            key={i}
            d={ribbon(l.x0, l.y0, l.x1, l.y1)}
            className={`link ${linkClass(l.kind)}`}
            style={{ strokeWidth: l.width }}
          />
        ))}
      </g>
      <g className="sankey-nodes">
        {nodes.map((n) => {
          const isMuni = n.kind === "municipality";
          const labelX = n.x + nodeW + 6;
          const amount = formatRand(n.value);
          const label = truncate(n.label);
          // Internal nodes sit in front of a fan of ribbons; a backing pill keeps the label
          // legible (leaf labels sit in clear space and need none).
          const pillW = n.hasChildren ? Math.min((label.length + amount.length + 3) * CHAR_W, 440) : 0;
          return (
            <g
              key={n.id}
              transform={`translate(0,${n.cy})`}
              className={`node-group ${isMuni ? "node-group--clickable" : ""}`}
              onClick={isMuni ? () => onSelectMuni(n.id.replace("muni:", "")) : undefined}
            >
              <rect x={n.x} y={-n.rectH / 2} width={nodeW} height={n.rectH} rx={1.5} className={`node node--${n.kind}`}>
                <title>
                  {n.label}: {amount}
                  {isMuni ? " — open profile" : ""}
                </title>
              </rect>
              {pillW > 0 && <rect className="label-pill" x={labelX - 4} y={-8} width={pillW} height={16} rx={4} />}
              <text className="node-label full-label" x={labelX} y={0} dy="0.32em" textAnchor="start">
                {label}
                <tspan className="node-amount" dx="6">
                  {amount}
                </tspan>
              </text>
            </g>
          );
        })}
      </g>
    </svg>
  );
}
