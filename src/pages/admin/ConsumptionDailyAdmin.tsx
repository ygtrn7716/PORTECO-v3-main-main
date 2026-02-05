import TableManager from "@/components/admin/TableManager";

export default function ConsumptionDailyAdmin() {
  return (
    <TableManager
      cfg={{
        title: "Consumption Daily",
        table: "consumption_daily",
        matchKeys: ["user_id", "subscription_serno", "day"],
        readOnly: true,
        pageSize: 100,
        orderBy: { key: "day", asc: false },
        filters: [
          { key: "user_id", label: "User", type: "user_id" },
          { key: "subscription_serno", label: "SerNo", type: "subscription_serno" },
        ],
        columns: [
          { key: "user_id", label: "user_id", type: "uuid", readOnly: true },
          { key: "subscription_serno", label: "serno", type: "number", readOnly: true },
          { key: "day", label: "day", type: "text", readOnly: true },
          { key: "kwh_in", label: "kwh_in", type: "number", readOnly: true },
        ],
      }}
    />
  );
}
