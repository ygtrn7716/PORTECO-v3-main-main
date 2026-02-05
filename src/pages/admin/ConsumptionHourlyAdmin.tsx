import TableManager from "@/components/admin/TableManager";

export default function ConsumptionHourlyAdmin() {
  return (
    <TableManager
      cfg={{
        title: "Consumption Hourly",
        table: "consumption_hourly",
        matchKeys: ["user_id", "subscription_serno", "ts"],
        readOnly: true,
        pageSize: 200,
        orderBy: { key: "ts", asc: false },
        filters: [
          { key: "user_id", label: "User", type: "user_id" },
          { key: "subscription_serno", label: "SerNo", type: "subscription_serno" },
          { key: "ts", label: "Tarih Aralığı", type: "date_range" },
        ],
        columns: [
          { key: "user_id", label: "user_id", type: "uuid", readOnly: true },
          { key: "subscription_serno", label: "serno", type: "number", readOnly: true },
          { key: "ts", label: "ts", type: "text", readOnly: true },
          { key: "cn", label: "cn", type: "number", readOnly: true },
          { key: "ri", label: "ri", type: "number", readOnly: true },
          { key: "rc", label: "rc", type: "number", readOnly: true },
          { key: "gn", label: "gn", type: "number", readOnly: true },
        ],
      }}
    />
  );
}
