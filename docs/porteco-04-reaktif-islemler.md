# PortEco v3 — Reaktif İşlemler

**Component:** `src/components/dashboard/ReactiveSection.tsx`
**Ceza hesabı:** `src/pages/Dashboard.tsx` (satır 900-914)

---

## 1. Genel Bakış

Reaktif enerji, elektrik şebekesinde aktif güçten bağımsız olarak tüketilen/üretilen güçtür. TEDAŞ düzenlemelerine göre reaktif/aktif oranı belirlenen limitleri aşarsa ceza uygulanır.

Projede 4 reaktif tip izlenir:

| Kısaltma | Tam Adı | Yön | Referans |
|----------|---------|-----|----------|
| **RI** | Reaktif İndüktif (Çekiş) | Tüketim | Aktif kWh (cn) |
| **RC** | Reaktif Kapasitif (Çekiş) | Tüketim | Aktif kWh (cn) |
| **RIO** | Reaktif İndüktif (Veriş) | Üretim | Üretim kWh (gn) |
| **RCO** | Reaktif Kapasitif (Veriş) | Üretim | Üretim kWh (gn) |

RIO ve RCO sadece GES (güneş enerjisi) tesisi olan kullanıcılarda gösterilir (`hasGes = true`).

---

## 2. Limit Kontrol Mantığı

**Sabit değerler** (ReactiveSection.tsx satır 14-15):
```typescript
const REACTIVE_LIMIT_RI = 20;  // %20 İndüktif
const REACTIVE_LIMIT_RC = 15;  // %15 Kapasitif
```

**Oran hesabı:**

Çekiş (tüketim) için:
```
riPct = (totalRi / activeKwh) × 100
rcPct = (totalRc / activeKwh) × 100
```

Veriş (üretim) için:
```
rioPct = (totalRio / totalGn) × 100
rcoPct = (totalRco / totalGn) × 100
```

| Tip | Limit | Aşım Durumu |
|-----|-------|-------------|
| İndüktif (RI/RIO) | %20 | `ratioPct > 20` → Limit Aşıldı |
| Kapasitif (RC/RCO) | %15 | `ratioPct > 15` → Limit Aşıldı |

---

## 3. Veri Kaynağı

**Tablo:** `consumption_hourly`
**Kolonlar:** `cn` (aktif), `ri`, `rc`, `rio`, `rco`, `gn` (üretim)

**Query** (ReactiveSection.tsx satır 180-187):
```typescript
const res = await fetchAllConsumption({
  supabase,
  userId: uid,
  subscriptionSerno: subscriptionSerNo,
  columns: "cn, ri, rc, rio, rco, gn",
  startIso: start.toDate().toISOString(),   // bu ayın başı
  endIso: end.toDate().toISOString(),       // şimdiki zaman + 1 saat
});
```

**Dönem:** Bu ayın başından şimdiye kadar (ay-içi toplam)

**Toplama:**
```typescript
for (const r of res.data) {
  cn  += Number(r.cn)  || 0;
  ri  += Number(r.ri)  || 0;
  rc  += Number(r.rc)  || 0;
  rio += Number(r.rio) || 0;
  rco += Number(r.rco) || 0;
  gn  += Number(r.gn)  || 0;
}
```

---

## 4. Ceza Hesabı

> **Not:** Ceza hesabı `ReactiveSection.tsx`'de yapılmaz. Sadece oran gösterimi ve limit kontrolü yapılır. Gerçek TL ceza hesabı `Dashboard.tsx` (satır 900-914) ve `calculateInvoice()` fonksiyonunda yapılır.

**Dashboard.tsx'deki ceza hesabı:**

```typescript
const REACTIVE_LIMIT_RI = 20;
const REACTIVE_LIMIT_RC = 15;

const riPercent = prevMonthKwh > 0 ? (totalRi / prevMonthKwh) * 100 : 0;
const rcPercent = prevMonthKwh > 0 ? (totalRc / prevMonthKwh) * 100 : 0;

const reactiveUnitPrice = tariffRow.reaktif_bedel;  // distribution_tariff_official tablosundan

// Limit aşıldığında TÜM reaktif değer cezalandırılır
const riPenaltyEnergy = riPercent > REACTIVE_LIMIT_RI ? totalRi : 0;
const rcPenaltyEnergy = rcPercent > REACTIVE_LIMIT_RC ? totalRc : 0;

const penaltyEnergy = riPenaltyEnergy + rcPenaltyEnergy;
const reactivePenaltyCharge = penaltyEnergy * reactiveUnitPrice;  // TL
```

