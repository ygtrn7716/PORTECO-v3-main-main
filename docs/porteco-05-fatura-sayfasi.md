# PortEco v3 — Fatura Sayfası

**Fatura Listesi Route:** `/dashboard/invoices`
**Fatura Detay Route:** `/dashboard/invoice-detail`
**Snapshot Detay Route:** `/dashboard/invoices/:sub/:year/:month`

---

## 1. Geçmiş Faturalar Sayfası

**Component:** `src/pages/InvoiceHistory.tsx`

### Veri Çekme

```typescript
const data = await listInvoiceSnapshots({
  userId: uid,
  invoiceType: "billed",
});
```

**`listInvoiceSnapshots()`** (`src/components/utils/invoiceSnapshots.ts` satır 156-176):
```typescript
const q = supabase
  .from("invoice_snapshots")
  .select("user_id, subscription_serno, period_year, period_month, invoice_type,
           month_label, total_with_mahsup, total_invoice, total_consumption_kwh, updated_at")
  .eq("user_id", params.userId)
  .eq("invoice_type", "billed")
  .order("period_year", { ascending: false })
  .order("period_month", { ascending: false });
```

### Gösterim
- Faturalar yıla göre gruplandırılır
- Her fatura kartında:
  - Ay/yıl etiketi
  - Tesis numarası
  - Ödenecek tutar (`total_with_mahsup`)
  - Tüketim (kWh)
  - "Detay →" linki → `/dashboard/invoices/{serno}/{year}/{month}`

### Fatura Yoksa
```
"Henüz kaydedilmiş fatura yok. (InvoiceDetail açıldıkça snapshot kaydolacak.)"
```

---

## 2. Fatura Snapshot Nedir?

Snapshot, fatura hesaplamasının tüm parametre ve sonuçlarıyla birlikte DB'ye kaydedilmiş **anlık görüntüsüdür**. Kullanıcı `/dashboard/invoice-detail` sayfasını açtığında, hesaplanan fatura otomatik olarak `invoice_snapshots` tablosuna upsert edilir.

### Snapshot'ın Avantajları
1. Daha sonra faturayı tekrar hesaplamaya gerek kalmaz
2. Dashboard kartı önce snapshot'ı kontrol eder (hızlı yükleme)
3. Tüm tesisler toplamı hesaplanırken snapshot varsa direkt kullanılır

### Upsert Mekanizması

**Fonksiyon:** `upsertInvoiceSnapshot()` (`src/components/utils/invoiceSnapshots.ts` satır 58-153)

```typescript
const { error } = await supabase
  .from("invoice_snapshots")
  .upsert(payload, {
    onConflict: "user_id,subscription_serno,period_year,period_month,invoice_type",
  });
```

**Unique constraint:** `(user_id, subscription_serno, period_year, period_month, invoice_type)`

---

## 3. Fatura Kalemleri

**Hesaplama fonksiyonu:** `calculateInvoice()` (`src/components/utils/calculateInvoice.ts` satır 59-155)

### Girdiler (InvoiceInput)

| Parametre | Kaynak | Açıklama |
|-----------|--------|----------|
| `totalConsumptionKwh` | consumption_hourly (Σ cn) | Toplam tüketim |
| `unitPriceEnergy` | (PTF + YEKDEM) × KBK | Enerji birim fiyatı |
| `unitPriceDistribution` | distribution_tariff_official.dagitim_bedeli | Dağıtım birim fiyatı |
| `btvRate` | distribution_tariff_official.btv / 100 | BTV oranı |
| `vatRate` | distribution_tariff_official.kdv / 100 | KDV oranı |
| `tariffType` | subscription_settings.terim → "single"/"dual" | Tarife tipi |
| `contractPowerKw` | subscription_settings.guc_bedel_limit | Sözleşme gücü |
| `monthFinalDemandKw` | demand_monthly.max_demand_kw × multiplier | Ay sonu demand |
| `powerPrice` | distribution_tariff_official.guc_bedeli | Güç bedeli birim fiyatı |
| `powerExcessPrice` | distribution_tariff_official.guc_bedeli_asim | Güç aşım birim fiyatı |
| `reactivePenaltyCharge` | Ayrı hesaplanır | Reaktif ceza (TL) |
| `trafoDegeri` | subscription_settings.trafo_degeri | Trafo değeri |
| `totalProductionKwh` | consumption_hourly (Σ gn) | GES üretimi |

