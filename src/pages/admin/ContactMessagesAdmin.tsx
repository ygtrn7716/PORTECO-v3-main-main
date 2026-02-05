import TableManager from "@/components/admin/TableManager";

export default function ContactMessagesAdmin() {
  return (
    <TableManager
      cfg={{
        title: "Iletisim Mesajlari",
        table: "contact_messages",
        matchKeys: ["id"],
        orderBy: { key: "created_at", asc: false },
        pageSize: 50,
        filters: [
          { key: "email", label: "E-posta", type: "text" },
        ],
        columns: [
          { key: "id", label: "ID", type: "uuid", readOnly: true, hideInTable: true },
          { key: "first_name", label: "Ad", type: "text", readOnly: true },
          { key: "last_name", label: "Soyad", type: "text", readOnly: true },
          { key: "email", label: "E-posta", type: "text", readOnly: true },
          { key: "phone", label: "Telefon", type: "text", readOnly: true },
          { key: "message", label: "Mesaj", type: "text", readOnly: true },
          { key: "is_read", label: "Okundu", type: "bool" },
          { key: "created_at", label: "Tarih", type: "text", readOnly: true },
        ],
      }}
    />
  );
}
