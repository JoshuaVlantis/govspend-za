export interface MuniRef {
  code: string;
  name: string;
  province: string | null;
  category: string | null;
}

export interface LensRef {
  key: string;
  label: string;
}

export interface IndexData {
  lenses: LensRef[];
  default_lens: string;
  years: Record<string, number[]>;
  default_year: Record<string, number>;
  provinces: string[];
  municipalities: MuniRef[];
}

export interface SankeyNodeRaw {
  id: string;
  label: string;
  kind: "source" | "source-prov" | "grant-equitable" | "grant-conditional" | "province" | "municipality";
}

export interface SankeyLinkRaw {
  source: number;
  target: number;
  value: number;
  conditional: boolean;
  provincial?: boolean;
}

export interface ProvinceMuni {
  code: string;
  name: string;
  value: number;
}

export interface NationalData {
  lens: string;
  year: number;
  nodes: SankeyNodeRaw[];
  links: SankeyLinkRaw[];
  muniTotals: Record<string, number>;
  provinceMunis: Record<string, ProvinceMuni[]>;
}

export interface Flow {
  label: string;
  amount: number;
}

export interface Inflow extends Flow {
  conditional: boolean;
  provincial: boolean;
}

export interface Totals {
  grants: number;
  equitable: number;
  conditional: number;
  national_conditional: number;
  provincial: number;
  other_transfers: number;
  spend: number;
  revenue: number;
  own_revenue: number;
}

export interface YearProfile {
  inflows: Inflow[];
  spendByFunction: Flow[];
  totals: Totals;
}

export interface LensProfile {
  years: number[];
  data: Record<string, YearProfile>;
}

export interface Profile {
  code: string;
  name: string;
  province: string | null;
  category: string | null;
  lenses: Record<string, LensProfile>;
}

export interface BudgetChild {
  label: string;
  value: number;
}

export interface BudgetData {
  year: number;
  total: number;
  nodes: { id: string; label: string; kind: string }[];
  links: { source: number; target: number; value: number }[];
  children: Record<string, BudgetChild[]>;
  note: string;
}

export interface FullTreeData {
  year: number;
  total: number;
  nodes: { id: string; label: string; kind: string; order: number }[];
  links: { source: number; target: number; value: number }[];
  note: string;
}
