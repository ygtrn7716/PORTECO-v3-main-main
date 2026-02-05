import TableManager from "@/components/admin/TableManager";

export default function SmsLogsAdmin() {
  return (
    <TableManager
      cfg={{
        title: "SMS Logs",
        table: "sms_logs",
        matchKeys: ["id"],
        readOnly: true,
        pageSize: 100,
        orderBy: { key: "created_at", asc: false },
        filters: [
          { key: "user_id", label: "User", type: "user_id" },
          { key: "subscription_serno", label: "SerNo", type: "subscription_serno" },
          { key: "phone_number", label: "Phone", type: "text" },
        ],
        columns: [
          { key: "id", label: "id", type: "uuid", readOnly: true },
          { key: "user_id", label: "user_id", type: "uuid", readOnly: true },
          { key: "subscription_serno", label: "serno", type: "number", readOnly: true },
          { key: "phone_number", label: "phone_number", type: "text", readOnly: true },
          { key: "message_type", label: "message_type", type: "text", readOnly: true },
          { key: "message_body", label: "message_body", type: "text", readOnly: true },
          { key: "status", label: "status", type: "text", readOnly: true },
          { key: "error_message", label: "error_message", type: "text", readOnly: true },
          { key: "created_at", label: "created_at", type: "text", readOnly: true },
        ],
      }}
    />
  );
}
