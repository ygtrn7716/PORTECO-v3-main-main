import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Search, ChevronLeft, ChevronRight, Check } from "lucide-react";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type UserRow = {
  user_id: string;
  aril_user: string | null;
  subCount: number;
};

type SubscriptionRow = {
  user_id: string;
  subscription_serno: number;
  title: string | null;
  meter_serial: string | null;
  nickname: string | null;
};

type SettingsForm = {
  kbk: number | null;
  terim: string | null;
  tarife: string | null;
  gerilim: string | null;
  guc_bedel_limit: number | null;
  trafo_degeri: number | null;
  nickname: string | null;
  on_yil: boolean;
};

type YekdemMonth = {
  period_month: number;
  yekdem_value: number | null;
  yekdem_final: number | null;
  diger_degerler: number | null;
};

type RightTab = "settings" | "yekdem";

const EMPTY_SETTINGS: SettingsForm = {
  kbk: null,
  terim: null,
  tarife: null,
  gerilim: null,
  guc_bedel_limit: null,
  trafo_degeri: null,
  nickname: null,
  on_yil: false,
};

const MONTH_NAMES = [
  "Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran",
  "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık",
];

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function numOrNull(v: string): number | null {
  return v === "" ? null : Number(v);
}

function d(v: number | null | undefined): string {
  return v == null ? "" : String(v);
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function AdminUsersPage() {
  /* ---------- Left panel state ---------- */
  const [users, setUsers] = useState<UserRow[]>([]);
  const [usersLoading, setUsersLoading] = useState(true);
  const [usersError, setUsersError] = useState<string | null>(null);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [userSearch, setUserSearch] = useState("");

  /* ---------- Middle panel state ---------- */
  const [subs, setSubs] = useState<SubscriptionRow[]>([]);
  const [subsLoading, setSubsLoading] = useState(false);
  const [selectedSerno, setSelectedSerno] = useState<number | null>(null);

  /* ---------- Right panel state ---------- */
  const [rightTab, setRightTab] = useState<RightTab>("settings");

  // Settings
  const [settings, setSettings] = useState<SettingsForm>(EMPTY_SETTINGS);
  const [settingsLoading, setSettingsLoading] = useState(false);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [settingsMsg, setSettingsMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  // YEKDEM
  const [yekdemYear, setYekdemYear] = useState(new Date().getFullYear());
  const [yekdemData, setYekdemData] = useState<YekdemMonth[]>([]);
  const [yekdemLoading, setYekdemLoading] = useState(false);
  const [yekdemDraft, setYekdemDraft] = useState<Record<number, Partial<YekdemMonth>>>({});
  const [yekdemSaving, setYekdemSaving] = useState<number | null>(null);
  const [yekdemSaved, setYekdemSaved] = useState<Record<number, "ok" | "err">>({});

  /* ================================================================ */
  /*  Data fetching                                                    */
  /* ================================================================ */

  // 1. Load users on mount
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

      const { data: subRows } = await supabase
        .from("owner_subscriptions")
        .select("user_id");

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
        })),
      );
      setUsersLoading(false);
    })();
    return () => { mounted = false; };
  }, []);

  // 2. Load subscriptions when user selected
  useEffect(() => {
    if (!selectedUserId) {
      setSubs([]);
      return;
    }
    let mounted = true;
    setSubsLoading(true);
    setSelectedSerno(null);

    (async () => {
      const { data: osData } = await supabase
        .from("owner_subscriptions")
        .select("user_id, subscription_serno, title, meter_serial")
        .eq("user_id", selectedUserId)
        .order("subscription_serno", { ascending: true });

      const sernos = (osData ?? []).map((r) => r.subscription_serno);
      const nickMap = new Map<number, string | null>();

      if (sernos.length > 0) {
        const { data: ssData } = await supabase
          .from("subscription_settings")
          .select("subscription_serno, nickname")
          .eq("user_id", selectedUserId)
          .in("subscription_serno", sernos);
        for (const r of ssData ?? []) {
          nickMap.set(r.subscription_serno, r.nickname);
        }
      }

      if (!mounted) return;
      setSubs(
        (osData ?? []).map((r) => ({
          ...r,
          nickname: nickMap.get(r.subscription_serno) ?? null,
        })),
      );
      setSubsLoading(false);
    })();

    return () => { mounted = false; };
  }, [selectedUserId]);

  // 3. Load settings when subscription selected
  useEffect(() => {
    if (!selectedUserId || selectedSerno == null) return;
    if (rightTab !== "settings") return;
    let mounted = true;
    setSettingsLoading(true);
    setSettingsMsg(null);

    (async () => {
      const { data } = await supabase
        .from("subscription_settings")
        .select("kbk, terim, tarife, gerilim, guc_bedel_limit, trafo_degeri, nickname, on_yil")
        .eq("user_id", selectedUserId)
        .eq("subscription_serno", selectedSerno)
        .maybeSingle();

      if (!mounted) return;
      setSettings(data ?? { ...EMPTY_SETTINGS });
      setSettingsLoading(false);
    })();

    return () => { mounted = false; };
  }, [selectedUserId, selectedSerno, rightTab]);

  // 4. Load YEKDEM when subscription selected
  useEffect(() => {
    if (!selectedUserId || selectedSerno == null) return;
    if (rightTab !== "yekdem") return;
    let mounted = true;
    setYekdemLoading(true);
    setYekdemDraft({});
    setYekdemSaved({});

    (async () => {
      const { data } = await supabase
        .from("subscription_yekdem")
        .select("period_month, yekdem_value, yekdem_final, diger_degerler")
        .eq("user_id", selectedUserId)
        .eq("subscription_serno", selectedSerno)
        .eq("period_year", yekdemYear)
        .order("period_month", { ascending: true });

      if (!mounted) return;
      setYekdemData(data ?? []);
      setYekdemLoading(false);
    })();

    return () => { mounted = false; };
  }, [selectedUserId, selectedSerno, rightTab, yekdemYear]);

  /* ================================================================ */
  /*  Save handlers                                                    */
  /* ================================================================ */

  const handleSettingsSave = async () => {
    if (!selectedUserId || selectedSerno == null) return;
    setSettingsSaving(true);
    setSettingsMsg(null);

    try {
      const payload = { ...settings };

      const { data: updData, error: updErr } = await supabase
        .from("subscription_settings")
        .update(payload)
        .eq("user_id", selectedUserId)
        .eq("subscription_serno", selectedSerno)
        .select("subscription_serno")
        .maybeSingle();

      if (updErr) throw updErr;

      if (!updData) {
        const { error: insErr } = await supabase
          .from("subscription_settings")
          .insert({ user_id: selectedUserId, subscription_serno: selectedSerno, ...payload });
        if (insErr) throw insErr;
      }

      setSettingsMsg({ type: "ok", text: "Kaydedildi." });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Hata oluştu.";
      setSettingsMsg({ type: "err", text: msg });
    }
    setSettingsSaving(false);
  };

  const saveYekdemMonth = async (month: number) => {
    if (!selectedUserId || selectedSerno == null) return;
    const existing = yekdemData.find((r) => r.period_month === month);
    const draft = yekdemDraft[month];
    const merged: YekdemMonth = {
      period_month: month,
      yekdem_value: draft?.yekdem_value ?? existing?.yekdem_value ?? null,
      yekdem_final: draft?.yekdem_final ?? existing?.yekdem_final ?? null,
      diger_degerler: draft?.diger_degerler ?? existing?.diger_degerler ?? null,
    };

    setYekdemSaving(month);
    const { error } = await supabase.from("subscription_yekdem").upsert(
      {
        user_id: selectedUserId,
        subscription_serno: selectedSerno,
        period_year: yekdemYear,
        period_month: month,
        yekdem_value: merged.yekdem_value,
        yekdem_final: merged.yekdem_final,
        diger_degerler: merged.diger_degerler,
      },
      { onConflict: "user_id,subscription_serno,period_year,period_month" },
    );

    setYekdemSaving(null);
    setYekdemSaved((p) => ({ ...p, [month]: error ? "err" : "ok" }));

    if (!error) {
      // Refresh data
      const { data } = await supabase
        .from("subscription_yekdem")
        .select("period_month, yekdem_value, yekdem_final, diger_degerler")
        .eq("user_id", selectedUserId)
        .eq("subscription_serno", selectedSerno)
        .eq("period_year", yekdemYear)
        .order("period_month", { ascending: true });
      setYekdemData(data ?? []);
      setYekdemDraft((prev) => {
        const next = { ...prev };
        delete next[month];
        return next;
      });
    }
  };

  const saveAllYekdem = async () => {
    if (!selectedUserId || selectedSerno == null) return;
    setYekdemSaving(-1);

    const rows = Array.from({ length: 12 }, (_, i) => {
      const m = i + 1;
      const existing = yekdemData.find((r) => r.period_month === m);
      const draft = yekdemDraft[m];
      return {
        user_id: selectedUserId,
        subscription_serno: selectedSerno,
        period_year: yekdemYear,
        period_month: m,
        yekdem_value: draft?.yekdem_value ?? existing?.yekdem_value ?? null,
        yekdem_final: draft?.yekdem_final ?? existing?.yekdem_final ?? null,
        diger_degerler: draft?.diger_degerler ?? existing?.diger_degerler ?? null,
      };
    }).filter((r) => r.yekdem_value != null || r.yekdem_final != null || r.diger_degerler != null);

    if (rows.length > 0) {
      const { error } = await supabase
        .from("subscription_yekdem")
        .upsert(rows, { onConflict: "user_id,subscription_serno,period_year,period_month" });

      if (error) {
        setYekdemSaving(null);
        return;
      }
    }

    // Refresh
    const { data } = await supabase
      .from("subscription_yekdem")
      .select("period_month, yekdem_value, yekdem_final, diger_degerler")
      .eq("user_id", selectedUserId)
      .eq("subscription_serno", selectedSerno)
      .eq("period_year", yekdemYear)
      .order("period_month", { ascending: true });
    setYekdemData(data ?? []);
    setYekdemDraft({});
    setYekdemSaving(null);
    setYekdemSaved(Object.fromEntries(rows.map((r) => [r.period_month, "ok" as const])));
  };

  /* ================================================================ */
  /*  Derived                                                          */
  /* ================================================================ */

  const filteredUsers = useMemo(() => {
    if (!userSearch.trim()) return users;
    const q = userSearch.toLowerCase();
    return users.filter(
      (u) =>
        u.user_id.toLowerCase().includes(q) ||
        (u.aril_user ?? "").toLowerCase().includes(q),
    );
  }, [users, userSearch]);

  const selectedUser = users.find((u) => u.user_id === selectedUserId) ?? null;

  /* ================================================================ */
  /*  Render                                                           */
  /* ================================================================ */

  return (
    <div>
      <h1 className="text-lg font-semibold text-neutral-900 mb-4">Kullanıcı Yönetimi</h1>

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
                  onClick={() => setSelectedUserId(u.user_id)}
                  className={`w-full text-left rounded-xl px-3 py-2.5 transition-all duration-200 ${
                    selectedUserId === u.user_id
                      ? "bg-blue-50 ring-1 ring-blue-200"
                      : "hover:bg-neutral-50"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[11px] bg-neutral-100 rounded px-1.5 py-0.5 text-neutral-600 shrink-0">
                      {u.user_id.slice(0, 8)}...
                    </span>
                    <span className="text-sm font-medium text-neutral-800 truncate">
                      {u.aril_user ?? "—"}
                    </span>
                  </div>
                  <div className="mt-1 text-xs text-neutral-500">
                    {u.subCount} tesis
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* ====================== MIDDLE PANEL ======================= */}
        <div className="md:col-span-3 rounded-2xl border bg-white p-4 max-h-[40vh] md:max-h-[80vh] overflow-y-auto">
          {!selectedUserId ? (
            <p className="text-sm text-neutral-400 text-center py-10">Bir kullanıcı seçin.</p>
          ) : subsLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="animate-pulse rounded-lg bg-neutral-100 h-16" />
              ))}
            </div>
          ) : subs.length === 0 ? (
            <p className="text-sm text-neutral-500 text-center py-10">Bu kullanıcının tesisi yok.</p>
          ) : (
            <>
              <p className="text-xs text-neutral-500 mb-3">
                <span className="font-medium text-neutral-700">{selectedUser?.aril_user ?? "Kullanıcı"}</span> — {subs.length} tesis
              </p>
              <div className="space-y-1.5">
                {subs.map((s) => (
                  <button
                    key={s.subscription_serno}
                    onClick={() => {
                      setSelectedSerno(s.subscription_serno);
                      setRightTab("settings");
                    }}
                    className={`w-full text-left rounded-xl px-3 py-2.5 transition-all duration-200 ${
                      selectedSerno === s.subscription_serno
                        ? "bg-blue-50 ring-1 ring-blue-200"
                        : "hover:bg-neutral-50"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[11px] bg-neutral-100 rounded px-1.5 py-0.5 text-neutral-600 shrink-0">
                        #{s.subscription_serno}
                      </span>
                      <span className="text-sm font-medium text-neutral-800 truncate">
                        {s.nickname || s.title || "İsimsiz Tesis"}
                      </span>
                    </div>
                    {s.meter_serial && (
                      <p className="mt-1 text-xs text-neutral-500 truncate">Sayaç: {s.meter_serial}</p>
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
              {/* Tabs */}
              <div className="flex gap-2 mb-4">
                <button
                  onClick={() => setRightTab("settings")}
                  className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                    rightTab === "settings" ? "bg-black text-white" : "bg-neutral-100 text-neutral-700 hover:bg-neutral-200"
                  }`}
                >
                  Tesis Bilgileri
                </button>
                <button
                  onClick={() => setRightTab("yekdem")}
                  className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                    rightTab === "yekdem" ? "bg-black text-white" : "bg-neutral-100 text-neutral-700 hover:bg-neutral-200"
                  }`}
                >
                  YEKDEM
                </button>
              </div>

              {/* --------- SETTINGS TAB --------- */}
              {rightTab === "settings" && (
                settingsLoading ? (
                  <div className="space-y-3">
                    {Array.from({ length: 6 }).map((_, i) => (
                      <div key={i} className="animate-pulse rounded-lg bg-neutral-100 h-10" />
                    ))}
                  </div>
                ) : (
                  <div className="space-y-4">
                    {/* Nickname */}
                    <label className="block">
                      <span className="text-xs font-medium text-neutral-600 mb-1 block">Nickname</span>
                      <input
                        type="text"
                        placeholder="Tesis takma adı"
                        value={settings.nickname ?? ""}
                        onChange={(e) => setSettings((p) => ({ ...p, nickname: e.target.value || null }))}
                        className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
                      />
                    </label>

                    {/* KBK */}
                    <label className="block">
                      <span className="text-xs font-medium text-neutral-600 mb-1 block">KBK (Çarpan)</span>
                      <input
                        type="number"
                        step="0.001"
                        value={d(settings.kbk)}
                        onChange={(e) => setSettings((p) => ({ ...p, kbk: numOrNull(e.target.value) }))}
                        className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
                      />
                    </label>

                    {/* Terim */}
                    <label className="block">
                      <span className="text-xs font-medium text-neutral-600 mb-1 block">Mevcut Terim</span>
                      <select
                        value={settings.terim ?? ""}
                        onChange={(e) => setSettings((p) => ({ ...p, terim: e.target.value || null }))}
                        className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
                      >
                        <option value="">Seçiniz</option>
                        <option value="tek_terim">I. Terim</option>
                        <option value="cift_terim">II. Terim</option>
                      </select>
                    </label>

                    {/* Tarife */}
                    <label className="block">
                      <span className="text-xs font-medium text-neutral-600 mb-1 block">Mevcut Tarife</span>
                      <select
                        value={settings.tarife ?? ""}
                        onChange={(e) => setSettings((p) => ({ ...p, tarife: e.target.value || null }))}
                        className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
                      >
                        <option value="">Seçiniz</option>
                        <option value="sanayi">Sanayi</option>
                        <option value="ticarethane">Ticarethane</option>
                        <option value="tarimsal">Tarımsal</option>
                      </select>
                    </label>

                    {/* Gerilim */}
                    <label className="block">
                      <span className="text-xs font-medium text-neutral-600 mb-1 block">Mevcut Gerilim Tipi</span>
                      <select
                        value={settings.gerilim ?? ""}
                        onChange={(e) => setSettings((p) => ({ ...p, gerilim: e.target.value || null }))}
                        className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
                      >
                        <option value="">Seçiniz</option>
                        <option value="AG">AG</option>
                        <option value="OG">OG</option>
                      </select>
                    </label>

                    {/* Güç Bedeli */}
                    <label className="block">
                      <span className="text-xs font-medium text-neutral-600 mb-1 block">Sözleşme Güç Bedeli (kW)</span>
                      <input
                        type="number"
                        value={d(settings.guc_bedel_limit)}
                        onChange={(e) => setSettings((p) => ({ ...p, guc_bedel_limit: numOrNull(e.target.value) }))}
                        className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
                      />
                    </label>

                    {/* Trafo */}
                    <label className="block">
                      <span className="text-xs font-medium text-neutral-600 mb-1 block">Trafo Kaybı</span>
                      <input
                        type="number"
                        step="0.001"
                        value={d(settings.trafo_degeri)}
                        onChange={(e) => setSettings((p) => ({ ...p, trafo_degeri: numOrNull(e.target.value) }))}
                        className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
                      />
                    </label>

                    {/* 10 Yıl Üstü Lisans */}
                    <label className="flex items-center gap-2 mt-1">
                      <input
                        type="checkbox"
                        checked={settings.on_yil ?? false}
                        onChange={(e) => setSettings((p) => ({ ...p, on_yil: e.target.checked }))}
                        className="rounded border-neutral-300"
                      />
                      <span className="text-xs font-medium text-neutral-600">
                        10 Yıl Üstü Lisans (PTF ile Satış)
                      </span>
                    </label>

                    {/* Save */}
                    <button
                      disabled={settingsSaving}
                      onClick={handleSettingsSave}
                      className="rounded-lg bg-black px-4 py-2 text-sm text-white font-medium disabled:opacity-50 transition-opacity"
                    >
                      {settingsSaving ? "Kaydediliyor..." : "Kaydet"}
                    </button>

                    {settingsMsg && (
                      <div
                        className={`rounded-xl border p-3 text-sm ${
                          settingsMsg.type === "ok"
                            ? "border-green-200 bg-green-50 text-green-700"
                            : "border-red-200 bg-red-50 text-red-700"
                        }`}
                      >
                        {settingsMsg.text}
                      </div>
                    )}
                  </div>
                )
              )}

              {/* --------- YEKDEM TAB --------- */}
              {rightTab === "yekdem" && (
                yekdemLoading ? (
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                    {Array.from({ length: 12 }).map((_, i) => (
                      <div key={i} className="animate-pulse rounded-xl bg-neutral-100 h-52" />
                    ))}
                  </div>
                ) : (
                  <div>
                    {/* Year selector */}
                    <div className="flex items-center justify-center gap-4 mb-4">
                      <button
                        onClick={() => setYekdemYear((y) => y - 1)}
                        className="rounded-lg p-1.5 hover:bg-neutral-100 transition-colors"
                      >
                        <ChevronLeft size={18} />
                      </button>
                      <span className="text-lg font-semibold text-neutral-800 min-w-[4rem] text-center">
                        {yekdemYear}
                      </span>
                      <button
                        onClick={() => setYekdemYear((y) => y + 1)}
                        className="rounded-lg p-1.5 hover:bg-neutral-100 transition-colors"
                      >
                        <ChevronRight size={18} />
                      </button>
                    </div>

                    {/* Month grid */}
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                      {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => {
                        const existing = yekdemData.find((r) => r.period_month === m);
                        const draft = yekdemDraft[m];
                        const val = draft?.yekdem_value ?? existing?.yekdem_value;
                        const fin = draft?.yekdem_final ?? existing?.yekdem_final;
                        const dig = draft?.diger_degerler ?? existing?.diger_degerler;
                        const hasFill = val != null;
                        const hasFinal = fin != null;
                        const saved = yekdemSaved[m];
                        const isSaving = yekdemSaving === m || yekdemSaving === -1;

                        return (
                          <div
                            key={m}
                            className={`rounded-xl border p-3 transition-all duration-200 ${
                              hasFill
                                ? "bg-gradient-to-br from-green-50 to-emerald-50 border-emerald-300"
                                : "bg-neutral-50 border-dashed border-neutral-300"
                            }`}
                          >
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-sm font-bold text-neutral-800">{MONTH_NAMES[m - 1]}</span>
                              <div className="flex items-center gap-1">
                                {hasFinal && (
                                  <span className="text-[10px] bg-green-600 text-white rounded-full px-2 py-0.5 font-medium">
                                    Kesin
                                  </span>
                                )}
                                {saved === "ok" && !isSaving && (
                                  <Check size={14} className="text-green-600" />
                                )}
                              </div>
                            </div>

                            {/* yekdem_value — Tahmini */}
                            <label className="block mb-1.5">
                              <span className="text-[10px] text-neutral-500">Tahmini (TL/kWh)</span>
                              <input
                                type="number"
                                step="0.00001"
                                value={d(val)}
                                onChange={(e) =>
                                  setYekdemDraft((p) => ({
                                    ...p,
                                    [m]: { ...p[m], yekdem_value: numOrNull(e.target.value) },
                                  }))
                                }
                                className="w-full rounded-lg border border-neutral-300 px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-blue-200"
                              />
                            </label>

                            {/* yekdem_final — Kesin */}
                            <label className="block mb-1.5">
                              <span className="text-[10px] text-neutral-500">Kesin (TL/kWh)</span>
                              <input
                                type="number"
                                step="0.00001"
                                value={d(fin)}
                                onChange={(e) =>
                                  setYekdemDraft((p) => ({
                                    ...p,
                                    [m]: { ...p[m], yekdem_final: numOrNull(e.target.value) },
                                  }))
                                }
                                className="w-full rounded-lg border border-neutral-300 px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-blue-200"
                              />
                            </label>

                            {/* diger_degerler */}
                            <label className="block mb-2">
                              <span className="text-[10px] text-neutral-500">Diğer</span>
                              <input
                                type="number"
                                value={d(dig)}
                                onChange={(e) =>
                                  setYekdemDraft((p) => ({
                                    ...p,
                                    [m]: { ...p[m], diger_degerler: numOrNull(e.target.value) },
                                  }))
                                }
                                className="w-full rounded-lg border border-neutral-300 px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-blue-200"
                              />
                            </label>

                            {/* Per-card save */}
                            <button
                              disabled={isSaving}
                              onClick={() => saveYekdemMonth(m)}
                              className="w-full rounded-lg bg-black px-2 py-1 text-[11px] text-white font-medium disabled:opacity-50 transition-opacity"
                            >
                              {isSaving ? "..." : "Kaydet"}
                            </button>

                            {saved === "err" && (
                              <p className="text-[10px] text-red-600 mt-1">Hata!</p>
                            )}
                          </div>
                        );
                      })}
                    </div>

                    {/* Bulk save */}
                    <button
                      disabled={yekdemSaving != null}
                      onClick={saveAllYekdem}
                      className="mt-4 w-full rounded-lg bg-black px-4 py-2 text-sm text-white font-medium disabled:opacity-50 transition-opacity"
                    >
                      {yekdemSaving === -1 ? "Kaydediliyor..." : "Tümünü Kaydet"}
                    </button>
                  </div>
                )
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
