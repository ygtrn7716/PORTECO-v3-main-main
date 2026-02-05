import TableManager from "@/components/admin/TableManager";

export default function OwnerSubscriptionsAdmin() {
  return (
    <TableManager
      cfg={{
        title: "Owner Subscriptions",
        table: "owner_subscriptions",
        matchKeys: ["user_id", "subscription_serno"],
        orderBy: { key: "subscription_serno", asc: true },
        filters: [
          { key: "user_id", label: "User", type: "user_id" },
          { key: "subscription_serno", label: "SerNo", type: "subscription_serno" },
          { key: "title", label: "Title", type: "text" },
        ],
        columns: [
          { key: "user_id", label: "user_id", type: "uuid" },
          { key: "subscription_serno", label: "subscription_serno", type: "number" },
          { key: "meter_serial", label: "meter_serial", type: "text" },
          { key: "title", label: "title", type: "text" },
          { key: "multiplier", label: "multiplier", type: "number" },
        ],
      }}
    />
  );
}
