import TableManager from "@/components/admin/TableManager";

export default function GesProvidersAdmin() {
  return (
    <TableManager
      cfg={{
        title: "GES Sağlayıcılar",
        table: "ges_providers",
        matchKeys: ["id"],
        orderBy: { key: "id", asc: true },
        pageSize: 50,
        columns: [
          { key: "id", label: "ID", type: "number", readOnly: true },
          { key: "name", label: "Name (slug)", type: "text" },
          { key: "display_name", label: "Display Name", type: "text" },
          { key: "api_base_url", label: "API Base URL", type: "text" },
          { key: "is_active", label: "Aktif", type: "bool" },
          { key: "created_at", label: "Oluşturulma", type: "text", readOnly: true },
        ],
      }}
    />
  );
}
