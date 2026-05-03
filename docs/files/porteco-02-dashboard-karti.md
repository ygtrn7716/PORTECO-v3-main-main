# PortEco Web — Dashboard Kartları

`/dashboard` sayfası kullanıcının ana giriş noktasıdır. Üst tarafta tesis seçici, altında 7 adet `StatCard` bileşeni, ardından ReactiveSection (RI/RC göstergeleri) ve birden fazla tesis varsa "Tüm Tesisler Toplamı" özet bandı yer alır. Bu dosya her bir kartı, hesaplama mantığını, veri akışını ve `Dashboard.tsx` içindeki useEffect zincirini birebir kod gerçekleriyle anlatır.

Kaynak dosyalar:

- `src/pages/Dashboard.tsx` (1797 satır)
- `src/content/dashboardCards.ts` — kart kataloğu
- `src/components/dashboard/DashboardShell.tsx`, `SideBar.tsx`, `TopBar.tsx`
- `src/components/dashboard/ReactiveSection.tsx`
- `src/components/utils/calculateInvoice.ts`
- `src/components/utils/invoiceSnapshots.ts`

## 1. Kart Kataloğu (dashboardCards.ts)

`src/content/dashboardCards.ts` içinde `DASH_CARDS` dizisi yedi kart tanımlar. Her satır birebir kodla aynıdır:

| Sıra | `key` | `title` | `subtitle` | `path` |
| --- | --- | --- | --- | --- |
| 1 | `consumption` | Aylık Toplam Tüketim (kWh) | İşleyici eklenince dolacak | `/dashboard/consumption` |
| 2 | `ges` | GES Üretim Detayları | kWh | `/dashboard/ges` |
| 3 | `cost` | Geçen Ay Ortalama PTF | TL/kWh | `/dashboard/ptf` |
| 4 | `yekdem` | Geçen Ay YEKDEM | TL/MWh (official / custom) | `/dashboard/yekdem` |
| 5 | `valley` | Geçen Ay Birim Fiyat | ₺/kWh | `/dashboard/valley` |
| 6 | `anomaly` | Geçmiş Faturalar | (boş) | `/dashboard/invoice-detail` |
| 7 | `files` | YEKDEM Mahsup Tutarı | (boş) | `/dashboard/yekdem-mahsup` |

`DashCardKey` tipi `"consumption" \| "ges" \| "cost" \| "yekdem" \| "valley" \| "anomaly" \| "files"` olarak sabittir.

> Not: `valley` kartının `path` değeri `/dashboard/valley`'dir, ancak `App.tsx` içinde böyle bir route tanımı **yoktur**. Tıklandığında React Router 404'e düşer; kart fiyat değerini Dashboard üzerinde gösterip yönlendirme amacı taşır. Bu davranış porteco-06 admin panelindeki "Bilinen Bug" bölümünde de listelidir.

## 2. Görünüm Yapısı

`Dashboard.tsx` aşağıdaki bileşenleri sırayla render eder:

