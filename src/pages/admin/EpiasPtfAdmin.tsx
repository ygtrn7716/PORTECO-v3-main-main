import TableManager from "@/components/admin/TableManager";

export default function EpiasPtfAdmin() {
  return (
    <TableManager
      cfg={{
        title: "EPIAS PTF Hourly",
        table: "epias_ptf_hourly",
        matchKeys: ["ts"],
        readOnly: true,
        pageSize: 200,
        orderBy: { key: "ts", asc: false },
        filters: [
          { key: "ts", label: "Tarih Aralığı", type: "date_range" },
        ],
        columns: [
          { key: "ts", label: "ts", type: "text", readOnly: true },
          { key: "ptf_tl_mwh", label: "ptf_tl_mwh", type: "number", readOnly: true },
        ],
      }}
    />
  );
}
