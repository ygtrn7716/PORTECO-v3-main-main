# PortEco v3 — Dashboard Kartları

**Ana dosya:** `src/pages/Dashboard.tsx` (1771 satır)
**Kart tanımları:** `src/content/dashboardCards.ts`

---

## 1. Kart Düzeni

Dashboard'da GES durumuna göre iki farklı layout var:

**GES yoksa (3+3):**
```
Satır 1: [Aylık Tüketim] [Ort. PTF] [YEKDEM]
Satır 2: [Birim Fiyat]   [Fatura]   [Mahsup]
```

**GES varsa (3+4):**
```
Satır 1: [Aylık Tüketim] [GES Üretim] [Fatura]
Satır 2: [PTF] [YEKDEM] [Birim Fiyat] [Mahsup]   ← compact modda
```

Kart tanımları (`src/content/dashboardCards.ts`):

```typescript
export const DASH_CARDS = [
  { key: "consumption", title: "Aylık Toplam Tüketim (kWh)", path: "/dashboard/consumption" },
  { key: "ges",         title: "GES Üretim Detayları",       path: "/dashboard/ges" },
  { key: "cost",        title: "Geçen Ay Ortalama PTF",      path: "/dashboard/ptf" },
  { key: "yekdem",      title: "Geçen Ay YEKDEM",            path: "/dashboard/yekdem" },
  { key: "valley",      title: "Geçen Ay Birim Fiyat",       path: "/dashboard/valley" },
  { key: "anomaly",     title: "Geçmiş Faturalar",           path: "/dashboard/invoice-detail" },
  { key: "files",       title: "YEKDEM Mahsup Tutarı",       path: "/dashboard/yekdem-mahsup" },
];
```

---

## 2. Kart Detayları

### 2.1 Aylık Toplam Tüketim (kWh) — key: `consumption`

**Veri kaynağı:** `consumption_hourly` tablosu, `cn` kolonu
**Dönem:** Geçen ayın tamamı (ayın 1'i → bu ayın 1'i)

**Query** (Dashboard.tsx satır 524-531):
```typescript
const hourly = await fetchAllConsumption({
  supabase,
  userId: uid,
  subscriptionSerno: selectedSub,
  columns: "ts, cn, ri, rc, gn",
  startIso: start.toDate().toISOString(),   // geçen ay başı
  endIso: end.toDate().toISOString(),       // bu ay başı
});
```

**Hesaplama:**
```
prevMonthKwh = Σ cn   (tüm saatlik kayıtlar)
```

Aynı sorgudan `ri`, `rc`, `gn` değerleri de çekilir (reaktif ceza ve GES için).

---

### 2.2 GES Üretim Detayları (kWh) — key: `ges`

**Koşul:** Sadece kullanıcının aktif `ges_plants` kaydı varsa gösterilir.
**Veri kaynağı:** `ges_production_daily` tablosu, `energy_kwh` kolonu
**Dönem:** Bu ayın 1'i → bu ayın sonu

**Query** (Dashboard.tsx satır 1358-1385):
```typescript
// 1) Aktif GES plant'leri bul
const { data: plants } = await supabase
  .from("ges_plants")
  .select("id")
  .eq("user_id", uid)
  .eq("is_active", true);

// 2) Bu ayın üretimini topla
const { data } = await supabase
  .from("ges_production_daily")
  .select("energy_kwh")
  .in("ges_plant_id", plantIds)
  .gte("date", startOfMonth)
  .lte("date", endOfMonth);
```

**Hesaplama:**
```
gesMonthlyKwh = Σ energy_kwh
```

> **Not:** GES verisi `selectedSub`'dan bağımsızdır. Kullanıcının tüm aktif plant'lerinin toplamıdır.

---

### 2.3 Geçen Ay Ortalama PTF (TL/kWh) — key: `cost`

**Veri kaynağı:** RPC fonksiyonu `monthly_ptf_prev_sub`
**Dönem:** Geçen ay

**Query** (Dashboard.tsx satır 585-588):
```typescript
const { data } = await supabase.rpc("monthly_ptf_prev_sub", {
  p_tz: "Europe/Istanbul",
  p_subscription_serno: selectedSub,
});
```

**Hesaplama:**
```
monthlyPTF = data[0].ptf_tl_per_kwh
```

