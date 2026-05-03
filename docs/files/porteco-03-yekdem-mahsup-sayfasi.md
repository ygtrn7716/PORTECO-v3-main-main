# PortEco Web — YEKDEM Mahsup Sayfası

`/dashboard/yekdem-mahsup` route'u, kesilmiş fatura ile gerçekleşen YEKDEM birim fiyatı arasındaki farkı tesis bazında hesaplayıp adım adım gösterir. Bu doküman; sayfa amacı, hesaplama formülü, veri çekim zinciri, admin tarafı veri girişi, bilinen kırılma noktaları ve UI bileşenlerini birebir koddan derleyerek anlatır.

Kaynak dosyalar:

- `src/components/dashboard/YekdemMahsupDetail.tsx` (540 satır)
- `src/components/utils/calculateInvoice.ts` (`calculateYekdemMahsup` fonksiyonu)
- `src/lib/paginatedFetch.ts`
- `src/lib/subscriptionVisibility.ts`
- `src/pages/Dashboard.tsx` (Dashboard kart hesaplaması ile aynı pipeline'ı paylaşır)
- `src/pages/admin/SubscriptionYekdemAdmin.tsx`
- `supabase/migrations/*.sql` (özellikle `subscription_yekdem` ile ilgili olanlar)

## 1. Sayfanın Amacı

YEKDEM (Yenilenebilir Enerji Kaynakları Destekleme Mekanizması) bedeli aylık olarak EPDK tarafından açıklanır. Tedarikçi ay başında **tahmini YEKDEM** (`yekdem_value`) kullanarak fatura keser. Ay kapandığında **kesin YEKDEM** (`yekdem_final`) açıklanır. İki değer arasındaki fark sonraki dönemin faturasına **mahsup (offset)** olarak yansır.

Sayfa M-1 dönemine ait tüketim (kWh), tahmini YEKDEM ve kesin YEKDEM değerlerini birleştirip tesis için net mahsup tutarını **KDV dahil** TL olarak hesaplar. Pozitif sonuç kullanıcının **aleyhine**, negatif sonuç **lehine** anlamına gelir.

## 2. Hesaplama Formülü

`calculateYekdemMahsup()` fonksiyonu (`src/components/utils/calculateInvoice.ts:232`) dört adımı sırayla uygular:

```
diffYekdem        = yekdemNew - yekdemOld                       // TL/kWh
deltaEnergy       = diffYekdem × kbk × totalKwh                 // TL (KDV öncesi)
subtotalWithoutVat = deltaEnergy × (1 + btvRate)                 // BTV dahil
deltaTotal        = subtotalWithoutVat × (1 + vatRate)           // KDV dahil → final
```

| Terim | Birim | Kaynak | Açıklama |
| --- | --- | --- | --- |
| `yekdemOld` | TL/kWh | `subscription_yekdem.yekdem_value` | Tedarikçinin faturada kullandığı tahmini YEKDEM |
| `yekdemNew` | TL/kWh | `subscription_yekdem.yekdem_final` | EPDK tarafından açıklanan kesin YEKDEM |
| `kbk` | birimsiz | `subscription_settings.kbk` | Kayıp/Kaçak Bedeli katsayısı (varsayılan `1`) |
| `totalKwh` | kWh | `consumption_daily.kwh_in` toplamı veya `consumption_hourly.cn` toplamı | M-1 dönem toplam tüketim |
| `btvRate` | oran | `distribution_tariff_official.btv / 100` | Belediye Tüketim Vergisi |
| `vatRate` | oran | `distribution_tariff_official.kdv / 100` | KDV |

Sayısal örnek: `yekdemOld = 0.250000`, `yekdemNew = 0.275000`, `kbk = 1.05`, `totalKwh = 50.000`, `btvRate = 0.01`, `vatRate = 0.20` → `diffYekdem = 0.025`, `deltaEnergy = 0.025 × 1.05 × 50.000 = 1.312,50 TL`, `subtotalWithoutVat = 1.325,625`, `deltaTotal ≈ 1.590,75 TL` (kullanıcı aleyhine).

`Number.isFinite` kontrolü herhangi bir parametre eksik veya geçersizse fonksiyon `0` döndürür.

## 3. Pozitif vs Negatif Sonuç

| `deltaTotal` işareti | Anlam | UI gösterimi |
| --- | --- | --- |
| `> 0` | Yeni YEKDEM eski tahminden yüksek → kullanıcı aleyhine ek borç | Kırmızı (`text-red-600`), başına `-` işareti gösterilir |
| `< 0` | Yeni YEKDEM eski tahminden düşük → kullanıcı lehine iade/eksiltme | Yeşil (`text-emerald-600`), başına `+` işareti gösterilir |
| `= 0` | Fark yok | Nötr renk |

Sayfada işaret kullanıcı dostudur (lehine `+`, aleyhine `-`). Dashboard kartında ise sayı doğrudan TL biçiminde gösterilir; renk kodu aynı mantıkla uygulanır.

UI yorumu (`YekdemMahsupDetail.tsx:531-534`):

> "Pozitif mahsup (deltaTotal > 0) kullanıcı aleyhine olduğu için "-" (kırmızı) gösterilir. Negatif mahsup kullanıcı lehine olduğu için "+" (yeşil) gösterilir."

## 4. Veri Çekim Zinciri

`YekdemMahsupDetail.tsx` iki `useEffect` içerir.

### Effect 0 — Tesis Listesi (`YekdemMahsupDetail.tsx:130`)

Bağımlılık: `[uid, sessionLoading]`.

1. `subscription_settings`'ten `subscription_serno, title, nickname, is_hidden` çek (kullanıcıya ait).
2. `is_hidden = true` olanları filtrele.
3. Eğer `subscription_settings` boş ise `owner_subscriptions` üzerinden fallback liste üret.
4. `resolveSelectedSub(visibleSernos, selectedSub)` ile localStorage seçimini doğrula.

### Effect 1 — Mahsup Hesabı (`YekdemMahsupDetail.tsx:208`)

Bağımlılık: `[uid, sessionLoading, selectedSub]`.

Adım sırası:

1. **Tarih hesabı:**
   - `billingMonth = dayjsTR().subtract(1, "month")` → kesilmiş fatura ayı (M)
   - `mahsupMonth = billingMonth.subtract(1, "month")` → mahsup edilen ay (M-1)
   - `billingLabel = billingMonth.format("MMMM YYYY")` (örn. `"Nisan 2026"`)
   - `mahsupMonthLabel = mahsupMonth.format("MMMM YYYY")` (örn. `"Mart 2026"`)

2. **`subscription_settings` oku:**
   ```sql
   SELECT kbk, terim, gerilim, tarife
   FROM subscription_settings
   WHERE user_id = :uid AND subscription_serno = :sub
   ```
   - Satır yoksa: `Error("subscription_settings bulunamadı.")` fırlatılır.
   - `kbk` null veya finite değilse varsayılan `1`.
   - `terim`, `gerilim` veya `tarife` null ise: `Error("Tesis ayarları eksik: terim/gerilim/tarife")` fırlatılır.

3. **`distribution_tariff_official` oku:**
   ```sql
   SELECT kdv, btv FROM distribution_tariff_official
   WHERE terim = :terim AND gerilim = :gerilim AND tarife = :tarife
   ```
   - Eşleşme yoksa: `Error("Uygun dağıtım tarifesi bulunamadı.")`.
   - `btvRate = btv / 100`, `vatRate = kdv / 100`.

4. **M-1 dönem toplam tüketimi:**
   - Önce `consumption_daily` denenir:
     ```sql
     SELECT day, kwh_in FROM consumption_daily
     WHERE user_id = :uid AND subscription_serno = :sub
       AND day >= :prevStart AND day < :prevEndExclusive
     ```
     `totalKwh = Σ kwh_in`.
   - Veri yoksa veya hata varsa `paginatedFetch.fetchAllConsumption()` ile saatlik tüketim çekilir (`consumption_hourly`):
     ```
     columns = "ts, cn"
     totalKwh = Σ Number(r.cn)
     ```
   - `totalKwh <= 0` ise: `Error("<MahsupAyı> dönemi tüketim verisi bulunamadı (0 kWh).")`.

5. **YEKDEM değerlerini oku** (`fetchSubYekdemForMahsup`):
   - Birincil: `subscription_yekdem` `(period_year, period_month)` filtreleriyle.
   - Eğer kolon yoksa fallback: aynı tabloda `(year, month)` kolonları (legacy).
   - Dönüş: `{ yekdem_value, yekdem_final }`.
   - `yekdem_value` veya `yekdem_final` null ise: `Error("<MahsupAyı> için yekdem_value/final eksik. (Mahsup hesaplanamaz)")`.

6. **`calculateYekdemMahsup({ totalKwh, kbk, btvRate, vatRate, yekdemOld, yekdemNew })`** çağrılır → `deltaTotal`.

7. **State güncellenir** (`payload` objesi): `billingLabel`, `mahsupMonthLabel`, `totalKwh`, `kbk`, `btvRate`, `vatRate`, `yekdemOld`, `yekdemNew`, `diffYekdem`, `deltaEnergy`, `subtotalWithoutVat`, `deltaTotal`.

### Veri Akışı Özeti

```
subscription_settings (kbk, terim, gerilim, tarife)
        │
        ├─► distribution_tariff_official (kdv, btv)
        │
        ├─► consumption_daily (kwh_in)
        │      └─► fallback: consumption_hourly (cn)
        │
        └─► subscription_yekdem (yekdem_value, yekdem_final)
                                     │
                                     ▼
                       calculateYekdemMahsup() → TL (KDV dahil)
```

## 5. Renklendirme Mantığı (Kod Referansı)

`YekdemMahsupDetail.tsx:380-386`:

```typescript
const mahsupView = useMemo(() => {
  if (!payload) return null;
  const v = payload.deltaTotal;
  const sign = v > 0 ? "+" : "-";
  const cls = v > 0 ? "text-red-600" : "text-emerald-600";
  return { cls, abs: Math.abs(v) };
}, [payload]);
```

Üç adet ana özet kart (`YekdemMahsupDetail.tsx:450-478`) gösterilir:

| Kart | İçerik |
| --- | --- |
| M-1 Tüketim Toplamı | `fmtKwh0(totalKwh)` kWh + ay etiketi |
| YEKDEM Farkı (Yeni − Eski) | `fmtNum6(diffYekdem)` TL/kWh + eski/yeni alt satır |
| Mahsup Tutarı (KDV dahil) | `fmtMoney2(abs(deltaTotal))` TL + KBK/BTV/KDV bilgisi |

Hesap adımları tablosu 4 satır içerir:

| # | Açıklama | Formül | Sonuç |
| --- | --- | --- | --- |
| 1 | YEKDEM Farkı | Gerçekleşen − Tedarikçi Tahmin Yekdem | `diffYekdem` TL/kWh |
| 2 | Enerji Farkı | Yek Farkı × KBK × Toplam Tüketim | `deltaEnergy` TL |
| 3 | BTV Dahil | += %1 BTV | `subtotalWithoutVat` TL |
| 4 | KDV Dahil (Final) | += KDV | `deltaTotal` TL (mutlak değer, renkli) |

## 6. Admin Tarafı: Veri Girişi

Mahsup hesabını mümkün kılan tek veri kaynağı `subscription_yekdem` tablosudur. Admin `/dashboard/admin/subscription-yekdem` sayfasında (`SubscriptionYekdemAdmin.tsx`) `TableManager` aracılığıyla bu tabloya satır ekler veya günceller. Kolonlar:

| Kolon | Tip | Anlam |
| --- | --- | --- |
| `user_id` | uuid | Kullanıcı kimliği |
| `subscription_serno` | bigint | Tesis seri numarası |
| `period_year` | int | Yıl (örn. 2026) |
| `period_month` | int | Ay (1-12) |
| `yekdem_value` | numeric | Tahmini YEKDEM (TL/kWh) |
| `yekdem_final` | numeric | Kesin YEKDEM (TL/kWh) |
| `diger_degerler` | numeric | Bu döneme ait ek mahsup/iade kalemleri (TL); fatura toplamına eklenir |

Tipik akış:

1. Faturanın kesildiği gün: `yekdem_value` doldurulur. `yekdem_final` boş bırakılır.
2. EPDK kesin değeri açıkladığında: `yekdem_final` güncellenir.
3. `Dashboard.tsx` ve `YekdemMahsupDetail.tsx` `period_year/period_month` (yeni şema) ile, eski ortamlarda `(year, month)` (legacy) ile satırı okur.

> Eğer `yekdem_value` ya da `yekdem_final` boş ise YekdemMahsupDetail sayfası net hata mesajı verir. Dashboard kartında ise yalnızca "—" görünür ve `yekdemMissing` state'i ihtimallerden birine düşer (`"value" | "final" | "both"`).

## 7. Bilinen Bug ve Kırılma Noktaları

### 7.1 `subscription_settings` Yoksa Sessiz Çıkış (Dashboard)

`Dashboard.tsx:805-810` (Effect 5) içinde:

```typescript
if (!settings) {
  setInvoiceTotal(null);
  setYekdemMahsup(null);
  setHasYekdemMahsup(false);
  return;
}
```

Settings yoksa Dashboard kartları **sessizce** "—" gösterir; kullanıcıya neyin eksik olduğu söylenmez. Aynı şekilde `terim/gerilim/tarife` boşsa hata mesajı verilmez (`Dashboard.tsx:825-829`). YekdemMahsupDetail sayfası **bu kontroldeki açığı kapatır**: ayrıntılı hata mesajını UI'a basar (`Tesis ayarları eksik: terim/gerilim/tarife`).

Önerilen düzeltme: Dashboard tarafında da `setInvoiceErr("Tesis ayarları eksik: …")` mesajı set etmek. Şu anda yalnızca `console.error` ile loglanır.

### 7.2 `distribution_tariff_official` Eşleşmesi Bulunamazsa

`(terim, gerilim, tarife)` üçlüsü için tarife tablosunda satır bulunamazsa Dashboard kartı sessizce "—" gösterir, YekdemMahsupDetail sayfası ise `"Uygun dağıtım tarifesi bulunamadı."` hatası verir. Genellikle yeni eklenmiş bir gerilim/tarife kombinasyonu admin tarafında ilgili tarife satırının açılmamış olması nedeniyle yaşanır.

### 7.3 `consumption_daily` Eksik veya `consumption_hourly`'de M-1 Verisi Yoksa

`totalKwh = 0` ise YekdemMahsupDetail sayfası `"<Ay> dönemi tüketim verisi bulunamadı (0 kWh)"` hatası fırlatır. Bu durum tipik olarak:

- Aril sync'in henüz o dönemi geçmemiş olduğu (örn. sync gecikmesi),
- Tesisin yeni eklendiği ve geçmiş veri çekilmediği,
- Kullanıcının tesis seçiminin yanlış olduğu

durumlarında ortaya çıkar.

### 7.4 Legacy `(year, month)` Şema Düşmesi

`subscription_yekdem` tablosunda eski ortamlar `year`/`month` kolonlarını kullanıyordu. `fetchSubYekdemForMahsup` ve `fetchSubscriptionYekdem` (Dashboard) `isMissingColumnError(err, "period_year")` kontrolü ile fallback yapıyor. Yeni migration'lar (`period_year`, `period_month`) standartlaşmıştır; legacy ortamlar için fallback kalıcıdır.

### 7.5 KBK = `null` Davranışı

`subscription_settings.kbk` null ise sayfa `kbk = 1` varsayılanıyla devam eder (`YekdemMahsupDetail.tsx:239-242`). Bu davranış kullanıcı için sessiz bir varsayım yaratır; `kbk` gerçekte 1'den farklı olması gereken tesislerde mahsup tutarı hatalı çıkar. Admin paneli `subscription_settings` sayfasında `kbk` doldurulmazsa `monthlyKbk = null` olduğu için Dashboard tarafında Effect 5 erken çıkış yapar — yani Dashboard kartı doğru şekilde "—" gösterir, ama YekdemMahsupDetail sayfası varsayılan `1` ile yanlış sonuç döner.

## 8. UI Bileşenleri

`YekdemMahsupDetail.tsx` `DashboardShell` içine yerleşir:

- **Üst başlık satırı:** Sayfa başlığı, alt etiket (`<billingLabel> faturasında kullanılan mahsup hesabı (<mahsupMonthLabel> verileri)`), seçili tesis adı.
- **Tesis seçici:** `<select>` bileşeni, seçim `localStorage["eco_selected_sub"]`'a yazılır. "Panele dön" butonu `navigate(-1)` çağırır.
- **Hata kutusu:** Tesis listesi veya mahsup hesabı hatası tek bir kırmızı blokta birleştirilir (`subsErr` ve `err`).
- **Loading metni:** Hesap sürerken `"Yükleniyor…"` ifadesi.
- **3 özet kart:** kWh, YEKDEM farkı, KDV dahil mahsup.
- **4 satırlı hesap tablosu** + alt not.

## 9. Effect 5 ile Senkronizasyon

Dashboard Effect 5 ve `YekdemMahsupDetail.tsx` Effect 1 aynı `calculateYekdemMahsup` fonksiyonunu çağırır; aynı veri kaynaklarını okur. Aralarındaki farklar:

| Boyut | Dashboard Effect 5 | YekdemMahsupDetail Effect 1 |
| --- | --- | --- |
| Hata gösterimi | `console.error` + sessiz "—" | UI'da net hata mesajı |
| `kbk` null davranışı | `monthlyKbk = null` → Effect 5 erken çıkar | `kbk = 1` varsayılan |
| Mahsup eksik durumu | `yekdemMissing` state'i set edilir | `Error` fırlatılır, sayfa kırmızı kutu gösterir |
| Tarafe alanları | `subscription_settings` SELECT → `terim, gerilim, tarife, guc_bedel_limit, trafo_degeri, on_yil` | Yalnızca `kbk, terim, gerilim, tarife` |
| Tariff tablosu | `dagitim_bedeli, guc_bedeli, guc_bedeli_asim, kdv, btv, reaktif_bedel, perakende_enerji_bedeli` | Yalnızca `kdv, btv` |

Bu farkın sebebi: Dashboard kartı tüm faturayı hesaplar (mahsup yalnızca bir bileşen), bu sayfa ise yalnızca mahsup adımını gösterir.

## 10. Kaldırılan / Değişen Yapılar

- **`year`/`month`** kolonları `subscription_yekdem` üzerinde legacy konumda kalmıştır. Yeni şema `period_year`/`period_month` kolonlarını kullanır; her iki sorgu fonksiyonu (`fetchSubYekdemForMahsup`, `fetchSubscriptionYekdem`) `isMissingColumnError` ile geri uyumluluk sağlar.
- **`subscription_yekdem.diger_degerler`** alanı, mahsup tutarına ek olarak fatura toplamına eklenmek üzere Dashboard Effect 5 tarafından okunur. YekdemMahsupDetail sayfası bu alanı **göstermez**; sadece YEKDEM farkı kaynaklı mahsubu hesaplar. Önceki dokümanlarda bu alan eksik tanıtılmıştı; doğru yer Dashboard fatura kartı hesabıdır.
- **`yekdem_official`** tablosu Dashboard kartı için fallback olarak kullanılır (tesis-özel kayıt yoksa). YekdemMahsupDetail sayfası `yekdem_official` fallback'ini **kullanmaz**: tesis-özel kayıt yoksa hata fırlatır. Bu davranış bilinçlidir; mahsup hesabı için tesis-özel `(yekdem_value, yekdem_final)` çiftine ihtiyaç vardır.
- **Eski `mahsup` formülü** (önceki dokümanda yer alan tek aşamalı çarpım) kullanılmıyor; güncel formül BTV → KDV iki adımlı katlama uygular ve KDV dahil tutar döner.
- **Kart üzerindeki ikon değişikliği**: dashboardCards.ts içindeki `files` key'inin label'ı `"YEKDEM Mahsup Tutarı"` olarak güncellenmiştir; eski sürümlerde `"Dosyalar"` etiketi vardı (`/dashboard/files` ile karıştırılmaması için).

---

## Son Güncelleme

- **Tarih:** 2026-05-03
- **Branch:** main
- **Son commit:** `03aa828` — valla bişeler yaptık da hatırlamıyom amk
- **Kapsanan dosyalar:** `src/components/dashboard/YekdemMahsupDetail.tsx`, `src/components/utils/calculateInvoice.ts`, `src/lib/paginatedFetch.ts`, `src/lib/subscriptionVisibility.ts`, `src/pages/Dashboard.tsx` (Effect 3, Effect 5), `src/pages/admin/SubscriptionYekdemAdmin.tsx`, `supabase/migrations/20260326_*.sql`
