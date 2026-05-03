# PortEco Web — Supabase Query Envanteri

Bu doküman, frontend kaynak kodunun Supabase'e attığı her sorguyu (SELECT/INSERT/UPDATE/UPSERT/DELETE/RPC/Realtime) dosya bazında listeler. Toplam 181 adet `.from("...")` çağrısı, 5 adet `.rpc(...)` çağrısı, 1 adet realtime aboneliği ve birkaç `auth.*` çağrısı vardır. Tablo özetleri ve RPC tanımları en sondadır.

Sayım kaynağı: `grep -rEn '\.from\("[a-z_]+"\)' src/`.

## 1. Dashboard.tsx — Ana Panel

`src/pages/Dashboard.tsx` (1797 satır)

### 1.1 Yardımcı fonksiyonlar

| Satır | Tablo | Op | Filtre |
| --- | --- | --- | --- |
| `Dashboard.tsx:86` | `subscription_yekdem` | SELECT `yekdem_value, yekdem_final` | `(user_id, subscription_serno, period_year, period_month)` |
| `Dashboard.tsx:110` | `subscription_yekdem` | SELECT `yekdem_value, yekdem_final` | Legacy `(year, month)` fallback |
| `Dashboard.tsx:142` | `subscription_yekdem` | SELECT `diger_degerler` | `(user_id, subscription_serno, period_year, period_month)` |
| `Dashboard.tsx:158` | `subscription_yekdem` | SELECT `diger_degerler` | Legacy fallback |

### 1.2 Effect 0 — Tesis Listesi

| Satır | Tablo | Op | Filtre |
| --- | --- | --- | --- |
| `Dashboard.tsx:409` | `owner_subscriptions` | SELECT `subscription_serno, meter_serial, title` | `user_id`, `order subscription_serno asc` |
| `Dashboard.tsx:431` | `subscription_settings` | SELECT `subscription_serno, title, nickname` | `user_id`, `subscription_serno IN (...)` |
| `Dashboard.tsx:466` | `subscription_settings` | SELECT `subscription_serno, title, nickname` | `user_id`, fallback liste |

### 1.3 Effect 2 — PTF (RPC)

| Satır | RPC | Argüman |
| --- | --- | --- |
| `Dashboard.tsx:590` | `monthly_ptf_prev_sub` | `{ p_tz: TR_TZ, p_subscription_serno: selectedSub }` |

### 1.4 Effect 3 — YEKDEM Resmi Fallback

| Satır | Tablo | Op | Filtre |
| --- | --- | --- | --- |
| `Dashboard.tsx:661` | `yekdem_official` | SELECT `yekdem_value, yekdem_tl_per_kwh` | `year`, `month` |

### 1.5 Effect 4 — KBK

| Satır | Tablo | Op | Filtre |
| --- | --- | --- | --- |
| `Dashboard.tsx:712` | `subscription_settings` | SELECT `kbk` | `(user_id, subscription_serno)` |

### 1.6 Effect 5 — Fatura

| Satır | Tablo | Op | Filtre |
| --- | --- | --- | --- |
| `Dashboard.tsx:772` | `invoice_snapshots` | SELECT `INVOICE_SNAPSHOT_RECOMPUTE_FIELDS, has_yekdem_mahsup` | `(user_id, subscription_serno, period_year, period_month, invoice_type='billed')` |
| `Dashboard.tsx:797` | `subscription_settings` | SELECT `terim, gerilim, tarife, guc_bedel_limit, trafo_degeri, on_yil` | `(user_id, subscription_serno)` |
| `Dashboard.tsx:834` | `distribution_tariff_official` | SELECT `dagitim_bedeli, guc_bedeli, guc_bedeli_asim, kdv, btv, reaktif_bedel, perakende_enerji_bedeli` | `(terim, gerilim, tarife)` |
| `Dashboard.tsx:852` | `owner_subscriptions` | SELECT `multiplier, btv_enabled` | `(user_id, subscription_serno)` |
| `Dashboard.tsx:867` | `demand_monthly` | SELECT `max_demand_kw` | `(user_id, subscription_serno, period_year, period_month, is_final=true)` |
| `Dashboard.tsx:962` | `consumption_daily` | SELECT `day, kwh_in` | `(user_id, subscription_serno)`, M-1 ay aralığı |
| Dashboard.tsx içinde `fetchAllConsumption()` | `consumption_hourly` | paginated SELECT (saatlik tüketim toplamı) | `(user_id, subscription_serno, ts)` |

