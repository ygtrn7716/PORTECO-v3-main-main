# PortEco Web — Supabase Query Envanteri

Bu doküman, frontend kaynak kodunun Supabase'e attığı her sorguyu (SELECT/INSERT/UPDATE/UPSERT/DELETE/RPC/Realtime) dosya bazında listeler. Toplam 226 adet `.from("...")` çağrısı, 14 adet `.rpc(...)` çağrısı (6 farklı RPC), 1 adet realtime aboneliği ve 7 `auth.*` çağrısı vardır. Tablo özetleri ve RPC tanımları en sondadır.

Sayım kaynağı: `grep -rEo '\.from\("[a-z_]+"\)' src/`.

## 1. Dashboard.tsx — Ana Panel

`src/pages/Dashboard.tsx` (1927 satır)

### 1.1 Yardımcı fonksiyonlar

| Satır | Tablo | Op | Filtre |
| --- | --- | --- | --- |
| `Dashboard.tsx:96` | `subscription_yekdem` | SELECT `yekdem_value, yekdem_final, usd_kur` | `(user_id, subscription_serno, period_year, period_month)` |
| `Dashboard.tsx:122` | `subscription_yekdem` | SELECT `yekdem_value, yekdem_final, usd_kur` | Legacy `(year, month)` fallback |
| `Dashboard.tsx:156` | `subscription_yekdem` | SELECT `diger_degerler` | `(user_id, subscription_serno, period_year, period_month)` |
| `Dashboard.tsx:172` | `subscription_yekdem` | SELECT `diger_degerler` | Legacy fallback |

### 1.2 Effect 0 — Tesis Listesi

| Satır | Tablo | Op | Filtre |
| --- | --- | --- | --- |
| `Dashboard.tsx:431` | `owner_subscriptions` | SELECT `subscription_serno, meter_serial, title` | `user_id`, `order subscription_serno asc` |
| `Dashboard.tsx:453` | `subscription_settings` | SELECT `subscription_serno, title, nickname` | `user_id`, `subscription_serno IN (...)` |
| `Dashboard.tsx:488` | `subscription_settings` | SELECT `subscription_serno, title, nickname` | `user_id`, fallback liste |

### 1.3 Effect 1 — Tüketim + Talep Birleştirme

`fetchAllConsumption()` ile `consumption_hourly` paginated SELECT (`ts, cn, ri, rc, gn`); ardından `getFacilityAllocation` (`gesAllocation.ts` — kendi sorguları için bkz. §1.9) tahsis görünümü döndürürse saatlik satırlara uygulanır.

### 1.4 Effect 2 — PTF (RPC)

| Satır | RPC | Argüman |
| --- | --- | --- |
| `Dashboard.tsx:639` | `monthly_ptf_prev_sub` | `{ p_tz: TR_TZ, p_subscription_serno: selectedSub }` |

### 1.5 Effect 3 — YEKDEM Resmi Fallback

| Satır | Tablo | Op | Filtre |
| --- | --- | --- | --- |
| `Dashboard.tsx:715` | `yekdem_official` | SELECT `yekdem_value, yekdem_tl_per_kwh` | `year`, `month` |

### 1.6 Effect 4 — KBK + Birim Fiyat Manipülasyonu

| Satır | Tablo | Op | Filtre |
| --- | --- | --- | --- |
| `Dashboard.tsx:767` | `subscription_settings` | SELECT `kbk, unit_price_adjustment` | `(user_id, subscription_serno)` |

### 1.7 Effect 5 — Fatura

| Satır | Tablo | Op | Filtre |
| --- | --- | --- | --- |
| `Dashboard.tsx:831` | `invoice_snapshots` | SELECT `INVOICE_SNAPSHOT_RECOMPUTE_FIELDS, has_yekdem_mahsup` | `(user_id, subscription_serno, period_year, period_month, invoice_type='billed')` |
| `Dashboard.tsx:856` | `subscription_settings` | SELECT `terim, gerilim, tarife, guc_bedel_limit, trafo_degeri, on_yil, lisansli_satis` | `(user_id, subscription_serno)` |
| `Dashboard.tsx:894` | `distribution_tariff_official` | SELECT `dagitim_bedeli, guc_bedeli, guc_bedeli_asim, kdv, btv, reaktif_bedel, perakende_enerji_bedeli` | `(terim, gerilim, tarife)` |
| `Dashboard.tsx:912` | `owner_subscriptions` | SELECT `multiplier, btv_enabled` | `(user_id, subscription_serno)` |
| `Dashboard.tsx:927` | `demand_monthly` | SELECT `max_demand_kw` | `(user_id, subscription_serno, period_year, period_month, is_final=true)` |
| `Dashboard.tsx:1028` | `consumption_daily` | SELECT `day, kwh_in` | `(user_id, subscription_serno)`, M-1 ay aralığı |
| Dashboard.tsx içinde `fetchAllConsumption()` | `consumption_hourly` | paginated SELECT (saatlik tüketim toplamı) | `(user_id, subscription_serno, ts)` |

