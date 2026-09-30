//src/components/dashboard/invoices/BackdatedInvoiceModal.tsx
//
// "Geçmiş Dönem Faturası Oluştur" akışı (3 adım: select → yekdem → done).
// Şablon: manualUpload/DateRangeDeleteModal (modal-içi tesis seçimi + step machine).
//
// YEKDEM kuralı (spec): sistemde (subscription_yekdem) değeri OLAN alan için
// input HİÇ render edilmez (disabled input da yok) — yalnız salt okunur değer +
// "sistemden geldi" işareti. Input yalnız değerin sistemde HİÇ olmadığı ve
// seçili methodun ihtiyaç duyduğu alanlar için açılır. Girilen değerler
// subscription_yekdem'e YAZILMAZ; hesapta kullanılır ve snapshot'a donar.

import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FilePlus2, Loader2, CheckCircle2, X } from "lucide-react";
import { useTesisListForReports } from "@/components/dashboard/reports/useTesisListForReports";
import {
  listEligiblePeriods,
  precheckBackdatedPeriod,
  createBackdatedInvoice,
  type EligiblePeriod,
  type BackdatedPrecheck,
  type BackdatedYekdemField,
} from "@/components/utils/backdatedInvoice";
import { isNetInvoiceMethod } from "@/lib/invoiceMethods";
import type { YekdemFallback } from "@/components/utils/billedInvoiceInputs";

type Props = {
  uid: string;
  onClose: () => void;
  /** Kayıt başarıyla oluşturulduğunda (done adımına geçerken) çağrılır. */
  onCreated: () => void;
};

type Step = "select" | "yekdem" | "done";

/** Virgül toleranslı sayı parse'ı; geçersiz/boş → null. */
const parseNum = (s: string): number | null => {
  const t = s.replace(",", ".").trim();
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
};

const inputCls =
  "h-10 w-full rounded-lg border border-neutral-300 bg-white px-3 text-sm text-neutral-900 focus:outline-none focus:ring-2 focus:ring-[#0A66FF]";

const fmtVal = (n: number) =>
  Number(n).toLocaleString("tr-TR", { maximumFractionDigits: 6 });

/** Salt okunur sistem değeri satırı — input DEĞİL, düz metin + işaret.
 *  Modül seviyesinde: her render'da yeni komponent tipi üretilmesin. */
function SystemRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2">
      <span className="text-sm text-neutral-600">{label}</span>
      <span className="flex items-center gap-2">
        <span className="text-sm font-medium text-neutral-900">{fmtVal(value)}</span>
        <span className="shrink-0 rounded-full bg-neutral-100 px-2 py-0.5 text-[11px] font-medium text-neutral-500">
          sistemden geldi
        </span>
      </span>
    </div>
  );
}

/** Manuel giriş satırı. Modül seviyesinde: inline tanım input focus'unu düşürür. */
function InputRow({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div>
      <label className="mb-1 block text-sm text-neutral-600">{label}</label>
      <input
        type="text"
        inputMode="decimal"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={inputCls}
      />
    </div>
  );
}

