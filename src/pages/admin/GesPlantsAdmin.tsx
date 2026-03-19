import TableManager from "@/components/admin/TableManager";

export default function GesPlantsAdmin() {
  return (
    <TableManager
      cfg={{
        title: "GES Tesisler",
        table: "ges_plants",
        matchKeys: ["id"],
        orderBy: { key: "created_at", asc: false },
        pageSize: 50,
        filters: [
          { key: "user_id", label: "Kullanıcı", type: "user_id" },
        ],
        columns: [
          { key: "id", label: "ID", type: "uuid", readOnly: true, hideInTable: true },
          { key: "user_id", label: "User ID", type: "uuid" },
          { key: "credential_id", label: "Credential ID", type: "uuid" },
          { key: "provider_plant_id", label: "Provider Plant ID", type: "text", readOnly: true },
          { key: "plant_name", label: "Plant Name", type: "text", readOnly: true },
          { key: "nickname", label: "Nickname", type: "text" },
          { key: "peak_power_kw", label: "Peak Power (kW)", type: "number" },
          { key: "location", label: "Konum", type: "text" },
          { key: "linked_serno", label: "OSOS Tesis Serno", type: "number" },
          { key: "is_active", label: "Aktif", type: "bool" },
          { key: "created_at", label: "Oluşturulma", type: "text", readOnly: true, hideInTable: true },
          { key: "updated_at", label: "Güncellenme", type: "text", readOnly: true, hideInTable: true },
        ],
      }}
    />
  );
}
