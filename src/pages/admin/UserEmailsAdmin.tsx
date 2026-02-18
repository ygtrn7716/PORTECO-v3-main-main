import TableManager from "@/components/admin/TableManager";

export default function UserEmailsAdmin() {
  return (
    <TableManager
      cfg={{
        title: "User Emails",
        table: "user_emails",
        matchKeys: ["id"],
        orderBy: { key: "created_at", asc: false },
        filters: [
          { key: "user_id", label: "User", type: "user_id" },
          { key: "email", label: "Email", type: "text" },
        ],
        columns: [
          { key: "id", label: "id", type: "uuid", readOnly: true },
          { key: "user_id", label: "user_id", type: "uuid" },
          { key: "email", label: "email", type: "text" },
          { key: "label", label: "label", type: "text" },
          { key: "is_active", label: "is_active", type: "boolean" },
          { key: "receive_warnings", label: "receive_warnings", type: "boolean" },
          { key: "receive_alerts", label: "receive_alerts", type: "boolean" },
          { key: "created_at", label: "created_at", type: "text", readOnly: true, hideInTable: true },
        ],
      }}
    />
  );
}
