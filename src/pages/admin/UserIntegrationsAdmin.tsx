import TableManager from "@/components/admin/TableManager";

export default function UserIntegrationsAdmin() {
  return (
    <TableManager
      cfg={{
        title: "User Integrations",
        table: "user_integrations",
        // ⚠️ PK `id`'dir. Eskiden matchKeys ["user_id"] idi; 2 entegrasyonu olan
        // kullanıcılarda (canlıda 3 kullanıcı) tek satırı kaydetmek AYNI
        // kullanıcının TÜM entegrasyonlarını birlikte güncelliyordu.
        matchKeys: ["id"],
        orderBy: { key: "created_at", asc: false },
        filters: [
          { key: "user_id", label: "User", type: "user_id" },
        ],
        // Kolon listesi user_integrations şemasıyla BİREBİR senkron:
        // id, user_id, provider, aril_user, aril_pass, active, created_at,
        // updated_at, invoice_from. (kullanici_sirasi / altyapi kolonları
        // tabloda YOK; yazma denemesi ham PostgREST 400 döndürüyordu.)
        columns: [
          { key: "id", label: "id", type: "uuid", readOnly: true, hideInTable: true },
          { key: "user_id", label: "user_id", type: "uuid" },
          // owner_subscriptions.provider ile BİREBİR eşleşmeli; eşleşmezse
          // methodForProvider tesisi Metod 1'e düşürür (yalnız console.warn).
          // Lookup tablosu olmadığı ve kurulum-özel değerler (_manuel-uedas)
          // bulunduğu için serbest metin bırakıldı.
          { key: "provider", label: "provider", type: "text" },
          { key: "aril_user", label: "aril_user", type: "text" },
          { key: "aril_pass", label: "aril_pass", type: "text", mask: true },
          { key: "active", label: "active", type: "bool" },
          // NOT NULL (20260718_003). Değer invoice_companies.key'dir;
          // kullanıcıya display_name etiketiyle gösterilir.
          {
            key: "invoice_from",
            label: "invoice_from",
            type: "enum",
            optionsFrom: {
              table: "invoice_companies",
              valueKey: "key",
              labelKey: "display_name",
            },
          },
          { key: "created_at", label: "created_at", type: "text", readOnly: true, hideInTable: true },
          { key: "updated_at", label: "updated_at", type: "text", readOnly: true, hideInTable: true },
        ],
      }}
    />
  );
}