### Hesaplama Adımları ve Kalemler

```typescript
// 1) Enerji bedeli
energyCharge = unitPriceEnergy × totalConsumptionKwh

// 2) Trafo bedeli
trafoCharge = unitPriceEnergy × trafoDegeri

// 3) Dağıtım bedeli (veriş düzeltmeli)
distributionBaseKwh = totalConsumptionKwh + trafoKwh
baseDagitim = unitPriceDistribution × distributionBaseKwh
distributionAdjustment = |verisNeg × baseDagitim / (2 × netKwh)|
distributionCharge = baseDagitim + distributionAdjustment

// 4) BTV
btvCharge = (energyCharge + trafoCharge) × btvRate

// 5) Güç bedeli (sadece çift terim tarife)
powerBaseCharge = powerPrice × contractPowerKw
powerExcessCharge = (demand > contract) ? (demand - contract) × powerExcessPrice : 0
powerTotalCharge = powerBaseCharge + powerExcessCharge

// 6) Reaktif ceza (dışarıdan geçilir)
reactivePenaltyCharge = parametre olarak gelir

// 7) Ara toplam + KDV
subtotalBeforeVat = energyCharge + trafoCharge + distributionCharge
                  + btvCharge + powerTotalCharge + reactivePenaltyCharge
vatCharge = subtotalBeforeVat × vatRate
totalInvoice = subtotalBeforeVat + vatCharge
```

### Kalem Tablosu

| # | Kalem | Formül |
|---|-------|--------|
| 1 | Enerji Bedeli | unitPriceEnergy × totalConsumptionKwh |
| 2 | Trafo Bedeli | unitPriceEnergy × trafoDegeri |
| 3 | Dağıtım Bedeli | unitPriceDistribution × (totalConsumptionKwh + trafoDegeri) + veriş düzeltmesi |
| 4 | BTV | (energyCharge + trafoCharge) × btvRate |
| 5 | Güç Bedeli (Baz) | powerPrice × contractPowerKw |
| 6 | Güç Bedeli (Aşım) | (demand − contract) × powerExcessPrice |
| 7 | Reaktif Ceza | penaltyEnergy × reaktif_bedel |
| 8 | **Ara Toplam** | Σ(1-7) |
| 9 | KDV | araToplam × vatRate |
| 10 | **Fatura Toplamı** | araToplam + KDV |
| 11 | YEKDEM Mahsup | Ayrı hesaplanır (bkz: doc-03) |
| 12 | Diğer Değerler | subscription_yekdem.diger_degerler |
| 13 | **Final Toplam** | totalInvoice + yekdemMahsup + digerDegerler |

---

## 4. Snapshot Tablosu ve Kolonları

**Tablo:** `invoice_snapshots`

### Tanımlayıcı Kolonlar
| Kolon | Tip | Açıklama |
|-------|-----|----------|
| `user_id` | UUID | Kullanıcı |
| `subscription_serno` | number | Tesis numarası |
| `period_year` | number | Fatura yılı |
| `period_month` | number | Fatura ayı (1-12) |
| `invoice_type` | enum | `"billed"` veya `"backdated"` |
| `month_label` | text | Gösterim etiketi (örn: "Mart 2026") |

