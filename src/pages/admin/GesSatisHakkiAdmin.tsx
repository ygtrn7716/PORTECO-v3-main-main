import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Pencil, Save, X } from "lucide-react";

type Row = {
  user_id: string;
  subscription_serno: number;
  title: string | null;
  credential_id: string;
  max_satis_kwh: number | null;
  aciklama: string | null;
  satis_hakki_id: string | null;
};

export default function GesSatisHakkiAdmin() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Inline editing
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editKwh, setEditKwh] = useState("");
  const [editAciklama, setEditAciklama] = useState("");
  const [saving, setSaving] = useState(false);

  const rowKey = (r: Row) => `${r.user_id}:${r.subscription_serno}`;

  const fetchData = async () => {
    setLoading(true);
    setError(null);

    // 1) GES entegrasyonu olan aktif kullanıcılar
    const { data: creds, error: credErr } = await supabase
      .from("ges_credentials")
      .select("id, user_id")
      .eq("is_active", true);

    if (credErr) {
      setError(credErr.message);
      setLoading(false);
      return;
    }
    if (!creds?.length) {
      setRows([]);
      setLoading(false);
      return;
    }

    const userIds = [...new Set(creds.map((c) => c.user_id))];
    const credMap = new Map(creds.map((c) => [c.user_id, c.id]));

    // 2) Bu kullanıcıların tesisleri
    const { data: subs, error: subErr } = await supabase
      .from("owner_subscriptions")
      .select("user_id, subscription_serno, title")
      .in("user_id", userIds);

    if (subErr) {
      setError(subErr.message);
      setLoading(false);
      return;
    }

    // 3) Mevcut satış hakkı kayıtları
    const { data: haklar, error: hakErr } = await supabase
      .from("ges_satis_hakki")
      .select("id, user_id, subscription_serno, max_satis_kwh, aciklama")
      .in("user_id", userIds);

    if (hakErr) {
      setError(hakErr.message);
      setLoading(false);
      return;
    }

    // Birleştir
    const hakMap = new Map(
      (haklar ?? []).map((h) => [`${h.user_id}:${h.subscription_serno}`, h]),
    );

    const merged: Row[] = (subs ?? []).map((s) => {
      const key = `${s.user_id}:${s.subscription_serno}`;
      const hak = hakMap.get(key);
      return {
        user_id: s.user_id,
        subscription_serno: s.subscription_serno,
        title: s.title,
        credential_id: credMap.get(s.user_id) ?? "",
        max_satis_kwh: hak?.max_satis_kwh ?? null,
        aciklama: hak?.aciklama ?? null,
        satis_hakki_id: hak?.id ?? null,
      };
    });

    merged.sort((a, b) => a.subscription_serno - b.subscription_serno);
    setRows(merged);
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, []);

  const startEdit = (r: Row) => {
    setEditingKey(rowKey(r));
    setEditKwh(r.max_satis_kwh != null ? String(r.max_satis_kwh) : "");
    setEditAciklama(r.aciklama ?? "");
  };

  const cancelEdit = () => {
    setEditingKey(null);
    setEditKwh("");
    setEditAciklama("");
  };

  const handleSave = async (r: Row) => {
    setSaving(true);
    const payload = {
      user_id: r.user_id,
      subscription_serno: r.subscription_serno,
      max_satis_kwh: editKwh.trim() === "" ? null : Number(editKwh),
      aciklama: editAciklama.trim() || null,
    };

    const { error: upsertErr } = await supabase
      .from("ges_satis_hakki")
      .upsert(payload, { onConflict: "user_id,subscription_serno" });

    setSaving(false);

    if (upsertErr) {
      alert("Kaydetme hatası: " + upsertErr.message);
      return;
    }

    setEditingKey(null);
    fetchData();
  };

  return (
    <div className="p-4 md:p-6 space-y-4">
      <h1 className="text-lg font-semibold text-neutral-900">GES Satış Hakkı</h1>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {loading ? (
        <p className="text-sm text-neutral-500">Yükleniyor...</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-neutral-500">GES entegrasyonu olan tesis bulunamadı.</p>
      ) : (
        <div className="rounded-2xl border border-neutral-200 bg-white shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-neutral-200 bg-neutral-50 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">
                  <th className="px-4 py-3">Tesis</th>
                  <th className="px-4 py-3 text-right">Max Satış (kWh)</th>
                  <th className="px-4 py-3">Açıklama</th>
                  <th className="px-4 py-3 w-24"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const key = rowKey(r);
                  const isEditing = editingKey === key;

                  return (
                    <tr
                      key={key}
                      className={`border-b border-neutral-100 transition-colors ${
                        isEditing ? "bg-emerald-50/40" : "hover:bg-neutral-50"
                      }`}
                    >
                      {/* Tesis bilgisi */}
                      <td className="px-4 py-3">
                        <div className="font-medium text-neutral-900">
                          {r.subscription_serno} – {r.title || "İsimsiz Tesis"}
                        </div>
                        <div className="text-xs text-neutral-400 mt-0.5">
                          # Credential: {r.credential_id.slice(0, 8)}
                        </div>
                      </td>

                      {/* Max Satış */}
                      <td className="px-4 py-3 text-right">
                        {isEditing ? (
                          <div className="flex items-center justify-end gap-1">
                            <input
                              type="number"
                              step="0.001"
                              value={editKwh}
                              onChange={(e) => setEditKwh(e.target.value)}
                              className="w-32 rounded-lg border border-neutral-300 px-2 py-1 text-right text-sm"
                              placeholder="0.000"
                              autoFocus
                            />
                            <span className="text-xs text-neutral-500">kWh</span>
                          </div>
                        ) : r.max_satis_kwh != null ? (
                          <span className="font-medium text-neutral-800">
                            {Number(r.max_satis_kwh).toLocaleString("tr-TR", {
                              maximumFractionDigits: 3,
                            })}{" "}
                            kWh
                          </span>
                        ) : (
                          <span className="inline-block rounded-full bg-neutral-100 px-2.5 py-0.5 text-xs font-medium text-neutral-500">
                            Tanımlı Değil
                          </span>
                        )}
                      </td>

                      {/* Açıklama */}
                      <td className="px-4 py-3">
                        {isEditing ? (
                          <input
                            type="text"
                            value={editAciklama}
                            onChange={(e) => setEditAciklama(e.target.value)}
                            className="w-full rounded-lg border border-neutral-300 px-2 py-1 text-sm"
                            placeholder="Opsiyonel not..."
                          />
                        ) : (
                          <span className="text-neutral-500">{r.aciklama || "—"}</span>
                        )}
                      </td>

                      {/* Aksiyonlar */}
                      <td className="px-4 py-3">
                        {isEditing ? (
                          <div className="flex items-center justify-end gap-1">
                            <button
                              type="button"
                              onClick={() => handleSave(r)}
                              disabled={saving}
                              className="rounded-lg bg-emerald-600 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50 transition-colors"
                            >
                              <Save size={14} />
                            </button>
                            <button
                              type="button"
                              onClick={cancelEdit}
                              disabled={saving}
                              className="rounded-lg bg-neutral-200 px-2.5 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-300 disabled:opacity-50 transition-colors"
                            >
                              <X size={14} />
                            </button>
                          </div>
                        ) : (
                          <div className="flex justify-end">
                            <button
                              type="button"
                              onClick={() => startEdit(r)}
                              className="rounded-lg border border-neutral-200 bg-white px-2.5 py-1.5 text-xs font-medium text-neutral-600 hover:bg-neutral-50 transition-colors"
                            >
                              <Pencil size={14} />
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