### 1.8 Effect 6 — Tüm Tesisler Toplamı

Effect başında `fetchGesMahsupContext(supabase, uid)` (`Dashboard.tsx:1175`) talep birleştirme bağlamını bir kez çeker; tesis döngüsünde `getFacilityAllocation` uygulanır.

| Satır | Tablo | Op |
| --- | --- | --- |
| `Dashboard.tsx:1246` | `invoice_snapshots` | SELECT (snapshot kontrolü) |
| `Dashboard.tsx:1267` | RPC `monthly_ptf_prev_sub` | Per tesis çağrı |
| `Dashboard.tsx:1282` | `yekdem_official` | SELECT (fallback) |
| `Dashboard.tsx:1295` | `subscription_settings` | SELECT `kbk, terim, gerilim, tarife, guc_bedel_limit, trafo_degeri, on_yil, lisansli_satis, unit_price_adjustment` |
| `Dashboard.tsx:1323` | `distribution_tariff_official` | SELECT (tariff alanları) |
| `Dashboard.tsx:1334` | `owner_subscriptions` | SELECT `multiplier, btv_enabled` |
| `Dashboard.tsx:1345` | `demand_monthly` | SELECT `max_demand_kw` |
| `Dashboard.tsx:1415` | `consumption_daily` | SELECT `day, kwh_in` (M-1 mahsup) |

### 1.9 Effect 7 — GES

| Satır | Tablo | Op | Filtre |
| --- | --- | --- | --- |
| `Dashboard.tsx:1510` | `ges_plants` | SELECT `id` | `(user_id, is_active=true)` |
| `Dashboard.tsx:1543` | `ges_production_daily` | SELECT `energy_kwh` | API tesisler, cari ay |
| `Dashboard.tsx:1561` | `ges_production_daily` | SELECT `energy_kwh` | Manuel tesisler, M-1 ay |

