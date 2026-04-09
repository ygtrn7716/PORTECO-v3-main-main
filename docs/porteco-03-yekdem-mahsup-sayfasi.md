# PortEco v3 — YEKDEM Mahsup Sayfası

**Route:** `/dashboard/yekdem-mahsup`
**Component:** `src/components/dashboard/YekdemMahsupDetail.tsx`
**Hesaplama:** `src/components/utils/calculateInvoice.ts` → `calculateYekdemMahsup()`

---

## 1. Sayfa Genel Görünüm

Sayfa 3 kart + 1 hesap tablosu gösterir:

```
┌──────────────────┐ ┌──────────────────┐ ┌──────────────────┐
│ M-1 Tüketim      │ │ YEKDEM Farkı     │ │ Mahsup Tutarı    │
│ Toplamı (kWh)    │ │ (Yeni - Eski)    │ │ (KDV dahil)      │
│                  │ │ TL/kWh           │ │ Kırmızı / Yeşil  │
└──────────────────┘ └──────────────────┘ └──────────────────┘

┌───────────────────────────────────────────────────────────────┐
│ Hesap Adımları Tablosu                                       │
│ 1) YEKDEM Farkı → 2) Enerji Farkı → 3) BTV → 4) KDV       │
└───────────────────────────────────────────────────────────────┘
```

---

## 2. Veri Çekme Süreci

### 2.1 Tarih Hesabı

```typescript
const billingMonth = dayjsTR().subtract(1, "month");          // M = geçen ay faturası
const mahsupMonth  = billingMonth.subtract(1, "month");        // M-1 = mahsup dönemi
```

Bugün 6 Nisan 2026 ise:
- M = Mart 2026 (fatura dönemi)
- M-1 = Şubat 2026 (mahsup hesabının dayandığı dönem)

### 2.2 Tesis Listesi

**Query** (satır 141-144):
```typescript
const { data } = await supabase
  .from("subscription_settings")
  .select("subscription_serno, title, nickname, is_hidden")
  .eq("user_id", uid)
  .order("subscription_serno", { ascending: true });
```

Gizli tesisler (`is_hidden = true`) filtrelenir.

**Fallback:** `subscription_settings` boşsa `owner_subscriptions` tablosundan çekilir.

### 2.3 Tesis Ayarları (KBK, Tarife)

**Query** (satır 229-234):
```typescript
const settingsRes = await supabase
  .from("subscription_settings")
  .select("kbk, terim, gerilim, tarife")
  .eq("user_id", uid)
  .eq("subscription_serno", selectedSub)
  .maybeSingle();
```

- `kbk`: Kayıp/Kaçak Bedeli katsayısı (varsayılan: 1)
- `terim`, `gerilim`, `tarife`: Tarife parametreleri

### 2.4 BTV ve KDV Oranları

**Query** (satır 253-259):
```typescript
const tariffRes = await supabase
  .from("distribution_tariff_official")
  .select("kdv, btv")
  .eq("terim", terim)
  .eq("gerilim", gerilim)
  .eq("tarife", tarife)
  .maybeSingle();
```

**Kaynak:** Tamamen DB'den gelir (hardcode değil).

```typescript
const btvRate = tariffRes.data.btv / 100;   // Örn: 1 → 0.01
const vatRate = tariffRes.data.kdv / 100;   // Örn: 20 → 0.20
```

### 2.5 M-1 Tüketim Verisi

**Öncelik 1 — `consumption_daily`** (satır 273-279):
```typescript
const dailyPrev = await supabase
  .from("consumption_daily")
  .select("day, kwh_in")
  .eq("user_id", uid)
  .eq("subscription_serno", selectedSub)
  .gte("day", prevStart.format("YYYY-MM-DD"))
  .lt("day", prevEndExclusive.format("YYYY-MM-DD"));
```

**Öncelik 2 — `consumption_hourly` (fallback)** (satır 287-294):
```typescript
const hourlyPrev = await fetchAllConsumption({
  supabase,
  userId: uid,
  subscriptionSerno: selectedSub,
  columns: "ts, cn",
  startIso: prevStart.toDate().toISOString(),
  endIso: prevEndExclusive.toDate().toISOString(),
});
```

**Hesaplama:** `totalKwh = Σ kwh_in` veya `Σ cn`

> Tüketim 0 kWh ise hata fırlatılır: `"... tüketim verisi bulunamadı (0 kWh)."`

### 2.6 YEKDEM Değerleri (M-1)

