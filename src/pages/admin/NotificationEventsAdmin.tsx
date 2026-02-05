import TableManager from "@/components/admin/TableManager";

export default function NotificationEventsAdmin() {
  return (
    <TableManager
      cfg={{
        title: "Notification Events",
        table: "notification_events",
        matchKeys: ["id"],
        readOnly: true,
        orderBy: { key: "created_at", asc: false },
        filters: [
          { key: "user_id", label: "User", type: "user_id" },
        ],
        columns: [
          { key: "id", label: "id", type: "uuid", readOnly: true },
          { key: "user_id", label: "user_id", type: "uuid", readOnly: true },
          { key: "event_type", label: "event_type", type: "text", readOnly: true },
          { key: "created_at", label: "created_at", type: "text", readOnly: true },
        ],
      }}
    />
  );
}
