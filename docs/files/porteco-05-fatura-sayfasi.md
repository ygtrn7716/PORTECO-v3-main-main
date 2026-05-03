# PortEco Web — Fatura Sayfaları

Bu doküman, fatura ile ilgili dört bileşeni kapsar: kapanmış ay (`billed`) için kalemleri gösteren `InvoiceDetail`, ay-içi canlı tahmin için `computeMonthInvoiceToDate()` pipeline'ı, snapshot kayıt/listeleme arayüzü `InvoiceHistory`, ve belirli bir snapshot'ı detaylı inceleyen `InvoiceSnapshotDetail`. Tüm fatura kalemleri tek bir saf TypeScript fonksiyonu olan `calculateInvoice()` üzerinden hesaplanır.

Kaynak dosyalar:

- `src/components/utils/calculateInvoice.ts` (283 satır)
- `src/components/utils/calculateInvoiceToDate.ts` (621 satır)
- `src/components/utils/invoiceSnapshots.ts` (266 satır)
- `src/components/utils/invoiceHistory.ts`
- `src/components/utils/exportConsumptionXlsx.ts`
- `src/components/utils/xlsx.ts`
- `src/components/dashboard/InvoiceDetail.tsx`
- `src/pages/InvoiceHistory.tsx`
- `src/pages/InvoiceSnapshotDetail.tsx`
- `src/components/dashboard/invoiceDetail/AlternateTariffInvoiceSection.tsx`
- `src/components/dashboard/GeneratedInvoicesSection.tsx`
- Migration'lar: `20260403_001_add_distribution_adjustment_to_snapshots.sql`, `20260408_001_add_veris_and_effective_dist_to_snapshots.sql`, `20260410_001_add_perakende_to_tariff.sql`, `20260410_002_add_on_yil_to_settings.sql`, `20260410_003_add_veris_satis_to_snapshots.sql`

## 1. Fatura Türleri

| Tür | Anlamı | Üretim noktası |
| --- | --- | --- |
| `billed` | Geçen ayın kesilmiş faturası — tüm dönem (M-1) verisiyle hesaplanmış. | `Dashboard.tsx` Effect 5, `InvoiceDetail.tsx`, `InvoiceHistory` listesi |
| `to_date` | Cari ayın günü gününe canlı tahmini. PTF tablosunun en son saatine kadar tüketim alınır, eksik saatler `skippedKwh`'a düşer. | `computeMonthInvoiceToDate()` (snapshot olarak depolanmaz; sayfa içinde anlık olarak hesaplanır) |
| `backdated` | Geriye dönük elle düzeltilmiş fatura snapshot'ı (admin tarafından elle girilen veya generated invoice'lardan üretilen). | Admin paneli `InvoiceSnapshotsAdmin`, `GeneratedInvoicesSection.tsx` |

`invoice_snapshots.invoice_type` kolonu `"billed"` veya `"backdated"` değerini alır. `to_date` türü kalıcı olarak yazılmaz; gerektiğinde anlık hesaplanır.

## 2. `calculateInvoice()` İmzası

`src/components/utils/calculateInvoice.ts:73`. Saf fonksiyondur, herhangi bir Supabase çağrısı yapmaz.

### 2.1 Girdi (`InvoiceInput`)

