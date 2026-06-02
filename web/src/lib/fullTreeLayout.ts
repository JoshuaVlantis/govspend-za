import type { FullTreeData } from "./types";

/**
 * Even-grid layout for the full budget tree.
 *
 * The full tree is a strict hierarchy (one parent per node). d3-sankey sizes every node by
 * its rand value, so with function values spanning R1 → R27bn ~7,000 leaves collapse to
 * sub-pixel height and their labels overlap into an unreadable smear. Instead we lay the
 * tree out like a dendrogram: every LEAF gets one fixed-height row (so no label can ever
 * overlap its neighbour), and every parent sits at the vertical midpoint of its children.
 *
 * Ribbon and node thickness encode money on a single GLOBAL scale, so sizes are comparable
 * across the whole graph (a R425bn sphere is visibly far bigger than a R12bn municipality).
 * sqrt scaling keeps the ~180x value range legible; maxThick is tuned so even the largest
 * node in a dense column still fits its row pitch without overlapping its neighbour. Exact
 * rands are printed beside every node, so nothing about the money is hidden.
 */

export interface LaidOutNode {
  id: string;
  label: string;
  kind: string;
  depth: number;
  x: number; // left edge of the node rect
  cy: number; // vertical centre
  rectH: number; // node rect height
  value: number; // money flowing into this node (its subtree total)
  hasChildren: boolean;
}

export interface LaidOutLink {
  source: number;
  target: number;
  value: number;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  width: number; // stroke width = scaled thickness
  kind: string; // target node kind, drives colour
}

export interface FullLayout {
  width: number;
  height: number;
  nodeW: number;
  pitch: number;
  nodes: LaidOutNode[];
  links: LaidOutLink[];
}

export interface LayoutOptions {
  pitch?: number; // vertical row height per leaf
  colStep?: number; // horizontal distance between columns
  nodeW?: number;
  left?: number;
  trail?: number; // right margin for the last column's labels
  top?: number;
  bottom?: number;
  maxThick?: number; // thickest a ribbon/rect can get
  minThick?: number; // thinnest a ribbon is drawn
  minRect?: number; // thinnest a node rect is drawn
}

const DEFAULTS: Required<LayoutOptions> = {
  pitch: 16,
  colStep: 480,
  nodeW: 14,
  left: 24,
  trail: 380,
  top: 28,
  bottom: 28,
  maxThick: 24,
  minThick: 0.5,
  minRect: 2,
};

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);

export function layoutFullTree(data: FullTreeData, options: LayoutOptions = {}): FullLayout {
  const o = { ...DEFAULTS, ...options };
  const n = data.nodes.length;

  // Adjacency, parent pointers, per-node inflow, and each node's biggest outgoing flow.
  const children: number[][] = Array.from({ length: n }, () => []);
  const hasParent = new Uint8Array(n);
  const inValue = new Float64Array(n);
  for (const l of data.links) {
    children[l.source].push(l.target);
    hasParent[l.target] = 1;
    inValue[l.target] += l.value;
  }

  let root = 0;
  for (let i = 0; i < n; i++) {
    if (!hasParent[i]) {
      root = i;
      break;
    }
  }

  // DFS: leaves take successive rows; internal nodes centre on their children's extent.
  // Tree height is tiny (≤5), so recursion depth is bounded regardless of node count.
  const depth = new Int32Array(n);
  const cy = new Float64Array(n);
  let row = 0;
  let maxDepth = 0;
  const place = (i: number, d: number): void => {
    depth[i] = d;
    if (d > maxDepth) maxDepth = d;
    const ch = children[i];
    if (ch.length === 0) {
      cy[i] = o.top + (row + 0.5) * o.pitch;
      row += 1;
      return;
    }
    for (const c of ch) place(c, d + 1);
    cy[i] = (cy[ch[0]] + cy[ch[ch.length - 1]]) / 2;
  };
  place(root, 0);

  const leafRows = row;
  const height = o.top + leafRows * o.pitch + o.bottom;
  const width = o.left + maxDepth * o.colStep + o.nodeW + o.trail;
  const colX = (d: number) => o.left + d * o.colStep;

  // One GLOBAL value->thickness map (sqrt of the share of the grand total). gmax is the total,
  // so the root is the thickest and every other node is sized by its true magnitude relative
  // to it — comparable across columns, no big-fish-in-a-small-pond distortion.
  let gmax = data.total || 0;
  for (let i = 0; i < n; i++) if (inValue[i] > gmax) gmax = inValue[i];
  if (!(gmax > 0)) gmax = 1;
  const gthick = (value: number) => clamp(Math.sqrt(value / gmax) * o.maxThick, o.minThick, o.maxThick);

  const nodes: LaidOutNode[] = data.nodes.map((node, i) => {
    const value = i === root ? data.total || inValue[i] : inValue[i];
    return {
      id: node.id,
      label: node.label,
      kind: node.kind,
      depth: depth[i],
      x: colX(depth[i]),
      cy: cy[i],
      rectH: Math.max(o.minRect, gthick(value)),
      value,
      hasChildren: children[i].length > 0,
    };
  });

  const links: LaidOutLink[] = data.links.map((l) => ({
    source: l.source,
    target: l.target,
    value: l.value,
    x0: colX(depth[l.source]) + o.nodeW,
    y0: cy[l.source],
    x1: colX(depth[l.target]),
    y1: cy[l.target],
    width: gthick(l.value),
    kind: data.nodes[l.target].kind,
  }));

  return { width, height, nodeW: o.nodeW, pitch: o.pitch, nodes, links };
}
