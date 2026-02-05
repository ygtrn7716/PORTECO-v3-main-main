// src/pages/Dashboard.tsx
import { useEffect, useMemo, useState, useRef, useCallback } from "react";
import { dayjsTR, TR_TZ } from "@/lib/dayjs";
import { useSession } from "@/hooks/useSession";
import { supabase } from "@/lib/supabase";
import { Link, useNavigate } from "react-router-dom";
import { DASH_CARDS } from "@/content/dashboardCards";
import ReactiveSection from "@/components/dashboard/ReactiveSection";
import DashboardShell from "@/components/dashboard/DashboardShell";
import { getInvoiceSnapshot } from "@/components/utils/invoiceSnapshots";

import {
  calculateInvoice,
  calculateYekdemMahsup,
  type TariffType,
} from "@/components/utils/calculateInvoice";

type ImgSpec = {
  src: string;
  x: string | number;
  y: string | number;
  width: number;
  height: number;
  rotate?: number;
};

type SubscriptionOption = {
  subscriptionSerNo: number;
  meterSerial: string | null; // owner_subscriptions.meter_serial
  title: string | null; // subscription_settings.title (fallback: owner_subscriptions.title)
  nickname: string | null; // subscription_settings.nickname
};

// localStorage: InvoiceDetail ile aynı olsun
const LS_SUB_KEY = "eco_selected_sub";

// PTF/YEKDEM gibi 6 haneli değerler
const fmtPTF6 = (n: number | null | undefined) =>
  n == null || !Number.isFinite(Number(n))
    ? "—"
    : Number(n).toLocaleString("tr-TR", {
        minimumFractionDigits: 6,
        maximumFractionDigits: 6,
      });

// TL tutarları için 2 hane
const fmtMoney2 = (n: number | null | undefined) =>
  n == null || !Number.isFinite(Number(n))
    ? "—"
    : Number(n).toLocaleString("tr-TR", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });

// terim → TariffType
function mapTermToTariffType(term: string | null | undefined): TariffType {
  return term === "cift_terim" ? "dual" : "single";
}

function isMissingColumnError(err: any, col: string) {
  const msg = String(err?.message ?? "");
  return msg.includes("does not exist") && msg.includes(col);
}

/**
 * subscription_yekdem: bazı ortamlarda (year,month), bazılarında (period_year,period_month) var.
 * Buradan güvenli şekilde okuyalım.
 */
async function fetchSubscriptionYekdem(params: {
  uid: string;
  sub: number;
  year: number;
  month: number; // 1-12
}): Promise<{ yekdem_value: number | null; yekdem_final: number | null } | null> {
  const { uid, sub, year, month } = params;

  // 1) period_year/period_month
  const r1 = await supabase
    .from("subscription_yekdem")
    .select("yekdem_value, yekdem_final")
    .eq("user_id", uid)
    .eq("subscription_serno", sub)
    .eq("period_year", year)
    .eq("period_month", month)
    .maybeSingle();

  if (!r1.error) {
    if (!r1.data) return null;
    return {
      yekdem_value:
        r1.data.yekdem_value != null ? Number(r1.data.yekdem_value) : null,
      yekdem_final:
        r1.data.yekdem_final != null ? Number(r1.data.yekdem_final) : null,
    };
  }

  // 2) year/month
  if (
    isMissingColumnError(r1.error, "period_year") ||
    isMissingColumnError(r1.error, "period_month")
  ) {
    const r2 = await supabase
      .from("subscription_yekdem")
      .select("yekdem_value, yekdem_final")
      .eq("user_id", uid)
      .eq("subscription_serno", sub)
      .eq("year", year)
      .eq("month", month)
      .maybeSingle();

    if (r2.error) throw r2.error;
    if (!r2.data) return null;

    return {
      yekdem_value:
        r2.data.yekdem_value != null ? Number(r2.data.yekdem_value) : null,
      yekdem_final:
        r2.data.yekdem_final != null ? Number(r2.data.yekdem_final) : null,
    };
  }

  throw r1.error;
}

async function fetchSubscriptionDigerDegerler(params: {
  uid: string;
  sub: number;
  year: number;
  month: number; // 1-12
}): Promise<number> {
  const { uid, sub, year, month } = params;

  // 1) period_year/period_month
  const r1 = await supabase
    .from("subscription_yekdem")
    .select("diger_degerler")
    .eq("user_id", uid)
    .eq("subscription_serno", sub)
    .eq("period_year", year)
    .eq("period_month", month)
    .maybeSingle();

  if (!r1.error) return Number(r1.data?.diger_degerler ?? 0) || 0;

  // 2) year/month fallback
  if (
    isMissingColumnError(r1.error, "period_year") ||
    isMissingColumnError(r1.error, "period_month")
  ) {
    const r2 = await supabase
      .from("subscription_yekdem")
      .select("diger_degerler")
      .eq("user_id", uid)
      .eq("subscription_serno", sub)
      .eq("year", year)
      .eq("month", month)
      .maybeSingle();

    if (r2.error) throw r2.error;
    return Number(r2.data?.diger_degerler ?? 0) || 0;
  }

  throw r1.error;
}

