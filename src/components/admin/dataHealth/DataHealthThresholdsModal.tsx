// src/components/admin/dataHealth/DataHealthThresholdsModal.tsx
// ⚙️ Eşik Ayarları: data_health_providers satırlarını düzenle/ekle.
// Ayrıca tesis→sağlayıcı eşlemesini SALT-OKUNUR gösterir — gerçek kaynak
// owner_subscriptions.provider olduğundan düzenleme Owner Subscriptions
// admin sayfasında yapılır. <form> yok; tümü onClick.
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Plus, Save, ExternalLink } from "lucide-react";
import { supabase } from "@/lib/supabase";
import Modal from "./Modal";
import type { DataHealthProvider } from "@/lib/dataHealth";

type Draft = {
  display_name: string;
  system_type: string;
  expected_period_hours: string;
  healthy_threshold_hours: string;
  warning_threshold_hours: string;
};

type FacilityRow = {
  subscription_serno: number;
  title: string | null;
  provider: string | null;
};

const emptyNew = {
  provider_key: "",
  display_name: "",
  system_type: "",
  expected_period_hours: "24",
  healthy_threshold_hours: "30",
  warning_threshold_hours: "48",
};

function toDraft(p: DataHealthProvider): Draft {
  return {
    display_name: p.display_name ?? "",
    system_type: p.system_type ?? "",
    expected_period_hours: String(p.expected_period_hours ?? ""),
    healthy_threshold_hours: String(p.healthy_threshold_hours ?? ""),
    warning_threshold_hours: String(p.warning_threshold_hours ?? ""),
  };
}

