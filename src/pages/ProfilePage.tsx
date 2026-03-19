// src/pages/ProfilePage.tsx
import { useEffect, useMemo, useState } from "react";
import { useSession } from "@/hooks/useSession";
import { supabase } from "@/lib/supabase";
import DashboardShell from "@/components/dashboard/DashboardShell";
import PhoneNumberManager from "@/components/dashboard/PhoneNumberManager";
import {
  Building2,
  Lock,
  Eye,
  EyeOff,
  Check,
  Save,
  Hash,
  Tag,
  Zap,
  Sun,
} from "lucide-react";
import { setSubscriptionHidden } from "@/lib/subscriptionVisibility";
import { setBtvEnabled } from "@/lib/btvToggle";

type FacilityRow = {
  subscriptionSerNo: number;
  meterSerial: string | null;
  title: string | null;
  nickname: string | null;
  isHidden: boolean;
  btvEnabled: boolean;
};

export default function ProfilePage() {
  const { session } = useSession();
  const uid = session?.user?.id ?? null;

  // Nickname listesi
  const [facilities, setFacilities] = useState<FacilityRow[]>([]);
  const [facLoading, setFacLoading] = useState(true);
  const [facErr, setFacErr] = useState<string | null>(null);

  // her serno icin input degerleri
  const [nickValues, setNickValues] = useState<Record<number, string>>({});
  const [nickSaving, setNickSaving] = useState<Record<number, boolean>>({});
  const [nickMsg, setNickMsg] = useState<Record<number, string | null>>({});
  const [hiddenSaving, setHiddenSaving] = useState<Record<number, boolean>>({});
  const [btvSaving, setBtvSaving] = useState<Record<number, boolean>>({});

  const toggleVisibility = async (serno: number) => {
    if (!uid) return;
    const facility = facilities.find((f) => f.subscriptionSerNo === serno);
    if (!facility) return;

    const newHidden = !facility.isHidden;
    setHiddenSaving((p) => ({ ...p, [serno]: true }));

    try {
      await setSubscriptionHidden(uid, serno, newHidden);
      setFacilities((prev) =>
        prev.map((f) =>
          f.subscriptionSerNo === serno ? { ...f, isHidden: newHidden } : f
        )
      );
    } catch (e: any) {
      console.error("toggle visibility error:", e);
    } finally {
      setHiddenSaving((p) => ({ ...p, [serno]: false }));
    }
  };

  const toggleBtv = async (serno: number) => {
    if (!uid) return;
    const facility = facilities.find((f) => f.subscriptionSerNo === serno);
    if (!facility) return;

    const newVal = !facility.btvEnabled;
    setBtvSaving((p) => ({ ...p, [serno]: true }));

    try {
      await setBtvEnabled(uid, serno, newVal);
      setFacilities((prev) =>
        prev.map((f) =>
          f.subscriptionSerNo === serno ? { ...f, btvEnabled: newVal } : f
        )
      );
    } catch (e: any) {
      console.error("toggle btv error:", e);
    } finally {
      setBtvSaving((p) => ({ ...p, [serno]: false }));
    }
  };

  const effectiveLabel = useMemo(() => {
    const map = new Map<number, string>();
    for (const f of facilities) {
      const tesisNo = (f.meterSerial ?? `Tesis ${f.subscriptionSerNo}`).trim();
      const nickEffective = (f.nickname ?? f.title ?? "").trim();
      map.set(f.subscriptionSerNo, nickEffective ? `${tesisNo} - ${nickEffective}` : tesisNo);
    }
    return map;
  }, [facilities]);

  // Tesis nickname'lerini yukle
  useEffect(() => {
    if (!uid) return;

    let cancel = false;

    const loadFacilities = async () => {
      setFacLoading(true);
      setFacErr(null);

      try {
        const { data: osData, error: osErr } = await supabase
          .from("owner_subscriptions")
          .select("subscription_serno, meter_serial, title, btv_enabled")
          .eq("user_id", uid)
          .order("subscription_serno", { ascending: true });

        if (cancel) return;
        if (osErr) throw osErr;

        let list: FacilityRow[] = [];

        if (osData && osData.length > 0) {
          const sernos = osData
            .map((r: any) => Number(r.subscription_serno))
            .filter((n: any) => Number.isFinite(n));

          let ssMap = new Map<number, { title: string | null; nickname: string | null; isHidden: boolean }>();

          if (sernos.length > 0) {
            const { data: ssData, error: ssErr } = await supabase
              .from("subscription_settings")
              .select("subscription_serno, title, nickname, is_hidden")
              .eq("user_id", uid)
              .in("subscription_serno", sernos);

            if (ssErr) {
              console.warn("subscription_settings load warn:", ssErr);
            }

            for (const r of (ssData ?? []) as any[]) {
              const k = Number(r.subscription_serno);
              if (Number.isFinite(k)) {
                ssMap.set(k, { title: r.title ?? null, nickname: r.nickname ?? null, isHidden: r.is_hidden ?? false });
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
              isHidden: ss?.isHidden ?? false,
              btvEnabled: r.btv_enabled ?? true,
            };
          });
        } else {
          const { data: ssData, error: ssErr } = await supabase
            .from("subscription_settings")
            .select("subscription_serno, title, nickname, is_hidden")
            .eq("user_id", uid)
            .order("subscription_serno", { ascending: true });

          if (cancel) return;
          if (ssErr) throw ssErr;

          list = (ssData ?? []).map((r: any) => ({
            subscriptionSerNo: Number(r.subscription_serno),
            meterSerial: null,
            title: r.title ?? null,
            nickname: r.nickname ?? null,
            isHidden: r.is_hidden ?? false,
            btvEnabled: true,
          }));
        }

        if (cancel) return;

        setFacilities(list);

        const next: Record<number, string> = {};
        for (const f of list) {
          const val = (f.nickname ?? f.title ?? "").toString();
          next[f.subscriptionSerNo] = val;
        }
        setNickValues(next);
        setNickMsg({});
      } catch (e: any) {
        console.error(e);
        if (!cancel) setFacErr(e?.message ?? "Tesisler yüklenirken bir hata oluştu.");
      } finally {
        if (!cancel) setFacLoading(false);
      }
    };

    void loadFacilities();

    return () => {
      cancel = true;
    };
  }, [uid]);

  const saveNickname = async (serno: number) => {
    if (!uid) return;

    setNickMsg((p) => ({ ...p, [serno]: null }));
    setNickSaving((p) => ({ ...p, [serno]: true }));

    try {
      const f = facilities.find((x) => x.subscriptionSerNo === serno);
      const title = (f?.title ?? "").trim();

      const raw = (nickValues[serno] ?? "").trim();

      const nicknameToSave = raw === "" || (title && raw === title) ? null : raw;

      const upd = await supabase
        .from("subscription_settings")
        .update({ nickname: nicknameToSave })
        .eq("user_id", uid)
        .eq("subscription_serno", serno)
        .select("subscription_serno")
        .maybeSingle();

      if (upd.error) throw upd.error;

      if (!upd.data) {
        const ins = await supabase.from("subscription_settings").insert({
          user_id: uid,
          subscription_serno: serno,
          title: title || null,
          nickname: nicknameToSave,
        });

        if (ins.error) throw ins.error;
      }

      setFacilities((prev) =>
        prev.map((x) =>
          x.subscriptionSerNo === serno
            ? { ...x, nickname: nicknameToSave }
            : x
        )
      );

      setNickMsg((p) => ({ ...p, [serno]: "Kaydedildi." }));
    } catch (e: any) {
      console.error(e);
      setNickMsg((p) => ({
        ...p,
        [serno]: e?.message ?? "Kaydedilemedi.",
      }));
    } finally {
      setNickSaving((p) => ({ ...p, [serno]: false }));
    }
  };

  // ====== GES Hesapları ======
  type GesProvider = { id: number; name: string; display_name: string };
  type GesCredential = {
    id: string;
    provider_id: number;
    username: string;
    is_active: boolean;
    sync_status: string;
    last_sync_at: string | null;
    sync_error: string | null;
    provider_display_name?: string;
    plant_count?: number;
  };

  const [gesProviders, setGesProviders] = useState<GesProvider[]>([]);
  const [gesCredentials, setGesCredentials] = useState<GesCredential[]>([]);
  const [gesLoading, setGesLoading] = useState(false);

  // GES form state
  const [gesSelectedProvider, setGesSelectedProvider] = useState<number | null>(null);
  const [gesUsername, setGesUsername] = useState("");
  const [gesPassword, setGesPassword] = useState("");
  const [gesShowPw, setGesShowPw] = useState(false);
  const [gesSaving, setGesSaving] = useState(false);
  const [gesMsg, setGesMsg] = useState<string | null>(null);
  const [gesMsgType, setGesMsgType] = useState<"success" | "error">("success");

  // GES verilerini yükle
  useEffect(() => {
    if (!uid) return;
    let cancel = false;

    (async () => {
      setGesLoading(true);
      try {
        // Providers
        const { data: provs } = await supabase
          .from("ges_providers")
          .select("id, name, display_name")
          .eq("is_active", true)
          .order("display_name");

        if (cancel) return;
        setGesProviders(provs ?? []);
        if (provs?.length && !gesSelectedProvider) {
          setGesSelectedProvider(provs[0].id);
        }

        // Credentials (password_enc hariç)
        const { data: creds } = await supabase
          .from("ges_credentials")
          .select("id, provider_id, username, is_active, sync_status, last_sync_at, sync_error")
          .eq("user_id", uid)
          .order("created_at", { ascending: false });

        if (cancel) return;

        // Her credential için plant sayısı ve provider adını bul
        const enriched: GesCredential[] = [];
        for (const c of creds ?? []) {
          const prov = (provs ?? []).find((p: GesProvider) => p.id === c.provider_id);
          const { count } = await supabase
            .from("ges_plants")
            .select("*", { count: "exact", head: true })
            .eq("credential_id", c.id)
            .eq("is_active", true);

          if (cancel) return;
          enriched.push({
            ...c,
            provider_display_name: prov?.display_name ?? `Provider #${c.provider_id}`,
            plant_count: count ?? 0,
          });
        }

        setGesCredentials(enriched);
      } catch (e: any) {
        console.error("GES credentials load error:", e);
      } finally {
        if (!cancel) setGesLoading(false);
      }
    })();

    return () => { cancel = true; };
  }, [uid]);

  // GES credential kaydetme
  const handleGesCredentialSave = async () => {
    if (!uid || !gesSelectedProvider || !gesUsername.trim() || !gesPassword.trim()) return;

    // Aynı provider'da zaten hesap var mı?
    if (gesCredentials.some((c) => c.provider_id === gesSelectedProvider)) {
      setGesMsg("Bu sağlayıcıda zaten bir hesabınız var.");
      setGesMsgType("error");
      return;
    }

    setGesSaving(true);
    setGesMsg(null);

    try {
      const { error } = await supabase.from("ges_credentials").insert({
        user_id: uid,
        provider_id: gesSelectedProvider,
        username: gesUsername.trim(),
        password_enc: btoa(gesPassword), // base64 encode — ileride pgcrypto
      });

      if (error) throw error;

      setGesMsg("Hesabınız kaydedildi. Santralleriniz yakında otomatik olarak senkronize edilecektir.");
      setGesMsgType("success");
      setGesUsername("");
      setGesPassword("");

      // Listeyi yeniden yükle
      const { data: creds } = await supabase
        .from("ges_credentials")
        .select("id, provider_id, username, is_active, sync_status, last_sync_at, sync_error")
        .eq("user_id", uid)
        .order("created_at", { ascending: false });

      const enriched: GesCredential[] = [];
      for (const c of creds ?? []) {
        const prov = gesProviders.find((p) => p.id === c.provider_id);
        const { count } = await supabase
          .from("ges_plants")
          .select("*", { count: "exact", head: true })
          .eq("credential_id", c.id)
          .eq("is_active", true);
        enriched.push({
          ...c,
          provider_display_name: prov?.display_name ?? `Provider #${c.provider_id}`,
          plant_count: count ?? 0,
        });
      }
      setGesCredentials(enriched);
    } catch (e: any) {
      setGesMsg(e?.message ?? "Kayıt sırasında hata oluştu.");
      setGesMsgType("error");
    } finally {
      setGesSaving(false);
    }
  };

  const gesProviderAlreadyExists = gesSelectedProvider
    ? gesCredentials.some((c) => c.provider_id === gesSelectedProvider)
    : false;

  // Sifre formu
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newPasswordAgain, setNewPasswordAgain] = useState("");
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSuccess, setPasswordSuccess] = useState<string | null>(null);
  const [changing, setChanging] = useState(false);
  const [showCurrentPw, setShowCurrentPw] = useState(false);
  const [showNewPw, setShowNewPw] = useState(false);

  // Sifre degistirme
  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError(null);
    setPasswordSuccess(null);

    if (!session?.user?.email) {
      setPasswordError("Oturum bulunamadı. Lutfen tekrar giriş yap.");
      return;
    }

    if (!currentPassword) {
      setPasswordError("Mevcut şifreni yazmalısın.");
      return;
    }

    if (newPassword.length < 8) {
      setPasswordError("Yeni şifre en az 8 karakter olmalı.");
      return;
    }

    if (newPassword !== newPasswordAgain) {
      setPasswordError("Yeni şifreler birbiriyle aynı değil.");
      return;
    }

    setChanging(true);
    try {
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: session.user.email,
        password: currentPassword,
      });

      if (signInError) {
        console.error(signInError);
        setPasswordError("Mevcut şifre hatali.");
        setChanging(false);
        return;
      }

      const { error: updateError } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (updateError) {
        console.error(updateError);
        setPasswordError("Sifre guncellenirken bir hata olustu.");
      } else {
        setPasswordSuccess("Sifren basariyla guncellendi.");
        setCurrentPassword("");
        setNewPassword("");
        setNewPasswordAgain("");
      }
    } catch (err) {
      console.error(err);
      setPasswordError("Beklenmeyen bir hata olustu.");
    } finally {
      setChanging(false);
    }
  };

  return (
    <DashboardShell>
      <div className="space-y-6">

        {/* ====== Facility Nicknames ====== */}
        <section className="rounded-2xl border border-neutral-200/60 bg-white shadow-sm overflow-hidden">
          {/* Section header */}
          <div className="px-6 py-4 border-b border-neutral-100 bg-gradient-to-r from-neutral-50/80 to-white">
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-xl bg-[#0A66FF]/10 flex items-center justify-center">
                <Building2 className="h-4.5 w-4.5 text-[#0A66FF]" />
              </div>
              <div>
                <h2 className="text-sm font-semibold text-neutral-900">Tesis Nickname&apos;leri</h2>
                <p className="text-xs text-neutral-400">
                  Her tesis için özel tesis tanımlayın
                </p>
              </div>
            </div>
          </div>

          <div className="p-6">
            {facLoading && (
              <div className="flex items-center gap-3 py-4">
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-[#0A66FF] border-t-transparent" />
                <span className="text-sm text-neutral-500">Tesisler yükleniyor...</span>
              </div>
            )}

            {facErr && (
              <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {facErr}
              </div>
            )}

            {!facLoading && !facErr && facilities.length === 0 && (
              <div className="text-center py-8">
                <Building2 className="h-10 w-10 text-neutral-300 mx-auto mb-3" />
                <p className="text-sm text-neutral-500">
                  bu hesaba bağlı herhangi bir tesis bulunamadı.
                </p>
              </div>
            )}

            {!facLoading && !facErr && facilities.length > 0 && (
              <div className="space-y-3">
                {facilities.map((f, i) => {
                  const tesisNo = (f.meterSerial ?? `Tesis ${f.subscriptionSerNo}`).trim();
                  const title = (f.title ?? "").trim();
                  const isSaving = !!nickSaving[f.subscriptionSerNo];
                  const msg = nickMsg[f.subscriptionSerNo];

                  return (
                    <div
                      key={f.subscriptionSerNo}
                      className="group rounded-xl border border-neutral-200/80 bg-white hover:border-[#0A66FF]/20 hover:shadow-sm px-5 py-4 transition-all duration-200"
                    >
                      <div className="flex flex-wrap items-center gap-3 mb-3">
                        <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-[#0A66FF]/10 to-[#3B82F6]/10 flex items-center justify-center text-xs font-bold text-[#0A66FF]">
                          {i + 1}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <div className="font-medium text-neutral-900 text-sm truncate">
                              {tesisNo}
                              {title ? ` - ${title}` : ""}
                            </div>
                            {f.isHidden && (
                              <span className="inline-flex items-center gap-1 rounded-md bg-neutral-100 px-2 py-0.5 text-[10px] font-medium text-neutral-400 shrink-0">
                                <EyeOff className="h-3 w-3" />
                                Gizli
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <Hash className="h-3 w-3 text-neutral-400" />
                            <span className="text-xs text-neutral-400">SerNo: {f.subscriptionSerNo}</span>
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                        <div className="relative flex-1">
                          <Tag className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-neutral-400" />
                          <input
                            value={nickValues[f.subscriptionSerNo] ?? ""}
                            onChange={(e) =>
                              setNickValues((p) => ({
                                ...p,
                                [f.subscriptionSerNo]: e.target.value,
                              }))
                            }
                            placeholder={title || "Nickname girin..."}
                            className="w-full rounded-lg border border-neutral-200 bg-neutral-50/50 pl-9 pr-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#0A66FF]/40 focus:border-[#0A66FF]/40 focus:bg-white transition-all"
                          />
                        </div>

                        <button
                          type="button"
                          onClick={() => saveNickname(f.subscriptionSerNo)}
                          disabled={isSaving}
                          className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#0A66FF] hover:bg-[#0952D4] px-4 py-2.5 text-sm font-medium text-white shadow-sm shadow-[#0A66FF]/20 disabled:opacity-60 transition-all duration-200 active:scale-[0.97]"
                        >
                          {isSaving ? (
                            <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                          ) : (
                            <Save className="h-3.5 w-3.5" />
                          )}
                          {isSaving ? "Kaydediliyor..." : "Kaydet"}
                        </button>

                        <button
                          type="button"
                          onClick={() => toggleVisibility(f.subscriptionSerNo)}
                          disabled={!!hiddenSaving[f.subscriptionSerNo]}
                          className={`inline-flex items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium border transition-all duration-200 active:scale-[0.97] disabled:opacity-60 ${
                            f.isHidden
                              ? "border-neutral-300 bg-neutral-100 text-neutral-500 hover:bg-neutral-200"
                              : "border-[#0A66FF]/20 bg-[#0A66FF]/5 text-[#0A66FF] hover:bg-[#0A66FF]/10"
                          }`}
                          title={f.isHidden ? "Tesisi göster" : "Tesisi gizle"}
                        >
                          {hiddenSaving[f.subscriptionSerNo] ? (
                            <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                          ) : f.isHidden ? (
                            <EyeOff className="h-3.5 w-3.5" />
                          ) : (
                            <Eye className="h-3.5 w-3.5" />
                          )}
                          {f.isHidden ? "Gizli" : "Görünür"}
                        </button>

                        <button
                          type="button"
                          onClick={() => toggleBtv(f.subscriptionSerNo)}
                          disabled={!!btvSaving[f.subscriptionSerNo]}
                          className={`inline-flex items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium border transition-all duration-200 active:scale-[0.97] disabled:opacity-60 ${
                            f.btvEnabled
                              ? "border-[#0A66FF]/20 bg-[#0A66FF]/5 text-[#0A66FF] hover:bg-[#0A66FF]/10"
                              : "border-neutral-300 bg-neutral-100 text-neutral-500 hover:bg-neutral-200"
                          }`}
                          title={f.btvEnabled ? "BTV aktif - devre disi birakmak icin tikla" : "BTV devre disi - aktif etmek icin tikla"}
                        >
                          {btvSaving[f.subscriptionSerNo] ? (
                            <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                          ) : (
                            <Zap className="h-3.5 w-3.5" />
                          )}
                          {f.btvEnabled ? "BTV Açık" : "BTV Kapalı"}
                        </button>
                      </div>

                      {/* Preview + message */}
                      <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2">
                        <div className="text-xs text-neutral-400">
                          Dashboard görünümü:{" "}
                          <span className="font-medium text-neutral-600">
                            {effectiveLabel.get(f.subscriptionSerNo) ?? tesisNo}
                          </span>
                        </div>

                        {msg && (
                          <span
                            className={`inline-flex items-center gap-1 text-xs font-medium ${
                              msg === "Kaydedildi."
                                ? "text-emerald-600"
                                : "text-red-500"
                            }`}
                          >
                            {msg === "Kaydedildi." && <Check className="h-3 w-3" />}
                            {msg}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </section>

        {/* ====== SMS Notification Settings ====== */}
        <PhoneNumberManager />

        {/* ====== GES Hesapları ====== */}
        <section className="rounded-2xl border border-neutral-200/60 bg-white shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-neutral-100 bg-gradient-to-r from-neutral-50/80 to-white">
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-xl bg-emerald-500/10 flex items-center justify-center">
                <Sun className="h-4.5 w-4.5 text-emerald-600" />
              </div>
              <div>
                <h2 className="text-sm font-semibold text-neutral-900">GES Hesapları</h2>
                <p className="text-xs text-neutral-400">
                  Güneş enerji santrali API hesaplarınız
                </p>
              </div>
            </div>
          </div>

          <div className="p-6 space-y-6">
            {/* Mevcut credentials listesi */}
            {gesLoading ? (
              <p className="text-sm text-neutral-500">Yükleniyor…</p>
            ) : gesCredentials.length > 0 ? (
              <div className="space-y-3">
                {gesCredentials.map((cred) => (
                  <div
                    key={cred.id}
                    className="flex flex-col sm:flex-row sm:items-center gap-3 rounded-xl border border-neutral-200/60 bg-neutral-50/50 p-4"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-neutral-900">
                        {cred.provider_display_name}
                      </p>
                      <p className="text-xs text-neutral-500 mt-0.5">
                        Kullanıcı: {cred.username}
                      </p>
                      {cred.last_sync_at && (
                        <p className="text-[11px] text-neutral-400 mt-0.5">
                          Son sync: {new Date(cred.last_sync_at).toLocaleString("tr-TR")}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <span
                        className={[
                          "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium",
                          cred.sync_status === "success"
                            ? "bg-emerald-100 text-emerald-700"
                            : cred.sync_status === "failed"
                            ? "bg-red-100 text-red-700"
                            : "bg-amber-100 text-amber-700",
                        ].join(" ")}
                      >
                        {cred.sync_status === "success"
                          ? "Başarılı"
                          : cred.sync_status === "failed"
                          ? "Hata"
                          : "Bekliyor"}
                      </span>
                      <span className="text-[11px] text-neutral-400">
                        {cred.plant_count ?? 0} santral
                      </span>
                    </div>
                  </div>
                ))}
                <p className="text-[11px] text-neutral-400 mt-2">
                  Hesap bilgilerinizi değiştirmek için yöneticiyle iletişime geçin.
                </p>
              </div>
            ) : (
              <p className="text-sm text-neutral-400">Henüz bir GES hesabı eklenmemiş.</p>
            )}

            {/* Yeni credential ekleme formu */}
            <div className="border-t border-neutral-100 pt-5">
              <h3 className="text-xs font-semibold text-neutral-700 mb-3">Yeni GES Hesabı Ekle</h3>

              <div className="space-y-3 max-w-lg">
                {/* Provider seçici */}
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-neutral-600">Sağlayıcı</label>
                  <select
                    value={gesSelectedProvider ?? ""}
                    onChange={(e) => setGesSelectedProvider(e.target.value ? Number(e.target.value) : null)}
                    className="w-full rounded-lg border border-neutral-200 bg-neutral-50/50 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#0A66FF]/40 focus:border-[#0A66FF]/40 focus:bg-white transition-all"
                  >
                    <option value="">Sağlayıcı seçin</option>
                    {gesProviders.map((p) => (
                      <option key={p.id} value={p.id}>{p.display_name}</option>
                    ))}
                  </select>
                  {gesProviderAlreadyExists && (
                    <p className="text-[11px] text-amber-600">
                      Bu sağlayıcıda zaten bir hesabınız var.
                    </p>
                  )}
                </div>

                {/* Username */}
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-neutral-600">Kullanıcı Adı</label>
                  <input
                    type="text"
                    value={gesUsername}
                    onChange={(e) => setGesUsername(e.target.value)}
                    placeholder="API kullanıcı adınız"
                    className="w-full rounded-lg border border-neutral-200 bg-neutral-50/50 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#0A66FF]/40 focus:border-[#0A66FF]/40 focus:bg-white transition-all"
                  />
                </div>

                {/* Password */}
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-neutral-600">Şifre</label>
                  <div className="relative">
                    <input
                      type={gesShowPw ? "text" : "password"}
                      value={gesPassword}
                      onChange={(e) => setGesPassword(e.target.value)}
                      placeholder="API şifreniz"
                      className="w-full rounded-lg border border-neutral-200 bg-neutral-50/50 px-3 py-2.5 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-[#0A66FF]/40 focus:border-[#0A66FF]/40 focus:bg-white transition-all"
                    />
                    <button
                      type="button"
                      onClick={() => setGesShowPw((v) => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-600 transition-colors"
                      tabIndex={-1}
                    >
                      {gesShowPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                {/* Mesaj */}
                {gesMsg && (
                  <div
                    className={[
                      "rounded-lg border px-4 py-2.5 text-xs flex items-center gap-2",
                      gesMsgType === "success"
                        ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                        : "border-red-200 bg-red-50 text-red-700",
                    ].join(" ")}
                  >
                    {gesMsgType === "success" && <Check className="h-3.5 w-3.5 shrink-0" />}
                    {gesMsg}
                  </div>
                )}

                {/* Kaydet butonu */}
                <button
                  type="button"
                  onClick={handleGesCredentialSave}
                  disabled={gesSaving || !gesSelectedProvider || !gesUsername.trim() || !gesPassword.trim() || gesProviderAlreadyExists}
                  className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 px-5 py-2.5 text-sm font-medium text-white shadow-sm shadow-emerald-600/20 disabled:opacity-60 transition-all duration-200 active:scale-[0.97]"
                >
                  {gesSaving ? (
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  ) : (
                    <Save className="h-3.5 w-3.5" />
                  )}
                  {gesSaving ? "Kaydediliyor…" : "Kaydet"}
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* ====== Change Password ====== */}
        <section className="rounded-2xl border border-neutral-200/60 bg-white shadow-sm overflow-hidden">
          {/* Section header */}
          <div className="px-6 py-4 border-b border-neutral-100 bg-gradient-to-r from-neutral-50/80 to-white">
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-xl bg-amber-500/10 flex items-center justify-center">
                <Lock className="h-4.5 w-4.5 text-amber-600" />
              </div>
              <div>
                <h2 className="text-sm font-semibold text-neutral-900">Şifre Değiştir</h2>
                <p className="text-xs text-neutral-400">
                  Hesap günvenliğiniz için güçlü bir şifre kullanın
                </p>
              </div>
            </div>
          </div>

          <div className="p-6 max-w-lg">
            <form className="space-y-4" onSubmit={handleChangePassword}>
              {/* Current Password */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-neutral-600 flex items-center gap-1.5">
                  <Lock className="h-3 w-3" />
                  Mevcut Şifre
                </label>
                <div className="relative">
                  <input
                    type={showCurrentPw ? "text" : "password"}
                    className="w-full rounded-lg border border-neutral-200 bg-neutral-50/50 px-3 py-2.5 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-[#0A66FF]/40 focus:border-[#0A66FF]/40 focus:bg-white transition-all"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    autoComplete="current-password"
                    placeholder="Mevcut sifrenizi girin"
                  />
                  <button
                    type="button"
                    onClick={() => setShowCurrentPw((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-600 transition-colors"
                    tabIndex={-1}
                  >
                    {showCurrentPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              {/* New Password */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-neutral-600 flex items-center gap-1.5">
                  <Lock className="h-3 w-3" />
                  Yeni Şifre
                </label>
                <div className="relative">
                  <input
                    type={showNewPw ? "text" : "password"}
                    className="w-full rounded-lg border border-neutral-200 bg-neutral-50/50 px-3 py-2.5 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-[#0A66FF]/40 focus:border-[#0A66FF]/40 focus:bg-white transition-all"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    autoComplete="new-password"
                    placeholder="En az 8 karakter"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPw((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-600 transition-colors"
                    tabIndex={-1}
                  >
                    {showNewPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                {/* Password strength indicator */}
                {newPassword.length > 0 && (
                  <div className="flex items-center gap-2 mt-1">
                    <div className="flex-1 h-1 rounded-full bg-neutral-100 overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-300 ${
                          newPassword.length >= 12
                            ? "bg-emerald-500 w-full"
                            : newPassword.length >= 8
                            ? "bg-amber-500 w-2/3"
                            : "bg-red-500 w-1/3"
                        }`}
                        style={{
                          width:
                            newPassword.length >= 12
                              ? "100%"
                              : newPassword.length >= 8
                              ? "66%"
                              : "33%",
                        }}
                      />
                    </div>
                    <span
                      className={`text-[10px] font-medium ${
                        newPassword.length >= 12
                          ? "text-emerald-600"
                          : newPassword.length >= 8
                          ? "text-amber-600"
                          : "text-red-500"
                      }`}
                    >
                      {newPassword.length >= 12
                        ? "Guclu"
                        : newPassword.length >= 8
                        ? "Orta"
                        : "Zayif"}
                    </span>
                  </div>
                )}
              </div>

              {/* Confirm New Password */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-neutral-600 flex items-center gap-1.5">
                  <Lock className="h-3 w-3" />
                  Yeni Şifre (Tekrar)
                </label>
                <input
                  type="password"
                  className="w-full rounded-lg border border-neutral-200 bg-neutral-50/50 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#0A66FF]/40 focus:border-[#0A66FF]/40 focus:bg-white transition-all"
                  value={newPasswordAgain}
                  onChange={(e) => setNewPasswordAgain(e.target.value)}
                  autoComplete="new-password"
                  placeholder="Yeni sifrenizi tekrar girin"
                />
                {newPasswordAgain.length > 0 && newPassword !== newPasswordAgain && (
                  <p className="text-[11px] text-red-500 mt-0.5">Şifreler Eşleşmiyor</p>
                )}
              </div>

              {/* Error / Success */}
              {passwordError && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-xs text-red-700 flex items-center gap-2">
                  <div className="h-1.5 w-1.5 rounded-full bg-red-500 shrink-0" />
                  {passwordError}
                </div>
              )}
              {passwordSuccess && (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-xs text-emerald-700 flex items-center gap-2">
                  <Check className="h-3.5 w-3.5 shrink-0" />
                  {passwordSuccess}
                </div>
              )}

              <button
                type="submit"
                disabled={changing}
                className="inline-flex items-center gap-2 rounded-lg bg-[#0A66FF] hover:bg-[#0952D4] px-5 py-2.5 text-sm font-medium text-white shadow-sm shadow-[#0A66FF]/20 disabled:opacity-60 transition-all duration-200 active:scale-[0.97]"
              >
                {changing ? (
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                ) : (
                  <Lock className="h-3.5 w-3.5" />
                )}
                {changing ? "Guncelleniyor..." : "Sifreyi Guncelle"}
              </button>
            </form>
          </div>
        </section>
      </div>
    </DashboardShell>
  );
}
