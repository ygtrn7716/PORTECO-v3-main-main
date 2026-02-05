import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useSession } from "@/hooks/useSession";

type PhoneRow = {
  id: string;
  phone_number: string;
  label: string;
  is_active: boolean;
  receive_warnings: boolean;
  receive_alerts: boolean;
};

const PHONE_REGEX = /^(\+90|0)?[5][0-9]{9}$/;

function normalizePhone(raw: string): string {
  const digits = raw.replace(/[\s\-()]/g, "");
  if (digits.startsWith("+90")) return digits;
  if (digits.startsWith("90") && digits.length === 12) return "+" + digits;
  if (digits.startsWith("0") && digits.length === 11) return "+90" + digits.slice(1);
  if (digits.length === 10 && digits.startsWith("5")) return "+90" + digits;
  return digits;
}

function isValidTurkishPhone(raw: string): boolean {
  const normalized = normalizePhone(raw).replace("+90", "0");
  return PHONE_REGEX.test(normalized);
}

export default function PhoneNumberManager() {
  const { session } = useSession();
  const uid = session?.user?.id ?? null;

  const [phones, setPhones] = useState<PhoneRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Yeni numara formu
  const [newNumber, setNewNumber] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  // Toggle kaydetme durumu
  const [savingId, setSavingId] = useState<string | null>(null);

  async function fetchPhones() {
    if (!uid) return;
    setLoading(true);
    setError(null);

    const { data, error: err } = await supabase
      .from("user_phone_numbers")
      .select("id, phone_number, label, is_active, receive_warnings, receive_alerts")
      .eq("user_id", uid)
      .order("created_at", { ascending: true });

    if (err) {
      console.error("[PhoneNumberManager]", err.message);
      setError("Telefon numaraları yüklenirken bir hata oluştu.");
    } else {
      setPhones((data as PhoneRow[]) ?? []);
    }
    setLoading(false);
  }

  useEffect(() => {
    void fetchPhones();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid]);

  async function handleAdd() {
    if (!uid) return;
    setAddError(null);

    const trimmed = newNumber.trim();
    if (!trimmed) {
      setAddError("Telefon numarası boş olamaz.");
      return;
    }
    if (!isValidTurkishPhone(trimmed)) {
      setAddError("Geçerli bir Türkiye cep telefonu numarası girin. (5XX XXX XX XX)");
      return;
    }

    const normalized = normalizePhone(trimmed);

    setAdding(true);
    const { error: insErr } = await supabase.from("user_phone_numbers").insert({
      user_id: uid,
      phone_number: normalized,
      label: newLabel.trim() || "Birincil",
    });

    if (insErr) {
      if (insErr.code === "23505") {
        setAddError("Bu numara zaten kayıtlı.");
      } else {
        setAddError(insErr.message);
      }
    } else {
      setNewNumber("");
      setNewLabel("");
      await fetchPhones();
    }
    setAdding(false);
  }

  async function handleDelete(id: string) {
    if (!confirm("Bu telefon numarasını silmek istediğinize emin misiniz?")) return;

    const { error: delErr } = await supabase
      .from("user_phone_numbers")
      .delete()
      .eq("id", id);

    if (delErr) {
      setError(delErr.message);
    } else {
      setPhones((prev) => prev.filter((p) => p.id !== id));
    }
  }

  async function handleToggle(id: string, field: "is_active" | "receive_warnings" | "receive_alerts", value: boolean) {
    setSavingId(id);
    const { error: updErr } = await supabase
      .from("user_phone_numbers")
      .update({ [field]: value })
      .eq("id", id);

    if (updErr) {
      setError(updErr.message);
    } else {
      setPhones((prev) =>
        prev.map((p) => (p.id === id ? { ...p, [field]: value } : p))
      );
    }
    setSavingId(null);
  }

  if (!uid) return null;

  return (
    <section className="rounded-2xl border bg-white p-6 shadow-sm">
      <div className="mb-4">
        <h2 className="text-base font-semibold">SMS Bildirim Ayarları</h2>
        <p className="text-sm text-neutral-500">
          Reaktif enerji uyarılarını almak istediğiniz telefon numaralarını yönetin.
        </p>
      </div>

      {error && (
        <div className="mb-3 rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Kayıtlı numaralar */}
      {loading ? (
        <p className="text-sm text-neutral-500">Yükleniyor...</p>
      ) : phones.length === 0 ? (
        <p className="text-sm text-neutral-500 mb-4">
          Henüz kayıtlı telefon numarası yok.
        </p>
      ) : (
        <div className="space-y-3 mb-6">
          {phones.map((p) => {
            const isSaving = savingId === p.id;
            return (
              <div
                key={p.id}
                className={`rounded-xl border px-4 py-3 ${
                  p.is_active ? "bg-white" : "bg-neutral-50 opacity-70"
                }`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                  <div>
                    <span className="font-medium text-neutral-900">
                      {p.phone_number}
                    </span>
                    <span className="ml-2 text-xs text-neutral-500 bg-neutral-100 rounded-full px-2 py-0.5">
                      {p.label}
                    </span>
                  </div>
                  <button
                    onClick={() => handleDelete(p.id)}
                    className="text-xs text-red-500 hover:text-red-700"
                  >
                    Sil
                  </button>
                </div>

                <div className="flex flex-wrap gap-4 text-sm">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={p.is_active}
                      disabled={isSaving}
                      onChange={(e) => handleToggle(p.id, "is_active", e.target.checked)}
                      className="accent-[#0A66FF]"
                    />
                    <span className="text-neutral-700">Aktif</span>
                  </label>

                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={p.receive_warnings}
                      disabled={isSaving || !p.is_active}
                      onChange={(e) => handleToggle(p.id, "receive_warnings", e.target.checked)}
                      className="accent-amber-500"
                    />
                    <span className="text-neutral-700">Uyarılar (Sarı Bölge)</span>
                  </label>

                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={p.receive_alerts}
                      disabled={isSaving || !p.is_active}
                      onChange={(e) => handleToggle(p.id, "receive_alerts", e.target.checked)}
                      className="accent-red-500"
                    />
                    <span className="text-neutral-700">Alarmlar (Kırmızı Bölge)</span>
                  </label>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Yeni numara ekleme */}
      <div className="rounded-xl border bg-neutral-50 px-4 py-4">
        <h3 className="text-sm font-medium text-neutral-700 mb-3">Yeni Numara Ekle</h3>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex-1">
            <label className="text-xs text-neutral-500 mb-1 block">
              Telefon Numarası
            </label>
            <input
              type="tel"
              value={newNumber}
              onChange={(e) => setNewNumber(e.target.value)}
              placeholder="05XX XXX XX XX"
              className="w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0A66FF]/70"
            />
          </div>

          <div className="sm:w-40">
            <label className="text-xs text-neutral-500 mb-1 block">
              Etiket
            </label>
            <input
              type="text"
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              placeholder="Birincil"
              className="w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0A66FF]/70"
            />
          </div>

          <button
            onClick={handleAdd}
            disabled={adding}
            className="inline-flex items-center justify-center rounded-lg bg-[#0A66FF] px-4 py-2 text-sm font-medium text-white shadow-sm disabled:opacity-60"
          >
            {adding ? "Ekleniyor..." : "Ekle"}
          </button>
        </div>

        {addError && (
          <p className="mt-2 text-xs text-red-500">{addError}</p>
        )}
      </div>
    </section>
  );
}