export default function DataHealthThresholdsModal({
  onClose,
  onChanged,
}: {
  onClose: () => void;
  onChanged: () => void;
}) {
  const [providers, setProviders] = useState<DataHealthProvider[]>([]);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [facilities, setFacilities] = useState<FacilityRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [newRow, setNewRow] = useState({ ...emptyNew });
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  async function load() {
    setLoading(true);
    const [pRes, fRes] = await Promise.all([
      supabase.from("data_health_providers").select("*").order("system_type").order("provider_key"),
      supabase
        .from("owner_subscriptions")
        .select("subscription_serno, title, provider")
        .order("subscription_serno", { ascending: true }),
    ]);
    const p = (pRes.data ?? []) as DataHealthProvider[];
    setProviders(p);
    setDrafts(Object.fromEntries(p.map((x) => [x.id, toDraft(x)])));
    setFacilities((fRes.data ?? []) as FacilityRow[]);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  function setDraftField(id: string, key: keyof Draft, value: string) {
    setDrafts((prev) => ({ ...prev, [id]: { ...prev[id], [key]: value } }));
  }

  function parseNumOrNull(s: string): number | null {
    const n = Number(String(s).replace(",", "."));
    return Number.isFinite(n) ? n : null;
  }

  async function saveRow(p: DataHealthProvider) {
    const d = drafts[p.id];
    if (!d) return;
    const period = parseNumOrNull(d.expected_period_hours);
    const healthy = parseNumOrNull(d.healthy_threshold_hours);
    const warning = parseNumOrNull(d.warning_threshold_hours);
    if (!d.display_name.trim() || period == null || healthy == null || warning == null) {
      setMsg({ kind: "err", text: "Görünen ad ve sayısal eşikler zorunlu." });
      return;
    }
    setBusyId(p.id);
    setMsg(null);
    const { error } = await supabase
      .from("data_health_providers")
      .update({
        display_name: d.display_name.trim(),
        system_type: d.system_type.trim() || null,
        expected_period_hours: period,
        healthy_threshold_hours: healthy,
        warning_threshold_hours: warning,
      })
      .eq("id", p.id);
    setBusyId(null);
    if (error) {
      setMsg({ kind: "err", text: error.message });
      return;
    }
    setMsg({ kind: "ok", text: `${p.provider_key} güncellendi.` });
    await load();
    onChanged();
  }

  async function addRow() {
    const period = parseNumOrNull(newRow.expected_period_hours);
    const healthy = parseNumOrNull(newRow.healthy_threshold_hours);
    const warning = parseNumOrNull(newRow.warning_threshold_hours);
    if (!newRow.provider_key.trim() || !newRow.display_name.trim() || period == null || healthy == null || warning == null) {
      setMsg({ kind: "err", text: "provider_key, görünen ad ve sayısal eşikler zorunlu." });
      return;
    }
    setBusyId("__new__");
    setMsg(null);
    const { error } = await supabase.from("data_health_providers").insert({
      provider_key: newRow.provider_key.trim(),
      display_name: newRow.display_name.trim(),
      system_type: newRow.system_type.trim() || null,
      expected_period_hours: period,
      healthy_threshold_hours: healthy,
      warning_threshold_hours: warning,
    });
    setBusyId(null);
    if (error) {
      setMsg({ kind: "err", text: error.message });
      return;
    }
    setMsg({ kind: "ok", text: `${newRow.provider_key} eklendi.` });
    setNewRow({ ...emptyNew });
    setAdding(false);
    await load();
    onChanged();
  }

  // Hangi provider_key'lerin config karşılığı var
  const configuredKeys = new Set(providers.map((p) => p.provider_key));
  const unmatchedFacilities = facilities.filter(
    (f) => !f.provider || !configuredKeys.has(f.provider)
  );

  const inputCls =
    "w-full rounded-lg border border-neutral-300 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-[#0A66FF]/30";

  return (
    <Modal title="Eşik Ayarları" subtitle="Sağlayıcı kadansları ve uyarı eşikleri" onClose={onClose} maxWidth="max-w-5xl">
      {msg && (
        <div
          className={`mb-4 rounded-lg px-3 py-2 text-sm ${
            msg.kind === "ok" ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200" : "bg-red-50 text-red-700 ring-1 ring-red-200"
          }`}
        >
          {msg.text}
        </div>
      )}

      {/* Bölüm 1: Sağlayıcı eşikleri */}
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold text-neutral-800">Sağlayıcı Eşikleri</h3>
        <button
          type="button"
          onClick={() => setAdding((v) => !v)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-[#0A66FF]/30 bg-[#0A66FF]/5 px-2.5 py-1 text-xs font-medium text-[#0A66FF] hover:bg-[#0A66FF]/10"
        >
          <Plus size={14} /> Yeni Sağlayıcı
        </button>
      </div>

      {loading ? (
        <p className="text-sm text-neutral-500 py-8 text-center">Yükleniyor…</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-neutral-200">
          <table className="w-full text-sm">
            <thead className="bg-neutral-50 text-xs text-neutral-500">
              <tr>
                <th className="text-left font-medium px-3 py-2">provider_key</th>
                <th className="text-left font-medium px-3 py-2">Görünen Ad</th>
                <th className="text-left font-medium px-3 py-2">Sistem</th>
                <th className="text-right font-medium px-3 py-2">Periyot (s)</th>
                <th className="text-right font-medium px-3 py-2">Sağlıklı (&lt;s)</th>
                <th className="text-right font-medium px-3 py-2">Uyarı (&lt;s)</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {providers.map((p) => {
                const d = drafts[p.id];
                if (!d) return null;
                return (
                  <tr key={p.id} className="border-t border-neutral-100">
                    <td className="px-3 py-2 font-mono text-xs text-neutral-600">{p.provider_key}</td>
                    <td className="px-3 py-2 min-w-[160px]">
                      <input className={inputCls} value={d.display_name} onChange={(e) => setDraftField(p.id, "display_name", e.target.value)} />
                    </td>
                    <td className="px-3 py-2 w-28">
                      <input className={inputCls} value={d.system_type} placeholder="aril / gridbox" onChange={(e) => setDraftField(p.id, "system_type", e.target.value)} />
                    </td>
                    <td className="px-3 py-2 w-24">
                      <input className={`${inputCls} text-right`} inputMode="decimal" value={d.expected_period_hours} onChange={(e) => setDraftField(p.id, "expected_period_hours", e.target.value)} />
                    </td>
                    <td className="px-3 py-2 w-24">
                      <input className={`${inputCls} text-right`} inputMode="decimal" value={d.healthy_threshold_hours} onChange={(e) => setDraftField(p.id, "healthy_threshold_hours", e.target.value)} />
                    </td>
                    <td className="px-3 py-2 w-24">
                      <input className={`${inputCls} text-right`} inputMode="decimal" value={d.warning_threshold_hours} onChange={(e) => setDraftField(p.id, "warning_threshold_hours", e.target.value)} />
                    </td>
                    <td className="px-3 py-2 text-right">
                      <button
                        type="button"
                        onClick={() => saveRow(p)}
                        disabled={busyId === p.id}
                        className="inline-flex items-center gap-1 rounded-lg bg-[#0A66FF] px-2.5 py-1 text-xs font-medium text-white hover:bg-[#0A66FF]/90 disabled:opacity-50"
                      >
                        <Save size={13} /> {busyId === p.id ? "…" : "Kaydet"}
                      </button>
                    </td>
                  </tr>
                );
              })}

              {adding && (
                <tr className="border-t border-neutral-200 bg-[#0A66FF]/5">
                  <td className="px-3 py-2">
                    <input className={`${inputCls} font-mono`} value={newRow.provider_key} placeholder="örn. uludag" onChange={(e) => setNewRow((r) => ({ ...r, provider_key: e.target.value }))} />
                  </td>
                  <td className="px-3 py-2">
                    <input className={inputCls} value={newRow.display_name} placeholder="Görünen ad" onChange={(e) => setNewRow((r) => ({ ...r, display_name: e.target.value }))} />
                  </td>
                  <td className="px-3 py-2">
                    <input className={inputCls} value={newRow.system_type} placeholder="aril / gridbox" onChange={(e) => setNewRow((r) => ({ ...r, system_type: e.target.value }))} />
                  </td>
                  <td className="px-3 py-2">
                    <input className={`${inputCls} text-right`} inputMode="decimal" value={newRow.expected_period_hours} onChange={(e) => setNewRow((r) => ({ ...r, expected_period_hours: e.target.value }))} />
                  </td>
                  <td className="px-3 py-2">
                    <input className={`${inputCls} text-right`} inputMode="decimal" value={newRow.healthy_threshold_hours} onChange={(e) => setNewRow((r) => ({ ...r, healthy_threshold_hours: e.target.value }))} />
                  </td>
                  <td className="px-3 py-2">
                    <input className={`${inputCls} text-right`} inputMode="decimal" value={newRow.warning_threshold_hours} onChange={(e) => setNewRow((r) => ({ ...r, warning_threshold_hours: e.target.value }))} />
                  </td>
                  <td className="px-3 py-2 text-right">
                    <button
                      type="button"
                      onClick={addRow}
                      disabled={busyId === "__new__"}
                      className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
                    >
                      <Plus size={13} /> {busyId === "__new__" ? "…" : "Ekle"}
                    </button>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Bölüm 2: Tesis → Sağlayıcı (salt-okunur) */}
      <div className="flex items-center justify-between mt-7 mb-2">
        <h3 className="text-sm font-semibold text-neutral-800">Tesis → Sağlayıcı Eşlemesi</h3>
        <Link
          to="/dashboard/admin/owner-subscriptions"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-[#0A66FF] hover:underline"
        >
          Owner Subscriptions'ta düzenle <ExternalLink size={13} />
        </Link>
      </div>
      <p className="text-xs text-neutral-500 mb-2">
        Eşleme kaynağı <span className="font-mono">owner_subscriptions.provider</span> kolonudur (salt-okunur).
        {unmatchedFacilities.length > 0 && (
          <span className="text-amber-700">
            {" "}
            {unmatchedFacilities.length} tesisin sağlayıcısı için eşik tanımı yok (Eşleşmemiş).
          </span>
        )}
      </p>

      {!loading && (
        <div className="overflow-x-auto rounded-xl border border-neutral-200 max-h-64 overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="bg-neutral-50 text-xs text-neutral-500 sticky top-0">
              <tr>
                <th className="text-left font-medium px-3 py-2">SerNo</th>
                <th className="text-left font-medium px-3 py-2">Tesis</th>
                <th className="text-left font-medium px-3 py-2">provider</th>
                <th className="text-left font-medium px-3 py-2">Eşik tanımı</th>
              </tr>
            </thead>
            <tbody>
              {facilities.map((f) => {
                const matched = f.provider && configuredKeys.has(f.provider);
                return (
                  <tr key={f.subscription_serno} className="border-t border-neutral-100">
                    <td className="px-3 py-2 font-mono text-xs">{f.subscription_serno}</td>
                    <td className="px-3 py-2">{f.title || "—"}</td>
                    <td className="px-3 py-2 font-mono text-xs">{f.provider || "—"}</td>
                    <td className="px-3 py-2">
                      {matched ? (
                        <span className="text-emerald-700 text-xs">var</span>
                      ) : (
                        <span className="text-amber-700 text-xs">Eşleşmemiş</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Modal>
  );
}
