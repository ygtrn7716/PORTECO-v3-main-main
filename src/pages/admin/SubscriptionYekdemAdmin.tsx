import TableManager from "@/components/admin/TableManager";

export default function SubscriptionYekdemAdmin() {
  return (
    <TableManager
      cfg={{
        title: "Subscription YEKDEM",
        table: "subscription_yekdem",
        matchKeys: ["user_id", "subscription_serno", "period_year", "period_month"],
        orderBy: { key: "created_at", asc: false },
        filters: [
          { key: "user_id", label: "User", type: "user_id" },
          { key: "subscription_serno", label: "SerNo", type: "subscription_serno" },
          { key: "period_year", label: "Yıl", type: "period_year" },
          { key: "period_month", label: "Ay", type: "period_month" },
          { key: "title", label: "Title", type: "text" },
        ],
        columns: [
          { key: "user_id", label: "user_id", type: "uuid" },
          { key: "subscription_serno", label: "subscription_serno", type: "number" },
          { key: "title", label: "title", type: "text" },
          { key: "period_year", label: "period_year", type: "number" },
          { key: "period_month", label: "period_month", type: "number" },
          { key: "yekdem_value", label: "yekdem_value", type: "number" },
          { key: "yekdem_final", label: "yekdem_final", type: "number" },
          { key: "diger_degerler", label: "diger_degerler", type: "number" },
          { key: "created_at", label: "created_at", type: "text", readOnly: true, hideInTable: true },
        ],
      }}
    />
  );
}
