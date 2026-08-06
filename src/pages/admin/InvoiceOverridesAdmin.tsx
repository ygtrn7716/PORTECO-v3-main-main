// src/pages/admin/InvoiceOverridesAdmin.tsx
//
// Admin "Fatura Düzenleme" sayfası (Aşama 2).
// Düzen AdminUsersPage ile birebir: [kullanıcılar] [tesisler] [düzenleme paneli].
//
// Admin, tesis+ay bazında fatura kalemlerini düzenler (invoice_line_overrides):
// birim fiyat, tutar sabitleme, kalemi faturadan çıkarma, reaktif Ri/Rc değeri.
// Kaydetmeden önce "Doğal vs Düzenlenmiş" canlı önizleme gösterilir.

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { dayjsTR } from "@/lib/dayjs";
import { Search, ChevronLeft, ChevronRight, RotateCcw } from "lucide-react";
import Modal from "@/components/admin/dataHealth/Modal";
import {
  fetchBilledInvoiceInputs,
  buildBreakdownFromInputs,
  type BilledInvoiceInputs,
  type BilledInvoiceResult,
} from "@/components/utils/billedInvoiceInputs";
import {
  fetchInvoiceOverrides,
  upsertInvoiceOverride,
  deleteInvoiceOverride,
  deleteInvoiceOverridesForPeriod,
  type InvoiceOverrideItemKey,
  type InvoiceOverrides,
} from "@/components/utils/invoiceOverrides";
import {
  getInvoiceSnapshot,
  upsertInvoiceSnapshot,
  snapshotParamsFromEngine,
} from "@/components/utils/invoiceSnapshots";

const MONTH_NAMES = [
  "Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran",
  "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık",
];

const ITEM_LABELS: Record<InvoiceOverrideItemKey, string> = {
  enerji: "Enerji Bedeli",
  trafo: "Trafo Kaybı",
  dagitim: "Dağıtım Bedeli",
  btv: "BTV",
  guc: "Güç Bedeli",
  reaktif: "Reaktif Ceza Bedeli",
  yekdem_mahsup: "YEKDEM Mahsubu",
  mahsuplasma: "Mahsuplaşma Fiyatı (boş = otomatik: perakende − (mahsup PTF + YEKDEM) × KBK)",
};

/**
 * Kalem tablosunda gösterilen anahtarlar. 'yekdem_mahsup' BİLİNÇLİ olarak yok:
 * o bir fatura kalemi değil (calculateInvoice'ın dışında hesaplanır) ve kendi
 * kartında düzenlenir. ITEM_ORDER üzerinde dönen tüm akışlar (draft dönüşümleri,
 * görünürlük guard'ı, persist) onu ayrıca ele alır.
 */
const ITEM_ORDER: InvoiceOverrideItemKey[] = [
  "enerji", "trafo", "dagitim", "btv", "guc", "reaktif", "mahsuplasma",
];

/** Yalnız enerji/dagitim/mahsuplasma kaleminde birim fiyat override'ı anlamlı.
 *  (mahsuplasma: metod 3 muhtelif-2 kredisinin fiyatı; motor yalnız unitPrice okur.) */
const UNIT_PRICE_ITEMS = new Set<InvoiceOverrideItemKey>(["enerji", "dagitim", "mahsuplasma"]);

// ---- formatters (InvoiceDetail ile aynı)
const fmtMoney2 = (n: number | null | undefined) =>
  n == null || !Number.isFinite(Number(n))
    ? "—"
    : Number(n).toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const fmtUnit = (n: number | null | undefined) =>
  n == null || !Number.isFinite(Number(n))
    ? "—"
    : Number(n).toLocaleString("tr-TR", { minimumFractionDigits: 6, maximumFractionDigits: 6 });

const fmtKwh = (n: number | null | undefined) =>
  n == null || !Number.isFinite(Number(n))
    ? "—"
    : Number(n).toLocaleString("tr-TR", { maximumFractionDigits: 0 });

// AdminUsersPage:86-92 ile aynı yardımcılar
const numOrNull = (v: string): number | null => (v === "" ? null : Number(v));
const d = (v: number | null | undefined): string => (v == null ? "" : String(v));

type UserRow = { user_id: string; aril_user: string | null; subCount: number };

type FacilityRow = {
  subscription_serno: number;
  title: string | null;
  meter_serial: string | null;
  nickname: string | null;
  provider: string | null;
  terim: string | null;
  trafo_degeri: number | null;
};

/** Form satırı — string'ler kontrollü input için (boş ≠ 0). */
type DraftRow = {
  isExcluded: boolean;
  unitPrice: string;
  amount: string;
  note: string;
  riKwh: string; // yalnız reaktif
  rcKwh: string; // yalnız reaktif
  totalKwh: string; // yalnız yekdem_mahsup — mahsup dönemi toplam tüketim
  diffYekdem: string; // yalnız yekdem_mahsup — YEKDEM farkı (TL/kWh)
};

type Draft = Record<InvoiceOverrideItemKey, DraftRow>;

const emptyRow = (): DraftRow => ({
  isExcluded: false,
  unitPrice: "",
  amount: "",
  note: "",
  riKwh: "",
  rcKwh: "",
  totalKwh: "",
  diffYekdem: "",
});

const emptyDraft = (): Draft => ({
  enerji: emptyRow(),
  trafo: emptyRow(),
  dagitim: emptyRow(),
  btv: emptyRow(),
  guc: emptyRow(),
  reaktif: emptyRow(),
  yekdem_mahsup: emptyRow(),
  mahsuplasma: emptyRow(),
});

/** DB'den gelen override'ları form taslağına çevirir. */
function draftFromOverrides(ov: InvoiceOverrides | null): Draft {
  const out = emptyDraft();
  if (!ov) return out;
  for (const key of ITEM_ORDER) {
    const item = ov[key];
    if (!item) continue;
    out[key] = {
      isExcluded: item.isExcluded,
      unitPrice: d(item.unitPriceOverride),
      amount: d(item.amountOverride),
      note: item.note ?? "",
      riKwh: key === "reaktif" ? d(item.payload?.ri_kwh ?? null) : "",
      rcKwh: key === "reaktif" ? d(item.payload?.rc_kwh ?? null) : "",
      totalKwh: "",
      diffYekdem: "",
    };
  }

  // YEKDEM mahsubu ITEM_ORDER dışında (kalem değil) — kendi kartı.
  const mahsup = ov.yekdem_mahsup;
  if (mahsup) {
    out.yekdem_mahsup = {
      ...emptyRow(),
      isExcluded: mahsup.isExcluded,
      note: mahsup.note ?? "",
      totalKwh: d(mahsup.payload?.total_kwh ?? null),
      diffYekdem: d(mahsup.payload?.diff_yekdem ?? null),
    };
  }
  return out;
}