RPC fonksiyonu Supabase tarafında tesis bazlı ağırlıklı ortalama PTF hesaplar.

---

### 2.4 Geçen Ay YEKDEM (TL/kWh) — key: `yekdem`

**Veri kaynağı (öncelik sırasına göre):**
1. `subscription_yekdem` tablosu (tesis özel) → `yekdem_value` veya `yekdem_final`
2. `yekdem_official` tablosu (resmi EPİAŞ) → `yekdem_value` veya `yekdem_tl_per_kwh`

**Query — Tesis özel** (Dashboard.tsx satır 633-638):
```typescript
const subYek = await fetchSubscriptionYekdem({
  uid, sub: selectedSub,
  year: periodYear,
  month: periodMonth,     // geçen ay (1-12)
});
```

`fetchSubscriptionYekdem` fonksiyonu önce `period_year/period_month` kolonlarıyla sorgular; kolon bulunamazsa `year/month` ile fallback yapar.

**Query — Resmi (fallback)** (Dashboard.tsx satır 655-660):
```typescript
const { data: offRow } = await supabase
  .from("yekdem_official")
  .select("yekdem_value, yekdem_tl_per_kwh")
  .eq("year", periodYear)
  .eq("month", periodMonth)
  .maybeSingle();
```

**Subtitle gösterimi:**
- Tesis özel ise: `"TL/kWh (tesis özel YEKDEM)"`
- Resmi ise: `"TL/kWh (EPİAŞ resmi YEKDEM)"`

---

### 2.5 Geçen Ay Birim Fiyat (₺/kWh) — key: `valley`

**Veri kaynağı:** `subscription_settings` tablosu, `kbk` kolonu

**Query** (Dashboard.tsx satır 706-711):
```typescript
const { data } = await supabase
  .from("subscription_settings")
  .select("kbk")
  .eq("user_id", uid)
  .eq("subscription_serno", selectedSub)
  .maybeSingle();
```

**Hesaplama:**
```
unitPrice = (monthlyPTF + monthlyYekdem) × monthlyKbk
```

Burada:
- `monthlyPTF` = Kart 2.3'teki PTF değeri
- `monthlyYekdem` = Kart 2.4'teki YEKDEM değeri
- `monthlyKbk` = `subscription_settings.kbk` (Kayıp/Kaçak Bedeli katsayısı, varsayılan 1)

> **Not:** Bu kart tıklanabilir değildir (`onClick` tanımlı değil).

---

### 2.6 Geçmiş Faturalar (TL) — key: `anomaly`

**Veri kaynağı:** Birden fazla tablodan hesaplanır.
**Hesaplama pipeline'ı** (Dashboard.tsx satır 737-1059):

1. **Snapshot kontrolü:** Önce `invoice_snapshots` tablosunda kayıtlı fatura var mı bak:
```typescript
const snap = await supabase
  .from("invoice_snapshots")
  .select("total_with_mahsup, has_yekdem_mahsup, yekdem_mahsup")
  .eq("user_id", uid)
  .eq("subscription_serno", selectedSub)
  .eq("period_year", periodYear)
  .eq("period_month", periodMonth)
  .eq("invoice_type", "billed")
  .maybeSingle();
```

2. **Snapshot varsa:** `total_with_mahsup` direkt kullanılır.

3. **Snapshot yoksa:** Tam fatura hesaplaması yapılır:
   - `subscription_settings` → terim, gerilim, tarife, guc_bedel_limit, trafo_degeri
   - `distribution_tariff_official` → dagitim_bedeli, guc_bedeli, guc_bedeli_asim, kdv, btv, reaktif_bedel
   - `owner_subscriptions` → multiplier, btv_enabled
   - `demand_monthly` → max_demand_kw
   - `calculateInvoice()` çağrılır
   - YEKDEM mahsup (M-1) eklenir
   - `diger_degerler` eklenir

**Sonuç formülü:**
```
invoiceTotal = calculateInvoice(...).totalInvoice + yekdemMahsupValue + digerDegerler
```

---

### 2.7 YEKDEM Mahsup Tutarı (TL) — key: `files`

**Hesaplama** (Dashboard.tsx satır 932-1014):

M = geçen ay (fatura dönemi), M-1 = mahsup dönemi

