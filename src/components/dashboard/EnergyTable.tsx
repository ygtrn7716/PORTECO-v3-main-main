// src/components/dashboard/EnergyTable.tsx
import { useEffect, useRef, useState } from "react";
import dayjs from "dayjs";
import { ChevronDown } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { dayjsTR } from "@/lib/dayjs";
import { useSession } from "@/hooks/useSession";
import { fetchHiddenSernos } from "@/lib/subscriptionVisibility";
import {
  exportConsumptionHourlyXlsx,
  exportConsumptionAllTotalsXlsx,
} from "@/components/utils/exportConsumptionXlsx";

type HourRow = {
  ts: string;
  subscription_serno: number;
  cn: number | null;
  gn: number | null;
  ri: number | null;
  rc: number | null;
};

type SubRow = { subscription_serno: number; title: string | null; nickname: string | null };

// CSV, Excel ve "Daha Fazla" butonları için ortak stil (8px radius, marka #00AEEF focus).
const BTN_CLS =
  "h-9 rounded-lg border border-neutral-300 bg-white px-3 text-sm text-neutral-700 hover:bg-neutral-50 focus:outline-none focus:ring-1 focus:ring-[#00AEEF] disabled:opacity-50";

// Seçim controlled: ana "Tesis:" seçici ile ConsumptionDetail üzerinden paylaşılır
// (biri değişince diğeri de aynı seçimi yansıtır).
type EnergyTableProps = {
  selectedSub: "ALL" | number;
  onSelectedSubChange: (v: "ALL" | number) => void;
};

