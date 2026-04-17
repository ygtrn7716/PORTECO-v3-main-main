import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { Eye, EyeOff, ChevronDown, Plus, Minus, ArrowLeft, ArrowRight, Check, Loader2 } from "lucide-react";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type Step1 = {
  ad_soyad: string;
  telefon: string;
  firma_adi: string;
  osos_kullanici: string;
  osos_sifre: string;
  tesis_sayisi: number;
};

type Tesis = {
  tesis_no: number;
  kbk: number | null;
  terim: string;
  tarife: string;
  gerilim: string;
  guc_bedel_limit: number | null;
  trafo_degeri: number | null;
  yekdem_tahmin_1: number | null;
  yekdem_final_1: number | null;
  yekdem_tahmin_2: number | null;
  yekdem_final_2: number | null;
};

type Errors = Record<string, string>;

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

const PHONE_RE = /^0?5\d{9}$/;

function emptyTesis(n: number): Tesis {
  return {
    tesis_no: n,
    kbk: 1,
    terim: "",
    tarife: "",
    gerilim: "",
    guc_bedel_limit: null,
    trafo_degeri: null,
    yekdem_tahmin_1: null,
    yekdem_final_1: null,
    yekdem_tahmin_2: null,
    yekdem_final_2: null,
  };
}

function numOrNull(v: string): number | null {
  return v === "" ? null : Number(v);
}

function d(v: number | null | undefined): string {
  return v == null ? "" : String(v);
}

/* ------------------------------------------------------------------ */
/*  Styled select wrapper                                              */
/* ------------------------------------------------------------------ */

function StyledSelect({
  value,
  onChange,
  options,
  placeholder,
  error,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  placeholder: string;
  error?: boolean;
}) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`w-full appearance-none rounded-lg border bg-slate-800/50 px-3 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/50 ${
          error ? "border-red-500" : "border-slate-600"
        } ${!value ? "text-slate-400" : ""}`}
      >
        <option value="" className="text-slate-400">{placeholder}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value} className="text-white bg-slate-800">
            {o.label}
          </option>
        ))}
      </select>
      <ChevronDown size={14} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Number input with unit                                             */
/* ------------------------------------------------------------------ */

