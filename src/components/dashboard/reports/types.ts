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
