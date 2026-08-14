// src/components/dashboard/reports/exportMuhasebeXlsx.ts
//
// "Muhasebe Excel" — tarayıcı sarmalayıcısı. Workbook kurulumu SAF katmandadır
// (muhasebeXlsxBuild.ts, hem burada hem headless doğrulama harness'ında kullanılır);
// burada yalnız logo fetch→base64 ve indirme yapılır. SIFIR yeniden hesap: tüm
// sayılar buildMuhasebeReport çıktısından gelir (modal ile birebir aynı).
//
// Penguen Tahakkuk varyantı: tahakkukView verilirse standart sheet'lerin önüne
// "Muhasebe Özeti" + "Yevmiye Kayıtları" eklenir ve dosya adı Muhasebe_Tahakkuk_*
// olur; verilmezse bugünkü iki sheet'lik çıktı birebir aynıdır.
//
// Logo BİLEREK base64 ile gömülür: ExcelJS'in tarayıcı build'inde ArrayBuffer
// buffer'lı addImage sessizce medya üretmeyebiliyor (brandedExcel'deki eski desen);
// başarısızlık artık console.warn ile görünür — rapor logosuz da üretilir.

import logoUrl from "@/assets/porteco-logo-horizontal.png";
import { downloadWorkbook } from "./brandedExcel";
import { buildMuhasebeWorkbook } from "./muhasebeXlsxBuild";
import type { MuhasebeReport } from "./muhasebeReport";
import type { PenguenTahakkukView } from "./penguenTahakkukView";

function arrayBufferToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let bin = "";
  const CHUNK = 0x8000; // büyük görselde çağrı-yığını taşmasın
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(bin);
}

export async function exportMuhasebeXlsx(
  report: MuhasebeReport,
  tahakkukView: PenguenTahakkukView | null = null,
): Promise<void> {
  let logoBase64: string | null = null;
  try {
    const resp = await fetch(logoUrl);
    if (!resp.ok) throw new Error(`logo fetch: HTTP ${resp.status}`);
    logoBase64 = arrayBufferToBase64(await resp.arrayBuffer());
  } catch (e) {
    console.warn("[Muhasebe] PortEco logosu yüklenemedi — rapor logosuz üretiliyor.", e);
  }

  const wb = await buildMuhasebeWorkbook(report, logoBase64, tahakkukView);
  const prefix = tahakkukView ? "Muhasebe_Tahakkuk" : "Muhasebe";
  await downloadWorkbook(wb, `${prefix}_${report.meta.serno}_${report.meta.donemKod}`);
}
