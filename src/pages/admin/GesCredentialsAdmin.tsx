import TableManager from "@/components/admin/TableManager";

export default function GesCredentialsAdmin() {
  return (
    <TableManager
      cfg={{
        title: "GES Hesaplar",
        table: "ges_credentials",
        matchKeys: ["id"],
        orderBy: { key: "created_at", asc: false },
        pageSize: 50,
        filters: [
          { key: "user_id", label: "Kullanıcı", type: "user_id" },
        ],
        columns: [
          { key: "id", label: "ID", type: "uuid", readOnly: true, hideInTable: true },
          { key: "user_id", label: "User ID", type: "uuid" },
          { key: "provider_id", label: "Provider ID", type: "number" },
          { key: "username", label: "Username", type: "text" },
          { key: "is_active", label: "Aktif", type: "bool" },
          { key: "sync_status", label: "Sync Status", type: "enum", options: ["pending", "syncing", "success", "failed"] },
          { key: "sync_error", label: "Sync Error", type: "text" },
          { key: "api_token", label: "API Token", type: "text", mask: true },
          { key: "provider_user_id", label: "Provider User ID", type: "text" },
          { key: "last_sync_at", label: "Son Sync", type: "text", readOnly: true },
          { key: "created_at", label: "Oluşturulma", type: "text", readOnly: true, hideInTable: true },
          { key: "updated_at", label: "Güncellenme", type: "text", readOnly: true, hideInTable: true },
        ],
      }}
    />
  );
}
