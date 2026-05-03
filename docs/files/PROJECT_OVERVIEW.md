# PortEco — Proje Genel Bakış

PortEco, Türkiye'deki elektrik tüketicilerine yönelik bir enerji yönetim portalıdır. Tüketicinin SEDAŞ/MEDAŞ gibi dağıtım şirketlerinden gelen sayaç verilerini, EPİAŞ piyasa fiyatlarını (PTF), GES (güneş enerjisi) üretimini ve YEKDEM mahsuplarını tek bir panoda birleştirir; her ay sonu kapanmış faturayı ve cari ay tahminini hesaplar; reaktif limit aşımları için SMS / e-posta uyarıları gönderir.

Bu doküman üst seviye haritadır. Kapsamlı detay için `porteco-*` ve `sync-*` dosyalarına yönlendirir.

## 1. Üç Repo

| Repo | Görev | Doküman seti |
| --- | --- | --- |
| **PortEco Web** (`PORTECO-v3-main-main`) | React + Vite + Supabase istemci uygulaması; admin paneli | `porteco-01..07.md` + bu dosya + `PORTECO_SECURITY_REPORT.md` + `BLOG_CONTENT_GUIDE.md` |
| **aril-sync** (`aril-sync-main`) | Node.js servisi; SEDAŞ/MEDAŞ tüketim, EPİAŞ PTF, Growatt/HopeWind GES verisini Supabase'e yazar | `sync-01..06.md` + `PROJECT_OVERVIEW_ARIL_SYNC.md` + `ges_manuel_.md` |
| **PortEco Mobile** (Expo / React Native, ayrı repo) | Mobil istemci | `DASHBOARD_MOBILE_SPEC.md` + `PortEco_Mobile_App_RoadMap.md` (bu turda yenilenmemiştir) |

## 2. Genel Mimari Diyagramı

```
┌──────────────────┐    ┌────────────────────────────────┐
│  Web (React)     │    │  Mobile (Expo / React Native)  │
│  React Router 7  │    │  (ayrı repo, bu turda kapsam   │
│  Tailwind v4     │    │   dışı)                        │
└────────┬─────────┘    └────────────────┬───────────────┘
         │                                 │
         └────────────┬────────────────────┘
                      │ Supabase JS Client
                      ▼
        ┌──────────────────────────────┐
        │   Supabase (PostgreSQL +     │
        │   Auth + Storage + Edge Fn)  │
        │                              │
        │   • Postgres tablolar (40+) │
        │   • RLS politikaları        │
        │   • RPC fonksiyonları       │
        │   • Edge Functions:         │
        │     - reactive-alerts       │
        │     - contact-notify        │
        └──────────┬───────────────────┘
                   ▲
                   │ service-role key (sadece sunucu)
                   │
         ┌─────────┴───────────────────────────────────┐
         │  aril-sync Node.js servisi                  │
         │                                              │
         │  GitHub Actions (self-hosted Windows)       │
         │  • sync_aril.js     (her 4 saat — SEDAŞ)    │
         │  • sync_meram.js    (manuel — MEDAŞ)        │
         │  • sync_epias_ptf.js (manuel — EPİAŞ)       │
         │  • sync_growatt.js   (manuel — Growatt)     │
         │  • sync_hopewind.js  (manuel — HopeCloud)   │
         │  • send_ptf_email.js (manuel — günlük PTF)  │
         └─────────────────────────────────────────────┘
```

PortEco web reposunda da bir cron varsayımı vardır (`scripts/reactive-alerts.ts`) — bu script reaktif limit kontrolünü saatlik aralıklarla çalıştırır; production'da self-hosted bir runner üzerinde planlanır.

## 3. Veri Akışı (Üst Seviye)

1. **Sync servisleri** (`aril-sync`) harici API'lerden saatlik tüketim, aylık demand, EPİAŞ PTF ve GES üretim verisini çeker. Hepsi Supabase tablolarına UPSERT ile yazılır.
2. **PortEco Web** kullanıcı login olduktan sonra Supabase'e doğrudan SELECT atar. Tüm hesaplamalar (fatura kalemleri, mahsup, reaktif yüzdeleri) frontend tarafında yapılır; backend yalnızca veri saklama ve agregasyon RPC'leri sunar.
3. **Reaktif uyarı motoru** (`scripts/reactive-alerts.ts` veya `supabase/functions/reactive-alerts/index.ts`) periyodik olarak `reactive_mtd_totals` RPC'sini çağırır, eşik aşan tesisler için SMS ve e-posta gönderir, durumu `reactive_alert_state` tablosuna upsert eder.
4. **İletişim formu** (`/iletisim`) `contact_messages` tablosuna insert yapar. Bu insert Supabase webhook'u ile `contact-notify` Edge Function'ını tetikler; sabit numaraya bilgilendirme SMS'i atar.

## 4. Yetkilendirme Seviyeleri

