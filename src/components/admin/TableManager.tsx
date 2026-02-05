import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";

type ColType = "text" | "number" | "bool" | "enum" | "uuid";

export type ColumnDef = {
  key: string;
  label: string;
  type: ColType;
  readOnly?: boolean;
  options?: string[];
  hideInTable?: boolean;
  mask?: boolean;

  multiline?: boolean;
  rows?: number;

  // slug otomatik doldurma (inline edit)
  autoSlugFrom?: string; // örn: "title"
};

function slugifyTR(s: string) {
  return (s ?? "")
    .toLowerCase()
    .trim()
    .replace(/ğ/g, "g")
    .replace(/ü/g, "u")
    .replace(/ş/g, "s")
    .replace(/ı/g, "i")
    .replace(/ö/g, "o")
    .replace(/ç/g, "c")
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

export type FilterDef = {
  key: string;
  label: string;
  type: "user_id" | "subscription_serno" | "text" | "date_range" | "period_month" | "period_year";
};

export type TableConfig = {
  title: string;
  table: string;
  matchKeys: string[];
  orderBy?: { key: string; asc?: boolean };
  columns: ColumnDef[];
  filters?: FilterDef[];
  pageSize?: number;
  readOnly?: boolean;
};

function toPatchValue(type: ColType, v: any) {
  if (type === "bool") return !!v;
  if (type === "number") {
    if (v === "" || v == null) return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  if (v === "" || v == null) return null;
  return v;
}

export default function TableManager({ cfg }: { cfg: TableConfig }) {
  const pageSize = cfg.pageSize ?? 100;
  const isReadOnly = cfg.readOnly ?? false;

  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  // filters
  const [userId, setUserId] = useState<string>("");
  const [serno, setSerno] = useState<string>("");
  const [q, setQ] = useState<string>("");
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");
  const [periodMonth, setPeriodMonth] = useState<string>("");
  const [periodYear, setPeriodYear] = useState<string>("");
  const [page, setPage] = useState(1);

  const [users, setUsers] = useState<{ user_id: string; email: string | null }[]>([]);

  const hasUserFilter = useMemo(
    () => (cfg.filters ?? []).some((f) => f.type === "user_id"),
    [cfg.filters]
  );
  const hasSernoFilter = useMemo(
    () => (cfg.filters ?? []).some((f) => f.type === "subscription_serno"),
    [cfg.filters]
  );
  const dateRangeFilter = useMemo(
    () => (cfg.filters ?? []).find((f) => f.type === "date_range"),
    [cfg.filters]
  );
  const monthFilter = useMemo(
    () => (cfg.filters ?? []).find((f) => f.type === "period_month"),
    [cfg.filters]
  );
  const yearFilter = useMemo(
    () => (cfg.filters ?? []).find((f) => f.type === "period_year"),
    [cfg.filters]
  );

  useEffect(() => {
    if (!hasUserFilter) return;
    let mounted = true;
    (async () => {
      const { data, error } = await supabase
        .from("user_integrations")
        .select("user_id,aril_user")
        .order("aril_user", { ascending: true })
        .limit(5000);

      if (!mounted) return;
      if (error) console.error("[user_integrations]", error.message);
      setUsers(
        ((data as any[]) ?? []).map((r: any) => ({
          user_id: r.user_id,
          email: r.aril_user,
        }))
      );
    })();
    return () => {
      mounted = false;
    };
  }, [hasUserFilter]);

  async function fetchRows() {
    setLoading(true);
    setErr(null);

    let qb: any = supabase.from(cfg.table).select("*", { count: "exact" });

    if (hasUserFilter && userId) qb = qb.eq("user_id", userId);
    if (hasSernoFilter && serno) qb = qb.eq("subscription_serno", Number(serno));

    // ✅ text search: cfg.filters içinde type:"text" olan ilk key üzerinden arar
    if (q) {
      const textFilterKey = (cfg.filters ?? []).find((f) => f.type === "text")?.key;
      if (textFilterKey) qb = qb.ilike(textFilterKey, `%${q}%`);
    }

    // ✅ date_range filter
    if (dateRangeFilter) {
      if (dateFrom) qb = qb.gte(dateRangeFilter.key, dateFrom);
      if (dateTo) qb = qb.lt(dateRangeFilter.key, dateTo);
    }

    // ✅ period_month filter
    if (monthFilter && periodMonth) {
      qb = qb.eq(monthFilter.key, Number(periodMonth));
    }

    // ✅ period_year filter
    if (yearFilter && periodYear) {
      qb = qb.eq(yearFilter.key, Number(periodYear));
    }

    if (cfg.orderBy?.key) qb = qb.order(cfg.orderBy.key, { ascending: cfg.orderBy.asc ?? true });

    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;
    qb = qb.range(from, to);

    const { data, error } = await qb;
    if (error) {
      setErr(error.message);
      setRows([]);
    } else {
      setRows((data as any[]) ?? []);
    }
    setLoading(false);
  }

  useEffect(() => {
    fetchRows();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cfg.table, userId, serno, q, dateFrom, dateTo, periodMonth, periodYear, page]);

  function rowKey(r: any) {
    return cfg.matchKeys.map((k) => String(r?.[k] ?? "")).join("|");
  }

  function buildMatch(r: any) {
    const m: any = {};
    for (const k of cfg.matchKeys) m[k] = r[k];
    return m;
  }

  async function saveRow(r: any, edited: any) {
    const key = rowKey(r);
    setSavingKey(key);
    setErr(null);

    const patch: any = {};
    for (const col of cfg.columns) {
      if (col.readOnly) continue;
      if (!(col.key in edited)) continue;

      if (col.mask && (edited[col.key] == null || edited[col.key] === "")) continue;

      const v = toPatchValue(col.type, edited[col.key]);
      if (v !== r[col.key]) patch[col.key] = v;
    }

    if (Object.keys(patch).length === 0) {
      setSavingKey(null);
      return;
    }

    const { error } = await supabase.from(cfg.table).update(patch).match(buildMatch(r));
    if (error) setErr(error.message);
    setSavingKey(null);
    await fetchRows();
  }

  async function deleteRow(r: any) {
    if (!confirm("Bu satır silinsin mi?")) return;
    setErr(null);
    const { error } = await supabase.from(cfg.table).delete().match(buildMatch(r));
    if (error) setErr(error.message);
    await fetchRows();
  }

  // inline editing state
  const [editMap, setEditMap] = useState<Record<string, any>>({});

  function setEdit(r: any, key: string, value: any) {
    const rk = rowKey(r);

    setEditMap((prev) => {
      const nextRow = { ...(prev[rk] ?? {}), [key]: value };

      // ✅ autoSlugFrom: örn title değişince slug üret
      const slugCol = cfg.columns.find((c) => c.key === "slug" && c.autoSlugFrom === key);
      if (slugCol) {
        const currentSlug = String(nextRow["slug"] ?? r["slug"] ?? "");
        if (!currentSlug) nextRow["slug"] = slugifyTR(String(value ?? ""));
      }

      return { ...prev, [rk]: nextRow };
    });
  }

  // insert modal
  const [showNew, setShowNew] = useState(false);
  const [newRow, setNewRow] = useState<any>({});

  // ✅ New modalda title yazınca slug üretelim (opsiyonel ama aşırı iyi)
  function setNewField(key: string, value: any) {
    setNewRow((prev: any) => {
      const next = { ...prev, [key]: value };

      const slugCol = cfg.columns.find((c) => c.key === "slug" && c.autoSlugFrom === key);
      if (slugCol) {
        const currentSlug = String(next["slug"] ?? "");
        if (!currentSlug) next["slug"] = slugifyTR(String(value ?? ""));
      }

      return next;
    });
  }

  async function insertRow() {
    setErr(null);
    const payload: any = {};
    for (const col of cfg.columns) {
      if (col.readOnly) continue;
      if (!(col.key in newRow)) continue;
      const v = toPatchValue(col.type, newRow[col.key]);
      if (col.mask && (newRow[col.key] == null || newRow[col.key] === "")) continue;
      payload[col.key] = v;
    }
    const { error } = await supabase.from(cfg.table).insert(payload);
    if (error) setErr(error.message);
    setShowNew(false);
    setNewRow({});
    await fetchRows();
  }

  const visibleCols = cfg.columns.filter((c) => !c.hideInTable);

  return (
    <div className="p-6">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">{cfg.title}</h1>
          <div className="text-sm text-neutral-500">{cfg.table}</div>
        </div>
        {!isReadOnly && (
          <button
            onClick={() => setShowNew(true)}
            className="rounded-xl bg-black px-4 py-2 text-white text-sm"
          >
            + Yeni Satır
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="mb-4 grid gap-3 md:grid-cols-3">
        {hasUserFilter && (
          <div className="rounded-xl border bg-white p-3">
            <div className="text-xs text-neutral-500 mb-1">User (auth)</div>
            <select
              className="w-full rounded-lg border px-3 py-2 text-sm"
              value={userId}
              onChange={(e) => {
                setPage(1);
                setUserId(e.target.value);
              }}
            >
              <option value="">Hepsi</option>
              {users.map((u) => (
                <option key={u.user_id} value={u.user_id}>
                  {u.email ?? u.user_id}
                </option>
              ))}
            </select>
          </div>
        )}

        {hasSernoFilter && (
          <div className="rounded-xl border bg-white p-3">
            <div className="text-xs text-neutral-500 mb-1">Subscription SerNo</div>
            <input
              className="w-full rounded-lg border px-3 py-2 text-sm"
              placeholder="örn: 516588"
              value={serno}
              onChange={(e) => {
                setPage(1);
                setSerno(e.target.value.replace(/[^\d]/g, ""));
              }}
            />
          </div>
        )}

        {yearFilter && (
          <div className="rounded-xl border bg-white p-3">
            <div className="text-xs text-neutral-500 mb-1">{yearFilter.label}</div>
            <select
              className="w-full rounded-lg border px-3 py-2 text-sm"
              value={periodYear}
              onChange={(e) => {
                setPage(1);
                setPeriodYear(e.target.value);
              }}
            >
              <option value="">Hepsi</option>
              {Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - i).map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </div>
        )}

        {monthFilter && (
          <div className="rounded-xl border bg-white p-3">
            <div className="text-xs text-neutral-500 mb-1">{monthFilter.label}</div>
            <select
              className="w-full rounded-lg border px-3 py-2 text-sm"
              value={periodMonth}
              onChange={(e) => {
                setPage(1);
                setPeriodMonth(e.target.value);
              }}
            >
              <option value="">Hepsi</option>
              {[
                { v: "1", l: "Ocak" },
                { v: "2", l: "Şubat" },
                { v: "3", l: "Mart" },
                { v: "4", l: "Nisan" },
                { v: "5", l: "Mayıs" },
                { v: "6", l: "Haziran" },
                { v: "7", l: "Temmuz" },
                { v: "8", l: "Ağustos" },
                { v: "9", l: "Eylül" },
                { v: "10", l: "Ekim" },
                { v: "11", l: "Kasım" },
                { v: "12", l: "Aralık" },
              ].map((m) => (
                <option key={m.v} value={m.v}>
                  {m.v} - {m.l}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="rounded-xl border bg-white p-3">
          <div className="text-xs text-neutral-500 mb-1">Arama</div>
          <input
            className="w-full rounded-lg border px-3 py-2 text-sm"
            placeholder="aranan..."
            value={q}
            onChange={(e) => {
              setPage(1);
              setQ(e.target.value);
            }}
          />
        </div>

        {dateRangeFilter && (
          <>
            <div className="rounded-xl border bg-white p-3">
              <div className="text-xs text-neutral-500 mb-1">Başlangıç</div>
              <input
                type="date"
                className="w-full rounded-lg border px-3 py-2 text-sm"
                value={dateFrom}
                onChange={(e) => {
                  setPage(1);
                  setDateFrom(e.target.value);
                }}
              />
            </div>
            <div className="rounded-xl border bg-white p-3">
              <div className="text-xs text-neutral-500 mb-1">Bitiş</div>
              <input
                type="date"
                className="w-full rounded-lg border px-3 py-2 text-sm"
                value={dateTo}
                onChange={(e) => {
                  setPage(1);
                  setDateTo(e.target.value);
                }}
              />
            </div>
          </>
        )}
      </div>

      {err && (
        <div className="mb-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {err}
        </div>
      )}

      {/* Table */}
      <div className="overflow-auto rounded-2xl border bg-white">
        <table className="min-w-[1100px] w-full text-sm">
          <thead className="bg-neutral-50">
            <tr>
              {visibleCols.map((c) => (
                <th key={c.key} className="text-left font-medium px-3 py-2 border-b">
                  {c.label}
                </th>
              ))}
              {!isReadOnly && <th className="px-3 py-2 border-b"></th>}
            </tr>
          </thead>

          <tbody>
            {loading ? (
              <tr>
                <td className="px-3 py-6 text-neutral-500" colSpan={visibleCols.length + (isReadOnly ? 0 : 1)}>
                  Yükleniyor…
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td className="px-3 py-6 text-neutral-500" colSpan={visibleCols.length + (isReadOnly ? 0 : 1)}>
                  Kayıt yok.
                </td>
              </tr>
            ) : (
              rows.map((r) => {
                const rk = rowKey(r);
                const edited = editMap[rk] ?? {};
                const isSaving = savingKey === rk;

                return (
                  <tr key={rk} className="border-b last:border-b-0">
                    {visibleCols.map((c) => {
                      const current = edited[c.key] ?? r[c.key] ?? "";
                      const disabled = !!c.readOnly || isReadOnly;

                      if (c.type === "bool") {
                        return (
                          <td key={c.key} className="px-3 py-2">
                            <input
                              type="checkbox"
                              checked={!!current}
                              disabled={disabled}
                              onChange={(e) => setEdit(r, c.key, e.target.checked)}
                            />
                          </td>
                        );
                      }

                      if (c.type === "enum" && c.options?.length) {
                        return (
                          <td key={c.key} className="px-3 py-2">
                            <select
                              className="w-full rounded-lg border px-2 py-1.5 text-sm"
                              value={String(current ?? "")}
                              disabled={disabled}
                              onChange={(e) => setEdit(r, c.key, e.target.value)}
                            >
                              <option value="">—</option>
                              {c.options.map((op) => (
                                <option key={op} value={op}>
                                  {op}
                                </option>
                              ))}
                            </select>
                          </td>
                        );
                      }

                      if (c.mask) {
                        return (
                          <td key={c.key} className="px-3 py-2">
                            <div className="flex items-center gap-2">
                              <span className="text-neutral-400">••••••</span>
                              <input
                                className="w-full rounded-lg border px-2 py-1.5 text-sm"
                                placeholder="Değiştirmek için yeni değer gir"
                                value={String(edited[c.key] ?? "")}
                                disabled={disabled}
                                onChange={(e) => setEdit(r, c.key, e.target.value)}
                              />
                            </div>
                          </td>
                        );
                      }

                      return (
                        <td key={c.key} className="px-3 py-2">
                          {c.multiline ? (
                            <textarea
                              className="w-full rounded-lg border px-2 py-1.5 text-sm"
                              rows={c.rows ?? 6}
                              value={String(current ?? "")}
                              disabled={disabled}
                              onChange={(e) => setEdit(r, c.key, e.target.value)}
                            />
                          ) : (
                            <input
                              className="w-full rounded-lg border px-2 py-1.5 text-sm"
                              type={c.type === "number" ? "number" : "text"}
                              value={String(current ?? "")}
                              disabled={disabled}
                              onChange={(e) => setEdit(r, c.key, e.target.value)}
                            />
                          )}
                        </td>
                      );
                    })}

                    {!isReadOnly && (
                      <td className="px-3 py-2">
                        <div className="flex gap-2 justify-end">
                          <button
                            disabled={isSaving}
                            onClick={() => saveRow(r, edited)}
                            className="rounded-lg bg-black px-3 py-1.5 text-white text-xs disabled:opacity-50"
                          >
                            Kaydet
                          </button>
                          <button
                            onClick={() => deleteRow(r)}
                            className="rounded-lg border px-3 py-1.5 text-xs"
                          >
                            Sil
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="mt-4 flex items-center justify-between">
        <button
          className="rounded-lg border px-3 py-1.5 text-sm disabled:opacity-40"
          disabled={page <= 1}
          onClick={() => setPage((p) => Math.max(1, p - 1))}
        >
          ← Önceki
        </button>
        <div className="text-sm text-neutral-500">Sayfa {page}</div>
        <button className="rounded-lg border px-3 py-1.5 text-sm" onClick={() => setPage((p) => p + 1)}>
          Sonraki →
        </button>
      </div>

      {/* New Row Modal (scrollable + big fields full width) */}
      {showNew && !isReadOnly && (
        <div className="fixed inset-0 z-[100] bg-black/40 p-3 md:p-6">
          <div className="mx-auto h-full w-full max-w-5xl overflow-hidden rounded-2xl bg-white shadow-xl">
            {/* Sticky header */}
            <div className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b bg-white px-4 py-3">
              <div>
                <div className="font-semibold">Yeni Satır</div>
                <div className="text-xs text-neutral-500">
                  {cfg.title} • {cfg.table}
                </div>
              </div>
              <button
                onClick={() => setShowNew(false)}
                className="rounded-lg border px-3 py-1.5 text-sm"
              >
                Kapat
              </button>
            </div>

            {/* Scrollable content */}
            <div className="h-[calc(100vh-140px)] overflow-auto px-4 py-4 pb-24">
              <div className="grid gap-3 md:grid-cols-2">
                {cfg.columns
                  .filter((c) => !c.readOnly)
                  .map((c) => {
                    // ✅ Büyük alanları tam genişlik yap
                    const span2 =
                      c.key === "content_md" || c.key === "summary" || c.key === "seo_description";
                    const wrapClass = `rounded-xl border p-3 ${span2 ? "md:col-span-2" : ""}`;

                    if (c.multiline) {
                      return (
                        <label key={c.key} className={wrapClass}>
                          <div className="text-xs text-neutral-500 mb-1">{c.label}</div>
                          <textarea
                            className="w-full rounded-lg border px-3 py-2 text-sm"
                            rows={c.rows ?? 5}
                            value={String(newRow[c.key] ?? "")}
                            onChange={(e) => setNewField(c.key, e.target.value)}
                          />
                        </label>
                      );
                    }

                    if (c.type === "bool") {
                      return (
                        <label key={c.key} className={`${wrapClass} flex items-center justify-between`}>
                          <div>
                            <div className="text-xs text-neutral-500 mb-1">{c.label}</div>
                            <div className="text-sm text-neutral-700">Aç / Kapat</div>
                          </div>
                          <input
                            type="checkbox"
                            checked={!!newRow[c.key]}
                            onChange={(e) => setNewField(c.key, e.target.checked)}
                          />
                        </label>
                      );
                    }

                    if (c.type === "enum" && c.options?.length) {
                      return (
                        <label key={c.key} className={wrapClass}>
                          <div className="text-xs text-neutral-500 mb-1">{c.label}</div>
                          <select
                            className="w-full rounded-lg border px-3 py-2 text-sm"
                            value={String(newRow[c.key] ?? "")}
                            onChange={(e) => setNewField(c.key, e.target.value)}
                          >
                            <option value="">—</option>
                            {c.options.map((op) => (
                              <option key={op} value={op}>
                                {op}
                              </option>
                            ))}
                          </select>
                        </label>
                      );
                    }

                    // mask alanı insert'te de girebilmek istersen (şimdilik normal input yeter)
                    return (
                      <label key={c.key} className={wrapClass}>
                        <div className="text-xs text-neutral-500 mb-1">{c.label}</div>
                        <input
                          className="w-full rounded-lg border px-3 py-2 text-sm"
                          type={c.type === "number" ? "number" : "text"}
                          value={String(newRow[c.key] ?? "")}
                          onChange={(e) => setNewField(c.key, e.target.value)}
                        />
                      </label>
                    );
                  })}
              </div>
            </div>

            {/* Sticky footer */}
            <div className="sticky bottom-0 z-10 flex justify-end gap-2 border-t bg-white px-4 py-3">
              <button onClick={() => setShowNew(false)} className="rounded-lg border px-4 py-2 text-sm">
                Vazgeç
              </button>
              <button onClick={insertRow} className="rounded-lg bg-black px-4 py-2 text-sm text-white">
                Ekle
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