**Fonksiyon:** `fetchSubYekdemForMahsup()` (satır 46-93)

```typescript
// Önce period_year/period_month ile sorgula
const r1 = await supabase
  .from("subscription_yekdem")
  .select("yekdem_value, yekdem_final")
  .eq("user_id", uid)
  .eq("subscription_serno", sub)
  .eq("period_year", year)
  .eq("period_month", month)
  .maybeSingle();

// Kolon bulunamazsa year/month ile fallback
```

Her iki değer de gereklidir:
- `yekdem_value` = Tahmini YEKDEM (fatura kesilirken kullanılan)
- `yekdem_final` = Kesin YEKDEM (sonradan açıklanan resmi değer)

Biri bile yoksa hata: `"... için yekdem_value/yekdem_final eksik. (Mahsup hesaplanamaz)"`

---

## 3. Hesaplama Adımları

**Fonksiyon:** `calculateYekdemMahsup()` (`src/components/utils/calculateInvoice.ts` satır 172-203)

```typescript
export function calculateYekdemMahsup({
  totalKwh, kbk, btvRate, vatRate, yekdemOld, yekdemNew,
}: YekdemMahsupParams): number {
  // 1) YEKDEM birim fiyat farkı (TL/kWh)
  const diffYekdem = yekdemNew - yekdemOld;

  // 2) Enerji bedeli farkı
  const deltaEnergy = diffYekdem * kbk * totalKwh;

  // 3) BTV ekle
  const subtotalWithoutVat = deltaEnergy * (1 + btvRate);

  // 4) KDV ekle → net mahsup tutarı
  const deltaTotal = subtotalWithoutVat * (1 + vatRate);

  return deltaTotal;
}
```

### Matematiksel Formül

```
Adım 1: YEKDEM Farkı (TL/kWh)
  diffYekdem = yekdemNew − yekdemOld

Adım 2: Enerji Farkı (TL)
  deltaEnergy = diffYekdem × KBK × totalKwh

Adım 3: BTV Dahil (TL)
  subtotalWithoutVat = deltaEnergy × (1 + btvRate)

Adım 4: KDV Dahil / Final (TL)
  deltaTotal = subtotalWithoutVat × (1 + vatRate)
```

### Sayısal Örnek

| Parametre | Değer |
|-----------|-------|
| totalKwh | 100.000 kWh |
| kbk | 1.04 |
| yekdemOld | 0.085000 TL/kWh |
| yekdemNew | 0.092000 TL/kWh |
| btvRate | 0.01 (%1) |
| vatRate | 0.20 (%20) |

```
diffYekdem     = 0.092000 - 0.085000 = 0.007000 TL/kWh
deltaEnergy    = 0.007000 × 1.04 × 100000 = 728.00 TL
BTV dahil      = 728.00 × 1.01 = 735.28 TL
KDV dahil      = 735.28 × 1.20 = 882.336 TL (kullanıcı aleyhine +)
```

---

## 4. KBK Değeri Nereden Geliyor?

**Kaynak:** `subscription_settings.kbk`
- Tesis bazlı tanımlanır
- Admin panelinden girilir (`/dashboard/admin/subscription-settings`)
- Varsayılan değer: 1 (null veya geçersizse)
- KBK = Kayıp/Kaçak Bedeli katsayısı (enerji fiyatına uygulanır)

---

## 5. BTV ve KDV Nereden Geliyor?

**Kaynak:** `distribution_tariff_official` tablosu
- **BTV (Belediye Tüketim Vergisi):** `btv` kolonu (yüzde, örn: 1 = %1)
- **KDV (Katma Değer Vergisi):** `kdv` kolonu (yüzde, örn: 20 = %20)
- Tesisin `terim + gerilim + tarife` kombinasyonuna göre eşleştirilir
- **Hardcode değil, tamamen DB'den gelir**

---

## 6. Pozitif/Negatif Gösterim Mantığı

```typescript
const mahsupView = useMemo(() => {
  if (!payload) return null;
  const v = payload.deltaTotal;
  const cls = v > 0 ? "text-red-600" : "text-emerald-600";
  return { cls, abs: Math.abs(v) };
}, [payload]);
```

| deltaTotal | Renk | Anlamı |
|------------|------|--------|
| `> 0` | **Kırmızı** (`text-red-600`) | Kullanıcı aleyhine (ek ödeme) |
| `< 0` | **Yeşil** (`text-emerald-600`) | Kullanıcı lehine (iade/indirim) |
| `null` | Gri | "—" gösterilir |

