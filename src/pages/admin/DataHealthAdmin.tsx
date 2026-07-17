// src/pages/admin/DataHealthAdmin.tsx
// Veri Sağlığı (Data Health) — Tüketim sekmesi.
// Her tesis için en son saatlik tüketim verisinin ne zaman geldiğini gösterir,
// böylece senkron durmuş tesisler tespit edilebilir. Auto-refresh YOK.
//
// GES sekmesi sonra eklenecek: TABS yapısı + src/lib/dataHealth.ts'teki ortak
// durum/format mantığı yeniden kullanılarak temiz biçimde genişletilebilir.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { RefreshCw, SlidersHorizontal, ArrowUpDown, Copy, Check, Download } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { dayjsTR } from "@/lib/dayjs";
import {
  ConsumptionHealthRow,
  HealthStatus,
  STATUS_META,
  computeStatus,
  isUnmapped,
  formatDelay,
  formatTsTR,
  formatPeriod,
  providerLabel,
} from "@/lib/dataHealth";
import DataHealthDetailModal from "@/components/admin/dataHealth/DataHealthDetailModal";
import DataHealthThresholdsModal from "@/components/admin/dataHealth/DataHealthThresholdsModal";

const TABS = [
  { key: "consumption", label: "Tüketim", enabled: true },
  { key: "ges", label: "GES", enabled: false },
] as const;

type FilterKey = "all" | "problem" | "nodata" | "unmapped";
type SortKey = "delay" | "name";

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "all", label: "Tümü" },
  { key: "problem", label: "Sadece Sorunlular (🔴⚫)" },
  { key: "nodata", label: "Veri Yok (⚪)" },
  { key: "unmapped", label: "Eşleşmemiş" },
];

