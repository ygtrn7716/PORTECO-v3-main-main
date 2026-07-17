// src/components/dashboard/manualUpload/DateRangeDeleteModal.tsx
//
// Manuel tesisler için tarih aralıklı consumption_hourly silme.
// Tesis seçici: tekil manuel tesis VEYA "Tüm manuel tesisler" (toplu silme).
// İki adımlı akış: tesis + tarih seçimi → "geri alınamaz" uyarılı onay.
// Aralık Europe/Istanbul gün sınırlarıyla yorumlanır:
// başlangıç günü 00:00:00 → bitiş günü 23:59:59.
//
// Toplu silmede filtre user_id + subscription_serno IN (manuel sernolar) —
// sadece user_id ile silme YAPILMAZ; API tesis verisine sorgu seviyesinde
// bile dokunulmaz (RLS zaten koruyor, frontend de açıkça filtreler).

import { useState } from "react";
import { AlertTriangle, CheckCircle2, Loader2, Trash2, X } from "lucide-react";
import { supabase } from "@/lib/supabase";
import dayjs, { TR_TZ, dayjsTR } from "@/lib/dayjs";

export type ManualFacilityOption = {
  serno: number;
  label: string; // "12345678 - Fabrika" gibi
};

type Props = {
  uid: string;
  /** Varsayılan seçim: tekil manuel tesis seçiliyken o tesisin sernosu;
   *  "Tümü" modunda null → kullanıcı bilinçli seçim yapmadan silme başlamaz. */
  defaultSerno: number | null;
  /** Seçici seçenekleri: kullanıcının (görünür) manuel tesisleri */
  facilities: ManualFacilityOption[];
  onClose: () => void;
  onDeleted?: () => void;
};

type Step = "form" | "confirm" | "done";

const ALL = "ALL";

const fmtInt = (n: number) => n.toLocaleString("tr-TR");

