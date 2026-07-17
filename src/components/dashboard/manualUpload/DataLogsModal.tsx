// src/components/dashboard/manualUpload/DataLogsModal.tsx
//
// manual_data_logs: kullanıcının manuel yükleme/silme işlemleri geçmişi.
// created_at DESC, son 50 kayıt. Yükleme=mavi, Silme=kırmızı rozet.

import { useEffect, useState } from "react";
import { History, Loader2, X } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { dayjsTR } from "@/lib/dayjs";

type LogRow = {
  id: string;
  subscription_serno: number | null;
  operation: "upload" | "delete";
  row_count: number | null;
  skipped_count: number | null;
  range_start: string | null;
  range_end: string | null;
  file_name: string | null;
  created_at: string;
};

type Props = {
  uid: string;
  onClose: () => void;
};

const fmtInt = (n: number) => n.toLocaleString("tr-TR");
const fmtTs = (iso: string | null) =>
  iso ? dayjsTR(iso).format("DD.MM.YYYY HH:mm") : "—";

export default function DataLogsModal({ uid, onClose }: Props) {
  const [rows, setRows] = useState<LogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancel = false;

    (async () => {
      setLoading(true);
      setError(null);

      const { data, error: err } = await supabase
        .from("manual_data_logs")
        .select(
          "id, subscription_serno, operation, row_count, skipped_count, range_start, range_end, file_name, created_at",
        )
        .eq("user_id", uid)
        .order("created_at", { ascending: false })
        .limit(50);

      if (cancel) return;
      if (err) {
        setError(err.message);
        setRows([]);
      } else {
        setRows((data ?? []) as LogRow[]);
      }
      setLoading(false);
    })();

    return () => {
      cancel = true;
    };
  }, [uid]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="flex max-h-[80vh] w-full max-w-2xl flex-col rounded-lg border border-neutral-200 bg-white p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <History className="h-5 w-5 text-[#00AEEF]" />
            <h3 className="text-sm font-semibold text-neutral-900">
              Veri Logları
            </h3>
            <span className="text-xs text-neutral-400">(son 50 işlem)</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700"
            aria-label="Kapat"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {loading && (
            <div className="flex items-center justify-center gap-2 py-10 text-sm text-neutral-500">
              <Loader2 className="h-4 w-4 animate-spin" />
              Yükleniyor…
            </div>
          )}

          {!loading && error && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              Loglar yüklenemedi: {error}
            </div>
          )}

          {!loading && !error && rows.length === 0 && (
            <div className="py-10 text-center text-sm text-neutral-500">
              Henüz kayıtlı bir işlem yok.
            </div>
          )}

          {!loading && !error && rows.length > 0 && (
            <ul className="divide-y divide-neutral-100">
              {rows.map((r) => (
                <li key={r.id} className="flex flex-col gap-1 py-3">
                  <div className="flex flex-wrap items-center gap-2">
                    {r.operation === "upload" ? (
                      <span className="rounded-lg bg-[#00AEEF]/10 px-2 py-0.5 text-[11px] font-medium text-[#00AEEF]">
                        Yükleme
                      </span>
                    ) : (
                      <span className="rounded-lg bg-red-50 px-2 py-0.5 text-[11px] font-medium text-red-600">
                        Silme
                      </span>
                    )}

                    <span className="text-sm font-medium text-neutral-800">
                      {r.subscription_serno != null
                        ? `Tesis ${r.subscription_serno}`
                        : "Tüm tesisler"}
                    </span>

                    <span className="text-sm text-neutral-600">
                      {fmtInt(r.row_count ?? 0)} satır
                      {(r.skipped_count ?? 0) > 0 &&
                        ` (+${fmtInt(r.skipped_count ?? 0)} atlandı)`}
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-neutral-500">
                    <span>
                      Aralık: {fmtTs(r.range_start)} – {fmtTs(r.range_end)} (TR)
                    </span>
                    {r.file_name && (
                      <span className="truncate" title={r.file_name}>
                        Dosya: {r.file_name}
                      </span>
                    )}
                    <span>İşlem: {fmtTs(r.created_at)}</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
