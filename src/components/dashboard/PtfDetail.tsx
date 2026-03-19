//src/components/dashboard/PtfDetail.tsx
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import DashboardShell from "@/components/dashboard/DashboardShell";
import { useSession } from "@/hooks/useSession";
import { supabase } from "@/lib/supabase";
import { dayjsTR } from "@/lib/dayjs";
import { downloadXlsx } from "@/components/utils/xlsx";
import { fetchHiddenSernos, resolveSelectedSub } from "@/lib/subscriptionVisibility";
import { fetchAllConsumption, fetchAllPtf } from "@/lib/paginatedFetch";

type SubscriptionOption = {
  subscriptionSerNo: number;
  meterSerial: string | null;
  nickname: string | null;
};

type Row = {
  ts: string; // ISO
  kwh: number;         // çekiş (cn)
  gn: number;          // veriş (gn)
  gesKwh: number;      // GES saatlik üretim
  ptf_tl_mwh: number | null;
  tl: number | null;        // çekiş maliyeti: kwh * ptf / 1000
  verisTl: number | null;   // veriş geliri: gn * ptf / 1000
};

const LS_SUB_KEY = "eco_selected_sub";

const fmtInt = (n: number | null | undefined) =>
  n == null || !Number.isFinite(Number(n))
    ? "—"
    : Number(n).toLocaleString("tr-TR", { maximumFractionDigits: 0 });

const fmt2 = (n: number | null | undefined) =>
  n == null || !Number.isFinite(Number(n))
    ? "—"
    : Number(n).toLocaleString("tr-TR", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });

const fmt6 = (n: number | null | undefined) =>
  n == null || !Number.isFinite(Number(n))
    ? "—"
    : Number(n).toLocaleString("tr-TR", {
        minimumFractionDigits: 6,
        maximumFractionDigits: 6,
      });

// timestamp -> hourKey (timezone sapıtmasın diye epoch saat anahtarı)
const hourKey = (ts: string) =>
  Math.floor(new Date(ts).getTime() / 3600000) * 3600000;

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function safeName(s: string) {
  return (s ?? "tesis")
    .toString()
    .trim()
    .replace(/[^\w.-]+/g, "_")
    .slice(0, 80);
}

