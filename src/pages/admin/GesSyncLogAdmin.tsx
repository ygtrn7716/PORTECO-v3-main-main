import TableManager from "@/components/admin/TableManager";

export default function GesSyncLogAdmin() {
  return (
    <TableManager
      cfg={{
        title: "GES Sync Logları",
        table: "ges_sync_log",
        matchKeys: ["id"],
        orderBy: { key: "started_at", asc: false },
        pageSize: 100,
        readOnly: true,
        filters: [
          { key: "started_at", label: "Tarih", type: "date_range" },
        ],
        columns: [
          { key: "id", label: "ID", type: "uuid", readOnly: true, hideInTable: true },
          { key: "credential_id", label: "Credential ID", type: "uuid", readOnly: true },
          { key: "ges_plant_id", label: "GES Plant ID", type: "uuid", readOnly: true },
          { key: "sync_type", label: "Sync Type", type: "text", readOnly: true },
          { key: "status", label: "Status", type: "text", readOnly: true },
          { key: "error_message", label: "Error", type: "text", readOnly: true },
          { key: "records_synced", label: "Records", type: "number", readOnly: true },
          { key: "started_at", label: "Başlangıç", type: "text", readOnly: true },
          { key: "completed_at", label: "Bitiş", type: "text", readOnly: true },
        ],
      }}
    />
  );
}