`resolveManualPlantIds` (`src/lib/ges/manualPlants.ts`) manuel/API ayrımı için `ges_plants → ges_credentials → ges_providers` zincirini sorgular; `detectVerisPresence` (`src/lib/ges/detectVerisPresence.ts`) `ges_plants`, `invoice_snapshots.veris_kwh` ve `consumption_hourly.gn` sinyallerine bakar. Talep birleştirme yardımcıları (`src/components/utils/gesAllocation.ts`): `fetchGesMahsupContext` → `ges_mahsup_assignments` + `ges_plants`; `computeGesAllocation` → kaynak sernonun `consumption_hourly.gn` saatlik verisi (5 dk TTL cache'li).

## 2. YekdemMahsupDetail.tsx

`src/components/dashboard/YekdemMahsupDetail.tsx`

| Satır | Tablo | Op | Notlar |
| --- | --- | --- | --- |
| `:56` | `subscription_yekdem` | SELECT `yekdem_value, yekdem_final` | Yardımcı `fetchSubYekdemForMahsup` (period_*) |
| `:75` | `subscription_yekdem` | SELECT (legacy fallback) | `(year, month)` |
| `:142` | `subscription_settings` | SELECT `subscription_serno, title, nickname, is_hidden` | `user_id` |
| `:161` | `owner_subscriptions` | SELECT `subscription_serno, title` | Fallback |
| `:224` | `subscription_settings` | SELECT `kbk, terim, gerilim, tarife` | Mahsup için zorunlu ayarlar |
| `:248` | `distribution_tariff_official` | SELECT `kdv, btv` | Tarife eşleşmesi |
| `:268` | `consumption_daily` | SELECT `day, kwh_in` | M-1 tüketim toplamı |
| Yardımcı `fetchAllConsumption` | `consumption_hourly` | paginated SELECT | `consumption_daily` boşsa fallback |

## 3. YekdemDetail.tsx

`src/components/dashboard/YekdemDetail.tsx`

| Satır | Tablo | Op | Notlar |
| --- | --- | --- | --- |
| `:104` | `owner_subscriptions` | SELECT (tesis listesi) |  |
| `:116` | `subscription_settings` | SELECT (title, nickname) | İsim üretmek için |
| `:184` | `subscription_yekdem` | SELECT `yekdem_value, yekdem_final, period_year, period_month` | Tesis YEKDEM tarihçesi |

## 4. InvoiceDetail.tsx

`src/components/dashboard/InvoiceDetail.tsx` (Effect 5 ile aynı pipeline'ı kullanır ancak kalem dökümünü gösterir)

| Satır | Tablo | Op | Notlar |
| --- | --- | --- | --- |
| `:146`, `:164`, `:193`, `:212`, `:240`, `:252` | `subscription_yekdem` | SELECT (period_* + legacy fallback) | YEKDEM/usd_kur/diger_degerler lookup'ları |
| `:315` | `subscription_settings` | SELECT (terim, gerilim, tarife, guc_bedel_limit, trafo_degeri, on_yil, lisansli_satis, …) |  |
| `:335` | `owner_subscriptions` | SELECT (fallback) |  |
| `:446` | RPC `monthly_ptf_prev_sub` | PTF fetch | Aynı RPC |
| `:478` | `yekdem_official` | SELECT (fallback) |  |
| `:496` | `subscription_settings` | SELECT (ek alan kontrolü) |  |
| `:553`, `:570` | `owner_subscriptions` | SELECT (multiplier/btv fallback path) |  |
| `:588` | `distribution_tariff_official` | SELECT (full tariff + dagitim_uretici_1/2) |  |
| `:638` | `demand_monthly` | SELECT `max_demand_kw` |  |
| `:722` | `consumption_daily` | SELECT (M-1 kWh) |  |
| `:941` | `ges_plants` | SELECT (üretim tespiti) |  |
| `:429` | — | `getFacilityAllocation(...)` | Talep birleştirme tahsis görünümü; efektif gn/net değerleri üretir |

Ayrıca sayfa `calculateGesUretimSatisi` (saf hesap) ile GES Üretim Satışı kartını ve `calculateGesOlmasaydi` (`:1029`) ile GES Olmasaydı panelini besler.

## 5. InvoiceHistory.tsx + InvoiceSnapshotDetail.tsx

`src/pages/InvoiceHistory.tsx`, `src/pages/InvoiceSnapshotDetail.tsx`

`listInvoiceSnapshots` ve `getInvoiceSnapshot` üzerinden `invoice_snapshots` tablosuna SELECT yapılır (`invoiceSnapshots.ts:230` ve `:254`). InvoiceHistory ek olarak `subscription_settings` ve `owner_subscriptions` üzerinden tesis adı çözümlemesi yapar.

## 6. ConsumptionDetail.tsx

`src/components/dashboard/ConsumptionDetail.tsx`

| Satır | Tablo | Op |
| --- | --- | --- |
| `:96` | `consumption_daily` | SELECT (günlük kWh ana grafik) |
| `:190` | `owner_subscriptions` | SELECT (tesis listesi) |
| `paginatedFetch` | `consumption_hourly` | paginated SELECT (saatlik detay sekmesinde) |

Sayfa ayrıca iki yeni bileşen render eder:

- **`ConsumptionCharts.tsx`** — segment'li (Aylık/Günlük/Saatlik) tüketim karşılaştırma kartı: `monthly_dashboard_series` RPC (`ConsumptionCharts.tsx:450, 469`) + `consumption_daily` SELECT (`:523`).
- **`ManualUploadPanel`** (`manualUpload/ManualUploadPanel.tsx`) — manuel tüketim Excel yükleme: parse sonrası `consumption_hourly`'ye 500'lük batch upsert (`:135`) ve `manual_data_logs`'a log insert (`:182`). `DateRangeDeleteModal` tarih aralığı silme (`consumption_hourly` DELETE `:92` + log `:114`), `DataLogsModal` `manual_data_logs` SELECT (`:45`). Panelin görünürlüğü `owner_subscriptions.data_source` alanına bağlıdır (kolonun repo migration'ı yoktur — canlı DB'de tanımlı).

## 7. PtfDetail.tsx

`src/components/dashboard/PtfDetail.tsx`

| Satır | Tablo | Op | Notlar |
| --- | --- | --- | --- |
| `:162` | `owner_subscriptions` | SELECT |  |
| `:174` | `subscription_settings` | SELECT |  |
| `paginatedFetch` | `epias_ptf_hourly` | paginated SELECT (saatlik PTF zaman serisi) |  |
| `:269` | `ges_plants` | SELECT (GES varlığı) |  |
| `:284` | `ges_production_hourly` | SELECT (saatlik üretim) |  |

## 8. ChartsPage.tsx

`src/components/dashboard/ChartsPage.tsx`

| Satır | Tablo / RPC | Op |
| --- | --- | --- |
| `:217` | `ges_production_daily` | paginated SELECT (`fetchAllProductionDaily`, `.range()` ile 1000 satır limiti aşımı) |
| `:281` | `owner_subscriptions` | SELECT (tesis listesi) |
| `:355` | RPC `monthly_dashboard_series` | Çoklu ay seri (kullanıcı bazlı) |
| `:361` | RPC `monthly_dashboard_series` | Tüm tesis seri |
| `:446` | `ges_plants` | SELECT (GES grafikleri için aktif tesisler) |

GES'i olan kullanıcıda (`detectVerisPresence` sinyali) "Toplam Üretim" / "Toplam Veriş" yıllık karşılaştırma grafikleri çizilir; veriş `consumption_hourly.gn`'den gelir. Sayfa ayrıca **Raporlar** bölümünü render eder (`ChartsPage.tsx:627` → `ReportsSection`): 4 rapor — `consumption_vs_production` (`fetchConsumptionVsProduction.ts`: `monthly_dashboard_series` RPC + `ges_plants` + `ges_production_daily`), `ptf_analysis` (`fetchPtfAnalysis.ts`), `invoice_comparison` (`fetchInvoiceComparison.ts`: yalnız kayıtlı `billed` snapshot'lar, `recomputeSnapshotTotalWithMahsup` ile), `settlement_performance` (`fetchMahsupPerformance.ts`). Tesis listesi `useTesisListForReports.ts` (`owner_subscriptions` + `subscription_settings` + `fetchHiddenSernos`); exportlar ExcelJS tabanlı `brandedExcel.ts` ile üretilir.

## 9. GesDetail.tsx + GesHourlyView.tsx + GesOlmasaydiPanel.tsx

`src/components/dashboard/GesDetail.tsx`

| Satır | Tablo | Op |
| --- | --- | --- |
| `:160` | `ges_plants` | SELECT |
| `:226` | `ges_snapshot` | SELECT (anlık güç + bugün enerjisi) |
| `:268`, `:298`, `:327`, `:373`, `:422` | `ges_production_daily` | SELECT (farklı tarih aralıkları) |
| `:465` | `ges_satis_hakki` | SELECT (legacy) |

`GesHourlyView.tsx:100` — `ges_production_hourly` SELECT.

`calculateGesOlmasaydi.ts:160` — `ges_production_hourly`, `:190` — `ges_production_daily` (günlük fallback), `:310, :365, :414` — `ges_plants` (dal seçimi/manuel tespiti).

`GesSavingsSection.tsx:39, 53` — `subscription_yekdem`, `:70` — `yekdem_official`, `:124` — `subscription_settings`, `:133` — `ges_plants`.

## 10. EnergySoldCard.tsx + EnergyTable.tsx

`src/components/dashboard/EnergySoldCard.tsx` (yeniden yazıldı: "Mahsup Edilen Enerji Bedeli" + "Devlete Satılan Enerji Bedeli" + "Yıllık Satış Hakkı" kartları)

| Satır | Tablo |
| --- | --- |
| `:116` | `owner_subscriptions` |
| `:135`, `:205` | `subscription_settings` (satis_hakki, lisansli_satis, on_yil dahil) |
| `:244` | — `getFacilityAllocation(...)` (talep birleştirme) |
| `:304` | `distribution_tariff_official` (dagitim_uretici_1/2) |
| `:322`, `:335` | `subscription_yekdem` (usd_kur dahil; legacy fallback) |

Yıllık Satış Hakkı kartı `calcYearlySatisHakkiUsage` (`src/components/utils/yearlySatisHakki.ts`) üzerinden `consumption_hourly`'yi takvim yılı boyunca paginated okur (`Σ_ay max(0, ayVeriş − ayÇekiş)`), limit `subscription_settings.satis_hakki`'dan gelir.

`EnergyTable.tsx` (tesis seçimi artık controlled prop; sayfalama kaldırıldı, tek `.limit(1000)` çekim; CSV + Excel export butonları)

| Satır | Tablo |
| --- | --- |
| `:64` | `owner_subscriptions` |
| `:76` | `subscription_settings` |
| `:105`, `:190` | `consumption_hourly` |

## 11. AlertsPage.tsx

`src/pages/AlertsPage.tsx`

| Satır | Tablo | Filtre |
| --- | --- | --- |
| `:148` | `owner_subscriptions` | `user_id` |
| `:167` | `reactive_alert_state` | `user_id` |
| `:202` | `sms_logs` (`message_type` dahil) | `user_id`, son 100 |
| `:229` | `email_logs` (`message_type` dahil) | `user_id`, son 100 |

PhoneNumberManager.tsx (`:53, :89, :113, :127`) — `user_phone_numbers` SELECT/INSERT/UPDATE/DELETE.

EmailManager.tsx (`:37, :71, :95, :109`) — `user_emails` SELECT/INSERT/UPDATE/DELETE.

## 12. ProfilePage.tsx

`src/pages/ProfilePage.tsx`

| Satır | Tablo | Op |
| --- | --- | --- |
| `:125` | `owner_subscriptions` | SELECT (tesis listesi + multiplier + btv_enabled) |
| `:144` | `subscription_settings` | SELECT (nickname, is_hidden, kbk, …) |
| `:176` | `subscription_settings` | UPDATE (nickname/hidden değişimi) |
| `:235` | `subscription_settings` | UPDATE (insert öncesi kontrol) |
| `:245` | `subscription_settings` | INSERT (yeni satır) |
| `:312` | `ges_providers` | SELECT |
| `:325` | `ges_credentials` | SELECT (kullanıcı kredensiyalleri) |
| `:337`, `:401` | `ges_plants` | SELECT (mevcut tesisler) |
| `:376` | `ges_credentials` | INSERT |
| `:392` | `ges_credentials` | DELETE |
| `:462` | `auth.signInWithPassword` | Şifre doğrulama (parola değişikliği için) |
| `:474` | `auth.updateUser` | Şifre güncelleme |

`btvToggle.ts` (`:14, :25`) — `owner_subscriptions` UPDATE/INSERT (update-then-insert).

`subscriptionVisibility.ts` (`:12, :40, :51`) — `subscription_settings` SELECT/UPDATE/INSERT.

## 13. Public Sayfalar

- **`ContactUs.tsx:55`** — `contact_messages` INSERT.
- **`LeadForm.tsx:64`** — `contact_messages` INSERT (lead bölümünden).
- **`IntakeFormPage.tsx:349`** — `intake_forms` INSERT. Payload artık GES alanlarını da içerir: `has_ges`, `ges_saglayici_sayisi`, `ges_tesis_sayisi`, `ges_saglayicilar` (jsonb[]; sağlayıcı, portal kullanıcı/şifre, lisanslı satış ve 10 yıl üstü bayrakları, not) — `20260531_001_add_ges_to_intake_forms.sql`.

## 14. Admin Sayfaları (Özet — TableManager Üzerinden)

`TableManager.tsx`'e göre tüm CRUD işlemleri aynı pattern'le yapılır:

| Satır | Operasyon |
| --- | --- |
| `:113` | `user_integrations` SELECT (user filtresi dropdown'u doldurma) |
| `:136` | `cfg.table` SELECT (count: exact, range pagination) |
| `:215` | `cfg.table` UPDATE (match keys) |
| `:224` | `cfg.table` DELETE (match keys) |
| `:278` | `cfg.table` INSERT |

İstisna sayfalar (TableManager dışı):

- **`AdminHome.tsx:51, 55, 74`** — `user_integrations`, `subscription_settings` SELECT (özet kart sorguları).
- **`AdminUsersPage.tsx:115-358`** — `user_integrations`, `owner_subscriptions`, `subscription_settings`, `subscription_yekdem` üzerinde özelleştirilmiş kullanıcı listesi + masal toplu YEKDEM upsert (`:292`).
- **`IntakeFormsAdmin.tsx:94, 159, 174`** — `intake_forms` SELECT/UPDATE.
- **`MonthlyOverviewAdmin.tsx:55, 77`** — `user_integrations`, `invoice_snapshots`.
- **`ContactMessagesAdmin.tsx:13`** — `contact_messages`.
- **`GesProductionUploadAdmin.tsx`** — Çoklu (12+) tablo erişimi (`user_integrations`, `ges_plants`, `user_emails`, `owner_subscriptions`, `ges_providers`, `ges_credentials`, `ges_production_hourly`, `ges_production_daily`).
- **`GesSatisHakkiAdmin.tsx:34, 54, 66, 126`** — `ges_credentials`, `owner_subscriptions`, `ges_satis_hakki` SELECT/UPDATE (legacy).
- **`TalepBirlestirmeAdmin.tsx`** — `user_integrations`, `owner_subscriptions`, `subscription_settings`, `ges_plants`, `ges_mahsup_assignments` SELECT/INSERT; `set_ges_mahsup_priorities` (`:309`) ve `remove_ges_mahsup_assignment` (`:341`) RPC'leri; snapshot reset akışında `invoice_snapshots` DELETE.
- **`DataHealthAdmin.tsx`** — `get_consumption_health()` RPC + `data_health_providers` SELECT/UPDATE (eşik editörü).

## 15. RPC Fonksiyonları

| Adı | Tanım | Çağıranlar |
| --- | --- | --- |
| `monthly_ptf_prev_sub(p_tz, p_subscription_serno)` | Verilen tesisin geçen ay ortalama PTF değerini (TL/kWh) saatlik tüketim ağırlıklı olarak döner | `Dashboard.tsx:639, 1267`, `InvoiceDetail.tsx:446` |
| `monthly_dashboard_series(...)` | Çoklu ay özet serisi (kWh, fatura, mahsup vs.); ay-sonu TZ bug'ı `20260602_001` ile düzeltildi ve fonksiyon ilk kez migration'a alındı | `ChartsPage.tsx:355, 361`, `ConsumptionCharts.tsx:450, 469`, `reports/fetchConsumptionVsProduction.ts`, `reports/fetchMahsupPerformance.ts`, `reports/fetchPtfAnalysis.ts` |
| `reactive_mtd_totals(p_user_id)` | Ay başından bugüne tesis bazlı `active_kwh, ri_kvarh, rc_kvarh, gn_kwh, rio_kvarh, rco_kvarh` | `supabase/functions/reactive-alerts/index.ts:209`, `scripts/reactive-alerts.ts` |
| `set_ges_mahsup_priorities(p_ges_plant_id, p_sernos)` | Öncelik listesini tek transaction'da 1..N yeniden numaralandırır (`20260705_001:72-101`) | `TalepBirlestirmeAdmin.tsx:309` |
| `remove_ges_mahsup_assignment(p_id)` | Atamayı siler + kalanları atomik renumber eder (`20260706_001`) | `TalepBirlestirmeAdmin.tsx:341` |
| `get_consumption_health()` | Tesis başına son veri zamanı, 24s kayıt sayısı, gecikme saati (`20260617_002`) | `DataHealthAdmin.tsx` |

`monthly_ptf_prev_sub` migration dosyalarında **yer almaz** (Supabase Studio'da manuel tanımlı). `monthly_dashboard_series` `20260602_001` itibarıyla, `reactive_mtd_totals` `20260205_003` + `20260326_001`, talep birleştirme RPC'leri `20260705_001`/`20260705_003`/`20260706_001`, `get_consumption_health` `20260617_002` migration'larında tanımlıdır.

## 16. Edge Function Çağrıları

Frontend'den `supabase.functions.invoke()` çağrısı **yoktur**. `contact-notify` Edge Function'ı `contact_messages` tablosunda Supabase webhook (`AFTER INSERT`) ile tetiklenir; `intake-notify` de aynı desenle `intake_forms` INSERT webhook payload'ındaki `record` alanını okur (`supabase/functions/intake-notify/index.ts:46`); istemci ikisini de doğrudan çağırmaz. `reactive-alerts` Edge Function'ı yalnızca cron / GitHub Actions üzerinden tetiklenir.

## 17. Auth Çağrıları

| Yer | Çağrı | Görev |
| --- | --- | --- |
| `useSession.ts:13` | `supabase.auth.getSession()` | Mevcut oturumu yükle |
| `useSession.ts:19` | `supabase.auth.onAuthStateChange()` | Oturum değişikliği aboneliği |
| `Login.tsx:23` | `supabase.auth.signInWithPassword({ email, password })` | Giriş |
| `Login.tsx:53` | `supabase.auth.resetPasswordForEmail(email, { redirectTo })` | Parola sıfırlama linki |
| `ProfilePage.tsx:462` | `supabase.auth.signInWithPassword(...)` | Mevcut parolayı doğrulama |
| `ProfilePage.tsx:474` | `supabase.auth.updateUser({ password })` | Yeni parola yaz |
| `Header.tsx:101` | `supabase.auth.signOut()` | Çıkış |

## 18. Realtime Aboneliği

Tek bir aboneli kanal vardır (`IntakeFormsAdmin.tsx:106`):

```typescript
supabase
  .channel("intake_forms_inserts")
  .on("postgres_changes",
    { event: "INSERT", schema: "public", table: "intake_forms" },
    (payload) => setRows((prev) => [payload.new as IntakeRow, ...prev])
  )
  .subscribe();
```

Diğer tablolar için realtime abonelik kurulmamıştır.

## 19. Tablo Kullanım Özeti

| Tablo | Okunan / Yazılan | Notlar |
| --- | --- | --- |
| `auth.users` | (RLS) | İstemciden doğrudan SELECT yapılmaz |
| `user_integrations` | SELECT (admin paneli, AdminHome, GesProductionUpload), JWT'siz şu an sadece okuma | Aril hesap bilgilerini tutar |
| `owner_subscriptions` | SELECT/UPDATE/INSERT | Tesis kataloğu, multiplier, btv_enabled |
| `subscription_settings` | SELECT/UPDATE/INSERT | Tesis ayarları (kbk, terim, gerilim, tarife, on_yil, is_hidden, nickname) |
| `subscription_yekdem` | SELECT/UPDATE/INSERT/UPSERT | Tesis-aylık YEKDEM (yekdem_value, yekdem_final, diger_degerler) |
| `yekdem_official` | SELECT | Resmi YEKDEM fallback |
| `distribution_tariff_official` | SELECT | Tarife matrisi (terim/gerilim/tarife) |
| `epias_ptf_hourly` | SELECT (paginated) | Saatlik PTF |
| `consumption_hourly` | SELECT (paginated) | Saatlik tüketim, RI/RC/GN |
| `consumption_daily` | SELECT | Günlük rollup |
| `demand_monthly` | SELECT | Aylık tepe demand |
| `invoice_snapshots` | SELECT/UPSERT | Fatura snapshot'ları |
| `invoice_history` | UPSERT | `invoiceHistory.ts` üzerinden arşiv |
| `monthly_overview` | SELECT (admin) | Aylık özet |
| `contact_messages` | INSERT (public), SELECT (admin) | İletişim formu |
| `intake_forms` | INSERT (public), SELECT/UPDATE (admin), Realtime INSERT | Tanımlama başvurusu |
| `posts` | SELECT/UPDATE/INSERT/DELETE (admin), SELECT (public blog) | Blog yazıları |
| `notification_channels` | SELECT/UPDATE (admin, legacy) | Eski bildirim hedefleri |
| `notification_events` | SELECT/UPDATE (admin) | Bildirim olayları |
| `user_phone_numbers` | SELECT/INSERT/UPDATE/DELETE | Telefon numarası yönetimi |
| `user_emails` | SELECT/INSERT/UPDATE/DELETE | E-posta yönetimi |
| `sms_logs` | SELECT (admin & alerts), INSERT (cron) | SMS gönderim kayıtları |
| `email_logs` | SELECT (admin & alerts), INSERT (cron) | E-posta kayıtları |
| `reactive_alert_state` | SELECT/UPSERT (cron) | Reaktif uyarı durumu |
| `ges_providers` | SELECT/INSERT/UPDATE/DELETE (admin), SELECT (kullanıcı) | GES sağlayıcıları |
| `ges_credentials` | SELECT/INSERT/DELETE (kullanıcı), tüm CRUD (admin) | GES API kimlik bilgileri |
| `ges_plants` | SELECT (kullanıcı), tüm CRUD (admin), kullanılan onlarca yerden | GES tesisleri |
| `ges_snapshot` | SELECT (kullanıcı), tüm CRUD (admin) | GES anlık veri |
| `ges_production_daily` | SELECT (kullanıcı + admin), INSERT (toplu yükleme) | Günlük üretim |
| `ges_production_hourly` | SELECT, INSERT | Saatlik üretim |
| `ges_sync_log` | SELECT (admin) | Sync run kayıtları |
| `ges_satis_hakki` | SELECT/UPDATE (admin, legacy) | Eski satış hakkı tablosu; aktif limit `subscription_settings.satis_hakki` |
| `ges_mahsup_assignments` | SELECT/INSERT (admin) + RPC'ler | Talep birleştirme öncelik listesi |
| `data_health_providers` | SELECT/UPDATE (admin) | Veri sağlığı eşikleri |
| `manual_data_logs` | SELECT/INSERT (kullanıcı, manuel yükleme) | Manuel veri işlem logları (repo migration'ı yok) |

## 20. Toplam Sayım

- `.from("...")` çağrısı: **226** (`grep -rEo '\.from\("[a-z_]+"\)' src/`)
- `.rpc("...")` çağrısı: **14** (6 farklı RPC: `monthly_dashboard_series` ×7, `monthly_ptf_prev_sub` ×3, `set_ges_mahsup_priorities` ×2, `get_consumption_health` ×1, `remove_ges_mahsup_assignment` ×1)
- `auth.*` çağrısı: **7**
- Realtime kanal: **1**
- `supabase.functions.invoke`: **0** (frontend'den çağrılmıyor)

## 21. Kaldırılan / Değişen Yapılar

- **`btv_enabled` kolonu kaynak değişimi**: 2026-02-16'dan önce `subscription_settings` tablosundan okunuyordu. Şu an tüm okuma ve yazımlar `owner_subscriptions` tablosundadır. Eski tablo kolonu artık yok.
- **`is_hidden` ve `nickname` alanları** `subscription_settings`'a sonradan eklendi; daha önce `owner_subscriptions.title` doğrudan kullanılıyordu. Şu an `subscription_settings.nickname` öncelik, fallback olarak `subscription_settings.title`, son fallback `owner_subscriptions.title`.
- **`yekdem_official.yekdem_tl_per_kwh`** kolonu eski adıydı; yeni şema `yekdem_value` kullanır, ama legacy ortamlar için Dashboard SELECT kümesinde her ikisi de yer alır (`yekdem_value, yekdem_tl_per_kwh`).
- **`subscription_yekdem.year/month`** legacy kolonları yerine `period_year/period_month` standartlaştı; Dashboard, InvoiceDetail, YekdemMahsupDetail, calculateInvoiceToDate fonksiyonları `isMissingColumnError(err, "period_year")` üzerinden geri uyumluluk sağlar.
- **`epias_ptf_hourly.ptf_tl_kwh` vs `ptf_tl_mwh`**: yeni kolon `ptf_tl_kwh` doğrudan TL/kWh; eski şema yalnızca `ptf_tl_mwh` döndürürdü. `fetchPtfMapToDate` her ikisini de destekler ve `mwh / 1000` ile fallback yapar.
- **`invoice_history`** tablosu (`invoiceHistory.ts`) snapshot'tan ayrı olarak basit arşiv tutar; `invoice_snapshots` tablosu modern depolama yeridir. `invoice_history` legacy kalmıştır.
- **GES tabloları** 2026-02-21'de eklendi; öncesi sadece `consumption_hourly.gn` üzerinden veriş tespiti yapılıyordu. Şu an `detectVerisPresence()` hem GES API entegrasyonunu hem `gn` veriş kolonunu sayar.
- **Sorgu sayısı 181 → 226'ya çıktı** (raporlar modülü, talep birleştirme, manuel yükleme, veri sağlığı, GES satış kartları); RPC sayısı 5 → 14 (3 yeni RPC tanımı eklendi).
- **`EnergyTable` sayfalaması** (`.range()` + "daha fazla yükle") kaldırıldı; tek `.limit(1000)` çekime dönüldü, CSV/Excel export eklendi.
- **`EnergySoldCard`'ın saat-bazlı PTF satış sorguları** kaldırıldı; satış geliri `calculateGesUretimSatisi` saf hesabıyla, snapshot pariteli değerlerle gösterilir.
- **`ges_plants.source_serno`** kolonu kod tarafından okunur (`gesAllocation.ts:108,116`, `TalepBirlestirmeAdmin.tsx`) ancak repoda migration tanımı yoktur (canlı DB'de mevcut); kaynak serno çözümü `source_serno ?? linked_serno` kuralıyla yapılır.

---

## Son Güncelleme

- **Tarih:** 2026-07-12
- **Branch:** main
- **Son commit:** `500506c` — commit (çalışma ağacındaki commit edilmemiş değişiklikler dahil belgelendi)
- **Kapsanan dosyalar:** Tüm `src/` ağacı (226 `.from(...)` çağrısı + 14 RPC çağrısı + 7 auth çağrısı + 1 realtime kanalı), özellikle `Dashboard.tsx`, `YekdemMahsupDetail.tsx`, `YekdemDetail.tsx`, `InvoiceDetail.tsx`, `ConsumptionDetail.tsx`, `ConsumptionCharts.tsx`, `PtfDetail.tsx`, `ChartsPage.tsx`, `GesDetail.tsx`, `GesHourlyView.tsx`, `EnergySoldCard.tsx`, `EnergyTable.tsx`, `AlertsPage.tsx`, `PhoneNumberManager.tsx`, `EmailManager.tsx`, `ProfilePage.tsx`, `IntakeFormPage.tsx`, `ContactUs.tsx`, `LeadForm.tsx`, `Header.tsx`, `Login.tsx`, `useSession.ts`, `src/lib/*`, `src/lib/ges/*`, `src/components/admin/TableManager.tsx`, `src/components/dashboard/reports/*`, `src/components/dashboard/manualUpload/*`, `src/pages/admin/*`, `src/components/utils/*`