// ✅ StatCard: 3D tilt + shimmer + smooth hover animations
function StatCard({
  title,
  value,
  sub,
  onClick,
  img,
  valueClassName,
  badgeText,
  badgeClassName,
  totalLine,
}: {
  title: string;
  value: string;
  sub?: string;
  onClick?: () => void;
  img?: ImgSpec;
  valueClassName?: string;
  badgeText?: string;
  badgeClassName?: string;
  totalLine?: string;
}) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [tilt, setTilt] = useState({ x: 0, y: 0 });
  const [isHovered, setIsHovered] = useState(false);

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const card = cardRef.current;
    if (!card) return;
    const rect = card.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;
    const rotateX = ((y - centerY) / centerY) * -8;
    const rotateY = ((x - centerX) / centerX) * 8;
    setTilt({ x: rotateX, y: rotateY });
  }, []);

  const handleMouseLeave = useCallback(() => {
    setTilt({ x: 0, y: 0 });
    setIsHovered(false);
  }, []);

  return (
    <div
      ref={cardRef}
      onClick={onClick}
      onMouseMove={handleMouseMove}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={handleMouseLeave}
      className="stat-card group relative overflow-hidden w-full h-[160px] rounded-2xl border border-neutral-200/80 bg-white p-5 cursor-pointer"
      style={{
        transform: isHovered
          ? `perspective(600px) rotateX(${tilt.x}deg) rotateY(${tilt.y}deg) scale3d(1.02, 1.02, 1.02)`
          : "perspective(600px) rotateX(0deg) rotateY(0deg) scale3d(1, 1, 1)",
        transition: "transform 0.2s ease-out, box-shadow 0.3s ease",
        boxShadow: isHovered
          ? "0 20px 40px -12px rgba(10, 102, 255, 0.15), 0 0 0 1px rgba(10, 102, 255, 0.08)"
          : "0 1px 3px 0 rgba(0,0,0,0.06)",
      }}
    >
      {/* Shimmer overlay */}
      <div
        className="absolute inset-0 z-20 pointer-events-none opacity-0 group-hover:opacity-100"
        style={{
          background: "linear-gradient(105deg, transparent 40%, rgba(255,255,255,0.5) 45%, rgba(255,255,255,0.8) 50%, rgba(255,255,255,0.5) 55%, transparent 60%)",
          backgroundSize: "200% 100%",
          transition: "opacity 0.3s ease",
          animation: isHovered ? "shimmer 1.5s ease-in-out infinite" : "none",
        }}
      />

      {/* Bottom gradient glow on hover */}
      <div
        className="absolute bottom-0 left-0 right-0 h-[60%] z-[1] pointer-events-none transition-opacity duration-500"
        style={{ opacity: isHovered ? 1 : 0 }}
      >
        <div className="w-full h-full bg-gradient-to-t from-[#0A66FF]/[0.04] to-transparent" />
      </div>

      {img && (
        <img
          src={img.src}
          alt=""
          aria-hidden="true"
          className="absolute top-0 left-0 select-none pointer-events-none transition-transform duration-500 ease-out group-hover:scale-110"
          style={{
            width: `${img.width}px`,
            height: `${img.height}px`,
            transform: `translate(${img.x}px, ${img.y}px) rotate(${
              img.rotate ?? 0
            }deg)`,
          }}
        />
      )}

      <div className="relative z-10 flex items-start justify-between h-full">
        <div>
          <h3 className="text-sm text-neutral-500 transition-colors duration-300 group-hover:text-neutral-700">{title}</h3>
          <div
            className={
              "mt-1 text-2xl font-semibold transition-transform duration-300 group-hover:translate-x-1 " +
              (valueClassName ?? "text-neutral-900")
            }
          >
            {value}
          </div>
          {sub && <p className="mt-1 text-xs text-neutral-500 transition-colors duration-300 group-hover:text-neutral-600">{sub}</p>}
          {totalLine && (
            <p className="mt-1.5 flex items-center gap-1.5 text-[11px] text-[#0A66FF]/80 font-medium">
              <span className="inline-block h-1 w-1 rounded-full bg-[#0A66FF]/50" />
              {totalLine}
            </p>
          )}
        </div>

        <div
          className={
            "shrink-0 rounded-xl border px-2 py-1 text-[11px] font-medium transition-all duration-300 group-hover:scale-105 " +
            (badgeClassName ?? "border-neutral-200 text-neutral-500")
          }
        >
          {badgeText ?? "Özet"}
        </div>
      </div>

      <div className="absolute bottom-4 right-4 translate-y-3 opacity-0 transition-all duration-300 ease-out group-hover:translate-y-0 group-hover:opacity-100 z-10">
        <span className="rounded-lg bg-[#0A66FF] px-3 py-1.5 text-xs font-medium text-white shadow-lg shadow-[#0A66FF]/25">
          Detay →
        </span>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const { session: authSession, loading: sessionLoading } = useSession();
  const navigate = useNavigate();
  const uid = authSession?.user?.id ?? null;

  // 0) Tesis listesi + seçili tesis
  const [subs, setSubs] = useState<SubscriptionOption[]>([]);
  const [selectedSub, setSelectedSub] = useState<number | null>(() => {
    const raw =
      typeof window !== "undefined" ? localStorage.getItem(LS_SUB_KEY) : null;
    const n = raw ? Number(raw) : NaN;
    return Number.isFinite(n) ? n : null;
  });

  const subLabel = (s: SubscriptionOption) => {
    const tesisNo = (s.meterSerial ?? `Tesis ${s.subscriptionSerNo}`).trim();
    const nickEffective = (s.nickname ?? s.title ?? "").trim();
    return nickEffective ? `${tesisNo} - ${nickEffective}` : tesisNo;
  };

  const [subsLoading, setSubsLoading] = useState(false);
  const [subsErr, setSubsErr] = useState<string | null>(null);

  // 1) Geçen ay toplam tüketim (kWh) - seçili tesis
  const [prevMonthKwh, setPrevMonthKwh] = useState<number | null>(null);
  const [prevLoading, setPrevLoading] = useState(false);
  const [prevErr, setPrevErr] = useState<string | null>(null);

  // ✅ reaktif toplamlar (kVArh)
  const [prevMonthRi, setPrevMonthRi] = useState<number | null>(null);
  const [prevMonthRc, setPrevMonthRc] = useState<number | null>(null);

  // 2) Geçen ay ortalama PTF (TL/kWh)
  const [monthlyPTF, setMonthlyPTF] = useState<number | null>(null);
  const [ptfLoading, setPtfLoading] = useState(false);
  const [ptfErr, setPtfErr] = useState<string | null>(null);

  // 3) Geçen ay YEKDEM (TL/kWh)
  const [monthlyYekdem, setMonthlyYekdem] = useState<number | null>(null);
  const [yekdemMode, setYekdemMode] = useState<"official" | "custom" | null>(
    null
  );
  const [yekdemLoading, setYekdemLoading] = useState(false);
  const [yekdemErr, setYekdemErr] = useState<string | null>(null);

  // 4) KBK
  const [monthlyKbk, setMonthlyKbk] = useState<number | null>(null);
  const [kbkLoading, setKbkLoading] = useState(false);
  const [kbkErr, setKbkErr] = useState<string | null>(null);

  // 5) Geçen ay fatura toplamı (mahsup dahil)
  const [invoiceTotal, setInvoiceTotal] = useState<number | null>(null);
  const [invoiceLoading, setInvoiceLoading] = useState(false);
  const [invoiceErr, setInvoiceErr] = useState<string | null>(null);

  // ✅ YEKDEM mahsup (dashboard kartı için)
  const [yekdemMahsup, setYekdemMahsup] = useState<number | null>(null);
  const [hasYekdemMahsup, setHasYekdemMahsup] = useState(false);
  const [yekdemMahsupLabel, setYekdemMahsupLabel] = useState<string>("");

  // ✅ Tüm tesislerin toplamları (birden fazla tesis varsa gösterilir)
  const [allSubsTotalKwh, setAllSubsTotalKwh] = useState<number | null>(null);
  const [allSubsTotalInvoice, setAllSubsTotalInvoice] = useState<number | null>(null);
  const [allSubsTotalMahsup, setAllSubsTotalMahsup] = useState<number | null>(null);

  // ---------------------------
  // 0) Tesisleri çek (dashboard label: meter_serial - nickname/title)
  // ---------------------------
  useEffect(() => {
    if (sessionLoading) return;
    if (!uid) return;

    let cancel = false;

    (async () => {
      try {
        setSubsLoading(true);
        setSubsErr(null);

        const { data: osData, error: osErr } = await supabase
          .from("owner_subscriptions")
          .select("subscription_serno, meter_serial, title")
          .eq("user_id", uid)
          .order("subscription_serno", { ascending: true });

        if (cancel) return;
        if (osErr) throw osErr;

        let list: SubscriptionOption[] = [];

        if (osData && osData.length > 0) {
          const sernos = osData
            .map((r: any) => Number(r.subscription_serno))
            .filter((n: any) => Number.isFinite(n));

          let ssMap = new Map<
            number,
            { title: string | null; nickname: string | null }
          >();

          if (sernos.length > 0) {
            const { data: ssData, error: ssErr } = await supabase
              .from("subscription_settings")
              .select("subscription_serno, title, nickname")
              .eq("user_id", uid)
              .in("subscription_serno", sernos);

            if (!cancel && ssErr) {
              // settings yoksa bile dashboard çalışsın
              console.warn("subscription_settings load warn:", ssErr);
            }

            for (const r of (ssData ?? []) as any[]) {
              const k = Number(r.subscription_serno);
              if (Number.isFinite(k)) {
                ssMap.set(k, {
                  title: r.title ?? null,
                  nickname: r.nickname ?? null,
                });
              }
            }
          }

          list = (osData ?? []).map((r: any) => {
            const serno = Number(r.subscription_serno);
            const ss = ssMap.get(serno);

            return {
              subscriptionSerNo: serno,
              meterSerial: r.meter_serial ?? null,
              title: ss?.title ?? r.title ?? null,
              nickname: ss?.nickname ?? null,
            };
          });
        } else {
          // fallback: subscription_settings
          const { data: ssData, error: ssErr } = await supabase
            .from("subscription_settings")
            .select("subscription_serno, title, nickname")
            .eq("user_id", uid)
            .order("subscription_serno", { ascending: true });

          if (cancel) return;
          if (ssErr) throw ssErr;

          list = (ssData ?? []).map((r: any) => ({
            subscriptionSerNo: Number(r.subscription_serno),
            meterSerial: null,
            title: r.title ?? null,
            nickname: r.nickname ?? null,
          }));
        }

        setSubs(list);

        if (list.length > 0) {
          const ok =
            selectedSub != null &&
            list.some((s) => s.subscriptionSerNo === selectedSub);

          const next = ok ? selectedSub! : list[0].subscriptionSerNo;

          setSelectedSub(next);
          localStorage.setItem(LS_SUB_KEY, String(next));
        } else {
          setSelectedSub(null);
          localStorage.removeItem(LS_SUB_KEY);
        }
      } catch (e: any) {
        if (!cancel) {
          console.error("subscription list error:", e);
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

  // ---------------------------
  // 1) Geçen ay toplam tüketim + ri/rc (seçili tesis)
  // ---------------------------
  useEffect(() => {
    if (sessionLoading) return;
    if (!uid || !selectedSub) return;

    let cancel = false;

    (async () => {
      try {
        setPrevLoading(true);
        setPrevErr(null);

        const start = dayjsTR().subtract(1, "month").startOf("month");
        const end = dayjsTR().startOf("month");

        const hourly = await supabase
          .from("consumption_hourly")
          .select("ts, cn, ri, rc")
          .eq("user_id", uid)
          .eq("subscription_serno", selectedSub)
          .gte("ts", start.toDate().toISOString())
          .lt("ts", end.toDate().toISOString());

        if (cancel) return;
        if (hourly.error) throw hourly.error;

        let sumCn = 0;
        let sumRi = 0;
        let sumRc = 0;

        for (const r of (hourly.data ?? []) as any[]) {
          sumCn += Number(r.cn) || 0;
          sumRi += Number(r.ri) || 0;
          sumRc += Number(r.rc) || 0;
        }

        setPrevMonthKwh(sumCn);
        setPrevMonthRi(sumRi);
        setPrevMonthRc(sumRc);
      } catch (e: any) {
        if (!cancel) {
          console.error("prev month kWh error:", e);
          setPrevErr(e?.message ?? "Geçen ay tüketimi getirilemedi");
          setPrevMonthKwh(null);
          setPrevMonthRi(null);
          setPrevMonthRc(null);
        }
      } finally {
        if (!cancel) setPrevLoading(false);
      }
    })();

    return () => {
      cancel = true;
    };
  }, [uid, sessionLoading, selectedSub]);

  // ---------------------------
  // 2) PTF (seçili tesis bazlı)
  // ---------------------------
  useEffect(() => {
    if (sessionLoading) return;
    if (!uid || !selectedSub) return;

    let cancel = false;

    (async () => {
      try {
        setPtfLoading(true);
        setPtfErr(null);

        const { data, error } = await supabase.rpc("monthly_ptf_prev_sub", {
          p_tz: TR_TZ,
          p_subscription_serno: selectedSub,
        });

        if (cancel) return;
        if (error) throw error;

        const row = data?.[0];
        const val =
          row && row.ptf_tl_per_kwh != null ? Number(row.ptf_tl_per_kwh) : null;

        setMonthlyPTF(Number.isFinite(val as any) ? val : null);
      } catch (e: any) {
        if (!cancel) {
          console.error("monthly_ptf_prev_sub error:", e);
          setPtfErr(e?.message ?? "PTF getirilemedi");
          setMonthlyPTF(null);
        }
      } finally {
        if (!cancel) setPtfLoading(false);
      }
    })();

    return () => {
      cancel = true;
    };
  }, [uid, sessionLoading, selectedSub]);

  // ---------------------------
  // 3) YEKDEM (seçili tesis -> yoksa resmi)
  // ---------------------------
  useEffect(() => {
    if (sessionLoading) return;
    if (!uid || !selectedSub) return;

    let cancel = false;

    (async () => {
      try {
        setYekdemLoading(true);
        setYekdemErr(null);

        const prev = dayjsTR().subtract(1, "month");
        const periodYear = prev.year();
        const periodMonth = prev.month() + 1;

        // önce tesis özel
        const subYek = await fetchSubscriptionYekdem({
          uid,
          sub: selectedSub,
          year: periodYear,
          month: periodMonth,
        });

        if (cancel) return;

        if (
          subYek &&
          (subYek.yekdem_value != null || subYek.yekdem_final != null)
        ) {
          const valRaw = subYek.yekdem_value ?? subYek.yekdem_final ?? null;
          const val = valRaw != null ? Number(valRaw) : null;

          setMonthlyYekdem(Number.isFinite(val as any) ? val : null);
          setYekdemMode("custom");
          return;
        }

        // fallback: resmi
        const { data: offRow, error: offErr } = await supabase
          .from("yekdem_official")
          .select("yekdem_value, yekdem_tl_per_kwh")
          .eq("year", periodYear)
          .eq("month", periodMonth)
          .maybeSingle();

        if (cancel) return;
        if (offErr) throw offErr;

        let officialVal: number | null = null;
        if (offRow) {
          if (offRow.yekdem_value != null)
            officialVal = Number(offRow.yekdem_value);
          else if (offRow.yekdem_tl_per_kwh != null)
            officialVal = Number(offRow.yekdem_tl_per_kwh);
        }

        setMonthlyYekdem(Number.isFinite(officialVal as any) ? officialVal : null);
        setYekdemMode("official");
      } catch (e: any) {
        if (!cancel) {
          console.error("YEKDEM error:", e);
          setYekdemErr(e?.message ?? "YEKDEM getirilemedi");
          setMonthlyYekdem(null);
          setYekdemMode(null);
        }
      } finally {
        if (!cancel) setYekdemLoading(false);
      }
    })();

    return () => {
      cancel = true;
    };
  }, [uid, sessionLoading, selectedSub]);

  // ---------------------------
  // 4) KBK (sadece subscription_settings)
  // ---------------------------
  useEffect(() => {
    if (sessionLoading) return;
    if (!uid || !selectedSub) return;

    let cancel = false;

    (async () => {
      try {
        setKbkLoading(true);
        setKbkErr(null);

        const { data, error } = await supabase
          .from("subscription_settings")
          .select("kbk")
          .eq("user_id", uid)
          .eq("subscription_serno", selectedSub)
          .maybeSingle();

        if (cancel) return;
        if (error) throw error;

        const val = data?.kbk != null ? Number(data.kbk) : null;
        setMonthlyKbk(Number.isFinite(val as any) ? val : null);
      } catch (e: any) {
        if (!cancel) {
          console.error("KBK load error:", e);
          setKbkErr(e?.message ?? "KBK getirilemedi");
          setMonthlyKbk(null);
        }
      } finally {
        if (!cancel) setKbkLoading(false);
      }
    })();

    return () => {
      cancel = true;
    };
  }, [uid, sessionLoading, selectedSub]);

  // ---------------------------
  // 5) Fatura toplamı (mahsup dahil) + mahsup hesapla
  // ---------------------------
  useEffect(() => {
    if (sessionLoading) return;
    if (!uid || !selectedSub) return;

    if (
      prevMonthKwh == null ||
      monthlyPTF == null ||
      monthlyYekdem == null ||
      monthlyKbk == null
    ) {
      setInvoiceTotal(null);
      setYekdemMahsup(null);
      setHasYekdemMahsup(false);
      return;
    }

    let cancel = false;

    (async () => {
      try {
        setInvoiceLoading(true);
        setInvoiceErr(null);
        const prev = dayjsTR().subtract(1, "month");
        const periodYear = prev.year();
        const periodMonth = prev.month() + 1;

        // ✅ 5.0) önce snapshot var mı bak
        const snap = await supabase
          .from("invoice_snapshots")
          .select("total_with_mahsup, has_yekdem_mahsup, yekdem_mahsup")
          .eq("user_id", uid)
          .eq("subscription_serno", selectedSub)
          .eq("period_year", periodYear)
          .eq("period_month", periodMonth)
          .eq("invoice_type", "billed")
          .maybeSingle();

        if (cancel) return;

        if (!snap.error && snap.data?.total_with_mahsup != null) {
          setInvoiceTotal(Number(snap.data.total_with_mahsup));
          setHasYekdemMahsup(!!snap.data.has_yekdem_mahsup);
          setYekdemMahsup(
            snap.data.yekdem_mahsup != null ? Number(snap.data.yekdem_mahsup) : null
          );
          return; // ✅ snapshot varsa hesaplamaya devam etme
        }

        const REACTIVE_LIMIT_RI = 20;
        const REACTIVE_LIMIT_RC = 15;

        // 5.1) settings
        const { data: settings, error: settingsErr } = await supabase
          .from("subscription_settings")
          .select("terim, gerilim, tarife, guc_bedel_limit, trafo_degeri, btv_enabled")
          .eq("user_id", uid)
          .eq("subscription_serno", selectedSub)
          .maybeSingle();

        if (cancel) return;
        if (settingsErr) throw settingsErr;
        if (!settings) {
          setInvoiceTotal(null);
          setYekdemMahsup(null);
          setHasYekdemMahsup(false);
          return;
        }

        const terim = settings.terim ?? null;
        const gerilim = settings.gerilim ?? null;
        const tarife = settings.tarife ?? null;

        const btvEnabled = settings.btv_enabled ?? true;

        const trafoDegeri =
          settings.trafo_degeri != null && Number.isFinite(Number(settings.trafo_degeri))
            ? Number(settings.trafo_degeri)
            : 0;

        const gucLimit =
          settings.guc_bedel_limit != null ? Number(settings.guc_bedel_limit) : 0;

        if (!terim || !gerilim || !tarife) {
          setInvoiceTotal(null);
          setYekdemMahsup(null);
          setHasYekdemMahsup(false);
          return;
        }

        // 5.2) tariff (+ reaktif_bedel)
        const { data: tariffRow, error: tariffErr } = await supabase
          .from("distribution_tariff_official")
          .select("dagitim_bedeli, guc_bedeli, guc_bedeli_asim, kdv, btv, reaktif_bedel")
          .eq("terim", terim)
          .eq("gerilim", gerilim)
          .eq("tarife", tarife)
          .maybeSingle();

        if (cancel) return;
        if (tariffErr) throw tariffErr;
        if (!tariffRow) {
          setInvoiceTotal(null);
          setYekdemMahsup(null);
          setHasYekdemMahsup(false);
          return;
        }

        // 5.3) multiplier
        const { data: subRow, error: subErr } = await supabase
          .from("owner_subscriptions")
          .select("multiplier")
          .eq("user_id", uid)
          .eq("subscription_serno", selectedSub)
          .maybeSingle();

        if (cancel) return;
        if (subErr) throw subErr;

        const multiplier =
          subRow && subRow.multiplier != null ? Number(subRow.multiplier) : 1;

        // 5.4) demand (geçen ay)
        const { data: demandRow, error: demandErr } = await supabase
          .from("demand_monthly")
          .select("max_demand_kw")
          .eq("user_id", uid)
          .eq("subscription_serno", selectedSub)
          .eq("period_year", periodYear)
          .eq("period_month", periodMonth)
          .eq("is_final", true)
          .maybeSingle();

        if (cancel) return;
        if (demandErr) throw demandErr;

        let monthFinalDemandKw = 0;
        if (demandRow?.max_demand_kw != null) {
          const raw = Number(demandRow.max_demand_kw);
          if (Number.isFinite(raw)) monthFinalDemandKw = raw * multiplier;
        }

        // 5.5) paramlar
        const unitPriceEnergy = (monthlyPTF + monthlyYekdem) * monthlyKbk;

        const unitPriceDistribution =
          tariffRow.dagitim_bedeli != null ? Number(tariffRow.dagitim_bedeli) : 0;

        const powerPrice =
          tariffRow.guc_bedeli != null ? Number(tariffRow.guc_bedeli) : 0;

        const powerExcessPrice =
          tariffRow.guc_bedeli_asim != null ? Number(tariffRow.guc_bedeli_asim) : 0;

        const btvRate = btvEnabled
          ? tariffRow.btv != null
            ? Number(tariffRow.btv) / 100
            : 0
          : 0;

        const vatRate = tariffRow.kdv != null ? Number(tariffRow.kdv) / 100 : 0;

        const contractPowerKw = gucLimit;
        const tariffType = mapTermToTariffType(terim);

        // ✅ reaktif ceza
        const totalRi = prevMonthRi ?? 0;
        const totalRc = prevMonthRc ?? 0;

        const riPercent = prevMonthKwh > 0 ? (totalRi / prevMonthKwh) * 100 : 0;
        const rcPercent = prevMonthKwh > 0 ? (totalRc / prevMonthKwh) * 100 : 0;

        const reactiveUnitPrice =
          tariffRow.reaktif_bedel != null ? Number(tariffRow.reaktif_bedel) : 0;

        const riPenaltyEnergy = riPercent > REACTIVE_LIMIT_RI ? totalRi : 0;
        const rcPenaltyEnergy = rcPercent > REACTIVE_LIMIT_RC ? totalRc : 0;

        const penaltyEnergy = riPenaltyEnergy + rcPenaltyEnergy;
        const reactivePenaltyCharge = penaltyEnergy * reactiveUnitPrice;

        const breakdown = calculateInvoice({
          totalConsumptionKwh: prevMonthKwh,
          unitPriceEnergy,
          unitPriceDistribution,
          btvRate,
          vatRate,
          tariffType,
          contractPowerKw,
          monthFinalDemandKw,
          powerPrice,
          powerExcessPrice,
          reactivePenaltyCharge,
          trafoDegeri,
        });

        // ✅ YEKDEM mahsup (M-1)
        let yekdemMahsupValue = 0;
        let has = false;

        try {
          const billingMonth = dayjsTR().year(periodYear).month(periodMonth - 1); // M
          const prevForYekdem = billingMonth.subtract(1, "month"); // M-1
          setYekdemMahsupLabel(prevForYekdem.format("MMMM YYYY"));

          const prevStart = prevForYekdem.startOf("month");
          const prevEndExclusive = prevStart.clone().add(1, "month");

          // M-1 kWh
          let prevPeriodKwh = 0;

          const dailyPrev = await supabase
            .from("consumption_daily")
            .select("day, kwh_in")
            .eq("user_id", uid)
            .eq("subscription_serno", selectedSub)
            .gte("day", prevStart.format("YYYY-MM-DD"))
            .lt("day", prevEndExclusive.format("YYYY-MM-DD"));

          if (!dailyPrev.error && dailyPrev.data?.length) {
            prevPeriodKwh = dailyPrev.data.reduce(
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

            if (!hourlyPrev.error && hourlyPrev.data?.length) {
              prevPeriodKwh = hourlyPrev.data.reduce(
                (sum: number, row: any) => sum + (Number(row.cn) || 0),
                0
              );
            }
          }

          if (prevPeriodKwh > 0) {
            const yRow = await fetchSubscriptionYekdem({
              uid,
              sub: selectedSub,
              year: prevForYekdem.year(),
              month: prevForYekdem.month() + 1,
            });

            if (yRow && yRow.yekdem_value != null && yRow.yekdem_final != null) {
              yekdemMahsupValue = calculateYekdemMahsup({
                totalKwh: prevPeriodKwh,
                kbk: monthlyKbk,
                btvRate,
                vatRate,
                yekdemOld: Number(yRow.yekdem_value),
                yekdemNew: Number(yRow.yekdem_final),
              });
              has = true;
            }
          }
        } catch (e) {
          yekdemMahsupValue = 0;
          has = false;
        }

        // ✅ diger_degerler çek
        const digerDegerler = await fetchSubscriptionDigerDegerler({
          uid,
          sub: selectedSub,
          year: periodYear,
          month: periodMonth,
        });

        const totalWithMahsup = breakdown.totalInvoice + yekdemMahsupValue + digerDegerler;

        if (!cancel) {
          setYekdemMahsup(yekdemMahsupValue);
          setHasYekdemMahsup(has);
          setInvoiceTotal(totalWithMahsup); // ✅ mahsup dahil
        }
      } catch (e: any) {
        if (!cancel) {
          console.error("invoice calc error:", e);
          setInvoiceErr(e?.message ?? "Fatura hesaplanamadı");
          setInvoiceTotal(null);
          setYekdemMahsup(null);
          setHasYekdemMahsup(false);
        }
      } finally {
        if (!cancel) setInvoiceLoading(false);
      }
    })();

    return () => {
      cancel = true;
    };
  }, [
    uid,
    sessionLoading,
    selectedSub,
    prevMonthKwh,
    prevMonthRi,
    prevMonthRc,
    monthlyPTF,
    monthlyYekdem,
    monthlyKbk,
  ]);

  // ---------------------------
  // 6) Tüm tesislerin toplamları (subs.length > 1 ise)
  //    Her tesis için Section 1-5 ile aynı hesaplama pipeline'ı
  // ---------------------------
  useEffect(() => {
    if (sessionLoading) return;
    if (!uid) return;
    if (subs.length <= 1) {
      setAllSubsTotalKwh(null);
      setAllSubsTotalInvoice(null);
      setAllSubsTotalMahsup(null);
      return;
    }

    let cancel = false;

    (async () => {
      try {
        const REACTIVE_LIMIT_RI = 20;
        const REACTIVE_LIMIT_RC = 15;

        // Geçen ay — Section 1 ile birebir aynı tarih hesabı
        const start = dayjsTR().subtract(1, "month").startOf("month");
        const end = dayjsTR().startOf("month");
        const pYear = start.year();
        const pMonth = start.month() + 1; // 1-12

        const allSernos = subs.map((s) => s.subscriptionSerNo);

        let grandTotalKwh = 0;
        let grandTotalInvoice = 0;
        let grandTotalMahsup = 0;
        let hasAnyInvoice = false;
        let hasAnyMahsup = false;

        for (const serno of allSernos) {
          if (cancel) return;

          // 6.1) Consumption (cn, ri, rc) — per tesis
          const { data: hourly } = await supabase
            .from("consumption_hourly")
            .select("cn, ri, rc")
            .eq("user_id", uid)
            .eq("subscription_serno", serno)
            .gte("ts", start.toDate().toISOString())
            .lt("ts", end.toDate().toISOString());

          let subKwh = 0;
          let subRi = 0;
          let subRc = 0;
          for (const r of (hourly ?? []) as any[]) {
            subKwh += Number(r.cn) || 0;
            subRi += Number(r.ri) || 0;
            subRc += Number(r.rc) || 0;
          }
          grandTotalKwh += subKwh;

          if (cancel) return;
          if (subKwh === 0) continue; // tüketim yoksa fatura da yok

          // 6.2) Önce snapshot kontrol — varsa direkt kullan
          const { data: snapData } = await supabase
            .from("invoice_snapshots")
            .select("total_with_mahsup, yekdem_mahsup")
            .eq("user_id", uid)
            .eq("subscription_serno", serno)
            .eq("period_year", pYear)
            .eq("period_month", pMonth)
            .eq("invoice_type", "billed")
            .maybeSingle();

          if (cancel) return;

          if (snapData?.total_with_mahsup != null) {
            grandTotalInvoice += Number(snapData.total_with_mahsup) || 0;
            grandTotalMahsup += Number(snapData.yekdem_mahsup) || 0;
            hasAnyInvoice = true;
            if (snapData.yekdem_mahsup != null) hasAnyMahsup = true;
            continue; // snapshot varsa hesaplamaya gerek yok
          }

          // 6.3) Snapshot yoksa → Section 5 ile aynı hesaplama
          // PTF
          const { data: ptfData } = await supabase.rpc("monthly_ptf_prev_sub", {
            p_tz: TR_TZ,
            p_subscription_serno: serno,
          });
          if (cancel) return;
          const subPtf = ptfData?.[0]?.ptf_tl_per_kwh != null ? Number(ptfData[0].ptf_tl_per_kwh) : null;

          // YEKDEM
          const subYek = await fetchSubscriptionYekdem({ uid, sub: serno, year: pYear, month: pMonth });
          if (cancel) return;
          let subYekdem: number | null = null;
          if (subYek && (subYek.yekdem_value != null || subYek.yekdem_final != null)) {
            subYekdem = subYek.yekdem_value ?? subYek.yekdem_final ?? null;
          } else {
            const { data: offRow } = await supabase
              .from("yekdem_official")
              .select("yekdem_value, yekdem_tl_per_kwh")
              .eq("year", pYear)
              .eq("month", pMonth)
              .maybeSingle();
            if (offRow) {
              subYekdem = offRow.yekdem_value != null ? Number(offRow.yekdem_value) : offRow.yekdem_tl_per_kwh != null ? Number(offRow.yekdem_tl_per_kwh) : null;
            }
          }
          if (cancel) return;

          // KBK
          const { data: kbkData } = await supabase
            .from("subscription_settings")
            .select("kbk, terim, gerilim, tarife, guc_bedel_limit, trafo_degeri, btv_enabled")
            .eq("user_id", uid)
            .eq("subscription_serno", serno)
            .maybeSingle();
          if (cancel) return;

          const subKbk = kbkData?.kbk != null ? Number(kbkData.kbk) : null;
          if (subPtf == null || subYekdem == null || subKbk == null || !kbkData) continue;

          const terim = kbkData.terim ?? null;
          const gerilim = kbkData.gerilim ?? null;
          const tarife = kbkData.tarife ?? null;
          if (!terim || !gerilim || !tarife) continue;

          const btvEnabled = kbkData.btv_enabled ?? true;
          const trafoDegeri = kbkData.trafo_degeri != null && Number.isFinite(Number(kbkData.trafo_degeri)) ? Number(kbkData.trafo_degeri) : 0;
          const gucLimit = kbkData.guc_bedel_limit != null ? Number(kbkData.guc_bedel_limit) : 0;

          // Tariff
          const { data: tariffRow } = await supabase
            .from("distribution_tariff_official")
            .select("dagitim_bedeli, guc_bedeli, guc_bedeli_asim, kdv, btv, reaktif_bedel")
            .eq("terim", terim)
            .eq("gerilim", gerilim)
            .eq("tarife", tarife)
            .maybeSingle();
          if (cancel) return;
          if (!tariffRow) continue;

          // Multiplier
          const { data: subRow } = await supabase
            .from("owner_subscriptions")
            .select("multiplier")
            .eq("user_id", uid)
            .eq("subscription_serno", serno)
            .maybeSingle();
          if (cancel) return;
          const multiplier = subRow?.multiplier != null ? Number(subRow.multiplier) : 1;

          // Demand
          const { data: demandRow } = await supabase
            .from("demand_monthly")
            .select("max_demand_kw")
            .eq("user_id", uid)
            .eq("subscription_serno", serno)
            .eq("period_year", pYear)
            .eq("period_month", pMonth)
            .eq("is_final", true)
            .maybeSingle();
          if (cancel) return;

          let monthFinalDemandKw = 0;
          if (demandRow?.max_demand_kw != null) {
            const raw = Number(demandRow.max_demand_kw);
            if (Number.isFinite(raw)) monthFinalDemandKw = raw * multiplier;
          }

          // calculateInvoice
          const unitPriceEnergy = (subPtf + subYekdem) * subKbk;
          const unitPriceDistribution = tariffRow.dagitim_bedeli != null ? Number(tariffRow.dagitim_bedeli) : 0;
          const powerPrice = tariffRow.guc_bedeli != null ? Number(tariffRow.guc_bedeli) : 0;
          const powerExcessPrice = tariffRow.guc_bedeli_asim != null ? Number(tariffRow.guc_bedeli_asim) : 0;
          const btvRate = btvEnabled ? (tariffRow.btv != null ? Number(tariffRow.btv) / 100 : 0) : 0;
          const vatRate = tariffRow.kdv != null ? Number(tariffRow.kdv) / 100 : 0;
          const contractPowerKw = gucLimit;
          const tariffType = mapTermToTariffType(terim);

          const riPercent = subKwh > 0 ? (subRi / subKwh) * 100 : 0;
          const rcPercent = subKwh > 0 ? (subRc / subKwh) * 100 : 0;
          const reactiveUnitPrice = tariffRow.reaktif_bedel != null ? Number(tariffRow.reaktif_bedel) : 0;
          const riPenaltyEnergy = riPercent > REACTIVE_LIMIT_RI ? subRi : 0;
          const rcPenaltyEnergy = rcPercent > REACTIVE_LIMIT_RC ? subRc : 0;
          const reactivePenaltyCharge = (riPenaltyEnergy + rcPenaltyEnergy) * reactiveUnitPrice;

          const breakdown = calculateInvoice({
            totalConsumptionKwh: subKwh,
            unitPriceEnergy,
            unitPriceDistribution,
            btvRate,
            vatRate,
            tariffType,
            contractPowerKw,
            monthFinalDemandKw,
            powerPrice,
            powerExcessPrice,
            reactivePenaltyCharge,
            trafoDegeri,
          });

          // YEKDEM Mahsup (M-1)
          let yekdemMahsupVal = 0;
          try {
            const billingMonth = dayjsTR().year(pYear).month(pMonth - 1);
            const prevForYekdem = billingMonth.subtract(1, "month");
            const prevStart2 = prevForYekdem.startOf("month");
            const prevEnd2 = prevStart2.clone().add(1, "month");

            let prevPeriodKwh = 0;
            const { data: dailyPrev } = await supabase
              .from("consumption_daily")
              .select("day, kwh_in")
              .eq("user_id", uid)
              .eq("subscription_serno", serno)
              .gte("day", prevStart2.format("YYYY-MM-DD"))
              .lt("day", prevEnd2.format("YYYY-MM-DD"));

            if (dailyPrev?.length) {
              prevPeriodKwh = dailyPrev.reduce((s: number, r: any) => s + (Number(r.kwh_in) || 0), 0);
            } else {
              const { data: hourlyPrev } = await supabase
                .from("consumption_hourly")
                .select("ts, cn")
                .eq("user_id", uid)
                .eq("subscription_serno", serno)
                .gte("ts", prevStart2.toDate().toISOString())
                .lt("ts", prevEnd2.toDate().toISOString());
              if (hourlyPrev?.length) {
                prevPeriodKwh = hourlyPrev.reduce((s: number, r: any) => s + (Number(r.cn) || 0), 0);
              }
            }

            if (prevPeriodKwh > 0) {
              const yRow = await fetchSubscriptionYekdem({
                uid, sub: serno, year: prevForYekdem.year(), month: prevForYekdem.month() + 1,
              });
              if (yRow && yRow.yekdem_value != null && yRow.yekdem_final != null) {
                yekdemMahsupVal = calculateYekdemMahsup({
                  totalKwh: prevPeriodKwh,
                  kbk: subKbk,
                  btvRate,
                  vatRate,
                  yekdemOld: Number(yRow.yekdem_value),
                  yekdemNew: Number(yRow.yekdem_final),
                });
                hasAnyMahsup = true;
              }
            }
          } catch { /* mahsup hesaplanamadı, 0 olarak devam */ }

          // diger_degerler
          const digerDegerler = await fetchSubscriptionDigerDegerler({ uid, sub: serno, year: pYear, month: pMonth });
          if (cancel) return;

          grandTotalInvoice += breakdown.totalInvoice + yekdemMahsupVal + digerDegerler;
          grandTotalMahsup += yekdemMahsupVal;
          hasAnyInvoice = true;
        }

        if (cancel) return;
        setAllSubsTotalKwh(grandTotalKwh);
        setAllSubsTotalInvoice(hasAnyInvoice ? grandTotalInvoice : null);
        setAllSubsTotalMahsup(hasAnyMahsup ? grandTotalMahsup : null);
      } catch (e) {
        console.error("all subs totals error:", e);
        if (!cancel) {
          setAllSubsTotalKwh(null);
          setAllSubsTotalInvoice(null);
          setAllSubsTotalMahsup(null);
        }
      }
    })();

    return () => {
      cancel = true;
    };
  }, [uid, sessionLoading, subs]);

  // ---------------------------
  // Kart değerleri + renkler + subtitle override
  // ---------------------------
  const valuesByKey: Record<string, string> = useMemo(() => {
    const consumptionText =
      prevMonthKwh != null
        ? prevMonthKwh.toLocaleString("tr-TR", { maximumFractionDigits: 0 })
        : "—";

    const ptfText = fmtPTF6(monthlyPTF);
    const yekdemText = fmtPTF6(monthlyYekdem);

    const unitPrice =
      monthlyPTF != null && monthlyYekdem != null && monthlyKbk != null
        ? (monthlyPTF + monthlyYekdem) * monthlyKbk
        : null;

    const unitPriceText = fmtPTF6(unitPrice);
    const invoiceText = fmtMoney2(invoiceTotal);

    const mahsupText =
      !hasYekdemMahsup || yekdemMahsup == null
        ? "—"
        : `${yekdemMahsup > 0 ? "+" : yekdemMahsup < 0 ? "-" : ""}${fmtMoney2(
            Math.abs(yekdemMahsup)
          )} TL`;

    return {
      consumption: consumptionText,
      cost: ptfText,
      ptf: ptfText,
      yekdem: yekdemText,
      valley: unitPriceText,
      anomaly: invoiceText, // ✅ mahsup dahil
      files: mahsupText, // ✅ mahsup (+/-)
    };
  }, [
    prevMonthKwh,
    monthlyPTF,
    monthlyYekdem,
    monthlyKbk,
    invoiceTotal,
    hasYekdemMahsup,
    yekdemMahsup,
  ]);

  // ✅ Tüm tesislerin toplam değerleri (subs > 1 ise)
  const totalLineByKey: Record<string, string | undefined> = useMemo(() => {
    if (subs.length <= 1) return {};

    const kwhLine =
      allSubsTotalKwh != null
        ? `Tüm tesisler: ${allSubsTotalKwh.toLocaleString("tr-TR", { maximumFractionDigits: 0 })} kWh`
        : undefined;

    const invoiceLine =
      allSubsTotalInvoice != null
        ? `Tüm tesisler: ${fmtMoney2(allSubsTotalInvoice)} TL`
        : undefined;

    const mahsupLine =
      allSubsTotalMahsup != null
        ? `Tüm tesisler: ${allSubsTotalMahsup > 0 ? "+" : ""}${fmtMoney2(allSubsTotalMahsup)} TL`
        : undefined;

    return {
      consumption: kwhLine,
      anomaly: invoiceLine,
      files: mahsupLine,
    };
  }, [subs.length, allSubsTotalKwh, allSubsTotalInvoice, allSubsTotalMahsup]);

  const filesSubtitle = !hasYekdemMahsup
    ? "Önceki dönem için yekdem_final girilmemiş."
    : `${yekdemMahsupLabel || "M-1"} için (yekdem_final - yekdem_value)`;

  const filesValueClass =
    !hasYekdemMahsup || yekdemMahsup == null
      ? "text-neutral-900"
      : yekdemMahsup > 0
      ? "text-red-600"
      : "text-emerald-600";

  const filesBadgeText = !hasYekdemMahsup ? "—" : "Özet";

  const filesBadgeClass =
    !hasYekdemMahsup
      ? "border-neutral-200 text-neutral-500"
      : yekdemMahsup != null && yekdemMahsup > 0
      ? "border-red-200 text-red-600 bg-red-50"
      : "border-emerald-200 text-emerald-700 bg-emerald-50";

  const imgForKey = (key: string): ImgSpec | undefined => {
    switch (key) {
      case "consumption":
        return { src: "/dashboard-icons/bolt.png", x: 120, y: -120, width: 466, height: 401 };
      case "cost":
        return { src: "/dashboard-icons/try.png", x: 125, y: -75, width: 419, height: 335 };
      case "yekdem":
        return { src: "/dashboard-icons/chart-up.png", x: 50, y: -85, width: 409, height: 330, rotate: 3.27 };
      case "valley":
        return { src: "/dashboard-icons/coin.png", x: 160, y: -55, width: 350, height: 280, rotate: -9 };
      case "anomaly":
        return { src: "/dashboard-icons/invoice.png", x: 125, y: -55, width: 378, height: 302 };
      case "files":
        return { src: "/dashboard-icons/dollar.png", x: 200, y: 10, width: 200, height: 160 };
      default:
        return undefined;
    }
  };

  const yekdemSubtitle =
    yekdemMode === "custom"
      ? "TL/kWh (tesis özel YEKDEM)"
      : "TL/kWh (EPİAŞ resmi YEKDEM)";

  const selectedSubLabel = (() => {
    const found = subs.find((s) => s.subscriptionSerNo === selectedSub);
    if (found) return subLabel(found);
    return selectedSub != null ? `Tesis ${selectedSub}` : "Tesis seçilmedi";
  })();

  return (
    <DashboardShell>
      {/* Header + Tesis seçimi */}
      <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-start md:justify-between">

        <div>
          <h1 className="text-2xl font-semibold text-neutral-900">
            PortEco Gösterge Paneli
          </h1>
          <p className="text-sm text-neutral-500">Kişiye ve tesise özel istatistiklerin</p>

{selectedSub && (
  <p className="mt-1 text-xs text-neutral-500 flex items-center gap-2">
    Seçili tesis:{" "}
    

    <button
      type="button"
      onClick={() => navigate("/dashboard/profile")}
      className="inline-flex items-center justify-center rounded-md border border-neutral-200 bg-white px-2 py-0.5 text-[11px] text-neutral-600 hover:bg-neutral-50"
      title="Tesis adını (nickname) düzenle"
      aria-label="Tesis adını (nickname) düzenle"
    >
      <span className="font-medium text-neutral-800">{selectedSubLabel}</span>
    </button>
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
                  {subLabel(s)}
                </option>
              ))}
            </select>

            {subsLoading && (
              <span className="text-[11px] text-neutral-500">Yükleniyor…</span>
            )}
          </div>
        </div>
      </div>

      {/* Hatalar */}
      {(subsErr || prevErr || ptfErr || yekdemErr || kbkErr || invoiceErr) && (
        <div className="mb-4 rounded border border-red-300 bg-red-50 p-3 text-sm text-red-700">
          {subsErr && (
            <>
              Tesisler: {subsErr}
              <br />
            </>
          )}
          {prevErr && (
            <>
              Tüketim: {prevErr}
              <br />
            </>
          )}
          {ptfErr && (
            <>
              PTF: {ptfErr}
              <br />
            </>
          )}
          {yekdemErr && (
            <>
              YEKDEM: {yekdemErr}
              <br />
            </>
          )}
          {kbkErr && (
            <>
              KBK: {kbkErr}
              <br />
            </>
          )}
          {invoiceErr && <>Fatura: {invoiceErr}</>}
        </div>
      )}

      {/* Loading */}
      {(subsLoading ||
        prevLoading ||
        ptfLoading ||
        yekdemLoading ||
        kbkLoading ||
        invoiceLoading) && (
        <div className="mb-4 text-sm text-neutral-500">Veriler yükleniyor…</div>
      )}

      {/* Kartlar */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-5 mb-6">
        {DASH_CARDS.map((c) => (
          <StatCard
            key={c.key}
            title={c.title}
            value={valuesByKey[c.key] ?? "—"}
            sub={
              c.key === "yekdem"
                ? yekdemSubtitle
                : c.key === "files"
                ? filesSubtitle
                : c.subtitle
            }
            valueClassName={c.key === "files" ? filesValueClass : undefined}
            badgeText={c.key === "files" ? filesBadgeText : undefined}
            badgeClassName={c.key === "files" ? filesBadgeClass : undefined}
            totalLine={totalLineByKey[c.key]}
            onClick={() => {
              if (c.key === "files") {
                navigate("/dashboard/yekdem-mahsup");
                return;
              }
              navigate(c.path);
            }}
            img={imgForKey(c.key)}
          />
        ))}
      </div>

      {/* Reaktif bölümler */}
      <ReactiveSection subscriptionSerNo={selectedSub} />
    </DashboardShell>
  );
}