| Alan | Tip | Birim | Anlam |
| --- | --- | --- | --- |
| `totalConsumptionKwh` | `number` | kWh | M-1 (veya cari ay) toplam çekiş tüketimi |
| `unitPriceEnergy` | `number` | TL/kWh | `(PTF + YEKDEM) × KBK` |
| `unitPriceDistribution` | `number` | TL/kWh | `distribution_tariff_official.dagitim_bedeli` |
| `btvRate` | `number` | oran (0.01 vb.) | `tariff.btv / 100`, `btv_enabled` false ise 0 |
| `vatRate` | `number` | oran (0.20 vb.) | `tariff.kdv / 100` |
| `tariffType` | `"single" \| "dual"` | — | `terim` `"cift_terim"` ise `dual`, aksi `single` |
| `contractPowerKw` | `number` | kW | `subscription_settings.guc_bedel_limit` |
| `monthFinalDemandKw` | `number` | kW | `demand_monthly.max_demand_kw × multiplier` |
| `powerPrice` | `number` | TL/kW | `tariff.guc_bedeli` |
| `powerExcessPrice` | `number` | TL/kW | `tariff.guc_bedeli_asim` |
| `reactivePenaltyCharge` | `number?` | TL | Reaktif ceza (KDV öncesi); `Dashboard.tsx` ve InvoiceDetail tarafından önceden hesaplanır |
| `trafoDegeri` | `number?` | kWh | `subscription_settings.trafo_degeri` (trafo kayıp kWh'ı) |
| `totalProductionKwh` | `number?` | kWh | M-1 toplam veriş (gn) |
| `onYil` | `boolean?` | — | `subscription_settings.on_yil` — 10+ yıl lisans (PTF satış); false ise ulusal tarife mahsubu |
| `perakendeEnerjiBedeli` | `number?` | TL/kWh | `distribution_tariff_official.perakende_enerji_bedeli` |

### 2.2 Dönüş (`InvoiceBreakdown`)

| Alan | Tip | Birim | Anlam |
| --- | --- | --- | --- |
| `energyCharge` | `number` | TL | `unitPriceEnergy × totalConsumptionKwh` |
| `trafoCharge` | `number` | TL | `unitPriceEnergy × trafoKwh` |
| `distributionBaseKwh` | `number` | kWh | `totalConsumptionKwh + trafoKwh` (çekiş tarafı) |
| `verisKwh` | `number` | kWh | `max(0, totalProductionKwh ?? 0)` |
| `distributionAdjustment` | `number` | TL | netKwh > 0 ise `(unitPriceDistribution / 2) × verisKwh`, aksi 0 |
| `distributionCharge` | `number` | TL | `cekisCharge − distributionAdjustment` (negatife düşmez) |
| `distributionChargeKwh` | `number` | kWh | netKwh > 0 ise `netKwh`, aksi `distributionBaseKwh` |
| `effectiveDistributionUnitPrice` | `number` | TL/kWh | `distributionCharge / netKwh` (netKwh ≤ 0 ise `unitPriceDistribution`) |
| `netEnergyKwh` | `number` | kWh | `\|totalConsumptionKwh − verisKwh\|` |
| `netEnergyCharge` | `number` | TL | `unitPriceEnergy × netEnergyKwh` |
| `btvCharge` | `number` | TL | `(netEnergyCharge + trafoCharge) × btvRate` |
| `powerBaseCharge` | `number` | TL | `dual` ise `powerPrice × contractPowerKw`, aksi 0 |
| `powerExcessCharge` | `number` | TL | `dual && monthFinalDemandKw > contractPowerKw` ise `(monthFinalDemandKw − contractPowerKw) × powerExcessPrice` |
| `powerTotalCharge` | `number` | TL | `powerBaseCharge + powerExcessCharge` |
| `reactivePenaltyCharge` | `number` | TL | Girdiden geçer (varsayılan 0) |
| `verisMahsupKwh` | `number` | kWh | `!onYil && verisKwh > 0` ise `min(verisKwh, totalConsumptionKwh)`, aksi 0 |
| `verisFazlaKwh` | `number` | kWh | `!onYil && verisKwh > 0` ise `max(0, verisKwh − totalConsumptionKwh)`, aksi 0 |
| `verisSatisBedeli` | `number` | TL | `(verisMahsupKwh × unitPriceEnergy) + (verisFazlaKwh × perakendeEnerjiBedeli)`, sadece `!onYil` |
| `subtotalBeforeVat` | `number` | TL | `energyCharge + trafoCharge + distributionCharge + btvCharge + powerTotalCharge + reactivePenaltyCharge − verisSatisBedeli` |
| `vatCharge` | `number` | TL | `subtotalBeforeVat × vatRate` |
| `totalInvoice` | `number` | TL | `subtotalBeforeVat + vatCharge` (KDV dahil, **YEKDEM mahsup hariç**) |

### 2.3 Formüller

```
energyCharge       = unitPriceEnergy × totalConsumptionKwh
trafoCharge        = unitPriceEnergy × trafoKwh
distributionBaseKwh = totalConsumptionKwh + trafoKwh
verisKwh           = max(0, totalProductionKwh ?? 0)
cekisCharge        = unitPriceDistribution × distributionBaseKwh
netKwh             = totalConsumptionKwh − verisKwh

If netKwh > 0:                                   # Tüketim, üretimden büyük → mahsup uygulanır
  distributionAdjustment = (unitPriceDistribution / 2) × verisKwh
  distributionCharge     = cekisCharge − distributionAdjustment
Else:                                            # Üretim, tüketimden büyük/eşit → mahsup uygulanmaz
  distributionAdjustment = 0
  distributionCharge     = cekisCharge

netEnergyKwh    = |netKwh|
netEnergyCharge = unitPriceEnergy × netEnergyKwh
btvCharge       = (netEnergyCharge + trafoCharge) × btvRate

If tariffType == "dual":
  powerBaseCharge   = powerPrice × contractPowerKw
  if monthFinalDemandKw > contractPowerKw:
    powerExcessCharge = (monthFinalDemandKw − contractPowerKw) × powerExcessPrice

If !onYil && verisKwh > 0:                       # Veriş satış bedeli (ulusal tarife mahsubu)
  verisMahsupKwh = min(verisKwh, totalConsumptionKwh)
  verisFazlaKwh  = max(0, verisKwh − totalConsumptionKwh)
  verisSatisBedeli = verisMahsupKwh × unitPriceEnergy + verisFazlaKwh × perakendeEnerjiBedeli

subtotalBeforeVat = energyCharge + trafoCharge + distributionCharge + btvCharge
                  + powerTotalCharge + reactivePenaltyCharge − verisSatisBedeli
vatCharge         = subtotalBeforeVat × vatRate
totalInvoice      = subtotalBeforeVat + vatCharge
```

> Önemli: `totalInvoice` YEKDEM mahsup ve `diger_degerler` alanlarını **içermez**. Bunlar ayrı eklenir: `totalWithMahsup = totalInvoice + yekdemMahsup + digerDegerler`.

`Dashboard.tsx:134` üzerinde `console.log('[DAGITIM]', { ... })` debug satırı bulunmaktadır; production'a girmeden temizlenmelidir.

## 3. `computeMonthInvoiceToDate()` Pipeline

`src/components/utils/calculateInvoiceToDate.ts:250`. Cari ay (`year`, `month`) için günü gününe fatura tahmini hesaplar. 15 ana adımı vardır.

| # | Adım | Detay |
| --- | --- | --- |
| 1 | Tarih hesabı | `monthStart = m.startOf("month")`, `monthEndExclusive = +1 ay`, ISO formuna çevrilir |
| 2 | Tesis-özel YEKDEM (`fetchSubYekdemValue`) | `subscription_yekdem.yekdem_value` ile o ayın değeri çekilir; null ise pipeline `null` döner |
| 3 | PTF cutoff | `epias_ptf_hourly` tablosundan ay içinde **en son** `ts` bulunur (`limit 1, order desc`); satır yoksa `null` döner |
| 4 | PTF map (`fetchPtfMapToDate`) | `ay başı → cutoff` arası saatlik PTF'ler okunur; kolon `ptf_tl_kwh` yoksa `ptf_tl_mwh / 1000` fallback'i |
| 5 | Tüketim (`fetchAllConsumption`) | `ts, cn, ri, rc, gn` paginated çekilir, `endInclusive=true` |
| 6 | PTF eşleşmeyen saatler | `skippedKwh`'a düşer; eşleşenler `billableKwh` ve `sumPtfWeighted`'e eklenir |
| 7 | Ortalama PTF | `monthlyPTF = sumPtfWeighted / billableKwh` (tüketim ağırlıklı) |
| 8 | Tesis ayarları | `subscription_settings`'tan `kbk, terim, gerilim, tarife, guc_bedel_limit, trafo_degeri, on_yil` |
| 9 | Multiplier + BTV | `owner_subscriptions.multiplier`, `btv_enabled` (`uid` filtresi başarısızsa fallback olarak yalnızca serno) |
| 10 | Tarife | `distribution_tariff_official` (`dagitim_bedeli, guc_bedeli, guc_bedeli_asim, kdv, btv, reaktif_bedel, perakende_enerji_bedeli`) |
| 11 | Reaktif ceza | RI %20, RC %15 hard-limit kontrolü; `(riPenaltyEnergy + rcPenaltyEnergy) × reaktif_bedel` |
| 12 | Demand | `demand_monthly` (`is_final = true`) → `max_demand_kw × multiplier` |
| 13 | Diger değerler | `subscription_yekdem.diger_degerler` (legacy `(year, month)` öncelikli, yeni `(period_year, period_month)` fallback) |
| 14 | `calculateInvoice` | Tüm parametrelerle çağrılır |
| 15 | YEKDEM mahsup (M-1) | `consumption_daily.kwh_in` (öncelik) → `consumption_hourly.cn` (fallback); `subscription_yekdem` (`yekdem_value`, `yekdem_final`); `calculateYekdemMahsup` |

Sonuç tipi `MonthInvoiceToDateResult`:

- Tarih bilgisi: `rangeStart`, `rangeEnd`, ISO eşdeğerleri
- Çekiş/üretim/skip kWh
- Birim fiyatlar (PTF, YEKDEM, KBK, energy, distribution)
- Vergi oranları
- Demand bilgisi + `hasDemandData` bayrağı
- Reaktif yüzdeler ve ceza
- Trafo, diger_degerler
- `breakdown`: tam `InvoiceBreakdown`
- Mahsup: `hasYekdemMahsup`, `yekdemMahsup`, `yekdemMissing` (`"none" | "value" | "final" | "both"`)
- `totalWithMahsup`

`requirePrevMonthMahsup` opsiyonel parametresi `true` ise mahsup yoksa `null` döner; varsayılan `false` (kart "to-date" değerini yine de gösterir).

## 4. Snapshot Yazma — `upsertInvoiceSnapshot()`

`src/components/utils/invoiceSnapshots.ts:117`. `invoice_snapshots` tablosuna upsert yapar. Conflict key:

```
(user_id, subscription_serno, period_year, period_month, invoice_type)
```

Yazılan alanlar (kullanılan SQL kolon adlarıyla):

```
user_id, subscription_serno, period_year, period_month,
invoice_type, month_label,
total_consumption_kwh,
unit_price_energy, unit_price_distribution,
btv_rate, vat_rate, tariff_type,
contract_power_kw, month_final_demand_kw, has_demand_data,
power_price, power_excess_price,
reactive_ri_percent, reactive_rc_percent, reactive_penalty_charge,
energy_charge, distribution_charge, btv_charge,
power_base_charge, power_excess_charge,
subtotal_before_vat, vat_charge, total_invoice,
has_yekdem_mahsup, yekdem_mahsup, total_with_mahsup,
trafo_degeri, trafo_charge,
diger_degerler,
total_production_kwh,
distribution_adjustment, veris_kwh, effective_distribution_unit_price,
on_yil, veris_satis_bedeli, perakende_enerji_bedeli
```

Aynı dönem için yalnızca **bir** satır olur (invoice_type başına): `billed` ve `backdated` ayrı satırlar tutar.

## 5. Snapshot Okuma — `getInvoiceSnapshot()` ve `listInvoiceSnapshots()`

- `getInvoiceSnapshot()` tek satır döner. `select("*")` yapar; `period_year`, `period_month`, `invoice_type` filtrelerine göre `maybeSingle` çağırır.
- `listInvoiceSnapshots()` kullanıcıya ait tüm satırları döner; `period_year DESC`, `period_month DESC` sıralı. `subscription_serno` opsiyonel filtre. SELECT kümesi calculateInvoice için gereken tüm alanları içerir; UI tarafında `recomputeSnapshotTotalWithMahsup` ile yeniden hesaplama yapılabilir.

## 6. Canlı Yeniden Hesaplama — `recomputeSnapshotTotalWithMahsup()`

`invoiceSnapshots.ts:21`. Eski snapshot'ların `total_with_mahsup` alanını **görmezden** gelip bugünkü `calculateInvoice` formülüyle yeniden hesaplar. Hata varsa fallback olarak depolanan `total_with_mahsup` değeri döner.

Bu yardımcı `Dashboard.tsx` Effect 5 ve Effect 6, `InvoiceDetail.tsx`, `InvoiceHistory.tsx` ve `InvoiceSnapshotDetail.tsx` tarafından kullanılır.

`INVOICE_SNAPSHOT_RECOMPUTE_FIELDS` sabiti (`invoiceSnapshots.ts:56`):

```
total_consumption_kwh, unit_price_energy, unit_price_distribution,
btv_rate, vat_rate, tariff_type, contract_power_kw, month_final_demand_kw,
power_price, power_excess_price, reactive_penalty_charge, trafo_degeri,
total_production_kwh, on_yil, perakende_enerji_bedeli,
yekdem_mahsup, diger_degerler, total_with_mahsup
```

Bu metin Supabase select'lerine ekleyerek minimum alanlarla recompute mümkün olur.

## 7. InvoiceDetail Sayfası

Route: `/dashboard/invoice-detail` (`src/components/dashboard/InvoiceDetail.tsx`).

Görev: Geçen ay (M-1) için kapanmış faturayı kalem kalem göstermek. Aşağıdaki bölümleri içerir:

- Tarih aralığı ve tesis seçici (TopBar)
- Birim fiyat satırları: PTF, YEKDEM, KBK, BTV, KDV
- Hesaplama tablosu: enerji, trafo, dağıtım (mahsup öncesi/sonrası), BTV, güç bedeli, aşım, reaktif ceza, veriş satış bedeli, ara toplam, KDV, toplam, mahsup, diger_degerler, **ödenecek toplam**.
- "Excel'e aktar" butonu — `exportConsumptionXlsx.ts` kullanır.
- `AlternateTariffInvoiceSection` (`src/components/dashboard/invoiceDetail/AlternateTariffInvoiceSection.tsx`) — alternatif tarifelerle karşılaştırma; örneğin `dual` tarifeli tesis için `single` simülasyonu.

Veri akışı: `Dashboard.tsx` Effect 5 ile **birebir aynı pipeline**. Tek fark, sayfa kalem kalem dökümle gösterir; Dashboard kartı yalnızca toplamı verir.

## 8. InvoiceHistory Sayfası

Route: `/dashboard/invoices` (`src/pages/InvoiceHistory.tsx`).

Görev: Tüm aylara ait `invoice_snapshots` satırlarını liste halinde göstermek. Her satırda:

- Yıl/Ay etiketi (`month_label`)
- Toplam tüketim (kWh)
- KDV dahil fatura (`total_invoice`)
- Mahsup dahil ödenecek (`total_with_mahsup`, recompute ile)
- Detay linki: `/dashboard/invoices/:sub/:year/:month`

`listInvoiceSnapshots({ userId, subscriptionSerno, invoiceType: "billed" })` çağrısı kullanılır. Liste `period_year DESC, period_month DESC` sıralıdır.

## 9. InvoiceSnapshotDetail Sayfası

Route: `/dashboard/invoices/:sub/:year/:month` (`src/pages/InvoiceSnapshotDetail.tsx`).

Görev: Belirli bir snapshot satırının tüm kalemlerini göstermek. `getInvoiceSnapshot()` ile satır çekilir, `recomputeSnapshotTotalWithMahsup()` ile mahsup dahil toplam hesaplanır. UI yapısı `InvoiceDetail` ile benzerdir; ama veriler doğrudan snapshot'tan gelir, anlık Supabase pipeline çalışmaz.

`AlternateTariffInvoiceSection` ve `GeneratedInvoicesSection` bu sayfada da kullanılabilir.

## 10. AlternateTariffInvoiceSection

`src/components/dashboard/invoiceDetail/AlternateTariffInvoiceSection.tsx`. Var olan tarife dışındaki olası tariflerle (örn. `single` ↔ `dual`, ya da farklı `tarife` değerleri) karşılaştırma yapar. Aynı tüketim, aynı YEKDEM/PTF, farklı `tariff` parametreleriyle `calculateInvoice()` çağrılır ve maliyet farkı kullanıcıya gösterilir. Genellikle "tarife optimizasyonu" senaryolarında kullanılır.

## 11. Excel Export

İki yol vardır:

1. `exportConsumptionXlsx(uid, sub, range)` (`src/components/utils/exportConsumptionXlsx.ts`) — `paginatedFetch.fetchAllConsumption()` ile saatlik tüketimi çekip XLSX dosyasına yazar. Kolonlar: `ts, cn, ri, rc, gn` (varyantları). `xlsx` paketi kullanılır.
2. `xlsx.ts` — Genel `exportToXlsx(...)` yardımcısı. Birden fazla sheet, başlık bloğu, biçimleme desteği vardır; fatura kalem dökümünü tek sheet olarak yazmak için tercih edilir.

Dosya adı tipik olarak `<tesis>_<ay>_<yıl>.xlsx` formatındadır (örn. `123456789_04_2026.xlsx`).

## 12. Snapshot Şema Değişiklikleri

`invoice_snapshots` tablosuna 2026 yılında eklenen alanlar:

| Migration | Tarih | Eklenen alanlar |
| --- | --- | --- |
| `20260403_001_add_distribution_adjustment_to_snapshots.sql` | 2026-04-03 | `distribution_adjustment` |
| `20260403_002_create_intake_forms.sql` | 2026-04-03 | (intake_forms ile alakalı, ayrı tablo) |
| `20260408_001_add_veris_and_effective_dist_to_snapshots.sql` | 2026-04-08 | `veris_kwh`, `effective_distribution_unit_price` |
| `20260410_001_add_perakende_to_tariff.sql` | 2026-04-10 | `distribution_tariff_official.perakende_enerji_bedeli` |
| `20260410_002_add_on_yil_to_settings.sql` | 2026-04-10 | `subscription_settings.on_yil` |
| `20260410_003_add_veris_satis_to_snapshots.sql` | 2026-04-10 | `veris_mahsup_kwh`, `veris_fazla_kwh`, `veris_satis_bedeli`, `perakende_enerji_bedeli` (snapshot'ta) |

> 2026-04 öncesi snapshot'lar bu alanları içermez; `recomputeSnapshotTotalWithMahsup()` eksik alanları `0` veya varsayılan değerle tamamlayıp güncel formülle hesaplar.

## 13. GeneratedInvoicesSection

`src/components/dashboard/GeneratedInvoicesSection.tsx`. Admin tarafından elle "üretilen" backdated faturalar için kullanılır. PDF veya XLSX gibi harici yüklemelerin görsel referansı olarak işlev görür; doğrudan `invoice_snapshots` tablosuyla bağlıdır (`invoice_type = "backdated"`).

## 14. Hata Durumları

| Durum | InvoiceDetail davranışı | InvoiceSnapshotDetail davranışı |
| --- | --- | --- |
| `subscription_settings` bulunamadı | "—" döner, kullanıcıya hata mesajı verilmez (Dashboard'la aynı) | Snapshot zaten varsa snapshot'taki değerleri gösterir |
| Tarife eşleşmesi yok | "—" | Snapshot'tan değerler |
| `monthly_ptf_prev_sub` RPC null | "—" | Snapshot'taki saklı PTF değeri |
| `subscription_yekdem` boş | YEKDEM kartı "—" | Snapshot'taki saklı YEKDEM |
| `consumption_hourly` boş | `prevMonthKwh = 0` → fatura kartı "—" | Snapshot saklı tüketim |
| Demand verisi yok | `monthFinalDemandKw = 0` (ceza kalemi sıfırlanır) | `has_demand_data` flag'i false |

## 15. Paralel Implementasyonlar

Üç ayrı yerde aynı `calculateInvoice` çağrısı yapılır ama veri akışı farklıdır:

| Yer | Hangi tarih için | Veri kaynağı | Nereye yazar |
| --- | --- | --- | --- |
| `Dashboard.tsx` Effect 5 | M-1 (geçen ay) | Canlı Supabase, snapshot varsa snapshot | `setInvoiceTotal`, `setYekdemMahsup` state |
| `Dashboard.tsx` Effect 6 | M-1 (her tesis) | Aynı, tesis döngüsü | `setAllSubsTotal*` |
| `InvoiceDetail.tsx` | M-1 (kalem detayı) | Aynı pipeline + ekstra UI sorguları | Sayfa render |
| `computeMonthInvoiceToDate` | Cari ay (canlı) | PTF map + saatlik tüketim agregasyonu | `MonthInvoiceToDateResult` döner |
| `recomputeSnapshotTotalWithMahsup` | Snapshot kaydı | Snapshot'taki saklı alanlar | Tek sayı (TL) |

## 16. Kaldırılan / Değişen Yapılar

- **`distribution_adjustment` öncesi formül**: Eski formül `distributionCharge = unitPriceDistribution × totalConsumptionKwh` idi. 2026-04-03'ten sonra `distributionCharge = unitPriceDistribution × (totalConsumptionKwh + trafoKwh) − (unitPriceDistribution / 2) × verisKwh` (mahsuplu) ya da netKwh ≤ 0 ise mahsupsuz tam çekiş tutarı. Eski snapshot'lar `recomputeSnapshotTotalWithMahsup` ile düzeltilir.
- **Veriş satış bedeli** kalemi 2026-04-10 itibarıyla yeni eklendi. Eski snapshot'larda `veris_satis_bedeli`, `veris_mahsup_kwh`, `veris_fazla_kwh` alanları yoktur; recompute bu alanları sıfır kabul edip yeniden hesaplar.
- **`perakende_enerji_bedeli` alanı** önceden hem `distribution_tariff_official` hem `invoice_snapshots` tablolarında **yoktu**; admin yenilemesi gerektirir. Migration `20260410_001_*.sql` ve `20260410_003_*.sql`.
- **`on_yil` flag'i** `subscription_settings`'a 2026-04-10 itibarıyla eklendi. Eski tesisler için varsayılan değer `null` veya `false`'tur; ulusal tarife mahsubu yalnızca `onYil = false` ise tetiklenir. Tesis ayarları admin tarafından bu alanın bilinçli olarak doldurulmasını gerektirir.
- **`total_with_mahsup` saklı değer**: Eski Dashboard sürümleri snapshot'taki `total_with_mahsup` alanını **doğrudan** kullanıyordu. Şu an her okuma `recomputeSnapshotTotalWithMahsup` ile geçirilir. Snapshot'a hâlâ depolanır (geri uyumluluk için), ama gösterilen değer recompute sonucudur.
- **`fetchAllPtf` paginated** çağrısı 1000+ saatlik veri için zorunlu hale geldi (PostgREST `max_rows` limiti). Eski `computeMonthInvoiceToDate` doğrudan `.from("epias_ptf_hourly")` ile sınırlıydı, şu an sayfalı çekim kullanıyor.
- **`AlternateTariffInvoiceSection`** önceden ayrı `calculateInvoiceAlt` benzeri bir fonksiyon kullanıyordu. Şu an aynı `calculateInvoice` fonksiyonu farklı parametrelerle çağrılır; çift implementasyon kaldırılmıştır.

---

## Son Güncelleme

- **Tarih:** 2026-05-03
- **Branch:** main
- **Son commit:** `03aa828` — valla bişeler yaptık da hatırlamıyom amk
- **Kapsanan dosyalar:** `src/components/utils/calculateInvoice.ts`, `src/components/utils/calculateInvoiceToDate.ts`, `src/components/utils/invoiceSnapshots.ts`, `src/components/utils/invoiceHistory.ts`, `src/components/utils/exportConsumptionXlsx.ts`, `src/components/utils/xlsx.ts`, `src/components/dashboard/InvoiceDetail.tsx`, `src/components/dashboard/invoiceDetail/AlternateTariffInvoiceSection.tsx`, `src/components/dashboard/GeneratedInvoicesSection.tsx`, `src/pages/InvoiceHistory.tsx`, `src/pages/InvoiceSnapshotDetail.tsx`, `supabase/migrations/20260403_*.sql`, `20260408_*.sql`, `20260410_*.sql`
