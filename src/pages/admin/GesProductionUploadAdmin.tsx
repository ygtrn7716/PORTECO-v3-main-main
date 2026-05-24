import { useEffect, useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import { supabase } from "@/lib/supabase";
import {
  Upload,
  FileSpreadsheet,
  AlertTriangle,
  CheckCircle2,
  Info,
  Loader2,
  X,
  Plus,
  Building2,
} from "lucide-react";

/* ------------------------------------------------------------------ */
/* Types                                                              */
/* ------------------------------------------------------------------ */

type UserOpt = { user_id: string; email: string | null };
type PlantOpt = {
  id: string;
  plant_name: string | null;
  nickname: string | null;
  linked_serno: number | null;
};
type SubscriptionOpt = {
  subscription_serno: number;
  title: string | null;
};

type ParsedRow = {
  ts: string;            // ISO timestamptz
  energy_kwh: number;    // >= 0
  rawDate: string;       // for display
  rawValue: string;      // CSV'deki ham değer (şüpheli görüntüleme için)
};

// Şüpheli satırlar için karar tipi
type SuspectAction = "divide100" | "asIs" | "skip" | "manual";
type SuspectRow = ParsedRow & {
  index: number;         // parsedRows içindeki konumu
  action: SuspectAction; // kullanıcının kararı (default: divide100)
  manualValue: string;   // action === "manual" ise kullanılır (string input)
};

type UploadStats = {
  totalRows: number;
  inserted: number;
  skippedExisting: number;
  invalidRows: number;
  suspectsHandled: number;
  affectedDays: number;
};

/* ------------------------------------------------------------------ */
/* Column name aliases                                                */
/* ------------------------------------------------------------------ */

const TS_ALIASES = [
  "ts",
  "tarih",
  "date",
  "datetime",
  "tarih_saat",
  "tarihsaat",
  "zaman",
];

// Ayrı saat sütunu için (örn. enerji_egilimi formatı: "Tarih" + "Saat" + "Üretim")
const HOUR_ALIASES = ["saat", "hour", "time", "saat_dilimi", "saat dilimi"];

const KWH_ALIASES = [
  "energy_kwh",
  "kwh",
  "enerji_kwh",
  "enerji",
  "uretilen_enerji",
  "uretim",
  "production",
  "production_kwh",
  // raporlardan gelen orijinal isimler:
  "semmak uretilen enerji (kwh)",
  "semmak üretilen enerji (kwh)",
  "uretilen enerji (kwh)",
  "üretilen enerji (kwh)",
  "uretilen enerji",
  "üretilen enerji",
  "uretim (kwh)",
  "üretim (kwh)",
];

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/\s+/g, " ")
    .trim();

function findHeader(headers: string[], aliases: string[]): string | null {
  const map = new Map(headers.map((h) => [norm(h), h]));
  for (const a of aliases) {
    const hit = map.get(norm(a));
    if (hit) return hit;
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* Date parser (ts -> ISO with +03:00)                                */
/* ------------------------------------------------------------------ */

function pad(n: number) {
  return n.toString().padStart(2, "0");
}

/** "2026-04-26T08:00:00+03:00" formatına çevirir (Europe/Istanbul). */
function toIstanbulIso(year: number, month: number, day: number, hour: number) {
  return `${year}-${pad(month)}-${pad(day)}T${pad(hour)}:00:00+03:00`;
}

/**
 * Çoklu format desteği:
 *  - Excel native datetime (number) -> XLSX.SSF.parse_date_code
 *  - "26.04.2026 08:00" / "26.04.2026 08:00:00"
 *  - "26/04/2026 08:00"
 *  - "2026-04-26 08:00" / "2026-04-26T08:00..."
 *  - Date objesi
 *
 * Saatleri saat başına yuvarlar (dakika/saniye sıfırlanır), Europe/Istanbul varsayar.
 */
function parseDateCell(raw: any): string | null {
  if (raw == null || raw === "") return null;

  // Excel'in native datetime'ı (number)
  if (typeof raw === "number" && Number.isFinite(raw)) {
    const d = (XLSX as any).SSF?.parse_date_code?.(raw);
    if (d && d.y) {
      return toIstanbulIso(d.y, d.m, d.d, d.H ?? 0);
    }
  }

  // Date objesi
  if (raw instanceof Date && !isNaN(raw.getTime())) {
    return toIstanbulIso(
      raw.getFullYear(),
      raw.getMonth() + 1,
      raw.getDate(),
      raw.getHours(),
    );
  }

  const s = String(raw).trim();
  if (!s) return null;

  // "DD.MM.YYYY HH:MM[:SS]" veya "DD/MM/YYYY HH:MM[:SS]"
  let m = s.match(
    /^(\d{1,2})[./-](\d{1,2})[./-](\d{4})[\sT]+(\d{1,2}):(\d{2})(?::(\d{2}))?/,
  );
  if (m) {
    const day = Number(m[1]);
    const month = Number(m[2]);
    const year = Number(m[3]);
    const hour = Number(m[4]);
    return toIstanbulIso(year, month, day, hour);
  }

  // "YYYY-MM-DD HH:MM[:SS]" veya "YYYY-MM-DDTHH:MM..."
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})[\sT]+(\d{1,2}):(\d{2})/);
  if (m) {
    const year = Number(m[1]);
    const month = Number(m[2]);
    const day = Number(m[3]);
    const hour = Number(m[4]);
    return toIstanbulIso(year, month, day, hour);
  }

  // ISO (zone'lu) — son çare olarak Date'e bırak
  const fallback = new Date(s);
  if (!isNaN(fallback.getTime())) {
    return toIstanbulIso(
      fallback.getFullYear(),
      fallback.getMonth() + 1,
      fallback.getDate(),
      fallback.getHours(),
    );
  }

  return null;
}

/**
 * Sayısal hücre parse:
 *  - Excel native number → direkt döner
 *  - "458" / "458.0" / "458.000" → 458 (US ondalık nokta)
 *  - "458,5" / "458,50" → 458.5 (TR ondalık virgül)
 *  - "1.234,56" → 1234.56 (TR binlik nokta + ondalık virgül; sadece virgül VARSA noktalar binlik sayılır)
 *  - "62.080.000" gibi NET TR binlik ama virgülsüz formatları KASIDEN reddeder.
 *    (Bunlar genelde CSV'deki bozuk hücreler — doğru giriş ya "62080000" ya da "62.080,00".)
 *  - Boş/null → 0
 *  - Geçersiz / çözülemeyen → null (üst katmanda warning + skip)
 */
/**
 * Saat ayrı bir sütundan geldiğinde (örn. "07:00" string'i veya 7 number'ı)
 * sadece saat bileşenini döner. Geçersizse null.
 */
function parseHourCell(raw: any): number | null {
  if (raw == null || raw === "") return null;
  if (typeof raw === "number" && Number.isFinite(raw)) {
    // Excel "time" cell'i 0-1 arası fraction olabilir (örn. 0.5 = 12:00)
    if (raw >= 0 && raw < 1) return Math.floor(raw * 24);
    if (raw >= 0 && raw <= 23) return Math.floor(raw);
    return null;
  }
  const s = String(raw).trim();
  // "07:00", "7:00", "07:00:00"
  const m = s.match(/^(\d{1,2})(?::(\d{2}))?(?::(\d{2}))?$/);
  if (m) {
    const h = Number(m[1]);
    if (h >= 0 && h <= 23) return h;
  }
  // Sadece sayı: "7", "07"
  const n = Number(s);
  if (Number.isFinite(n) && n >= 0 && n <= 23) return Math.floor(n);
  return null;
}

/**
 * Tarih hücresi (sadece tarih kısmı, saat yok) parse eder.
 * Saat ayrı sütundan gelmesi durumunda kullanılır.
 * Desteklenen: "2026-03-01", "01.03.2026", "01/03/2026", Excel native datetime.
 */
function parseDateOnlyCell(raw: any): { y: number; m: number; d: number } | null {
  if (raw == null || raw === "") return null;
  if (typeof raw === "number" && Number.isFinite(raw)) {
    const d = (XLSX as any).SSF?.parse_date_code?.(raw);
    if (d && d.y) return { y: d.y, m: d.m, d: d.d };
  }
  if (raw instanceof Date && !isNaN(raw.getTime())) {
    return {
      y: raw.getFullYear(),
      m: raw.getMonth() + 1,
      d: raw.getDate(),
    };
  }
  const s = String(raw).trim();
  if (!s) return null;
  // ISO: 2026-03-01
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return { y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) };
  // TR: 01.03.2026 veya 01/03/2026
  m = s.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})/);
  if (m) return { y: Number(m[3]), m: Number(m[2]), d: Number(m[1]) };
  return null;
}

