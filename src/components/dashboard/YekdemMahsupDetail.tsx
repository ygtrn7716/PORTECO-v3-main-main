//src/components/dashboard/YekdemMahsupDetail.tsx
import { useEffect, useMemo, useState } from "react";
import { dayjsTR } from "@/lib/dayjs";
import { supabase } from "@/lib/supabase";
import { useSession } from "@/hooks/useSession";
import { useNavigate } from "react-router-dom";
import DashboardShell from "@/components/dashboard/DashboardShell";
import { calculateYekdemMahsup } from "@/components/utils/calculateInvoice";

type SubscriptionOption = {
  subscriptionSerNo: number;
  title: string | null;
};

const LS_SUB_KEY = "eco_selected_sub";

const fmtMoney2 = (n: number | null | undefined) =>
  n == null || !Number.isFinite(Number(n))
    ? "—"
    : Number(n).toLocaleString("tr-TR", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });

const fmtNum6 = (n: number | null | undefined) =>
  n == null || !Number.isFinite(Number(n))
    ? "—"
    : Number(n).toLocaleString("tr-TR", {
        minimumFractionDigits: 6,
        maximumFractionDigits: 6,
      });

const fmtKwh0 = (n: number | null | undefined) =>
  n == null || !Number.isFinite(Number(n))
    ? "—"
    : Number(n).toLocaleString("tr-TR", { maximumFractionDigits: 0 });

function isMissingColumnError(err: any, col: string) {
  const msg = String(err?.message ?? "");
  return msg.includes("does not exist") && msg.includes(col);
}

async function fetchSubYekdemForMahsup(params: {
  uid: string;
  sub: number;
  year: number;
  month: number;
}): Promise<{ yekdem_value: number | null; yekdem_final: number | null } | null> {
  const { uid, sub, year, month } = params;

  // 1) year/month
  const r1 = await supabase
    .from("subscription_yekdem")
    .select("yekdem_value, yekdem_final")
    .eq("user_id", uid)
    .eq("subscription_serno", sub)
    .eq("year", year)
    .eq("month", month)
    .maybeSingle();

  if (!r1.error) {
    if (!r1.data) return null;
    return {
      yekdem_value: r1.data.yekdem_value != null ? Number(r1.data.yekdem_value) : null,
      yekdem_final: r1.data.yekdem_final != null ? Number(r1.data.yekdem_final) : null,
    };
  }

  // 2) period_year/period_month
  if (isMissingColumnError(r1.error, "year") || isMissingColumnError(r1.error, "month")) {
    const r2 = await supabase
      .from("subscription_yekdem")
      .select("yekdem_value, yekdem_final")
      .eq("user_id", uid)
      .eq("subscription_serno", sub)
      .eq("period_year", year)
      .eq("period_month", month)
      .maybeSingle();

    if (r2.error) throw r2.error;
    if (!r2.data) return null;

    return {
      yekdem_value: r2.data.yekdem_value != null ? Number(r2.data.yekdem_value) : null,
      yekdem_final: r2.data.yekdem_final != null ? Number(r2.data.yekdem_final) : null,
    };
  }

  throw r1.error;
}

