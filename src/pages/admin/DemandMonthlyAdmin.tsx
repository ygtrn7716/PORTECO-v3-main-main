import TableManager from "@/components/admin/TableManager";

export default function DemandMonthlyAdmin() {
  return (
    <TableManager
      cfg={{
        title: "Demand Monthly",
        table: "demand_monthly",
        matchKeys: ["user_id", "subscription_serno", "period_year", "period_month"],
        orderBy: { key: "period_year", asc: false },
        filters: [
          { key: "user_id", label: "User", type: "user_id" },
          { key: "subscription_serno", label: "SerNo", type: "subscription_serno" },
        ],
        columns: [
          { key: "user_id", label: "user_id", type: "uuid" },
          { key: "subscription_serno", label: "subscription_serno", type: "number" },
          { key: "period_year", label: "period_year", type: "number" },
          { key: "period_month", label: "period_month", type: "number" },
          { key: "max_demand_kw", label: "max_demand_kw", type: "number" },
          { key: "is_final", label: "is_final", type: "bool" },
          { key: "multiplier", label: "multiplier", type: "number" },
        ],
      }}
    />
  );
}
