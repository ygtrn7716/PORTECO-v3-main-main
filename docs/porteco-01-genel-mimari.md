# PortEco v3 — Genel Mimari

## 1. Framework ve Teknoloji Stack

| Teknoloji | Versiyon | Amaç |
|-----------|----------|------|
| React | 18.3.1 | UI kütüphanesi |
| Vite | 7.1.0 | Build tool & dev server |
| TypeScript | 5.5.4 | Statik tip sistemi |
| Tailwind CSS | 4.1.11 | Utility-first CSS |
| React Router DOM | 7.8.0 | Client-side routing |
| Supabase JS | 2.57.4 | Backend (auth, DB, realtime) |
| Recharts | 3.6.0 | Grafik/chart |
| Framer Motion | 12.23.12 | Animasyonlar |
| Day.js | 1.11.18 | Tarih işlemleri |
| XLSX | 0.18.5 | Excel export |
| Lucide React | 0.542.0 | İkon kütüphanesi |

**Build zinciri:** Vite + `@vitejs/plugin-react` → PostCSS (Tailwind + Autoprefixer) → ESLint 9.32

---

## 2. Klasör Yapısı

```
src/
├── main.tsx                        # React root, BrowserRouter
├── App.tsx                         # Route tanımları, layout
├── index.css                       # Global stiller
│
├── pages/                          # Sayfa componentleri
│   ├── Home.tsx                    # Landing page
│   ├── Login.tsx                   # Giriş
│   ├── ForgotPassword.tsx          # Şifre sıfırlama
│   ├── Dashboard.tsx               # Ana gösterge paneli
│   ├── ProfilePage.tsx             # Kullanıcı profili
│   ├── InvoiceHistory.tsx          # Geçmiş fatura listesi
│   ├── InvoiceSnapshotDetail.tsx   # Tek fatura snapshot detayı
│   ├── AlertsPage.tsx              # Bildirimler
│   ├── FilesPage.tsx               # Dosya yönetimi
│   ├── BlogPage.tsx                # Blog listesi
│   ├── BlogDetailPage.tsx          # Blog detay
│   ├── ContactPage.tsx             # İletişim formu
│   ├── IntakeFormPage.tsx          # Başvuru formu
│   ├── Features.tsx                # Özellikler
│   └── admin/                      # Admin sayfaları (27+)
│       ├── AdminHome.tsx
│       ├── AdminUsersPage.tsx
│       ├── SubscriptionYekdemAdmin.tsx
│       └── ...
│
├── components/
│   ├── auth/                       # Kimlik doğrulama
│   │   ├── ProtectedRoute.tsx      # Session yoksa → /login
│   │   └── AdminRoute.tsx          # is_admin=false → /dashboard
│   ├── dashboard/                  # Dashboard bileşenleri
│   │   ├── DashboardShell.tsx      # Layout (sidebar + topbar)
│   │   ├── SideBar.tsx
│   │   ├── TopBar.tsx
│   │   ├── ConsumptionDetail.tsx
│   │   ├── YekdemDetail.tsx
│   │   ├── YekdemMahsupDetail.tsx
│   │   ├── InvoiceDetail.tsx
│   │   ├── PtfDetail.tsx
│   │   ├── GesDetail.tsx
│   │   ├── ReactiveSection.tsx
│   │   ├── ChartsPage.tsx
│   │   └── ...
│   ├── admin/                      # Admin bileşenleri
│   │   ├── AdminShell.tsx
│   │   ├── AdminSidebar.tsx
│   │   └── TableManager.tsx        # Genel CRUD tablo yöneticisi
│   ├── layout/                     # Header, Footer, Container
│   ├── sections/                   # Landing page bölümleri
│   ├── forms/                      # LeadForm vb.
│   ├── ui/                         # button, card, input
│   └── utils/                      # Hesaplama ve yardımcı
│       ├── calculateInvoice.ts     # Fatura + mahsup hesabı
│       ├── calculateInvoiceToDate.ts
│       ├── invoiceSnapshots.ts     # Snapshot CRUD
│       ├── invoiceHistory.ts
│       └── xlsx.ts
│
├── hooks/
│   ├── useSession.ts               # Auth session hook
│   └── useIsAdmin.ts               # Admin kontrolü
│
├── lib/
│   ├── supabase.ts                 # Supabase client init
│   ├── paginatedFetch.ts           # Sayfalı veri çekme
│   ├── subscriptionVisibility.ts   # Tesis gizleme/seçme
│   ├── btvToggle.ts                # BTV aç/kapa
│   ├── dayjs.ts                    # Dayjs + TR locale
│   └── utils.ts                    # cn() classnames helper
│
├── content/                        # Statik içerik tanımları
│   ├── dashboardCards.ts           # Kart konfigürasyonları
│   ├── blog.ts
│   ├── faq.ts
│   ├── features.ts
│   └── strings.ts                  # Türkçe UI metinleri
│
└── assets/                         # Görseller, ikonlar

supabase/
├── migrations/                     # 25 migration dosyası
├── functions/                      # Edge functions
└── config.toml

scripts/
├── reactive-alerts.ts              # Cron: reaktif uyarı oluşturma
├── test-sms.ts                     # SMS test
└── test-email.ts                   # E-posta test
```

