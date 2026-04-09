import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { dayjsTR } from "@/lib/dayjs";
import { Search, Eye, EyeOff, Lock, Copy, Check, ClipboardList } from "lucide-react";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type IntakeRow = {
  id: string;
  created_at: string;
  ad_soyad: string;
  telefon: string;
  firma_adi: string;
  osos_kullanici: string;
  osos_sifre: string;
  tesis_sayisi: number;
  tesisler: TesisJSON[];
  status: "yeni" | "islendi" | "beklemede";
  admin_notu: string | null;
  reviewed_at: string | null;
  reviewed_by: string | null;
};

type TesisJSON = {
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

type StatusFilter = "all" | "yeni" | "islendi" | "beklemede";

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function relativeTime(iso: string): string {
  const now = dayjsTR();
  const then = dayjsTR(iso);
  const diffMin = now.diff(then, "minute");
  if (diffMin < 1) return "Az önce";
  if (diffMin < 60) return `${diffMin} dk önce`;
  const diffHour = now.diff(then, "hour");
  if (diffHour < 24) return `${diffHour} saat önce`;
  const diffDay = now.diff(then, "day");
  if (diffDay < 30) return `${diffDay} gün önce`;
  return then.format("DD.MM.YYYY");
}

const STATUS_STYLE: Record<string, string> = {
  yeni: "bg-blue-100 text-blue-700",
  islendi: "bg-green-100 text-green-700",
  beklemede: "bg-amber-100 text-amber-700",
};

const STATUS_LABEL: Record<string, string> = {
  yeni: "Yeni",
  islendi: "İşlendi",
  beklemede: "Beklemede",
};

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function IntakeFormsAdmin() {
  const [rows, setRows] = useState<IntakeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [searchQ, setSearchQ] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

  // Detail panel
  const [showPass, setShowPass] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [activeTesis, setActiveTesis] = useState(0);
  const [adminNote, setAdminNote] = useState("");
  const [noteSaving, setNoteSaving] = useState(false);
  const [noteMsg, setNoteMsg] = useState<string | null>(null);

  /* ---------- Fetch ---------- */

  async function fetchRows() {
    const { data } = await supabase
      .from("intake_forms")
      .select("*")
      .order("created_at", { ascending: false });
    setRows((data as IntakeRow[]) ?? []);
    setLoading(false);
  }

  useEffect(() => {
    fetchRows();

    // Realtime subscription for new inserts
    const channel = supabase
      .channel("intake_forms_inserts")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "intake_forms" }, (payload) => {
        setRows((prev) => [payload.new as IntakeRow, ...prev]);
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  /* ---------- Derived ---------- */

  const filtered = useMemo(() => {
    let list = rows;
    if (statusFilter !== "all") {
      list = list.filter((r) => r.status === statusFilter);
    }
    if (searchQ.trim()) {
      const q = searchQ.toLowerCase();
      list = list.filter(
        (r) =>
          r.firma_adi.toLowerCase().includes(q) ||
          r.ad_soyad.toLowerCase().includes(q) ||
          r.osos_kullanici.toLowerCase().includes(q),
      );
    }
    return list;
  }, [rows, statusFilter, searchQ]);

  const selected = rows.find((r) => r.id === selectedId) ?? null;

  const counts = useMemo(() => {
    const c = { total: rows.length, yeni: 0, islendi: 0, beklemede: 0 };
    for (const r of rows) {
      if (r.status in c) (c as Record<string, number>)[r.status]++;
    }
    return c;
  }, [rows]);

  /* ---------- Sync admin note when selection changes ---------- */

  useEffect(() => {
    if (selected) {
      setAdminNote(selected.admin_notu ?? "");
      setActiveTesis(0);
      setShowPass(false);
      setNoteMsg(null);
    }
  }, [selectedId]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ---------- Status update ---------- */

  async function updateStatus(id: string, status: string) {
    const { error } = await supabase
      .from("intake_forms")
      .update({ status, reviewed_at: new Date().toISOString() })
      .eq("id", id);
    if (!error) {
      setRows((prev) => prev.map((r) => (r.id === id ? { ...r, status: status as IntakeRow["status"], reviewed_at: new Date().toISOString() } : r)));
    }
  }

  /* ---------- Admin note save ---------- */

  async function saveNote() {
    if (!selectedId) return;
    setNoteSaving(true);
    setNoteMsg(null);
    const { error } = await supabase
      .from("intake_forms")
      .update({ admin_notu: adminNote || null })
      .eq("id", selectedId);
    setNoteSaving(false);
    if (error) {
      setNoteMsg("Hata: " + error.message);
    } else {
      setNoteMsg("Kaydedildi.");
      setRows((prev) => prev.map((r) => (r.id === selectedId ? { ...r, admin_notu: adminNote || null } : r)));
    }
  }

  /* ---------- Copy helper ---------- */

  function copyText(text: string, label: string) {
    navigator.clipboard.writeText(text);
    setCopied(label);
    setTimeout(() => setCopied(null), 1500);
  }

  /* ================================================================ */
  /*  Render                                                           */
  /* ================================================================ */

  return (
    <div>
      <h1 className="text-lg font-semibold text-neutral-900 mb-2">Tanımlama Başvuruları</h1>

      {/* Stats row */}
      <div className="flex flex-wrap items-center gap-2 mb-4 text-xs">
        <span className="text-neutral-500">Toplam: <span className="font-semibold text-neutral-700">{counts.total}</span></span>
        <span className="text-neutral-300">|</span>
        <span className="text-blue-600">Yeni: {counts.yeni}</span>
        <span className="text-neutral-300">|</span>
        <span className="text-green-600">İşlendi: {counts.islendi}</span>
        <span className="text-neutral-300">|</span>
        <span className="text-amber-600">Beklemede: {counts.beklemede}</span>
      </div>

      {/* Search + filter */}
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="relative flex-1">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-neutral-400" />
          <input
            type="text"
            value={searchQ}
            onChange={(e) => setSearchQ(e.target.value)}
            placeholder="Firma, Ad Soyad veya OSOS ara..."
            className="w-full rounded-lg border border-neutral-300 py-2 pl-8 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
          />
        </div>
        <div className="flex gap-1">
          {(["all", "yeni", "islendi", "beklemede"] as StatusFilter[]).map((f) => (
            <button
              key={f}
              onClick={() => setStatusFilter(f)}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                statusFilter === f ? "bg-black text-white" : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200"
              }`}
            >
              {f === "all" ? "Tümü" : STATUS_LABEL[f]}
            </button>
          ))}
        </div>
      </div>

      {/* Main grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* ====================== LEFT — LIST ====================== */}
        <div className="lg:col-span-5 rounded-2xl border bg-white p-4 max-h-[40vh] lg:max-h-[75vh] overflow-y-auto">
          {loading ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="animate-pulse rounded-lg bg-neutral-100 h-20" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <p className="text-sm text-neutral-500 text-center py-10">Başvuru bulunamadı.</p>
          ) : (
            <div className="space-y-2">
              {filtered.map((r) => (
                <button
                  key={r.id}
                  onClick={() => setSelectedId(r.id)}
                  className={`w-full text-left rounded-xl px-4 py-3 transition-all duration-200 border ${
                    selectedId === r.id
                      ? "bg-blue-50 ring-1 ring-blue-200 border-blue-200"
                      : r.status === "yeni"
                        ? "border-l-2 border-l-emerald-400 border-t border-r border-b border-neutral-100 hover:bg-neutral-50"
                        : "border-neutral-100 hover:bg-neutral-50"
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-semibold text-neutral-800 truncate">{r.firma_adi}</span>
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${STATUS_STYLE[r.status]}`}>
                      {STATUS_LABEL[r.status]}
                    </span>
                  </div>
                  <p className="text-xs text-neutral-600 truncate">{r.ad_soyad}</p>
                  <div className="flex items-center justify-between mt-1.5">
                    <span className="text-[10px] text-neutral-400">{relativeTime(r.created_at)}</span>
                    <span className="text-[10px] text-neutral-400">{r.tesis_sayisi} tesis</span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* ====================== RIGHT — DETAIL ===================== */}
        <div className="lg:col-span-7 rounded-2xl border bg-white p-4 max-h-[40vh] lg:max-h-[75vh] overflow-y-auto">
          {!selected ? (
            <div className="flex flex-col items-center justify-center py-16 text-neutral-400">
              <ClipboardList size={36} className="mb-3 opacity-40" />
              <p className="text-sm">Bir başvuru seçin</p>
            </div>
          ) : (
            <div className="space-y-5">
              {/* Header */}
              <div>
                <div className="flex items-center justify-between gap-3 mb-2">
                  <h2 className="text-lg font-semibold text-neutral-900">{selected.firma_adi}</h2>
                  <select
                    value={selected.status}
                    onChange={(e) => updateStatus(selected.id, e.target.value)}
                    className={`rounded-lg border px-2 py-1 text-xs font-medium ${STATUS_STYLE[selected.status]}`}
                  >
                    <option value="yeni">Yeni</option>
                    <option value="islendi">İşlendi</option>
                    <option value="beklemede">Beklemede</option>
                  </select>
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-neutral-600">
                  <span>{selected.ad_soyad}</span>
                  <a href={`tel:${selected.telefon}`} className="text-blue-600 hover:underline">{selected.telefon}</a>
                  <span className="text-neutral-400">{dayjsTR(selected.created_at).format("DD.MM.YYYY HH:mm")}</span>
                </div>
              </div>

              {/* Credentials */}
              <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Lock size={14} className="text-neutral-500" />
                  <span className="text-xs font-semibold text-neutral-700">OSOS Bilgileri</span>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-neutral-500 w-24 shrink-0">Kullanıcı:</span>
                    <code className="flex-1 rounded bg-white px-2 py-1 text-xs font-mono text-neutral-800 border">
                      {selected.osos_kullanici}
                    </code>
                    <button onClick={() => copyText(selected.osos_kullanici, "user")} className="text-neutral-400 hover:text-neutral-600">
                      {copied === "user" ? <Check size={14} className="text-green-500" /> : <Copy size={14} />}
                    </button>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-neutral-500 w-24 shrink-0">Şifre:</span>
                    <code className="flex-1 rounded bg-white px-2 py-1 text-xs font-mono text-neutral-800 border">
                      {showPass ? selected.osos_sifre : "\u2022".repeat(Math.min(selected.osos_sifre.length, 12))}
                    </code>
                    <button onClick={() => setShowPass((p) => !p)} className="text-neutral-400 hover:text-neutral-600">
                      {showPass ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                    <button onClick={() => copyText(selected.osos_sifre, "pass")} className="text-neutral-400 hover:text-neutral-600">
                      {copied === "pass" ? <Check size={14} className="text-green-500" /> : <Copy size={14} />}
                    </button>
                  </div>
                </div>
              </div>

              {/* Tesis Bilgileri */}
              <div>
                <p className="text-xs font-semibold text-neutral-700 mb-2">Tesis Bilgileri</p>

                {/* Tesis tabs */}
                {selected.tesisler.length > 1 && (
                  <div className="flex gap-1 mb-3 flex-wrap">
                    {selected.tesisler.map((_, i) => (
                      <button
                        key={i}
                        onClick={() => setActiveTesis(i)}
                        className={`rounded-lg px-2.5 py-1 text-xs font-medium transition-colors ${
                          activeTesis === i ? "bg-black text-white" : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200"
                        }`}
                      >
                        Tesis #{i + 1}
                      </button>
                    ))}
                  </div>
                )}

                {selected.tesisler[activeTesis] && (() => {
                  const t = selected.tesisler[activeTesis];
                  return (
                    <div className="rounded-xl border border-neutral-200 p-4 space-y-3">
                      {/* 2-col info grid */}
                      <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-xs">
                        <div><span className="text-neutral-500">KBK:</span> <span className="font-medium text-neutral-800">{t.kbk ?? "—"}</span></div>
                        <div><span className="text-neutral-500">Terim:</span> <span className="font-medium text-neutral-800">{t.terim || "—"}</span></div>
                        <div><span className="text-neutral-500">Tarife:</span> <span className="font-medium text-neutral-800">{t.tarife || "—"}</span></div>
                        <div><span className="text-neutral-500">Gerilim:</span> <span className="font-medium text-neutral-800">{t.gerilim || "—"}</span></div>
                        <div><span className="text-neutral-500">Güç Bedeli:</span> <span className="font-medium text-neutral-800">{t.guc_bedel_limit != null ? `${t.guc_bedel_limit} kW` : "—"}</span></div>
                        <div><span className="text-neutral-500">Trafo Kaybı:</span> <span className="font-medium text-neutral-800">{t.trafo_degeri ?? "—"}</span></div>
                      </div>

                      {/* YEKDEM table */}
                      <div className="mt-2">
                        <p className="text-[10px] font-semibold text-neutral-500 uppercase tracking-wider mb-1.5">YEKDEM</p>
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="text-neutral-500">
                              <th className="text-left py-1 font-medium" />
                              <th className="text-right py-1 font-medium">Tahmini</th>
                              <th className="text-right py-1 font-medium">Finali</th>
                            </tr>
                          </thead>
                          <tbody className="text-neutral-800">
                            <tr className="border-t border-neutral-100">
                              <td className="py-1.5 text-neutral-500">Geçen Ay</td>
                              <td className="py-1.5 text-right font-mono">{t.yekdem_tahmin_1 ?? "—"}</td>
                              <td className="py-1.5 text-right font-mono">{t.yekdem_final_1 ?? "—"}</td>
                            </tr>
                            <tr className="border-t border-neutral-100">
                              <td className="py-1.5 text-neutral-500">2 Ay Önce</td>
                              <td className="py-1.5 text-right font-mono">{t.yekdem_tahmin_2 ?? "—"}</td>
                              <td className="py-1.5 text-right font-mono">{t.yekdem_final_2 ?? "—"}</td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
                    </div>
                  );
                })()}
              </div>

              {/* Admin Notu */}
              <div>
                <p className="text-xs font-semibold text-neutral-700 mb-2">Admin Notu</p>
                <textarea
                  value={adminNote}
                  onChange={(e) => setAdminNote(e.target.value)}
                  rows={3}
                  placeholder="Dahili not ekleyin..."
                  className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200 resize-none"
                />
                <div className="flex items-center gap-3 mt-2">
                  <button
                    disabled={noteSaving}
                    onClick={saveNote}
                    className="rounded-lg bg-black px-3 py-1.5 text-xs text-white font-medium disabled:opacity-50 transition-opacity"
                  >
                    {noteSaving ? "Kaydediliyor..." : "Notu Kaydet"}
                  </button>
                  {noteMsg && (
                    <span className={`text-xs ${noteMsg.startsWith("Hata") ? "text-red-600" : "text-green-600"}`}>
                      {noteMsg}
                    </span>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