### 1.7 Effect 6 — Tüm Tesisler Toplamı

| Satır | Tablo | Op |
| --- | --- | --- |
| `Dashboard.tsx:1139` | `invoice_snapshots` | SELECT (snapshot kontrolü) |
| `Dashboard.tsx:1160` | RPC `monthly_ptf_prev_sub` | Per tesis çağrı |
| `Dashboard.tsx:1175` | `yekdem_official` | SELECT (fallback) |
| `Dashboard.tsx:1188` | `subscription_settings` | SELECT `kbk, terim, gerilim, tarife, guc_bedel_limit, trafo_degeri, on_yil` |
| `Dashboard.tsx:1209` | `distribution_tariff_official` | SELECT (tariff alanları) |
| `Dashboard.tsx:1220` | `owner_subscriptions` | SELECT `multiplier, btv_enabled` |
| `Dashboard.tsx:1231` | `demand_monthly` | SELECT `max_demand_kw` |
| `Dashboard.tsx:1294` | `consumption_daily` | SELECT `day, kwh_in` (M-1 mahsup) |

### 1.8 Effect 7 — GES

| Satır | Tablo | Op | Filtre |
| --- | --- | --- | --- |
| `Dashboard.tsx:1390` | `ges_plants` | SELECT `id` | `(user_id, is_active=true)` |
| `Dashboard.tsx:1407` | `ges_production_daily` | SELECT `energy_kwh` | `ges_plant_id IN (...)`, `date` aralığı |

## 2. YekdemMahsupDetail.tsx

`src/components/dashboard/YekdemMahsupDetail.tsx`

| Satır | Tablo | Op | Notlar |
| --- | --- | --- | --- |
| `:56` | `subscription_yekdem` | SELECT `yekdem_value, yekdem_final` | Yardımcı `fetchSubYekdemForMahsup` (period_*) |
| `:75` | `subscription_yekdem` | SELECT (legacy fallback) | `(year, month)` |
| `:142` | `subscription_settings` | SELECT `subscription_serno, title, nickname, is_hidden` | `user_id` |
| `:161` | `owner_subscriptions` | SELECT `subscription_serno, title` | Fallback |
| `:230` | `subscription_settings` | SELECT `kbk, terim, gerilim, tarife` | Mahsup için zorunlu ayarlar |
| `:254` | `distribution_tariff_official` | SELECT `kdv, btv` | Tarife eşleşmesi |
| `:274` | `consumption_daily` | SELECT `day, kwh_in` | M-1 tüketim toplamı |
| Yardımcı `fetchAllConsumption` | `consumption_hourly` | paginated SELECT | `consumption_daily` boşsa fallback |

## 3. YekdemDetail.tsx

`src/components/dashboard/YekdemDetail.tsx`

| Satır | Tablo | Op | Notlar |
| --- | --- | --- | --- |
| `:104` | `owner_subscriptions` | SELECT (tesis listesi) |  |
| `:116` | `subscription_settings` | SELECT (title, nickname) | İsim üretmek için |
| `:191` | `subscription_yekdem` | SELECT `yekdem_value, yekdem_final, period_year, period_month` | Tesis YEKDEM tarihçesi |

## 4. InvoiceDetail.tsx

