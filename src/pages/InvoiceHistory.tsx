import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, Loader2, Plus, Trash2 } from "lucide-react";
import DashboardShell from "@/components/dashboard/DashboardShell";
import { useSession } from "@/hooks/useSession";
import {
  listInvoiceSnapshots,
  recomputeSnapshotTotalWithMahsup,
  type InvoiceSnapshotRow,
} from "@/components/utils/invoiceSnapshots";
import {
  fetchAllInvoiceOverridesForUser,
  overrideKey,
  type InvoiceOverrides,
} from "@/components/utils/invoiceOverrides";
import { deleteBackdatedInvoice } from "@/components/utils/backdatedInvoice";
import BackdatedInvoiceModal from "@/components/dashboard/invoices/BackdatedInvoiceModal";

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
  // Fatura kalem override'ları — tüm tesisler/aylar için TEK sorgu; render
  // map'inde senkron lookup ile recompute'a geçirilir.
  const [ovMap, setOvMap] = useState<Map<string, InvoiceOverrides>>(new Map());
  // Oluşturma/silme sonrası listeyi tazelemek için.
  const [reloadKey, setReloadKey] = useState(0);

  const [createOpen, setCreateOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<InvoiceSnapshotRow | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteErr, setDeleteErr] = useState<string | null>(null);

  useEffect(() => {
    if (sessionLoading) return;
    if (!uid) return;

    let cancel = false;

    (async () => {
      try {
        setLoading(true);
        setErr(null);

        const [data, overrides] = await Promise.all([
          // Geriye dönük oluşturulan faturalar da listede (rozetle ayrışır).
          listInvoiceSnapshots({ userId: uid, invoiceTypes: ["billed", "backdated"] }),
          // Fail-open: liste yalnız okur; hata durumunda doğal toplamlar gösterilir.
          fetchAllInvoiceOverridesForUser({ userId: uid }).catch((e) => {
            console.error("invoice overrides load error (history):", e);
            return new Map<string, InvoiceOverrides>();
          }),
        ]);
        if (cancel) return;

        setRows(data);
        setOvMap(overrides);
      } catch (e: any) {
        if (!cancel) setErr(e?.message ?? "Geçmiş faturalar yüklenemedi.");
      } finally {
        if (!cancel) setLoading(false);
      }
    })();

    return () => {
      cancel = true;
    };
  }, [uid, sessionLoading, reloadKey]);

  const grouped = useMemo(() => {
    const map = new Map<number, InvoiceSnapshotRow[]>();
    for (const r of rows) {
      const arr = map.get(r.period_year) ?? [];
      arr.push(r);
      map.set(r.period_year, arr);
    }
    return Array.from(map.entries()).sort((a, b) => b[0] - a[0]);
  }, [rows]);

  const openDetail = (r: InvoiceSnapshotRow) => {
    const base = `/dashboard/invoices/${r.subscription_serno}/${r.period_year}/${String(r.period_month).padStart(2, "0")}`;
    navigate(r.invoice_type === "backdated" ? `${base}?type=backdated` : base);
  };

  const handleDelete = async () => {
    if (!uid || !deleteTarget) return;
    try {
      setDeleting(true);
      setDeleteErr(null);
      await deleteBackdatedInvoice({
        userId: uid,
        subscriptionSerno: deleteTarget.subscription_serno,
        periodYear: deleteTarget.period_year,
        periodMonth: deleteTarget.period_month,
      });
      setDeleteTarget(null);
      setReloadKey((k) => k + 1);
    } catch (e: any) {
      setDeleteErr(e?.message ?? "Silinemedi.");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <DashboardShell>
      <div className="mb-6 flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-neutral-900">Geçmiş Faturalarım</h1>
          <p className="text-sm text-neutral-500">Kaydedilmiş fatura snapshot’ları (yıl / ay)</p>
        </div>

        <button
          onClick={() => setCreateOpen(true)}
          className="flex shrink-0 items-center gap-2 rounded-lg bg-[#00AEEF] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#40CFFF]"
        >
          <Plus className="h-4 w-4" />
          Geçmiş Dönem Faturası Oluştur
        </button>
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
                .sort(
                  (a, b) =>
                    b.period_month - a.period_month ||
                    (a.invoice_type === b.invoice_type ? 0 : a.invoice_type === "billed" ? -1 : 1)
                )
                .map((r) => (
                  // div[role=button]: backdated kartındaki silme butonu iç içe
                  // <button> geçersizliğine takılmasın diye.
                  <div
                    key={`${r.subscription_serno}-${r.period_year}-${r.period_month}-${r.invoice_type}`}
                    role="button"
                    tabIndex={0}
                    onClick={() => openDetail(r)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        openDetail(r);
                      }
                    }}
                    className="cursor-pointer text-left rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm hover:bg-neutral-50 transition"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold text-neutral-900">
                            {r.month_label ?? monthLabelFallback(r.period_year, r.period_month)}
                          </span>
                          {r.invoice_type === "backdated" && (
                            <span className="shrink-0 rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-semibold text-amber-700">
                              Geriye dönük
                            </span>
                          )}
                        </div>
                        <div className="mt-1 text-xs text-neutral-500">
                          Tesis: <span className="font-medium text-neutral-700">{r.subscription_serno}</span>
                        </div>
                      </div>

                      <div className="text-right">
                        <div className="text-xs text-neutral-500">Ödenecek</div>
                        <div className="text-sm font-semibold text-neutral-900">{fmtMoney2(recomputeSnapshotTotalWithMahsup(r, ovMap.get(overrideKey(r.subscription_serno, r.period_year, r.period_month)))) } TL</div>
                      </div>
                    </div>

                    <div className="mt-3 flex items-center justify-between text-xs text-neutral-500">
                      <span>Tüketim: {r.total_consumption_kwh != null ? Number(r.total_consumption_kwh).toLocaleString("tr-TR") : "—"} kWh</span>
                      <span className="flex items-center gap-2">
                        {r.invoice_type === "backdated" && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setDeleteErr(null);
                              setDeleteTarget(r);
                            }}
                            title="Geriye dönük faturayı sil"
                            className="rounded p-1 text-neutral-400 transition hover:bg-red-50 hover:text-red-600"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                        <span className="text-neutral-400">Detay →</span>
                      </span>
                    </div>
                  </div>
                ))}
            </div>
          </section>
        ))}
      </div>

      {/* Geçmiş dönem faturası oluşturma akışı */}
      {createOpen && uid && (
        <BackdatedInvoiceModal
          uid={uid}
          onClose={() => setCreateOpen(false)}
          onCreated={() => setReloadKey((k) => k + 1)}
        />
      )}

      {/* Backdated silme onayı — yalnız kendi 'backdated' kaydı (RLS ile de korunur). */}
      {deleteTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => {
            if (!deleting) setDeleteTarget(null);
          }}
        >
          <div
            className="w-full max-w-md rounded-lg border border-neutral-200 bg-white p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-red-600" />
              <h3 className="text-base font-semibold text-neutral-900">
                Geriye dönük fatura silinsin mi?
              </h3>
            </div>

            <p className="mb-1 text-sm text-neutral-600">
              {deleteTarget.month_label ??
                monthLabelFallback(deleteTarget.period_year, deleteTarget.period_month)}{" "}
              • Tesis {deleteTarget.subscription_serno}
            </p>
            <p className="mb-4 text-sm text-neutral-600">
              Bu işlem geri alınamaz. Aynı dönem için daha sonra yeniden fatura
              oluşturabilirsiniz.
            </p>

            {deleteErr && (
              <div className="mb-3 rounded border border-red-300 bg-red-50 p-2 text-sm text-red-700">
                {deleteErr}
              </div>
            )}

            <div className="flex justify-end gap-2">
              <button
                onClick={() => setDeleteTarget(null)}
                disabled={deleting}
                className="h-10 rounded-lg border border-neutral-300 bg-white px-4 text-sm text-neutral-700 hover:bg-neutral-50 disabled:opacity-50"
              >
                Vazgeç
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="flex h-10 items-center gap-2 rounded-lg bg-red-600 px-4 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
              >
                {deleting && <Loader2 className="h-4 w-4 animate-spin" />}
                Sil
              </button>
            </div>
          </div>
        </div>
      )}
    </DashboardShell>
  );
}
