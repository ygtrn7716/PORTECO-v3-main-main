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
| Excel | `xlsx` | `^0.18.5` | Excel export |
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
│   ├── dayjs.ts
│   ├── formatNumber.ts
│   ├── paginatedFetch.ts
│   ├── scroll.ts
│   ├── subscriptionVisibility.ts
│   ├── supabase.ts
│   ├── utils.ts
│   └── ges/
│       └── detectVerisPresence.ts
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
│   └── admin/                    # Admin sayfaları (28 dosya)
└── components/
    ├── admin/                    # AdminShell, AdminSidebar, TableManager
    ├── auth/                     # ProtectedRoute, AdminRoute
    ├── blog/                     # BlogSidebar, BlogCtaCard, TableOfContents
    ├── dashboard/                # Dashboard alt sayfaları + ortak parçalar
    │   ├── invoiceDetail/        # AlternateTariffInvoiceSection
    │   └── shared/               # ConnectGesOverlay, EnergySoldCard
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
│   └── reactive-alerts/index.ts  # Reaktif uyarı motoru
└── migrations/                   # 30 SQL göç dosyası (2026-02-03 → 2026-04-17)
```

`scripts/` ağacı (cron ve test):

```
scripts/
├── reactive-alerts.ts            # GitHub Actions / cron giriş noktası
├── test-email.ts                 # Resend ile e-posta testi
└── test-sms.ts                   # İleti Merkezi ile SMS testi
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
| `/dashboard/admin/ges-satis-hakki` | `GesSatisHakkiAdmin` | `ges_satis_hakki` |
| `/dashboard/admin/kullanıcılar` | `AdminUsersPage` | `auth.users` üzerinde admin RPC görünümü |
| `/dashboard/admin/tanimlama` | `IntakeFormsAdmin` | `intake_forms` (Realtime INSERT abonesi) |

Header `App.tsx:77` içinde `/basvuru` hariç tüm sayfalarda render edilir. Footer `App.tsx:142` içinde `/dashboard/*`, `/upload/*` ve `/basvuru` hariç sayfalarda render edilir.

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
| `calculateGesOlmasaydi.ts` | `calculateGesOlmasaydi(...)` | "GES olmasaydı" karşı-olgu hesabı (GES üretimi şebekeden satın alınmış olsaydı maliyet ne olurdu) |

`InvoiceBreakdown` döndürdüğü alanlar: `energyCharge`, `trafoCharge`, `distributionCharge`, `distributionBaseKwh`, `distributionAdjustment`, `distributionChargeKwh`, `verisKwh`, `effectiveDistributionUnitPrice`, `netEnergyKwh`, `netEnergyCharge`, `btvCharge`, `powerBaseCharge`, `powerExcessCharge`, `powerTotalCharge`, `reactivePenaltyCharge`, `verisMahsupKwh`, `verisFazlaKwh`, `verisSatisBedeli`, `subtotalBeforeVat`, `vatCharge`, `totalInvoice`. Detaylı formüller için bkz. [porteco-05-fatura-sayfasi.md](./porteco-05-fatura-sayfasi.md).

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
| `ges/detectVerisPresence.ts` | `detectVerisPresence(...)` | `consumption_hourly.gn` (üretim) kolonunda anlamlı veri olup olmadığını tespit eder; "veriş yok" durumuna düşmemek için kullanılır. |

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
| `monthly_dashboard_series(...)` | `ChartsPage.tsx` |
| `reactive_mtd_totals(p_user_id)` | `supabase/functions/reactive-alerts/index.ts` |