1. `DashboardShell` (`src/components/dashboard/DashboardShell.tsx`) — tesis seçici, üst bar, kenar çubuğu (mobil drawer dahil), ana içerik kapsayıcı.
2. Tesis seçici (TopBar'a yerleştirilen `<select>` veya dropdown) — `subs` state'inden doldurulur, `subscription_settings.title` veya `owner_subscriptions.title` ile etiketlenir.
3. Üç sütunlu kart ızgarası: 6 sabit kart artı tek bir tesis varsa GES kartı tek başına, birden fazla tesis varsa GES kartı ve "Tüm Tesisler" bandı eşlik eder.
4. `ReactiveSection` — RI ve RC yüzdeleri.
5. Dipnotlar, son güncelleme zamanı.

`StatCard` bileşeni (`Dashboard.tsx:174` itibarıyla) 3D tilt efekti, shimmer animasyonu, opsiyonel `badgeText` ve `totalLine` özellikleri sunar. Kart tıklandığında `useNavigate()` ile `path`'e gider.

## 3. Tesis Yönetimi (Effect 0)

`Dashboard.tsx:397` bağımlılık dizisi `[uid, sessionLoading]`.

Adımlar:

1. `owner_subscriptions` tablosundan `subscription_serno, meter_serial, title` çek (kullanıcıya ait satırlar).
2. Aynı serno'lar için `subscription_settings.title` ve `subscription_settings.nickname` topla. Settings yoksa uyarı log'la, dashboard'ı yine de göster.
3. Eğer `owner_subscriptions` boş ise `subscription_settings` üzerinden fallback liste üret.
4. `fetchHiddenSernos(uid)` (`subscriptionVisibility.ts`) ile gizlenen tesis serno'larını çek; gizli olanları çıkar.
5. `resolveSelectedSub(visibleSernos, selectedSub)` ile `localStorage["eco_selected_sub"]` değerini doğrula; gizli ise ilk görünür tesise düş.

Hatalar:

- Settings çağrısının hatası **fatal değildir**, sadece `console.warn` ile loglanır.
- Owner_subscriptions hatası `setSubsErr` ile UI'a yansıtılır.

## 4. Kart Detayları

Her kart için aynı yapıyı izliyoruz: görsel davranış, route, hesaplama, veri kaynağı, useEffect bağımlılığı, loading/hata durumları, "—" gösterilme koşulları.

### 4.1 Tüketim Kartı (`consumption`)

- **Görsel:** Üst başlık "Aylık Toplam Tüketim (kWh)". Değer altta büyük puntoyla, alt yazı "İşleyici eklenince dolacak". Mavi vurgu rengi.
- **Tıklama:** `/dashboard/consumption` → `ConsumptionDetail` bileşeni.
- **Hesaplama:** Geçen ay (M-1) saatlik tüketimin toplamı. Birim kWh.
- **Formül:**
  - Tarih aralığı: `start = dayjsTR().subtract(1,"month").startOf("month")`, `end = dayjsTR().startOf("month")` (yarı-açık).
  - `sumCn = Σ Number(r.cn)` — tüm satırlar üzerinde toplam.
- **Veri kaynağı:** `consumption_hourly` tablosundan `paginatedFetch.fetchAllConsumption()` ile sayfalı çekim. Kolonlar: `ts, cn, ri, rc, gn`.
- **Bağımlı useEffect:** Effect 1 (`Dashboard.tsx:515`), bağımlılık dizisi `[uid, sessionLoading, selectedSub]`.
- **State:** `prevMonthKwh`, `prevMonthRi`, `prevMonthRc`, `prevMonthGn`, `prevLoading`, `prevErr`.
- **Loading / hata:** `prevLoading` true iken kart "—" görünür, `prevErr` varsa hata mesajı `console.error` ile basılır, kart yine "—" gösterir.
- **"—" koşulu:** `selectedSub` yoksa, hata varsa, ya da Effect 1 hâlâ koşuyorsa.

### 4.2 GES Kartı (`ges`)

- **Görsel:** "GES Üretim Detayları", alt yazı "kWh". Yeşil temalı vurgu (üretim).
- **Tıklama:** `/dashboard/ges` → `GesDetail` bileşeni.
- **Hesaplama:** Cari ay başından bugüne dek tüm aktif GES tesislerinin günlük üretim kWh toplamı.
- **Formül:** `total = Σ Number(r.energy_kwh)` (`ges_production_daily` üzerinden).
- **Veri kaynağı:**
  1. `detectVerisPresence(supabase, uid)` (`src/lib/ges/detectVerisPresence.ts`) — GES API entegrasyonu var mı / `consumption_hourly.gn` üzerinde anlamlı veri var mı kontrol eder.
  2. `ges_plants` tablosundan `id` çekilir (`is_active = true`).
  3. `ges_production_daily` tablosundan `energy_kwh` toplanır (`date >= ay başı`, `date <= ay sonu`).
- **Bağımlı useEffect:** Effect 7 (`Dashboard.tsx:1366`), bağımlılık dizisi `[uid, sessionLoading]`. Tesis seçimi bu kartı etkilemez (kullanıcının tüm GES tesisleri toplanır).
- **State:** `hasGes`, `gesMonthlyKwh`, `gesLoading`, `gesErr`.
- **Loading / hata:** `gesLoading` true iken "—". `gesErr` set edilirse kart yine "—".
- **"—" koşulu:** `hasGesApi` false ise (GES entegrasyonu yok), aktif tesis yoksa, `consumption_hourly` üzerinde `gn` veriş kolonunda anlamlı veri yoksa.

> `Dashboard.tsx:1379` üzerinde `console.log("[Dashboard] GES presence:", presence)` debug satırı bulunmaktadır; PR temizliği yapılırken kaldırılması öngörülmüştür.

### 4.3 PTF Kartı (`cost`)

- **Görsel:** "Geçen Ay Ortalama PTF", alt yazı "TL/kWh". Sayı 6 ondalıkla gösterilir (`fmtPTF6`).
- **Tıklama:** `/dashboard/ptf` → `PtfDetail`.
- **Hesaplama:** Geçen ayın `ptf_tl_per_kwh` değeri RPC üzerinden alınır.
- **Veri kaynağı:** `supabase.rpc("monthly_ptf_prev_sub", { p_tz: TR_TZ, p_subscription_serno: selectedSub })`. RPC ortalamayı saatlik `epias_ptf_hourly` tablosundan tesisle ilişkili dönem için hesaplar.
- **Bağımlı useEffect:** Effect 2 (`Dashboard.tsx:579`), bağımlılık dizisi `[uid, sessionLoading, selectedSub]`.
- **State:** `monthlyPTF`, `ptfLoading`, `ptfErr`.
- **Loading / hata:** `ptfLoading` iken "—". `ptfErr` set edilirse kart "—" ve `console.error`.
- **"—" koşulu:** RPC dönen satır yoksa veya `ptf_tl_per_kwh` null ise.

### 4.4 YEKDEM Kartı (`yekdem`)

- **Görsel:** "Geçen Ay YEKDEM", alt yazı "TL/MWh (official / custom)". Mod rozeti (`Resmi` veya `Özel`) gösterilir.
- **Tıklama:** `/dashboard/yekdem` → `YekdemDetail`.
- **Hesaplama:** Önce tesis-özel `subscription_yekdem` tablosu okunur. `yekdem_value` veya `yekdem_final` doluysa o değer kullanılır. Yoksa `yekdem_official` tablosundan `yekdem_value` (veya `yekdem_tl_per_kwh`) fallback alınır.
- **Mod logic:**
  - Tesis-özel kayıt varsa `yekdemMode = "custom"`.
  - Yoksa `yekdemMode = "official"`.
- **Veri kaynağı:**
  - `subscription_yekdem` (`fetchSubscriptionYekdem` yardımcısı, `(period_year, period_month)` veya legacy `(year, month)` deseni)
  - `yekdem_official` (`year`, `month` filtresi)
- **Bağımlı useEffect:** Effect 3 (`Dashboard.tsx:622`), bağımlılık dizisi `[uid, sessionLoading, selectedSub]`.
- **State:** `monthlyYekdem`, `yekdemMode`, `yekdemLoading`, `yekdemErr`.
- **"—" koşulu:** Hem tesis-özel hem resmi kayıt yoksa, ya da değer null ise.

### 4.5 Birim Fiyat Kartı (`valley`)

- **Görsel:** "Geçen Ay Birim Fiyat", alt yazı "₺/kWh". Sayı 6 ondalıklı gösterilir.
- **Tıklama:** `/dashboard/valley` (route tanımlı değil — bkz. yukarıdaki not).
- **Hesaplama:** `unitPriceEnergy = (monthlyPTF + monthlyYekdem) * monthlyKbk` (`Dashboard.tsx:886`).
- **Veri kaynağı:** PTF ve YEKDEM kartlarının çıktıları + `subscription_settings.kbk`.
- **Bağımlı useEffect:** PTF (Effect 2), YEKDEM (Effect 3), KBK (Effect 4) tamamlandıktan sonra `useMemo`/render ile hesaplanır. Doğrudan kendi useEffect'i yoktur.
- **State:** Türetilmiş değer; üç state'in herhangi biri null ise "—" gösterilir.
- **"—" koşulu:** `monthlyPTF`, `monthlyYekdem` veya `monthlyKbk` null ise.

### 4.6 Fatura Kartı (`anomaly`)

- **Görsel:** "Geçmiş Faturalar". Değer M-1 ayının fatura toplamı (TL, KDV dahil, mahsup ve `diger_degerler` eklenmiş haliyle). 2 ondalık gösterim (`fmtMoney2`).
- **Tıklama:** `/dashboard/invoice-detail` → `InvoiceDetail`.
- **Hesaplama:** Önce `invoice_snapshots` (geçen ay, `invoice_type = "billed"`) okunur. Snapshot varsa `recomputeSnapshotTotalWithMahsup(row)` ile güncel formüle göre yeniden hesaplanır. Snapshot yoksa Section 5 pipeline'ı çalıştırılır:

  1. `subscription_settings`'tan `terim, gerilim, tarife, guc_bedel_limit, trafo_degeri, on_yil` oku.
  2. `distribution_tariff_official`'tan `dagitim_bedeli, guc_bedeli, guc_bedeli_asim, kdv, btv, reaktif_bedel, perakende_enerji_bedeli` oku.
  3. `owner_subscriptions`'tan `multiplier, btv_enabled` oku.
  4. `demand_monthly` (`is_final = true`, `period_year`, `period_month`) → `max_demand_kw × multiplier`.
  5. `unitPriceEnergy = (monthlyPTF + monthlyYekdem) * monthlyKbk`.
  6. Reaktif ceza hesabı: `riPercent = totalRi / totalKwh * 100`, `rcPercent` aynı şekilde. `riPercent > 20` ise `riPenaltyEnergy = totalRi`, `rcPercent > 15` ise `rcPenaltyEnergy = totalRc`. `reactivePenaltyCharge = (riPenaltyEnergy + rcPenaltyEnergy) * reaktif_bedel`.
  7. `calculateInvoice({ ... })` çağrılır → `breakdown.totalInvoice`.
  8. YEKDEM mahsup ek hesaplanır (M-1 dönemine ait ayrı bir calculateYekdemMahsup çağrısı; ayrıntı için bkz. [porteco-03-yekdem-mahsup-sayfasi.md](./porteco-03-yekdem-mahsup-sayfasi.md)).
  9. `subscription_yekdem.diger_degerler` (varsa) eklenir.
  10. `totalWithMahsup = breakdown.totalInvoice + yekdemMahsupValue + digerDegerler`.

- **Veri kaynağı:** `invoice_snapshots`, `subscription_settings`, `distribution_tariff_official`, `owner_subscriptions`, `demand_monthly`, `consumption_daily`/`consumption_hourly`, `subscription_yekdem`, `yekdem_official`.
- **Bağımlı useEffect:** Effect 5 (`Dashboard.tsx:742`), bağımlılık dizisi:

  ```typescript
  [
    uid,
    sessionLoading,
    selectedSub,
    prevMonthKwh,
    prevMonthRi,
    prevMonthRc,
    prevMonthGn,
    monthlyPTF,
    monthlyYekdem,
    monthlyKbk,
  ]
  ```

- **State:** `invoiceTotal`, `yekdemMahsup`, `hasYekdemMahsup`, `yekdemMahsupLabel`, `yekdemMissing`, `invoiceLoading`, `invoiceErr`.
- **"—" koşulu:** `prevMonthKwh`, `monthlyPTF`, `monthlyYekdem`, `monthlyKbk` herhangi biri null ise erken çıkılır ve kart "—". `subscription_settings` veya `distribution_tariff_official` eşleşmesi bulunamazsa yine "—". `terim`, `gerilim` veya `tarife` boşsa "—".

> Settings yoksa kullanıcıya hata mesajı gösterilmez; bu davranış [porteco-06-admin-paneli.md](./porteco-06-admin-paneli.md) "Bilinen Bug Listesi" bölümünde tartışılır.

### 4.7 Mahsup Kartı (`files`)

- **Görsel:** "YEKDEM Mahsup Tutarı". 2 ondalık. Pozitif değerler kullanıcı aleyhine (kırmızı), negatif değerler lehine (yeşil) renklendirilir.
- **Tıklama:** `/dashboard/yekdem-mahsup` → `YekdemMahsupDetail`.
- **Hesaplama:** Effect 5 içinde Fatura kartı hesabıyla aynı turda hesaplanır; ayrı bir useEffect değildir.
- **Formül:** `calculateYekdemMahsup({ totalKwh, kbk, btvRate, vatRate, yekdemOld, yekdemNew })`. Detay [porteco-03-yekdem-mahsup-sayfasi.md](./porteco-03-yekdem-mahsup-sayfasi.md).
- **Veri kaynağı:** `consumption_daily` (öncelik) → `consumption_hourly` (fallback) + `subscription_yekdem (yekdem_value, yekdem_final)`.
- **State:** `yekdemMahsup`, `hasYekdemMahsup`, `yekdemMissing` (`"none" | "value" | "final" | "both"`), `yekdemMahsupLabel` (örn. `"Mart 2026"`).
- **"—" koşulu:** `yekdemMissing` `"both"` ise (hem tahmini hem kesin değer yoksa) ya da M-1 tüketim toplamı sıfırsa.

## 5. Tüm Tesisler Toplamı (Effect 6)

Birden fazla tesis görünürken (`subs.length > 1`) Dashboard üzerinde "Tüm Tesisler Toplamı" özet bandı gösterilir. Bu bant tek bir kart değildir; üç sayı içerir: toplam kWh, toplam fatura (TL, mahsup dahil), toplam mahsup.

`Dashboard.tsx:1078`, bağımlılık dizisi `[uid, sessionLoading, subs]`.

Her tesis için aşağıdaki adımlar tekrarlanır:

1. `fetchAllConsumption` ile geçen ay saatlik tüketim toplanır (`subKwh`, `subRi`, `subRc`, `subGn`).
2. `subKwh === 0` ise tesis atlanır.
3. `invoice_snapshots` (`invoice_type = "billed"`) varsa `recomputeSnapshotTotalWithMahsup` ile yeniden hesaplanır ve eklenir.
4. Snapshot yoksa Effect 5 ile birebir aynı pipeline çalıştırılır (`monthly_ptf_prev_sub` RPC, YEKDEM tablosu, KBK, tarife, multiplier, demand, calculateInvoice, calculateYekdemMahsup, diger_degerler).
5. `grandTotalKwh`, `grandTotalInvoice`, `grandTotalMahsup` toplanır.

State:

- `allSubsTotalKwh`
- `allSubsTotalInvoice` (yalnızca en az bir tesisten fatura hesaplanabildiğinde dolu)
- `allSubsTotalMahsup` (yalnızca en az bir tesiste mahsup varsa dolu)

`subs.length <= 1` ise üç değer de `null` olarak set edilir ve özet bandı render edilmez.

## 6. ReactiveSection

Kartların altında render edilen bağımsız bileşen (`src/components/dashboard/ReactiveSection.tsx`). RI ve RC yüzdelerini göstergede sunar.

- **Sabitler:** `REACTIVE_LIMIT_RI = 20`, `REACTIVE_LIMIT_RC = 15` (yüzde).
- **Hesap:** `riPercent = totalRi / totalKwh * 100`, `rcPercent = totalRc / totalKwh * 100`. M-1 ay verisi kullanılır.
- **Görünüm modları:** `toggle` (her seferinde tek gösterge) ve `pill` (yan yana iki rozet). `localStorage["eco_reactive_display_mode"]` üzerinden persist edilir.
- **Renk:** Eşik altı yeşil, eşik üstü kırmızı.
- **Veri:** Effect 1'in topladığı `prevMonthRi` / `prevMonthRc` / `prevMonthKwh` değerlerinden beslenir. Ayrı bir useEffect kurmaz.

Detaylı eşik mantığı, ceza hesabı ve Edge Function akışı için [porteco-04-reaktif-islemler.md](./porteco-04-reaktif-islemler.md).

## 7. DashboardShell, TopBar, SideBar

`DashboardShell` (`src/components/dashboard/DashboardShell.tsx`) tüm dashboard sayfalarının ortak çerçevesini sunar:

- TopBar: kullanıcı bilgisi, tesis seçici, çıkış, mobil menü tetikleyici.
- SideBar: navigasyon linkleri (Tüketim, PTF, YEKDEM, Fatura, Charts, Alerts, GES, Profil, Files; admin ise ayrıca Admin paneli).
- Ana içerik alanı: sayfa bileşeninin kendisi.

DetailLayout (`src/components/dashboard/DetailLayout.tsx`) detay sayfaları için ortak başlık + geri buton şeridi sunar.

## 8. useEffect Bağımlılık Tablosu

Dashboard.tsx içindeki tüm useEffect'lerin satır numaraları ve bağımlılık dizileri:

| Effect | Satır | Görev | Dependency |
| --- | --- | --- | --- |
| 0 | `Dashboard.tsx:397` | Tesis listesi + gizli filtre + seçili tesis çözümü | `[uid, sessionLoading]` |
| 1 | `Dashboard.tsx:515` | Geçen ay saatlik tüketim + RI/RC/Gn toplama | `[uid, sessionLoading, selectedSub]` |
| 2 | `Dashboard.tsx:579` | PTF (RPC) | `[uid, sessionLoading, selectedSub]` |
| 3 | `Dashboard.tsx:622` | YEKDEM (özel + resmi fallback) | `[uid, sessionLoading, selectedSub]` |
| 4 | `Dashboard.tsx:700` | KBK (`subscription_settings.kbk`) | `[uid, sessionLoading, selectedSub]` |
| 5 | `Dashboard.tsx:742` | Fatura toplamı + YEKDEM mahsup + diger_degerler | `[uid, sessionLoading, selectedSub, prevMonthKwh, prevMonthRi, prevMonthRc, prevMonthGn, monthlyPTF, monthlyYekdem, monthlyKbk]` |
| 6 | `Dashboard.tsx:1078` | Tüm tesisler toplam kWh + fatura + mahsup | `[uid, sessionLoading, subs]` |
| 7 | `Dashboard.tsx:1366` | GES aylık üretim (selectedSub bağımsız) | `[uid, sessionLoading]` |

> Effect 0 numaralandırması koddaki `// 0)` yorumu ile uyumlu yapılmıştır; eski dokümanlarda Effect 1'den başlatılmıştı. Yeni numaralandırmaya göre "Tüm Tesisler" Effect 6, "GES" Effect 7'dir.

## 9. Loading ve Hata Stratejisi

Her kart kendi `loading` ve `err` state'ini taşır. Yükleme sırasında `StatCard` `value` prop'una `"—"` geçirir; hata olduğunda da aynı görsel gösterilir ve `console.error` ile detay loglanır. Toplu fatura bandı (Effect 6) hata durumunda üç değeri de null'a set eder; banta düşmez.

`Dashboard.tsx:1378` satırında `logVerisPresenceErrors("Dashboard.GES", presence)` çağrısı GES tespiti için olası hataları konsola düşürür. `Dashboard.tsx:1379`'daki `console.log("[Dashboard] GES presence:", presence)` debug çıktısı PR temizliğinde kaldırılacaktır (yorum koddaki ifadeyle aynıdır).

## 10. Önemli Yardımcı Fonksiyonlar (Dashboard.tsx içi)

| Fonksiyon | Satır | Görev |
| --- | --- | --- |
| `fmtPTF6(n)` | `Dashboard.tsx:45` | 6 ondalık tr-TR sayı; null ise `—` |
| `fmtMoney2(n)` | `Dashboard.tsx:54` | 2 ondalık tr-TR sayı; null ise `—` |
| `mapTermToTariffType(term)` | `Dashboard.tsx:63` | `"cift_terim" → "dual"`, aksi `"single"` |
| `isMissingColumnError(err, col)` | `Dashboard.tsx:67` | Postgres "column does not exist" mesaj eşleşmesi |
| `fetchSubscriptionYekdem({ uid, sub, year, month })` | `Dashboard.tsx:76` | `subscription_yekdem` okuma; legacy `(year, month)` fallback |
| `fetchSubscriptionDigerDegerler({ uid, sub, year, month })` | `Dashboard.tsx:132` | `subscription_yekdem.diger_degerler` okuma; aynı legacy fallback |

## 11. Kaldırılan / Değişen Yapılar

- **Effect numaralandırması** önceki dokümanlarda 1'den başlıyordu (Effect 1 = subscription list). Kod artık 0'dan başlatıyor (Section 0/1/.../7). Yeni numaralandırma kod yorumlarıyla birebirdir.
- **Reaktif eşikler**: Dashboard ceza hesabında `REACTIVE_LIMIT_RI = 20`, `REACTIVE_LIMIT_RC = 15` sabitleri Section 5 ve Section 6 fonksiyon gövdesi içinde **inline** olarak yeniden tanımlanır. Tek bir merkezi sabit yoktur. Bu değerler `ReactiveSection.tsx` ile aynıdır.
- **Snapshot canlı yeniden hesaplama**: Dashboard artık snapshot okurken `total_with_mahsup` saklı değerini doğrudan kullanmaz, `recomputeSnapshotTotalWithMahsup()` ile her seferinde güncel formüle göre yeniden hesaplar. Bu davranış 2026-04 migration'larından sonra eklenmiştir; eski snapshot'lar yeni dağıtım bedeli ve veriş satış formüllerini içermediği için canlı recompute zorunludur.
- **GES kartı tetikleyicisi** önceden `selectedSub` bağımlılığı ile çalışıyordu. Şu an Effect 7 yalnızca `[uid, sessionLoading]`'a bağlıdır; GES tüm aktif tesislerin toplamını verir.
- **`btv_enabled` kaynağı**: Eski dokümanda `subscription_settings.btv_enabled` referansı vardı. 2026-02-16 migration'ı ile alan `owner_subscriptions.btv_enabled` olarak taşındı; Effect 5 ve Effect 6 artık `owner_subscriptions` tablosundan okuyor.
- **`on_yil` ve `perakende_enerji_bedeli`** alanları 2026-04-10 migration'larıyla eklendi; eski Dashboard hesabı bu alanları içermiyordu, calculateInvoice'a bu parametreler artık iletilir.
- **`distribution_tariff_official`** SELECT kümesine `guc_bedeli_asim`, `reaktif_bedel` ve `perakende_enerji_bedeli` alanları eklendi.

---

## Son Güncelleme

- **Tarih:** 2026-05-03
- **Branch:** main
- **Son commit:** `03aa828` — valla bişeler yaptık da hatırlamıyom amk
- **Kapsanan dosyalar:** `src/pages/Dashboard.tsx`, `src/content/dashboardCards.ts`, `src/components/dashboard/DashboardShell.tsx`, `src/components/dashboard/ReactiveSection.tsx`, `src/components/utils/calculateInvoice.ts`, `src/components/utils/invoiceSnapshots.ts`, `src/lib/paginatedFetch.ts`, `src/lib/subscriptionVisibility.ts`, `src/lib/ges/detectVerisPresence.ts`
