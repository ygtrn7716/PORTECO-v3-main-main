// src/pages/admin/InvoiceMethodsAdmin.tsx
//
// Aşama 2C — fatura metodu / tedarik firması yönetimi.
// Sayaç kartı + iki TableManager (metodlar, firmalar).
//
// NOT: Metod kimlikleri (1/2/3) MOTORDA sabittir (calculateInvoiceNetMethods.ts
// NetMethodId = 2|3, invoiceMethods.ts isInvoiceMethodId). Bu yüzden invoice_methods
// satırlarında `id` düzenlenemez ve yeni metod eklemek kod değişikliği ister —
// "+ Yeni Satır" burada bilinçli olarak çalışmaz (id'nin DB default'u yok).
// Düzenlenebilir olan: name / description / is_active.

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import TableManager from "@/components/admin/TableManager";

const FK_MSG =
  "Bu firmaya bağlı entegrasyonlar var, önce onları başka firmaya taşıyın.";

type CompanyUsage = { key: string; display_name: string; linked: number };

export default function InvoiceMethodsAdmin() {
  const [usage, setUsage] = useState<CompanyUsage[] | null>(null);
  const [usageErr, setUsageErr] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      // İki küçük sorgu (firma ~8, entegrasyon ~35 satır) — PostgREST embed
      // agregasyonuna bağımlı kalmamak için bilinçli olarak sayım client'ta.
      const [c, i] = await Promise.all([
        supabase.from("invoice_companies").select("key, display_name").order("key"),
        supabase.from("user_integrations").select("invoice_from").limit(5000),
      ]);
      if (!mounted) return;
      if (c.error || i.error) {
        setUsageErr((c.error ?? i.error)!.message);
        return;
      }
      const counts = new Map<string, number>();
      for (const r of ((i.data as { invoice_from: string | null }[]) ?? [])) {
        if (r.invoice_from) counts.set(r.invoice_from, (counts.get(r.invoice_from) ?? 0) + 1);
      }
      setUsage(
        ((c.data as { key: string; display_name: string }[]) ?? []).map((x) => ({
          key: x.key,
          display_name: x.display_name,
          linked: counts.get(x.key) ?? 0,
        }))
      );
    })();
    return () => {
      mounted = false;
    };
  }, []);

  return (
    <div className="space-y-2">
      <div className="px-6 pt-6">
        <div className="rounded-2xl border bg-white p-4">
          <div className="text-sm font-medium mb-1">Firma Başına Bağlı Entegrasyon</div>
          <div className="text-xs text-neutral-500 mb-3">
            Bir firmayı silmeden önce bağlı entegrasyonları başka firmaya taşıyın.
          </div>
          {usageErr ? (
            <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {usageErr}
            </div>
          ) : usage == null ? (
            <div className="text-sm text-neutral-500">Yükleniyor…</div>
          ) : (
            <div className="flex flex-wrap gap-2">
              {usage.map((u) => (
                <span
                  key={u.key}
                  className={`rounded-lg border px-3 py-1.5 text-xs ${
                    u.linked > 0
                      ? "border-blue-200 bg-blue-50 text-blue-700"
                      : "border-neutral-200 bg-neutral-50 text-neutral-500"
                  }`}
                >
                  {u.display_name} <span className="font-semibold">{u.linked}</span>
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      <TableManager
        cfg={{
          title: "Fatura Metodları",
          table: "invoice_methods",
          matchKeys: ["id"],
          orderBy: { key: "id", asc: true },
          pageSize: 50,
          columns: [
            // id motorda sabit → readOnly.
            { key: "id", label: "id", type: "number", readOnly: true },
            { key: "name", label: "name", type: "text" },
            { key: "description", label: "description", type: "text", multiline: true, rows: 3 },
            { key: "is_active", label: "is_active", type: "bool" },
            { key: "created_at", label: "created_at", type: "text", readOnly: true, hideInTable: true },
          ],
        }}
      />

      <TableManager
        cfg={{
          title: "Fatura Firmaları",
          table: "invoice_companies",
          matchKeys: ["key"],
          orderBy: { key: "key", asc: true },
          pageSize: 100,
          fkErrorMessage: FK_MSG,
          filters: [{ key: "display_name", label: "Firma", type: "text" }],
          columns: [
            // Doğal anahtar: yeni satırda girilir, sonra kilitlenir.
            // (FK'de ON UPDATE yok → kullanımdaki bir key'i değiştirmek 23503 verirdi.)
            { key: "key", label: "key", type: "text", lockAfterInsert: true },
            { key: "display_name", label: "display_name", type: "text" },
            {
              key: "method_id",
              label: "method_id",
              type: "enum",
              optionsFrom: {
                table: "invoice_methods",
                valueKey: "id",
                labelKey: "name",
                orderBy: "id",
              },
            },
            { key: "created_at", label: "created_at", type: "text", readOnly: true, hideInTable: true },
          ],
        }}
      />
    </div>
  );
}
