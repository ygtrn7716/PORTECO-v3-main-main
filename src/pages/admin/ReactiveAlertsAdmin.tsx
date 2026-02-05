import TableManager from "@/components/admin/TableManager";

export default function ReactiveAlertsAdmin() {
  return (
    <TableManager
      cfg={{
        title: "Reactive Alert State",
        table: "reactive_alert_state",
        matchKeys: ["user_id", "subscription_serno"],
        filters: [
          { key: "user_id", label: "User", type: "user_id" },
          { key: "subscription_serno", label: "SerNo", type: "subscription_serno" },
        ],
        columns: [
          { key: "user_id", label: "user_id", type: "uuid" },
          { key: "subscription_serno", label: "subscription_serno", type: "number" },
          { key: "status", label: "status", type: "text" },
        ],
      }}
    />
  );
}
