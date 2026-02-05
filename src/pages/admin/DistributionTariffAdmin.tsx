import TableManager from "@/components/admin/TableManager";

export default function DistributionTariffAdmin() {
  return (
    <TableManager
      cfg={{
        title: "Distribution Tariff Official",
        table: "distribution_tariff_official",
        matchKeys: ["id"],
        orderBy: { key: "id", asc: true },
        filters: [
          { key: "subscription_serno", label: "SerNo", type: "subscription_serno" }, // yoksa UI’da etkisiz kalır, sorun değil
        ],
        columns: [
          { key: "id", label: "id", type: "number", readOnly: true },
          { key: "term_type", label: "term_type", type: "enum", options: ["tek_terim", "cift_terim"] },
          { key: "gerilim", label: "gerilim", type: "enum", options: ["OG", "AG"] },
          { key: "tarife", label: "tarife", type: "enum", options: ["sanayi", "ticarethane", "tarimsal"] },
          { key: "dagitim_bedeli", label: "dagitim_bedeli", type: "number" },
          { key: "guc_bedeli", label: "guc_bedeli", type: "number" },
          { key: "guc_bedeli_asim", label: "guc_bedeli_asim", type: "number" },
          { key: "reaktif_bedel", label: "reaktif_bedel", type: "number" },
          { key: "kdv", label: "kdv", type: "number" },
          { key: "btv", label: "btv", type: "number" },
        ],
      }}
    />
  );
}