### Tüketim ve Fiyat
| Kolon | Tip | Açıklama |
|-------|-----|----------|
| `total_consumption_kwh` | numeric | Toplam tüketim |
| `total_production_kwh` | numeric | GES üretimi |
| `unit_price_energy` | numeric | Enerji birim fiyatı |
| `unit_price_distribution` | numeric | Dağıtım birim fiyatı |
| `btv_rate` | numeric | BTV oranı |
| `vat_rate` | numeric | KDV oranı |
| `tariff_type` | text | "single" / "dual" |

### Güç
| Kolon | Tip | Açıklama |
|-------|-----|----------|
| `contract_power_kw` | numeric | Sözleşme gücü |
| `month_final_demand_kw` | numeric | Ay sonu demand |
| `has_demand_data` | boolean | Demand verisi var mı |
| `power_price` | numeric | Güç bedeli birim fiyatı |
| `power_excess_price` | numeric | Güç aşım birim fiyatı |

### Reaktif
| Kolon | Tip | Açıklama |
|-------|-----|----------|
| `reactive_ri_percent` | numeric | İndüktif yüzdesi |
| `reactive_rc_percent` | numeric | Kapasitif yüzdesi |
| `reactive_penalty_charge` | numeric | Reaktif ceza (TL) |

### Kalem Detayları
| Kolon | Tip | Açıklama |
|-------|-----|----------|
| `energy_charge` | numeric | Enerji bedeli |
| `trafo_degeri` | numeric | Trafo değeri |
| `trafo_charge` | numeric | Trafo bedeli |
| `distribution_charge` | numeric | Dağıtım bedeli |
| `distribution_adjustment` | numeric | Veriş düzeltmesi |
| `btv_charge` | numeric | BTV tutarı |
| `power_base_charge` | numeric | Güç bedeli (baz) |
| `power_excess_charge` | numeric | Güç bedeli (aşım) |
| `diger_degerler` | numeric | Diğer kalemler |
| `subtotal_before_vat` | numeric | KDV öncesi ara toplam |
| `vat_charge` | numeric | KDV tutarı |
| `total_invoice` | numeric | Fatura toplamı |

### YEKDEM Mahsup
| Kolon | Tip | Açıklama |
|-------|-----|----------|
| `has_yekdem_mahsup` | boolean | Mahsup var mı |
| `yekdem_mahsup` | numeric | Mahsup tutarı (TL) |
| `total_with_mahsup` | numeric | Final toplam (mahsup dahil) |

### Zaman Damgaları
| Kolon | Tip | Açıklama |
|-------|-----|----------|
| `created_at` | timestamp | Oluşturma |
| `updated_at` | timestamp | Son güncelleme |

---

## 5. Snapshot Detay Sayfası

**Route:** `/dashboard/invoices/:sub/:year/:month`
**Component:** `src/pages/InvoiceSnapshotDetail.tsx`

```typescript
const snap = await getInvoiceSnapshot({
  userId: uid,
  subscriptionSerno: Number(sub),
  periodYear: Number(year),
  periodMonth: Number(month),
  invoiceType: "billed",
});
```

Bu sayfa sadece gösterim yapar, yeniden hesaplama yapmaz.

---

## 6. İlgili Component Dosyaları

| Dosya | Açıklama |
|-------|----------|
| `src/pages/InvoiceHistory.tsx` | Fatura listesi |
| `src/pages/InvoiceSnapshotDetail.tsx` | Snapshot detay |
| `src/components/dashboard/InvoiceDetail.tsx` | Fatura hesaplama + snapshot kaydetme |
| `src/components/utils/invoiceSnapshots.ts` | Snapshot CRUD fonksiyonları |
| `src/components/utils/calculateInvoice.ts` | `calculateInvoice()` |
| `src/components/utils/calculateInvoiceToDate.ts` | Gerçek zamanlı fatura hesabı |
| `src/components/dashboard/invoiceDetail/AlternateTariffInvoiceSection.tsx` | Alternatif tarife |
| `src/components/dashboard/GeneratedInvoicesSection.tsx` | Oluşturulmuş faturalar bölümü |
