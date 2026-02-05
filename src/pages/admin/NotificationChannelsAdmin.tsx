import TableManager from "@/components/admin/TableManager";

export default function NotificationChannelsAdmin() {
  return (
    <TableManager
      cfg={{
        title: "Notification Channels",
        table: "notification_channels",
        matchKeys: ["user_id"],
        filters: [
          { key: "user_id", label: "User", type: "user_id" },
        ],
        columns: [
          { key: "user_id", label: "user_id", type: "uuid" },
          { key: "phone", label: "phone", type: "text" },
          { key: "sms_enabled", label: "sms_enabled", type: "bool" },
          { key: "email_enabled", label: "email_enabled", type: "bool" },
        ],
      }}
    />
  );
}