export default function PtfDetail() {
  const navigate = useNavigate();
  const { session: authSession, loading: sessionLoading } = useSession();
  const uid = authSession?.user?.id ?? null;

  // default: geçen ay
  const base = useMemo(() => dayjsTR().subtract(1, "month"), []);
  const [year, setYear] = useState<number>(base.year());
  const [month, setMonth] = useState<number>(base.month() + 1); // 1-12

  // tesis
  const [subs, setSubs] = useState<SubscriptionOption[]>([]);
  const [selectedSub, setSelectedSub] = useState<number | null>(() => {
    const raw =
      typeof window !== "undefined" ? localStorage.getItem(LS_SUB_KEY) : null;
    const n = raw ? Number(raw) : NaN;
    return Number.isFinite(n) ? n : null;
  });
  const [subsLoading, setSubsLoading] = useState(false);
  const [subsErr, setSubsErr] = useState<string | null>(null);

  // data
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // GES
  const [hasGes, setHasGes] = useState(false);

  // export
  const [exporting, setExporting] = useState(false);
  const [exportErr, setExportErr] = useState<string | null>(null);

  // özetler
  const summary = useMemo(() => {
    let totalKwh = 0;
    let coveredKwh = 0;
    let totalTl = 0;
    let totalGn = 0;
    let totalVerisTl = 0;
    let totalGesKwh = 0;

    for (const r of rows) {
      totalKwh += r.kwh || 0;
      totalGn += r.gn || 0;
      totalGesKwh += r.gesKwh || 0;
      if (r.ptf_tl_mwh != null && r.tl != null) {
        coveredKwh += r.kwh || 0;
        totalTl += r.tl || 0;
      }
      if (r.ptf_tl_mwh != null && r.verisTl != null) {
        totalVerisTl += r.verisTl || 0;
      }
    }

    const monthlyPtf = coveredKwh > 0 ? totalTl / coveredKwh : null;
    const missingKwh = totalKwh - coveredKwh;

    return { totalKwh, coveredKwh, missingKwh, totalTl, monthlyPtf, totalGn, totalVerisTl, totalGesKwh };
  }, [rows]);

  const monthLabel = useMemo(() => {
    const labels = [
      "Ocak",
      "Şubat",
      "Mart",
      "Nisan",
      "Mayıs",
      "Haziran",
      "Temmuz",
      "Ağustos",
      "Eylül",
      "Ekim",
      "Kasım",
      "Aralık",
    ];
    return `${labels[month - 1]} ${year}`;
  }, [month, year]);

  const selectedSubObj = subs.find((s) => s.subscriptionSerNo === selectedSub);
  const selectedMeterSerial = selectedSubObj?.meterSerial ?? null;

  const selectedSubLabel = (() => {
    if (!selectedSubObj) return selectedSub != null ? String(selectedSub) : "Tesis seçilmedi";
    const nick = selectedSubObj.nickname;
    const serial = selectedSubObj.meterSerial ?? String(selectedSubObj.subscriptionSerNo);
    return nick ? `${serial} - ${nick}` : serial;
  })();

  // 0) tesisleri çek (LABEL = owner_subscriptions.meter_serial)
  useEffect(() => {
    if (sessionLoading) return;
    if (!uid) return;

    let cancel = false;

    (async () => {
      try {
        setSubsLoading(true);
        setSubsErr(null);

        const { data, error } = await supabase
          .from("owner_subscriptions")
          .select("subscription_serno, meter_serial")
          .eq("user_id", uid)
          .order("subscription_serno", { ascending: true });

        if (cancel) return;
        if (error) throw error;

        const sernos = (data ?? []).map((r: any) => Number(r.subscription_serno)).filter(Number.isFinite);
        let nickMap = new Map<number, string | null>();
        if (sernos.length > 0) {
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
        if (cancel) return;

        const allList: SubscriptionOption[] = (data ?? []).map((r: any) => {
          const serno = Number(r.subscription_serno);
          return {
            subscriptionSerNo: serno,
            meterSerial: r.meter_serial ?? null,
            nickname: nickMap.get(serno) ?? null,
          };
        });

        // Gizli tesisleri filtrele
        const hidden = await fetchHiddenSernos(uid);
        if (cancel) return;
        const list = allList.filter((s) => !hidden.has(s.subscriptionSerNo));

        setSubs(list);

        const next = resolveSelectedSub(
          list.map((s) => s.subscriptionSerNo),
          selectedSub,
        );
        setSelectedSub(next);
      } catch (e: any) {
        if (!cancel) {
          setSubsErr(e?.message ?? "Tesisler yüklenemedi");
          setSubs([]);
          setSelectedSub(null);
        }
      } finally {
        if (!cancel) setSubsLoading(false);
      }
    })();

    return () => {
      cancel = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid, sessionLoading]);

  // 1) seçili ay için satır satır hesap
  useEffect(() => {
    if (sessionLoading) return;
    if (!uid || !selectedSub) return;

    let cancel = false;

    (async () => {
      try {
        setLoading(true);
        setErr(null);

        const start = dayjsTR().year(year).month(month - 1).startOf("month");
        const end = start.clone().add(1, "month");

        const startIso = start.toDate().toISOString();
        const endIso = end.toDate().toISOString();

        // consumption (paginated - PostgREST max_rows limiti aşılmasın)
        const cons = await fetchAllConsumption({
          supabase,
          userId: uid,
          subscriptionSerno: selectedSub,
          columns: "ts, cn, gn",
          startIso,
          endIso,
        });

        if (cancel) return;
        if (cons.error) throw cons.error;

        // ptf (paginated)
        const ptf = await fetchAllPtf({
          supabase,
          columns: "ts, ptf_tl_mwh",
          startIso,
          endIso,
        });

        if (cancel) return;
        if (ptf.error) throw ptf.error;

        // GES saatlik üretim verisi
        const { data: gesPlants } = await supabase
          .from("ges_plants")
          .select("id")
          .eq("user_id", uid)
          .eq("is_active", true);

        if (cancel) return;

        const gesHourlyMap = new Map<number, number>();
        const gesFound = (gesPlants ?? []).length > 0;
        setHasGes(gesFound);

        if (gesFound) {
          const plantIds = (gesPlants ?? []).map((p: any) => p.id);
          const { data: gesHourly } = await supabase
            .from("ges_production_hourly")
            .select("ts, energy_kwh")
            .in("ges_plant_id", plantIds)
            .gte("ts", startIso)
            .lt("ts", endIso)
            .order("ts");

          if (cancel) return;

          for (const row of gesHourly ?? []) {
            const hk = hourKey(String(row.ts));
            gesHourlyMap.set(hk, (gesHourlyMap.get(hk) || 0) + (Number(row.energy_kwh) || 0));
          }
        }

        // PTF map
        const ptfMap = new Map<number, number>();
        for (const r of (ptf.data ?? []) as any[]) {
          const ts = String(r.ts);
          const v = r.ptf_tl_mwh != null ? Number(r.ptf_tl_mwh) : NaN;
          if (Number.isFinite(v)) ptfMap.set(hourKey(ts), v);
        }

        // Merge
        const out: Row[] = [];
        for (const r of (cons.data ?? []) as any[]) {
          const ts = String(r.ts);
          const kwh = Number(r.cn) || 0;
          const gn = Number(r.gn) || 0;
          const gesKwh = gesHourlyMap.get(hourKey(ts)) || 0;

          const p = ptfMap.get(hourKey(ts));
          const ptf_tl_mwh = p != null ? p : null;

          const tl = ptf_tl_mwh != null ? (kwh * ptf_tl_mwh) / 1000.0 : null;
          const verisTl = ptf_tl_mwh != null ? (gn * ptf_tl_mwh) / 1000.0 : null;

          out.push({ ts, kwh, gn, gesKwh, ptf_tl_mwh, tl, verisTl });
        }

        setRows(out);
      } catch (e: any) {
        if (!cancel) {
          console.error("PTF detail error:", e);
          setErr(e?.message ?? "PTF detayı alınamadı");
          setRows([]);
        }
      } finally {
        if (!cancel) setLoading(false);
      }
    })();

    return () => {
      cancel = true;
    };
  }, [uid, sessionLoading, selectedSub, year, month]);

  const canPrev = month > 1;
  const canNext = month < 12;

  async function handleExportXlsx() {
    if (!selectedSub) return;

    try {
      setExporting(true);
      setExportErr(null);

      const excelRows = rows.map((r) => {
        const d = dayjsTR(r.ts);
        const base: Record<string, any> = {
          Tarih: d.format("DD.MM.YYYY"),
          Saat: d.format("HH:00"),
          "PTF (TL/MWh)":
            r.ptf_tl_mwh != null && Number.isFinite(Number(r.ptf_tl_mwh))
              ? Number(r.ptf_tl_mwh)
              : null,
          "Çekiş (kWh)": Number(r.kwh) || 0,
          "Veriş (kWh)": Number(r.gn) || 0,
        };
        if (hasGes) {
          base["GES Üretim (kWh)"] = Number(r.gesKwh) || 0;
        }
        base["Çekiş Maliyeti (TL)"] =
          r.tl != null && Number.isFinite(Number(r.tl)) ? Number(r.tl) : null;
        base["Veriş Geliri (Brüt TL)"] =
          r.verisTl != null && Number.isFinite(Number(r.verisTl)) ? Number(r.verisTl) : null;
        return base;
      });

      const meter = safeName(selectedMeterSerial ?? String(selectedSub));
      const fileName = `ptf_${meter}_${year}_${pad2(month)}.xlsx`;

      downloadXlsx({
        rows: excelRows,
        fileName,
        sheetName: "PTF",
      });
    } catch (e: any) {
      console.error("PTF export xlsx error:", e);
      setExportErr(e?.message ?? "Excel çıkartılamadı.");
    } finally {
      setExporting(false);
    }
  }

  return (
    <DashboardShell>
      {/* Header */}
      <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-neutral-900">PTF Detayı</h1>
          <p className="text-sm text-neutral-500">
            {selectedSub ? `${monthLabel} • seçili tesis (${selectedSubLabel})` : "Tesis seçin"}
          </p>
          {selectedSub && (
            <p className="mt-1 text-xs text-neutral-500">
              Seçili tesis:{" "}
              <span className="font-medium text-neutral-800">{selectedSubLabel}</span>
            </p>
          )}
        </div>

        <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center sm:justify-end md:w-auto">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-xs text-neutral-600">Tesis:</span>
            <select
              value={selectedSub ?? ""}
              onChange={(e) => {
                const v = e.target.value ? Number(e.target.value) : null;
                setSelectedSub(v);
                if (v != null) localStorage.setItem(LS_SUB_KEY, String(v));
              }}
              className="h-10 md:h-9 w-full sm:w-[420px] md:w-auto min-w-0 max-w-full rounded-lg border border-neutral-300 bg-white px-3 md:px-2 text-[16px] md:text-xs text-neutral-800 focus:outline-none focus:ring-1 focus:ring-[#0A66FF]"
            >
              {subs.length === 0 && <option value="">Tesis bulunamadı</option>}
              {subs.map((s) => {
                const serial = s.meterSerial ?? String(s.subscriptionSerNo);
                return (
                  <option key={s.subscriptionSerNo} value={s.subscriptionSerNo}>
                    {s.nickname ? `${serial} - ${s.nickname}` : serial}
                  </option>
                );
              })}
            </select>

            {subsLoading && <span className="text-[11px] text-neutral-500">Yükleniyor…</span>}

            <button
              onClick={() => navigate("/dashboard")}
              className="h-10 md:h-9 shrink-0 rounded-lg border border-neutral-300 bg-white px-3 text-xs text-neutral-700 hover:bg-neutral-50"
            >
              ← Panele dön
            </button>
          </div>
        </div>
      </div>

      {(subsErr || err || exportErr) && (
        <div className="mb-4 rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {subsErr && <>Tesisler: {subsErr}. </>}
          {err && <>PTF: {err}. </>}
          {exportErr && <>Excel: {exportErr}</>}
        </div>
      )}

      {/* Ay kontrol */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button
            disabled={!canPrev}
            onClick={() => canPrev && setMonth((m) => m - 1)}
            className="inline-flex h-9 items-center rounded-full border border-neutral-300 bg-white px-3 text-xs text-neutral-700 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-neutral-50"
          >
            ← Önceki ay
          </button>

          <div className="h-9 rounded-full border border-neutral-200 bg-white px-4 text-xs text-neutral-700 grid place-items-center">
            {monthLabel}
          </div>

          <button
            disabled={!canNext}
            onClick={() => canNext && setMonth((m) => m + 1)}
            className="inline-flex h-9 items-center rounded-full border border-neutral-300 bg-white px-3 text-xs text-neutral-700 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-neutral-50"
          >
            Sonraki ay →
          </button>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setYear((y) => y - 1)}
            className="inline-flex h-9 items-center rounded-full border border-neutral-300 bg-white px-3 text-xs text-neutral-700 hover:bg-neutral-50"
          >
            ← {year - 1}
          </button>
          <button
            onClick={() => setYear((y) => y + 1)}
            className="inline-flex h-9 items-center rounded-full border border-neutral-300 bg-white px-3 text-xs text-neutral-700 hover:bg-neutral-50"
          >
            {year + 1} →
          </button>
        </div>
      </div>

      {/* Üst özet (formül) */}
      <div className="mb-6 rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
        <div className="text-sm text-neutral-500 mb-2">Aylık Ortalama PTF </div>
        <div className="text-sm text-neutral-700">
        </div>

        <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
          <div className="rounded-xl border border-neutral-200 p-4">
            <div className="text-xs text-neutral-500">Toplam Çekiş</div>
            <div className="text-lg font-semibold text-neutral-900">{fmtInt(summary.totalKwh)} <span className="text-xs font-normal text-neutral-500">kWh</span></div>
          </div>
          <div className="rounded-xl border border-neutral-200 p-4">
            <div className="text-xs text-neutral-500">Toplam Veriş</div>
            <div className="text-lg font-semibold text-emerald-700">{fmtInt(summary.totalGn)} <span className="text-xs font-normal text-neutral-500">kWh</span></div>
          </div>
          {hasGes && (
            <div className="rounded-xl border border-neutral-200 p-4">
              <div className="text-xs text-neutral-500">Toplam GES Üretim</div>
              <div className="text-lg font-semibold text-emerald-700">{fmtInt(summary.totalGesKwh)} <span className="text-xs font-normal text-neutral-500">kWh</span></div>
            </div>
          )}
          <div className="rounded-xl border border-neutral-200 p-4">
            <div className="text-xs text-neutral-500">Çekiş Maliyeti</div>
            <div className="text-lg font-semibold text-red-600">{fmt2(summary.totalTl)} <span className="text-xs font-normal text-neutral-500">TL</span></div>
          </div>
          <div className="rounded-xl border border-neutral-200 p-4">
            <div className="text-xs text-neutral-500">Veriş Geliri (Brüt TL)</div>
            <div className="text-lg font-semibold text-emerald-700">{fmt2(summary.totalVerisTl)} <span className="text-xs font-normal text-neutral-500">TL</span></div>
          </div>
        </div>

        {summary.missingKwh > 0 && (
          <div className="mt-3 text-xs text-amber-700">
            Not: EPİAŞ PTF bulunamayan saatler var. Eksik kWh: {fmtInt(summary.missingKwh)}
          </div>
        )}
      </div>

      {/* Tablo */}
      <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
        <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <h2 className="text-sm font-semibold text-neutral-900">Saatlik PTF Hesabı</h2>
            {loading && <div className="text-xs text-neutral-500">Yükleniyor…</div>}
          </div>

          <button
            onClick={handleExportXlsx}
            disabled={exporting || rows.length === 0}
            className="h-9 rounded-lg border border-neutral-300 bg-white px-3 text-xs text-neutral-700 hover:bg-neutral-50 disabled:opacity-50"
          >
            {exporting ? "Çıkartılıyor…" : "Excel’e Çıkar (.xlsx)"}
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="py-2 pr-3 text-left text-xs font-medium text-neutral-500">Gün</th>
                <th className="py-2 pr-3 text-left text-xs font-medium text-neutral-500">Saat</th>
                <th className="py-2 pr-3 text-right text-xs font-medium text-neutral-500">
                  PTF (TL/MWh)
                </th>
                <th className="py-2 pr-3 text-right text-xs font-medium text-neutral-500">
                  ↓ Çekiş (kWh)
                </th>
                <th className="py-2 pr-3 text-right text-xs font-medium text-neutral-500">
                  ↑ Veriş (kWh)
                </th>
                {hasGes && (
                  <th className="py-2 pr-3 text-right text-xs font-medium text-neutral-500">
                    ☀ GES Üretim (kWh)
                  </th>
                )}
                <th className="py-2 pr-3 text-right text-xs font-medium text-neutral-500">
                  Çekiş Maliyeti (TL)
                </th>
                <th className="py-2 pr-3 text-right text-xs font-medium text-neutral-500">
                  Veriş Geliri (Brüt TL)
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={hasGes ? 8 : 7} className="py-4 text-sm text-neutral-500">
                    Veri yok.
                  </td>
                </tr>
              ) : (
                rows.map((r) => {
                  const d = dayjsTR(r.ts);
                  return (
                    <tr key={r.ts} className="border-b last:border-0 hover:bg-neutral-50/60">
                      <td className="py-2 pr-3">{d.format("DD.MM.YYYY")}</td>
                      <td className="py-2 pr-3">{d.format("HH:00")}</td>
                      <td className="py-2 pr-3 text-right">{fmt2(r.ptf_tl_mwh)}</td>
                      <td className="py-2 pr-3 text-right">{fmtInt(r.kwh)}</td>
                      <td className={`py-2 pr-3 text-right ${r.gn > 0 ? "text-emerald-700 bg-emerald-50/50" : ""}`}>
                        {r.gn > 0 ? fmtInt(r.gn) : "—"}
                      </td>
                      {hasGes && (
                        <td className={`py-2 pr-3 text-right ${r.gesKwh > 0 ? "text-emerald-700 bg-emerald-50/40" : ""}`}>
                          {r.gesKwh > 0 ? fmt2(r.gesKwh) : "—"}
                        </td>
                      )}
                      <td className={`py-2 pr-3 text-right ${r.tl != null && r.tl > 0 ? "text-red-600" : ""}`}>
                        {fmt2(r.tl)}
                      </td>
                      <td className={`py-2 pr-3 text-right ${r.verisTl != null && r.verisTl > 0 ? "text-emerald-700" : ""}`}>
                        {r.gn > 0 ? fmt2(r.verisTl) : "—"}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
            {rows.length > 0 && (
              <tfoot>
                <tr className="border-t-2 border-neutral-200 font-semibold">
                  <td className="py-2 pr-3" colSpan={2}>Toplam</td>
                  <td className="py-2 pr-3 text-right">—</td>
                  <td className="py-2 pr-3 text-right">{fmtInt(summary.totalKwh)}</td>
                  <td className="py-2 pr-3 text-right text-emerald-700">{fmtInt(summary.totalGn)}</td>
                  {hasGes && (
                    <td className="py-2 pr-3 text-right text-emerald-700">{fmt2(summary.totalGesKwh)}</td>
                  )}
                  <td className="py-2 pr-3 text-right text-red-600">{fmt2(summary.totalTl)}</td>
                  <td className="py-2 pr-3 text-right text-emerald-700">{fmt2(summary.totalVerisTl)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </DashboardShell>
  );
}