export default function EnergyTable({ selectedSub, onSelectedSubChange }: EnergyTableProps) {
  const { session } = useSession();
  const uid = session?.user?.id ?? null;

  const [subs, setSubs] = useState<SubRow[]>([]);

  const [from, setFrom] = useState<string>(() =>
    dayjs().subtract(7, "day").format("YYYY-MM-DD")
  );
  const [to, setTo] = useState<string>(() =>
    dayjs().format("YYYY-MM-DD")
  );

  const [rows, setRows] = useState<HourRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // xlsx export durumu (CSV hariç tüm xlsx butonları için ortak)
  const [xlsxBusy, setXlsxBusy] = useState(false);

  // "Daha Fazla" dropdown
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement | null>(null);

  const pageSize = 1000;

  // Sadece kendi tesisatları (RLS zaten filtreliyor) + gizli tesisleri cikar
  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from("owner_subscriptions")
        .select("subscription_serno, title")
        .order("subscription_serno", { ascending: true });

      if (error) return;
      const rawList = data || [];

      // nickname'leri subscription_settings'ten al
      const sernos = rawList.map((r: any) => Number(r.subscription_serno)).filter(Number.isFinite);
      let nickMap = new Map<number, string | null>();
      if (uid && sernos.length > 0) {
        const { data: ssData } = await supabase
          .from("subscription_settings")
          .select("subscription_serno, nickname")
          .eq("user_id", uid)
          .in("subscription_serno", sernos);
        for (const r of (ssData ?? []) as any[]) {
          const k = Number(r.subscription_serno);
          if (Number.isFinite(k)) nickMap.set(k, r.nickname ?? null);
        }
      }

      let list: SubRow[] = rawList.map((r: any) => ({
        subscription_serno: Number(r.subscription_serno),
        title: r.title ?? null,
        nickname: nickMap.get(Number(r.subscription_serno)) ?? null,
      }));

      if (uid) {
        const hidden = await fetchHiddenSernos(uid);
        list = list.filter((s) => !hidden.has(s.subscription_serno));
      }

      setSubs(list);
    })();
  }, [uid]);

  async function fetchRows() {
    setLoading(true); setErr(null);

    let q = supabase
      .from("consumption_hourly")
      .select("ts, subscription_serno, cn, gn, ri, rc")
      .gte("ts", dayjs(from).startOf("day").toISOString())
      .lte("ts", dayjs(to).endOf("day").toISOString())
      .order("ts", { ascending: true })
      .limit(pageSize);

    if (selectedSub !== "ALL") q = q.eq("subscription_serno", selectedSub);

    const { data, error } = await q;

    if (error) {
      setErr(error.message);
      setRows([]);
    } else {
      setRows(data || []);
    }
    setLoading(false);
  }

  // İlk yükleme & filtre değişimi
  useEffect(() => {
    fetchRows();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from, to, selectedSub]);

  // Dropdown: dışarı tıkla / Escape ile kapan
  useEffect(() => {
    if (!moreOpen) return;
    function onDown(e: MouseEvent) {
      if (moreRef.current && !moreRef.current.contains(e.target as Node)) setMoreOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setMoreOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [moreOpen]);

  function downloadCsv() {
    const header = ["Tarih-Saat", "Tesisat", "CN(kWh)", "GN(kWh)", "RI(kvarh)", "RC(kvarh)"];
    const body = rows.map(r => [
      dayjs(r.ts).format("YYYY-MM-DD HH:mm"),
      r.subscription_serno,
      (r.cn ?? 0),
      (r.gn ?? 0),
      (r.ri ?? 0),
      (r.rc ?? 0),
    ]);
    const csv = [header, ...body].map(a => a.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `hourly_${from}_${to}.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  // Tesis etiketi: dropdown ile birebir aynı format ("serno — ünvan/nickname").
  function subLabel(serno: number): string {
    const s = subs.find((x) => x.subscription_serno === serno);
    const name = s ? (s.nickname ?? s.title) : null;
    return name ? `${serno} — ${name}` : String(serno);
  }

  type ExportDisplay = { periodLabel: string; fileStart: string; fileEnd: string };

  // Ortak xlsx export: tek tesis → seçili tesisatın markalı dökümü; "Tümü" → tüm
  // tesislerin saatlik toplamı tek markalı sayfada.
  async function exportXlsxForRange(
    fromIso: string,
    toExclusiveIso: string,
    display: ExportDisplay,
  ) {
    if (!uid) return;
    setXlsxBusy(true);
    setErr(null);
    try {
      if (selectedSub !== "ALL") {
        await exportConsumptionHourlyXlsx({
          userId: uid,
          subscriptionSerno: selectedSub,
          fromIso,
          toExclusiveIso,
          facilityLabel: subLabel(selectedSub),
          ...display,
        });
        return;
      }

      // "Tümü": tüm tesislerin saatlik toplamı tek markalı sayfada.
      await exportConsumptionAllTotalsXlsx({
        fromIso,
        toExclusiveIso,
        facilities: subs.map((s) => subLabel(s.subscription_serno)),
        ...display,
      });
    } catch (e: any) {
      console.error("excel export error:", e);
      setErr(e?.message ?? "Excel çıkartılamadı.");
    } finally {
      setXlsxBusy(false);
    }
  }

  // [Excel] — CSV ile aynı tesis + aynı tarih aralığı, .xlsx üretir.
  function handleExcel() {
    const fromIso = dayjs(from).startOf("day").toISOString();
    const toExclusiveIso = dayjs(to).add(1, "day").startOf("day").toISOString();
    void exportXlsxForRange(fromIso, toExclusiveIso, {
      periodLabel: `${dayjs(from).format("DD.MM.YYYY")} – ${dayjs(to).format("DD.MM.YYYY")}`,
      fileStart: dayjs(from).format("YYYYMMDD"),
      fileEnd: dayjs(to).format("YYYYMMDD"),
    });
  }

  // [Daha Fazla ▼] — tam dönem (bu ay / geçen ay) xlsx export.
  function handleMonthExport(range: "curr" | "prev") {
    setMoreOpen(false);
    const startD =
      range === "prev"
        ? dayjsTR().subtract(1, "month").startOf("month")
        : dayjsTR().startOf("month");
    // Çekim penceresi sonu (exclusive) ve gösterim/dosya için dahil edilen son gün.
    const toExclusiveD =
      range === "prev" ? dayjsTR().startOf("month") : dayjsTR().add(1, "minute");
    const endInclusiveD =
      range === "prev" ? dayjsTR().startOf("month").subtract(1, "day") : dayjsTR();
    void exportXlsxForRange(startD.toDate().toISOString(), toExclusiveD.toDate().toISOString(), {
      periodLabel: `${startD.format("DD.MM.YYYY")} – ${endInclusiveD.format("DD.MM.YYYY")}`,
      fileStart: startD.format("YYYYMMDD"),
      fileEnd: endInclusiveD.format("YYYYMMDD"),
    });
  }

  return (
    <section className="w-full">
      {/* Filtreler */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-4">
        <div className="flex flex-col">
          <label className="text-xs text-neutral-500 mb-1">Tesisat</label>
          <select
            className="rounded-xl border border-neutral-300 bg-white px-3 py-2"
            value={selectedSub === "ALL" ? "ALL" : String(selectedSub)}
            onChange={(e) => {
              const v = e.target.value;
              onSelectedSubChange(v === "ALL" ? "ALL" : Number(v));
            }}
          >
            <option value="ALL">Tümü</option>
            {subs.map((s) => (
              <option key={s.subscription_serno} value={s.subscription_serno}>
                {s.subscription_serno} {(s.nickname ?? s.title) ? `— ${s.nickname ?? s.title}` : ""}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col">
          <label className="text-xs text-neutral-500 mb-1">Başlangıç</label>
          <input
            type="date"
            className="rounded-xl border border-neutral-300 bg-white px-3 py-2"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
        </div>

        <div className="flex flex-col">
          <label className="text-xs text-neutral-500 mb-1">Bitiş</label>
          <input
            type="date"
            className="rounded-xl border border-neutral-300 bg-white px-3 py-2"
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
        </div>

        {/* Export buton grubu: [CSV] [Excel] [Daha Fazla ▼] */}
        <div className="flex items-end">
          <div className="flex items-center gap-2">
            <button
              type="button"
              className={BTN_CLS}
              onClick={downloadCsv}
              disabled={rows.length === 0}
              title="Görüntülenen veriyi CSV indir"
            >
              CSV
            </button>

            <button
              type="button"
              className={BTN_CLS}
              onClick={handleExcel}
              disabled={!uid || xlsxBusy}
              title="Seçili tesis + tarih aralığını Excel (.xlsx) indir"
            >
              {xlsxBusy ? "…" : "Excel"}
            </button>

            <div className="relative" ref={moreRef}>
              <button
                type="button"
                className={BTN_CLS + " inline-flex items-center gap-1"}
                onClick={() => setMoreOpen((o) => !o)}
                disabled={!uid || xlsxBusy}
                aria-haspopup="menu"
                aria-expanded={moreOpen}
                title="Tam dönem Excel export"
              >
                Daha Fazla
                <ChevronDown
                  className={"h-4 w-4 transition-transform duration-200 " + (moreOpen ? "rotate-180" : "")}
                />
              </button>

              {moreOpen && (
                <div
                  role="menu"
                  className="absolute right-0 z-10 mt-1 w-52 rounded-lg border border-neutral-200 bg-white py-1 shadow-lg"
                >
                  <button
                    type="button"
                    role="menuitem"
                    className="block w-full px-3 py-2 text-left text-sm text-neutral-700 hover:bg-neutral-50"
                    onClick={() => handleMonthExport("curr")}
                  >
                    Bu ayı Excel’e çıkart
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    className="block w-full px-3 py-2 text-left text-sm text-neutral-700 hover:bg-neutral-50"
                    onClick={() => handleMonthExport("prev")}
                  >
                    Geçen ayı Excel’e çıkart
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Tablo */}
      <div className="rounded-2xl border border-neutral-200 bg-white p-4">
        {err && <div className="text-red-600 text-sm mb-2">Hata: {err}</div>}
        {loading && <div className="text-sm text-neutral-500 mb-2">Yükleniyor…</div>}

        {rows.length === 0 ? (
          <div className="text-sm text-neutral-500">Kayıt bulunamadı.</div>
        ) : (
          <div className="overflow-auto max-h-[70vh]">
            <table className="min-w-full text-sm">
              <thead className="sticky top-0 bg-white">
                <tr className="text-left border-b">
                  <th className="py-2 pr-4">Tarih-Saat</th>
                  <th className="py-2 pr-4">Tesisat</th>
                  <th className="py-2 pr-4">CN (kWh)</th>
                  <th className="py-2 pr-4">GN (kWh)</th>
                  <th className="py-2 pr-4">RI (kvarh)</th>
                  <th className="py-2 pr-0">RC (kvarh)</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={`${r.subscription_serno}-${r.ts}-${i}`} className="border-b last:border-0">
                    <td className="py-2 pr-4">{dayjs(r.ts).format("YYYY-MM-DD HH:mm")}</td>
                    <td className="py-2 pr-4">{r.subscription_serno}</td>
                    <td className="py-2 pr-4">{(r.cn ?? 0).toFixed(3)}</td>
                    <td className="py-2 pr-4">{(r.gn ?? 0).toFixed(3)}</td>
                    <td className="py-2 pr-4">{(r.ri ?? 0).toFixed(3)}</td>
                    <td className="py-2 pr-0">{(r.rc ?? 0).toFixed(3)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
