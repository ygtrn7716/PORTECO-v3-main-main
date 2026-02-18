import TableManager from "@/components/admin/TableManager";

export default function EmailLogsAdmin() {
  return (
    <TableManager
      cfg={{
        title: "Email Logs",
        table: "email_logs",
        matchKeys: ["id"],
        orderBy: { key: "created_at", asc: false },
        readOnly: true,
        perPage: 100,
        filters: [
          { key: "user_id", label: "User", type: "user_id" },
          { key: "subscription_serno", label: "SerNo", type: "subscription_serno" },
          { key: "email_address", label: "Email", type: "text" },
        ],
        columns: [
          { key: "id", label: "id", type: "uuid", readOnly: true },
          { key: "user_id", label: "user_id", type: "uuid" },
          { key: "subscription_serno", label: "subscription_serno", type: "text" },
          { key: "email_address", label: "email_address", type: "text" },
          { key: "subject", label: "subject", type: "text" },
          { key: "message_body", label: "message_body", type: "text" },
          { key: "status", label: "status", type: "text" },
          { key: "error_message", label: "error_message", type: "text" },
          { key: "created_at", label: "created_at", type: "text", readOnly: true },
        ],
      }}
    />
  );
}