| Seviye | Erişim |
| --- | --- |
| **Public** | `/`, `/login`, `/forgot-password`, `/blog`, `/blog/:slug`, `/iletisim`, `/basvuru` |
| **User** (login + JWT) | `/dashboard/*` (admin altı hariç) — kullanıcı yalnızca kendi `user_id` satırlarını görür (RLS) |
| **Admin** (JWT içinde `app_metadata.is_admin = true`) | `/dashboard/admin/*` — RLS bypass policy'leri sayesinde tüm satırlara erişim |

JWT'deki `is_admin` flag'i istemciden değiştirilemez. Yalnızca service-role key ile (Supabase Studio veya `supabase.auth.admin.updateUserById`) set edilir.

## 5. Tablo Listesi (Master)

Aşağıdaki tablolar PortEco ekosisteminde kullanılır. Detaylı kullanım `porteco-07-supabase-queries.md` ve `sync-06-supabase-yazma-stratejisi.md` dosyalarında.

| Tablo | Tutucu | Yazıcı |
| --- | --- | --- |
| `auth.users` | Supabase Auth | Supabase Auth |
| `user_integrations` | Supabase | Admin (manuel) |
| `owner_subscriptions` | aril-sync (sync_aril, sync_meram) | sync upsert + admin |
| `subscription_settings` | Frontend (profil) + Admin | Profil sayfası, AdminUsersPage, IntakeFormsAdmin |
| `subscription_yekdem` | Admin | SubscriptionYekdemAdmin (manuel veri girişi) |
| `yekdem_official` | Manuel | Admin (Supabase Studio) |
| `distribution_tariff_official` | Admin | DistributionTariffAdmin |
| `epias_ptf_hourly` | sync_epias_ptf | Sync upsert |
| `consumption_hourly` | sync_aril, sync_meram | Sync upsert (500'lük batch) |
| `consumption_daily` | (Postgres view veya sync rollup) | (genelde aril-sync dolaylı) |
| `demand_monthly` | sync_aril, sync_meram | Sync upsert |
| `invoice_snapshots` | Frontend (Dashboard, InvoiceDetail) + Admin | `upsertInvoiceSnapshot()` |
| `invoice_history` | Frontend | Legacy arşiv |
| `monthly_overview` | Postgres view | (otomatik) |
| `contact_messages` | Public form | `ContactUs.tsx`, `LeadForm.tsx` |
| `intake_forms` | Public form | `IntakeFormPage.tsx` |
| `posts` | Admin | PostsAdmin |
| `notification_channels` | Legacy admin | NotificationChannelsAdmin |
| `notification_events` | Admin | NotificationEventsAdmin |
| `user_phone_numbers` | Frontend (PhoneNumberManager) | INSERT/UPDATE/DELETE |
| `user_emails` | Frontend (EmailManager) | INSERT/UPDATE/DELETE |
| `sms_logs` | Cron + Edge Function | INSERT (sent/failed) |
| `email_logs` | Cron | INSERT (sent/failed) |
| `reactive_alert_state` | Cron + Edge Function | UPSERT |
| `ges_providers` | Admin | GesProvidersAdmin |
| `ges_credentials` | Profil + Admin | INSERT/DELETE/UPDATE |
| `ges_plants` | sync_growatt, sync_hopewind | Sync upsert + admin |
| `ges_snapshot` | sync_growatt, sync_hopewind | Sync upsert |
| `ges_production_daily` | sync_growatt, sync_hopewind | Sync upsert (500'lük batch) |
| `ges_production_hourly` | sync_growatt, manuel upload | Sync upsert + admin |
| `ges_sync_log` | sync_growatt, sync_hopewind | INSERT |
| `ges_satis_hakki` | Admin | GesSatisHakkiAdmin |

Tabloların kolon detayları için ilgili migration dosyalarına ve `porteco-07-supabase-queries.md` "Tablo Kullanım Özeti" bölümüne bakılır.

## 6. Edge Functions

| Fonksiyon | Tetikleyici | Görev | Doküman |
| --- | --- | --- | --- |
| `reactive-alerts` | Cron / `npm run cron:alerts` (header `x-cron-token`) | Reaktif RI/RC eşik kontrolü, SMS + e-posta gönderim | [porteco-04-reaktif-islemler.md](./porteco-04-reaktif-islemler.md) |
| `contact-notify` | `contact_messages` AFTER INSERT webhook | Sabit numaraya bilgilendirme SMS'i (`905550125527`) | [porteco-04-reaktif-islemler.md](./porteco-04-reaktif-islemler.md) |

## 7. Cron / Scheduled Jobs

| Yer | Schedule | Görev |
| --- | --- | --- |
| `aril-sync/.github/workflows/sync_aril_6h.yml` | `0 */4 * * *` | `node sync_aril.js --mode all --days 1` |
| `aril-sync/.github/workflows/aril_sync_5min.yml` | `*/5 * * * *` | TEST: aynı komut, devre dışı bırakılmalı |
| `aril-sync/.github/workflows/schedule_smoke.yml` | `*/5 * * * *` | Echo + date (scheduler smoke test) |
| Diğer aril-sync scriptleri | Manuel (workflow yok) | `sync_growatt`, `sync_epias_ptf`, `sync_hopewind`, `sync_meram`, `send_ptf_email` |
| `PORTECO-v3 scripts/reactive-alerts.ts` | Manuel / harici cron | Reaktif uyarı kontrolü |

## 8. Marka, Renkler, Font

| Element | Değer |
| --- | --- |
| Birincil mavi | `#00AEEF` (`brand.blue`) |
| Hover mavi | `#40CFFF` (`brand.blueLight`) |
| Koyu başlık | `#005B96` (`brand.blueDark`) |
| Koyu metin / arka plan | `#0F1C2E` (`brand.dark` / `neutral.dark`) |
| İkincil metin | `#7A8C99` (`neutral.gray`) |
| Açık mavi | `#E6F8FD` (`neutral.lightBlue`) |
| Beyaz | `#FFFFFF` |
| Font ailesi | Inter (400/500/600/700, Google Fonts) |
| Border radius (varsayılan) | `8px` |

`tailwind.config.cjs` dosyasında tanımlı; tüm sayfalar bu tokenları `bg-brand-blue`, `text-brand-blueDark` gibi sınıflarla kullanır.

## 9. Doküman Dizini

| Dosya | Konu |
| --- | --- |
| [porteco-01-genel-mimari.md](./porteco-01-genel-mimari.md) | Web reposu mimarisi, klasör yapısı, routing, lib, hesaplama modülleri, env vars |
| [porteco-02-dashboard-karti.md](./porteco-02-dashboard-karti.md) | 7 dashboard kartı, useEffect zinciri, Tüm Tesisler bandı |
| [porteco-03-yekdem-mahsup-sayfasi.md](./porteco-03-yekdem-mahsup-sayfasi.md) | YEKDEM mahsup formülü, veri akışı, hata noktaları |
| [porteco-04-reaktif-islemler.md](./porteco-04-reaktif-islemler.md) | Reaktif uyarı motoru, Edge Function, cron, SMS / e-posta |
| [porteco-05-fatura-sayfasi.md](./porteco-05-fatura-sayfasi.md) | calculateInvoice, computeMonthInvoiceToDate, snapshot sistemi |
| [porteco-06-admin-paneli.md](./porteco-06-admin-paneli.md) | TableManager, 28 admin sayfası, RLS bypass, bilinen bug'lar |
| [porteco-07-supabase-queries.md](./porteco-07-supabase-queries.md) | Tüm `.from(...)` çağrıları, RPC'ler, realtime aboneliği |
| [PORTECO_SECURITY_REPORT.md](./PORTECO_SECURITY_REPORT.md) | RLS durumu, env exposure, kontrol listesi |
| [BLOG_CONTENT_GUIDE.md](./BLOG_CONTENT_GUIDE.md) | Blog yazısı ekleme akışı |
| `PROJECT_OVERVIEW_ARIL_SYNC.md` (aril-sync repo'da) | Sync servisinin üst görünümü |
| `sync-01..06.md` (aril-sync repo'da) | Sync detayları (mimari, PTF, GES, tüketim, diğer, supabase yazma) |
| `ges_manuel_.md` (aril-sync repo'da) | GES kullanım rehberi |

## 10. Kaldırılan / Değişen Yapılar

- **Mobile uygulama dokümanları** bu turda yenilenmemiştir (kullanıcı kararı). Önceki sürümleri olduğu yerde kalmıştır; PortEco Web ve aril-sync repo'larında yer almazlar.
- **`subscription_settings.btv_enabled`** kolonu kaldırılmış, yerini `owner_subscriptions.btv_enabled` almıştır (2026-02-16). `btvToggle.ts` yeni konumdan yazar.
- **`notification_channels`** tablosu legacy konumda kalmıştır; aktif kullanım `user_phone_numbers` + `user_emails`'e geçmiştir.
- **GES alt sistemi** 2026-02-21'de aktif olarak eklenmiştir; aril-sync tarafında `sync_growatt.js` (üretimde), `sync_hopewind.js` (taslak/eksik workflow), web tarafında `GesDetail.tsx`, `GesPlantsAdmin`, `ges_*` tablolar.
- **`on_yil` ve `perakende_enerji_bedeli`** alanları 2026-04-10 itibarıyla `subscription_settings` ve `distribution_tariff_official` tablolarına eklenmiş; eski snapshot'lar `recomputeSnapshotTotalWithMahsup()` ile geriye dönük doğru hesaplanır.
- **MEDAŞ desteği** (`sync_meram.js`) 2026 son güncellemelerinde eklenmiş; henüz GitHub Actions workflow tanımı yoktur, manuel çalıştırılır.

---

## Son Güncelleme

- **Tarih:** 2026-05-03
- **Branch:** main
- **Son commit (PortEco Web):** `03aa828` — valla bişeler yaptık da hatırlamıyom amk
- **Son commit (aril-sync):** `c3c29d5` — Meram
- **Kapsanan dosyalar:** Yapı düzeyinde her iki repo; detay alt dokümanlara yönlendirilmiştir.
