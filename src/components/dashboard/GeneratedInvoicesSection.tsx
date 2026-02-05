// src/components/dashboard/GeneratedInvoicesSection.tsx
import { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { useSession } from "@/hooks/useSession";
import { dayjsTR } from "@/lib/dayjs";

const monthNamesTR = [
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

type HistoryListRow = {
  id: number;
  period_year: number;
  period_month: number;
  created_at: string | null;
};

export default function GeneratedInvoicesSection() {
  const { session: authSession, loading: sessionLoading } = useSession();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [rows, setRows] = useState<HistoryListRow[]>([]);

  useEffect(() => {
    if (sessionLoading) return;
    const uid = authSession?.user?.id;
    if (!uid) return;

    let cancel = false;

    (async () => {
      try {
        setLoading(true);
        setErr(null);

        // Kullanıcının siteye kayıt olduğu tarih (Supabase auth)
        let signupYear: number | null = null;
        let signupMonth: number | null = null;
        const createdAt = authSession?.user?.created_at;

        if (createdAt) {
          const d = dayjsTR(createdAt);
          if (d.isValid()) {
            signupYear = d.year();
            signupMonth = d.month() + 1; // 1–12
          }
        }

        const { data, error } = await supabase
          .from("invoice_history")
          .select("id, period_year, period_month, created_at")
          .eq("user_id", uid)
          .order("period_year", { ascending: false })
          .order("period_month", { ascending: false });

        if (cancel) return;
        if (error) throw error;

        let list = (data ?? []) as HistoryListRow[];

        // 🔹 Sadece kayıt olduğu ay ve sonrası
        if (signupYear && signupMonth) {
          list = list.filter((r) => {
            return (
              r.period_year > signupYear ||
              (r.period_year === signupYear &&
                r.period_month >= signupMonth)
            );
          });
        }

        setRows(list);
      } catch (e: any) {
        if (!cancel) {
          console.error("generated invoices list error:", e);
          setErr(e?.message ?? "Fatura listesi yüklenemedi.");
          setRows([]);
        }
      } finally {
        if (!cancel) setLoading(false);
      }
    })();

    return () => {
      cancel = true;
    };
  }, [authSession?.user?.id, authSession?.user?.created_at, sessionLoading]);

  const groupedByYear = useMemo(() => {
    const map: Record<string, HistoryListRow[]> = {};
    for (const r of rows) {
      const key = String(r.period_year);
      if (!map[key]) map[key] = [];
      map[key].push(r);
    }
    Object.keys(map).forEach((year) => {
      map[year].sort((a, b) => b.period_month - a.period_month);
    });
    return map;
  }, [rows]);

  const sortedYears = useMemo(
    () =>
      Object.keys(groupedByYear).sort(
        (a, b) => Number(b) - Number(a)
      ),
    [groupedByYear]
  );

  if (err) {
    return (
      <div className="mb-4 rounded border border-red-300 bg-red-50 p-3 text-sm text-red-700">
        {err}
      </div>
    );
  }

  if (loading) {
    return (
      <div className="mb-4 text-sm text-neutral-500">
        Faturalar yükleniyor…
      </div>
    );
  }

  if (!rows.length) {
    return (
      <p className="text-sm text-neutral-500">
        Henüz oluşturulmuş bir faturanız yok. Geçmiş fatura hesaplama
        ekranından fatura oluşturduğunuzda burada görünecek.
      </p>
    );
  }

  return (
    <>
      {sortedYears.map((year) => {
        const list = groupedByYear[year] ?? [];
        if (!list.length) return null;

        return (
          <section key={year} className="mb-8">
            <h2 className="text-sm font-semibold text-neutral-800">
              {year}
            </h2>

            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {list.map((inv) => {
                const mIndex = inv.period_month - 1;
                const monthName =
                  monthNamesTR[mIndex] ?? `${inv.period_month}. Ay`;
                const label = `${monthName} faturası`;

                return (
                  <button
                    key={inv.id}
                    onClick={() =>
                      navigate(`/dashboard/files/${inv.id}`)
                    }
                    className="group rounded-2xl border border-neutral-200 bg-white p-4 text-left shadow-sm hover:shadow-md transition-all"
                  >
                    <p className="text-sm font-semibold text-neutral-900">
                      {label}
                    </p>
                    <p className="mt-1 text-[11px] text-neutral-400">
                      Detayları görmek için tıklayın
                    </p>
                  </button>
                );
              })}
            </div>
          </section>
        );
      })}
    </>
  );
}
