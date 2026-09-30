# PortEco Web — Genel Mimari

PortEco Web, enerji tüketimini, fatura kalemlerini, YEKDEM mahsup hesaplarını ve GES (güneş enerjisi) üretimini takip etmek için yazılmış bir SaaS portalıdır. Bu doküman; teknoloji yığını, klasör yapısı, routing, state yönetimi, hesaplama modülleri, lib katmanı, kimlik doğrulama akışı, ortam değişkenleri ve marka renklerini kapsar.

## 1. Framework ve Teknoloji Stack

Bağımlılıklar `package.json`'dan birebir alınmıştır.

| Kategori | Paket | Versiyon | Amaç |
| --- | --- | --- | --- |
| UI | `react` | `^18.3.1` | Bileşen kütüphanesi |
| UI | `react-dom` | `^18.3.1` | DOM render |
| Routing | `react-router-dom` | `^7.8.0` | İstemci tarafı yönlendirme |
| Backend | `@supabase/supabase-js` | `^2.57.4` | Postgres + Auth + Storage istemcisi |
| Build | `vite` | `^7.1.0` | Dev server + production build |
| Build | `@vitejs/plugin-react` | `^4.7.0` | React + HMR plugin |
| Stiller | `tailwindcss` | `^4.1.11` | Atomic CSS |
| Stiller | `@tailwindcss/postcss` | `^4.1.11` | Tailwind v4 PostCSS köprüsü |
| Stiller | `@tailwindcss/typography` | `^0.5.19` | `prose` sınıf seti |
| Stiller | `autoprefixer` | `^10.4.21` | Vendor prefix |
| Stiller | `postcss` | `^8.5.6` | CSS pipeline |
| Tarih | `dayjs` | `^1.11.18` | Saat dilimi farkındalı tarih (`Europe/Istanbul`) |
| Grafik | `recharts` | `^3.6.0` | Dashboard ve detay sayfası grafikleri |
| Animasyon | `framer-motion` | `^12.23.12` | Bölüm geçişleri |
| Animasyon | `@splinetool/react-spline` | `^4.1.0` | 3D Spline sahnesi (Hero) |
| İkon | `lucide-react` | `^0.542.0` | İkon seti |
| İçerik | `react-markdown` | `^10.1.0` | Blog markdown render |
| İçerik | `remark-gfm` | `^4.0.1` | GitHub Flavored Markdown |
| Excel | `xlsx` | `^0.18.5` | Eski Excel exportları + manuel/admin yükleme parse (SheetJS) |
| Excel | `exceljs` | `^4.4.0` | Markalı rapor Excel exportları (`reports/brandedExcel.ts`, dynamic import) |
| UI ek | `@radix-ui/react-slot` | `^1.2.3` | Shadcn `Slot` desteği |
| Tip | `typescript` | `^5.5.4` | Tip kontrolü |
| Lint | `eslint` | `^9.32.0` | Lint runner |
| Lint | `typescript-eslint` | `^8.39.0` | TS ESLint preset |
| Lint | `eslint-plugin-react-hooks` | `^5.2.0` | Hook bağımlılık denetimi |
| Lint | `eslint-plugin-react-refresh` | `^0.4.20` | HMR uyarıları |
| CLI | `tsx` | `^4.21.0` | Cron script çalıştırıcı |
| CLI | `dotenv` | `^17.2.4` | `.env` yükleyici (script tarafı) |
| CLI | `supabase` | `^2.72.6` | Supabase CLI (devDependency) |

Yapılandırma dosyaları:

| Dosya | Rol |
| --- | --- |
| `vite.config.ts` | Vite ayarları, `@vitejs/plugin-react` |
| `tsconfig.json` | TypeScript path alias'ları (`@/*`, `@components/*`) |
| `tailwind.config.cjs` | Marka renkleri ve `Inter` font ailesi |
| `postcss.config.cjs` | `@tailwindcss/postcss` + `autoprefixer` |
| `eslint.config.js` | Düz (flat) ESLint yapılandırması |
| `index.html` | `lang="tr"`, `Inter` Google Fonts, `/src/main.tsx` girişi |

## 2. Klasör Yapısı

`src/` altındaki ağaç (3 derinlik).