export default function YekdemMahsupDetail() {
  const navigate = useNavigate();
  const { session: authSession, loading: sessionLoading } = useSession();
  const uid = authSession?.user?.id ?? null;

  const [subs, setSubs] = useState<SubscriptionOption[]>([]);
  const [selectedSub, setSelectedSub] = useState<number | null>(() => {
    const raw = typeof window !== "undefined" ? localStorage.getItem(LS_SUB_KEY) : null;
    const n = raw ? Number(raw) : NaN;
    return Number.isFinite(n) ? n : null;
  });

  const [subsLoading, setSubsLoading] = useState(false);
  const [subsErr, setSubsErr] = useState<string | null>(null);

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [payload, setPayload] = useState<null | {
    billingLabel: string; // M
    mahsupMonthLabel: string; // M-1
    totalKwh: number;
    kbk: number;
    btvRate: number;
    vatRate: number;
    yekdemOld: number;
    yekdemNew: number;

    diffYekdem: number;
    deltaEnergy: number;
    subtotalWithoutVat: number;
    deltaTotal: number;
  }>(null);

  // 0) tesis listesi
  useEffect(() => {
    if (sessionLoading) return;
    if (!uid) return;

    let cancel = false;

    (async () => {
      try {
        setSubsLoading(true);
        setSubsErr(null);

        const { data, error } = await supabase
          .from("subscription_settings")
          .select("subscription_serno, title")
          .eq("user_id", uid)
          .order("subscription_serno", { ascending: true });

        if (cancel) return;
        if (error) throw error;

        let list: SubscriptionOption[] = [];
        if (data && data.length > 0) {
          list = data.map((r: any) => ({
            subscriptionSerNo: Number(r.subscription_serno),
            title: r.title ?? null,
          }));
        } else {
          const { data: osData, error: osErr } = await supabase
            .from("owner_subscriptions")
            .select("subscription_serno, title")
            .eq("user_id", uid)
            .order("subscription_serno", { ascending: true });

          if (cancel) return;
          if (osErr) throw osErr;

          list = (osData ?? []).map((r: any) => ({
            subscriptionSerNo: Number(r.subscription_serno),
            title: r.title ?? null,
          }));
        }

        setSubs(list);

        if (list.length > 0) {
          const ok = selectedSub != null && list.some((s) => s.subscriptionSerNo === selectedSub);
          const next = ok ? selectedSub! : list[0].subscriptionSerNo;
          setSelectedSub(next);
          localStorage.setItem(LS_SUB_KEY, String(next));
        } else {
          setSelectedSub(null);
          localStorage.removeItem(LS_SUB_KEY);
        }
      } catch (e: any) {
        if (!cancel) {
          console.error("subscription list (Mahsup) error:", e);
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

  const selectedSubLabel =
    subs.find((s) => s.subscriptionSerNo === selectedSub)?.title ??
    (selectedSub != null ? `Tesis ${selectedSub}` : "Tesis seçilmedi");

  // 1) mahsup hesabı
  useEffect(() => {
    if (sessionLoading) return;
    if (!uid || !selectedSub) return;

    let cancel = false;

    (async () => {
      try {
        setLoading(true);
        setErr(null);
        setPayload(null);

        // M = geçen ay faturası
        const billingMonth = dayjsTR().subtract(1, "month");
        // M-1 = mahsup ayı (tüketim + yekdem farkı buradan)
        const mahsupMonth = billingMonth.subtract(1, "month");

        const billingLabel = billingMonth.format("MMMM YYYY");
        const mahsupMonthLabel = mahsupMonth.format("MMMM YYYY");

        // settings -> kbk + tarife param
        const settingsRes = await supabase
          .from("subscription_settings")
          .select("kbk, terim, gerilim, tarife")
          .eq("user_id", uid)
          .eq("subscription_serno", selectedSub)
          .maybeSingle();

        if (settingsRes.error) throw settingsRes.error;
        if (!settingsRes.data) throw new Error("subscription_settings bulunamadı.");

        const kbk =
          settingsRes.data.kbk != null && Number.isFinite(Number(settingsRes.data.kbk))
            ? Number(settingsRes.data.kbk)
            : 1;

        const terim = settingsRes.data.terim ?? null;
        const gerilim = settingsRes.data.gerilim ?? null;
        const tarife = settingsRes.data.tarife ?? null;

        if (!terim || !gerilim || !tarife) {
          throw new Error("Tesis ayarları eksik: terim/gerilim/tarife (subscription_settings).");
        }

        // resmi tarifeden BTV/KDV
        const tariffRes = await supabase
          .from("distribution_tariff_official")
          .select("kdv, btv")
          .eq("terim", terim)
          .eq("gerilim", gerilim)
          .eq("tarife", tarife)
          .maybeSingle();

        if (tariffRes.error) throw tariffRes.error;
        if (!tariffRes.data) throw new Error("Uygun dağıtım tarifesi bulunamadı.");

        const btvRate = tariffRes.data.btv != null ? Number(tariffRes.data.btv) / 100 : 0;
        const vatRate = tariffRes.data.kdv != null ? Number(tariffRes.data.kdv) / 100 : 0;

        // M-1 tüketimi (kWh)
        const prevStart = mahsupMonth.startOf("month");
        const prevEndExclusive = prevStart.clone().add(1, "month");

        let totalKwh = 0;

        const dailyPrev = await supabase
          .from("consumption_daily")
          .select("day, kwh_in")
          .eq("user_id", uid)
          .eq("subscription_serno", selectedSub)
          .gte("day", prevStart.format("YYYY-MM-DD"))
          .lt("day", prevEndExclusive.format("YYYY-MM-DD"));

        if (!dailyPrev.error && dailyPrev.data?.length) {
          totalKwh = dailyPrev.data.reduce(
            (sum: number, row: any) => sum + (Number(row.kwh_in) || 0),
            0
          );
        } else {
          const hourlyPrev = await supabase
            .from("consumption_hourly")
            .select("ts, cn")
            .eq("user_id", uid)
            .eq("subscription_serno", selectedSub)
            .gte("ts", prevStart.toDate().toISOString())
            .lt("ts", prevEndExclusive.toDate().toISOString());

          if (hourlyPrev.error) throw hourlyPrev.error;

          totalKwh = (hourlyPrev.data ?? []).reduce(
            (sum: number, row: any) => sum + (Number(row.cn) || 0),
            0
          );
        }

        if (!(totalKwh > 0)) {
          throw new Error(`${mahsupMonthLabel} dönemi tüketim verisi bulunamadı (0 kWh).`);
        }

        // M-1 için yekdem_value + yekdem_final
        const yRow = await fetchSubYekdemForMahsup({
          uid,
          sub: selectedSub,
          year: mahsupMonth.year(),
          month: mahsupMonth.month() + 1,
        });

        if (!yRow || yRow.yekdem_value == null || yRow.yekdem_final == null) {
          throw new Error(
            `${mahsupMonthLabel} için yekdem_value / yekdem_final eksik. (Mahsup hesaplanamaz)`
          );
        }

        const yekdemOld = Number(yRow.yekdem_value);
        const yekdemNew = Number(yRow.yekdem_final);

        // Hesap (aynı util)
        const deltaTotal = calculateYekdemMahsup({
          totalKwh,
          kbk,
          btvRate,
          vatRate,
          yekdemOld,
          yekdemNew,
        });

        // İç adımlar (ekranda göstermek için)
        const diffYekdem = yekdemNew - yekdemOld; // TL/kWh
        const deltaEnergy = diffYekdem * kbk * totalKwh; // TL (KDV öncesi)
        const subtotalWithoutVat = deltaEnergy * (1 + btvRate); // BTV dahil
        // deltaTotal = subtotalWithoutVat * (1 + vatRate)

        if (!cancel) {
          setPayload({
            billingLabel,
            mahsupMonthLabel,
            totalKwh,
            kbk,
            btvRate,
            vatRate,
            yekdemOld,
            yekdemNew,
            diffYekdem,
            deltaEnergy,
            subtotalWithoutVat,
            deltaTotal,
          });
        }
      } catch (e: any) {
        if (!cancel) {
          console.error("YekdemMahsupDetail error:", e);
          setErr(e?.message ?? "YEKDEM mahsup detayı yüklenemedi.");
          setPayload(null);
        }
      } finally {
        if (!cancel) setLoading(false);
      }
    })();

    return () => {
      cancel = true;
    };
  }, [uid, sessionLoading, selectedSub]);

const mahsupView = useMemo(() => {
  if (!payload) return null;
  const v = payload.deltaTotal;
  const sign = v > 0 ? "+" : "-";
  const cls = v > 0 ? "text-red-600" : "text-emerald-600";
  return { cls, abs: Math.abs(v) };
}, [payload]);


  return (
    <DashboardShell>
      <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-neutral-900">YEKDEM Mahsup Detayı</h1>
          <p className="text-sm text-neutral-500">
            {payload
              ? `${payload.billingLabel} faturasında kullanılan mahsup hesabı (${payload.mahsupMonthLabel} verileri)`
              : "Mahsup hesabı detayı"}
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
              {subs.map((s) => (
                <option key={s.subscriptionSerNo} value={s.subscriptionSerNo}>
                  {s.title ?? `Tesis ${s.subscriptionSerNo}`}
                </option>
              ))}
            </select>

            {subsLoading && <span className="text-[11px] text-neutral-500">Yükleniyor…</span>}

            <button
              onClick={() => navigate(-1)}
              className="h-10 md:h-9 shrink-0 rounded-lg border border-neutral-300 bg-white px-3 text-[14px] md:text-xs text-neutral-700 hover:bg-neutral-50"
            >
              ← Panele dön
            </button>
          </div>
        </div>
      </div>

      {(subsErr || err) && (
        <div className="mb-4 rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {subsErr && <>Tesisler: {subsErr}. </>}
          {err && <>Mahsup: {err}</>}
        </div>
      )}

      {loading && <div className="mb-4 text-sm text-neutral-500">Yükleniyor…</div>}

      {!loading && payload && (
        <>
          <div className="mb-6 grid gap-4 md:grid-cols-3">
            <div className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
              <p className="text-xs text-neutral-500 mb-1">M-1 Tüketim Toplamı</p>
              <p className="text-xl font-semibold text-neutral-900">{fmtKwh0(payload.totalKwh)} kWh</p>
              <p className="mt-1 text-xs text-neutral-500">{payload.mahsupMonthLabel}</p>
            </div>

            <div className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
              <p className="text-xs text-neutral-500 mb-1">YEKDEM Farkı (Yeni - Eski)</p>
              <p className="text-xl font-semibold text-neutral-900">
                {fmtNum6(payload.diffYekdem)} TL/kWh
              </p>
              <p className="mt-1 text-xs text-neutral-500">
                eski: {fmtNum6(payload.yekdemOld)} • yeni: {fmtNum6(payload.yekdemNew)}
              </p>
            </div>

            <div className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
              <p className="text-xs text-neutral-500 mb-1">Mahsup Tutarı (KDV dahil)</p>
<p className={"text-xl font-semibold " + (mahsupView?.cls ?? "text-neutral-900")}>
  {mahsupView ? `${fmtMoney2(mahsupView.abs)} TL` : "—"}
</p>

              <p className="mt-1 text-xs text-neutral-500">
                KBK: {fmtNum6(payload.kbk)} • BTV: %{(payload.btvRate * 100).toFixed(2)} • KDV: %
                {(payload.vatRate * 100).toFixed(2)}
              </p>
            </div>
          </div>

          <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
            <h2 className="text-sm font-semibold text-neutral-900 mb-3">Hesap Adımları</h2>

            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs text-neutral-500">
                    <th className="py-2 pr-4">Adım</th>
                    <th className="py-2 pr-4">Formül</th>
                    <th className="py-2 pr-4 text-right">Sonuç</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b border-neutral-100">
                    <td className="py-2 pr-4">1) YEKDEM Farkı</td>
                    <td className="py-2 pr-4 text-neutral-600">
                     Gerçekleşen - Tedarikçi Tahmin Yekdem
                    </td>
                    <td className="py-2 pr-4 text-right">{fmtNum6(payload.diffYekdem)} TL/kWh</td>
                  </tr>

                  <tr className="border-b border-neutral-100">
                    <td className="py-2 pr-4">2) Enerji Farkı</td>
                    <td className="py-2 pr-4 text-neutral-600">
                     Yek Farkı x KBK x Toplam Tüketim
                    </td>
                    <td className="py-2 pr-4 text-right">{fmtMoney2(payload.deltaEnergy)} TL</td>
                  </tr>

                  <tr className="border-b border-neutral-100">
                    <td className="py-2 pr-4">3) BTV Dahil</td>
                    <td className="py-2 pr-4 text-neutral-600">
                      += %1 BTV 
                    </td>
                    <td className="py-2 pr-4 text-right">{fmtMoney2(payload.subtotalWithoutVat)} TL</td>
                  </tr>

                  <tr>
                    <td className="py-2 pr-4 font-semibold">4) KDV Dahil (Final)</td>
                    <td className="py-2 pr-4 text-neutral-600 font-semibold">
                      += KDV
                    </td>
                  <td className="py-2 pr-4 text-right font-semibold">
  {mahsupView ? `${fmtMoney2(mahsupView.abs)} TL` : "—"}
</td>

                  </tr>
                </tbody>
              </table>
            </div>

            <p className="mt-3 text-xs text-neutral-500">
              Not: Pozitif mahsup (deltaTotal &gt; 0) kullanıcı aleyhine olduğu için “-” (kırmızı) gösterilir.
              Negatif mahsup kullanıcı lehine olduğu için “+” (yeşil) gösterilir.
            </p>
          </div>
        </>
      )}
    </DashboardShell>
  );
}