/**
 * Basit CSV parser (RFC 4180 subset) — XLSX'in TR DD.MM tarihlerini
 * yanlış US MM/DD olarak yorumlama hatasını önlemek için kullanılır.
 * Dönüş: row x col matrix, tüm hücreler string olarak.
 */
function parseCsvText(text: string): string[][] {
  // BOM kaldır
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const out: string[][] = [];
  const lines = text.split(/\r?\n/);
  for (const line of lines) {
    if (line.length === 0) continue;
    const row: string[] = [];
    let cur = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (inQuotes) {
        if (c === '"') {
          if (line[i + 1] === '"') {
            cur += '"';
            i++;
          } else {
            inQuotes = false;
          }
        } else {
          cur += c;
        }
      } else {
        if (c === '"' && cur === "") {
          inQuotes = true;
        } else if (c === ",") {
          row.push(cur);
          cur = "";
        } else {
          cur += c;
        }
      }
    }
    row.push(cur);
    out.push(row);
  }
  return out;
}

function parseNumberCell(raw: any): number | null {
  if (raw == null || raw === "") return 0;
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;

  const s = String(raw).trim();
  if (!s) return 0;

  // Yaygın "boş hücre işaretleri" — 0 olarak yorumla
  if (s === "--" || s === "-" || s === "—" || s === "n/a" || s.toLowerCase() === "null") {
    return 0;
  }

  const hasComma = s.includes(",");
  const dotCount = (s.match(/\./g) ?? []).length;

  // 1) Sadece virgül var (TR ondalık) → noktalar binlik, virgül ondalık
  if (hasComma) {
    const cleaned = s.replace(/\./g, "").replace(",", ".");
    const v = Number(cleaned);
    return Number.isFinite(v) ? v : null;
  }

  // 2) Hiç virgül yok, en fazla 1 nokta var (US ondalık veya tamsayı)
  if (dotCount <= 1) {
    const v = Number(s);
    return Number.isFinite(v) ? v : null;
  }

  // 3) Virgülsüz ama 2+ nokta → TR binlik formatı (örn. "62.080.000" = 62080.000 = 62080)
  //    Algoritma: son grup ondalık, önceki gruplar binlik ayracı.
  //    Format gereklilikleri:
  //      - İlk grup 1-3 hane
  //      - Aradaki gruplar tam 3 hane
  //      - Son grup 1-3 hane (eğer 3 ise tipik ".000" ondalık)
  //    Bu kurallara uymuyorsa null döner (warning + skip).
  const parts = s.split(".");
  if (!parts.every((p) => /^\d+$/.test(p))) return null;
  if (parts[0].length < 1 || parts[0].length > 3) return null;
  for (let i = 1; i < parts.length - 1; i++) {
    if (parts[i].length !== 3) return null;
  }
  const lastPart = parts[parts.length - 1];
  if (lastPart.length < 1 || lastPart.length > 3) return null;
  // İlk N-1 grubu binlik birleştir, sonu ondalık olarak ekle
  const intPart = parts.slice(0, -1).join("");
  const v = Number(intPart + "." + lastPart);
  return Number.isFinite(v) ? v : null;
}

// Saatlik üretim için sanity threshold.
// 99.999 kWh/saat = 99.999.000 W ortalama güç = 99.999 kW = 99,999 MW...
// (Türkiye'nin TOPLAM saatlik üretimi ~50.000 kWh, bireysel tesis çok daha az.)
// Bu sınırı aşan değerler büyük olasılıkla format hatasıdır.
const MAX_HOURLY_KWH = 99_999;

/* ------------------------------------------------------------------ */
/* Component                                                          */
/* ------------------------------------------------------------------ */