```
src/
├── App.tsx                       # Route tanımları + layout sarmalayıcı
├── main.tsx                      # ReactDOM + BrowserRouter girişi
├── index.css                     # Global stiller / Tailwind direktifleri
├── vite-env.d.ts                 # Vite tip tanımları
├── assets/                       # Statik görseller
├── content/                      # Statik içerik kaynakları
│   ├── blog.ts
│   ├── blogSidebarCards.ts
│   ├── dashboardCards.ts         # Dashboard kart kataloğu (DASH_CARDS)
│   ├── faq.ts
│   ├── features.ts
│   ├── partners.ts
│   └── strings.ts
├── hooks/                        # Yeniden kullanılan React hook'ları
│   ├── useIsAdmin.ts
│   └── useSession.ts
├── lib/                          # Yan-etkisiz yardımcılar
│   ├── btvToggle.ts
│   ├── dataHealth.ts             # Veri sağlığı tipleri + durum hesabı
│   ├── dayjs.ts
│   ├── formatNumber.ts
│   ├── paginatedFetch.ts
│   ├── scroll.ts
│   ├── subscriptionVisibility.ts
│   ├── supabase.ts
│   ├── utils.ts
│   └── ges/
│       ├── detectVerisPresence.ts
│       ├── gesSatisDagitimRate.ts # Donmuş/canlı dağıtım kesinti oranı çözümü
│       ├── gesUretimSatisi.ts     # Veriş fazlası satış bedeli (tek kaynak)
│       └── manualPlants.ts        # provider name='manual' plant kümesi
├── pages/                        # Üst seviye sayfa bileşenleri
│   ├── AlertsPage.tsx
│   ├── BlogDetailPage.tsx
│   ├── BlogPage.tsx
│   ├── ContactPage.tsx
│   ├── Dashboard.tsx
│   ├── Features.tsx
│   ├── FilesPage.tsx
│   ├── ForgotPassword.tsx
│   ├── Home.tsx
│   ├── IntakeFormPage.tsx
│   ├── InvoiceHistory.tsx
│   ├── InvoiceSnapshotDetail.tsx
│   ├── Login.tsx
│   ├── ProfilePage.tsx
│   └── admin/                    # Admin sayfaları (32 dosya + 1 .bak)
└── components/
    ├── admin/                    # AdminShell, AdminSidebar, TableManager
    │   └── dataHealth/           # DataHealthDetailModal, DataHealthThresholdsModal, Modal
    ├── auth/                     # ProtectedRoute, AdminRoute
    ├── blog/                     # BlogSidebar, BlogCtaCard, TableOfContents
    ├── dashboard/                # Dashboard alt sayfaları + ortak parçalar
    │   ├── invoiceDetail/        # AlternateTariffInvoiceSection
    │   ├── manualUpload/         # ManualUploadPanel, DateRangeDeleteModal, DataLogsModal
    │   ├── reports/              # ReportsSection + 4 rapor (fetch/export) + brandedExcel
    │   └── shared/               # ConnectGesOverlay, GesSavingsCard/Section, GesUretimSatisiCard, gesPlaceholders
    ├── forms/                    # LeadForm
    ├── hero/                     # Hero (Spline)
    ├── layout/                   # Header, Footer, Container, Section
    ├── motion/                   # ScrollToTop, Parallax
    ├── sections/                 # AboutUs, FAQSection, FeaturesSection, ...
    │   └── about/                # CtaContact, StatsStrip
    ├── ui/                       # button, card, input (shadcn türevleri)
    └── utils/                    # Hesaplama modülleri (calculateInvoice, ...)
```

`supabase/` ağacı:

```
supabase/
├── functions/
│   ├── contact-notify/index.ts   # İletişim formu → SMS
│   ├── intake-notify/index.ts    # Başvuru formu → ekibe e-posta (Resend)
│   └── reactive-alerts/index.ts  # Reaktif uyarı motoru
└── migrations/                   # 50 SQL göç dosyası (2026-02-03 → 2026-07-10)
```

`scripts/` ağacı (cron ve test):

```
scripts/
├── generate-logo-png.mjs         # SVG logodan PNG üretimi (tek seferlik araç)
├── reactive-alerts.ts            # GitHub Actions / cron giriş noktası
├── test-email.ts                 # Resend ile e-posta testi
├── test-sms.ts                   # İleti Merkezi ile SMS testi
└── lib/
    └── reactive-email-template.ts # Reaktif aşım e-postası HTML+text şablonu
```

## 3. Routing Yapısı

Tüm route'lar `src/App.tsx` içinde tanımlıdır. Üç tablo halinde verilmiştir.

### Public

| URL | Element | Açıklama |
| --- | --- | --- |
| `/` | `Home` | Pazarlama ana sayfası, Hero (Spline) + bölümler |
| `/login` | `Login` | E-posta/şifre girişi |
| `/forgot-password` | `ForgotPassword` | Parola sıfırlama akışı |
| `/blog` | `BlogPage` | Blog listesi |
| `/blog/:slug` | `BlogDetailPage` | Tek blog yazısı |
| `/iletisim` | `ContactPage` | İletişim formu (`contact_messages`) |
| `/basvuru` | `IntakeFormPage` | Tanımlama başvuru formu (`intake_forms`) |

### Protected (`<ProtectedRoute>` sarmalayıcısı)

| URL | Element | Açıklama |
| --- | --- | --- |
| `/dashboard` | `Dashboard` | Ana panel (`src/pages/Dashboard.tsx`) |
| `/dashboard/consumption` | `ConsumptionDetail` | Aylık tüketim grafiği ve detayı |
| `/dashboard/yekdem` | `YekdemDetail` | YEKDEM tarihçesi |
| `/dashboard/invoice-detail` | `InvoiceDetail` | M-1 fatura kalemleri |
| `/dashboard/profile` | `ProfilePage` | Tesis takma adı, gizleme, BTV toggle |
| `/dashboard/files` | `FilesPage` | Belge listesi |
| `/dashboard/invoices` | `InvoiceHistory` | Geçmiş `invoice_snapshots` |
| `/dashboard/invoices/:sub/:year/:month` | `InvoiceSnapshotDetail` | Belirli snapshot detayı |
| `/dashboard/ptf` | `PtfDetail` | PTF saat eğrisi |
| `/dashboard/yekdem-mahsup` | `YekdemMahsupDetail` | YEKDEM mahsup hesabı |
| `/dashboard/charts` | `ChartsPage` | Çoklu ay seriler |
| `/dashboard/alerts` | `AlertsPage` | Reaktif uyarı log'u + telefon/e-posta CRUD |
| `/dashboard/ges` | `GesDetail` | GES üretim panosu |

### Admin (`<AdminRoute>` ebeveyni altında, `/dashboard/admin` ön ekiyle)