const num = (v: unknown): number | null => {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/** PostgREST numeric'i string döndürebilir; sayısal alanları normalize et. */
function normalize(r: Record<string, unknown>): ConsumptionHealthRow {
  return {
    subscription_serno: Number(r.subscription_serno),
    user_id: String(r.user_id),
    title: (r.title as string | null) ?? null,
    provider_key: (r.provider_key as string | null) ?? null,
    display_name: (r.display_name as string | null) ?? null,
    system_type: (r.system_type as string | null) ?? null,
    expected_period_hours: num(r.expected_period_hours),
    healthy_threshold_hours: num(r.healthy_threshold_hours),
    warning_threshold_hours: num(r.warning_threshold_hours),
    last_ts: (r.last_ts as string | null) ?? null,
    delay_hours: num(r.delay_hours),
    records_last_24h: Number(r.records_last_24h) || 0,
  };
}

export default function DataHealthAdmin() {
  const [activeTab, setActiveTab] = useState<(typeof TABS)[number]["key"]>("consumption");
  const [rows, setRows] = useState<ConsumptionHealthRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loadedAt, setLoadedAt] = useState<string | null>(null);

  const [filter, setFilter] = useState<FilterKey>("all");
  const [sortKey, setSortKey] = useState<SortKey>("delay");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const [detailRow, setDetailRow] = useState<ConsumptionHealthRow | null>(null);
  const [showThresholds, setShowThresholds] = useState(false);

  // Kopyalama / bildirim durumları
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<number | undefined>(undefined);
  const copyTimer = useRef<number | undefined>(undefined);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error: err } = await supabase.rpc("get_consumption_health");
    if (err) {
      setError(err.message);
      setRows([]);
    } else {
      setRows(((data ?? []) as Record<string, unknown>[]).map(normalize));
      setLoadedAt(dayjsTR().format("DD.MM.YYYY HH:mm"));
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Durumları bir kez hesapla
  const withStatus = useMemo(
    () => rows.map((r) => ({ row: r, status: computeStatus(r) })),
    [rows]
  );

  const counts = useMemo(() => {
    const c: Record<HealthStatus, number> = { healthy: 0, warning: 0, problem: 0, critical: 0, nodata: 0 };
    for (const { status } of withStatus) c[status]++;
    return c;
  }, [withStatus]);

  const filtered = useMemo(() => {
    let list = withStatus;
    if (filter === "problem") list = list.filter((x) => x.status === "problem" || x.status === "critical");
    else if (filter === "nodata") list = list.filter((x) => x.status === "nodata");
    else if (filter === "unmapped") list = list.filter((x) => isUnmapped(x.row));

    const sorted = [...list].sort((a, b) => {
      let cmp = 0;
      if (sortKey === "delay") {
        const av = a.row.delay_hours == null ? Infinity : a.row.delay_hours;
        const bv = b.row.delay_hours == null ? Infinity : b.row.delay_hours;
        cmp = av - bv;
      } else {
        const an = a.row.title || `Tesis ${a.row.subscription_serno}`;
        const bn = b.row.title || `Tesis ${b.row.subscription_serno}`;
        cmp = an.localeCompare(bn, "tr");
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
    return sorted;
  }, [withStatus, filter, sortKey, sortDir]);

  function toggleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "delay" ? "desc" : "asc");
    }
  }

  // Temizlik: bekleyen zamanlayıcıları bırak
  useEffect(() => {
    return () => {
      window.clearTimeout(toastTimer.current);
      window.clearTimeout(copyTimer.current);
    };
  }, []);

  function showToast(message: string) {
    setToast(message);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 2500);
  }

  async function copyText(text: string): Promise<boolean> {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      return false;
    }
  }

  async function copyUuid(rowKey: string, uuid: string) {
    const ok = await copyText(uuid);
    if (!ok) {
      showToast("Kopyalanamadı");
      return;
    }
    setCopiedKey(rowKey);
    window.clearTimeout(copyTimer.current);
    copyTimer.current = window.setTimeout(
      () => setCopiedKey((k) => (k === rowKey ? null : k)),
      1500
    );
  }

  // CSV: görünen (filtrelenmiş) satırları UTF-8 BOM ile dışa aktar
  function exportCsv() {
    const header = [
      "durum",
      "firma_adi",
      "subscription_serno",
      "user_id",
      "provider",
      "beklenen_periyot_saat",
      "son_veri_zamani",
      "gecikme_saat",
      "son_24s_kayit",
    ];
    const esc = (v: unknown) => {
      const s = String(v ?? "");
      return /[",\n\r;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines = filtered.map(({ row, status }) =>
      [
        STATUS_META[status].label,
        row.title || `Tesis ${row.subscription_serno}`,
        row.subscription_serno,
        row.user_id,
        providerLabel(row),
        row.expected_period_hours ?? "",
        formatTsTR(row.last_ts),
        row.delay_hours ?? "",
        row.records_last_24h,
      ]
        .map(esc)
        .join(",")
    );
    const csv = [header.join(","), ...lines].join("\r\n");
    const BOM = String.fromCharCode(0xfeff); // Excel'in UTF-8'i doğru okuması için
    const blob = new Blob([BOM + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `veri-sagligi-${dayjsTR().format("YYYY-MM-DD")}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    showToast(`${filtered.length} satır dışa aktarıldı`);
  }

  // Tüm veri kümesinden (filtreden bağımsız) sorunlu/kritik/veri-yok
  // tesislerin user_id'lerini tekilleştirip satır-satır kopyala
  async function copyProblemUuids() {
    const problem = new Set<HealthStatus>(["problem", "critical", "nodata"]);
    const uuids = Array.from(
      new Set(withStatus.filter((x) => problem.has(x.status)).map((x) => x.row.user_id))
    );
    if (uuids.length === 0) {
      showToast("Sorunlu tesis yok");
      return;
    }
    const ok = await copyText(uuids.join("\n"));
    showToast(ok ? `${uuids.length} adet UUID kopyalandı` : "Kopyalanamadı");
  }

  const badge = (label: string, value: number, cls = "bg-neutral-100 text-neutral-700") => (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${cls}`}>
      {label} <span className="font-semibold">{value}</span>
    </span>
  );

  return (
    <div className="p-6">
      {/* Sistem sekmeleri (GES sonra) */}
      <div className="flex items-center gap-2 mb-4">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            disabled={!t.enabled}
            onClick={() => t.enabled && setActiveTab(t.key)}
            className={[
              "rounded-lg px-3 py-1.5 text-sm font-medium transition",
              activeTab === t.key
                ? "bg-[#0A66FF] text-white"
                : t.enabled
                ? "bg-neutral-100 text-neutral-700 hover:bg-neutral-200"
                : "bg-neutral-50 text-neutral-400 cursor-not-allowed",
            ].join(" ")}
          >
            {t.label}
            {!t.enabled && <span className="ml-1 text-[10px]">(yakında)</span>}
          </button>
        ))}
      </div>

      {/* Üst bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div>
          <h1 className="text-xl font-semibold text-neutral-900">Veri Sağlığı — Tüketim</h1>
          {loadedAt && <p className="text-xs text-neutral-500 mt-0.5">Son güncelleme: {loadedAt}</p>}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowThresholds(true)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
          >
            <SlidersHorizontal size={15} /> Eşik Ayarları
          </button>
          <button
            type="button"
            onClick={copyProblemUuids}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-100 disabled:opacity-50"
          >
            🔴 Sorunlu UUID'leri Kopyala
          </button>
          <button
            type="button"
            onClick={exportCsv}
            disabled={loading || filtered.length === 0}
            className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-sm font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-50"
          >
            <Download size={15} /> Dışa Aktar
          </button>
          <button
            type="button"
            onClick={load}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#0A66FF] px-3 py-1.5 text-sm font-medium text-white hover:bg-[#0A66FF]/90 disabled:opacity-50"
          >
            <RefreshCw size={15} className={loading ? "animate-spin" : ""} /> Yenile
          </button>
        </div>
      </div>

      {/* Özet rozetleri */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        {badge("Toplam:", rows.length, "bg-neutral-800 text-white")}
        {badge("🟢", counts.healthy, STATUS_META.healthy.badgeBg)}
        {badge("🟡", counts.warning, STATUS_META.warning.badgeBg)}
        {badge("🔴", counts.problem, STATUS_META.problem.badgeBg)}
        {badge("⚫", counts.critical, STATUS_META.critical.badgeBg)}
        {badge("⚪", counts.nodata, STATUS_META.nodata.badgeBg)}
      </div>

      {/* Filtre sekmeleri */}
      <div className="flex flex-wrap gap-2 mb-4">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setFilter(f.key)}
            className={[
              "rounded-lg px-3 py-1.5 text-sm font-medium transition",
              filter === f.key ? "bg-neutral-900 text-white" : "bg-neutral-100 text-neutral-700 hover:bg-neutral-200",
            ].join(" ")}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Tablo */}
      <div className="rounded-2xl border bg-white overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-neutral-50">
              <tr>
                <th className="text-left font-medium px-4 py-3 border-b">Durum</th>
                <th className="text-left font-medium px-4 py-3 border-b">
                  <button type="button" onClick={() => toggleSort("name")} className="inline-flex items-center gap-1 hover:text-neutral-900">
                    Firma / Tesis Adı <ArrowUpDown size={13} className={sortKey === "name" ? "text-[#0A66FF]" : "text-neutral-400"} />
                  </button>
                </th>
                <th className="text-left font-medium px-4 py-3 border-b">SerNo</th>
                <th className="text-left font-medium px-4 py-3 border-b">User UUID</th>
                <th className="text-left font-medium px-4 py-3 border-b">Provider</th>
                <th className="text-left font-medium px-4 py-3 border-b">Beklenen Periyot</th>
                <th className="text-left font-medium px-4 py-3 border-b">Son Veri Zamanı</th>
                <th className="text-left font-medium px-4 py-3 border-b">
                  <button type="button" onClick={() => toggleSort("delay")} className="inline-flex items-center gap-1 hover:text-neutral-900">
                    Gecikme <ArrowUpDown size={13} className={sortKey === "delay" ? "text-[#0A66FF]" : "text-neutral-400"} />
                  </button>
                </th>
                <th className="text-right font-medium px-4 py-3 border-b">Son 24s Kayıt</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={9} className="px-4 py-10 text-center text-neutral-500">Yükleniyor…</td></tr>
              ) : error ? (
                <tr><td colSpan={9} className="px-4 py-10 text-center text-red-600">Veri alınamadı: {error}</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={9} className="px-4 py-10 text-center text-neutral-500">Kayıt bulunamadı.</td></tr>
              ) : (
                filtered.map(({ row, status }) => {
                  const meta = STATUS_META[status];
                  const unmapped = isUnmapped(row);
                  const rowKey = `${row.user_id}:${row.subscription_serno}`;
                  return (
                    <tr
                      key={rowKey}
                      onClick={() => setDetailRow(row)}
                      className="border-b last:border-b-0 hover:bg-neutral-50/70 cursor-pointer"
                    >
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${meta.text}`}>
                          <span className={`h-2.5 w-2.5 rounded-full ${meta.dot}`} />
                          {meta.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-medium text-neutral-900">{row.title || `Tesis ${row.subscription_serno}`}</td>
                      <td className="px-4 py-3 font-mono text-xs text-neutral-600">{row.subscription_serno}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono text-xs text-neutral-600" title={row.user_id}>
                            {row.user_id.slice(0, 8)}…{row.user_id.slice(-4)}
                          </span>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              copyUuid(rowKey, row.user_id);
                            }}
                            title="User UUID'yi kopyala"
                            aria-label="User UUID'yi kopyala"
                            className="shrink-0 rounded p-1 hover:bg-neutral-100"
                          >
                            {copiedKey === rowKey ? (
                              <Check size={14} className="text-emerald-600" />
                            ) : (
                              <Copy size={14} className="text-neutral-400" />
                            )}
                          </button>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center gap-1.5">
                          {providerLabel(row)}
                          {unmapped && (
                            <span className="rounded-full bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 ring-1 ring-amber-200">
                              Eşleşmemiş
                            </span>
                          )}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-neutral-700">{formatPeriod(row.expected_period_hours)}</td>
                      <td className="px-4 py-3 text-neutral-700">{formatTsTR(row.last_ts)}</td>
                      <td className={`px-4 py-3 font-medium ${meta.text}`}>{formatDelay(row.delay_hours)}</td>
                      <td className="px-4 py-3 text-right text-neutral-700">{row.records_last_24h}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {detailRow && <DataHealthDetailModal row={detailRow} onClose={() => setDetailRow(null)} />}
      {showThresholds && (
        <DataHealthThresholdsModal onClose={() => setShowThresholds(false)} onChanged={load} />
      )}

      {/* Bildirim (kopyala / dışa aktar geri bildirimi) */}
      {toast && (
        <div className="fixed bottom-4 right-4 z-[90] rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white shadow-lg">
          {toast}
        </div>
      )}
    </div>
  );
}