1. M-1 dönemi tüketimini çek (`consumption_daily` → fallback `consumption_hourly`)
2. M-1 dönemi `subscription_yekdem` → `yekdem_value` + `yekdem_final`
3. `calculateYekdemMahsup()` çağır

```typescript
yekdemMahsupValue = calculateYekdemMahsup({
  totalKwh: prevPeriodKwh,     // M-1 tüketimi
  kbk: monthlyKbk,
  btvRate,
  vatRate,
  yekdemOld: yRow.yekdem_value,  // tahmini YEKDEM
  yekdemNew: yRow.yekdem_final,  // kesin YEKDEM
});
```

**Renk mantığı:**
| Durum | Renk | Anlamı |
|-------|------|--------|
| `yekdemMahsup > 0` | Kırmızı (`text-red-600`) | Kullanıcı aleyhine |
| `yekdemMahsup < 0` | Yeşil (`text-emerald-600`) | Kullanıcı lehine |
| Veri yok | Gri (`text-neutral-900`) | "—" gösterilir |

**Eksik veri durumları:**
- `yekdem_value` girilmemişse: `"Önceki dönem için yekdem_value girilmemiş."`
- `yekdem_final` girilmemişse: `"Önceki dönem için yekdem_final girilmemiş."`
- Her ikisi de yoksa: `"Önceki dönem YEKDEM verileri girilmemiş."`

---

## 3. Tesis Dropdown Seçimi

**Dosya:** `src/pages/Dashboard.tsx` satır 392-505

### Tesis Listesi Yükleme Akışı

1. `owner_subscriptions` tablosundan `subscription_serno, meter_serial, title` çekilir
2. `subscription_settings` tablosundan `nickname` override'ları yüklenir
3. `fetchHiddenSernos()` ile gizli tesisler filtrelenir (`subscription_settings.is_hidden = true`)
4. `resolveSelectedSub()` ile seçili tesis belirlenir

**Tesis etiketi:**
```typescript
const label = `${meterSerial} - ${nickname ?? title}`;
// Örnek: "12345678 - Fabrika A"
```

**Seçim kalıcılığı:** `localStorage` key = `"eco_selected_sub"`

**İlgili yardımcı dosyalar:**
- `src/lib/subscriptionVisibility.ts` → `resolveSelectedSub()`, `fetchHiddenSernos()`

---

## 4. "Tüm Tesisler" Toplamı

**Koşul:** `subs.length > 1` ise hesaplanır.
**Dosya:** `src/pages/Dashboard.tsx` satır 1062-1343

Her görünür tesis için sırayla:

1. `fetchAllConsumption()` → `cn, ri, rc, gn` topla → `grandTotalKwh` birikimi
2. `invoice_snapshots` kontrol → snapshot varsa `total_with_mahsup` kullan
3. Snapshot yoksa → aynı hesaplama pipeline'ı (PTF, YEKDEM, KBK, tarife, demand...)
4. `calculateInvoice()` + YEKDEM mahsup + diger_degerler → `grandTotalInvoice` birikimi

**Gösterim:**
```
Kartın altında: "Tüm tesisler: 123.456 kWh" veya "Tüm tesisler: 45.678,90 TL"
```

Hangi kartlarda toplam gösterilir:
- `consumption` → kWh toplamı
- `anomaly` → Fatura TL toplamı
- `files` → Mahsup TL toplamı

---

## 5. İlgili Component Dosyaları

| Dosya | Açıklama |
|-------|----------|
| `src/pages/Dashboard.tsx` | Ana dashboard sayfası, tüm kartlar |
| `src/content/dashboardCards.ts` | Kart başlık/yol tanımları |
| `src/components/utils/calculateInvoice.ts` | `calculateInvoice()` + `calculateYekdemMahsup()` |
| `src/lib/subscriptionVisibility.ts` | Tesis seçimi + gizleme |
| `src/lib/paginatedFetch.ts` | `fetchAllConsumption()` — sayfalı veri çekme |
| `src/components/utils/invoiceSnapshots.ts` | `getInvoiceSnapshot()` |
| `src/components/dashboard/ReactiveSection.tsx` | Dashboard altındaki reaktif bölümü |
| `src/components/dashboard/DashboardShell.tsx` | Sidebar + TopBar layout |
