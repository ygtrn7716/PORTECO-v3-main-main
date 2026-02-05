import TableManager from "@/components/admin/TableManager";

export default function UserPhoneNumbersAdmin() {
  return (
    <TableManager
      cfg={{
        title: "User Phone Numbers",
        table: "user_phone_numbers",
        matchKeys: ["id"],
        filters: [
          { key: "user_id", label: "User", type: "user_id" },
          { key: "phone_number", label: "Phone", type: "text" },
        ],
        columns: [
          { key: "id", label: "id", type: "uuid", readOnly: true },
          { key: "user_id", label: "user_id", type: "uuid" },
          { key: "phone_number", label: "phone_number", type: "text" },
          { key: "label", label: "label", type: "text" },
          { key: "is_active", label: "is_active", type: "bool" },
          { key: "receive_warnings", label: "receive_warnings", type: "bool" },
          { key: "receive_alerts", label: "receive_alerts", type: "bool" },
        ],
      }}
    />
  );
}
