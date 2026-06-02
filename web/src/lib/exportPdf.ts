import type { FullTreeData } from "./types";
import { layoutFullTree } from "./fullTreeLayout";
import { formatRand } from "./format";

/**
 * Render the full budget tree to a multi-page PDF, drawn directly with jsPDF vector ops
 * from the shared layout (no svg2pdf — keeps fidelity in our control and runs in Node).
 *
 * Why multi-page: the PDF spec caps a page at 14,400pt (200in); ~7,250 labelled rows need
 * ~1,620in. So we tile the tall graph into pages split on EXACT row boundaries. Because the
 * page height is a whole number of row-pitches and leaves sit at half-pitch offsets, every
 * page break lands in the gap between two rows — no label is ever clipped.
 */

const MAX_PAGE_PT = 14000; // safely under the 14,400pt page-size limit
const FONT_PT = 9;
const NEAR_EDGE = 11; // also draw a node on the adjacent page if its centre is this close to a seam

type RGB = [number, number, number];

const NODE_RGB: Record<string, RGB> = {
  source: [44, 39, 34],
  sphere: [31, 122, 100],
  debt: [179, 52, 76],
  child: [28, 25, 22],
  province: [44, 39, 34],
  municipality: [28, 25, 22],
  function: [79, 100, 146],
};
const LINK_RGB: Record<string, RGB> = {
  flow: [31, 122, 100],
  spend: [79, 100, 146],
  "muni-flow": [138, 130, 118],
  debt: [179, 52, 76],
};
const INK: RGB = [28, 25, 22];
const INK_SOFT: RGB = [93, 86, 75];
const PAPER: RGB = [255, 253, 247];

const linkKey = (targetKind: string) =>
  targetKind === "debt" ? "debt" : targetKind === "function" ? "spend" : targetKind === "municipality" ? "muni-flow" : "flow";

const truncate = (s: string, n = 46) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

type JsPdf = import("jspdf").jsPDF;

/** Build the paginated jsPDF document (exported separately so it can be unit-tested in Node). */
export async function buildFullTreePdf(data: FullTreeData): Promise<JsPdf> {
  const { jsPDF } = await import("jspdf");
  const layout = layoutFullTree(data);
  const { width, height, nodeW, pitch, nodes, links } = layout;

  const rowsPerPage = Math.max(1, Math.floor(MAX_PAGE_PT / pitch));
  const pagePt = rowsPerPage * pitch;
  const pageCount = Math.ceil(height / pagePt);

  const doc = new jsPDF({ unit: "pt", format: [width, pagePt], orientation: "portrait", compress: true });

  for (let p = 0; p < pageCount; p++) {
    if (p > 0) doc.addPage([width, pagePt], "portrait");
    const yTop = p * pagePt;
    const yBot = yTop + pagePt;

    // Ribbons first (semi-transparent), so node rects and labels sit on top.
    doc.setGState(new (doc as unknown as { GState: new (o: object) => object }).GState({ opacity: 0.5 }));
    for (const l of links) {
      const lo = Math.min(l.y0, l.y1);
      const hi = Math.max(l.y0, l.y1);
      if (hi < yTop || lo > yBot) continue; // not on this page
      const [r, g, b] = LINK_RGB[linkKey(l.kind)] ?? LINK_RGB.flow;
      doc.setDrawColor(r, g, b);
      doc.setLineWidth(l.width);
      const Y0 = l.y0 - yTop;
      const Y1 = l.y1 - yTop;
      const xm = (l.x0 + l.x1) / 2;
      // one cubic bezier (deltas relative to the start point)
      doc.lines([[xm - l.x0, 0, xm - l.x0, Y1 - Y0, l.x1 - l.x0, Y1 - Y0]], l.x0, Y0, [1, 1], "S");
    }

    // Nodes: rect, optional backing pill, label + amount.
    doc.setGState(new (doc as unknown as { GState: new (o: object) => object }).GState({ opacity: 1 }));
    doc.setFontSize(FONT_PT);
    for (const n of nodes) {
      const onPage = n.cy >= yTop && n.cy < yBot;
      const nearSeam = n.cy % pagePt < NEAR_EDGE || pagePt - (n.cy % pagePt) < NEAR_EDGE;
      if (!onPage && !nearSeam) continue;
      const y = n.cy - yTop;

      const [nr, ng, nb] = NODE_RGB[n.kind] ?? INK;
      doc.setFillColor(nr, ng, nb);
      doc.rect(n.x, y - n.rectH / 2, nodeW, n.rectH, "F");

      const labelX = n.x + nodeW + 6;
      const label = truncate(n.label);
      const amount = formatRand(n.value);
      doc.setFont("helvetica", "normal");
      const labelW = doc.getTextWidth(label);
      doc.setFont("helvetica", "bold");
      const amountW = doc.getTextWidth(amount);

      if (n.hasChildren) {
        doc.setFillColor(PAPER[0], PAPER[1], PAPER[2]);
        doc.roundedRect(labelX - 4, y - 8, labelW + amountW + 13, 16, 3, 3, "F");
      }

      const [tr, tg, tb] = n.kind === "municipality" ? INK : INK_SOFT;
      doc.setTextColor(tr, tg, tb);
      doc.setFont("helvetica", "normal");
      doc.text(label, labelX, y, { baseline: "middle" });
      doc.setFont("helvetica", "bold");
      doc.setTextColor(INK_SOFT[0], INK_SOFT[1], INK_SOFT[2]);
      doc.text(amount, labelX + labelW + 5, y, { baseline: "middle" });
    }
  }

  return doc;
}

/** Build and download the full-tree PDF in the browser. */
export async function exportFullTreePdf(data: FullTreeData, filename: string): Promise<void> {
  const doc = await buildFullTreePdf(data);
  doc.save(filename);
}