/** Form taslağını calculateInvoice'ın beklediği InvoiceOverrides'a çevirir. */
function overridesFromDraft(draft: Draft): InvoiceOverrides {
  const out: InvoiceOverrides = {};
  for (const key of ITEM_ORDER) {
    const row = draft[key];
    const unitPriceOverride = UNIT_PRICE_ITEMS.has(key) ? numOrNull(row.unitPrice) : null;
    const amountOverride = numOrNull(row.amount);

    let payload: { ri_kwh?: number; rc_kwh?: number } | null = null;
    if (key === "reaktif") {
      const ri = numOrNull(row.riKwh);
      const rc = numOrNull(row.rcKwh);
      if (ri != null || rc != null) {
        payload = {};
        if (ri != null) payload.ri_kwh = ri;
        if (rc != null) payload.rc_kwh = rc;
      }
    }

    // Etkisi olmayan kalem override objesine hiç girmez → boş override
    // verildiğinde calculateInvoice çıktısı bit-identik kalır.
    if (!row.isExcluded && unitPriceOverride == null && amountOverride == null && !payload) {
      continue;
    }

    out[key] = {
      isExcluded: row.isExcluded,
      unitPriceOverride,
      amountOverride,
      payload,
      note: row.note.trim() || null,
    };
  }

  // YEKDEM mahsubu — kalem değil; yalnız payload + is_excluded taşır.
  const mRow = draft.yekdem_mahsup;
  const mTotalKwh = numOrNull(mRow.totalKwh);
  const mDiff = numOrNull(mRow.diffYekdem);
  let mPayload: { total_kwh?: number; diff_yekdem?: number } | null = null;
  if (mTotalKwh != null || mDiff != null) {
    mPayload = {};
    if (mTotalKwh != null) mPayload.total_kwh = mTotalKwh;
    if (mDiff != null) mPayload.diff_yekdem = mDiff;
  }
  if (mRow.isExcluded || mPayload) {
    out.yekdem_mahsup = {
      isExcluded: mRow.isExcluded,
      unitPriceOverride: null,
      amountOverride: null,
      payload: mPayload,
      note: mRow.note.trim() || null,
    };
  }

  return out;
}

/** Son 24 ay (bugün dahil değil — M-1'den geriye). */
function buildPeriodOptions(): { year: number; month: number; label: string }[] {
  const out: { year: number; month: number; label: string }[] = [];
  let cur = dayjsTR().subtract(1, "month");
  for (let i = 0; i < 24; i++) {
    out.push({
      year: cur.year(),
      month: cur.month() + 1,
      label: `${MONTH_NAMES[cur.month()]} ${cur.year()}`,
    });
    cur = cur.subtract(1, "month");
  }
  return out;
}

