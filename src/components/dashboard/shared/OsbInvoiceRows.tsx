// src/components/dashboard/shared/OsbInvoiceRows.tsx
//
// Metot 8 (Kayseri OSB) fatura kalemleri — OSB bildirimindeki SIRA ve ETİKETLERLE.
// Dört yüzey (InvoiceDetail, InvoiceSnapshotDetail, ConsumptionDetail tahmini, admin
// önizleme dışı) `breakdown.osb` varsa standart kalem gövdesi yerine bunu çizer.
// Reaktif ceza, OSB'de ayrı "Reaktif Ceza Bedeli" satırında değil, Endüktif/Kapasitif
// satırlarının tutarında gösterilir.

import type { ReactNode } from "react";
import type { OsbBreakdown } from "@/components/utils/calculateInvoiceNetMethods";

const fmtMoney2 = (n: number) =>
  n.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtKwh = (n: number) => n.toLocaleString("tr-TR", { maximumFractionDigits: 0 });
const fmtKwh3 = (n: number) => n.toLocaleString("tr-TR", { maximumFractionDigits: 3 });
const fmtUnit = (n: number) =>
  n.toLocaleString("tr-TR", { minimumFractionDigits: 6, maximumFractionDigits: 6 });
const fmtPct = (n: number) => n.toLocaleString("tr-TR", { maximumFractionDigits: 2 });

function Row(p: { label: string; desc: ReactNode; amount: number; strong?: boolean; muted?: boolean }) {
  const neg = p.amount < 0;
  return (
    <tr className={p.strong ? "border-t border-neutral-200" : "border-b border-neutral-100"}>
      <td className={"py-2 pr-4 " + (p.strong ? "font-semibold " : "") + (p.muted ? "text-neutral-500" : "")}>
        {p.label}
      </td>
      <td className="py-2 pr-4 text-neutral-600">{p.desc}</td>
      <td
        className={
          "py-2 pr-4 text-right " +
          (p.strong ? "font-semibold " : "") +
          (p.muted ? "text-neutral-500 " : "") +
          (neg ? "text-emerald-700" : "")
        }
      >
        {neg ? "−" : ""}
        {fmtMoney2(Math.abs(p.amount))}
      </td>
    </tr>
  );
}

