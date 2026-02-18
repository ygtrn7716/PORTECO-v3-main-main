import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useSession } from "@/hooks/useSession";

type EmailRow = {
  id: string;
  email: string;
  label: string;
  is_active: boolean;
  receive_warnings: boolean;
  receive_alerts: boolean;
};

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function EmailManager() {
  const { session } = useSession();
  const uid = session?.user?.id ?? null;

  const [emails, setEmails] = useState<EmailRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [newEmail, setNewEmail] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  const [savingId, setSavingId] = useState<string | null>(null);

  async function fetchEmails() {
    if (!uid) return;
    setLoading(true);
    setError(null);

    const { data, error: err } = await supabase
      .from("user_emails")
      .select("id, email, label, is_active, receive_warnings, receive_alerts")
      .eq("user_id", uid)
      .order("created_at", { ascending: true });

    if (err) {
      console.error("[EmailManager]", err.message);
      setError("Email adresleri yuklenirken bir hata olustu.");
    } else {
      setEmails((data as EmailRow[]) ?? []);
    }
    setLoading(false);
  }

  useEffect(() => {
    void fetchEmails();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid]);

  async function handleAdd() {
    if (!uid) return;
    setAddError(null);

    const trimmed = newEmail.trim().toLowerCase();
    if (!trimmed) {
      setAddError("Email adresi bos olamaz.");
      return;
    }
    if (!EMAIL_REGEX.test(trimmed)) {
      setAddError("Gecerli bir email adresi girin.");
      return;
    }

    setAdding(true);
    const { error: insErr } = await supabase.from("user_emails").insert({
      user_id: uid,
      email: trimmed,
      label: newLabel.trim() || "Birincil",
    });

    if (insErr) {
      if (insErr.code === "23505") {
        setAddError("Bu email adresi zaten kayitli.");
      } else {
        setAddError(insErr.message);
      }
    } else {
      setNewEmail("");
      setNewLabel("");
      await fetchEmails();
    }
    setAdding(false);
  }

  async function handleDelete(id: string) {
    if (!confirm("Bu email adresini silmek istediginize emin misiniz?")) return;

    const { error: delErr } = await supabase
      .from("user_emails")
      .delete()
      .eq("id", id);

    if (delErr) {
      setError(delErr.message);
    } else {
      setEmails((prev) => prev.filter((e) => e.id !== id));
    }
  }

  async function handleToggle(id: string, field: "is_active" | "receive_warnings" | "receive_alerts", value: boolean) {
    setSavingId(id);
    const { error: updErr } = await supabase
      .from("user_emails")
      .update({ [field]: value })
      .eq("id", id);

    if (updErr) {
      setError(updErr.message);
    } else {
      setEmails((prev) =>
        prev.map((e) => (e.id === id ? { ...e, [field]: value } : e))
      );
    }
    setSavingId(null);
  }

  if (!uid) return null;

  return (
    <section className="rounded-2xl border bg-white p-6 shadow-sm">
      <div className="mb-4">
        <h2 className="text-base font-semibold">Email Bildirim Ayarlari</h2>
        <p className="text-sm text-neutral-500">
          Reaktif enerji uyarilarini almak istediginiz email adreslerini yonetin.
        </p>
      </div>

      {error && (
        <div className="mb-3 rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      {loading ? (
        <p className="text-sm text-neutral-500">Yukleniyor...</p>
      ) : emails.length === 0 ? (
        <p className="text-sm text-neutral-500 mb-4">
          Henuz kayitli email adresi yok.
        </p>
      ) : (
        <div className="space-y-3 mb-6">
          {emails.map((e) => {
            const isSaving = savingId === e.id;
            return (
              <div
                key={e.id}
                className={`rounded-xl border px-4 py-3 ${
                  e.is_active ? "bg-white" : "bg-neutral-50 opacity-70"
                }`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                  <div>
                    <span className="font-medium text-neutral-900">
                      {e.email}
                    </span>
                    <span className="ml-2 text-xs text-neutral-500 bg-neutral-100 rounded-full px-2 py-0.5">
                      {e.label}
                    </span>
                  </div>
                  <button
                    onClick={() => handleDelete(e.id)}
                    className="text-xs text-red-500 hover:text-red-700"
                  >
                    Sil
                  </button>
                </div>

                <div className="flex flex-wrap gap-4 text-sm">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={e.is_active}
                      disabled={isSaving}
                      onChange={(ev) => handleToggle(e.id, "is_active", ev.target.checked)}
                      className="accent-[#0A66FF]"
                    />
                    <span className="text-neutral-700">Aktif</span>
                  </label>

                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={e.receive_warnings}
                      disabled={isSaving || !e.is_active}
                      onChange={(ev) => handleToggle(e.id, "receive_warnings", ev.target.checked)}
                      className="accent-amber-500"
                    />
                    <span className="text-neutral-700">Uyarilar (Sari Bolge)</span>
                  </label>

                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={e.receive_alerts}
                      disabled={isSaving || !e.is_active}
                      onChange={(ev) => handleToggle(e.id, "receive_alerts", ev.target.checked)}
                      className="accent-red-500"
                    />
                    <span className="text-neutral-700">Alarmlar (Kirmizi Bolge)</span>
                  </label>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="rounded-xl border bg-neutral-50 px-4 py-4">
        <h3 className="text-sm font-medium text-neutral-700 mb-3">Yeni Email Ekle</h3>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex-1">
            <label className="text-xs text-neutral-500 mb-1 block">
              Email Adresi
            </label>
            <input
              type="email"
              value={newEmail}
              onChange={(ev) => setNewEmail(ev.target.value)}
              placeholder="ornek@email.com"
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
              onChange={(ev) => setNewLabel(ev.target.value)}
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