export default function InvoiceOverridesAdmin() {
  /* ---------- Left panel ---------- */
  const [users, setUsers] = useState<UserRow[]>([]);
  const [usersLoading, setUsersLoading] = useState(true);
  const [usersError, setUsersError] = useState<string | null>(null);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [userSearch, setUserSearch] = useState("");

  /* ---------- Middle panel ---------- */
  const [facilities, setFacilities] = useState<FacilityRow[]>([]);
  const [facLoading, setFacLoading] = useState(false);
  const [selectedSerno, setSelectedSerno] = useState<number | null>(null);

  /* ---------- Right panel ---------- */
  const periodOptions = useMemo(() => buildPeriodOptions(), []);
  const [periodYear, setPeriodYear] = useState(() => dayjsTR().subtract(1, "month").year());
  const [periodMonth, setPeriodMonth] = useState(() => dayjsTR().subtract(1, "month").month() + 1);

  const [inputs, setInputs] = useState<BilledInvoiceInputs | null>(null);
  const [noDataReason, setNoDataReason] = useState<string | null>(null);
  const [inputsLoading, setInputsLoading] = useState(false);
  const [inputsErr, setInputsErr] = useState<string | null>(null);

  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [savedDraft, setSavedDraft] = useState<Draft>(emptyDraft);
  const [hasSnapshot, setHasSnapshot] = useState(false);

  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);

  const dirty = useMemo(
    () => JSON.stringify(draft) !== JSON.stringify(savedDraft),
    [draft, savedDraft]
  );

  /* ---------- 1) Kullanıcılar ---------- */
  useEffect(() => {
    let mounted = true;
    setUsersLoading(true);
    (async () => {
      const { data: integrations, error: intErr } = await supabase
        .from("user_integrations")
        .select("user_id, aril_user")
        .order("aril_user", { ascending: true });

      if (!mounted) return;
      if (intErr) {
        setUsersError(intErr.message);
        setUsersLoading(false);
        return;
      }

      const { data: subRows } = await supabase.from("owner_subscriptions").select("user_id");
      if (!mounted) return;

      const countMap = new Map<string, number>();
      for (const r of subRows ?? []) {
        countMap.set(r.user_id, (countMap.get(r.user_id) ?? 0) + 1);
      }

      setUsers(
        (integrations ?? []).map((r) => ({
          user_id: r.user_id,
          aril_user: r.aril_user,
          subCount: countMap.get(r.user_id) ?? 0,
        }))
      );
      setUsersLoading(false);
    })();
    return () => {
      mounted = false;
    };
  }, []);

  /* ---------- 2) Tesisler (guard alanları dahil) ---------- */
  useEffect(() => {
    if (!selectedUserId) {
      setFacilities([]);
      return;
    }
    let mounted = true;
    setFacLoading(true);
    setSelectedSerno(null);

    (async () => {
      const { data: osData } = await supabase
        .from("owner_subscriptions")
        .select("subscription_serno, title, meter_serial, provider")
        .eq("user_id", selectedUserId)
        .order("subscription_serno", { ascending: true });

      const sernos = (osData ?? []).map((r) => r.subscription_serno);
      const settingsMap = new Map<
        number,
        { nickname: string | null; terim: string | null; trafo_degeri: number | null }
      >();

      if (sernos.length > 0) {
        const { data: ssData } = await supabase
          .from("subscription_settings")
          .select("subscription_serno, nickname, terim, trafo_degeri")
          .eq("user_id", selectedUserId)
          .in("subscription_serno", sernos);
        for (const r of ssData ?? []) {
          settingsMap.set(r.subscription_serno, {
            nickname: r.nickname,
            terim: r.terim,
            trafo_degeri: r.trafo_degeri,
          });
        }
      }

      if (!mounted) return;
      setFacilities(
        (osData ?? []).map((r) => {
          const s = settingsMap.get(r.subscription_serno);
          return {
            subscription_serno: r.subscription_serno,
            title: r.title,
            meter_serial: r.meter_serial,
            provider: r.provider ?? null,
            nickname: s?.nickname ?? null,
            terim: s?.terim ?? null,
            trafo_degeri: s?.trafo_degeri ?? null,
          };
        })
      );
      setFacLoading(false);
    })();

    return () => {
      mounted = false;
    };
  }, [selectedUserId]);

  /* ---------- 3) Override'lar + önizleme girdileri ---------- */
  useEffect(() => {
    if (!selectedUserId || selectedSerno == null) {
      setInputs(null);
      setNoDataReason(null);
      setInputsErr(null);
      setDraft(emptyDraft());
      setSavedDraft(emptyDraft());
      setHasSnapshot(false);
      return;
    }

    let mounted = true;
    setInputsLoading(true);
    setInputsErr(null);
    setNoDataReason(null);
    setMsg(null);

    (async () => {
      try {
        const [ov, res, snap] = await Promise.all([
          fetchInvoiceOverrides({
            userId: selectedUserId,
            subscriptionSerno: selectedSerno,
            periodYear,
            periodMonth,
          }),
          fetchBilledInvoiceInputs({
            supabase,
            userId: selectedUserId,
            subscriptionSerno: selectedSerno,
            periodYear,
            periodMonth,
          }),
          getInvoiceSnapshot({
            userId: selectedUserId,
            subscriptionSerno: selectedSerno,
            periodYear,
            periodMonth,
            invoiceType: "billed",
          }).catch(() => null),
        ]);

        if (!mounted) return;

        const nextDraft = draftFromOverrides(ov);
        setDraft(nextDraft);
        setSavedDraft(nextDraft);
        setHasSnapshot(!!snap);

        if (res.ok) {
          setInputs(res.inputs);
          setNoDataReason(null);
        } else {
          setInputs(null);
          setNoDataReason(res.reason);
        }
      } catch (e: unknown) {
        if (!mounted) return;
        setInputs(null);
        setInputsErr(e instanceof Error ? e.message : "Fatura girdileri yüklenemedi.");
      } finally {
        if (mounted) setInputsLoading(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [selectedUserId, selectedSerno, periodYear, periodMonth]);

  /* ---------- Türetilmiş ---------- */
  const filteredUsers = useMemo(() => {
    if (!userSearch.trim()) return users;
    const q = userSearch.toLowerCase();
    return users.filter(
      (u) =>
        u.user_id.toLowerCase().includes(q) || (u.aril_user ?? "").toLowerCase().includes(q)
    );
  }, [users, userSearch]);

  const selectedUser = users.find((u) => u.user_id === selectedUserId) ?? null;
  const selectedFacility =
    facilities.find((f) => f.subscription_serno === selectedSerno) ?? null;

  const draftOverrides = useMemo(() => overridesFromDraft(draft), [draft]);
  const overrideCount = Object.keys(draftOverrides).length;

  const naturalResult: BilledInvoiceResult | null = useMemo(
    () => (inputs ? buildBreakdownFromInputs(inputs, null) : null),
    [inputs]
  );
  const editedResult: BilledInvoiceResult | null = useMemo(
    () => (inputs ? buildBreakdownFromInputs(inputs, draftOverrides) : null),
    [inputs, draftOverrides]
  );

  /**
   * Görünür kalemler — müşteri UI'ı bu satırları koşullu gizlediği için,
   * gizli bir kaleme konan override toplama SESSİZCE girerdi.
   * Guard'lar tesis satırından gelir (hesap verisi olmasa da çalışır).
   */
  const visibleItems = useMemo<InvoiceOverrideItemKey[]>(() => {
    if (!selectedFacility) return [];
    const trafo = Number(selectedFacility.trafo_degeri ?? 0);
    return ITEM_ORDER.filter((key) => {
      if (key === "trafo") return trafo > 0;
      if (key === "dagitim") return selectedFacility.provider !== "vhs_kayseri";
      if (key === "guc") return selectedFacility.terim === "cift_terim";
      // Muhtelif-2 mahsuplaşma fiyatı yalnız Metod 3 (Tredaş) faturasında var.
      if (key === "mahsuplasma") return inputs?.invoiceMethodId === 3;
      return true;
    });
  }, [selectedFacility, inputs]);

  /**
   * Guard'lı (gizli) bir kaleme daha önce konmuş override — tesis ayarı sonradan
   * değişmişse olabilir (örn. çift terim → tek terim). Satır tabloda çizilmediği
   * için düzenlenemez ama faturaya etki etmeye DEVAM eder; admine haber ver.
   */
  const hiddenOverrideKeys = useMemo(
    () =>
      ITEM_ORDER.filter(
        (key) => !visibleItems.includes(key) && draftOverrides[key] != null
      ),
    [visibleItems, draftOverrides]
  );

  /** Seçili dönem M-1'den eski mi? (reaktif payload uyarısı için) */
  const isHistoricalPeriod = useMemo(() => {
    const m1 = dayjsTR().subtract(1, "month");
    return periodYear * 12 + periodMonth < m1.year() * 12 + (m1.month() + 1);
  }, [periodYear, periodMonth]);

  // Metod 2/3'te YEKDEM farkı toplam sonrası mahsup DEĞİL, KDV matrahındaki bir
  // KALEMdir (yekFarkiCharge) → manuel kart etiketleri ve önizleme buna göre değişir.
  const isNetMethod =
    inputs?.invoiceMethodId === 2 || inputs?.invoiceMethodId === 3;

  const showVerisWarning =
    draft.enerji.isExcluded && (naturalResult?.breakdown.verisMahsupKwh ?? 0) > 0;
  const showHistoricalReactiveWarning =
    isHistoricalPeriod && (draft.reaktif.riKwh !== "" || draft.reaktif.rcKwh !== "");

  /* ---------- Kirli değişiklik guard'ı ---------- */
  const guardSwitch = (fn: () => void) => {
    if (dirty && !window.confirm("Kaydedilmemiş değişiklikler var. Devam edilsin mi?")) return;
    fn();
  };

  const setRow = (key: InvoiceOverrideItemKey, patch: Partial<DraftRow>) =>
    setDraft((p) => ({ ...p, [key]: { ...p[key], ...patch } }));

  /* ---------- Kaydet ---------- */
  const persistOverrides = async () => {
    if (!selectedUserId || selectedSerno == null) return;
    for (const key of ITEM_ORDER) {
      // Görünmeyen kalem hiç yazılmaz (guard'lı kalemler).
      if (!visibleItems.includes(key)) continue;
      const row = draft[key];
      const savedRow = savedDraft[key];
      if (JSON.stringify(row) === JSON.stringify(savedRow)) continue;

      const value = draftOverrides[key];
      await upsertInvoiceOverride({
        userId: selectedUserId,
        subscriptionSerno: selectedSerno,
        periodYear,
        periodMonth,
        itemKey: key,
        value: value ?? {
          isExcluded: false,
          unitPriceOverride: null,
          amountOverride: null,
          payload: null,
          note: null,
        },
      });
    }

    // YEKDEM mahsubu — ITEM_ORDER dışında, ayrı yazılır. Lisanslı satış
    // tesisinde mahsup hiç uygulanmadığı için form da kilitli → yazma yok.
    if (
      !inputs?.lisansliSatis &&
      JSON.stringify(draft.yekdem_mahsup) !== JSON.stringify(savedDraft.yekdem_mahsup)
    ) {
      await upsertInvoiceOverride({
        userId: selectedUserId,
        subscriptionSerno: selectedSerno,
        periodYear,
        periodMonth,
        itemKey: "yekdem_mahsup",
        // Boş taslak → isEmptyOverride DELETE'e düşer (çöp satır kalmaz).
        value: draftOverrides.yekdem_mahsup ?? {
          isExcluded: false,
          unitPriceOverride: null,
          amountOverride: null,
          payload: null,
          note: null,
        },
      });
    }

    setSavedDraft(draft);
  };

  const handleSave = async () => {
    setSaving(true);
    setMsg(null);
    try {
      await persistOverrides();
      setMsg({ type: "ok", text: "Kalem düzenlemeleri kaydedildi." });
    } catch (e: unknown) {
      setMsg({ type: "err", text: e instanceof Error ? e.message : "Kaydedilemedi." });
    }
    setSaving(false);
  };

  /** Kaydet + o dönemin snapshot'ını override'lı EFEKTİF değerlerle yeniden yaz. */
  const handleSaveAndRewriteSnapshot = async () => {
    if (!selectedUserId || selectedSerno == null || !inputs || !editedResult) return;
    setSaving(true);
    setMsg(null);
    try {
      await persistOverrides();

      // Haritalama tek kaynaktan (snapshotParamsFromEngine): efektif birim
      // fiyatlar, efektif mahsup ve metod damgası dahil — backdated writer ile
      // alan-alan aynı. recomputeSnapshotTotalWithMahsup saklı yekdem_mahsup'ı
      // AYNEN okur → override'ın Dashboard/InvoiceHistory/grafiklerde
      // görünmesinin tek yolu bu yazımdır.
      await upsertInvoiceSnapshot(
        snapshotParamsFromEngine({
          userId: selectedUserId,
          subscriptionSerno: selectedSerno,
          inputs,
          result: editedResult,
          overrides: draftOverrides,
          invoiceType: "billed",
        })
      );

      setHasSnapshot(true);
      setMsg({ type: "ok", text: "Kaydedildi ve snapshot yeniden yazıldı." });
    } catch (e: unknown) {
      setMsg({ type: "err", text: e instanceof Error ? e.message : "Snapshot yazılamadı." });
    }
    setSaving(false);
  };

  const handleResetItem = async (key: InvoiceOverrideItemKey) => {
    if (!selectedUserId || selectedSerno == null) return;
    setSaving(true);
    setMsg(null);
    try {
      await deleteInvoiceOverride({
        userId: selectedUserId,
        subscriptionSerno: selectedSerno,
        periodYear,
        periodMonth,
        itemKey: key,
      });
      setDraft((p) => ({ ...p, [key]: emptyRow() }));
      setSavedDraft((p) => ({ ...p, [key]: emptyRow() }));
      setMsg({ type: "ok", text: `${ITEM_LABELS[key]} varsayılana döndürüldü.` });
    } catch (e: unknown) {
      setMsg({ type: "err", text: e instanceof Error ? e.message : "Sıfırlanamadı." });
    }
    setSaving(false);
  };

  const handleClearPeriod = async () => {
    if (!selectedUserId || selectedSerno == null) return;
    setSaving(true);
    setMsg(null);
    try {
      const n = await deleteInvoiceOverridesForPeriod({
        userId: selectedUserId,
        subscriptionSerno: selectedSerno,
        periodYear,
        periodMonth,
      });
      setDraft(emptyDraft());
      setSavedDraft(emptyDraft());
      setConfirmClear(false);
      setMsg({ type: "ok", text: `${n} kalem düzenlemesi silindi.` });
    } catch (e: unknown) {
      setMsg({ type: "err", text: e instanceof Error ? e.message : "Silinemedi." });
    }
    setSaving(false);
  };

  /* ---------- Önizleme satırları ---------- */
  const previewRows = useMemo(() => {
    if (!naturalResult || !editedResult) return [];
    const nb = naturalResult.breakdown;
    const eb = editedResult.breakdown;
    const excluded = new Set(eb.appliedOverrides?.excludedItems ?? []);
    const rows: {
      label: string;
      natural: number;
      edited: number;
      excluded: boolean;
      strong?: boolean;
    }[] = [
      { label: "Enerji Bedeli", natural: nb.energyCharge, edited: eb.energyCharge, excluded: excluded.has("enerji") },
    ];
    // Metod 2/3 kalemleri (metod 1 önizlemesi değişmez).
    const mId = inputs?.invoiceMethodId;
    if (isNetMethod) {
      rows.push({
        label: mId === 2 ? "YEK Bedeli" : "Tahmini YEKDEM",
        natural: nb.yekTahminiCharge ?? 0,
        edited: eb.yekTahminiCharge ?? 0,
        excluded: false,
      });
      if ((nb.yekFarkiCharge ?? 0) !== 0 || (eb.yekFarkiCharge ?? 0) !== 0) {
        rows.push({
          label: mId === 2 ? "YEK Farkı" : "Önceki YEKDEM Mahsup",
          natural: nb.yekFarkiCharge ?? 0,
          edited: eb.yekFarkiCharge ?? 0,
          // Manuel kartın "çıkar" kutusu bu kalemi kapatır (2C köprüsü).
          excluded: draft.yekdem_mahsup.isExcluded,
        });
      }
    }
    if (inputs && inputs.trafoDegeri > 0) {
      rows.push({ label: "Trafo Kaybı", natural: nb.trafoCharge, edited: eb.trafoCharge, excluded: excluded.has("trafo") });
    }
    if (inputs && !inputs.isKayseriOsb) {
      rows.push({ label: "Dağıtım Bedeli", natural: nb.distributionCharge, edited: eb.distributionCharge, excluded: excluded.has("dagitim") });
    }
    rows.push({ label: "BTV", natural: nb.btvCharge, edited: eb.btvCharge, excluded: excluded.has("btv") });
    if (inputs && inputs.tariffType === "dual") {
      rows.push({ label: "Güç Bedeli (toplam)", natural: nb.powerTotalCharge, edited: eb.powerTotalCharge, excluded: excluded.has("guc") });
    }
    if (mId === 3) {
      rows.push({
        label: "Muhtelif-2 (dağıtım − mahsuplaşma)",
        natural: nb.muhtelif2Net ?? 0,
        edited: eb.muhtelif2Net ?? 0,
        excluded: false,
      });
    }
    rows.push({ label: "Reaktif Ceza", natural: nb.reactivePenaltyCharge, edited: eb.reactivePenaltyCharge, excluded: excluded.has("reaktif") });
    // Metod 2/3'te veriş mahsubu faturadan DÜŞÜLMEZ (m3'te kredi muhtelif-2'de) → satır gizli.
    if (!isNetMethod && (nb.verisMahsupKwh > 0 || eb.verisMahsupKwh > 0)) {
      rows.push({ label: "Veriş Mahsup (−)", natural: -nb.verisMahsupBedeli, edited: -eb.verisMahsupBedeli, excluded: false });
    }
    rows.push({ label: "KDV Hariç Toplam", natural: nb.subtotalBeforeVat, edited: eb.subtotalBeforeVat, excluded: false, strong: true });
    rows.push({ label: "KDV", natural: nb.vatCharge, edited: eb.vatCharge, excluded: false });
    rows.push({ label: "Genel Toplam (KDV Dahil)", natural: nb.totalInvoice, edited: eb.totalInvoice, excluded: false, strong: true });
    // Metod 2/3'te fark yukarıda KDV matrahındaki KALEM olarak gösteriliyor;
    // toplam-sonrası mahsup 0'a zorlandığı için burada yanıltıcı 0/0 satırı çizilmez.
    if (!isNetMethod) {
      rows.push({
        label: "YEKDEM Mahsubu",
        natural: naturalResult.yekdemMahsup,
        edited: editedResult.yekdemMahsup,
        excluded: draft.yekdem_mahsup.isExcluded,
      });
    }
    rows.push({
      label: "Ödenecek Toplam (Mahsup Dahil)",
      natural: naturalResult.totalWithMahsup,
      edited: editedResult.totalWithMahsup,
      excluded: false,
      strong: true,
    });
    return rows;
  }, [naturalResult, editedResult, inputs, isNetMethod, draft.yekdem_mahsup.isExcluded]);

  const diff =
    naturalResult && editedResult
      ? editedResult.totalWithMahsup - naturalResult.totalWithMahsup
      : 0;

  return (
    <div>
      <h1 className="text-lg font-semibold text-neutral-900 mb-4">Fatura Kalem Düzenleme</h1>

      {msg && (
        <div
          className={`mb-4 rounded-xl border p-3 text-sm ${
            msg.type === "ok"
              ? "border-green-200 bg-green-50 text-green-700"
              : "border-red-200 bg-red-50 text-red-700"
          }`}
        >
          {msg.text}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
        {/* ======================== LEFT PANEL ======================== */}
        <div className="md:col-span-3 rounded-2xl border bg-white p-4 max-h-[40vh] md:max-h-[80vh] overflow-y-auto">
          <div className="relative mb-3">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-neutral-400" />
            <input
              type="text"
              placeholder="Kullanıcı ara..."
              value={userSearch}
              onChange={(e) => setUserSearch(e.target.value)}
              className="w-full rounded-lg border border-neutral-300 py-2 pl-8 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
            />
          </div>

          {usersLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="animate-pulse rounded-lg bg-neutral-100 h-14" />
              ))}
            </div>
          ) : usersError ? (
            <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{usersError}</div>
          ) : filteredUsers.length === 0 ? (
            <p className="text-sm text-neutral-500 text-center py-6">Kullanıcı bulunamadı.</p>
          ) : (
            <div className="space-y-1.5">
              {filteredUsers.map((u) => (
                <button
                  key={u.user_id}
                  onClick={() => guardSwitch(() => setSelectedUserId(u.user_id))}
                  className={`w-full text-left rounded-xl px-3 py-2.5 transition-all duration-200 ${
                    selectedUserId === u.user_id ? "bg-blue-50 ring-1 ring-blue-200" : "hover:bg-neutral-50"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[11px] bg-neutral-100 rounded px-1.5 py-0.5 text-neutral-600 shrink-0">
                      {u.user_id.slice(0, 8)}...
                    </span>
                    <span className="text-sm font-medium text-neutral-800 truncate">{u.aril_user ?? "—"}</span>
                  </div>
                  <div className="mt-1 text-xs text-neutral-500">{u.subCount} tesis</div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* ====================== MIDDLE PANEL ======================= */}
        <div className="md:col-span-3 rounded-2xl border bg-white p-4 max-h-[40vh] md:max-h-[80vh] overflow-y-auto">
          {!selectedUserId ? (
            <p className="text-sm text-neutral-400 text-center py-10">Bir kullanıcı seçin.</p>
          ) : facLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="animate-pulse rounded-lg bg-neutral-100 h-16" />
              ))}
            </div>
          ) : facilities.length === 0 ? (
            <p className="text-sm text-neutral-500 text-center py-10">Bu kullanıcının tesisi yok.</p>
          ) : (
            <>
              <p className="text-xs text-neutral-500 mb-3">
                <span className="font-medium text-neutral-700">{selectedUser?.aril_user ?? "Kullanıcı"}</span> —{" "}
                {facilities.length} tesis
              </p>
              <div className="space-y-1.5">
                {facilities.map((f) => (
                  <button
                    key={f.subscription_serno}
                    onClick={() => guardSwitch(() => setSelectedSerno(f.subscription_serno))}
                    className={`w-full text-left rounded-xl px-3 py-2.5 transition-all duration-200 ${
                      selectedSerno === f.subscription_serno
                        ? "bg-blue-50 ring-1 ring-blue-200"
                        : "hover:bg-neutral-50"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[11px] bg-neutral-100 rounded px-1.5 py-0.5 text-neutral-600 shrink-0">
                        #{f.subscription_serno}
                      </span>
                      <span className="text-sm font-medium text-neutral-800 truncate">
                        {f.nickname || f.title || "İsimsiz Tesis"}
                      </span>
                    </div>
                    {f.meter_serial && (
                      <p className="mt-1 text-xs text-neutral-500 truncate">Sayaç: {f.meter_serial}</p>
                    )}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        {/* ======================= RIGHT PANEL ======================= */}
        <div className="md:col-span-6 rounded-2xl border bg-white p-4 max-h-[40vh] md:max-h-[80vh] overflow-y-auto">
          {selectedSerno == null ? (
            <p className="text-sm text-neutral-400 text-center py-10">Bir tesis seçin.</p>
          ) : (
            <>
              {/* Dönem seçici */}
              <div className="mb-4 flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => guardSwitch(() => setPeriodYear((y) => y - 1))}
                    className="rounded-lg p-1.5 hover:bg-neutral-100 transition-colors"
                  >
                    <ChevronLeft size={18} />
                  </button>
                  <span className="text-lg font-semibold text-neutral-800 min-w-[4rem] text-center">
                    {periodYear}
                  </span>
                  <button
                    onClick={() => guardSwitch(() => setPeriodYear((y) => Math.min(y + 1, dayjsTR().year())))}
                    className="rounded-lg p-1.5 hover:bg-neutral-100 transition-colors"
                  >
                    <ChevronRight size={18} />
                  </button>
                </div>

                <select
                  className="rounded-lg border px-3 py-2 text-sm"
                  value={periodMonth}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    guardSwitch(() => setPeriodMonth(v));
                  }}
                >
                  {MONTH_NAMES.map((m, i) => (
                    <option key={i + 1} value={i + 1}>
                      {i + 1} - {m}
                    </option>
                  ))}
                </select>

                {overrideCount > 0 && (
                  <span className="rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-medium text-amber-800">
                    {overrideCount} kalem düzenlendi
                  </span>
                )}
                {dirty && (
                  <span className="rounded-full bg-blue-100 px-2.5 py-1 text-[11px] font-medium text-blue-800">
                    Kaydedilmedi
                  </span>
                )}
              </div>

              {/* Uyarılar */}
              {inputsErr && (
                <div className="mb-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                  {inputsErr}
                </div>
              )}
              {(inputs?.warnings.length ?? 0) > 0 && (
                <div className="mb-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 space-y-1">
                  {inputs!.warnings.map((w, i) => (
                    <div key={i}>• {w}</div>
                  ))}
                </div>
              )}
              {showVerisWarning && (
                <div className="mb-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                  Bu tesiste veriş mahsubu var; enerji kalemi çıkarılınca mahsup düşümü devam eder ve ara toplam
                  eksiye inebilir.
                </div>
              )}
              {showHistoricalReactiveWarning && (
                <div className="mb-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                  Eski dönemlerde reaktif değer düzenlemesi cezayı sıfırlayabilir ama artıramaz. Kesin tutar için
                  Tutar alanını kullan.
                </div>
              )}
              {hiddenOverrideKeys.length > 0 && (
                <div className="mb-3 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700">
                  Bu tesisin ayarları gereği gösterilmeyen kalemlerde kayıtlı düzenleme var:{" "}
                  <span className="font-semibold">
                    {hiddenOverrideKeys.map((k) => ITEM_LABELS[k]).join(", ")}
                  </span>
                  . Bu kalemler müşteri faturasında satır olarak görünmez ama toplama etki eder. Temizlemek için
                  "Bu Ayın Tüm Düzenlemelerini Sil" kullanın.
                </div>
              )}

              {/* Kalem tablosu */}
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-neutral-500 border-b">
                      <th className="py-2 pr-3">Kalem</th>
                      <th className="py-2 pr-3">Faturaya Dahil</th>
                      <th className="py-2 pr-3">Birim Fiyat</th>
                      <th className="py-2 pr-3">Tutar (TL)</th>
                      <th className="py-2 pr-3">Not</th>
                      <th className="py-2 pr-3"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleItems.map((key) => {
                      const row = draft[key];
                      const disabled = row.isExcluded;
                      const naturalUnit =
                        key === "enerji"
                          ? inputs?.unitPriceEnergy
                          : key === "dagitim"
                            ? inputs?.unitPriceDistribution
                            : null;
                      const nb = naturalResult?.breakdown;
                      const naturalAmount =
                        nb == null
                          ? null
                          : key === "enerji"
                            ? nb.energyCharge
                            : key === "trafo"
                              ? nb.trafoCharge
                              : key === "dagitim"
                                ? nb.distributionCharge
                                : key === "btv"
                                  ? nb.btvCharge
                                  : key === "guc"
                                    ? nb.powerTotalCharge
                                    : nb.reactivePenaltyCharge;

                      return (
                        <tr key={key} className="border-b border-neutral-100 align-top">
                          <td className="py-2 pr-3">
                            <div className="text-sm font-medium text-neutral-800">{ITEM_LABELS[key]}</div>
                            {key === "enerji" && (
                              <div className="mt-1 text-[10px] text-neutral-400 max-w-[14rem]">
                                Enerji birim fiyatı değişince trafo, BTV ve veriş mahsup bedeli de bu fiyattan
                                hesaplanır.
                              </div>
                            )}
                          </td>

                          <td className="py-2 pr-3">
                            <input
                              type="checkbox"
                              checked={!row.isExcluded}
                              onChange={(e) => setRow(key, { isExcluded: !e.target.checked })}
                              className="rounded border-neutral-300"
                            />
                          </td>

                          <td className="py-2 pr-3">
                            {UNIT_PRICE_ITEMS.has(key) ? (
                              <input
                                type="number"
                                step="any"
                                disabled={disabled}
                                value={row.unitPrice}
                                onChange={(e) => setRow(key, { unitPrice: e.target.value })}
                                placeholder={naturalUnit != null ? `Doğal: ${fmtUnit(naturalUnit)}` : "—"}
                                className="w-36 rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200 disabled:bg-neutral-50 disabled:text-neutral-400"
                              />
                            ) : (
                              <span className="text-neutral-400">—</span>
                            )}
                          </td>

                          <td className="py-2 pr-3">
                            <input
                              type="number"
                              step="any"
                              disabled={disabled}
                              value={row.amount}
                              onChange={(e) => setRow(key, { amount: e.target.value })}
                              placeholder={naturalAmount != null ? `Doğal: ${fmtMoney2(naturalAmount)}` : "—"}
                              className="w-36 rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200 disabled:bg-neutral-50 disabled:text-neutral-400"
                            />
                          </td>

                          <td className="py-2 pr-3">
                            <input
                              type="text"
                              value={row.note}
                              onChange={(e) => setRow(key, { note: e.target.value })}
                              placeholder="Not"
                              className="w-40 rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
                            />
                          </td>

                          <td className="py-2 pr-3">
                            <button
                              onClick={() => handleResetItem(key)}
                              disabled={saving}
                              title="Bu kalemi varsayılana döndür"
                              className="rounded-lg p-1.5 text-neutral-500 hover:bg-neutral-100 disabled:opacity-50 transition-colors"
                            >
                              <RotateCcw size={15} />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Reaktif değerleri */}
              {visibleItems.includes("reaktif") && (
                <div className="mt-4 rounded-xl border border-neutral-200 bg-neutral-50 p-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-medium text-neutral-700">Reaktif Değerleri</span>
                    <button
                      onClick={() => setRow("reaktif", { riKwh: "0", rcKwh: "0" })}
                      className="rounded-lg bg-neutral-200 px-2.5 py-1 text-[11px] font-medium text-neutral-700 hover:bg-neutral-300 transition-colors"
                    >
                      Reaktifi Sıfırla
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-3">
                    <label className="block">
                      <span className="text-xs font-medium text-neutral-600 mb-1 block">Ri (kVArh)</span>
                      <input
                        type="number"
                        step="any"
                        value={draft.reaktif.riKwh}
                        onChange={(e) => setRow("reaktif", { riKwh: e.target.value })}
                        placeholder={inputs ? `Doğal: ${fmtKwh(inputs.totalRi)}` : "—"}
                        className="w-40 rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
                      />
                    </label>
                    <label className="block">
                      <span className="text-xs font-medium text-neutral-600 mb-1 block">Rc (kVArh)</span>
                      <input
                        type="number"
                        step="any"
                        value={draft.reaktif.rcKwh}
                        onChange={(e) => setRow("reaktif", { rcKwh: e.target.value })}
                        placeholder={inputs ? `Doğal: ${fmtKwh(inputs.totalRc)}` : "—"}
                        className="w-40 rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
                      />
                    </label>
                  </div>
                  {editedResult && (
                    <div className="mt-2 text-[10px] text-neutral-500">
                      Düzenlenmiş oran: Ri %{editedResult.riPercent.toFixed(1)} / Rc %
                      {editedResult.rcPercent.toFixed(1)} (limit: %20 / %15)
                    </div>
                  )}
                  <div className="mt-1 text-[10px] text-neutral-400">
                    Reaktif uyarı e-postaları ham veriden gider, bu düzenlemeden etkilenmez.
                  </div>
                </div>
              )}

              {/* YEKDEM Mahsubu (Manuel) — kalem DEĞİL, ayrı kart */}
              <div className="mt-4 rounded-xl border border-neutral-200 bg-neutral-50 p-3">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-medium text-neutral-700">
                    {isNetMethod
                      ? inputs?.invoiceMethodId === 2
                        ? "YEK Farkı (Manuel)"
                        : "Önceki YEKDEM Mahsup (Manuel)"
                      : "YEKDEM Mahsubu (Manuel)"}
                  </span>
                  {inputs && (
                    <span className="text-[11px] text-neutral-500">
                      Mahsup Dönemi: {inputs.mahsupPeriodLabel}
                    </span>
                  )}
                </div>

                {inputs?.lisansliSatis ? (
                  <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                    Lisanslı satış tesisinde YEKDEM mahsubu uygulanmaz.
                  </div>
                ) : (
                  <>
                    <label className="mt-2 flex items-center gap-2 text-xs text-neutral-700">
                      <input
                        type="checkbox"
                        checked={draft.yekdem_mahsup.isExcluded}
                        onChange={(e) =>
                          setRow("yekdem_mahsup", { isExcluded: e.target.checked })
                        }
                        className="h-4 w-4 rounded border-neutral-300"
                      />
                      {isNetMethod
                        ? "Bu ay bu kalemi faturadan çıkar"
                        : "Bu ay YEKDEM mahsubunu çıkar"}
                    </label>

                    <div className="mt-3 flex flex-wrap gap-3">
                      <label className="block">
                        <span className="text-xs font-medium text-neutral-600 mb-1 block">
                          {isNetMethod
                            ? "Önceki Dönem Mahsuplu Tüketim — Σpos (kWh)"
                            : "Mahsup Dönemi Toplam Tüketim (kWh)"}
                        </span>
                        <input
                          type="number"
                          step="any"
                          disabled={draft.yekdem_mahsup.isExcluded}
                          value={draft.yekdem_mahsup.totalKwh}
                          onChange={(e) =>
                            setRow("yekdem_mahsup", { totalKwh: e.target.value })
                          }
                          placeholder={
                            isNetMethod
                              ? inputs?.methodInputs?.prevSumPos != null
                                ? `Doğal: ${fmtKwh(inputs.methodInputs.prevSumPos)}`
                                : "Veri yok"
                              : inputs
                                ? inputs.mahsupNaturalTotalKwh > 0
                                  ? `Doğal: ${fmtKwh(inputs.mahsupNaturalTotalKwh)}`
                                  : "Veri yok"
                                : "—"
                          }
                          className="w-56 rounded-lg border border-neutral-300 px-3 py-2 text-sm disabled:bg-neutral-100 disabled:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-blue-200"
                        />
                      </label>
                      <label className="block">
                        <span className="text-xs font-medium text-neutral-600 mb-1 block">
                          {isNetMethod
                            ? "YEKDEM Farkı (Gerçekleşen − Tahmini, ÇIPLAK TL/kWh; motor KBK ile çarpar)"
                            : "YEKDEM Farkı (Gerçekleşen − Tahmin, TL/kWh)"}
                        </span>
                        <input
                          type="number"
                          step="any"
                          disabled={draft.yekdem_mahsup.isExcluded}
                          value={draft.yekdem_mahsup.diffYekdem}
                          onChange={(e) =>
                            setRow("yekdem_mahsup", { diffYekdem: e.target.value })
                          }
                          placeholder={
                            isNetMethod
                              ? inputs?.methodInputs?.prevGerceklesenYekdem != null &&
                                inputs?.methodInputs?.prevTahminiYekdem != null
                                ? `Doğal: ${fmtUnit(
                                    inputs.methodInputs.prevGerceklesenYekdem -
                                      inputs.methodInputs.prevTahminiYekdem
                                  )}`
                                : "Veri yok"
                              : inputs &&
                                  inputs.mahsupNaturalYekdemValue != null &&
                                  inputs.mahsupNaturalYekdemFinal != null
                                ? `Doğal: ${fmtUnit(
                                    inputs.mahsupNaturalYekdemFinal -
                                      inputs.mahsupNaturalYekdemValue
                                  )}`
                                : "Veri yok"
                          }
                          className="w-56 rounded-lg border border-neutral-300 px-3 py-2 text-sm disabled:bg-neutral-100 disabled:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-blue-200"
                        />
                      </label>
                    </div>

                    {editedResult && (
                      <div className="mt-2 text-[11px] text-neutral-600">
                        {isNetMethod ? (
                          <>
                            Hesaplanan kalem:{" "}
                            <span className="font-semibold">
                              {fmtMoney2(editedResult.breakdown.yekFarkiCharge ?? 0)} ₺
                            </span>{" "}
                            <span className="text-neutral-400">
                              (doğal: {fmtMoney2(naturalResult?.breakdown.yekFarkiCharge ?? 0)} ₺)
                              — KDV matrahına girer
                            </span>
                          </>
                        ) : (
                          <>
                            Hesaplanan mahsup:{" "}
                            <span className="font-semibold">
                              {fmtMoney2(editedResult.yekdemMahsup)} ₺
                            </span>{" "}
                            <span className="text-neutral-400">
                              (doğal: {fmtMoney2(naturalResult?.yekdemMahsup ?? 0)} ₺)
                            </span>
                          </>
                        )}
                      </div>
                    )}

                    <div className="mt-1 text-[10px] text-neutral-400">
                      {isNetMethod
                        ? "Bu değerler sadece YEK Farkı / Önceki YEKDEM Mahsup kalemini etkiler; KDV matrahına girer, diğer kalemlere dokunmaz."
                        : "Bu değerler sadece YEKDEM mahsup satırını etkiler; enerji/dağıtım/diğer kalemlere ve veriş mahsubuna dokunmaz."}
                    </div>
                  </>
                )}
              </div>

              {/* Önizleme */}
              <div className="mt-5">
                <h2 className="text-sm font-semibold text-neutral-800 mb-2">Önizleme</h2>
                {inputsLoading ? (
                  <div className="space-y-2">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <div key={i} className="animate-pulse rounded-lg bg-neutral-100 h-8" />
                    ))}
                  </div>
                ) : !inputs ? (
                  <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-3 text-sm text-neutral-500">
                    {noDataReason ?? "Bu dönem için hesap verisi yok."} Kalem düzenlemeleri yine de kaydedilebilir.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-sm">
                      <thead>
                        <tr className="text-left text-xs text-neutral-500 border-b">
                          <th className="py-2 pr-4">Kalem</th>
                          <th className="py-2 pr-4 text-right">Doğal</th>
                          <th className="py-2 pr-4 text-right">Düzenlenmiş</th>
                        </tr>
                      </thead>
                      <tbody>
                        {previewRows.map((r) => {
                          const changed = Math.abs(r.edited - r.natural) > 0.005;
                          return (
                            <tr key={r.label} className="border-b border-neutral-100">
                              <td className={`py-2 pr-4 ${r.strong ? "font-semibold text-neutral-900" : "text-neutral-700"}`}>
                                {r.label}
                                {r.excluded && (
                                  <span className="ml-2 rounded bg-neutral-200 px-1.5 py-0.5 text-[10px] text-neutral-600">
                                    Çıkarıldı
                                  </span>
                                )}
                              </td>
                              <td className="py-2 pr-4 text-right text-neutral-500">{fmtMoney2(r.natural)}</td>
                              <td
                                className={`py-2 pr-4 text-right ${
                                  r.excluded
                                    ? "line-through text-neutral-400"
                                    : changed
                                      ? "font-semibold text-amber-700"
                                      : r.strong
                                        ? "font-semibold text-neutral-900"
                                        : "text-neutral-700"
                                }`}
                              >
                                {fmtMoney2(r.edited)}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>

                    <div className="mt-3 flex items-center justify-end gap-2 text-sm">
                      <span className="text-neutral-500">Fark:</span>
                      <span
                        className={`font-semibold ${
                          Math.abs(diff) < 0.005
                            ? "text-neutral-500"
                            : diff > 0
                              ? "text-red-600"
                              : "text-emerald-600"
                        }`}
                      >
                        {diff > 0 ? "+" : diff < 0 ? "−" : ""}
                        {fmtMoney2(Math.abs(diff))} TL
                      </span>
                    </div>
                  </div>
                )}
              </div>

              {/* Aksiyonlar */}
              <div className="mt-5 flex flex-wrap items-center gap-2">
                <button
                  onClick={handleSave}
                  disabled={saving || !dirty}
                  className="rounded-lg bg-black px-4 py-2 text-sm text-white font-medium disabled:opacity-50 transition-opacity"
                >
                  {saving ? "Kaydediliyor..." : "Kaydet"}
                </button>

                <button
                  onClick={handleSaveAndRewriteSnapshot}
                  disabled={saving || !inputs || !hasSnapshot}
                  title={
                    !hasSnapshot
                      ? "Bu dönem için kayıtlı snapshot yok — yalnız mevcut snapshot yeniden yazılabilir."
                      : "Kaydet ve bu dönemin snapshot'ını efektif değerlerle yeniden yaz"
                  }
                  className="rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-50 transition-opacity"
                >
                  Kaydet + Snapshot'ı Yeniden Yaz
                </button>

                <button
                  onClick={() => setConfirmClear(true)}
                  disabled={saving || overrideCount === 0}
                  className="rounded-lg border border-red-300 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-50 transition-opacity"
                >
                  Bu Ayın Tüm Düzenlemelerini Sil
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {confirmClear && selectedFacility && (
        <Modal
          title="Tüm düzenlemeleri sil"
          subtitle={`#${selectedFacility.subscription_serno} — ${MONTH_NAMES[periodMonth - 1]} ${periodYear}`}
          onClose={() => setConfirmClear(false)}
          maxWidth="max-w-md"
        >
          <p className="text-sm text-neutral-700">
            Bu tesisin bu dönemdeki <span className="font-semibold">tüm kalem düzenlemeleri</span> silinecek ve
            fatura doğal değerlerine dönecek. Bu işlem geri alınamaz.
          </p>
          <div className="mt-5 flex justify-end gap-2">
            <button
              onClick={() => setConfirmClear(false)}
              className="rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
            >
              Vazgeç
            </button>
            <button
              onClick={handleClearPeriod}
              disabled={saving}
              className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
            >
              {saving ? "Siliniyor..." : "Evet, sil"}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