export function OsbInvoiceRows(p: {
  osb: OsbBreakdown;
  subtotalBeforeVat: number;
  vatCharge: number;
  totalInvoice: number;
  btvRate: number;
  vatRate: number;
}) {
  const o = p.osb;
  return (
    <>
      <Row
        label="Aktif Enerji"
        amount={o.aktifEnerji}
        desc={
          <>
            {fmtKwh3(o.netKwh)} kWh (net) × {fmtUnit(o.enerjiFiyati)} TL/kWh
            {o.fiyatTahmini && (
              <span className="text-amber-600">
                {" "}
                (tahmini fiyat{o.fiyatDonemi ? ` — ${o.fiyatDonemi}` : ""})
              </span>
            )}
          </>
        }
      />
      {o.enduktif !== 0 && (
        <Row
          label="Endüktif"
          amount={o.enduktif}
          desc={
            o.reaktifOverride ? (
              "Reaktif ceza (düzenlenmiş tutar)"
            ) : (
              <>
                {fmtKwh3(o.riKwh)} kVArh (%{fmtPct(o.riYuzde)} &gt; %{o.enduktifSinirYuzde}) ×{" "}
                {fmtUnit(o.birimler.reaktif)}
              </>
            )
          }
        />
      )}
      {o.kapasitif !== 0 && (
        <Row
          label="Kapasitif"
          amount={o.kapasitif}
          desc={
            <>
              {fmtKwh3(o.rcKwh)} kVArh (%{fmtPct(o.rcYuzde)} &gt; %{o.kapasitifSinirYuzde}) ×{" "}
              {fmtUnit(o.birimler.reaktif)}
            </>
          }
        />
      )}
      <Row
        label="YEKDEM Fiyat Fark"
        amount={o.yekdemFiyatFarki}
        desc={
          o.oncekiAyNetKwh != null ? (
            <>
              Önceki ay net {fmtKwh3(o.oncekiAyNetKwh)} kWh × {fmtUnit(o.yekdemFarkBirim)} TL/kWh
            </>
          ) : (
            "Önceki ay net tüketimi yok"
          )
        }
      />
      <Row
        label="İletim Bedeli (Aktif Tüketim Payı)"
        amount={o.iletim}
        desc={
          <>
            {fmtKwh3(o.consKwh)} kWh × {fmtUnit(o.birimler.iletim)} TL/kWh
          </>
        }
      />
      {!o.uretimTesisi && (
        <Row
          label="OSB Dağıtım Sistemi Kullanım Bedeli"
          amount={o.osbDagitim}
          desc={
            <>
              {fmtKwh3(o.consKwh)} kWh × {fmtUnit(o.birimler.osbDagitim)} TL/kWh
            </>
          }
        />
      )}
      {o.uretimTesisi && (
        <Row
          label="Lisanssız Üretim ÇEKİŞ Dağ.Bed.(DBÇx0,5)(Sanayi)"
          amount={o.cekis}
          desc={
            <>
              {fmtKwh3(o.consKwh)} kWh × {fmtUnit(o.birimler.cekis)} TL/kWh
            </>
          }
        />
      )}
      {o.uretimTesisi && (
        <Row
          label="Lisanssız Üretim VERİŞ Dağıtım Bedeli"
          amount={o.verisDagitim}
          desc={
            <>
              {fmtKwh3(o.verisDagitimKwh)} kWh (veriş − tüketim) × {fmtUnit(o.birimler.verisDagitim)} TL/kWh
            </>
          }
        />
      )}
      <Row
        label="Enerji ve Güç Bedelleri Toplamı"
        amount={o.enerjiVeGucToplami}
        desc="Aktif enerji (reaktif dahil değil) — bilgi"
        muted
      />
      <Row
        label={`Elektrik Tüketim Vergisi (%${fmtPct(p.btvRate * 100)})`}
        amount={o.etv}
        desc={
          <>
            {fmtKwh3(o.consKwh)} kWh (brüt) × {fmtUnit(o.enerjiFiyati)} TL/kWh × %{fmtPct(p.btvRate * 100)}
          </>
        }
      />
      <Row label="KDV Matrahı" amount={p.subtotalBeforeVat} desc="Kalemler toplamı" strong />
      <Row
        label={`KDV Tutarı (%${fmtPct(p.vatRate * 100)})`}
        amount={p.vatCharge}
        desc="KDV matrahı × KDV oranı"
      />
      <Row label="Toplam Tutar" amount={p.totalInvoice} desc="KDV dahil" strong />
    </>
  );
}

/** Tablo altı notlar — tüketim bileşenleri ve fiyat kaynağı. */
export function OsbInvoiceNotes({ osb }: { osb: OsbBreakdown }) {
  return (
    <div className="mt-3 space-y-1 rounded-xl bg-neutral-50 p-3 text-xs text-neutral-600">
      <p className="font-medium text-neutral-700">Kayseri OSB fatura notları</p>
      <p>
        Brüt aktif tüketim: {fmtKwh(osb.consKwh)} kWh · Mahsup: {fmtKwh(osb.mahsupKwh)} kWh · Net
        (faturalanan): {fmtKwh(osb.netKwh)} kWh
      </p>
      <p>
        Kendi veriş: {fmtKwh(osb.ownGnKwh)} kWh
        {osb.uretimTesisi
          ? " — üretim tesisi: OSB dağıtım yerine lisanssız üretim çekiş/veriş bedelleri"
          : ""}
      </p>
      <p>
        Enerji birim fiyatı: {fmtUnit(osb.enerjiFiyati)} TL/kWh
        {osb.fiyatTahmini
          ? ` (tahmini — ${osb.fiyatDonemi ?? "önceki ay"} fiyatı; OSB fiyatı girilince güncellenir)`
          : osb.fiyatDonemi
            ? ` (OSB ${osb.fiyatDonemi})`
            : ""}
      </p>
    </div>
  );
}
