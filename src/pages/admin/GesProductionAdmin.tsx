import TableManager from "@/components/admin/TableManager";

export default function GesProductionAdmin() {
  return (
    <TableManager
      cfg={{
        title: "GES Üretim Verisi (Günlük)",
        table: "ges_production_daily",
        matchKeys: ["id"],
        orderBy: { key: "date", asc: false },
        pageSize: 100,
        readOnly: true,
        filters: [
          { key: "date", label: "Tarih", type: "date_range" },
        ],
        columns: [
          { key: "id", label: "ID", type: "uuid", readOnly: true, hideInTable: true },
          { key: "ges_plant_id", label: "GES Plant ID", type: "uuid", readOnly: true },
          { key: "date", label: "Tarih", type: "text", readOnly: true },
          { key: "energy_kwh", label: "Üretim (kWh)", type: "number", readOnly: true },
          { key: "created_at", label: "Oluşturulma", type: "text", readOnly: true, hideInTable: true },
        ],
      }}
    />
  );
}