| URL | Element | Bağlı tablo |
| --- | --- | --- |
| `/dashboard/admin` | `AdminHome` | Özet sayfa |
| `/dashboard/admin/user-integrations` | `UserIntegrationsAdmin` | `user_integrations` |
| `/dashboard/admin/subscription-settings` | `SubscriptionSettingsAdmin` | `subscription_settings` |
| `/dashboard/admin/subscription-yekdem` | `SubscriptionYekdemAdmin` | `subscription_yekdem` |
| `/dashboard/admin/distribution-tariff` | `DistributionTariffAdmin` | `distribution_tariff_official` |
| `/dashboard/admin/posts` | `PostsAdmin` | `posts` |
| `/dashboard/admin/owner-subscriptions` | `OwnerSubscriptionsAdmin` | `owner_subscriptions` |
| `/dashboard/admin/notification-channels` | `NotificationChannelsAdmin` | `notification_channels` |
| `/dashboard/admin/user-phone-numbers` | `UserPhoneNumbersAdmin` | `user_phone_numbers` |
| `/dashboard/admin/sms-logs` | `SmsLogsAdmin` | `sms_logs` |
| `/dashboard/admin/reactive-alerts` | `ReactiveAlertsAdmin` | `reactive_alert_state` |
| `/dashboard/admin/notification-events` | `NotificationEventsAdmin` | `notification_events` |
| `/dashboard/admin/epias-ptf` | `EpiasPtfAdmin` | `epias_ptf_hourly` |
| `/dashboard/admin/veri-sagligi` | `DataHealthAdmin` | `get_consumption_health()` RPC + `data_health_providers` |
| `/dashboard/admin/invoice-snapshots` | `InvoiceSnapshotsAdmin` | `invoice_snapshots` |
| `/dashboard/admin/monthly-overview` | `MonthlyOverviewAdmin` | `monthly_overview` |
| `/dashboard/admin/contact-messages` | `ContactMessagesAdmin` | `contact_messages` |
| `/dashboard/admin/user-emails` | `UserEmailsAdmin` | `user_emails` |
| `/dashboard/admin/email-logs` | `EmailLogsAdmin` | `email_logs` |
| `/dashboard/admin/ges-providers` | `GesProvidersAdmin` | `ges_providers` |
| `/dashboard/admin/ges-credentials` | `GesCredentialsAdmin` | `ges_credentials` |
| `/dashboard/admin/ges-plants` | `GesPlantsAdmin` | `ges_plants` |
| `/dashboard/admin/ges-production` | `GesProductionAdmin` | `ges_production_daily` |
| `/dashboard/admin/ges-production-upload` | `GesProductionUploadAdmin` | `ges_production_daily` (toplu yükleme) |
| `/dashboard/admin/ges-sync-logs` | `GesSyncLogAdmin` | `ges_sync_log` |
| `/dashboard/admin/ges-satis-hakki` | `GesSatisHakkiAdmin` | `ges_satis_hakki` (legacy) |
| `/dashboard/admin/talep-birlestirme` | `TalepBirlestirmeAdmin` | `ges_mahsup_assignments` + öncelik RPC'leri |
| `/dashboard/admin/kullanıcılar` | `AdminUsersPage` | `auth.users` üzerinde admin RPC görünümü |
| `/dashboard/admin/tanimlama` | `IntakeFormsAdmin` | `intake_forms` (Realtime INSERT abonesi) |

Header `App.tsx:79` içinde `/basvuru` hariç tüm sayfalarda render edilir. Footer `App.tsx:146` içinde `/dashboard/*`, `/upload/*` ve `/basvuru` hariç sayfalarda render edilir.

## 4. State Management Yaklaşımı

Uygulamada Redux/Zustand gibi merkezi bir store **yoktur**. Durum yönetimi sayfa bazında yerel hook'lar ve Supabase canlı sorgular ile yapılır:

- `useState` + `useEffect` çiftleri sayfanın canlı verisini tutar.
- Auth durumu için `useSession` hook'u (`onAuthStateChange` aboneliği ile) kullanılır.
- Yönetici yetkisi için `useIsAdmin` hook'u (`session.user.app_metadata.is_admin` flag'i) kullanılır.
- Seçili tesis numarası `localStorage["eco_selected_sub"]` üzerinden persist edilir; `subscriptionVisibility.resolveSelectedSub()` görünür olmayan tesise düşer.
- Reaktif görünüm modu (toggle/pill) `localStorage["eco_reactive_display_mode"]` anahtarıyla saklanır.

`useSession` (`src/hooks/useSession.ts`):

```typescript
export function useSession() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setSession(data.session ?? null);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      if (!mounted) return;
      setSession(s ?? null);
    });
    return () => { mounted = false; sub.subscription.unsubscribe(); };
  }, []);

  return { session, loading };
}
```

`useIsAdmin` (`src/hooks/useIsAdmin.ts`):

```typescript
export function useIsAdmin() {
  const { session, loading } = useSession();
  const isAdmin = !!session?.user?.app_metadata?.is_admin;
  return { isAdmin, loading };
}
```

## 5. Hesaplama Modülleri

`src/components/utils/` altındaki dosyalar saf TypeScript fonksiyonları içerir; React'tan bağımsızdır ve `Dashboard.tsx`, `InvoiceDetail.tsx`, `YekdemMahsupDetail.tsx`, `ProfilePage.tsx` gibi tüketicilerden çağrılır.

