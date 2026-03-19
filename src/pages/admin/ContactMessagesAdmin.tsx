import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import TableManager from "@/components/admin/TableManager";

export default function ContactMessagesAdmin() {
  const [unreadCount, setUnreadCount] = useState<number | null>(null);

  useEffect(() => {
    let mounted = true;

    async function fetchUnread() {
      const { count, error } = await supabase
        .from("contact_messages")
        .select("*", { count: "exact", head: true })
        .eq("is_read", false);

      if (mounted && !error) setUnreadCount(count ?? 0);
    }

    fetchUnread();
    const interval = setInterval(fetchUnread, 30_000);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, []);

  return (
    <div>
      {/* Okunmamış sayacı */}
      {unreadCount !== null && unreadCount > 0 && (
        <div className="mx-6 mt-4 flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
          <span className="inline-flex items-center justify-center h-6 min-w-[24px] rounded-full bg-amber-500 px-2 text-xs font-bold text-white">
            {unreadCount}
          </span>
          <span className="text-sm font-medium text-amber-800">
            okunmamış mesaj
          </span>
        </div>
      )}

      <TableManager
        cfg={{
          title: "İletişim Mesajları",
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
    </div>
  );
}