export default function GesProductionUploadAdmin() {
  const [users, setUsers] = useState<UserOpt[]>([]);
  const [plants, setPlants] = useState<PlantOpt[]>([]);
  const [selectedUser, setSelectedUser] = useState<string>("");
  const [selectedPlant, setSelectedPlant] = useState<string>("");

  const [fileName, setFileName] = useState<string>("");
  const [isDragging, setIsDragging] = useState(false);
  const [parsedRows, setParsedRows] = useState<ParsedRow[]>([]);
  const [suspectRows, setSuspectRows] = useState<SuspectRow[]>([]);
  const [parseWarnings, setParseWarnings] = useState<string[]>([]);
  const [parseError, setParseError] = useState<string | null>(null);
  const [parsing, setParsing] = useState(false);

  const [uploading, setUploading] = useState(false);
  const [uploadStats, setUploadStats] = useState<UploadStats | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  // Manual plant creation
  const [showCreatePlant, setShowCreatePlant] = useState(false);
  const [creatingPlant, setCreatingPlant] = useState(false);
  const [createPlantError, setCreatePlantError] = useState<string | null>(null);
  const [subscriptions, setSubscriptions] = useState<SubscriptionOpt[]>([]);
  const [selectedSubscription, setSelectedSubscription] = useState<string>("");
  const [newPlantPeak, setNewPlantPeak] = useState("");

  // Plant taşıma (mevcut tesisi başka OSOS sernosuna bağlama)
  const [showMovePlant, setShowMovePlant] = useState(false);
  const [movingPlant, setMovingPlant] = useState(false);
  const [movePlantError, setMovePlantError] = useState<string | null>(null);
  const [movePlantSuccess, setMovePlantSuccess] = useState<string | null>(null);
  const [moveTargetSubscription, setMoveTargetSubscription] = useState<string>("");

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  /* ---------------- Users (sistemdeki TÜM kayıtlı kullanıcılar) ----- */
  // API entegrasyonu olmayan müşterileri de görebilmek için sadece
  // ges_plants olanları değil, tüm kullanıcıları (user_integrations +
  // ges_plants + user_emails union'ı) listeliyoruz.
  useEffect(() => {
    let mounted = true;
    (async () => {
      const labelMap = new Map<string, string | null>();

      // 1) user_integrations — Aril hesabı tanımlanmış kullanıcılar (genelde TÜM müşteriler buradadır)
      const { data: integ, error: integErr } = await supabase
        .from("user_integrations")
        .select("user_id, aril_user")
        .limit(5000);
      if (integErr) console.error("[user_integrations]", integErr.message);
      (integ ?? []).forEach((r: any) => {
        labelMap.set(r.user_id, r.aril_user ?? null);
      });

      // 2) ges_plants — manuel olarak tesisi açılmış olanlar (user_integrations'ta olmayabilir)
      const { data: plantsData, error: plantsErr } = await supabase
        .from("ges_plants")
        .select("user_id")
        .limit(5000);
      if (plantsErr) console.error("[ges_plants users]", plantsErr.message);
      (plantsData ?? []).forEach((r: any) => {
        if (r.user_id && !labelMap.has(r.user_id)) labelMap.set(r.user_id, null);
      });

      // 3) user_emails — yedek e-posta kaynağı (label boş olanlar için)
      const ids = Array.from(labelMap.keys());
      const missing = ids.filter((id) => !labelMap.get(id));
      if (missing.length > 0) {
        const { data: ue } = await supabase
          .from("user_emails")
          .select("user_id, email")
          .in("user_id", missing)
          .limit(5000);
        (ue ?? []).forEach((r: any) => {
          if (!labelMap.get(r.user_id)) labelMap.set(r.user_id, r.email ?? null);
        });
      }

      const list: UserOpt[] = Array.from(labelMap.entries())
        .map(([user_id, email]) => ({ user_id, email }))
        .sort((a, b) =>
          (a.email ?? a.user_id).localeCompare(b.email ?? b.user_id, "tr"),
        );

      if (mounted) setUsers(list);
    })();
    return () => {
      mounted = false;
    };
  }, []);

  /* ---------------- Plants (seçili kullanıcının tesisleri) ---------- */
  useEffect(() => {
    setSelectedPlant("");
    setPlants([]);
    setShowMovePlant(false);
    setMoveTargetSubscription("");
    setMovePlantError(null);
    setMovePlantSuccess(null);
    if (!selectedUser) return;

    let mounted = true;
    (async () => {
      const { data, error } = await supabase
        .from("ges_plants")
        .select("id, plant_name, nickname, linked_serno")
        .eq("user_id", selectedUser)
        .order("created_at", { ascending: false });

      if (error) {
        console.error("[ges_plants by user]", error.message);
        return;
      }
      if (!mounted) return;
      const list = (data ?? []) as PlantOpt[];
      setPlants(list);
      if (list.length === 1) {
        setSelectedPlant(list[0].id);
        setShowCreatePlant(false);
      } else if (list.length === 0) {
        // Plant yoksa form otomatik açılsın
        setShowCreatePlant(true);
      } else {
        setShowCreatePlant(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [selectedUser]);

  /* ---------------- Subscriptions (kullanıcının abonelikleri) ------- */
  useEffect(() => {
    setSelectedSubscription("");
    setSubscriptions([]);
    if (!selectedUser) return;

    let mounted = true;
    (async () => {
      const { data, error } = await supabase
        .from("owner_subscriptions")
        .select("subscription_serno, title")
        .eq("user_id", selectedUser)
        .order("subscription_serno", { ascending: true });

      if (error) {
        console.error("[owner_subscriptions]", error.message);
        return;
      }
      if (!mounted) return;
      setSubscriptions((data ?? []) as SubscriptionOpt[]);
    })();
    return () => {
      mounted = false;
    };
  }, [selectedUser]);

  /* ---------------- Manuel tesis oluştur --------------------------- */
  async function handleCreateManualPlant() {
    if (!selectedUser) {
      setCreatePlantError("Önce kullanıcı seçin.");
      return;
    }
    if (!selectedSubscription) {
      setCreatePlantError(
        "Eşleştirilecek aboneliği seçin (bu kullanıcının OSOS aboneliği).",
      );
      return;
    }
    const sernoNum = Number(selectedSubscription);
    const sub = subscriptions.find((s) => s.subscription_serno === sernoNum);
    if (!sub) {
      setCreatePlantError("Seçili abonelik geçersiz.");
      return;
    }

    // Aynı linked_serno için zaten ges_plants kaydı var mı? (idempotent koruma)
    const { data: dup } = await supabase
      .from("ges_plants")
      .select("id")
      .eq("user_id", selectedUser)
      .eq("linked_serno", sernoNum)
      .maybeSingle();
    if (dup?.id) {
      setCreatePlantError(
        "Bu abonelik için zaten bir GES tesisi bağlanmış. Tesis dropdown'unda görünmeli.",
      );
      return;
    }

    setCreatingPlant(true);
    setCreatePlantError(null);

    try {
      // 1) Manual provider'ı bul
      const { data: prov, error: provErr } = await supabase
        .from("ges_providers")
        .select("id")
        .eq("name", "manual")
        .maybeSingle();
      if (provErr) throw new Error("Provider lookup: " + provErr.message);
      if (!prov?.id) {
        throw new Error(
          "'manual' provider tanımsız — Supabase'de ges_providers tablosuna 'manual' kaydı ekleyin.",
        );
      }
      const providerId = prov.id as number;

      // 2) Bu kullanıcı için manual provider'a bağlı bir credential var mı?
      const { data: existCred, error: credLookupErr } = await supabase
        .from("ges_credentials")
        .select("id")
        .eq("user_id", selectedUser)
        .eq("provider_id", providerId)
        .maybeSingle();
      if (credLookupErr)
        throw new Error("Credential lookup: " + credLookupErr.message);

      let credentialId = existCred?.id as string | undefined;

      // 3) Yoksa placeholder credential oluştur
      if (!credentialId) {
        const { data: newCred, error: credInsErr } = await supabase
          .from("ges_credentials")
          .insert({
            user_id: selectedUser,
            provider_id: providerId,
            username: `manual_${selectedUser.slice(0, 8)}`,
            password_enc: "", // Manuel yükleme — şifre yok
            is_active: true,
            sync_status: "manual",
          })
          .select("id")
          .single();
        if (credInsErr) throw new Error("Credential insert: " + credInsErr.message);
        credentialId = newCred?.id as string;
      }

      // 4) Plant oluştur — abonelikteki başlık + serno otomatik kullanılır
      const peakNum = newPlantPeak.trim() ? Number(newPlantPeak.trim()) : null;
      const subTitle = (sub.title ?? "").trim() || `Tesis ${sernoNum}`;
      const { data: newPlant, error: plantErr } = await supabase
        .from("ges_plants")
        .insert({
          user_id: selectedUser,
          credential_id: credentialId,
          provider_plant_id: `MANUAL_${sernoNum}`,
          plant_name: subTitle,
          nickname: subTitle,
          peak_power_kw: peakNum,
          linked_serno: sernoNum,
          is_active: true,
        })
        .select("id, plant_name, nickname, linked_serno")
        .single();
      if (plantErr) throw new Error("Plant insert: " + plantErr.message);

      // 5) UI'ı güncelle
      const created: PlantOpt = {
        id: newPlant!.id as string,
        plant_name: newPlant!.plant_name as string | null,
        nickname: newPlant!.nickname as string | null,
        linked_serno: newPlant!.linked_serno as number | null,
      };
      setPlants((prev) => [created, ...prev]);
      setSelectedPlant(created.id);
      setShowCreatePlant(false);
      setSelectedSubscription("");
      setNewPlantPeak("");
    } catch (err: any) {
      console.error(err);
      setCreatePlantError(err?.message ?? "Bilinmeyen hata");
    } finally {
      setCreatingPlant(false);
    }
  }

  /* ---------------- Tesisi başka sernoya taşı ---------------------- */
  // Mevcut bir GES tesisini (ve dolayısıyla ona bağlı tüm üretim verisini)
  // başka bir OSOS aboneliğinin sernosuna bağlar. Üretim satırları
  // ges_plant_id (tesis UUID'si) ile saklandığı için veri otomatik takip eder;
  // sadece ges_plants kaydındaki linked_serno / isim / provider_plant_id güncellenir.
  async function handleMovePlant() {
    setMovePlantSuccess(null);
    if (!selectedUser) {
      setMovePlantError("Önce kullanıcı seçin.");
      return;
    }
    if (!selectedPlant) {
      setMovePlantError("Taşınacak GES tesisini seçin.");
      return;
    }
    if (!moveTargetSubscription) {
      setMovePlantError("Hedef aboneliği (yeni serno) seçin.");
      return;
    }

    const targetSerno = Number(moveTargetSubscription);
    const targetSub = subscriptions.find(
      (s) => s.subscription_serno === targetSerno,
    );
    if (!targetSub) {
      setMovePlantError("Seçili hedef abonelik geçersiz.");
      return;
    }

    setMovingPlant(true);
    setMovePlantError(null);

    try {
      // 1) Taşınacak tesisin mevcut bilgilerini al (credential_id dahil)
      const { data: plantRow, error: plantErr } = await supabase
        .from("ges_plants")
        .select("id, user_id, credential_id, linked_serno, plant_name")
        .eq("id", selectedPlant)
        .single();
      if (plantErr) throw new Error("Tesis okunamadı: " + plantErr.message);
      if (!plantRow) throw new Error("Taşınacak tesis bulunamadı.");
      if (plantRow.user_id !== selectedUser) {
        throw new Error("Tesis bu kullanıcıya ait değil.");
      }

      if (Number(plantRow.linked_serno) === targetSerno) {
        throw new Error("Tesis zaten bu sernoya bağlı — taşımaya gerek yok.");
      }

      // 2) Çakışma kontrolü — hedef sernoda zaten AKTİF başka bir tesis var mı?
      const { data: conflict, error: conflictErr } = await supabase
        .from("ges_plants")
        .select("id, plant_name, is_active")
        .eq("user_id", selectedUser)
        .eq("linked_serno", targetSerno)
        .eq("is_active", true)
        .neq("id", selectedPlant)
        .maybeSingle();
      if (conflictErr)
        throw new Error("Çakışma kontrolü: " + conflictErr.message);
      if (conflict?.id) {
        throw new Error(
          `Hedef sernoda (${targetSerno}) zaten aktif bir GES tesisi var: "${
            conflict.plant_name ?? conflict.id.slice(0, 8)
          }". Taşıma iptal edildi. Önce o tesisi pasifleştirin veya farklı bir hedef seçin.`,
        );
      }

      // 3) provider_plant_id'yi hedefe göre belirle —
      //    UNIQUE(credential_id, provider_plant_id) çakışmasını önle.
      let newProviderPlantId = `MANUAL_${targetSerno}`;
      const { data: ppidClash, error: ppidErr } = await supabase
        .from("ges_plants")
        .select("id")
        .eq("credential_id", plantRow.credential_id)
        .eq("provider_plant_id", newProviderPlantId)
        .neq("id", selectedPlant)
        .maybeSingle();
      if (ppidErr)
        throw new Error("provider_plant_id kontrolü: " + ppidErr.message);
      if (ppidClash?.id) {
        // Aynı credential altında bu provider_plant_id kullanılıyor —
        // benzersiz kalması için tesis UUID'sinin ön ekini ekle.
        newProviderPlantId = `MANUAL_${targetSerno}_${selectedPlant.slice(0, 8)}`;
      }

      // 4) İsim: hedef aboneliğin başlığı kullanılır
      const newTitle = (targetSub.title ?? "").trim() || `Tesis ${targetSerno}`;

      // 5) Güncelle — üretim verisi (hourly/daily/snapshot) ges_plant_id ile
      //    bağlı olduğu için otomatik bu sernoya taşınmış olur.
      const { data: updated, error: updErr } = await supabase
        .from("ges_plants")
        .update({
          linked_serno: targetSerno,
          plant_name: newTitle,
          nickname: newTitle,
          provider_plant_id: newProviderPlantId,
        })
        .eq("id", selectedPlant)
        .select("id, plant_name, nickname, linked_serno")
        .single();
      if (updErr) throw new Error("Güncelleme: " + updErr.message);

      // 6) UI state güncelle
      setPlants((prev) =>
        prev.map((p) =>
          p.id === selectedPlant
            ? {
                id: p.id,
                plant_name: (updated?.plant_name as string | null) ?? newTitle,
                nickname: (updated?.nickname as string | null) ?? newTitle,
                linked_serno:
                  (updated?.linked_serno as number | null) ?? targetSerno,
              }
            : p,
        ),
      );
      setMovePlantSuccess(
        `Tesis "${newTitle}" → serno ${targetSerno} olarak taşındı. Tüm üretim verisi bu sernoya bağlandı.`,
      );
      setShowMovePlant(false);
      setMoveTargetSubscription("");
    } catch (err: any) {
      console.error(err);
      setMovePlantError(err?.message ?? "Bilinmeyen hata");
    } finally {
      setMovingPlant(false);
    }
  }

  /* ---------------- File parsing ----------------------------------- */
  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    await processFile(f);
  }

  function handleDragOver(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    e.stopPropagation();
    if (!isDragging) setIsDragging(true);
  }

  function handleDragLeave(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }

  async function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    const f = e.dataTransfer?.files?.[0];
    if (!f) return;
    // Sadece kabul edilen uzantılar
    if (!/\.(csv|xlsx|xls)$/i.test(f.name)) {
      setParseError(
        `Desteklenmeyen dosya tipi: ${f.name}. Sadece .csv, .xlsx, .xls dosyaları kabul edilir.`,
      );
      setFileName(f.name);
      return;
    }
    await processFile(f);
  }

  async function processFile(f: File) {
    setFileName(f.name);
    setParseError(null);
    setParseWarnings([]);
    setParsedRows([]);
    setSuspectRows([]);
    setUploadStats(null);
    setUploadError(null);
    setParsing(true);

    try {
      const isCsv = /\.csv$/i.test(f.name);
      let aoa: any[][];

      if (isCsv) {
        // CSV: XLSX kütüphanesi TR DD.MM tarihlerini US MM/DD olarak yorumluyor
        // (özellikle gün ≤ 12 olan satırlarda). Bu yüzden CSV'yi manuel
        // parse ediyoruz, tüm hücreler string olarak gelir, parseDateCell
        // DD.MM.YYYY regex'i ile güvenli yorumlar.
        const text = await f.text();
        aoa = parseCsvText(text);
      } else {
        // Excel (.xlsx/.xls): native datetime tipleri net belirgin, XLSX güvenli
        const buf = await f.arrayBuffer();
        const wb = XLSX.read(buf, { type: "array", cellDates: true });
        const sheetName = wb.SheetNames[0];
        if (!sheetName) {
          setParseError("Dosyada sayfa bulunamadı.");
          return;
        }
        const ws = wb.Sheets[sheetName];
        aoa = XLSX.utils.sheet_to_json(ws, {
          header: 1,
          raw: true,
          defval: "",
        });
      }

      if (aoa.length < 2) {
        setParseError("Dosyada veri satırı bulunamadı (sadece başlık var ya da boş).");
        return;
      }

      const headers = (aoa[0] as any[]).map((h) => String(h ?? "").trim());
      const tsKey = findHeader(headers, TS_ALIASES);
      const hourKey = findHeader(headers, HOUR_ALIASES);
      const kwhKey = findHeader(headers, KWH_ALIASES);

      if (!tsKey) {
        setParseError(
          `Tarih sütunu bulunamadı. Beklenen başlıklardan biri: ${TS_ALIASES.join(", ")}`,
        );
        return;
      }
      if (!kwhKey) {
        setParseError(
          `Enerji sütunu bulunamadı. Beklenen başlıklardan biri: ${KWH_ALIASES.slice(0, 6).join(", ")} ...`,
        );
        return;
      }

      const tsIdx = headers.indexOf(tsKey);
      const hourIdx = hourKey ? headers.indexOf(hourKey) : -1;
      const kwhIdx = headers.indexOf(kwhKey);

      const out: ParsedRow[] = [];
      const warnings: string[] = [];
      const seen = new Set<string>();

      for (let i = 1; i < aoa.length; i++) {
        const row = aoa[i] as any[];
        if (!row || row.every((c) => c === "" || c == null)) continue;

        const rawDate = row[tsIdx];
        const rawHour = hourIdx >= 0 ? row[hourIdx] : null;
        const rawKwh = row[kwhIdx];

        // Tarih + Saat AYRI sütunlardaysa: birleştir
        // Yoksa: tek sütundan parse et (eski davranış)
        let iso: string | null;
        if (hourIdx >= 0 && rawHour != null && rawHour !== "") {
          const dOnly = parseDateOnlyCell(rawDate);
          const hOnly = parseHourCell(rawHour);
          if (!dOnly) {
            warnings.push(
              `Satır ${i + 1}: tarih okunamadı (${String(rawDate)})`,
            );
            continue;
          }
          if (hOnly == null) {
            warnings.push(
              `Satır ${i + 1}: saat okunamadı (${String(rawHour)})`,
            );
            continue;
          }
          iso = toIstanbulIso(dOnly.y, dOnly.m, dOnly.d, hOnly);
        } else {
          iso = parseDateCell(rawDate);
        }

        if (!iso) {
          warnings.push(`Satır ${i + 1}: tarih okunamadı (${String(rawDate)})`);
          continue;
        }

        let kwh = parseNumberCell(rawKwh);
        if (kwh == null) {
          warnings.push(
            `Satır ${i + 1}: kWh okunamadı veya belirsiz format (${String(rawKwh)})`,
          );
          continue;
        }
        if (kwh < 0) kwh = 0;
        if (kwh > MAX_HOURLY_KWH) {
          warnings.push(
            `Satır ${i + 1}: değer çok yüksek (${kwh} kWh) — büyük ihtimal format hatası, atlandı (${String(rawKwh)})`,
          );
          continue;
        }

        if (seen.has(iso)) {
          warnings.push(
            `Satır ${i + 1}: aynı saat tekrar etmiş (${iso}), ilk değer kullanıldı`,
          );
          continue;
        }
        seen.add(iso);

        out.push({
          ts: iso,
          energy_kwh: kwh,
          rawDate: String(rawDate),
          rawValue: String(rawKwh),
        });
      }

      if (out.length === 0) {
        setParseError("Geçerli bir veri satırı bulunamadı.");
        return;
      }

      out.sort((a, b) => a.ts.localeCompare(b.ts));

      // Şüpheli satır tespiti: sıfırsız değerlerin median'ı * 10 üzeri = anormal
      const nonzero = out.map((r) => r.energy_kwh).filter((v) => v > 0).sort((a, b) => a - b);
      const median = nonzero.length > 0 ? nonzero[Math.floor(nonzero.length / 2)] : 0;
      const threshold = Math.max(median * 10, 1); // En az 1 — median 0 ise tüm > 0 değerler şüpheli olmasın
      const suspects: SuspectRow[] = [];
      out.forEach((r, idx) => {
        // Şüpheli kriter: median'dan 10x büyük VE ham değer 2+ noktalı (belirsiz format işareti)
        const dotCount = (r.rawValue.match(/\./g) ?? []).length;
        if (r.energy_kwh > threshold && dotCount >= 2) {
          suspects.push({
            ...r,
            index: idx,
            action: "divide100",
            manualValue: (r.energy_kwh / 100).toFixed(3),
          });
        }
      });

      setParsedRows(out);
      setSuspectRows(suspects);
      setParseWarnings(warnings);
    } catch (err: any) {
      console.error(err);
      setParseError("Dosya okunurken bir hata oluştu: " + (err?.message ?? "bilinmiyor"));
    } finally {
      setParsing(false);
    }
  }

  /* ---------------- Stats ------------------------------------------ */
  const totals = useMemo(() => {
    if (parsedRows.length === 0) {
      return { totalKwh: 0, daySet: new Set<string>(), firstTs: "", lastTs: "" };
    }
    const daySet = new Set<string>();
    let totalKwh = 0;
    for (const r of parsedRows) {
      totalKwh += r.energy_kwh;
      daySet.add(r.ts.slice(0, 10));
    }
    return {
      totalKwh,
      daySet,
      firstTs: parsedRows[0].ts,
      lastTs: parsedRows[parsedRows.length - 1].ts,
    };
  }, [parsedRows]);

  /* ---------------- Upload ----------------------------------------- */
  async function handleUpload() {
    if (!selectedUser) {
      setUploadError("Önce kullanıcı seçin.");
      return;
    }
    if (!selectedPlant) {
      setUploadError("Önce GES tesisi seçin.");
      return;
    }
    if (parsedRows.length === 0) {
      setUploadError("Yüklenecek veri yok.");
      return;
    }

    setUploading(true);
    setUploadError(null);
    setUploadStats(null);

    try {
      const plantId = selectedPlant;

      // 0) Şüpheli satırlar için kullanıcı kararlarını uygula
      const suspectMap = new Map<number, SuspectRow>(
        suspectRows.map((s) => [s.index, s]),
      );
      const effectiveRows: ParsedRow[] = [];
      let suspectsHandled = 0;
      for (let idx = 0; idx < parsedRows.length; idx++) {
        const r = parsedRows[idx];
        const sus = suspectMap.get(idx);
        if (!sus) {
          effectiveRows.push(r); // şüpheli değil, olduğu gibi
          continue;
        }
        suspectsHandled++;
        if (sus.action === "skip") continue; // atla
        if (sus.action === "divide100") {
          effectiveRows.push({ ...r, energy_kwh: r.energy_kwh / 100 });
          continue;
        }
        if (sus.action === "manual") {
          const v = Number(String(sus.manualValue).trim().replace(",", "."));
          if (!Number.isFinite(v) || v < 0) {
            throw new Error(
              `Manuel değer geçersiz (satır ${idx + 1}): "${sus.manualValue}"`,
            );
          }
          effectiveRows.push({ ...r, energy_kwh: v });
          continue;
        }
        // "asIs" → olduğu gibi tut
        effectiveRows.push(r);
      }

      if (effectiveRows.length === 0) {
        throw new Error("Hiç yüklenecek satır kalmadı (hepsi şüpheli ve atlandı).");
      }

      // 1) Mevcut saatleri öğrenelim — sadece BOŞ saatleri dolduracağız.
      // Tarih aralığı:
      const fromIso = effectiveRows[0].ts;
      const toIso = effectiveRows[effectiveRows.length - 1].ts;

      const existing = new Set<string>();
      // Büyük dosyalarda parça parça çekelim (1000'lik sayfalama)
      let offset = 0;
      const pageSize = 1000;
      while (true) {
        const { data, error } = await supabase
          .from("ges_production_hourly")
          .select("ts")
          .eq("ges_plant_id", plantId)
          .gte("ts", fromIso)
          .lte("ts", toIso)
          .range(offset, offset + pageSize - 1);
        if (error) throw new Error(error.message);
        const batch = (data ?? []) as { ts: string }[];
        batch.forEach((r) => existing.add(new Date(r.ts).toISOString()));
        if (batch.length < pageSize) break;
        offset += pageSize;
      }

      // 2) Sadece var olmayan saatleri al
      const toInsert = effectiveRows.filter(
        (r) => !existing.has(new Date(r.ts).toISOString()),
      );

      const skippedExisting = effectiveRows.length - toInsert.length;

      // 3) Insert (chunked)
      let inserted = 0;
      const insertChunkSize = 500;
      for (let i = 0; i < toInsert.length; i += insertChunkSize) {
        const chunk = toInsert.slice(i, i + insertChunkSize).map((r) => {
          // avg_power_w NUMERIC(10,2) — max 99,999,999.99 W (≈ 99,999 kWh/saat)
          // Sanity zaten parse aşamasında çalışıyor, burada ek koruma:
          const avgPowerW = Math.min(r.energy_kwh * 1000, 99_999_999.99);
          return {
            ges_plant_id: plantId,
            ts: r.ts,
            energy_kwh: r.energy_kwh,
            avg_power_w: avgPowerW,
            sample_count: 0,
          };
        });
        if (chunk.length === 0) break;
        const { error } = await supabase.from("ges_production_hourly").insert(chunk);
        if (error) throw new Error("Saatlik insert hatası: " + error.message);
        inserted += chunk.length;
      }

      // 4) Etkilenen günler için ges_production_daily upsert
      // Hangi günler etkilendi? Sadece insert ettiklerimizin günleri yeterli
      // (mevcutları değiştirmediğimiz için).
      const affectedDays = new Set<string>();
      toInsert.forEach((r) => affectedDays.add(r.ts.slice(0, 10)));

      // Her etkilenen gün için DB'den TÜM saatlik toplamı al, daily'e upsert et.
      // (Yeni eklediklerimizle birlikte eski varsa onları da kapsasın.)
      for (const day of affectedDays) {
        const dayFrom = `${day}T00:00:00+03:00`;
        const dayToExclusive = (() => {
          const d = new Date(`${day}T00:00:00+03:00`);
          d.setDate(d.getDate() + 1);
          // YYYY-MM-DD parçası
          const y = d.getFullYear();
          const m = pad(d.getMonth() + 1);
          const dd = pad(d.getDate());
          return `${y}-${m}-${dd}T00:00:00+03:00`;
        })();

        // sayfalı toplama
        let dayTotal = 0;
        let off = 0;
        while (true) {
          const { data, error } = await supabase
            .from("ges_production_hourly")
            .select("energy_kwh")
            .eq("ges_plant_id", plantId)
            .gte("ts", dayFrom)
            .lt("ts", dayToExclusive)
            .range(off, off + pageSize - 1);
          if (error) throw new Error("Daily aggregate hatası: " + error.message);
          const batch = (data ?? []) as { energy_kwh: number }[];
          batch.forEach((r) => {
            dayTotal += Number(r.energy_kwh ?? 0);
          });
          if (batch.length < pageSize) break;
          off += pageSize;
        }

        // ges_production_daily.id PK; doğal anahtar (ges_plant_id,date) olarak yönetelim
        // Mevcut satır var mı?
        const { data: existRow, error: exErr } = await supabase
          .from("ges_production_daily")
          .select("id")
          .eq("ges_plant_id", plantId)
          .eq("date", day)
          .maybeSingle();
        if (exErr) throw new Error("Daily lookup hatası: " + exErr.message);

        if (existRow?.id) {
          const { error: upErr } = await supabase
            .from("ges_production_daily")
            .update({ energy_kwh: dayTotal })
            .eq("id", existRow.id);
          if (upErr) throw new Error("Daily update hatası: " + upErr.message);
        } else {
          const { error: insErr } = await supabase
            .from("ges_production_daily")
            .insert({
              ges_plant_id: plantId,
              date: day,
              energy_kwh: dayTotal,
            });
          if (insErr) throw new Error("Daily insert hatası: " + insErr.message);
        }
      }

      setUploadStats({
        totalRows: parsedRows.length,
        inserted,
        skippedExisting,
        invalidRows: parseWarnings.length,
        suspectsHandled,
        affectedDays: affectedDays.size,
      });
    } catch (err: any) {
      console.error(err);
      setUploadError(err?.message ?? "Bilinmeyen hata");
    } finally {
      setUploading(false);
    }
  }

  function resetFile() {
    setFileName("");
    setParsedRows([]);
    setSuspectRows([]);
    setParseWarnings([]);
    setParseError(null);
    setUploadStats(null);
    setUploadError(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function setSuspectAction(rowIndex: number, action: SuspectAction) {
    setSuspectRows((prev) =>
      prev.map((s) => (s.index === rowIndex ? { ...s, action } : s)),
    );
  }

  function setSuspectManualValue(rowIndex: number, value: string) {
    setSuspectRows((prev) =>
      prev.map((s) =>
        s.index === rowIndex ? { ...s, manualValue: value, action: "manual" } : s,
      ),
    );
  }

  /* ---------------- Render ----------------------------------------- */
  const previewRows = parsedRows.slice(0, 10);
  const tailRows = parsedRows.slice(-3);
  const showTail = parsedRows.length > 13;

  return (
    <div className="p-4 md:p-6 space-y-5 max-w-5xl">
      <div>
        <h1 className="text-lg font-semibold text-neutral-900">GES Üretim Yükleme</h1>
        <p className="mt-1 text-sm text-neutral-500">
          API entegrasyonu olmayan tesisler için saatlik üretim verisini CSV/Excel
          olarak yükleyin. Aynı saat için zaten kayıt varsa{" "}
          <span className="font-medium">üzerine yazılmaz</span>; sadece boş saatler
          doldurulur. Yükleme sonrası günlük toplamlar otomatik hesaplanır.
        </p>
      </div>

      {/* 1) User + Plant */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
          <div className="text-xs text-neutral-500 mb-1">Kullanıcı</div>
          <select
            className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm bg-white"
            value={selectedUser}
            onChange={(e) => setSelectedUser(e.target.value)}
          >
            <option value="">Kullanıcı seçin...</option>
            {users.map((u) => (
              <option key={u.user_id} value={u.user_id}>
                {u.email ?? u.user_id}
              </option>
            ))}
          </select>
          {users.length === 0 && (
            <div className="mt-2 text-xs text-neutral-500">
              Henüz GES tesisi olan kullanıcı yok. Önce{" "}
              <span className="font-medium">GES Tesisler</span> sayfasından bir tesis
              oluşturun.
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between mb-1">
            <div className="text-xs text-neutral-500">GES Tesisi</div>
            <div className="flex items-center gap-3">
              {selectedUser && selectedPlant && !showMovePlant && (
                <button
                  type="button"
                  onClick={() => {
                    setShowMovePlant(true);
                    setShowCreatePlant(false);
                    setMovePlantError(null);
                    setMovePlantSuccess(null);
                    setMoveTargetSubscription("");
                  }}
                  className="text-xs text-amber-600 hover:text-amber-800 inline-flex items-center gap-1"
                >
                  <Building2 size={12} /> Başka sernoya taşı
                </button>
              )}
              {selectedUser && plants.length > 0 && !showCreatePlant && (
                <button
                  type="button"
                  onClick={() => setShowCreatePlant(true)}
                  className="text-xs text-blue-600 hover:text-blue-800 inline-flex items-center gap-1"
                >
                  <Plus size={12} /> Yeni manuel tesis
                </button>
              )}
            </div>
          </div>
          <select
            className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm bg-white disabled:bg-neutral-50 disabled:text-neutral-400"
            value={selectedPlant}
            onChange={(e) => {
              setSelectedPlant(e.target.value);
              setShowMovePlant(false);
              setMovePlantError(null);
              setMovePlantSuccess(null);
              setMoveTargetSubscription("");
            }}
            disabled={!selectedUser || plants.length === 0}
          >
            <option value="">
              {!selectedUser
                ? "Önce kullanıcı seçin"
                : plants.length === 0
                  ? "Bu kullanıcının tesisi yok — aşağıdan oluşturun"
                  : "Tesis seçin..."}
            </option>
            {plants.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nickname || p.plant_name || p.id.slice(0, 8)}
                {p.linked_serno ? ` (Serno: ${p.linked_serno})` : ""}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* 1b) Manuel tesis oluşturma formu (plant yoksa veya admin manuel açtıysa) */}
      {selectedUser && showCreatePlant && (
        <div className="rounded-2xl border border-blue-200 bg-blue-50/40 p-4 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Building2 size={18} className="text-blue-600" />
              <div className="text-sm font-medium text-neutral-900">
                Manuel GES Tesisi Oluştur
              </div>
            </div>
            {plants.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  setShowCreatePlant(false);
                  setCreatePlantError(null);
                }}
                className="text-neutral-400 hover:text-neutral-700"
                aria-label="Kapat"
              >
                <X size={16} />
              </button>
            )}
          </div>
          <p className="text-xs text-neutral-600 mb-4">
            Bu kullanıcının mevcut OSOS aboneliklerinden birini seçin. Yeni
            santral oluşturulmaz — seçtiğiniz aboneliğe GES verisi yükleyebilmek
            için arka planda bir bağlama kaydı oluşturulur.{" "}
            <span className="font-medium">GES sayfasındaki blur kalkacak.</span>
          </p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="md:col-span-2">
              <label className="text-xs text-neutral-500 block mb-1">
                Eşleşecek Abonelik (OSOS) <span className="text-red-500">*</span>
              </label>
              <select
                value={selectedSubscription}
                onChange={(e) => setSelectedSubscription(e.target.value)}
                disabled={subscriptions.length === 0}
                className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm bg-white disabled:bg-neutral-50 disabled:text-neutral-400"
              >
                <option value="">
                  {subscriptions.length === 0
                    ? "Bu kullanıcının kayıtlı aboneliği yok"
                    : "Abonelik seçin..."}
                </option>
                {subscriptions.map((s) => (
                  <option key={s.subscription_serno} value={s.subscription_serno}>
                    {s.subscription_serno} — {s.title || "İsimsiz Tesis"}
                  </option>
                ))}
              </select>
              <div className="text-[11px] text-neutral-500 mt-1">
                Tesis adı ve serno otomatik bu abonelikten alınır.
              </div>
            </div>
            <div>
              <label className="text-xs text-neutral-500 block mb-1">
                Peak Power (kW)
              </label>
              <input
                type="number"
                step="0.01"
                value={newPlantPeak}
                onChange={(e) => setNewPlantPeak(e.target.value)}
                placeholder="opsiyonel"
                className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm bg-white"
              />
            </div>
          </div>

          {createPlantError && (
            <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-2.5 text-sm text-red-700 flex items-start gap-2">
              <AlertTriangle size={14} className="shrink-0 mt-0.5" />
              <div>{createPlantError}</div>
            </div>
          )}

          <div className="mt-3 flex justify-end">
            <button
              type="button"
              onClick={handleCreateManualPlant}
              disabled={creatingPlant}
              className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {creatingPlant ? (
                <>
                  <Loader2 size={14} className="animate-spin" />
                  Oluşturuluyor...
                </>
              ) : (
                <>
                  <Plus size={14} />
                  Tesisi Oluştur
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* 1c) Tesisi başka sernoya taşı */}
      {selectedUser && selectedPlant && showMovePlant && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50/50 p-4 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Building2 size={18} className="text-amber-600" />
              <div className="text-sm font-medium text-neutral-900">
                Tesisi Başka Sernoya Taşı
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                setShowMovePlant(false);
                setMovePlantError(null);
              }}
              className="text-neutral-400 hover:text-neutral-700"
              aria-label="Kapat"
            >
              <X size={16} />
            </button>
          </div>

          {(() => {
            const cur = plants.find((p) => p.id === selectedPlant);
            return (
              <p className="text-xs text-neutral-600 mb-4">
                <span className="font-medium">
                  {cur?.nickname || cur?.plant_name || selectedPlant.slice(0, 8)}
                </span>{" "}
                tesisi
                {cur?.linked_serno ? (
                  <>
                    {" "}
                    (mevcut serno:{" "}
                    <span className="font-mono">{cur.linked_serno}</span>)
                  </>
                ) : null}{" "}
                başka bir OSOS aboneliğine taşınacak. Tesise bağlı tüm üretim
                verisi (saatlik + günlük) otomatik olarak yeni sernoya taşınır —
                veri kopyalanmaz, kaybolmaz.
              </p>
            );
          })()}

          <div>
            <label className="text-xs text-neutral-500 block mb-1">
              Hedef Abonelik (yeni serno){" "}
              <span className="text-red-500">*</span>
            </label>
            <select
              value={moveTargetSubscription}
              onChange={(e) => setMoveTargetSubscription(e.target.value)}
              disabled={subscriptions.length === 0}
              className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm bg-white disabled:bg-neutral-50 disabled:text-neutral-400"
            >
              <option value="">
                {subscriptions.length === 0
                  ? "Bu kullanıcının kayıtlı aboneliği yok"
                  : "Hedef abonelik seçin..."}
              </option>
              {subscriptions
                .filter(
                  (s) =>
                    s.subscription_serno !==
                    plants.find((p) => p.id === selectedPlant)?.linked_serno,
                )
                .map((s) => (
                  <option
                    key={s.subscription_serno}
                    value={s.subscription_serno}
                  >
                    {s.subscription_serno} — {s.title || "İsimsiz Tesis"}
                  </option>
                ))}
            </select>
            <div className="text-[11px] text-neutral-500 mt-1">
              Tesis adı hedef aboneliğin başlığıyla güncellenir. Hedef sernoda
              zaten aktif bir tesis varsa taşıma engellenir.
            </div>
          </div>

          {movePlantError && (
            <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-2.5 text-sm text-red-700 flex items-start gap-2">
              <AlertTriangle size={14} className="shrink-0 mt-0.5" />
              <div>{movePlantError}</div>
            </div>
          )}

          <div className="mt-3 flex justify-end">
            <button
              type="button"
              onClick={handleMovePlant}
              disabled={movingPlant || !moveTargetSubscription}
              className="inline-flex items-center gap-2 rounded-lg bg-amber-600 px-3 py-2 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50"
            >
              {movingPlant ? (
                <>
                  <Loader2 size={14} className="animate-spin" />
                  Taşınıyor...
                </>
              ) : (
                <>
                  <Building2 size={14} />
                  Tesisi Taşı
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {movePlantSuccess && !showMovePlant && (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800 flex items-start gap-2">
          <CheckCircle2 size={16} className="shrink-0 mt-0.5" />
          <div>{movePlantSuccess}</div>
        </div>
      )}

      {/* 2) Format bilgisi */}
      <div className="rounded-2xl border border-blue-100 bg-blue-50/60 p-4 text-sm">
        <div className="flex items-start gap-2">
          <Info size={18} className="text-blue-600 mt-0.5 shrink-0" />
          <div className="space-y-1.5 text-neutral-700">
            <div className="font-medium text-neutral-900">Beklenen sütunlar</div>
            <div>
              <span className="font-mono rounded bg-white px-1.5 py-0.5 border">
                ts
              </span>{" "}
              veya{" "}
              <span className="font-mono rounded bg-white px-1.5 py-0.5 border">
                Tarih
              </span>{" "}
              — saat başına tek satır (örn. <em>26.04.2026 08:00</em>,{" "}
              <em>2026-04-26 08:00</em> ya da Excel datetime)
            </div>
            <div>
              <span className="font-mono rounded bg-white px-1.5 py-0.5 border">
                energy_kwh
              </span>{" "}
              veya{" "}
              <span className="font-mono rounded bg-white px-1.5 py-0.5 border">
                Semmak Uretilen Enerji (kWh)
              </span>{" "}
              — o saatte üretilen enerji (kWh)
            </div>
            <div className="text-xs text-neutral-500">
              Boş hücre veya 0 değerleri 0 olarak kaydedilir. Saat tekrarları
              atlanır.
            </div>
          </div>
        </div>
      </div>

      {/* 3) File input + drag-drop */}
      <div
        onDragOver={handleDragOver}
        onDragEnter={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`rounded-2xl border-2 border-dashed bg-white p-6 shadow-sm transition ${
          isDragging
            ? "border-emerald-500 bg-emerald-50/50 ring-2 ring-emerald-300"
            : "border-neutral-300 hover:border-neutral-400"
        }`}
      >
        <div className="flex flex-col items-center justify-center gap-3 text-center">
          <div
            className={`grid h-12 w-12 place-items-center rounded-full transition ${
              isDragging ? "bg-emerald-100 text-emerald-600" : "bg-neutral-100 text-neutral-500"
            }`}
          >
            <Upload size={20} />
          </div>

          {isDragging ? (
            <div className="text-sm font-medium text-emerald-700">
              Dosyayı bırakın
            </div>
          ) : (
            <>
              <div className="text-sm text-neutral-700">
                <span className="font-medium">Dosyayı sürükleyip bırakın</span>{" "}
                veya
              </div>
              <label
                htmlFor="ges-upload-file"
                className="inline-flex items-center gap-2 rounded-lg bg-neutral-900 px-3 py-2 text-sm font-medium text-white hover:bg-neutral-800 cursor-pointer"
              >
                <Upload size={14} />
                Dosya seç (.xlsx / .csv)
              </label>
              <div className="text-xs text-neutral-400">
                Desteklenen: .csv, .xlsx, .xls
              </div>
            </>
          )}

          <input
            ref={fileInputRef}
            id="ges-upload-file"
            type="file"
            accept=".xlsx,.xls,.csv"
            onChange={handleFileChange}
            className="hidden"
          />

          {fileName && !isDragging && (
            <div className="mt-1 inline-flex items-center gap-2 rounded-full border border-neutral-200 bg-neutral-50 px-3 py-1 text-sm text-neutral-700">
              <FileSpreadsheet size={14} className="text-neutral-500" />
              <span className="truncate max-w-[260px]">{fileName}</span>
              <button
                type="button"
                onClick={resetFile}
                className="text-neutral-400 hover:text-neutral-700"
                aria-label="Temizle"
              >
                <X size={14} />
              </button>
            </div>
          )}
          {parsing && (
            <div className="text-xs text-neutral-500 inline-flex items-center gap-1">
              <Loader2 size={14} className="animate-spin" /> Okunuyor...
            </div>
          )}
        </div>

        {parseError && (
          <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 flex items-start gap-2">
            <AlertTriangle size={16} className="shrink-0 mt-0.5" />
            <div>{parseError}</div>
          </div>
        )}

        {parseWarnings.length > 0 && (
          <details className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
            <summary className="cursor-pointer font-medium">
              {parseWarnings.length} uyarı (görmek için tıklayın)
            </summary>
            <ul className="mt-2 list-disc pl-5 space-y-0.5 text-xs">
              {parseWarnings.slice(0, 50).map((w, i) => (
                <li key={i}>{w}</li>
              ))}
              {parseWarnings.length > 50 && (
                <li className="italic">
                  …ve {parseWarnings.length - 50} adet daha
                </li>
              )}
            </ul>
          </details>
        )}
      </div>

      {/* 3b) Şüpheli satırlar paneli */}
      {suspectRows.length > 0 && (
        <div className="rounded-2xl border border-amber-300 bg-amber-50/60 p-4 shadow-sm">
          <div className="flex items-start gap-2 mb-3">
            <AlertTriangle size={18} className="text-amber-600 mt-0.5 shrink-0" />
            <div>
              <div className="text-sm font-semibold text-neutral-900">
                {suspectRows.length} şüpheli değer tespit edildi
              </div>
              <div className="text-xs text-neutral-600 mt-1">
                Bu satırlar diğerlerinden 10x+ büyük ve birden fazla nokta içeriyor (format
                hatası belirtisi). Her birinin nasıl ele alınacağını seçin. Default:{" "}
                <span className="font-medium">100'e böl</span> (Europower CSV'sinde sık
                görülen bir formatlama hatası).
              </div>
            </div>
          </div>

          <div className="overflow-x-auto rounded-lg border border-amber-200 bg-white">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-amber-200 bg-amber-50/80 text-left text-xs font-medium text-neutral-600 uppercase tracking-wider">
                  <th className="px-3 py-2">Saat</th>
                  <th className="px-3 py-2">CSV ham değer</th>
                  <th className="px-3 py-2 text-right">Algoritma yorumu</th>
                  <th className="px-3 py-2 text-right">100'e bölünmüş</th>
                  <th className="px-3 py-2 text-center">Karar</th>
                  <th className="px-3 py-2 text-right">Manuel değer</th>
                </tr>
              </thead>
              <tbody>
                {suspectRows.map((s) => (
                  <tr key={s.index} className="border-b border-amber-100">
                    <td className="px-3 py-2 font-mono text-xs">
                      {s.ts.slice(0, 16).replace("T", " ")}
                    </td>
                    <td className="px-3 py-2 text-neutral-500 font-mono text-xs">
                      {s.rawValue}
                    </td>
                    <td className="px-3 py-2 text-right text-neutral-700">
                      {s.energy_kwh.toLocaleString("tr-TR", { maximumFractionDigits: 3 })}
                    </td>
                    <td className="px-3 py-2 text-right font-semibold text-emerald-700">
                      {(s.energy_kwh / 100).toLocaleString("tr-TR", {
                        maximumFractionDigits: 3,
                      })}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex items-center justify-center gap-1 flex-wrap">
                        <button
                          type="button"
                          onClick={() => setSuspectAction(s.index, "divide100")}
                          className={`px-2 py-1 text-[11px] rounded-md transition ${
                            s.action === "divide100"
                              ? "bg-emerald-600 text-white"
                              : "bg-white border border-neutral-200 text-neutral-600 hover:bg-neutral-50"
                          }`}
                        >
                          /100
                        </button>
                        <button
                          type="button"
                          onClick={() => setSuspectAction(s.index, "asIs")}
                          className={`px-2 py-1 text-[11px] rounded-md transition ${
                            s.action === "asIs"
                              ? "bg-blue-600 text-white"
                              : "bg-white border border-neutral-200 text-neutral-600 hover:bg-neutral-50"
                          }`}
                        >
                          olduğu gibi
                        </button>
                        <button
                          type="button"
                          onClick={() => setSuspectAction(s.index, "skip")}
                          className={`px-2 py-1 text-[11px] rounded-md transition ${
                            s.action === "skip"
                              ? "bg-neutral-700 text-white"
                              : "bg-white border border-neutral-200 text-neutral-600 hover:bg-neutral-50"
                          }`}
                        >
                          atla
                        </button>
                        <button
                          type="button"
                          onClick={() => setSuspectAction(s.index, "manual")}
                          className={`px-2 py-1 text-[11px] rounded-md transition ${
                            s.action === "manual"
                              ? "bg-amber-600 text-white"
                              : "bg-white border border-neutral-200 text-neutral-600 hover:bg-neutral-50"
                          }`}
                        >
                          manuel
                        </button>
                      </div>
                    </td>
                    <td className="px-3 py-2 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <input
                          type="number"
                          step="0.001"
                          value={s.manualValue}
                          onChange={(e) =>
                            setSuspectManualValue(s.index, e.target.value)
                          }
                          onFocus={() => setSuspectAction(s.index, "manual")}
                          placeholder="örn. 620.8"
                          className={`w-24 rounded-md border px-2 py-1 text-xs text-right transition ${
                            s.action === "manual"
                              ? "border-amber-400 bg-amber-50 text-neutral-900"
                              : "border-neutral-200 bg-white text-neutral-500"
                          }`}
                        />
                        <span className="text-[11px] text-neutral-400">kWh</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-3 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() =>
                setSuspectRows((prev) =>
                  prev.map((s) => ({ ...s, action: "divide100" })),
                )
              }
              className="text-xs text-emerald-700 hover:text-emerald-800 underline"
            >
              Hepsi: 100'e böl
            </button>
            <span className="text-neutral-300">·</span>
            <button
              type="button"
              onClick={() =>
                setSuspectRows((prev) => prev.map((s) => ({ ...s, action: "skip" })))
              }
              className="text-xs text-neutral-600 hover:text-neutral-800 underline"
            >
              Hepsi: atla
            </button>
          </div>
        </div>
      )}

      {/* 4) Preview */}
      {parsedRows.length > 0 && (
        <div className="rounded-2xl border border-neutral-200 bg-white shadow-sm overflow-hidden">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 p-4 border-b border-neutral-100 text-xs text-neutral-600">
            <div>
              <div className="text-neutral-400">Toplam saat</div>
              <div className="font-semibold text-neutral-900 text-sm">
                {parsedRows.length.toLocaleString("tr-TR")}
              </div>
            </div>
            <div>
              <div className="text-neutral-400">Etkilenen gün</div>
              <div className="font-semibold text-neutral-900 text-sm">
                {totals.daySet.size}
              </div>
            </div>
            <div>
              <div className="text-neutral-400">Toplam üretim</div>
              <div className="font-semibold text-neutral-900 text-sm">
                {totals.totalKwh.toLocaleString("tr-TR", {
                  maximumFractionDigits: 2,
                })}{" "}
                kWh
              </div>
            </div>
            <div>
              <div className="text-neutral-400">Aralık</div>
              <div className="font-semibold text-neutral-900 text-[12px]">
                {totals.firstTs.slice(0, 16).replace("T", " ")} →{" "}
                {totals.lastTs.slice(0, 16).replace("T", " ")}
              </div>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-neutral-200 bg-neutral-50 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">
                  <th className="px-4 py-2">#</th>
                  <th className="px-4 py-2">ts (UTC+3)</th>
                  <th className="px-4 py-2">Orijinal değer</th>
                  <th className="px-4 py-2 text-right">energy_kwh</th>
                </tr>
              </thead>
              <tbody>
                {previewRows.map((r, i) => (
                  <tr key={i} className="border-b border-neutral-100">
                    <td className="px-4 py-1.5 text-neutral-400">{i + 1}</td>
                    <td className="px-4 py-1.5 font-mono text-xs">
                      {r.ts.slice(0, 16).replace("T", " ")}
                    </td>
                    <td className="px-4 py-1.5 text-neutral-500 text-xs">
                      {r.rawDate}
                    </td>
                    <td className="px-4 py-1.5 text-right">
                      {r.energy_kwh.toLocaleString("tr-TR", {
                        maximumFractionDigits: 3,
                      })}
                    </td>
                  </tr>
                ))}
                {showTail && (
                  <>
                    <tr>
                      <td
                        className="px-4 py-2 text-center text-xs text-neutral-400 italic"
                        colSpan={4}
                      >
                        … {parsedRows.length - 13} satır arada …
                      </td>
                    </tr>
                    {tailRows.map((r, i) => (
                      <tr key={`tail-${i}`} className="border-b border-neutral-100">
                        <td className="px-4 py-1.5 text-neutral-400">
                          {parsedRows.length - tailRows.length + i + 1}
                        </td>
                        <td className="px-4 py-1.5 font-mono text-xs">
                          {r.ts.slice(0, 16).replace("T", " ")}
                        </td>
                        <td className="px-4 py-1.5 text-neutral-500 text-xs">
                          {r.rawDate}
                        </td>
                        <td className="px-4 py-1.5 text-right">
                          {r.energy_kwh.toLocaleString("tr-TR", {
                            maximumFractionDigits: 3,
                          })}
                        </td>
                      </tr>
                    ))}
                  </>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 5) Upload button */}
      {parsedRows.length > 0 && (
        <div className="flex items-center justify-end gap-3">
          {uploadError && (
            <div className="text-sm text-red-700 inline-flex items-center gap-1.5">
              <AlertTriangle size={14} /> {uploadError}
            </div>
          )}
          <button
            type="button"
            onClick={handleUpload}
            disabled={
              uploading || !selectedUser || !selectedPlant || parsedRows.length === 0
            }
            className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            {uploading ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                Yükleniyor...
              </>
            ) : (
              <>
                <Upload size={16} />
                Supabase'e Yükle
              </>
            )}
          </button>
        </div>
      )}

      {/* 6) Result */}
      {uploadStats && (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm">
          <div className="flex items-start gap-2">
            <CheckCircle2 size={18} className="text-emerald-600 mt-0.5 shrink-0" />
            <div className="space-y-1.5 text-neutral-800">
              <div className="font-medium text-emerald-900">Yükleme tamamlandı</div>
              <div>
                Toplam satır: <strong>{uploadStats.totalRows}</strong> · Eklendi:{" "}
                <strong>{uploadStats.inserted}</strong> · Atlandı (zaten vardı):{" "}
                <strong>{uploadStats.skippedExisting}</strong> · Geçersiz:{" "}
                <strong>{uploadStats.invalidRows}</strong>
                {uploadStats.suspectsHandled > 0 && (
                  <>
                    {" "}· Şüpheli işlendi:{" "}
                    <strong>{uploadStats.suspectsHandled}</strong>
                  </>
                )}
              </div>
              <div className="text-xs text-emerald-800">
                {uploadStats.affectedDays} günün toplamı{" "}
                <span className="font-mono">ges_production_daily</span> tablosunda
                güncellendi. GES sayfası artık bu kullanıcı için saatlik & günlük
                veriyi görüntüleyebilir.
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
