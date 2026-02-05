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
          { key: "kbk", label: "kbk", type: "number" },
          { key: "terim", label: "terim", type: "enum", options: ["tek_terim", "cift_terim"] },
          { key: "gerilim", label: "gerilim", type: "enum", options: ["OG", "AG"] },
          { key: "tarife", label: "tarife", type: "enum", options: ["sanayi", "ticarethane", "tarimsal"] },
          { key: "guc_bedel_limit", label: "guc_bedel_limit", type: "number" },
          { key: "active", label: "active", type: "bool" },
          { key: "created_at", label: "created_at", type: "text", readOnly: true, hideInTable: true },
        ],
      }}
    />
  );
}