| Dosya | Ana export'lar | Rol |
| --- | --- | --- |
| `calculateInvoice.ts` | `calculateInvoice(input)`, `calculateYekdemMahsup(input)`, `InvoiceBreakdown`, `TariffType` tip tanımları | Geçen ay (M-1) için kapanmış fatura kalemleri ve YEKDEM mahsup tutarı |
| `calculateInvoiceToDate.ts` | `computeMonthInvoiceToDate(...)` | Cari ay için günü gününe canlı fatura tahmini |
| `invoiceSnapshots.ts` | `upsertInvoiceSnapshot(row)`, `getInvoiceSnapshot(...)`, `listInvoiceSnapshots(...)`, `recomputeSnapshotTotalWithMahsup(row)`, `INVOICE_SNAPSHOT_RECOMPUTE_FIELDS` | `invoice_snapshots` tablosuna yaz/oku ve eski snapshot'ları yeni formülle yeniden hesapla |
| `invoiceHistory.ts` | `saveInvoiceToHistory(...)` | Bir snapshot'ı tarih damgası ile arşivle |
| `xlsx.ts` | `exportToXlsx(...)` (genel) | Excel sheet üretimi (`xlsx` paketi) |
| `exportConsumptionXlsx.ts` | `exportConsumptionXlsx(uid, sub, range)` | Saatlik tüketimi Excel'e aktarır; `paginatedFetch.fetchAllConsumption` üzerinden veri çeker |
| `calculateGesOlmasaydi.ts` | `calculateGesOlmasaydi(...)`, `GesOlmasaydiResult` | "GES olmasaydı" karşı-olgu hesabı — 4 kartlı sonuç (Mevcut Fatura / Satılan Enerji / GES Olmasaydı Faturanız / GES Tasarrufu) ve 4 hesap dalı (alıcı, lisanslı satış, arazi GES, öz tüketim) |
| `gesAllocation.ts` | `fetchGesMahsupContext(...)`, `computeGesAllocation(...)`, `getFacilityAllocation(...)`, `applyAllocationToHourlyRows(...)` | Talep birleştirme: kaynak GES verişinin tesislere tahsisi (DB/cache/fetch katmanı); 5 dk TTL cache (anahtar mod dahil). Dağıtım matematiği `gesAllocationModes.ts`'e devredilir |
| `gesAllocationModes.ts` | `allocateByMode(...)`, `allocateSirali/SaatlikOransal/ToplamOransal(...)`, `distributeCapped(...)`, `hourlyCapacity(...)`, `coerceTahsisModu(...)`, `TAHSIS_MODU_LABEL` | Üç dağıtım modunun SAF matematiği (`ges_plants.tahsis_modu`): `sirali` (öncelik şelalesi, varsayılan), `saatlik_oransal` (Meram), `toplam_oransal` (Kayseri). **SIFIR IMPORT** — `scripts/check-ges-allocation-modes.ts` tsx altında relative path'ten yükler. `own_gn` kuralı tek noktada (`hourlyCapacity`, `TB-KARAR: alici-kendi-ges`) |
| `yearlySatisHakki.ts` | `calcYearlySatisHakkiUsage(...)` | Takvim yılı satış hakkı kullanımı: `Σ_ay max(0, ayVeriş − ayÇekiş)` (yalnız devlete satılan fazla sayılır) |
| `parseManualConsumptionXlsx.ts` | `parseManualConsumptionXlsx(file)` | Manuel tüketim Excel'ini parse eder (SheetJS): TR ondalık ("1.234,56"), Europe/Istanbul TZ, Excel serial tarih, dosya-içi dedupe |

`InvoiceBreakdown` döndürdüğü alanlar: `energyCharge`, `trafoCharge`, `distributionCharge`, `distributionBaseKwh`, `distributionAdjustment`, `distributionChargeKwh`, `verisKwh`, `effectiveDistributionUnitPrice`, `netEnergyKwh`, `netEnergyCharge`, `btvCharge`, `powerBaseCharge`, `powerExcessCharge`, `powerTotalCharge`, `reactivePenaltyCharge`, `verisMahsupKwh`, `verisFazlaKwh`, `verisMahsupBedeli`, `verisFazlaBedeli`, `verisSatisBedeli`, `subtotalBeforeVat`, `vatCharge`, `totalInvoice` (`calculateInvoice.ts:64-96`). Detaylı formüller için bkz. [porteco-05-fatura-sayfasi.md](./porteco-05-fatura-sayfasi.md).

## 6. Lib / Yardımcılar

`src/lib/` altındaki dosyalar Supabase istemcisini kuran ya da DB ile basit etkileşimi olan saf yardımcılardır.