export default function BackdatedInvoiceModal({ uid, onClose, onCreated }: Props) {
  const navigate = useNavigate();
  const { tesisler, loading: tesislerLoading } = useTesisListForReports(uid, false);

  const [step, setStep] = useState<Step>("select");

  const [selectedSerno, setSelectedSerno] = useState<number | null>(null);
  const [periods, setPeriods] = useState<EligiblePeriod[] | null>(null);
  const [periodsLoading, setPeriodsLoading] = useState(false);
  const [selectedPeriod, setSelectedPeriod] = useState<EligiblePeriod | null>(null);
  const [precheck, setPrecheck] = useState<BackdatedPrecheck | null>(null);
  const [precheckLoading, setPrecheckLoading] = useState(false);
  const [flowErr, setFlowErr] = useState<string | null>(null);

  // Manuel girişler (yalnız ask edilen alanlar render edilir).
  const [fieldValues, setFieldValues] = useState<Record<BackdatedYekdemField, string>>({
    yekdemValue: "",
    usdKur: "",
    digerDegerler: "",
    prevYekdemValue: "",
    prevYekdemFinal: "",
  });

  const [creating, setCreating] = useState(false);
  const [createErr, setCreateErr] = useState<string | null>(null);

  // Tek tesis varsa otomatik seç.
  useEffect(() => {
    if (selectedSerno == null && tesisler.length === 1) {
      setSelectedSerno(tesisler[0].subscriptionSerNo);
    }
  }, [tesisler, selectedSerno]);

  // Tesis değişince uygun dönemleri yükle.
  useEffect(() => {
    setPeriods(null);
    setSelectedPeriod(null);
    setPrecheck(null);
    setFlowErr(null);
    if (selectedSerno == null) return;

    let cancel = false;
    (async () => {
      try {
        setPeriodsLoading(true);
        const list = await listEligiblePeriods({ userId: uid, subscriptionSerno: selectedSerno });
        if (!cancel) setPeriods(list);
      } catch (e: any) {
        if (!cancel) {
          setPeriods([]);
          setFlowErr(e?.message ?? "Uygun dönemler yüklenemedi.");
        }
      } finally {
        if (!cancel) setPeriodsLoading(false);
      }
    })();
    return () => {
      cancel = true;
    };
  }, [uid, selectedSerno]);

  // Dönem seçilince ön kontrol.
  useEffect(() => {
    setPrecheck(null);
    setFlowErr(null);
    if (selectedSerno == null || !selectedPeriod) return;

    let cancel = false;
    (async () => {
      try {
        setPrecheckLoading(true);
        const pc = await precheckBackdatedPeriod({
          userId: uid,
          subscriptionSerno: selectedSerno,
          periodYear: selectedPeriod.year,
          periodMonth: selectedPeriod.month,
        });
        if (!cancel) setPrecheck(pc);
      } catch (e: any) {
        if (!cancel) setFlowErr(e?.message ?? "Ön kontrol yapılamadı.");
      } finally {
        if (!cancel) setPrecheckLoading(false);
      }
    })();
    return () => {
      cancel = true;
    };
  }, [uid, selectedSerno, selectedPeriod]);

  const form = precheck?.ok ? precheck.form : null;

  // Alanın bu method için ANLAMLI olup olmadığı (salt okunur gösterim de buna bağlı).
  const relevance = useMemo(() => {
    if (!form) return null;
    // Metod 7 (Meram): önceki dönem YEKDEM mahsubu yok → prev alanları anlamsız.
    const needsPrev =
      (form.methodId === 1 || form.methodId === 6 || isNetInvoiceMethod(form.methodId)) &&
      form.methodId !== 7 &&
      !form.lisansliSatis &&
      form.prevConsumptionExists;
    return {
      yekdemValue: true,
      usdKur: form.methodId !== 4 && form.onYil && form.feedInEvidence,
      digerDegerler: true,
      prevYekdemValue: needsPrev,
      prevYekdemFinal: needsPrev,
    } as Record<BackdatedYekdemField, boolean>;
  }, [form]);

  // Validasyon: ask edilen zorunlular dolu + geçerli mi?
  const validation = useMemo(() => {
    if (!form) return { ok: false, msg: null as string | null };
    if (form.ask.yekdemValue) {
      const n = parseNum(fieldValues.yekdemValue);
      if (n == null || n < 0) return { ok: false, msg: null };
    }
    if (form.ask.usdKur) {
      const n = parseNum(fieldValues.usdKur);
      if (n == null || n <= 0) return { ok: false, msg: null };
    }
    if (form.ask.prevYekdemValue) {
      const n = parseNum(fieldValues.prevYekdemValue);
      if (n == null || n < 0) return { ok: false, msg: null };
    }
    if (form.ask.prevYekdemFinal) {
      const n = parseNum(fieldValues.prevYekdemFinal);
      if (n == null || n < 0) return { ok: false, msg: null };
    }
    // digerDegerler opsiyonel; doluysa geçerli sayı olmalı.
    if (form.ask.digerDegerler && fieldValues.digerDegerler.trim() !== "") {
      if (parseNum(fieldValues.digerDegerler) == null) {
        return { ok: false, msg: "Diğer bedeller geçerli bir sayı olmalı." };
      }
    }
    return { ok: true, msg: null };
  }, [form, fieldValues]);

  const handleCreate = async () => {
    if (!form || selectedSerno == null || !selectedPeriod || !validation.ok) return;
    try {
      setCreating(true);
      setCreateErr(null);

      // Yalnız ask edilen alanlar gönderilir; DB'de olan alan motorda zaten kazanır.
      const manual: YekdemFallback = {};
      if (form.ask.yekdemValue) manual.yekdemValue = parseNum(fieldValues.yekdemValue);
      if (form.ask.usdKur) manual.usdKur = parseNum(fieldValues.usdKur);
      if (form.ask.digerDegerler)
        manual.digerDegerler = parseNum(fieldValues.digerDegerler) ?? 0;
      if (form.ask.prevYekdemValue)
        manual.prevYekdemValue = parseNum(fieldValues.prevYekdemValue);
      if (form.ask.prevYekdemFinal)
        manual.prevYekdemFinal = parseNum(fieldValues.prevYekdemFinal);

      const res = await createBackdatedInvoice({
        userId: uid,
        subscriptionSerno: selectedSerno,
        periodYear: selectedPeriod.year,
        periodMonth: selectedPeriod.month,
        manual,
      });

      if (!res.ok) {
        setCreateErr(res.reason);
        return;
      }

      onCreated();
      setStep("done");
    } catch (e: any) {
      setCreateErr(e?.message ?? "Fatura oluşturulamadı.");
    } finally {
      setCreating(false);
    }
  };

  const selectedTesisLabel = useMemo(() => {
    const t = tesisler.find((x) => x.subscriptionSerNo === selectedSerno);
    if (!t) return selectedSerno != null ? String(selectedSerno) : "";
    return t.nickname ?? t.meterSerial ?? String(t.subscriptionSerNo);
  }, [tesisler, selectedSerno]);

  const setField = (f: BackdatedYekdemField) => (v: string) =>
    setFieldValues((prev) => ({ ...prev, [f]: v }));

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={() => {
        if (!creating) onClose();
      }}
    >
      <div
        className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-lg border border-neutral-200 bg-white p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Başlık */}
        <div className="mb-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <FilePlus2 className="h-5 w-5 text-[#00AEEF]" />
            <h3 className="text-base font-semibold text-neutral-900">
              Geçmiş Dönem Faturası Oluştur
            </h3>
          </div>
          <button
            onClick={onClose}
            disabled={creating}
            className="rounded p-1 text-neutral-400 transition hover:bg-neutral-100 hover:text-neutral-600 disabled:opacity-50"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* ── Adım 1: tesis + dönem seçimi + ön kontrol ── */}
        {step === "select" && (
          <div className="space-y-4">
            <div>
              <label className="mb-1 block text-sm text-neutral-600">Tesis</label>
              <select
                value={selectedSerno ?? ""}
                onChange={(e) =>
                  setSelectedSerno(e.target.value ? Number(e.target.value) : null)
                }
                className={inputCls}
              >
                <option value="">Tesis seçin…</option>
                {tesisler.map((t) => (
                  <option key={t.subscriptionSerNo} value={t.subscriptionSerNo}>
                    {t.nickname ?? t.meterSerial ?? t.subscriptionSerNo}
                  </option>
                ))}
              </select>
              {tesislerLoading && (
                <p className="mt-1 text-xs text-neutral-500">Tesisler yükleniyor…</p>
              )}
            </div>

            {selectedSerno != null && (
              <div>
                <label className="mb-1 block text-sm text-neutral-600">Dönem</label>
                {periodsLoading ? (
                  <p className="flex items-center gap-2 text-sm text-neutral-500">
                    <Loader2 className="h-4 w-4 animate-spin" /> Uygun dönemler yükleniyor…
                  </p>
                ) : periods && periods.length === 0 ? (
                  <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-3 text-sm text-neutral-600">
                    Bu tesis için oluşturulabilecek geçmiş dönem bulunmuyor. (Mayıs 2026
                    sonrası, tüketim verisi olan ve kayıtlı faturası olmayan dönemler
                    listelenir.)
                  </div>
                ) : (
                  <select
                    value={selectedPeriod ? `${selectedPeriod.year}-${selectedPeriod.month}` : ""}
                    onChange={(e) => {
                      const v = e.target.value;
                      setSelectedPeriod(
                        v ? periods?.find((p) => `${p.year}-${p.month}` === v) ?? null : null
                      );
                    }}
                    className={inputCls}
                  >
                    <option value="">Dönem seçin…</option>
                    {(periods ?? []).map((p) => (
                      <option key={`${p.year}-${p.month}`} value={`${p.year}-${p.month}`}>
                        {p.label}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            )}

            {precheckLoading && (
              <p className="flex items-center gap-2 text-sm text-neutral-500">
                <Loader2 className="h-4 w-4 animate-spin" /> Ön kontrol yapılıyor…
              </p>
            )}

            {flowErr && (
              <div className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-700">
                {flowErr}
              </div>
            )}

            {/* Eksik zorunlu veri: akış başlatılmaz, eksikler açıkça listelenir. */}
            {precheck && !precheck.ok && (
              <div className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-700">
                <p className="mb-1 font-medium">Bu dönem için fatura oluşturulamıyor:</p>
                <ul className="list-disc space-y-0.5 pl-5">
                  {precheck.missingHard.map((m) => (
                    <li key={m}>{m}</li>
                  ))}
                </ul>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={onClose}
                className="h-10 rounded-lg border border-neutral-300 bg-white px-4 text-sm text-neutral-700 hover:bg-neutral-50"
              >
                Vazgeç
              </button>
              <button
                onClick={() => setStep("yekdem")}
                disabled={!precheck?.ok}
                className="h-10 rounded-lg bg-[#00AEEF] px-4 text-sm font-medium text-white transition-colors hover:bg-[#40CFFF] disabled:opacity-50"
              >
                Devam
              </button>
            </div>
          </div>
        )}

        {/* ── Adım 2: YEKDEM değerleri (sistem = salt okunur; eksik = input) ── */}
        {step === "yekdem" && form && relevance && (
          <div className="space-y-4">
            <div className="rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm text-neutral-600">
              <span className="font-medium text-neutral-900">{form.periodLabel}</span> •{" "}
              {selectedTesisLabel}
            </div>

            <div className="space-y-2">
              {/* Dönem M */}
              {form.ask.yekdemValue ? (
                <InputRow
                  label={`YEKDEM değeri (tahmini, TL/kWh) — ${form.periodLabel}`}
                  value={fieldValues.yekdemValue}
                  onChange={setField("yekdemValue")}
                  placeholder="örn. 0,42399"
                />
              ) : (
                form.system.yekdemValue != null && (
                  <SystemRow
                    label={`YEKDEM değeri (tahmini) — ${form.periodLabel}`}
                    value={form.system.yekdemValue}
                  />
                )
              )}

              {relevance.usdKur &&
                (form.ask.usdKur ? (
                  <InputRow
                    label={`USD kuru — ${form.periodLabel} (10 yıllık tesis satış fiyatı için)`}
                    value={fieldValues.usdKur}
                    onChange={setField("usdKur")}
                    placeholder="örn. 41,50"
                  />
                ) : (
                  form.system.usdKur != null && (
                    <SystemRow label={`USD kuru — ${form.periodLabel}`} value={form.system.usdKur} />
                  )
                ))}

              {form.ask.digerDegerler ? (
                <InputRow
                  label={`Diğer bedeller (TL, boş = 0) — ${form.periodLabel}`}
                  value={fieldValues.digerDegerler}
                  onChange={setField("digerDegerler")}
                  placeholder="opsiyonel"
                />
              ) : (
                form.system.digerDegerler != null && (
                  <SystemRow
                    label={`Diğer bedeller — ${form.periodLabel}`}
                    value={form.system.digerDegerler}
                  />
                )
              )}

              {/* Dönem M-1 (mahsup / YEK Farkı girdileri) */}
              {relevance.prevYekdemValue &&
                (form.ask.prevYekdemValue ? (
                  <InputRow
                    label={`YEKDEM değeri (tahmini, TL/kWh) — ${form.prevPeriodLabel}`}
                    value={fieldValues.prevYekdemValue}
                    onChange={setField("prevYekdemValue")}
                    placeholder="örn. 0,58099"
                  />
                ) : (
                  form.system.prevYekdemValue != null && (
                    <SystemRow
                      label={`YEKDEM değeri (tahmini) — ${form.prevPeriodLabel}`}
                      value={form.system.prevYekdemValue}
                    />
                  )
                ))}

              {relevance.prevYekdemFinal &&
                (form.ask.prevYekdemFinal ? (
                  <InputRow
                    label={`YEKDEM kesinleşen (TL/kWh) — ${form.prevPeriodLabel}`}
                    value={fieldValues.prevYekdemFinal}
                    onChange={setField("prevYekdemFinal")}
                    placeholder="örn. 1,083629"
                  />
                ) : (
                  form.system.prevYekdemFinal != null && (
                    <SystemRow
                      label={`YEKDEM kesinleşen — ${form.prevPeriodLabel}`}
                      value={form.system.prevYekdemFinal}
                    />
                  )
                ))}

              {(form.methodId === 1 || form.methodId === 6 || isNetInvoiceMethod(form.methodId)) &&
                form.methodId !== 7 &&
                !form.lisansliSatis &&
                !form.prevConsumptionExists && (
                  <p className="text-xs text-neutral-500">
                    Önceki dönem ({form.prevPeriodLabel}) tüketim verisi yok; YEKDEM
                    mahsubu / YEK Farkı hesaplanmayacak.
                  </p>
                )}
            </div>

            {validation.msg && (
              <div className="rounded border border-red-300 bg-red-50 p-2 text-sm text-red-700">
                {validation.msg}
              </div>
            )}

            {createErr && (
              <div className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-700">
                {createErr}
              </div>
            )}

            <div className="flex justify-between gap-2 pt-2">
              <button
                onClick={() => {
                  setCreateErr(null);
                  setStep("select");
                }}
                disabled={creating}
                className="h-10 rounded-lg border border-neutral-300 bg-white px-4 text-sm text-neutral-700 hover:bg-neutral-50 disabled:opacity-50"
              >
                ← Geri
              </button>
              <button
                onClick={handleCreate}
                disabled={creating || !validation.ok}
                className="flex h-10 items-center gap-2 rounded-lg bg-[#00AEEF] px-4 text-sm font-medium text-white transition-colors hover:bg-[#40CFFF] disabled:opacity-50"
              >
                {creating && <Loader2 className="h-4 w-4 animate-spin" />}
                Faturayı Oluştur
              </button>
            </div>
          </div>
        )}

        {/* ── Adım 3: başarı ── */}
        {step === "done" && selectedPeriod && selectedSerno != null && (
          <div className="space-y-4 py-2 text-center">
            <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-500" />
            <div>
              <p className="text-sm font-medium text-neutral-900">
                Geriye dönük fatura oluşturuldu.
              </p>
              <p className="mt-1 text-sm text-neutral-500">
                {selectedPeriod.label} • {selectedTesisLabel}
              </p>
            </div>
            <div className="flex justify-center gap-2 pt-1">
              <button
                onClick={onClose}
                className="h-10 rounded-lg border border-neutral-300 bg-white px-4 text-sm text-neutral-700 hover:bg-neutral-50"
              >
                Kapat
              </button>
              <button
                onClick={() => {
                  onClose();
                  navigate(
                    `/dashboard/invoices/${selectedSerno}/${selectedPeriod.year}/${String(
                      selectedPeriod.month
                    ).padStart(2, "0")}?type=backdated`
                  );
                }}
                className="h-10 rounded-lg bg-[#00AEEF] px-4 text-sm font-medium text-white transition-colors hover:bg-[#40CFFF]"
              >
                Faturayı Aç
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