---

## 3. Routing Yapısı

Router: `src/main.tsx` → `BrowserRouter` → `src/App.tsx` (tüm route'lar)

### Public Route'lar

| URL | Component | Açıklama |
|-----|-----------|----------|
| `/` | `Home` | Landing page |
| `/login` | `Login` | Giriş sayfası |
| `/forgot-password` | `ForgotPassword` | Şifre sıfırlama |
| `/blog` | `BlogPage` | Blog listesi |
| `/blog/:slug` | `BlogDetailPage` | Blog yazısı |
| `/iletisim` | `ContactPage` | İletişim formu |
| `/basvuru` | `IntakeFormPage` | Başvuru formu |

### Protected Route'lar (giriş gerekli — `ProtectedRoute`)

| URL | Component | Açıklama |
|-----|-----------|----------|
| `/dashboard` | `Dashboard` | Ana gösterge paneli |
| `/dashboard/consumption` | `ConsumptionDetail` | Tüketim detayı |
| `/dashboard/yekdem` | `YekdemDetail` | YEKDEM detayı |
| `/dashboard/yekdem-mahsup` | `YekdemMahsupDetail` | YEKDEM mahsup detayı |
| `/dashboard/ptf` | `PtfDetail` | PTF detayı |
| `/dashboard/invoice-detail` | `InvoiceDetail` | Fatura detayı |
| `/dashboard/invoices` | `InvoiceHistory` | Geçmiş faturalar |
| `/dashboard/invoices/:sub/:year/:month` | `InvoiceSnapshotDetail` | Fatura snapshot |
| `/dashboard/charts` | `ChartsPage` | Grafikler |
| `/dashboard/alerts` | `AlertsPage` | Bildirimler |
| `/dashboard/ges` | `GesDetail` | GES üretim detayı |
| `/dashboard/profile` | `ProfilePage` | Profil |
| `/dashboard/files` | `FilesPage` | Dosya yönetimi |

### Admin Route'lar (giriş + `is_admin` gerekli — `AdminRoute`)

| URL | Component | Açıklama |
|-----|-----------|----------|
| `/dashboard/admin` | `AdminHome` | Admin ana sayfa |
| `/dashboard/admin/kullanıcılar` | `AdminUsersPage` | Kullanıcı yönetimi |
| `/dashboard/admin/subscription-yekdem` | `SubscriptionYekdemAdmin` | YEKDEM veri girişi |
| `/dashboard/admin/subscription-settings` | `SubscriptionSettingsAdmin` | Tesis ayarları |
| `/dashboard/admin/distribution-tariff` | `DistributionTariffAdmin` | Dağıtım tarifesi |
| `/dashboard/admin/owner-subscriptions` | `OwnerSubscriptionsAdmin` | Abonelik sahipleri |
| `/dashboard/admin/epias-ptf` | `EpiasPtfAdmin` | EPİAŞ PTF verileri |
| `/dashboard/admin/invoice-snapshots` | `InvoiceSnapshotsAdmin` | Fatura snapshot'ları |
| `/dashboard/admin/monthly-overview` | `MonthlyOverviewAdmin` | Aylık özet |
| `/dashboard/admin/posts` | `PostsAdmin` | Blog yazıları |
| `/dashboard/admin/contact-messages` | `ContactMessagesAdmin` | İletişim mesajları |
| `/dashboard/admin/reactive-alerts` | `ReactiveAlertsAdmin` | Reaktif uyarılar |
| `/dashboard/admin/notification-channels` | `NotificationChannelsAdmin` | Bildirim kanalları |
| `/dashboard/admin/notification-events` | `NotificationEventsAdmin` | Bildirim olayları |
| `/dashboard/admin/user-phone-numbers` | `UserPhoneNumbersAdmin` | Telefon numaraları |
| `/dashboard/admin/user-emails` | `UserEmailsAdmin` | E-posta adresleri |
| `/dashboard/admin/sms-logs` | `SmsLogsAdmin` | SMS logları |
| `/dashboard/admin/email-logs` | `EmailLogsAdmin` | E-posta logları |
| `/dashboard/admin/user-integrations` | `UserIntegrationsAdmin` | Entegrasyonlar |
| `/dashboard/admin/ges-providers` | `GesProvidersAdmin` | GES sağlayıcıları |
| `/dashboard/admin/ges-credentials` | `GesCredentialsAdmin` | GES kimlik bilgileri |
| `/dashboard/admin/ges-plants` | `GesPlantsAdmin` | GES santralleri |
| `/dashboard/admin/ges-production` | `GesProductionAdmin` | GES üretim verileri |
| `/dashboard/admin/ges-sync-logs` | `GesSyncLogAdmin` | GES senkron logları |
| `/dashboard/admin/ges-satis-hakki` | `GesSatisHakkiAdmin` | GES satış hakkı |
| `/dashboard/admin/tanimlama` | `IntakeFormsAdmin` | Başvuru formları |
| `/dashboard/admin/consumption-daily` | `ConsumptionDailyAdmin` | Günlük tüketim |
| `/dashboard/admin/consumption-hourly` | `ConsumptionHourlyAdmin` | Saatlik tüketim |
| `/dashboard/admin/demand-monthly` | `DemandMonthlyAdmin` | Aylık demand |

---

## 4. State Management

**Merkezi store yok.** Uygulama React hooks + Supabase backend modeli kullanıyor.

### Hook'lar

**`useSession`** (`src/hooks/useSession.ts`):
```typescript
// Supabase auth session'ı dinler
const { session, loading } = useSession();
// session: Session | null
// loading: boolean
```
- `supabase.auth.getSession()` ile mevcut session'ı alır
- `supabase.auth.onAuthStateChange()` ile değişiklikleri dinler
- `session` null ise kullanıcı giriş yapmamış

**`useIsAdmin`** (`src/hooks/useIsAdmin.ts`):
```typescript
const isAdmin = !!session?.user?.app_metadata?.is_admin;
```
- JWT'nin `app_metadata.is_admin` alanını kontrol eder
- Boolean döner

### Diğer State Kalıpları
- **localStorage:** Seçili tesis (`eco_selected_sub`), reaktif görünüm modu (`eco_reactive_display_mode`)
- **Component state:** `useState` ile form, loading, error durumları
- **Derived state:** `useMemo` ile hesaplanan değerler

---

## 5. Supabase Client Kurulumu

**Dosya:** `src/lib/supabase.ts`

```typescript
import { createClient } from "@supabase/supabase-js";

const url  = import.meta.env.VITE_SUPABASE_URL as string;
const anon = import.meta.env.VITE_SUPABASE_ANON as string;

export const supabase = createClient(url, anon, {
  auth: {
    persistSession: true,      // localStorage'a kaydet
    autoRefreshToken: true,    // Token otomatik yenile
    detectSessionInUrl: true,  // URL'den auth callback algıla
  },
});
```

---

## 6. Auth Yapısı — Admin vs Normal Kullanıcı

### Giriş Akışı (`src/pages/Login.tsx`)
```typescript
const { data, error } = await supabase.auth.signInWithPassword({ email, password });
// Başarılı → /dashboard'a yönlendir (veya referrer URL)
```

### Route Koruması

**ProtectedRoute** (`src/components/auth/ProtectedRoute.tsx`):
- `session` yoksa → `/login` sayfasına yönlendir (mevcut URL'i referrer olarak sakla)
- `session` varsa → children'ı render et

**AdminRoute** (`src/components/auth/AdminRoute.tsx`):
- `session?.user?.app_metadata?.is_admin !== true` → `/dashboard` sayfasına yönlendir
- Admin ise → children'ı render et

### Kullanıcı Seviyeleri

| Seviye | Erişim | Kontrol |
|--------|--------|---------|
| Anonim | Public route'lar | Session yok |
| Normal Kullanıcı | `/dashboard/*` | Session var |
| Admin | `/dashboard/admin/*` | `app_metadata.is_admin === true` |

---

## 7. Environment Variables

**Client-side** (Vite `VITE_` prefix'i ile tarayıcıya açık):

| Değişken | Amaç |
|----------|------|
| `VITE_SUPABASE_URL` | Supabase proje URL'i |
| `VITE_SUPABASE_ANON` | Supabase anonim (public) anahtar |

**Server-side** (sadece scripts/ içinde kullanılır):

| Değişken | Amaç |
|----------|------|
| `SB_SERVICE_ROLE_KEY` | Supabase service role key (RLS bypass) |
| `SMS_PROVIDER` | SMS sağlayıcı (iletimerkezi) |
| `SMS_SENDER` | SMS gönderici adı |
| `ILETIMERKEZI_KEY` | SMS API anahtarı |
| `ILETIMERKEZI_HASH` | SMS API hash |
| `RESEND_API_KEY` | Resend e-posta API anahtarı |
| `RESEND_FROM` | Varsayılan e-posta gönderici |