Edge Function çağrıları (frontend'den):

| Fonksiyon | Çağıran |
| --- | --- |
| `contact-notify` | `ContactPage.tsx` formu doldurulduğunda Supabase webhook tetikler |
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

## 13. Migration Sırası

`supabase/migrations/` altındaki 30 dosya kronolojik sırayla:

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

`btv_enabled` alanı 2026-02-16'da `subscription_settings` tablosundan `owner_subscriptions` tablosuna taşınmıştır; bu nedenle `btvToggle.ts` `owner_subscriptions` tablosunu hedef alır. `is_hidden` alanı aynı tarihte `subscription_settings`'a eklenmiştir.

2026-04 ayında fatura snapshot'ları için `distribution_adjustment`, `veris_kwh`, `effective_distribution_unit_price`, `veris_mahsup_kwh`, `veris_fazla_kwh`, `veris_satis_bedeli` alanları eklenmiştir; bu tarihten önce yazılmış snapshot'lar `recomputeSnapshotTotalWithMahsup()` ile yeniden hesaplanır.

## 14. Edge Functions

| Fonksiyon | Tetikleyici | Görev |
| --- | --- | --- |
| `reactive-alerts` | Cron / `npm run cron:alerts` | Aylık reaktif yüzdeleri hesaplar, eşik aşan kullanıcılara SMS + e-posta gönderir, `reactive_alert_state` durumunu günceller. |
| `contact-notify` | `contact_messages` INSERT webhook'u | Form gönderildiğinde sabit numaraya SMS atar. |

Detay için bkz. [porteco-04-reaktif-islemler.md](./porteco-04-reaktif-islemler.md) ve [PROJECT_OVERVIEW.md](./PROJECT_OVERVIEW.md).

## 15. Kaldırılan / Değişen Yapılar

- **`subscription_settings.btv_enabled`** kolonu kaldırılmış, yerini `owner_subscriptions.btv_enabled` almıştır (`20260216_002_move_btv_enabled_to_owner_subscriptions.sql`). Yeni okumalar ve yazımlar `btvToggle.ts` üzerinden `owner_subscriptions` tablosunu kullanır.
- **`notification_channels`** tablosu legacy konumda kalmıştır; aktif bildirim hedeflerinin yerine `user_phone_numbers` (2026-02-03) ve `user_emails` (2026-02-11) tabloları geçmiştir. Admin sayfası (`NotificationChannelsAdmin`) hâlâ erişilebilir ama veri girişi yeni iki tabloya yönlendirilir.
- **Eski fatura snapshot şeması**: 2026-04 ayından önce yazılmış `invoice_snapshots` satırları `distribution_adjustment`, `veris_kwh`, `effective_distribution_unit_price`, `veris_mahsup_kwh`, `veris_fazla_kwh`, `veris_satis_bedeli` alanlarını içermez. `invoiceSnapshots.recomputeSnapshotTotalWithMahsup()` bu satırları okurken yeniden hesaplar; admin tarafında "yeniden hesapla" butonu vardır.
- **README.md** repo kökünde merge çakışması içerdiğinden devre dışı kabul edilir; mimari özet için artık bu doküman ve [PROJECT_OVERVIEW.md](./PROJECT_OVERVIEW.md) kullanılır.
- **Mobile dokümantasyonu** (`DASHBOARD_MOBILE_SPEC.md`, `PortEco_Mobile_App_RoadMap.md`) bu PortEco Web reposunun kapsamı dışındadır; ayrı `porteco-mobile` reposundadır ve bu turda yenilenmemiştir.

---

## Son Güncelleme

- **Tarih:** 2026-05-03
- **Branch:** main
- **Son commit:** `03aa828` — valla bişeler yaptık da hatırlamıyom amk
- **Kapsanan dosyalar:** `package.json`, `tailwind.config.cjs`, `src/App.tsx`, `src/main.tsx`, `src/lib/supabase.ts`, `src/lib/dayjs.ts`, `src/lib/paginatedFetch.ts`, `src/lib/subscriptionVisibility.ts`, `src/lib/btvToggle.ts`, `src/lib/utils.ts`, `src/hooks/useSession.ts`, `src/hooks/useIsAdmin.ts`, `src/components/auth/ProtectedRoute.tsx`, `src/components/auth/AdminRoute.tsx`, `supabase/migrations/*.sql`, `supabase/functions/reactive-alerts/index.ts`, `supabase/functions/contact-notify/index.ts`, `scripts/*.ts`