`src/components/dashboard/InvoiceDetail.tsx` (Effect 5 ile aynı pipeline'ı kullanır ancak kalem dökümünü gösterir)

| Satır | Tablo | Op | Notlar |
| --- | --- | --- | --- |
| `:126`, `:139`, `:165`, `:184`, `:212`, `:224` | `subscription_yekdem` | SELECT (period_* + legacy fallback) | YEKDEM lookup'lar |
| `:287` | `subscription_settings` | SELECT (terim, gerilim, tarife, guc_bedel_limit, trafo_degeri, on_yil) |  |
| `:307` | `owner_subscriptions` | SELECT (multiplier, btv_enabled) |  |
| `:393` | RPC `monthly_ptf_prev_sub` | PTF fetch | Aynı RPC |
| `:419` | `yekdem_official` | SELECT (fallback) |  |
| `:437` | `subscription_settings` | SELECT (ek alan kontrolü) |  |
| `:484`, `:501` | `owner_subscriptions` | SELECT (fallback path) |  |
| `:519` | `distribution_tariff_official` | SELECT (full tariff) |  |
| `:564` | `demand_monthly` | SELECT `max_demand_kw` |  |
| `:643` | `consumption_daily` | SELECT (M-1 kWh) |  |
| `:861` | `ges_plants` | SELECT (üretim tespiti) |  |

## 5. InvoiceHistory.tsx + InvoiceSnapshotDetail.tsx

`src/pages/InvoiceHistory.tsx`, `src/pages/InvoiceSnapshotDetail.tsx`

`listInvoiceSnapshots` ve `getInvoiceSnapshot` üzerinden `invoice_snapshots` tablosuna SELECT yapılır (`invoiceSnapshots.ts:230` ve `:254`). InvoiceHistory ek olarak `subscription_settings` ve `owner_subscriptions` üzerinden tesis adı çözümlemesi yapar.

## 6. ConsumptionDetail.tsx

`src/components/dashboard/ConsumptionDetail.tsx`

| Satır | Tablo | Op |
| --- | --- | --- |
| `:115` | `owner_subscriptions` | SELECT (tesis listesi) |
| `:226` | `consumption_daily` | SELECT (günlük kWh ana grafik) |
| `:293` | `consumption_daily` | SELECT (önceki ay karşılaştırma) |
| `paginatedFetch` | `consumption_hourly` | paginated SELECT (saatlik detay sekmesinde) |

## 7. PtfDetail.tsx

`src/components/dashboard/PtfDetail.tsx`

| Satır | Tablo | Op | Notlar |
| --- | --- | --- | --- |
| `:169` | `owner_subscriptions` | SELECT |  |
| `:181` | `subscription_settings` | SELECT |  |
| `paginatedFetch` | `epias_ptf_hourly` | paginated SELECT (saatlik PTF zaman serisi) |  |
| `:276` | `ges_plants` | SELECT (GES varlığı) |  |
| `:291` | `ges_production_hourly` | SELECT (saatlik üretim) |  |

## 8. ChartsPage.tsx

`src/components/dashboard/ChartsPage.tsx`

| Satır | Tablo / RPC | Op |
| --- | --- | --- |
| `:229` | `owner_subscriptions` | SELECT (tesis listesi) |
| `:300` | RPC `monthly_dashboard_series` | Çoklu ay seri (kullanıcı bazlı) |
| `:306` | RPC `monthly_dashboard_series` | Tüm tesis seri |

## 9. GesDetail.tsx + GesHourlyView.tsx + GesOlmasaydiPanel.tsx

`src/components/dashboard/GesDetail.tsx`

| Satır | Tablo | Op |
| --- | --- | --- |
| `:148` | `ges_plants` | SELECT |
| `:199` | `ges_snapshot` | SELECT (anlık güç + bugün enerjisi) |
| `:241`, `:271`, `:300`, `:346`, `:395`, `:469` | `ges_production_daily` | SELECT (farklı tarih aralıkları) |
| `:438` | `ges_satis_hakki` | SELECT |

`GesHourlyView.tsx:100` — `ges_production_hourly` SELECT.

`calculateGesOlmasaydi.ts:65` — `ges_production_hourly`, `:97` — `ges_plants`.

`GesSavingsSection.tsx:31, 45` — `subscription_yekdem`. `:94` — `subscription_settings`.

## 10. EnergySoldCard.tsx + EnergyTable.tsx

`src/components/dashboard/EnergySoldCard.tsx`

| Satır | Tablo |
| --- | --- |
| `:83` | `owner_subscriptions` |
| `:102`, `:170` | `subscription_settings` |
| `:238` | `distribution_tariff_official` |

`EnergyTable.tsx`

| Satır | Tablo |
| --- | --- |
| `:45` | `owner_subscriptions` |
| `:57` | `subscription_settings` |
| `:86` | `consumption_hourly` |

## 11. AlertsPage.tsx

`src/pages/AlertsPage.tsx`

| Satır | Tablo | Filtre |
| --- | --- | --- |
| `:148` | `owner_subscriptions` | `user_id` |
| `:167` | `reactive_alert_state` | `user_id` |
| `:196` | `sms_logs` | `user_id`, son 100 |
| `:223` | `email_logs` | `user_id`, son 100 |

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
- **`IntakeFormPage.tsx:218`** — `intake_forms` INSERT.

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
- **`GesSatisHakkiAdmin.tsx:34, 54, 66, 126`** — `ges_credentials`, `owner_subscriptions`, `ges_satis_hakki` SELECT/UPDATE.

## 15. RPC Fonksiyonları

| Adı | Tanım | Çağıranlar |
| --- | --- | --- |
| `monthly_ptf_prev_sub(p_tz, p_subscription_serno)` | Verilen tesisin geçen ay ortalama PTF değerini (TL/kWh) saatlik tüketim ağırlıklı olarak döner | `Dashboard.tsx:590, 1160`, `InvoiceDetail.tsx:393` |
| `monthly_dashboard_series(...)` | Çoklu ay özet serisi (kWh, fatura, mahsup vs.) | `ChartsPage.tsx:300, 306` |
| `reactive_mtd_totals(p_user_id)` | Ay başından bugüne tesis bazlı `active_kwh, ri_kvarh, rc_kvarh, gn_kwh, rio_kvarh, rco_kvarh` | `supabase/functions/reactive-alerts/index.ts:209`, `scripts/reactive-alerts.ts:284` |

`monthly_ptf_prev_sub` ve `monthly_dashboard_series` migration dosyalarında **yer almaz**; Supabase Studio üzerinden manuel tanımlanmıştır. `reactive_mtd_totals` ise `20260205_003_create_reactive_mtd_totals.sql` ve `20260326_001_alter_reactive_mtd_totals.sql` migration'larında tanımlıdır.

## 16. Edge Function Çağrıları

Frontend'den `supabase.functions.invoke()` çağrısı **yoktur**. `contact-notify` Edge Function'ı `contact_messages` tablosunda Supabase webhook (`AFTER INSERT`) ile tetiklenir; istemci doğrudan çağırmaz. `reactive-alerts` Edge Function'ı yalnızca cron / GitHub Actions üzerinden tetiklenir.

## 17. Auth Çağrıları

| Yer | Çağrı | Görev |
| --- | --- | --- |
| `useSession.ts:13` | `supabase.auth.getSession()` | Mevcut oturumu yükle |
| `useSession.ts:19` | `supabase.auth.onAuthStateChange()` | Oturum değişikliği aboneliği |
| `Login.tsx:21` | `supabase.auth.signInWithPassword({ email, password })` | Giriş |
| `Login.tsx:48` | `supabase.auth.resetPasswordForEmail(email, { redirectTo })` | Parola sıfırlama linki |
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
| `ges_satis_hakki` | SELECT/UPDATE (admin & dashboard) | Satış hakkı bilgisi |

## 20. Toplam Sayım

- `.from("...")` çağrısı: **181** (`grep -rEn '\.from\("[a-z_]+"\)'`)
- `.rpc("...")` çağrısı: **5**
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

---

## Son Güncelleme

- **Tarih:** 2026-05-03
- **Branch:** main
- **Son commit:** `03aa828` — valla bişeler yaptık da hatırlamıyom amk
- **Kapsanan dosyalar:** Tüm `src/` ağacı (181 `.from(...)` çağrısı + 5 RPC + 7 auth çağrısı + 1 realtime kanalı), özellikle `Dashboard.tsx`, `YekdemMahsupDetail.tsx`, `YekdemDetail.tsx`, `InvoiceDetail.tsx`, `ConsumptionDetail.tsx`, `PtfDetail.tsx`, `ChartsPage.tsx`, `GesDetail.tsx`, `GesHourlyView.tsx`, `EnergySoldCard.tsx`, `EnergyTable.tsx`, `AlertsPage.tsx`, `PhoneNumberManager.tsx`, `EmailManager.tsx`, `ProfilePage.tsx`, `IntakeFormPage.tsx`, `ContactUs.tsx`, `LeadForm.tsx`, `Header.tsx`, `Login.tsx`, `useSession.ts`, `src/lib/*`, `src/components/admin/TableManager.tsx`, `src/pages/admin/*`, `src/components/utils/*`
