import TableManager from "@/components/admin/TableManager";

export default function InvoiceSnapshotsAdmin() {
  return (
    <TableManager
      cfg={{
        title: "Invoice Snapshots",
        table: "invoice_snapshots",
        matchKeys: ["user_id", "subscription_serno", "period_year", "period_month", "invoice_type"],
        readOnly: true,
        pageSize: 50,
        orderBy: { key: "period_year", asc: false },
        filters: [
          { key: "user_id", label: "User", type: "user_id" },
          { key: "subscription_serno", label: "SerNo", type: "subscription_serno" },
        ],
        columns: [
          { key: "user_id", label: "user_id", type: "uuid", readOnly: true },
          { key: "subscription_serno", label: "serno", type: "number", readOnly: true },
          { key: "period_year", label: "year", type: "number", readOnly: true },
          { key: "period_month", label: "month", type: "number", readOnly: true },
          { key: "invoice_type", label: "type", type: "text", readOnly: true },
          { key: "total_consumption_kwh", label: "kwh", type: "number", readOnly: true },
          { key: "total_invoice", label: "total_invoice", type: "number", readOnly: true },
          { key: "total_with_mahsup", label: "total_w_mahsup", type: "number", readOnly: true },
          { key: "has_yekdem_mahsup", label: "yekdem?", type: "bool", readOnly: true },
          { key: "yekdem_mahsup", label: "yekdem_mahsup", type: "number", readOnly: true },
          { key: "updated_at", label: "updated_at", type: "text", readOnly: true },
        ],
      }}
    />
  );
}