export default function DateRangeDeleteModal({
  uid,
  defaultSerno,
  facilities,
  onClose,
  onDeleted,
}: Props) {
  const [step, setStep] = useState<Step>("form");
  // Select değeri: "" (seçilmedi) | "ALL" | serno string'i
  const [target, setTarget] = useState<string>(
    defaultSerno != null ? String(defaultSerno) : "",
  );
  const [startDate, setStartDate] = useState(""); // YYYY-MM-DD
  const [endDate, setEndDate] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deletedCount, setDeletedCount] = useState<number | null>(null);

  const rangeValid = !!startDate && !!endDate && startDate <= endDate;
  const targetValid =
    target === ALL || facilities.some((f) => String(f.serno) === target);
  const canContinue = rangeValid && targetValid;

  // Europe/Istanbul gün sınırları (dayjs tz — offset aritmetiği değil)
  const startIso = rangeValid
    ? dayjs.tz(`${startDate} 00:00:00`, TR_TZ).toISOString()
    : null;
  const endIso = rangeValid
    ? dayjs.tz(`${endDate} 23:59:59`, TR_TZ).toISOString()
    : null;

  const targetFacility =
    target !== ALL ? facilities.find((f) => String(f.serno) === target) ?? null : null;

  // Onay/sonuç metinlerinde kapsam: "X tesisinin" vs "N manuel tesisin tamamında"
  const scopeText =
    target === ALL
      ? `${facilities.length} manuel tesisin tamamında`
      : `${targetFacility?.label ?? target} tesisinin`;

  const dateRangeText = rangeValid
    ? `${dayjsTR(startIso).format("DD.MM.YYYY")} – ${dayjsTR(endIso).format("DD.MM.YYYY")}`
    : "";

  async function handleDelete() {
    if (!startIso || !endIso || !targetValid) return;

    setDeleting(true);
    setError(null);

    try {
      let q = supabase
        .from("consumption_hourly")
        .delete({ count: "exact" })
        .eq("user_id", uid);

      // Toplu silmede bile açık serno filtresi — asla sadece user_id ile silme
      if (target === ALL) {
        q = q.in(
          "subscription_serno",
          facilities.map((f) => f.serno),
        );
      } else {
        q = q.eq("subscription_serno", Number(target));
      }

      const { count, error: delErr } = await q
        .gte("ts", startIso)
        .lte("ts", endIso);

      if (delErr) throw new Error(delErr.message);

      const n = count ?? 0;

      const { error: logErr } = await supabase.from("manual_data_logs").insert({
        user_id: uid,
        // Toplu silme: NULL = tüm manuel tesisler
        subscription_serno: target === ALL ? null : Number(target),
        operation: "delete",
        row_count: n,
        skipped_count: 0,
        range_start: startIso,
        range_end: endIso,
        file_name: null,
      });
      if (logErr) {
        // Silme gerçekleşti; log hatası işlemi geri almaz
        console.error("[manual_data_logs] insert:", logErr.message);
      }

      setDeletedCount(n);
      setStep("done");
      onDeleted?.();
    } catch (err: any) {
      console.error("[manual delete]", err);
      setError(err?.message ?? "Silme sırasında bilinmeyen bir hata oluştu.");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={() => {
        if (!deleting) onClose();
      }}
    >
      <div
        className="w-full max-w-md rounded-lg border border-neutral-200 bg-white p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <Trash2 className="h-5 w-5 text-red-600" />
            <h3 className="text-sm font-semibold text-neutral-900">
              Tarih Aralıklı Veri Sil
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={deleting}
            className="rounded-lg p-1 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700 disabled:opacity-50"
            aria-label="Kapat"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {step === "form" && (
          <>
            <div className="mb-3">
              <label className="mb-1 block text-xs text-neutral-500">Tesis</label>
              <select
                value={target}
                onChange={(e) => setTarget(e.target.value)}
                className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-800 focus:outline-none focus:ring-1 focus:ring-[#00AEEF]"
              >
                <option value="">Tesis seçin…</option>
                <option value={ALL}>
                  Tüm manuel tesisler ({facilities.length} tesis)
                </option>
                {facilities.map((f) => (
                  <option key={f.serno} value={String(f.serno)}>
                    {f.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs text-neutral-500">
                  Başlangıç Tarihi
                </label>
                <input
                  type="date"
                  value={startDate}
                  max={endDate || undefined}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-800 focus:outline-none focus:ring-1 focus:ring-[#00AEEF]"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-neutral-500">
                  Bitiş Tarihi
                </label>
                <input
                  type="date"
                  value={endDate}
                  min={startDate || undefined}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-800 focus:outline-none focus:ring-1 focus:ring-[#00AEEF]"
                />
              </div>
            </div>

            {startDate && endDate && startDate > endDate && (
              <p className="mt-2 text-xs text-red-600">
                Başlangıç tarihi bitiş tarihinden sonra olamaz.
              </p>
            )}

            <p className="mt-3 text-xs text-neutral-500">
              Seçilen tesiste (veya tüm manuel tesislerde) aralıktaki tüm
              saatlik tüketim kayıtları silinir (başlangıç günü 00:00 → bitiş
              günü 23:59, Türkiye saati). API tesislerine dokunulmaz.
            </p>

            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-700 hover:bg-neutral-50"
              >
                Vazgeç
              </button>
              <button
                type="button"
                disabled={!canContinue}
                onClick={() => setStep("confirm")}
                className="rounded-lg bg-red-600 px-3 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
              >
                Devam Et
              </button>
            </div>
          </>
        )}

        {step === "confirm" && (
          <>
            <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <div>
                <div className="font-semibold">Bu işlem geri alınamaz.</div>
                <div className="mt-1 text-xs">
                  {scopeText} {dateRangeText} verisi kalıcı olarak silinecek
                  {"  "}
                  ({dayjsTR(startIso).format("DD.MM.YYYY HH:mm")} –{" "}
                  {dayjsTR(endIso).format("DD.MM.YYYY HH:mm")} TR).
                </div>
              </div>
            </div>

            {error && (
              <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">
                {error}
              </div>
            )}

            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setStep("form")}
                disabled={deleting}
                className="rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-700 hover:bg-neutral-50 disabled:opacity-50"
              >
                Geri
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={deleting}
                className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-3 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
              >
                {deleting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Siliniyor…
                  </>
                ) : (
                  <>
                    <Trash2 className="h-4 w-4" />
                    Evet, Sil
                  </>
                )}
              </button>
            </div>
          </>
        )}

        {step === "done" && (
          <>
            <div className="flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
              <div>
                <div className="font-medium">
                  {fmtInt(deletedCount ?? 0)} satır silindi.
                </div>
                <div className="mt-1 text-xs text-emerald-700/80">
                  {scopeText} {dateRangeText} (TR)
                </div>
              </div>
            </div>

            <div className="mt-4 flex justify-end">
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-700 hover:bg-neutral-50"
              >
                Kapat
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