function UnitInput({
  value,
  onChange,
  step,
  unit,
  placeholder,
  error,
}: {
  value: string;
  onChange: (v: string) => void;
  step?: string;
  unit?: string;
  placeholder?: string;
  error?: boolean;
}) {
  return (
    <div className="relative">
      <input
        type="number"
        step={step}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={`w-full rounded-lg border bg-slate-800/50 px-3 py-2.5 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 ${
          error ? "border-red-500" : "border-slate-600"
        } ${unit ? "pr-16" : ""}`}
      />
      {unit && (
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400">
          {unit}
        </span>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function IntakeFormPage() {
  const [step, setStep] = useState(1);
  const [showPass, setShowPass] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<Errors>({});

  // Step 1 state
  const [s1, setS1] = useState<Step1>({
    ad_soyad: "",
    telefon: "",
    firma_adi: "",
    osos_kullanici: "",
    osos_sifre: "",
    tesis_sayisi: 1,
  });

  // Step 2 state
  const [tesisler, setTesisler] = useState<Tesis[]>([emptyTesis(1)]);

  /* ---------- Validation ---------- */

  function validateStep1(): boolean {
    const e: Errors = {};
    if (!s1.ad_soyad.trim()) e.ad_soyad = "Ad Soyad zorunlu.";
    if (!s1.telefon.trim()) e.telefon = "Telefon zorunlu.";
    else if (!PHONE_RE.test(s1.telefon.replace(/\s/g, ""))) e.telefon = "Geçerli bir telefon girin (05xx xxx xx xx).";
    if (!s1.firma_adi.trim()) e.firma_adi = "Firma adı zorunlu.";
    if (!s1.osos_kullanici.trim()) e.osos_kullanici = "OSOS kullanıcı adı zorunlu.";
    if (!s1.osos_sifre.trim()) e.osos_sifre = "OSOS şifresi zorunlu.";
    if (s1.tesis_sayisi < 1 || s1.tesis_sayisi > 20) e.tesis_sayisi = "1-20 arası olmalı.";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  function validateStep2(): boolean {
    const e: Errors = {};
    tesisler.forEach((t, i) => {
      if (!t.terim) e[`t${i}_terim`] = "Seçiniz.";
      if (!t.tarife) e[`t${i}_tarife`] = "Seçiniz.";
      if (!t.gerilim) e[`t${i}_gerilim`] = "Seçiniz.";
    });
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  /* ---------- Step navigation ---------- */

  function goToStep2() {
    if (!validateStep1()) return;
    // Sync tesisler array with tesis_sayisi
    const count = s1.tesis_sayisi;
    setTesisler((prev) => {
      const next = [...prev];
      while (next.length < count) next.push(emptyTesis(next.length + 1));
      while (next.length > count) next.pop();
      return next;
    });
    setErrors({});
    setStep(2);
  }

  /* ---------- Tesis update helper ---------- */

  function updateTesis(idx: number, patch: Partial<Tesis>) {
    setTesisler((prev) => prev.map((t, i) => (i === idx ? { ...t, ...patch } : t)));
  }

  /* ---------- Submit ---------- */

  async function handleSubmit() {
    if (!validateStep2()) return;
    setSubmitting(true);
    const { error } = await supabase.from("intake_forms").insert({
      ad_soyad: s1.ad_soyad.trim(),
      telefon: s1.telefon.trim(),
      firma_adi: s1.firma_adi.trim(),
      osos_kullanici: s1.osos_kullanici.trim(),
      osos_sifre: s1.osos_sifre,
      tesis_sayisi: s1.tesis_sayisi,
      tesisler,
    });
    setSubmitting(false);
    if (error) {
      if (error.message?.includes("Rate limit")) {
        setErrors({ submit: "Çok fazla gönderim yaptınız. Lütfen daha sonra tekrar deneyin." });
      } else {
        setErrors({ submit: "Gönderim sırasında hata oluştu. Lütfen tekrar deneyin." });
      }
      return;
    }
    setStep(3);
  }

  /* ================================================================ */
  /*  Render                                                           */
  /* ================================================================ */

  const INPUT_CLS =
    "w-full rounded-lg border border-slate-600 bg-slate-800/50 px-3 py-2.5 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/50";
  const ERR_INPUT = INPUT_CLS.replace("border-slate-600", "border-red-500");
  const LABEL = "block text-xs font-medium text-slate-300 mb-1.5";

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-900 via-[#0B1C33] to-slate-900">
      {/* Background glow */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -top-32 left-1/2 -translate-x-1/2 w-[600px] h-[600px] rounded-full bg-emerald-500/[0.07] blur-[120px]" />
      </div>

      <div className="relative mx-auto max-w-2xl px-4 py-8 md:py-16">
        {/* Logo */}
        <div className="flex justify-center mb-8">
          <img src="/features/eco-logo-light.png" alt="PortEco" className="h-10 md:h-12" />
        </div>

        {/* Progress bar */}
        {step < 3 && (
          <div className="mb-8">
            <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
              <span>Adım {step} / 2</span>
              <span>{step === 1 ? "Kişisel Bilgiler" : "Tesis Bilgileri"}</span>
            </div>
            <div className="h-1 rounded-full bg-slate-700">
              <div
                className="h-1 rounded-full bg-gradient-to-r from-emerald-500 to-green-400 transition-all duration-500"
                style={{ width: step === 1 ? "50%" : "100%" }}
              />
            </div>
          </div>
        )}

        {/* ===================== STEP 1 ===================== */}
        {step === 1 && (
          <div className="rounded-2xl border border-slate-700/60 bg-slate-800/40 backdrop-blur-sm p-6 md:p-8 shadow-xl">
            <h1 className="text-xl font-semibold text-white mb-1">Kişisel Bilgiler</h1>
            <p className="text-sm text-slate-400 mb-6">Lütfen aşağıdaki bilgileri eksiksiz doldurun.</p>

            <div className="space-y-4">
              {/* Ad Soyad */}
              <label className="block">
                <span className={LABEL}>Ad Soyad</span>
                <input
                  type="text"
                  value={s1.ad_soyad}
                  onChange={(e) => setS1((p) => ({ ...p, ad_soyad: e.target.value }))}
                  placeholder="Adınız Soyadınız"
                  className={errors.ad_soyad ? ERR_INPUT : INPUT_CLS}
                />
                {errors.ad_soyad && <p className="mt-1 text-xs text-red-400">{errors.ad_soyad}</p>}
              </label>

              {/* Telefon */}
              <label className="block">
                <span className={LABEL}>Telefon Numarası</span>
                <input
                  type="tel"
                  value={s1.telefon}
                  onChange={(e) => setS1((p) => ({ ...p, telefon: e.target.value }))}
                  placeholder="05xx xxx xx xx"
                  className={errors.telefon ? ERR_INPUT : INPUT_CLS}
                />
                {errors.telefon && <p className="mt-1 text-xs text-red-400">{errors.telefon}</p>}
              </label>

              {/* Firma Adı */}
              <label className="block">
                <span className={LABEL}>Firma Adı</span>
                <input
                  type="text"
                  value={s1.firma_adi}
                  onChange={(e) => setS1((p) => ({ ...p, firma_adi: e.target.value }))}
                  placeholder="Şirket adınız"
                  className={errors.firma_adi ? ERR_INPUT : INPUT_CLS}
                />
                {errors.firma_adi && <p className="mt-1 text-xs text-red-400">{errors.firma_adi}</p>}
              </label>

              {/* OSOS Kullanıcı */}
              <label className="block">
                <span className={LABEL}>OSOS Kullanıcı Adı</span>
                <input
                  type="text"
                  value={s1.osos_kullanici}
                  onChange={(e) => setS1((p) => ({ ...p, osos_kullanici: e.target.value }))}
                  placeholder="OSOS kullanıcı adınız"
                  className={errors.osos_kullanici ? ERR_INPUT : INPUT_CLS}
                />
                {errors.osos_kullanici && <p className="mt-1 text-xs text-red-400">{errors.osos_kullanici}</p>}
              </label>

              {/* OSOS Şifre */}
              <label className="block">
                <span className={LABEL}>OSOS Şifresi</span>
                <div className="relative">
                  <input
                    type={showPass ? "text" : "password"}
                    value={s1.osos_sifre}
                    onChange={(e) => setS1((p) => ({ ...p, osos_sifre: e.target.value }))}
                    placeholder="OSOS şifreniz"
                    className={errors.osos_sifre ? ERR_INPUT : INPUT_CLS}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPass((p) => !p)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200"
                  >
                    {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
                {errors.osos_sifre && <p className="mt-1 text-xs text-red-400">{errors.osos_sifre}</p>}
              </label>

              {/* Tesis Sayısı — stepper */}
              <div>
                <span className={LABEL}>Kaç adet tesis bağlı?</span>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setS1((p) => ({ ...p, tesis_sayisi: Math.max(1, p.tesis_sayisi - 1) }))}
                    className="flex h-10 w-10 items-center justify-center rounded-lg border border-slate-600 bg-slate-800/50 text-slate-300 hover:bg-slate-700 transition-colors"
                  >
                    <Minus size={16} />
                  </button>
                  <span className="min-w-[3rem] text-center text-lg font-semibold text-white">
                    {s1.tesis_sayisi}
                  </span>
                  <button
                    onClick={() => setS1((p) => ({ ...p, tesis_sayisi: Math.min(20, p.tesis_sayisi + 1) }))}
                    className="flex h-10 w-10 items-center justify-center rounded-lg border border-slate-600 bg-slate-800/50 text-slate-300 hover:bg-slate-700 transition-colors"
                  >
                    <Plus size={16} />
                  </button>
                </div>
                {errors.tesis_sayisi && <p className="mt-1 text-xs text-red-400">{errors.tesis_sayisi}</p>}
              </div>
            </div>

            {/* Next */}
            <button
              onClick={goToStep2}
              className="mt-8 flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-600 to-green-500 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-emerald-500/20 hover:shadow-emerald-500/30 transition-shadow"
            >
              Devam Et <ArrowRight size={16} />
            </button>
          </div>
        )}

        {/* ===================== STEP 2 ===================== */}
        {step === 2 && (
          <div className="space-y-4">
            <h1 className="text-xl font-semibold text-white mb-1">Tesis Bilgileri</h1>
            <p className="text-sm text-slate-400 mb-2">Her tesisiniz için aşağıdaki bilgileri doldurun.</p>

            {tesisler.map((t, idx) => (
              <div
                key={idx}
                className="rounded-2xl border border-slate-700/60 bg-slate-800/40 backdrop-blur-sm shadow-xl overflow-hidden"
              >
                {/* Facility header */}
                <div className="flex items-center gap-2 border-b border-slate-700/40 px-5 py-3 bg-slate-800/60">
                  <span className="rounded-full bg-emerald-600/20 border border-emerald-500/30 px-2.5 py-0.5 text-xs font-semibold text-emerald-400">
                    Tesis #{idx + 1}
                  </span>
                </div>

                <div className="border-l-2 border-emerald-500/30 ml-4 pl-4 pr-5 py-4 space-y-4">
                  {/* Row 1: KBK + Terim */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <label className="block">
                      <span className={LABEL}>KBK (Çarpan)</span>
                      <UnitInput
                        value={d(t.kbk)}
                        onChange={(v) => updateTesis(idx, { kbk: numOrNull(v) })}
                        step="0.001"
                      />
                    </label>
                    <label className="block">
                      <span className={LABEL}>Mevcut Terim</span>
                      <StyledSelect
                        value={t.terim}
                        onChange={(v) => updateTesis(idx, { terim: v })}
                        options={[
                          { value: "I. Terim", label: "I. Terim" },
                          { value: "II. Terim", label: "II. Terim" },
                        ]}
                        placeholder="Seçiniz"
                        error={!!errors[`t${idx}_terim`]}
                      />
                      {errors[`t${idx}_terim`] && <p className="mt-1 text-xs text-red-400">{errors[`t${idx}_terim`]}</p>}
                    </label>
                  </div>

                  {/* Row 2: Tarife + Gerilim */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <label className="block">
                      <span className={LABEL}>Mevcut Tarife</span>
                      <StyledSelect
                        value={t.tarife}
                        onChange={(v) => updateTesis(idx, { tarife: v })}
                        options={[
                          { value: "Tek Zamanlı", label: "Tek Zamanlı" },
                          { value: "Çift Zamanlı", label: "Çift Zamanlı" },
                          { value: "Üç Zamanlı", label: "Üç Zamanlı" },
                        ]}
                        placeholder="Seçiniz"
                        error={!!errors[`t${idx}_tarife`]}
                      />
                      {errors[`t${idx}_tarife`] && <p className="mt-1 text-xs text-red-400">{errors[`t${idx}_tarife`]}</p>}
                    </label>
                    <label className="block">
                      <span className={LABEL}>Mevcut Gerilim Tipi</span>
                      <StyledSelect
                        value={t.gerilim}
                        onChange={(v) => updateTesis(idx, { gerilim: v })}
                        options={[
                          { value: "AG", label: "AG" },
                          { value: "OG", label: "OG" },
                          { value: "YG", label: "YG" },
                        ]}
                        placeholder="Seçiniz"
                        error={!!errors[`t${idx}_gerilim`]}
                      />
                      {errors[`t${idx}_gerilim`] && <p className="mt-1 text-xs text-red-400">{errors[`t${idx}_gerilim`]}</p>}
                    </label>
                  </div>

                  {/* Row 3: Güç Bedeli + Trafo */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <label className="block">
                      <span className={LABEL}>Sözleşme Güç Bedeli</span>
                      <UnitInput
                        value={d(t.guc_bedel_limit)}
                        onChange={(v) => updateTesis(idx, { guc_bedel_limit: numOrNull(v) })}
                        unit="kW"
                      />
                    </label>
                    <label className="block">
                      <span className={LABEL}>Trafo Kaybı</span>
                      <UnitInput
                        value={d(t.trafo_degeri)}
                        onChange={(v) => updateTesis(idx, { trafo_degeri: numOrNull(v) })}
                        step="0.001"
                      />
                    </label>
                  </div>

                  {/* YEKDEM section header */}
                  <div className="pt-2">
                    <p className="text-xs font-medium text-emerald-400 mb-3 uppercase tracking-wider">YEKDEM Değerleri</p>
                  </div>

                  {/* YEKDEM: Geçen Ay */}
                  <div>
                    <p className="text-xs text-slate-400 mb-2">Geçen Ay</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <label className="block">
                        <span className={LABEL}>Tahmini</span>
                        <UnitInput
                          value={d(t.yekdem_tahmin_1)}
                          onChange={(v) => updateTesis(idx, { yekdem_tahmin_1: numOrNull(v) })}
                          step="0.00001"
                          unit="TL/kWh"
                        />
                      </label>
                      <label className="block">
                        <span className={LABEL}>Finali</span>
                        <UnitInput
                          value={d(t.yekdem_final_1)}
                          onChange={(v) => updateTesis(idx, { yekdem_final_1: numOrNull(v) })}
                          step="0.00001"
                          unit="TL/kWh"
                        />
                      </label>
                    </div>
                  </div>

                  {/* YEKDEM: 2 Ay Önce */}
                  <div>
                    <p className="text-xs text-slate-400 mb-2">2 Ay Önce</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <label className="block">
                        <span className={LABEL}>Tahmini</span>
                        <UnitInput
                          value={d(t.yekdem_tahmin_2)}
                          onChange={(v) => updateTesis(idx, { yekdem_tahmin_2: numOrNull(v) })}
                          step="0.00001"
                          unit="TL/kWh"
                        />
                      </label>
                      <label className="block">
                        <span className={LABEL}>Finali</span>
                        <UnitInput
                          value={d(t.yekdem_final_2)}
                          onChange={(v) => updateTesis(idx, { yekdem_final_2: numOrNull(v) })}
                          step="0.00001"
                          unit="TL/kWh"
                        />
                      </label>
                    </div>
                  </div>
                </div>
              </div>
            ))}

            {/* Submit error */}
            {errors.submit && (
              <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400">
                {errors.submit}
              </div>
            )}

            {/* Navigation */}
            <div className="flex gap-3 pt-2">
              <button
                onClick={() => { setErrors({}); setStep(1); }}
                className="flex items-center gap-2 rounded-xl border border-slate-600 px-5 py-3 text-sm font-medium text-slate-300 hover:bg-slate-800 transition-colors"
              >
                <ArrowLeft size={16} /> Geri
              </button>
              <button
                disabled={submitting}
                onClick={handleSubmit}
                className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-600 to-green-500 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-emerald-500/20 hover:shadow-emerald-500/30 disabled:opacity-60 transition-all"
              >
                {submitting ? (
                  <>
                    <Loader2 size={16} className="animate-spin" /> Gönderiliyor...
                  </>
                ) : (
                  "Formu Gönder"
                )}
              </button>
            </div>
          </div>
        )}

        {/* ===================== STEP 3 — SUCCESS ===================== */}
        {step === 3 && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-emerald-500/20 ring-2 ring-emerald-500/30 animate-[scale-in_0.4s_ease-out]">
              <Check size={36} className="text-emerald-400" />
            </div>
            <h1 className="text-2xl font-bold text-white mb-2">Başvurunuz Alındı!</h1>
            <p className="text-sm text-slate-400 max-w-sm">
              Ekibimiz en kısa sürede sizinle iletişime geçecektir.
            </p>
            <p className="mt-8 text-xs text-slate-500">Bu pencereyi kapatabilirsiniz.</p>
          </div>
        )}
      </div>
    </div>
  );
}
