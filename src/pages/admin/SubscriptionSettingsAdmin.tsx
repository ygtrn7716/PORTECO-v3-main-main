import TableManager from "@/components/admin/TableManager";

export default function SubscriptionSettingsAdmin() {
  return (
    <TableManager
      cfg={{
        title: "Subscription Settings",
        table: "subscription_settings",
        matchKeys: ["id"],
        orderBy: { key: "created_at", asc: false },
        filters: [
          { key: "user_id", label: "User", type: "user_id" },
          { key: "subscription_serno", label: "SerNo", type: "subscription_serno" },
          { key: "title", label: "Title", type: "text" },
        ],
        columns: [
          { key: "id", label: "id", type: "uuid", readOnly: true },
          { key: "user_id", label: "user_id", type: "uuid" },
          { key: "title", label: "title", type: "text" },
          { key: "subscription_serno", label: "subscription_serno", type: "number" },
          { key: "meter_serial", label: "meter_serial", type: "text", readOnly: true },
          { key: "kbk", label: "kbk", type: "number" },
          { key: "terim", label: "terim", type: "enum", options: ["tek_terim", "cift_terim"] },
          { key: "gerilim", label: "gerilim", type: "enum", options: ["OG", "AG"] },
          { key: "tarife", label: "tarife", type: "enum", options: ["sanayi", "ticarethane", "tarimsal"] },
          { key: "guc_bedel_limit", label: "guc_bedel_limit", type: "number" },
          { key: "unit_price_adjustment", label: "unit_price_adjustment", type: "number" },
          { key: "trafo_kaybi_saatlik", label: "trafo_kaybi_saatlik (m1/m7, kWh/saat; doluysa trafo_degeri yok sayılır)", type: "number" },
          { key: "dagitim_kendi_veris", label: "dagitim_kendi_veris (m1/m7 MEPAŞ/MEDAŞ usulü dağıtım)", type: "bool" },
          {
            key: "invoice_method_override",
            label: "invoice_method_override (aboneliğe özel metot; — = şirket metodu)",
            type: "enum",
            optionsFrom: {
              table: "invoice_methods",
              valueKey: "id",
              labelKey: "name",
              orderBy: "id",
              filter: { is_active: true },
            },
          },
          {
            key: "ges_sale_dist_basis",
            label: "ges_sale_dist_basis (GES satış kesinti tabanı; m3 Trepaş 2026-09+)",
            type: "enum",
            options: ["total_veris", "sold_only"],
          },
          { key: "active", label: "active", type: "bool" },
          { key: "created_at", label: "created_at", type: "text", readOnly: true, hideInTable: true },
        ],
      }}
    />
  );
}
