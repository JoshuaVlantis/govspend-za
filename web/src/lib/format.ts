/** Compact Rand formatting, e.g. R8.6bn, R420m, R5k. Returns "—" for non-finite input. */
export function formatRand(value: number): string {
  if (!Number.isFinite(value)) return "—";
  const n = Math.round(value);
  const abs = Math.abs(n);
  if (abs >= 1e9) return `R${(n / 1e9).toFixed(abs >= 1e10 ? 0 : 1)}bn`;
  if (abs >= 1e6) return `R${(n / 1e6).toFixed(0)}m`;
  if (abs >= 1e3) return `R${(n / 1e3).toFixed(0)}k`;
  return `R${n}`;
}

/** Full Rand with thousands separators, e.g. R8 631 790 000. */
export function formatRandFull(value: number): string {
  if (!Number.isFinite(value)) return "—";
  return `R${Math.round(value).toLocaleString("en-ZA").replace(/,/g, " ")}`;
}

/** Integer percentage of part/whole, safe against zero/NaN denominators. */
export function pct(part: number, whole: number): number {
  const ratio = part / whole;
  if (!Number.isFinite(ratio)) return 0;
  return Math.round(ratio * 100);
}
