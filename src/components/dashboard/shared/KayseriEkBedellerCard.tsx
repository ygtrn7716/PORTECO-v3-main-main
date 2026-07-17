// src/components/dashboard/shared/KayseriEkBedellerCard.tsx
//
// "Ek Bedeller" kartı — Kayseri OSB (owner_subscriptions.provider = 'vhs_kayseri')
// tesislerinde fatura görünümünde "Fatura Kalemleri" kartının altında gösterilir.
// OSB'nin ayrıca tahsil ettiği üç bedel + KDV; bu tutar faturanın Genel Toplam /
// Ödenecek Toplam'ına GİRMEZ ("GES Üretim Satışı" kartı gibi ayrı tahsilat).
// Katsayılar kayseri_ek_bedeller tablosundan gelir; kaydı olmayan tesiste kart
// hiç render edilmez (gating InvoiceDetail'de).

const fmtMoney2 = (n: number) =>
  n.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const fmtKwh = (n: number) =>
  n.toLocaleString("tr-TR", { maximumFractionDigits: 0 });

const fmtUnit = (n: number) =>
  n.toLocaleString("tr-TR", { minimumFractionDigits: 6, maximumFractionDigits: 6 });

// Ek bedeller KDV'si fatura tarifesinden bağımsız, sabit %20.
const KDV_ORANI = 0.2;

export interface KayseriEkBedellerRates {
  /** İletim Bedeli (Aktif Tüketim Payı) birim fiyatı — TL/kWh */
  iletim: number;
  /** OSB Dağıtım Sistemi Kullanım Bedeli birim fiyatı — TL/kWh */
  osbDagitim: number;
  /** Lisanssız Üretim Çekiş Dağıtım Bedeli (Sanayi) birim fiyatı — TL/kWh */
  lisanssizCekis: number;
}

interface KayseriEkBedellerCardProps {
  rates: KayseriEkBedellerRates;
  /** Aylık toplam tüketim (kWh) */
  totalConsumptionKwh: number;
  /** breakdown.verisMahsupKwh — toplam veriş = mahsup + fazla */
  verisMahsupKwh: number;
  /** breakdown.verisFazlaKwh */
  verisFazlaKwh: number;
}

export default function KayseriEkBedellerCard({
  rates,
  totalConsumptionKwh,
  verisMahsupKwh,
  verisFazlaKwh,
}: KayseriEkBedellerCardProps) {
  const totalVerisKwh = verisMahsupKwh + verisFazlaKwh;
  // Net üretici ayda (veriş > tüketim) baz negatife düşmesin diye 0'a sabitlenir.
  const osbBazKwh = Math.max(0, totalConsumptionKwh - totalVerisKwh);

  const iletimTutar = totalConsumptionKwh * rates.iletim;
  const osbTutar = osbBazKwh * rates.osbDagitim;
  const lisanssizTutar = totalVerisKwh * rates.lisanssizCekis;

  const araToplam = iletimTutar + osbTutar + lisanssizTutar;
  const kdv = araToplam * KDV_ORANI;
  const toplam = araToplam + kdv;

  return (
    <div className="mt-4 rounded-2xl border border-amber-200/70 bg-gradient-to-br from-amber-50/60 to-white p-4 shadow-sm">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-neutral-900">Ek Bedeller</h2>
          <p className="mt-0.5 text-xs text-neutral-500">
            Kayseri OSB tarafından ayrıca tahsil edilir — yukarıdaki faturaya dahil değildir.
          </p>
        </div>
        <span className="shrink-0 rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-semibold text-amber-700">
          Ayrı tahsilat
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-neutral-500 border-b border-amber-200/70">
              <th className="py-2 pr-4">Kalem</th>
              <th className="py-2 pr-4">Açıklama</th>
              <th className="py-2 pr-4 text-right">Tutar (TL)</th>
            </tr>
          </thead>

          <tbody>
            <tr className="border-b border-amber-100">
              <td className="py-2 pr-4">İletim Bedeli (Aktif Tüketim Payı)</td>
              <td className="py-2 pr-4 text-neutral-600">
                {fmtUnit(rates.iletim)} TL/kWh × {fmtKwh(totalConsumptionKwh)} kWh
              </td>
              <td className="py-2 pr-4 text-right">{fmtMoney2(iletimTutar)}</td>
            </tr>

            <tr className="border-b border-amber-100">
              <td className="py-2 pr-4">OSB Dağıtım Sistemi Kullanım Bedeli</td>
              <td className="py-2 pr-4 text-neutral-600">
                {fmtUnit(rates.osbDagitim)} TL/kWh × {fmtKwh(osbBazKwh)} kWh
              </td>
              <td className="py-2 pr-4 text-right">{fmtMoney2(osbTutar)}</td>
            </tr>

            <tr className="border-b border-amber-100">
              <td className="py-2 pr-4">Lisanssız Üretim Çekiş Dağ. Bed. (Sanayi)</td>
              <td className="py-2 pr-4 text-neutral-600">
                {fmtUnit(rates.lisanssizCekis)} TL/kWh × {fmtKwh(totalVerisKwh)} kWh
              </td>
              <td className="py-2 pr-4 text-right">{fmtMoney2(lisanssizTutar)}</td>
            </tr>

            <tr className="border-b border-amber-100">
              <td className="py-2 pr-4">KDV (%20)</td>
              <td className="py-2 pr-4 text-neutral-600">Ara toplam × 0,20</td>
              <td className="py-2 pr-4 text-right">{fmtMoney2(kdv)}</td>
            </tr>

            <tr className="border-t border-amber-200/70">
              <td className="py-2 pr-4 font-semibold">Ek Bedeller Toplamı</td>
              <td className="py-2 pr-4 text-neutral-600">KDV dahil</td>
              <td className="py-2 pr-4 text-right text-lg font-bold text-amber-700">
                {fmtMoney2(toplam)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
