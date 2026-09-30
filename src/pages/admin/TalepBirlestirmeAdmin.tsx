// src/pages/admin/TalepBirlestirmeAdmin.tsx
// Talep Birleştirme: bir GES'in üretiminin (veriş) öncelik sıralı birden fazla
// tesise mahsup edilmesi için atama yönetimi (ges_mahsup_assignments).
//
// - Kullanıcı seç → GES tesisleri listelenir; atama olan GES'te chip gösterilir.
// - GES seç → priority sıralı atama listesi: ekle / yukarı-aşağı / sil.
// - Reorder tek transaction'da: supabase.rpc("set_ges_mahsup_priorities", ...)
//   (UNIQUE(ges_plant_id, priority) DEFERRABLE olduğundan swap güvenli).
// - Atama satırı OLMAYAN GES'lerde davranış değişmez (linked_serno tekil mahsup).
import { useEffect, useMemo, useRef, useState } from "react";
import {
  GitMerge,
  ChevronUp,
  ChevronDown,
  Trash2,
  Plus,
  AlertTriangle,
  RotateCcw,
  Sun,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { dayjsTR } from "@/lib/dayjs";
import {
  clearGesAllocationCache,
  coerceTahsisModu,
  isPoolMode,
  TAHSIS_MODU_LABEL,
  type TahsisModu,
} from "@/components/utils/gesAllocation";

type UserRow = { user_id: string; aril_user: string | null };

type PlantRow = {
  id: string;
  plant_name: string | null;
  nickname: string | null;
  linked_serno: number | null;
  source_serno: number | null;
  is_active: boolean | null;
  tahsis_modu: string | null;
};

/** Admin seçicideki etiketler (iş tarafının kullandığı adlandırma). */
const TAHSIS_MODU_OPTIONS: Array<{ value: TahsisModu; label: string }> = [
  { value: "sirali", label: "Sıralı (mevcut sistem)" },
  { value: "saatlik_oransal", label: "Saatlik oransal (Meram mantığı)" },
  { value: "toplam_oransal", label: "Toplam tüketim oransal (Kayseri mantığı)" },
];

type FacilityRow = {
  subscription_serno: number;
  title: string | null;
  nickname: string | null;
  lisansli_satis: boolean;
};

type AssignmentRow = {
  id: string;
  ges_plant_id: string;
  user_id: string;
  subscription_serno: number;
  priority: number;
};

function plantLabel(p: PlantRow) {
  return p.nickname || p.plant_name || p.id.slice(0, 8);
}

function errMsg(e: unknown, fallback: string) {
  return e instanceof Error && e.message ? e.message : fallback;
}

function facilityLabel(f: FacilityRow | undefined, serno: number) {
  if (!f) return `Tesis ${serno}`;
  return `${f.nickname || f.title || "Tesis"} (${serno})`;
}

export default function TalepBirlestirmeAdmin() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string>("");

  const [plants, setPlants] = useState<PlantRow[]>([]);
  const [facilities, setFacilities] = useState<FacilityRow[]>([]);
  const [assignments, setAssignments] = useState<AssignmentRow[]>([]);
  const [selectedPlantId, setSelectedPlantId] = useState<string>("");

  const [candidateSerno, setCandidateSerno] = useState<string>("");
  const [candidateHasGn, setCandidateHasGn] = useState<boolean>(false);

  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<number | undefined>(undefined);

  useEffect(() => {
    return () => window.clearTimeout(toastTimer.current);
  }, []);

  function showToast(message: string) {
    setToast(message);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 2500);
  }

  // Kullanıcı listesi (user_integrations — mevcut admin user-picker kalıbı)
  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from("user_integrations")
        .select("user_id, aril_user")
        .order("aril_user", { ascending: true })
        .limit(5000);
      if (error) {
        setErr(error.message);
        return;
      }
      setUsers((data ?? []) as UserRow[]);
    })();
  }, []);

  async function loadUserData(userId: string) {
    setLoading(true);
    setErr(null);
    try {
      const [plantsRes, subsRes, settingsRes, asgRes] = await Promise.all([
        supabase
          .from("ges_plants")
          .select("id, plant_name, nickname, linked_serno, source_serno, is_active, tahsis_modu")
          .eq("user_id", userId)
          .order("created_at", { ascending: true }),
        supabase
          .from("owner_subscriptions")
          .select("subscription_serno, title")
          .eq("user_id", userId)
          .order("subscription_serno", { ascending: true }),
        supabase
          .from("subscription_settings")
          .select("subscription_serno, nickname, lisansli_satis")
          .eq("user_id", userId),
        supabase
          .from("ges_mahsup_assignments")
          .select("id, ges_plant_id, user_id, subscription_serno, priority")
          .eq("user_id", userId)
          .order("priority", { ascending: true }),
      ]);

      const firstErr =
        plantsRes.error || subsRes.error || settingsRes.error || asgRes.error;
      if (firstErr) throw firstErr;

      type Row = Record<string, unknown>;
      const nickMap = new Map<number, { nickname: string | null; lisansli: boolean }>();
      for (const r of (settingsRes.data ?? []) as Row[]) {
        nickMap.set(Number(r.subscription_serno), {
          nickname: (r.nickname as string | null) ?? null,
          lisansli: (r.lisansli_satis as boolean | null) ?? false,
        });
      }

      setPlants(
        ((plantsRes.data ?? []) as Row[]).map((p) => ({
          id: String(p.id),
          plant_name: (p.plant_name as string | null) ?? null,
          nickname: (p.nickname as string | null) ?? null,
          linked_serno: p.linked_serno != null ? Number(p.linked_serno) : null,
          source_serno: p.source_serno != null ? Number(p.source_serno) : null,
          is_active: (p.is_active as boolean | null) ?? null,
          tahsis_modu: (p.tahsis_modu as string | null) ?? null,
        }))
      );
      setFacilities(
        ((subsRes.data ?? []) as Row[]).map((s) => {
          const serno = Number(s.subscription_serno);
          const extra = nickMap.get(serno);
          return {
            subscription_serno: serno,
            title: (s.title as string | null) ?? null,
            nickname: extra?.nickname ?? null,
            lisansli_satis: extra?.lisansli ?? false,
          };
        })
      );
      setAssignments(
        ((asgRes.data ?? []) as Row[]).map((a) => ({
          id: String(a.id),
          ges_plant_id: String(a.ges_plant_id),
          user_id: String(a.user_id),
          subscription_serno: Number(a.subscription_serno),
          priority: Number(a.priority),
        }))
      );
    } catch (e) {
      setErr(errMsg(e, "Veriler yüklenemedi"));
      setPlants([]);
      setFacilities([]);
      setAssignments([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    setSelectedPlantId("");
    setCandidateSerno("");
    if (!selectedUserId) {
      setPlants([]);
      setFacilities([]);
      setAssignments([]);
      return;
    }
    loadUserData(selectedUserId);
  }, [selectedUserId]);

  const facilityMap = useMemo(() => {
    const m = new Map<number, FacilityRow>();
    for (const f of facilities) m.set(f.subscription_serno, f);
    return m;
  }, [facilities]);

  const assignmentsByPlant = useMemo(() => {
    const m = new Map<string, AssignmentRow[]>();
    for (const a of assignments) {
      const list = m.get(a.ges_plant_id) ?? [];
      list.push(a);
      m.set(a.ges_plant_id, list);
    }
    for (const list of m.values()) list.sort((x, y) => x.priority - y.priority);
    return m;
  }, [assignments]);

  // Seçili GES'e zaten atanmış tesisler (uq_gma_plant_serno — UI'da da engelle).
  // uq_gma_user_serno canlı DB'de kaldırılmış (repo migration'ında duruyor — drift):
  // SIRALI modda bir tesis birden fazla GES'e atanabilir (şelale zincirleme işler).
  // ORANSAL (havuz) modda ise YASAK — addAssignment içinde engelleniyor (çift sayım).
  const assignedToSelectedPlant = useMemo(() => {
    const s = new Set<number>();
    for (const a of assignments) {
      if (a.ges_plant_id === selectedPlantId) s.add(a.subscription_serno);
    }
    return s;
  }, [assignments, selectedPlantId]);

  // Başka GES'lere atanmış sernolar — dropdown'da bilgi etiketi için
  const assignedToOtherPlants = useMemo(() => {
    const s = new Set<number>();
    for (const a of assignments) {
      if (a.ges_plant_id !== selectedPlantId) s.add(a.subscription_serno);
    }
    return s;
  }, [assignments, selectedPlantId]);

  // Herhangi bir GES'in linked/source hedefi olan sernolar (yumuşak uyarı için)
  const gesTouchedSernos = useMemo(() => {
    const s = new Set<number>();
    for (const p of plants) {
      if (p.linked_serno != null) s.add(p.linked_serno);
      if (p.source_serno != null) s.add(p.source_serno);
    }
    return s;
  }, [plants]);

  const selectedPlant = plants.find((p) => p.id === selectedPlantId) ?? null;
  const plantAssignments = selectedPlantId
    ? assignmentsByPlant.get(selectedPlantId) ?? []
    : [];
  const selectedPlantSourceSerno = selectedPlant
    ? selectedPlant.source_serno ?? selectedPlant.linked_serno
    : null;
  const sourceInList =
    selectedPlantSourceSerno != null &&
    plantAssignments.some((a) => a.subscription_serno === selectedPlantSourceSerno);
  // Kolon NULL / bilinmeyen değer → "sirali" (mevcut davranış).
  const selectedPlantMode = coerceTahsisModu(selectedPlant?.tahsis_modu);
  const selectedPlantIsPool = isPoolMode(selectedPlantMode);

  // Aday tesis: son 3 ayda gn>0 kontrolü (tek indexli sorgu — yumuşak uyarı)
  useEffect(() => {
    setCandidateHasGn(false);
    const serno = Number(candidateSerno);
    if (!selectedUserId || !candidateSerno || !Number.isFinite(serno)) return;
    let cancel = false;
    (async () => {
      const threeMonthsAgo = dayjsTR().subtract(3, "month").toDate().toISOString();
      const { data } = await supabase
        .from("consumption_hourly")
        .select("ts")
        .eq("user_id", selectedUserId)
        .eq("subscription_serno", serno)
        .gte("ts", threeMonthsAgo)
        .gt("gn", 0)
        .limit(1);
      if (!cancel) setCandidateHasGn((data?.length ?? 0) > 0);
    })();
    return () => {
      cancel = true;
    };
  }, [candidateSerno, selectedUserId]);

  const candidateFacility = candidateSerno
    ? facilityMap.get(Number(candidateSerno))
    : undefined;
  const candidateIsSource =
    !!candidateSerno && Number(candidateSerno) === selectedPlantSourceSerno;
  // "Kendi GES verişi var" uyarısı kaynak tesis için anlamsız (kaynak olması
  // zaten belli) — yalnız kaynak OLMAYAN adaylarda göster.
  const candidateOwnGesWarning =
    !!candidateSerno &&
    !candidateIsSource &&
    (gesTouchedSernos.has(Number(candidateSerno)) || candidateHasGn);

  async function addAssignment() {
    if (!selectedUserId || !selectedPlantId || !candidateSerno) return;
    const serno = Number(candidateSerno);

    // ÇİFT SAYIM KORUMASI: bir serno aynı anda bir oransal (HAVUZ) listede ve
    // başka bir listede olamaz. Havuzda tesisin verişi havuza katılır ve tüketimi
    // ham girer; aynı serno ikinci bir listede de bulunursa verişi iki havuzda
    // sayılır ve tüketimi iki kez mahsup alır.
    // NOT: `uq_gma_user_serno` canlı DB'de KALDIRILMIŞ (repo migration'ında hâlâ
    // duruyor — drift). Bu yüzden koruma UI katmanında; kalıcı çözüm için
    // validate_ges_mahsup_assignment trigger'ına aynı kural eklenmeli.
    const otherPlantIds = new Set(
      assignments.filter((a) => a.subscription_serno === serno).map((a) => a.ges_plant_id)
    );
    otherPlantIds.delete(selectedPlantId);
    if (otherPlantIds.size > 0) {
      const conflictPool = [...otherPlantIds].some((pid) =>
        isPoolMode(coerceTahsisModu(plants.find((p) => p.id === pid)?.tahsis_modu))
      );
      if (conflictPool || isPoolMode(selectedPlantMode)) {
        const names = [...otherPlantIds]
          .map((pid) => {
            const p = plants.find((x) => x.id === pid);
            return p ? plantLabel(p) : pid.slice(0, 8);
          })
          .join(", ");
        setErr(
          `Tesis ${serno} zaten şu GES listesinde: ${names}. Oransal (havuz) modda bir ` +
            `tesis yalnızca TEK listede olabilir — aksi halde verişi iki havuzda, tüketimi ` +
            `iki kez mahsupta sayılır. Önce diğer listeden çıkarın.`
        );
        return;
      }
    }

    setBusy(true);
    setErr(null);
    try {
      const maxPriority = plantAssignments.reduce((m, a) => Math.max(m, a.priority), 0);
      const { error } = await supabase.from("ges_mahsup_assignments").insert({
        ges_plant_id: selectedPlantId,
        user_id: selectedUserId,
        subscription_serno: serno,
        priority: maxPriority + 1,
      });
      if (error) throw error;
      clearGesAllocationCache();
      setCandidateSerno("");
      showToast("Tesis atandı.");
      await loadUserData(selectedUserId);
    } catch (e) {
      setErr(errMsg(e, "Atama eklenemedi"));
    } finally {
      setBusy(false);
    }
  }

  // Dağıtım modu — ges_plants.tahsis_modu doğrudan UPDATE edilir (RLS
  // ges_plants_admin_all zaten admin'e FOR ALL izni veriyor; RPC gerekmez).
  // Mod cache anahtarına girdiği için clearGesAllocationCache() şart değil, ama
  // diğer mutasyonlarla desen bütünlüğü ve aynı sekmedeki eski hesapları düşürmek
  // için çağrılıyor.
  async function saveTahsisModu(mode: TahsisModu) {
    if (!selectedPlantId) return;
    setBusy(true);
    setErr(null);
    try {
      const { error } = await supabase
        .from("ges_plants")
        .update({ tahsis_modu: mode })
        .eq("id", selectedPlantId);
      if (error) throw error;
      clearGesAllocationCache();
      showToast(`Dağıtım yöntemi: ${TAHSIS_MODU_LABEL[mode]}`);
      await loadUserData(selectedUserId);
    } catch (e) {
      setErr(errMsg(e, "Dağıtım yöntemi kaydedilemedi"));
      await loadUserData(selectedUserId);
    } finally {
      setBusy(false);
    }
  }

  async function saveOrder(orderedIds: string[]) {
    if (!selectedPlantId) return;
    setBusy(true);
    setErr(null);
    try {
      const { error } = await supabase.rpc("set_ges_mahsup_priorities", {
        p_ges_plant_id: selectedPlantId,
        p_ordered_ids: orderedIds,
      });
      if (error) throw error;
      clearGesAllocationCache();
      await loadUserData(selectedUserId);
    } catch (e) {
      setErr(errMsg(e, "Sıralama kaydedilemedi"));
      await loadUserData(selectedUserId);
    } finally {
      setBusy(false);
    }
  }

  async function move(idx: number, dir: -1 | 1) {
    const target = idx + dir;
    if (target < 0 || target >= plantAssignments.length) return;
    const ids = plantAssignments.map((a) => a.id);
    [ids[idx], ids[target]] = [ids[target], ids[idx]];
    await saveOrder(ids);
    showToast("Sıralama kaydedildi.");
  }

  async function removeAssignment(a: AssignmentRow) {
    if (!window.confirm(`${facilityLabel(facilityMap.get(a.subscription_serno), a.subscription_serno)} atamasını silmek istiyor musunuz?`)) {
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      // Silme + kalanların 1..N renumber'ı tek transaction'da (atomik RPC)
      const { error } = await supabase.rpc("remove_ges_mahsup_assignment", {
        p_id: a.id,
      });
      if (error) throw error;
      clearGesAllocationCache();
      showToast("Atama silindi.");
      await loadUserData(selectedUserId);
    } catch (e) {
      setErr(errMsg(e, "Atama silinemedi"));
      await loadUserData(selectedUserId);
    } finally {
      setBusy(false);
    }
  }

  // Stale snapshot temizliği: atanan + kaynak sernoların önceki faturalama ayı
  // snapshot'larını siler; bir sonraki hesap (InvoiceDetail/Dashboard) taze yazar.
  async function resetSnapshots() {
    if (!selectedUserId || !selectedPlant) return;
    const sernos = new Set<number>(plantAssignments.map((a) => a.subscription_serno));
    if (selectedPlantSourceSerno != null) sernos.add(selectedPlantSourceSerno);
    if (sernos.size === 0) return;

    const prev = dayjsTR().subtract(1, "month");
    const label = prev.format("MMMM YYYY");
    if (
      !window.confirm(
        `${label} dönemi için ${sernos.size} tesisin fatura snapshot'ları silinecek; ` +
          `bir sonraki görüntülemede Talep Birleştirme'ye göre yeniden hesaplanır. Devam edilsin mi?`
      )
    ) {
      return;
    }

    setBusy(true);
    setErr(null);
    try {
      const { error } = await supabase
        .from("invoice_snapshots")
        .delete()
        .eq("user_id", selectedUserId)
        .eq("period_year", prev.year())
        .eq("period_month", prev.month() + 1)
        .eq("invoice_type", "billed")
        .in("subscription_serno", Array.from(sernos));
      if (error) throw error;
      clearGesAllocationCache();
      showToast(`${label} snapshot'ları sıfırlandı.`);
    } catch (e) {
      setErr(errMsg(e, "Snapshot'lar silinemedi"));
    } finally {
      setBusy(false);
    }
  }

  const availableFacilities = facilities.filter(
    // Kaynak tesis ARTIK seçilebilir (kendi tüketimini de öncelik sırasında
    // mahsup edebilsin). Yalnız SEÇİLİ GES'e zaten atanmış tesisler hariç tutulur.
    (f) => !assignedToSelectedPlant.has(f.subscription_serno)
  );

  return (
    <div className="p-6">
      <div className="mb-4 flex items-center gap-2">
        <GitMerge size={22} className="text-neutral-700" />
        <div>
          <h1 className="text-xl font-semibold">Talep Birleştirme</h1>
          <p className="text-sm text-neutral-500">
            Bir GES'in üretimi, öncelik sırasına göre birden fazla tesisin faturasından
            saatlik mahsup edilir. Atama yapılmayan GES'lerde davranış değişmez.
          </p>
        </div>
      </div>

      {err && (
        <div className="mb-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {err}
        </div>
      )}

      {/* Kullanıcı seçici */}
      <div className="mb-4 rounded-2xl border bg-white p-5">
        <label className="mb-1 block text-sm font-medium text-neutral-700">Kullanıcı</label>
        <select
          className="w-full max-w-md rounded-lg border px-3 py-2 text-sm"
          value={selectedUserId}
          onChange={(e) => setSelectedUserId(e.target.value)}
        >
          <option value="">Kullanıcı seçin…</option>
          {users.map((u) => (
            <option key={u.user_id} value={u.user_id}>
              {u.aril_user ?? u.user_id}
            </option>
          ))}
        </select>
      </div>

      {loading && <p className="text-sm text-neutral-500">Yükleniyor…</p>}

      {!loading && selectedUserId && (
        <div className="grid gap-4 lg:grid-cols-2">
          {/* GES listesi */}
          <div className="rounded-2xl border bg-white overflow-hidden">
            <div className="border-b p-4">
              <h2 className="text-lg font-medium">GES Tesisleri</h2>
            </div>
            {plants.length === 0 ? (
              <p className="p-4 text-sm text-neutral-500">
                Bu kullanıcıya tanımlı GES tesisi yok.
              </p>
            ) : (
              <ul>
                {plants.map((p) => {
                  const count = assignmentsByPlant.get(p.id)?.length ?? 0;
                  const active = p.id === selectedPlantId;
                  return (
                    <li key={p.id} className="border-b last:border-b-0">
                      <button
                        onClick={() => {
                          setSelectedPlantId(p.id);
                          setCandidateSerno("");
                        }}
                        className={
                          "flex w-full items-center justify-between gap-3 px-4 py-3 text-left text-sm hover:bg-neutral-50 " +
                          (active ? "bg-neutral-100" : "")
                        }
                      >
                        <span className="min-w-0">
                          <span className="block truncate font-medium text-neutral-900">
                            {plantLabel(p)}
                          </span>
                          <span className="block text-xs text-neutral-500">
                            {p.source_serno != null
                              ? `Üretim sayacı: ${p.source_serno}`
                              : p.linked_serno != null
                                ? `Bağlı tesis: ${p.linked_serno}`
                                : "Sayaç bağlantısı yok"}
                            {p.is_active === false ? " • pasif" : ""}
                          </span>
                        </span>
                        {count > 0 && (
                          <span className="shrink-0 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-800 ring-1 ring-emerald-200">
                            Talep Birleştirme aktif ({count} tesis •{" "}
                            {TAHSIS_MODU_LABEL[coerceTahsisModu(p.tahsis_modu)]})
                          </span>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {/* Atama yönetimi */}
          <div className="rounded-2xl border bg-white overflow-hidden">
            <div className="flex items-center justify-between gap-2 border-b p-4">
              <h2 className="text-lg font-medium">
                {selectedPlant ? `Atamalar — ${plantLabel(selectedPlant)}` : "Atamalar"}
              </h2>
              {selectedPlant && plantAssignments.length > 0 && (
                <button
                  onClick={resetSnapshots}
                  disabled={busy}
                  className="flex items-center gap-1.5 rounded-lg border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-800 hover:bg-amber-100 disabled:opacity-50"
                  title="Atanan + kaynak tesislerin önceki ay fatura snapshot'larını siler; sonraki görüntülemede yeniden hesaplanır."
                >
                  <RotateCcw size={14} />
                  Önceki ay snapshot'larını sıfırla
                </button>
              )}
            </div>

            {!selectedPlant ? (
              <p className="p-4 text-sm text-neutral-500">
                Atamaları görmek için soldan bir GES seçin.
              </p>
            ) : (
              <div className="p-4">
                {selectedPlantSourceSerno == null && (
                  <div className="mb-3 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-2.5 text-sm text-red-700">
                    <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                    <div>
                      Bu GES'in üretim sayacı bağlantısı yok (source_serno / linked_serno boş).
                      Atama yapılsa bile mahsup edilecek veriş serisi bulunamaz — önce GES
                      Tesisler sayfasından sayaç bağlayın.
                    </div>
                  </div>
                )}

                {/* Dağıtım yöntemi — havuzun tesislere NASIL bölüneceğini seçer.
                    Kapasite/ownGn/artan kuralları her modda aynıdır. */}
                <div className="mb-3 rounded-xl border border-neutral-200 bg-neutral-50 p-3">
                  <label className="mb-1 block text-sm font-medium text-neutral-700">
                    Dağıtım yöntemi
                  </label>
                  <select
                    className="w-full rounded-lg border px-3 py-2 text-sm"
                    value={selectedPlantMode}
                    onChange={(e) => saveTahsisModu(e.target.value as TahsisModu)}
                    disabled={busy}
                  >
                    {TAHSIS_MODU_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                  <div className="mt-2 rounded-lg border border-sky-200 bg-sky-50 p-2.5 text-sm text-sky-800">
                    Faturası kesilmiş aylar değişmez; geçmişe yansıtmak için yukarıdaki
                    “Önceki ay snapshot'larını sıfırla” ile önceki ay snapshot'larını sıfırla.
                  </div>
                </div>

                {/* ORANSAL (HAVUZ) modu — havuz mantığını anlatır. Sıralı moda özgü
                    "kaynak tesis listede / önce kendi tüketiminden" metinleri bu modda
                    GÖSTERİLMEZ (aşağıdaki bloklar selectedPlantIsPool ile kapalı). */}
                {plantAssignments.length > 0 && selectedPlantIsPool && (
                  <div className="mb-3 rounded-lg border border-sky-200 bg-sky-50 p-2.5 text-sm text-sky-800">
                    <strong>Havuz:</strong> listedeki sayaçların verişleri saat saat
                    toplanır, tüketimler ham girer; artan üretim 1. sıradaki tesise satış
                    olarak yazılır.
                    {selectedPlantSourceSerno != null && !sourceInList && (
                      <>
                        {" "}
                        GES kaydının kaynak sayacı ({selectedPlantSourceSerno}) listede
                        değilse havuza katılmaz.
                      </>
                    )}
                  </div>
                )}

                {plantAssignments.length > 0 && selectedPlantIsPool && (
                  <div className="mb-3 flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-2.5 text-xs text-amber-800">
                    <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                    <div>
                      Bu modda sıra mahsubu etkilemez; yalnız 1. sıradaki tesis artan
                      üretimin satışını alır.
                    </div>
                  </div>
                )}

                {plantAssignments.length > 0 &&
                  !selectedPlantIsPool &&
                  selectedPlant.linked_serno != null && (
                  <div className="mb-3 rounded-lg border border-sky-200 bg-sky-50 p-2.5 text-sm text-sky-800">
                    Talep Birleştirme aktif: bu GES için linked_serno ({selectedPlant.linked_serno})
                    tekil mahsup davranışı devre dışı — üretim aşağıdaki öncelik sırasına göre
                    mahsup edilir.
                    {sourceInList && (
                      <>
                        {" "}
                        Kaynak tesis ({selectedPlantSourceSerno}) listede: üretim önce kendi
                        tüketiminden, artan sonraki önceliklere mahsup edilir.
                      </>
                    )}
                  </div>
                )}
                {plantAssignments.length > 0 &&
                  !selectedPlantIsPool &&
                  selectedPlant.linked_serno == null &&
                  sourceInList && (
                    <div className="mb-3 rounded-lg border border-sky-200 bg-sky-50 p-2.5 text-sm text-sky-800">
                      Kaynak tesis ({selectedPlantSourceSerno}) listede: üretim önce kendi
                      tüketiminden, artan sonraki önceliklere mahsup edilir.
                    </div>
                  )}

                {/* Atama listesi */}
                {plantAssignments.length === 0 ? (
                  <p className="mb-4 text-sm text-neutral-500">
                    Henüz atama yok. Aşağıdan tesis ekleyin — ilk eklenen tesis öncelik 1 olur.
                  </p>
                ) : (
                  <ul className="mb-4 space-y-2">
                    {plantAssignments.map((a, idx) => {
                      const f = facilityMap.get(a.subscription_serno);
                      const isSourceRow =
                        a.subscription_serno === selectedPlantSourceSerno;
                      return (
                        <li
                          key={a.id}
                          className="flex items-center gap-3 rounded-xl border px-3 py-2"
                        >
                          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-neutral-900 text-xs font-semibold text-white">
                            {a.priority}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="flex items-center gap-1.5">
                              <span className="truncate text-sm font-medium text-neutral-900">
                                {facilityLabel(f, a.subscription_serno)}
                              </span>
                              {isSourceRow && (
                                <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-sky-50 px-2 py-0.5 text-[11px] font-medium text-sky-700 ring-1 ring-sky-200">
                                  <Sun size={11} />
                                  Kaynak tesis
                                </span>
                              )}
                            </span>
                            {isSourceRow && (
                              <span className="block text-xs text-sky-700">
                                Üretim bu sayaçtan geliyor; kendi tüketimi bu öncelikle mahsup edilir.
                              </span>
                            )}
                            {a.priority === 1 && (
                              <span className="block text-xs text-amber-700">
                                Fazla üretim satışı bu tesise yazılır
                              </span>
                            )}
                          </span>
                          <div className="flex shrink-0 items-center gap-1">
                            <button
                              onClick={() => move(idx, -1)}
                              disabled={busy || idx === 0}
                              className="rounded-lg border p-1.5 text-neutral-600 hover:bg-neutral-50 disabled:opacity-30"
                              title="Yukarı taşı"
                            >
                              <ChevronUp size={14} />
                            </button>
                            <button
                              onClick={() => move(idx, 1)}
                              disabled={busy || idx === plantAssignments.length - 1}
                              className="rounded-lg border p-1.5 text-neutral-600 hover:bg-neutral-50 disabled:opacity-30"
                              title="Aşağı taşı"
                            >
                              <ChevronDown size={14} />
                            </button>
                            <button
                              onClick={() => removeAssignment(a)}
                              disabled={busy}
                              className="rounded-lg border border-red-200 p-1.5 text-red-600 hover:bg-red-50 disabled:opacity-30"
                              title="Atamayı sil"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}

                {/* Yeni atama */}
                <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-3">
                  <label className="mb-1 block text-sm font-medium text-neutral-700">
                    Tesis Ata
                  </label>
                  <div className="flex items-center gap-2">
                    <select
                      className="w-full rounded-lg border px-3 py-2 text-sm"
                      value={candidateSerno}
                      onChange={(e) => setCandidateSerno(e.target.value)}
                      disabled={busy}
                    >
                      <option value="">Tesis seçin…</option>
                      {availableFacilities.map((f) => (
                        <option key={f.subscription_serno} value={f.subscription_serno}>
                          {facilityLabel(f, f.subscription_serno)}
                          {f.subscription_serno === selectedPlantSourceSerno
                            ? " (kaynak tesis)"
                            : ""}
                          {assignedToOtherPlants.has(f.subscription_serno)
                            ? " (başka GES'e de atanmış)"
                            : ""}
                        </option>
                      ))}
                    </select>
                    <button
                      onClick={addAssignment}
                      disabled={busy || !candidateSerno}
                      className="flex shrink-0 items-center gap-1.5 rounded-xl bg-black px-4 py-2 text-sm text-white disabled:opacity-40"
                    >
                      <Plus size={14} />
                      Ekle
                    </button>
                  </div>

                  {/* Yumuşak uyarılar — engelleme yok, iş kuralı adminde */}
                  {candidateOwnGesWarning && (
                    <div className="mt-2 flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-2.5 text-xs text-amber-800">
                      <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                      <div>
                        Bu tesisin kendi GES üretimi/verişi var — talep birleştirme genellikle
                        GES'siz tesislere yapılır. Atama yine de yapılabilir.
                      </div>
                    </div>
                  )}
                  {candidateFacility?.lisansli_satis && (
                    <div className="mt-2 flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-2.5 text-xs text-amber-800">
                      <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                      <div>
                        Lisanslı Satış tesisi: fatura hesabında saatlik mahsup devre dışıdır,
                        tahsis edilen veriş satış olarak işlenir — yapılandırmayı kontrol edin.
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-4 right-4 z-50 rounded-lg bg-neutral-900 px-4 py-3 text-sm text-white shadow-lg">
          {toast}
        </div>
      )}
    </div>
  );
}
