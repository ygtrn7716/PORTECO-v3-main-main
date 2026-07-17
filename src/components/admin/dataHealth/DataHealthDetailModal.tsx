// src/components/admin/dataHealth/DataHealthDetailModal.tsx
// Tesis satırına tıklanınca açılan 7 günlük detay: günlük alınan saatlik
// kayıt sayısının bar grafiği. Hangi gün verinin durduğunu görünür kılar.
import { useEffect, useMemo, useState } from "react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Cell,
} from "recharts";
import { supabase } from "@/lib/supabase";
import { dayjsTR } from "@/lib/dayjs";
import Modal from "./Modal";
import {
  ConsumptionHealthRow,
  computeStatus,
  STATUS_META,
  formatDelay,
  formatTsTR,
  providerLabel,
} from "@/lib/dataHealth";

const DAYS_BACK = 7;
// Sağlıklı bir gün ~24 saatlik kayıt içerir; eşik altı barları kırmızıya boyarız.
const LOW_DAY_THRESHOLD = 20;

type DayBucket = { date: string; label: string; count: number };

export default function DataHealthDetailModal({
  row,
  onClose,
}: {
  row: ConsumptionHealthRow;
  onClose: () => void;
}) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [buckets, setBuckets] = useState<DayBucket[]>([]);

  const status = computeStatus(row);
  const meta = STATUS_META[status];

  useEffect(() => {
    let cancel = false;
    (async () => {
      setLoading(true);
      setError(null);

      // Son 7 günün başlangıcı (TR gün başı), bugün dahil
      const startTR = dayjsTR().startOf("day").subtract(DAYS_BACK - 1, "day");
      const startISO = startTR.toISOString();

      const { data, error: err } = await supabase
        .from("consumption_hourly")
        .select("ts")
        .eq("user_id", row.user_id)
        .eq("subscription_serno", row.subscription_serno)
        .gte("ts", startISO)
        .order("ts", { ascending: true });

      if (cancel) return;
      if (err) {
        setError(err.message);
        setBuckets([]);
        setLoading(false);
        return;
      }

      // Gün bazında say (Europe/Istanbul)
      const counts = new Map<string, number>();
      for (const r of data ?? []) {
        const key = dayjsTR((r as { ts: string }).ts).format("YYYY-MM-DD");
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }

      // 7 kovayı (boş günler dahil) sırayla oluştur — boşluklar görünür olsun
      const out: DayBucket[] = [];
      for (let i = 0; i < DAYS_BACK; i++) {
        const d = startTR.add(i, "day");
        const key = d.format("YYYY-MM-DD");
        out.push({ date: key, label: d.format("DD.MM"), count: counts.get(key) ?? 0 });
      }

      setBuckets(out);
      setLoading(false);
    })();

    return () => {
      cancel = true;
    };
  }, [row.user_id, row.subscription_serno]);

  const total7d = useMemo(() => buckets.reduce((s, b) => s + b.count, 0), [buckets]);

  return (
    <Modal
      title={row.title || `Tesis ${row.subscription_serno}`}
      subtitle={`SerNo ${row.subscription_serno} · ${providerLabel(row)}`}
      onClose={onClose}
      maxWidth="max-w-3xl"
    >
      {/* Durum başlığı */}
      <div className="grid gap-3 sm:grid-cols-3 mb-5">
        <div className="rounded-xl border border-neutral-200 p-3">
          <div className="text-xs text-neutral-500 mb-1">Durum</div>
          <div className={`inline-flex items-center gap-1.5 text-sm font-medium ${meta.text}`}>
            <span className={`h-2.5 w-2.5 rounded-full ${meta.dot}`} />
            {meta.emoji} {meta.label}
          </div>
        </div>
        <div className="rounded-xl border border-neutral-200 p-3">
          <div className="text-xs text-neutral-500 mb-1">Son Veri Zamanı</div>
          <div className="text-sm font-medium text-neutral-900">{formatTsTR(row.last_ts)}</div>
        </div>
        <div className="rounded-xl border border-neutral-200 p-3">
          <div className="text-xs text-neutral-500 mb-1">Gecikme</div>
          <div className="text-sm font-medium text-neutral-900">{formatDelay(row.delay_hours)}</div>
        </div>
      </div>

      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold text-neutral-800">
          Son {DAYS_BACK} Gün — Günlük Kayıt Sayısı
        </h3>
        <span className="text-xs text-neutral-500">Toplam: {total7d.toLocaleString("tr-TR")} kayıt</span>
      </div>

      {loading ? (
        <p className="text-sm text-neutral-500 py-12 text-center">Yükleniyor…</p>
      ) : error ? (
        <p className="text-sm text-red-600 py-12 text-center">Veri alınamadı: {error}</p>
      ) : (
        <div className="rounded-xl border border-neutral-200 p-3">
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={buckets} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
              <Tooltip
                formatter={(value: number | undefined) => [`${value ?? 0} kayıt`, "Saatlik kayıt"]}
                labelFormatter={(l) => `Gün: ${l}`}
              />
              <Bar dataKey="count" radius={[3, 3, 0, 0]} name="Saatlik kayıt">
                {buckets.map((b) => (
                  <Cell
                    key={b.date}
                    fill={b.count === 0 ? "#ef4444" : b.count < LOW_DAY_THRESHOLD ? "#f59e0b" : "#22c55e"}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          <p className="text-[11px] text-neutral-400 mt-2">
            Yeşil: tam gün (≥{LOW_DAY_THRESHOLD} kayıt) · Sarı: eksik · Kırmızı: kayıt yok
          </p>
        </div>
      )}
    </Modal>
  );
}