**Matematiksel formül:**
```
Eğer RI% > 20:
  riPenalty = totalRi × reaktif_bedel

Eğer RC% > 15:
  rcPenalty = totalRc × reaktif_bedel

reactivePenaltyCharge = riPenalty + rcPenalty
```

**Reaktif birim fiyat kaynağı:**
- `distribution_tariff_official.reaktif_bedel` (TL/kVArh)
- Tesisin `terim + gerilim + tarife` parametrelerine göre eşleşir

**Ceza faturaya dahil edilme:**
```typescript
// calculateInvoice() içinde:
subtotalBeforeVat = energyCharge + trafoCharge + distributionCharge
                  + btvCharge + powerTotalCharge + reactivePenaltyCharge;

vatCharge = subtotalBeforeVat * vatRate;
totalInvoice = subtotalBeforeVat + vatCharge;
```

---

## 5. Progress Bar Hesabı

**Component:** `Bar` (ReactiveSection.tsx satır 30-53)

```typescript
function Bar({ valuePct, limitPct }: { valuePct: number; limitPct: number }) {
  const v = clamp(valuePct, 0, 100);
  const limit = clamp(limitPct, 0, 100);

  return (
    <div className="relative h-4 w-full rounded-full bg-neutral-100 overflow-hidden">
      {/* Doluluk çubuğu */}
      <div
        className={"h-full " + (v > limit ? "bg-red-500" : "bg-emerald-500")}
        style={{ width: `${v}%` }}
      />
      {/* Limit çizgisi */}
      <div
        className="absolute top-0 h-full w-[2px] bg-neutral-500/70"
        style={{ left: `${limit}%` }}
      />
    </div>
  );
}
```

**Görsel:**
```
0%────────────[LIMIT]──────────100%
▓▓▓▓▓▓▓▓▓▓▓▓▓▓│░░░░░░░░░░░░░░░░░   ← Limit içinde (yeşil)
▓▓▓▓▓▓▓▓▓▓▓▓▓▓│▓▓▓▓▓▓▓░░░░░░░░░░   ← Limit aşıldı (kırmızı)
               ↑
           Limit marker
```

| Durum | Doluluk rengi | Badge |
|-------|---------------|-------|
| `ratioPct ≤ limitPct` | `bg-emerald-500` (yeşil) | "Limit İçinde" (yeşil) |
| `ratioPct > limitPct` | `bg-red-500` (kırmızı) | "Limit Aşıldı" (kırmızı) |

---

## 6. Görünüm Modları

### Toggle Modu (`displayMode = "toggle"`)

Segmented control ile "Çekiş" ve "Veriş" sekmesi:
- **Çekiş:** RI + RC kartları (her zaman gösterilir)
- **Veriş:** RIO + RCO kartları (sadece GES varsa)
- 2 kart yan yana grid'de

### Pill Modu (`displayMode = "pill"`)

Katlanabilir accordion tarzı:
- Her tip bir pill satırı olarak gösterilir
- Limit aşıldıysa otomatik açık (kapatılamaz)
- Limit içinde ise tıklanınca açılır/kapanır
- Pill'de oran yüzdesi ve durum badge'i gösterilir

**Mod seçimi:** `localStorage` key = `"eco_reactive_display_mode"` (varsayılan: "toggle")

---

## 7. ReactiveCard Detayı

Her kart şunları gösterir:
- **Başlık:** Örn. "Reaktif İndüktif (Çekiş)"
- **Alt başlık:** "Bu ayki toplam reaktif / aktif oranı"
- **Oran:** `%12.5` gibi büyük sayı
- **Detay:** `Reaktif toplam: 5.432 kvarh • Aktif toplam: 43.456 kWh`
- **Progress bar:** Limit çizgisi ile görsel gösterim
- **Durum badge:** "Limit İçinde" veya "Limit Aşıldı"
- **Uyarı mesajı:** Aşıldıysa "Limit aşıldığı için reaktif ceza riski vardır."

---

## 8. İlgili Component Dosyaları

| Dosya | Açıklama |
|-------|----------|
| `src/components/dashboard/ReactiveSection.tsx` | Reaktif görünüm component'i |
| `src/pages/Dashboard.tsx` (satır 900-914) | TL ceza hesabı |
| `src/components/utils/calculateInvoice.ts` (satır 122-126) | Cezanın faturaya dahil edilmesi |
| `src/lib/paginatedFetch.ts` | `fetchAllConsumption()` |
