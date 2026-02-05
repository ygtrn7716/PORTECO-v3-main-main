import TableManager from "@/components/admin/TableManager";

export default function UserIntegrationsAdmin() {
  return (
    <TableManager
      cfg={{
        title: "User Integrations",
        table: "user_integrations",
        matchKeys: ["user_id"], // sende 1 user = 1 integration varsayımı
        orderBy: { key: "created_at", asc: false },
        filters: [
          { key: "user_id", label: "User", type: "user_id" },
        ],
        columns: [
          { key: "user_id", label: "user_id", type: "uuid" },
          { key: "aril_user", label: "aril_user", type: "text" },
          { key: "aril_pass", label: "aril_pass", type: "text", mask: true },
          { key: "active", label: "active", type: "bool" },
          { key: "kullanici_sirasi", label: "kullanici_sirasi", type: "number" },
          { key: "altyapi", label: "altyapi", type: "text" },
          { key: "created_at", label: "created_at", type: "text", readOnly: true, hideInTable: true },
        ],
      }}
    />
  );
}
