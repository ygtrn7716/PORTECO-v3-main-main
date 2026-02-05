// src/components/utils/exportConsumptionXlsx.ts
import { supabase } from "@/lib/supabase";
import { dayjsTR } from "@/lib/dayjs";
import { downloadXlsx } from "@/components/utils/xlsx";

function safeName(s: string) {
  return (s ?? "tesis")
    .toString()
    .trim()
    .replace(/[^\w.-]+/g, "_")
    .slice(0, 80);
}

export async function exportConsumptionHourlyXlsx(opts: {
  userId: string;
  subscriptionSerno: number;
  rangeLabel: string; // dosya adı için
  fromIso: string; // gte
  toExclusiveIso: string; // lt
  meterSerialLabel?: string | null; // dosya adı için
}) {
  const {
    userId,
    subscriptionSerno,
    rangeLabel,
    fromIso,
    toExclusiveIso,
    meterSerialLabel,
  } = opts;

  const pageSize = 1000;
  let from = 0;
  const all: any[] = [];

  while (true) {
    const { data, error } = await supabase
      .from("consumption_hourly")
      .select("ts, cn, ri, rc")
      .eq("user_id", userId)
      .eq("subscription_serno", subscriptionSerno)
      .gte("ts", fromIso)
      .lt("ts", toExclusiveIso)
      .order("ts", { ascending: true })
      .range(from, from + pageSize - 1);

    if (error) throw error;

    const batch = data ?? [];
    all.push(...batch);

    if (batch.length < pageSize) break;
    from += pageSize;
  }

  const rows = all.map((r) => {
    const d = dayjsTR(r.ts);
    return {
      Tarih: d.format("DD.MM.YYYY"),
      Saat: d.format("HH:mm"),
      "Aktif (kWh)": Number(r.cn) || 0,
      "Reaktif İndüktif (kVArh)": Number(r.ri) || 0,
      "Reaktif Kapasitif (kVArh)": Number(r.rc) || 0,
    };
  });

  const meter = safeName(meterSerialLabel ?? String(subscriptionSerno));
  const fileName = `tuketim_${meter}_${safeName(rangeLabel)}.xlsx`;

  downloadXlsx({ rows, fileName, sheetName: "Tüketim" });
}