> **Sayfa içi not (satır 531-534):** "Pozitif mahsup (deltaTotal > 0) kullanıcı aleyhine olduğu için kırmızı gösterilir. Negatif mahsup kullanıcı lehine olduğu için yeşil gösterilir."

---

## 7. Admin Veri Giriş Akışı

Admin, YEKDEM mahsup hesaplaması için gerekli verileri şu sayfadan girer:

**Route:** `/dashboard/admin/subscription-yekdem`
**Component:** `src/pages/admin/SubscriptionYekdemAdmin.tsx`

Girilmesi gereken kolonlar:
- `user_id` — Kullanıcı
- `subscription_serno` — Tesis numarası
- `period_year` — Yıl
- `period_month` — Ay
- `yekdem_value` — Tahmini YEKDEM (TL/kWh)
- `yekdem_final` — Kesin YEKDEM (TL/kWh)
- `diger_degerler` — Diğer ek kalemler (TL)

Detaylı admin akışı için bkz: `docs/porteco-06-admin-paneli.md`

---

## 8. Bilinen Bug: Bazı Tesislerin Dashboard Kartında Görünmeme Sorunu

### Sorunun Tanımı
Admin panelinden YEKDEM verileri (`yekdem_value`, `yekdem_final`) girilmesine rağmen, bazı tesislerin dashboard kartında mahsup değeri "—" olarak görünür veya hata verir.

### Kök Neden

Dashboard'daki mahsup hesabı için şu zincir gereklidir:

```
subscription_settings → kbk, terim, gerilim, tarife (zorunlu)
      ↓
distribution_tariff_official → btv, kdv (zorunlu, terim/gerilim/tarife ile eşleşir)
      ↓
consumption_daily / consumption_hourly → totalKwh (> 0 olmalı)
      ↓
subscription_yekdem → yekdem_value + yekdem_final (her ikisi de gerekli)
```

**Kırılma noktaları:**

1. **`subscription_settings` kaydı yoksa** (Dashboard.tsx satır 798-802):
   ```typescript
   if (!settings) {
     setInvoiceTotal(null);
     setYekdemMahsup(null);
     setHasYekdemMahsup(false);
     return;  // ← Sessizce çıkar, hata mesajı yok
   }
   ```
   → Tesis için `kbk`, `terim`, `gerilim`, `tarife` değerleri olmadığından hesaplama hiç başlamaz.

2. **`terim/gerilim/tarife` boşsa** (Dashboard.tsx satır 817-822):
   ```typescript
   if (!terim || !gerilim || !tarife) {
     setInvoiceTotal(null);
     setYekdemMahsup(null);
     setHasYekdemMahsup(false);
     return;  // ← Sessizce çıkar
   }
   ```

3. **`distribution_tariff_official` eşleşmesi bulunamazsa** (satır 835-840):
   Tarife parametreleri ile eşleşen kayıt yoksa hesaplama durur.

4. **Tüketim verisi 0 kWh ise** (`YekdemMahsupDetail.tsx` satır 304):
   ```typescript
   if (!(totalKwh > 0)) {
     throw new Error(`... tüketim verisi bulunamadı (0 kWh).`);
   }
   ```

### Fix Önerisi

1. **`subscription_settings` zorunlu kontrol:** Admin YEKDEM verisi girerken, ilgili tesis için `subscription_settings` kaydının varlığını kontrol et. Yoksa uyarı göster.

2. **Dashboard'da net hata mesajı:** Settings bulunamazsa `setInvoiceErr("Tesis ayarları (subscription_settings) eksik.")` set et (şu an sessizce çıkıyor).

3. **YekdemMahsupDetail sayfasında zaten düzgün hata gösterimi var** (satır 237): `"subscription_settings bulunamadı."` hatası fırlatılır. Sorun sadece Dashboard kartında sessiz kalmasıdır.

---

## 9. İlgili Component Dosyaları

| Dosya | Açıklama |
|-------|----------|
| `src/components/dashboard/YekdemMahsupDetail.tsx` | Mahsup detay sayfası |
| `src/components/utils/calculateInvoice.ts` | `calculateYekdemMahsup()` fonksiyonu |
| `src/pages/Dashboard.tsx` | Dashboard kartı hesaplaması (satır 932-1014) |
| `src/pages/admin/SubscriptionYekdemAdmin.tsx` | Admin YEKDEM veri girişi |
| `src/lib/paginatedFetch.ts` | `fetchAllConsumption()` |
| `src/lib/subscriptionVisibility.ts` | `resolveSelectedSub()` |
