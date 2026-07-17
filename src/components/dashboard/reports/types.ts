export type ReportType =
  | "consumption_vs_production"
  | "ptf_analysis"
  | "invoice_comparison"
  | "settlement_performance";

export type ReportTypeMeta = {
  id: ReportType;
  title: string;
  description: string;
  enabled: boolean;
};

export type TesisOption = {
  subscriptionSerNo: number;
  meterSerial: string | null;
  nickname: string | null;
};

export type ReportFilters = {
  selectedSernos: number[];
  year: number;
};

export type MonthlySummaryRow = {
  month: number;
  consumption_kwh: number | null;
  production_kwh: number | null;
};

export type ConsumptionVsProductionResult = {
  year: number;
  tesisler: TesisOption[];
  plantNames: { id: string; label: string }[];
  monthlySummary: MonthlySummaryRow[];
  consumptionByTesis: Record<number, (number | null)[]>;
  productionByPlant: Record<string, (number | null)[]>;
};

// ---- PTF Analizi ----
export type PtfMonthlyRow = {
  month: number; // 1-12
  ptf_tl_kwh: number | null; // çoklu tesiste tüketim-ağırlıklı ortalama
  consumption_kwh: number | null;
  cost_tl: number | null; // Σ(tesis tüketimi × tesis PTF)
};

export type PtfAnalysisResult = {
  year: number;
  tesisler: TesisOption[];
  monthly: PtfMonthlyRow[];
  ptfByTesis: Record<number, (number | null)[]>; // serno → [12 ay PTF]
};

// ---- Fatura Karşılaştırması (yalnız kayıtlı snapshot'lar) ----
export type InvoiceMonthlyRow = {
  month: number;
  consumption_kwh: number | null;
  invoice_tl: number | null; // KDV dahil fatura (recompute)
  mahsup_tl: number | null; // YEKDEM mahsup
  payable_tl: number | null; // ödenecek = recomputeSnapshotTotalWithMahsup
};

export type InvoiceComparisonResult = {
  year: number;
  tesisler: TesisOption[];
  monthly: InvoiceMonthlyRow[];
  payableByTesis: Record<number, (number | null)[]>;
};

// ---- Mahsup Performansı ----
export type MahsupMonthlyRow = {
  month: number;
  consumption_kwh: number | null;
  yekdem_value_tl_kwh: number | null; // tahmini — çoklu tesiste ağırlıklı ort.
  yekdem_final_tl_kwh: number | null; // kesin — çoklu tesiste ağırlıklı ort.
  mahsup_tl: number | null; // çoklu tesiste toplam
};

export type MahsupPerformanceResult = {
  year: number;
  tesisler: TesisOption[];
  monthly: MahsupMonthlyRow[];
  mahsupByTesis: Record<number, (number | null)[]>;
};
