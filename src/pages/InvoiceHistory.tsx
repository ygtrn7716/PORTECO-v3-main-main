import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import DashboardShell from "@/components/dashboard/DashboardShell";
import { useSession } from "@/hooks/useSession";
import { listInvoiceSnapshots, type InvoiceSnapshotRow } from "@/components/utils/invoiceSnapshots";

const fmtMoney2 = (n: number | null | undefined) =>
  n == null || !Number.isFinite(Number(n))
    ? "—"
    : Number(n).toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const MONTHS = ["Ocak","Şubat","Mart","Nisan","Mayıs","Haziran","Temmuz","Ağustos","Eylül","Ekim","Kasım","Aralık"];

function monthLabelFallback(y: number, m: number) {
  const name = MONTHS[(m - 1 + 12) % 12] ?? `Ay ${m}`;
  return `${name} ${y}`;
}

export default function InvoiceHistory() {
  const { session, loading: sessionLoading } = useSession();
  const uid = session?.user?.id ?? null;
  const navigate = useNavigate();

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [rows, setRows] = useState<InvoiceSnapshotRow[]>([]);

  useEffect(() => {
    if (sessionLoading) return;
    if (!uid) return;

    let cancel = false;

    (async () => {
      try {
        setLoading(true);
        setErr(null);

        const data = await listInvoiceSnapshots({ userId: uid, invoiceType: "billed" });
        if (cancel) return;

        setRows(data);
      } catch (e: any) {
        if (!cancel) setErr(e?.message ?? "Geçmiş faturalar yüklenemedi.");
      } finally {
        if (!cancel) setLoading(false);
      }
    })();

    return () => {
      cancel = true;
    };
  }, [uid, sessionLoading]);

  const grouped = useMemo(() => {
    const map = new Map<number, InvoiceSnapshotRow[]>();
    for (const r of rows) {
      const arr = map.get(r.period_year) ?? [];
      arr.push(r);
      map.set(r.period_year, arr);
    }
    return Array.from(map.entries()).sort((a, b) => b[0] - a[0]);
  }, [rows]);

  return (
    <DashboardShell>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-neutral-900">Geçmiş Faturalarım</h1>
        <p className="text-sm text-neutral-500">Kaydedilmiş fatura snapshot’ları (yıl / ay)</p>
      </div>

      {err && (
        <div className="mb-4 rounded border border-red-300 bg-red-50 p-3 text-sm text-red-700">
          {err}
        </div>
      )}

      {loading && <div className="text-sm text-neutral-500">Yükleniyor…</div>}

      {!loading && !err && rows.length === 0 && (
        <div className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm text-sm text-neutral-600">
          Henüz kaydedilmiş fatura yok. (InvoiceDetail açıldıkça snapshot kaydolacak.)
        </div>
      )}

      <div className="space-y-6">
        {grouped.map(([year, items]) => (
          <section key={year}>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-neutral-900">{year}</h2>
              <div className="text-xs text-neutral-500">{items.length} fatura</div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {items
                .sort((a, b) => b.period_month - a.period_month)
                .map((r) => (
                  <button
                    key={`${r.subscription_serno}-${r.period_year}-${r.period_month}`}
                    onClick={() =>
                      navigate(`/dashboard/invoices/${r.subscription_serno}/${r.period_year}/${String(r.period_month).padStart(2, "0")}`)
                    }
                    className="text-left rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm hover:bg-neutral-50 transition"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-sm font-semibold text-neutral-900">
                          {r.month_label ?? monthLabelFallback(r.period_year, r.period_month)}
                        </div>
                        <div className="mt-1 text-xs text-neutral-500">
                          Tesis: <span className="font-medium text-neutral-700">{r.subscription_serno}</span>
                        </div>
                      </div>

                      <div className="text-right">
                        <div className="text-xs text-neutral-500">Ödenecek</div>
                        <div className="text-sm font-semibold text-neutral-900">{fmtMoney2(r.total_with_mahsup)} TL</div>
                      </div>
                    </div>

                    <div className="mt-3 flex items-center justify-between text-xs text-neutral-500">
                      <span>Tüketim: {r.total_consumption_kwh != null ? Number(r.total_consumption_kwh).toLocaleString("tr-TR") : "—"} kWh</span>
                      <span className="text-neutral-400">Detay →</span>
                    </div>
                  </button>
                ))}
            </div>
          </section>
        ))}
      </div>
    </DashboardShell>
  );
}