| Dosya | Export | Açıklama |
| --- | --- | --- |
| `supabase.ts` | `supabase` (singleton client) | `createClient(VITE_SUPABASE_URL, VITE_SUPABASE_ANON, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } })`. Env eksikse `Error` fırlatır. |
| `dayjs.ts` | `dayjsTR(input?)`, `TR_TZ = "Europe/Istanbul"` | Day.js varsayılanını UTC + timezone plugin'leriyle genişletir; tüm saat hesapları İstanbul saatine göre yapılır. |
| `paginatedFetch.ts` | `fetchAllConsumption(...)`, `fetchAllConsumptionAdmin(...)`, `fetchAllPtf(...)` | PostgREST'in 1000 satır `max_rows` limitini aşan sorguları `.range()` döngüsüyle parçalar. Sayfa boyutu sabiti `PAGE = 1000`. |
| `subscriptionVisibility.ts` | `fetchHiddenSernos(uid)`, `setSubscriptionHidden(uid, serno, isHidden)`, `resolveSelectedSub(visibleSernos, currentSelected)`. Sabit: `LS_SUB_KEY = "eco_selected_sub"` | Profil sayfasından gizlenebilen tesisleri yönetir; gizli tesis seçili kalmışsa ilk görünür tesise düşer. Update-then-insert deseni kullanır. |
| `btvToggle.ts` | `setBtvEnabled(uid, serno, btvEnabled)` | `owner_subscriptions.btv_enabled` kolonunu update-then-insert deseniyle yazar. |
| `formatNumber.ts` | Sayı biçimleme yardımcıları | TR yerel ayarına göre kuruş, kWh, TL biçimleri. |
| `scroll.ts` | Sayfa kaydırma yardımcıları | Smooth scroll. |
| `utils.ts` | `cn(...inputs)` | Falsy değerleri filtreleyen `className` birleştirici. |
| `dataHealth.ts` | `ConsumptionHealthRow`, `HealthStatus`, `computeStatus(...)`, `effectiveThresholds(...)`, `STATUS_META` | Veri sağlığı modülünün tipleri ve 5 durumlu (healthy/warning/problem/critical/nodata) sınıflandırması; kritik eşik = uyarı eşiği × 3. |
| `ges/detectVerisPresence.ts` | `detectVerisPresence(...)` | GES görünürlüğünü iki sinyalle tespit eder: aktif `ges_plants` kaydı (`hasGesApi`) ve veriş izi (`invoice_snapshots.veris_kwh > 0`, fallback `consumption_hourly.gn > 0`). |
| `ges/gesUretimSatisi.ts` | `calculateGesUretimSatisi(...)`, `VERIS_USD_BIRIM_FIYAT` | Veriş fazlası satış bedelinin tek kaynak hesabı: USD modu (`0.133 × usd_kur`) veya perakende TL fallback; dağıtım kesintisi `lisansli_satis`'a göre `dagitim_uretici_1/2`. |
| `ges/gesSatisDagitimRate.ts` | `resolveGesSatisDagitimRate(...)` | Snapshot'a donmuş `ges_satis_dagitim_bedeli` oranını, yoksa canlı tarifeden `dagitim_uretici_1/2` fallback'ini döner. |
| `ges/manualPlants.ts` | `resolveManualPlantIds(...)` | `ges_providers.name = 'manual'` zinciriyle kullanıcının manuel (API'siz) plant id kümesini çözer. |

## 7. Auth Akışı

1. Login sayfasında kullanıcı `supabase.auth.signInWithPassword({ email, password })` ile JWT alır.
2. Token `localStorage` üzerinde Supabase istemcisi tarafından saklanır (`persistSession: true`).
3. `useSession` hook'u `getSession()` ile mevcut oturumu yükler ve `onAuthStateChange` ile değişiklikleri dinler.
4. `<ProtectedRoute>` (`src/components/auth/ProtectedRoute.tsx`):
   - `loading` ise "Kontrol ediliyor…" göster.
   - `session` yoksa `<Navigate to="/login">` ile yönlendir, gelen yolu `state.from` olarak sakla.
   - Aksi halde `<Outlet />` veya `children` render eder.
5. `<AdminRoute>` (`src/components/auth/AdminRoute.tsx`):
   - `useIsAdmin()` `loading` ise "Yetki kontrol ediliyor…" göster.
   - `isAdmin` değilse `/dashboard`'a yönlendir.
   - Yetkili ise `<AdminShell />` render eder.
6. Yönetici flag'i JWT içine `app_metadata.is_admin` alanından okunur. Bu alan Supabase Studio veya `supabase.auth.admin.updateUserById` üzerinden set edilir; istemciden değiştirilemez.

## 8. Ortam Değişkenleri (.env)

İstemci tarafı (Vite, `VITE_` ön ekiyle build'e gömülür):

| Anahtar | Kullanım |
| --- | --- |
| `VITE_SUPABASE_URL` | `src/lib/supabase.ts` — Supabase proje URL'i |
| `VITE_SUPABASE_ANON` | `src/lib/supabase.ts` — Anon (public) key |

Sunucu/cron tarafı (`scripts/reactive-alerts.ts` ve Edge Function ortamı):

| Anahtar | Kullanım |
| --- | --- |
| `SB_URL` veya `SUPABASE_URL` | Service-role bağlantısı |
| `SB_SERVICE_ROLE_KEY` veya `SUPABASE_SERVICE_ROLE_KEY` | RLS bypass için service-role key |
| `CRON_TOKEN` | `reactive-alerts` Edge Function'ı için `x-cron-token` header doğrulama |
| `RESEND_API_KEY` | E-posta gönderimi (Resend) |
| `RESEND_FROM` | Gönderici adresi (örn. `Eco Enerji <info@…>`) |
| `SMS_PROVIDER` | Şu an `iletimerkezi` |
| `SMS_SENDER` | İleti Merkezi başlık (sender) |
| `ILETIMERKEZI_KEY` | İleti Merkezi API kullanıcı adı |
| `ILETIMERKEZI_HASH` | İleti Merkezi API şifre/hash'i |
| `CONTACT_NOTIFY_PHONE` | İletişim formu uyarısı için sabit numara |

> Hiçbir gerçek anahtar bu dokümana yazılmaz. `.env` dosyası `.gitignore`'da yer alır.

## 9. Tailwind Marka Renkleri

`tailwind.config.cjs` dosyasındaki `extend.colors` bloğundan birebir alınmıştır.

| Rol | Anahtar | Hex | Notlar |
| --- | --- | --- | --- |
| Ana mavi | `brand.blue` | `#00AEEF` | Birincil aksiyon, link |
| Hover mavi | `brand.blueLight` | `#40CFFF` | Hover ve aktif durum |
| Koyu mavi | `brand.blueDark` | `#005B96` | Başlık ve koyu vurgu |
| Koyu metin | `brand.dark` | `#0F1C2E` | Footer arka plan, koyu metin |
| Koyu arka plan | `neutral.dark` | `#0F1C2E` | `brand.dark` ile aynı |
| İkincil metin | `neutral.gray` | `#7A8C99` | Alt başlık, açıklama |
| Beyaz | `neutral.white` | `#FFFFFF` | Kart arka planı |
| Açık mavi | `neutral.lightBlue` | `#E6F8FD` | Secondary hover bg |

Tipografi: `Inter` ailesi (`fontFamily.sans = ["Inter", "ui-sans-serif", "system-ui"]`). Border radius varsayılanı `8px`.

`index.html` içinde Inter (400, 500, 600, 700) Google Fonts'tan yüklenir; sayfa dili `lang="tr"`.

## 10. Veri Erişim Deseni

Uygulamanın tamamı tek bir Supabase istemcisi üzerinden çalışır. Tipik bir okuma akışı:

```typescript
const { data, error } = await supabase
  .from("subscription_settings")
  .select("kbk, terim, gerilim, tarife")
  .eq("user_id", uid)
  .eq("subscription_serno", serno)
  .maybeSingle();
```

Büyük tablolardan (saatlik tüketim) okurken `paginatedFetch` yardımcıları kullanılır. Yazma operasyonları için `subscriptionVisibility.setSubscriptionHidden` ve `btvToggle.setBtvEnabled` örneklerinde olduğu gibi **update-then-insert** deseni tercih edilir; mevcut satır yoksa yeni satır basılır.

RPC çağrıları:

| RPC | Çağıran |
| --- | --- |
| `monthly_ptf_prev_sub(p_tz, p_subscription_serno)` | `Dashboard.tsx`, `InvoiceDetail.tsx` |
| `monthly_dashboard_series(...)` | `ChartsPage.tsx`, `reports/fetchConsumptionVsProduction.ts`, `reports/fetchMahsupPerformance.ts`, `reports/fetchPtfAnalysis.ts` |
| `reactive_mtd_totals(p_user_id)` | `supabase/functions/reactive-alerts/index.ts` |
| `set_ges_mahsup_priorities(p_ges_plant_id, p_sernos)` | `TalepBirlestirmeAdmin.tsx` (öncelik reorder) |
| `remove_ges_mahsup_assignment(p_id)` | `TalepBirlestirmeAdmin.tsx` (atomik sil + yeniden numaralandır) |
| `get_consumption_health()` | `DataHealthAdmin.tsx` |

Edge Function çağrıları (frontend'den):

| Fonksiyon | Çağıran |
| --- | --- |
| `contact-notify` | `ContactPage.tsx` formu doldurulduğunda Supabase webhook tetikler |
| `intake-notify` | `intake_forms` INSERT'i sonrası başvuru bildirimini ekibe e-postalar |
| `reactive-alerts` | Doğrudan tarayıcıdan çağrılmaz; cron / GitHub Actions üzerinden |

Detaylı sorgu envanteri için bkz. [porteco-07-supabase-queries.md](./porteco-07-supabase-queries.md).

## 11. Build ve Çalıştırma

`package.json` script'leri:

| Komut | Etki |
| --- | --- |
| `npm run dev` | Vite dev server (`http://localhost:5173`) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run build` | Production bundle (`dist/`) |
| `npm run lint` | ESLint tüm projede |
| `npm run preview` | Build çıktısını yerelde sun |
| `npm run cron:alerts` | `tsx scripts/reactive-alerts.ts` — reaktif uyarı betiğini çalıştır |
| `npm run test:sms` | `tsx scripts/test-sms.ts` — İleti Merkezi entegrasyon testi |

CI/CD: PortEco Web reposunda `.github/workflows/` altında etkin bir workflow **bulunmamaktadır** (sync repo'sunun aksine). Reaktif uyarılar production'da Supabase scheduled function veya harici cron tarafından tetiklenir; lokal test için `npm run cron:alerts` kullanılır.

## 12. Önemli Sabitler

| Sabit | Değer | Tanım yeri |
| --- | --- | --- |
| `REACTIVE_LIMIT_RI` | `20` (%) | `src/components/dashboard/ReactiveSection.tsx` |
| `REACTIVE_LIMIT_RC` | `15` (%) | `src/components/dashboard/ReactiveSection.tsx` |
| Reaktif uyarı eşiği RI | `18` (%) — uyarı | `supabase/functions/reactive-alerts/index.ts` |
| Reaktif uyarı eşiği RI | `20` (%) — limit | aynı dosya |
| Reaktif uyarı eşiği RC | `13` (%) — uyarı | aynı dosya |
| Reaktif uyarı eşiği RC | `15` (%) — limit | aynı dosya |
| `PAGE` | `1000` | `src/lib/paginatedFetch.ts` |
| `LS_SUB_KEY` | `"eco_selected_sub"` | `src/lib/subscriptionVisibility.ts` |
| `TR_TZ` | `"Europe/Istanbul"` | `src/lib/dayjs.ts` |
| `VERIS_USD_BIRIM_FIYAT` | `0.133` (USD/kWh) | `src/lib/ges/gesUretimSatisi.ts:23` (kopyası `calculateInvoice.ts:62`) |
| `CACHE_TTL_MS` | `5 × 60 × 1000` (5 dk) | `src/components/utils/gesAllocation.ts:143` — tahsis cache ömrü |

## 13. Migration Sırası

`supabase/migrations/` altındaki 50 dosya kronolojik sırayla (1–30 önceki dokümantasyon turunda mevcuttu, 31–42 sonrasında commit'lendi, 43–50 henüz commit edilmemiş çalışma ağacı dosyaları):

1. `20260203_001_create_user_phone_numbers.sql`
2. `20260203_002_create_sms_logs.sql`
3. `20260203_003_migrate_notification_channels.sql`
4. `20260205_001_create_contact_messages.sql`
5. `20260205_002_create_reactive_alert_state.sql`
6. `20260205_003_create_reactive_mtd_totals.sql`
7. `20260211_001_create_user_emails.sql`
8. `20260211_002_create_email_logs.sql`
9. `20260216_001_add_is_hidden_to_subscription_settings.sql`
10. `20260216_002_move_btv_enabled_to_owner_subscriptions.sql`
11. `20260216_003_add_meter_serial_to_subscription_settings.sql`
12. `20260221_001_create_ges_providers.sql`
13. `20260221_002_create_ges_credentials.sql`
14. `20260221_003_create_ges_plants.sql`
15. `20260221_004_create_ges_production_daily.sql`
16. `20260221_005_create_ges_snapshot.sql`
17. `20260221_006_create_ges_sync_log.sql`
18. `20260221_007_ges_rls_policies.sql`
19. `20260221_008_create_ges_production_hourly.sql`
20. `20260326_001_alter_reactive_mtd_totals.sql`
21. `20260326_002_alter_reactive_alert_state_kind.sql`
22. `20260326_003_create_ges_satis_hakki.sql`
23. `20260326_004_ges_satis_hakki_admin_policies.sql`
24. `20260403_001_add_distribution_adjustment_to_snapshots.sql`
25. `20260403_002_create_intake_forms.sql`
26. `20260408_001_add_veris_and_effective_dist_to_snapshots.sql`
27. `20260410_001_add_perakende_to_tariff.sql`
28. `20260410_002_add_on_yil_to_settings.sql`
29. `20260410_003_add_veris_satis_to_snapshots.sql`
30. `20260417_001_rate_limit_public_forms.sql`
31. `20260503_001_add_satis_hakki_to_settings.sql`
32. `20260503_002_add_message_type_to_email_logs.sql`
33. `20260504_001_add_usd_kur_to_yekdem.sql`
34. `20260504_002_add_usd_kur_to_snapshots.sql`
35. `20260522_001_add_lisansli_satis_to_settings.sql`
36. `20260522_002_add_lisansli_satis_to_snapshots.sql`
37. `20260531_001_add_ges_to_intake_forms.sql`
38. `20260531_002_email_logs_user_id_nullable.sql`
39. `20260602_001_fix_monthly_dashboard_series_month_boundary.sql`
40. `20260602_002_backfill_invoice_snapshots_recompute.sql`
41. `20260603_001_add_unit_price_adjustment.sql`
42. `20260603_002_add_ges_satis_dagitim_bedeli.sql`
43. `20260617_001_create_data_health_config.sql`
44. `20260617_002_get_consumption_health.sql`
45. `20260617_003_add_hourly_net_to_snapshots.sql`
46. `20260705_001_create_ges_mahsup_assignments.sql`
47. `20260705_002_add_allocated_ges_kwh_to_snapshots.sql`
48. `20260705_003_harden_ges_mahsup_functions.sql`
49. `20260706_001_atomic_remove_ges_mahsup_assignment.sql`
50. `20260710_001_add_anlik_uretim_kullanimi.sql`

… (20260711–20260824 arası migration'lar listeye işlenmemiştir; kanonik liste `supabase/migrations/` dizinidir)

51. `20260927_001_add_tahsis_modu_to_ges_plants.sql` — `ges_plants.tahsis_modu text not null default 'sirali'` + CHECK (`sirali` | `saatlik_oransal` | `toplam_oransal`); talep birleştirme dağıtım modu

`btv_enabled` alanı 2026-02-16'da `subscription_settings` tablosundan `owner_subscriptions` tablosuna taşınmıştır; bu nedenle `btvToggle.ts` `owner_subscriptions` tablosunu hedef alır. `is_hidden` alanı aynı tarihte `subscription_settings`'a eklenmiştir.

2026-04 ayında fatura snapshot'ları için `distribution_adjustment`, `veris_kwh`, `effective_distribution_unit_price`, `veris_mahsup_kwh`, `veris_fazla_kwh`, `veris_satis_bedeli` alanları eklenmiştir. 2026-05..07 döneminde snapshot'lara ayrıca `usd_kur`, `lisansli_satis`, `unit_price_adjustment`, `ges_satis_dagitim_bedeli`, `net_positive_draw_kwh`, `net_excess_feed_kwh`, `allocated_ges_kwh` kolonları eklendi. Eski snapshot'lar `recomputeSnapshotTotalWithMahsup()` ile okunurken yeniden hesaplanır; `20260602_002` migration'ı eski `billed` satırları bir kerelik güncel formülle backfill etmiştir.

**Repoda migration'ı olmayan canlı DB nesneleri:** kod şu kolon/tabloları kullanır ama `supabase/migrations/` altında tanımları yoktur (canlı DB'de manuel oluşturulmuştur): `ges_plants.source_serno` (`gesAllocation.ts`, `fetchGesMahsupContext` içindeki `ges_plants` select'i — `tahsis_modu`'nun migration'ı vardır, `source_serno`'nun yoktur), `owner_subscriptions.data_source` ve `manual_data_logs` tablosu (`manualUpload/ManualUploadPanel.tsx`), manuel yükleme için `consumption_hourly` yazma RLS politikaları.

## 14. Edge Functions

| Fonksiyon | Tetikleyici | Görev |
| --- | --- | --- |
| `reactive-alerts` | Cron / `npm run cron:alerts` | Aylık reaktif yüzdeleri hesaplar, eşik aşan kullanıcılara SMS + e-posta gönderir, `reactive_alert_state` durumunu günceller. |
| `contact-notify` | `contact_messages` INSERT webhook'u | Form gönderildiğinde sabit numaraya SMS atar. |
| `intake-notify` | `intake_forms` INSERT'i | Başvuru bildirimini Resend ile ekibe e-postalar (tüketim + GES sağlayıcı bloğu dahil); `email_logs`'a `message_type='intake_form_notify'`, `user_id=null` ile log yazar. |

Detay için bkz. [porteco-04-reaktif-islemler.md](./porteco-04-reaktif-islemler.md) ve [PROJECT_OVERVIEW.md](./PROJECT_OVERVIEW.md).

## 15. Kaldırılan / Değişen Yapılar

- **`subscription_settings.btv_enabled`** kolonu kaldırılmış, yerini `owner_subscriptions.btv_enabled` almıştır (`20260216_002_move_btv_enabled_to_owner_subscriptions.sql`). Yeni okumalar ve yazımlar `btvToggle.ts` üzerinden `owner_subscriptions` tablosunu kullanır.
- **`notification_channels`** tablosu legacy konumda kalmıştır; aktif bildirim hedeflerinin yerine `user_phone_numbers` (2026-02-03) ve `user_emails` (2026-02-11) tabloları geçmiştir. Admin sayfası (`NotificationChannelsAdmin`) hâlâ erişilebilir ama veri girişi yeni iki tabloya yönlendirilir.
- **Eski fatura snapshot şeması**: 2026-04 ayından önce yazılmış `invoice_snapshots` satırları `distribution_adjustment`, `veris_kwh`, `effective_distribution_unit_price`, `veris_mahsup_kwh`, `veris_fazla_kwh`, `veris_satis_bedeli` alanlarını içermez. `invoiceSnapshots.recomputeSnapshotTotalWithMahsup()` bu satırları okurken yeniden hesaplar; admin tarafında "yeniden hesapla" butonu vardır.
- **README.md** repo kökünde merge çakışması içerdiğinden devre dışı kabul edilir; mimari özet için artık bu doküman ve [PROJECT_OVERVIEW.md](./PROJECT_OVERVIEW.md) kullanılır.
- **Mobile dokümantasyonu** (`DASHBOARD_MOBILE_SPEC.md`, `PortEco_Mobile_App_RoadMap.md`) bu PortEco Web reposunun kapsamı dışındadır; ayrı `porteco-mobile` reposundadır ve bu turda yenilenmemiştir.
- **`ges_satis_hakki` tablosu legacy konumdadır** (2026-05-03, `20260503_001`): yıllık satış hakkı limiti `subscription_settings.satis_hakki` kolonuna taşındı; eski `ges_satis_hakki.max_satis_kwh` verisi idempotent kopyalandı, tablo ve `GesSatisHakkiAdmin` sayfası erişilebilir kaldı ama fatura/kota hesapları artık bu tabloyu sorgulamaz.
- **"30 migration dosyası" bilgisi eskidi**: klasörde artık 50 dosya vardır (bkz. §13).
- **`supabase/functions/` 2 fonksiyondu**: 2026-05-31'de üçüncü fonksiyon `intake-notify` eklendi.
- **`components/utils` yalnızca fatura/YEKDEM hesabı içeriyordu**: 2026-05 sonrası `gesAllocation.ts` (talep birleştirme), `yearlySatisHakki.ts` (yıllık kota) ve `parseManualConsumptionXlsx.ts` (manuel yükleme parse) eklendi.

---

## Son Güncelleme

- **Tarih:** 2026-07-12
- **Branch:** main
- **Son commit:** `500506c` — commit (çalışma ağacındaki commit edilmemiş değişiklikler dahil belgelendi)
- **Kapsanan dosyalar:** `package.json`, `tailwind.config.cjs`, `src/App.tsx`, `src/main.tsx`, `src/lib/supabase.ts`, `src/lib/dayjs.ts`, `src/lib/paginatedFetch.ts`, `src/lib/subscriptionVisibility.ts`, `src/lib/btvToggle.ts`, `src/lib/utils.ts`, `src/lib/dataHealth.ts`, `src/lib/ges/detectVerisPresence.ts`, `src/lib/ges/gesUretimSatisi.ts`, `src/lib/ges/gesSatisDagitimRate.ts`, `src/lib/ges/manualPlants.ts`, `src/hooks/useSession.ts`, `src/hooks/useIsAdmin.ts`, `src/components/auth/ProtectedRoute.tsx`, `src/components/auth/AdminRoute.tsx`, `src/components/utils/gesAllocation.ts`, `src/components/utils/yearlySatisHakki.ts`, `src/components/utils/parseManualConsumptionXlsx.ts`, `supabase/migrations/*.sql`, `supabase/functions/reactive-alerts/index.ts`, `supabase/functions/contact-notify/index.ts`, `supabase/functions/intake-notify/index.ts`, `scripts/*.ts`, `scripts/lib/reactive-email-template.ts`
