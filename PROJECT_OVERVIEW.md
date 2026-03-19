# PORTECO v3 - Proje Dokumantasyonu

## Icindekiler

1. [Proje Ozeti](#1-proje-ozeti)
2. [Teknoloji Yigini (Tech Stack)](#2-teknoloji-yigini-tech-stack)
3. [Klasor ve Dosya Yapisi](#3-klasor-ve-dosya-yapisi)
4. [Mimari ve Veri Akisi](#4-mimari-ve-veri-akisi)
5. [Temel Moduller ve Fonksiyonlar](#5-temel-moduller-ve-fonksiyonlar)
6. [API Endpoint'leri](#6-api-endpointleri)
7. [Veritabani Yapisi](#7-veritabani-yapisi)
8. [Ortam Degiskenleri ve Konfigurasyon](#8-ortam-degiskenleri-ve-konfigurasyon)
9. [Kurulum ve Calistirma Adimlari](#9-kurulum-ve-calistirma-adimlari)
10. [Bilinen Sorunlar ve Yapilacaklar (TODO)](#10-bilinen-sorunlar-ve-yapilacaklar-todo)

---

## 1. Proje Ozeti

**PORTECO** (ECO Enerji Yonetim Portali), Turk sanayi ve ticari musteriler icin gelistirilmis kapsamli bir **enerji yonetim ve izleme platformu**dur.

### Temel Ozellikler

- **Gercek zamanli enerji tuketim takibi** - Saatlik ve gunluk tuketim verileri
- **Fatura uretimi ve hesaplama** - Enerji bedeli, dagitim, guc bedeli, BTV, KDV, reaktif ceza
- **YEKDEM mahsup hesaplama** - Tahmini ve kesin YEKDEM degerlerinin fark hesabi
- **Reaktif guc uyari sistemi** - SMS ve e-posta ile otomatik bildirimler (RI %18/%20, RC %13/%15 esikleri)
- **EPIAS PTF entegrasyonu** - Piyasa takas fiyati verileri
- **Coklu tesis yonetimi** - Birden fazla abonelik/tesis takibi
- **Admin paneli** - 20+ yonetim sayfasi ile tam CRUD islemleri
- **Fatura gecmisi ve snapshot'lar** - Onceki doneme ait fatura kayitlari
- **Excel aktarimi** - Tuketim verilerini XLSX formatinda indirme
- **Blog/Icerik yonetimi** - Markdown tabanli blog sistemi

### Hedef Kitle

Turkiye'deki sanayi ve ticari enerji tuketicileri. Uygulama tamamen Turkce, Europe/Istanbul saat diliminde calisir.

---

## 2. Teknoloji Yigini (Tech Stack)

### Frontend

| Teknoloji | Versiyon | Aciklama |
|-----------|---------|----------|
| React | 18.3.1 | UI kutuphanesi |
| TypeScript | 5.5.4 | Tip guvenli JavaScript |
| Vite | 7.1.0 | Build araci ve dev server (HMR) |
| React Router DOM | 7.8.0 | Client-side yonlendirme |

### Stil ve UI

| Teknoloji | Versiyon | Aciklama |
|-----------|---------|----------|
| Tailwind CSS | 4.1.11 | Utility-first CSS framework |
| PostCSS | 8.5.6 | CSS isleme |
| Autoprefixer | 10.4.21 | Vendor prefix otomasyonu |
| Radix UI | 1.2.3 | Erisilebiilir UI primitifleri (`@radix-ui/react-slot`) |
| Lucide React | 0.542.0 | Ikon kutuphanesi |

### Animasyon

| Teknoloji | Versiyon | Aciklama |
|-----------|---------|----------|
| Framer Motion | 12.23.12 | Sayfa gecisleri ve animasyonlar |
| Spline React | 4.1.0 | Hero bolumundeki 3D animasyon |

### Backend ve Veritabani

| Teknoloji | Versiyon | Aciklama |
|-----------|---------|----------|
| Supabase JS | 2.57.4 | PostgreSQL BaaS istemcisi |
| Supabase Edge Functions | - | Deno tabanli serverless fonksiyonlar |
| PostgreSQL | 17 | Ana veritabani (Supabase uzerinde) |

### Veri Isleme

| Teknoloji | Versiyon | Aciklama |
|-----------|---------|----------|
| Recharts | 3.6.0 | Grafik ve chart kutuphanesi |
| XLSX | 0.18.5 | Excel dosya olusturma/ayrıstirma |
| dayjs | 1.11.18 | Tarih islemleri (Turkce lokalizasyon) |
| react-markdown | 10.1.0 | Markdown render |
| remark-gfm | 4.0.1 | GitHub Flavored Markdown destegi |

### Gelistirme Araclari

| Teknoloji | Versiyon | Aciklama |
|-----------|---------|----------|
| ESLint | 9.32.0 | Kod linting |
| tsx | 4.21.0 | Node.js icin TypeScript calistirici |
| dotenv | 17.2.4 | Ortam degiskeni yukleme |

---

## 3. Klasor ve Dosya Yapisi

```
PORTECO-v3-main-main/
├── public/                          # Statik dosyalar (build'e kopyalanir)
│   ├── dashboard-icons/             # Dashboard kart ikonlari (PNG)
│   ├── features/                    # Ozellik tanitim gorselleri
│   └── partners/                    # Partner logolari
│
├── src/                             # Kaynak kod
│   ├── App.tsx                      # Ana routing yapilandirmasi
│   ├── main.tsx                     # React giris noktasi (StrictMode + BrowserRouter)
│   ├── index.css                    # Global stiller (Tailwind importlari)
│   │
│   ├── components/
│   │   ├── admin/
│   │   │   ├── AdminShell.tsx       # Admin sayfa layout sarmalayicisi
│   │   │   ├── AdminSidebar.tsx     # Admin navigasyon sidebari
│   │   │   └── TableManager.tsx     # Genel amacli CRUD tablo bileseni
│   │   │
│   │   ├── auth/
│   │   │   ├── AdminRoute.tsx       # Admin rol kontrolu (is_admin)
│   │   │   └── ProtectedRoute.tsx   # Oturum korumali route sarmalayicisi
│   │   │
│   │   ├── dashboard/
│   │   │   ├── ChartsPage.tsx       # Grafik ve analiz sayfasi
│   │   │   ├── ConsumptionDetail.tsx # Saatlik/gunluk tuketim detayi
│   │   │   ├── DashboardShell.tsx   # Dashboard layout (sidebar + icerik)
│   │   │   ├── DetailLayout.tsx     # Detay sayfa layout sablonu
│   │   │   ├── EmailManager.tsx     # Kullanici e-posta yonetimi
│   │   │   ├── EnergyTable.tsx      # Tuketim veri tablosu
│   │   │   ├── GeneratedInvoicesSection.tsx # Uretilmis fatura listesi
│   │   │   ├── InvoiceDetail.tsx    # Fatura detay hesaplama sayfasi
│   │   │   ├── PhoneNumberManager.tsx # Kullanici telefon yonetimi
│   │   │   ├── PtfDetail.tsx        # EPIAS PTF fiyat detayi
│   │   │   ├── ReactiveSection.tsx  # Reaktif guc metrikleri
│   │   │   ├── SideBar.tsx          # Dashboard navigasyon sidebari
│   │   │   ├── TopBar.tsx           # Dashboard ust cubugu
│   │   │   ├── YekdemDetail.tsx     # YEKDEM destek detayi
│   │   │   ├── YekdemMahsupDetail.tsx # YEKDEM mahsup hesabi
│   │   │   └── invoiceDetail/
│   │   │       └── AlternateTariffInvoiceSection.tsx # Alternatif tarife karsilastirma
│   │   │
│   │   ├── forms/
│   │   │   └── LeadForm.tsx         # Iletisim / potansiyel musteri formu
│   │   │
│   │   ├── hero/
│   │   │   └── Hero.tsx             # Ana sayfa hero bolumu (Spline 3D)
│   │   │
│   │   ├── layout/
│   │   │   ├── Container.tsx        # Icerik genislik sarmalayicisi
│   │   │   ├── Footer.tsx           # Sayfa alt bilgisi (gradient/light varyantlari)
│   │   │   ├── Header.tsx           # Ust navigasyon cubugu
│   │   │   └── Section.tsx          # Bolum sarmalayicisi
│   │   │
│   │   ├── motion/
│   │   │   ├── Parallax.tsx         # Parallax scroll efekti
│   │   │   └── ScrollToTop.tsx      # Route degisiminde sayfa basina kaydirma
│   │   │
│   │   ├── sections/
│   │   │   ├── AboutUs.tsx          # Hakkimizda bolumu
│   │   │   ├── ContactUs.tsx        # Iletisim bolumu
│   │   │   ├── FAQSection.tsx       # Sikca sorulan sorular
│   │   │   ├── FeaturesSection.tsx  # Ozellik tanitimi
│   │   │   ├── PartnersSection.tsx  # Is ortaklari
│   │   │   ├── SmartPortal.tsx      # Akilli portal tanitimi
│   │   │   └── about/
│   │   │       ├── CtaContact.tsx   # Iletisim CTA bolumu
│   │   │       └── StatsStrip.tsx   # Istatistik seridi
│   │   │
│   │   ├── ui/                      # Shadcn tarzi temel UI bilesenleri
│   │   │   ├── button.tsx
│   │   │   ├── card.tsx
│   │   │   └── input.tsx
│   │   │
│   │   └── utils/                   # Hesaplama ve veri isleme fonksiyonlari
│   │       ├── calculateInvoice.ts      # Fatura hesaplama motoru
│   │       ├── calculateInvoiceToDate.ts # Ay-icine-kadar fatura hesaplama
│   │       ├── exportConsumptionXlsx.ts # Tuketim verisi Excel aktarimi
│   │       ├── invoiceHistory.ts        # Fatura gecmisi sorgulari
│   │       ├── invoiceSnapshots.ts      # Fatura snapshot islemleri
│   │       └── xlsx.ts                  # Excel dosya olusturma yardimcilari
│   │
│   ├── content/                     # Statik icerik ve stringler
│   │   ├── blog.ts                  # Blog yaziları metadata
│   │   ├── dashboardCards.ts        # Dashboard kart tanimlari (6 kart)
│   │   ├── faq.ts                   # SSS icerikleri
│   │   ├── features.ts             # Ozellik listesi
│   │   ├── partners.ts             # Partner bilgileri
│   │   └── strings.ts              # UI metin/etiket sabitleri
│   │
│   ├── hooks/                       # Custom React hook'lar
│   │   ├── useIsAdmin.ts           # Admin rol kontrolu
│   │   └── useSession.ts           # Supabase oturum yonetimi
│   │
│   ├── lib/                         # Yardimci kutuphaneler ve servis baslangici
│   │   ├── btvToggle.ts            # BTV (ozel tuketim vergisi) toggle
│   │   ├── dayjs.ts                # Turkce timezone yardimcisi
│   │   ├── paginatedFetch.ts       # PostgREST sayfalama utility'si
│   │   ├── scroll.ts               # Scroll yardimcilari
│   │   ├── supabase.ts             # Supabase istemci baslangici
│   │   ├── subscriptionVisibility.ts # Tesis gizleme/gosterme mantigi
│   │   └── utils.ts                # Genel yardimcilar (cn sinif birlestirme vb.)
│   │
│   └── pages/                       # Sayfa bilesenleri
│       ├── AlertsPage.tsx           # Akilli uyari sayfasi
│       ├── BlogDetailPage.tsx       # Blog yazi detayi
│       ├── BlogPage.tsx             # Blog listesi
│       ├── Dashboard.tsx            # Ana dashboard (500+ satir, 6 veri akisi)
│       ├── Features.tsx             # Ozellikler sayfasi
│       ├── FilesPage.tsx            # Dosya yukleme/indirme
│       ├── ForgotPassword.tsx       # Sifre sifirlama
│       ├── Home.tsx                 # Ana sayfa (landing page)
│       ├── InvoiceHistory.tsx       # Fatura gecmisi
│       ├── InvoiceSnapshotDetail.tsx # Fatura snapshot detayi
│       ├── Login.tsx                # Giris sayfasi
│       ├── ProfilePage.tsx          # Kullanici profil ayarlari
│       └── admin/                   # Admin yonetim sayfalari
│           ├── AdminHome.tsx                # Admin anasayfa
│           ├── ConsumptionDailyAdmin.tsx     # Gunluk tuketim yonetimi
│           ├── ConsumptionHourlyAdmin.tsx    # Saatlik tuketim yonetimi
│           ├── ContactMessagesAdmin.tsx      # Iletisim mesajlari
│           ├── DemandMonthlyAdmin.tsx        # Aylik talep yonetimi
│           ├── DistributionTariffAdmin.tsx   # Dagitim tarife yonetimi
│           ├── EmailLogsAdmin.tsx            # E-posta log'lari
│           ├── EpiasPtfAdmin.tsx             # EPIAS PTF veri yonetimi
│           ├── InvoiceSnapshotsAdmin.tsx     # Fatura snapshot yonetimi
│           ├── MonthlyOverviewAdmin.tsx      # Aylik ozet yonetimi
│           ├── NotificationChannelsAdmin.tsx # Bildirim kanallari
│           ├── NotificationEventsAdmin.tsx   # Bildirim olaylari
│           ├── OwnerSubscriptionsAdmin.tsx   # Sahip abonelikleri
│           ├── PostsAdmin.tsx               # Blog yazi yonetimi
│           ├── ReactiveAlertsAdmin.tsx      # Reaktif uyari yonetimi
│           ├── SmsLogsAdmin.tsx             # SMS log'lari
│           ├── SubscriptionSettingsAdmin.tsx # Abonelik ayarlari
│           ├── SubscriptionYekdemAdmin.tsx   # YEKDEM deger yonetimi
│           ├── UserEmailsAdmin.tsx          # Kullanici e-posta yonetimi
│           ├── UserIntegrationsAdmin.tsx    # Kullanici entegrasyon yonetimi
│           └── UserPhoneNumbersAdmin.tsx    # Kullanici telefon yonetimi
│
├── supabase/                        # Supabase backend yapilandirmasi
│   ├── config.toml                  # Supabase yerel yapilandirma
│   ├── functions/
│   │   └── reactive-alerts/         # Deno Edge Function
│   │       ├── index.ts             # Reaktif uyari cron fonksiyonu
│   │       ├── deno.json            # Deno yapilandirmasi
│   │       └── .npmrc               # NPM yapilandirmasi
│   └── migrations/                  # SQL migration dosyalari
│       ├── 20260203_001_create_user_phone_numbers.sql
│       ├── 20260203_002_create_sms_logs.sql
│       ├── 20260203_003_migrate_notification_channels.sql
│       ├── 20260205_001_create_contact_messages.sql
│       ├── 20260205_002_create_reactive_alert_state.sql
│       ├── 20260205_003_create_reactive_mtd_totals.sql
│       ├── 20260211_001_create_user_emails.sql
│       ├── 20260211_002_create_email_logs.sql
│       ├── 20260216_001_add_is_hidden_to_subscription_settings.sql
│       ├── 20260216_002_move_btv_enabled_to_owner_subscriptions.sql
│       └── 20260216_003_add_meter_serial_to_subscription_settings.sql
│
├── scripts/                         # Node.js otomasyon betikleri
│   ├── reactive-alerts.ts           # Cron job: reaktif uyari tetikleyici
│   ├── test-sms.ts                  # SMS gonderim testi
│   └── test-email.ts               # E-posta gonderim testi
│
├── package.json                     # Bagimliliklar ve betikler
├── vite.config.ts                   # Vite bundler yapilandirmasi
├── tailwind.config.cjs              # Tailwind CSS tasarim tokenleri
├── postcss.config.cjs               # PostCSS yapilandirmasi
├── tsconfig.json                    # TypeScript temel yapilandirma
├── tsconfig.app.json                # Uygulama TypeScript yapilandirmasi
├── tsconfig.node.json               # Build arac TypeScript yapilandirmasi
├── eslint.config.js                 # ESLint yapilandirmasi
├── index.html                       # HTML giris noktasi
├── .env                             # Ortam degiskenleri
└── .gitignore                       # Git'ten haric tutulan dosyalar
```

---

## 4. Mimari ve Veri Akisi

### 4.1 Genel Mimari

```
┌─────────────────────────────────────────────────────────────────┐
│                        KULLANICI (Tarayici)                     │
│                                                                 │
│  ┌──────────┐   ┌──────────────┐   ┌──────────────────────┐   │
│  │ Ana Sayfa │   │  Dashboard   │   │   Admin Paneli       │   │
│  │  (Public) │   │ (Protected)  │   │  (Admin Only)        │   │
│  └──────────┘   └──────┬───────┘   └──────────┬───────────┘   │
│                        │                       │               │
│  ┌─────────────────────┴───────────────────────┘               │
│  │              React Router DOM                               │
│  │         ProtectedRoute / AdminRoute                         │
│  └─────────────────────┬───────────────────────                │
│                        │                                        │
│           ┌────────────┴────────────┐                          │
│           │  @supabase/supabase-js  │                          │
│           │    (API istemcisi)       │                          │
│           └────────────┬────────────┘                          │
└────────────────────────┼────────────────────────────────────────┘
                         │ HTTPS
                         ▼
┌────────────────────────────────────────────────────────────────┐
│                     SUPABASE BULUT                              │
│                                                                 │
│  ┌──────────────┐  ┌───────────────┐  ┌───────────────────┐   │
│  │  Supabase    │  │  PostgREST    │  │  Edge Functions   │   │
│  │  Auth (JWT)  │  │ (REST API)    │  │  (Deno Runtime)   │   │
│  └──────┬───────┘  └───────┬───────┘  └────────┬──────────┘   │
│         │                  │                    │               │
│         ▼                  ▼                    ▼               │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │              PostgreSQL Veritabani                       │   │
│  │              (RLS Politikalari ile)                      │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ┌──────────────┐  ┌───────────────┐                           │
│  │  Storage     │  │  RPC          │                           │
│  │  (Dosyalar)  │  │  (Fonksiyonlar)│                          │
│  └──────────────┘  └───────────────┘                           │
└────────────────────────────────────────────────────────────────┘
                         │
                         │ Harici Servisler
                         ▼
┌──────────────────────────────────────────┐
│  ┌──────────────┐  ┌──────────────────┐  │
│  │  Ileti       │  │  Resend          │  │
│  │  Merkezi     │  │  (E-posta)       │  │
│  │  (SMS)       │  │                  │  │
│  └──────────────┘  └──────────────────┘  │
└──────────────────────────────────────────┘
```

### 4.2 Kimlik Dogrulama Akisi

```
Kullanici          ProtectedRoute         Supabase Auth       PostgreSQL
    │                    │                      │                  │
    │─── /login ─────────│                      │                  │
    │                    │                      │                  │
    │ email + sifre ─────│──signInWithPassword──│                  │
    │                    │                      │                  │
    │                    │◄── JWT Token ────────│                  │
    │                    │    (session)          │                  │
    │                    │                      │                  │
    │─── /dashboard ─────│                      │                  │
    │                    │── useSession() ──────│                  │
    │                    │◄── session ok ───────│                  │
    │                    │                      │                  │
    │                    │── supabase.from() ───│── RLS check ────│
    │                    │                      │  (auth.uid())    │
    │◄── Veri ───────────│◄─────────────────────│◄─────────────────│
```

**Yetkilendirme Seviyeleri:**

| Seviye | Kontrol Mekanizmasi | Ornek Sayfalar |
|--------|-------------------|----------------|
| Public | Yok | `/`, `/login`, `/blog` |
| User | `ProtectedRoute` + `useSession()` | `/dashboard`, `/dashboard/profile` |
| Admin | `AdminRoute` + `useIsAdmin()` + `app_metadata.is_admin` | `/dashboard/admin/*` |

### 4.3 Dashboard Veri Akisi

Dashboard sayfasi (`src/pages/Dashboard.tsx`) 6 paralel veri akisini yonetir:

```
useEffect Zincirleri (Sirali Bagimliliklar):
│
├─ Effect 1: Tesis listesini cek
│  └─ owner_subscriptions + subscription_settings
│  └─ Gizli tesisleri filtrele (fetchHiddenSernos)
│  └─ Secili tesisi belirle (resolveSelectedSub)
│
├─ Effect 2: Onceki ay tuketim verisi
│  └─ consumption_hourly (paginated, 1000'er satir)
│  └─ cn (aktif), ri (reaktif induktif), rc (reaktif kapasitif)
│
├─ Effect 3: Aylik PTF degeri
│  └─ RPC: monthly_ptf_prev_sub
│  └─ Tesis bazli PTF TL/kWh
│
├─ Effect 4: YEKDEM degeri
│  └─ subscription_yekdem (tesis ozel)
│  └─ Fallback: yekdem_official (resmi)
│
├─ Effect 5: KBK degeri
│  └─ subscription_settings.kbk
│
└─ Effect 6: Fatura hesaplama (yukaridakilere bagimli)
   ├─ Oncelik: invoice_snapshots tablosunda var mi?
   ├─ Yoksa: Canli hesaplama
   │  ├─ subscription_settings (terim, gerilim, tarife)
   │  ├─ distribution_tariff_official (tarife oranlari)
   │  ├─ demand_monthly (guc bedeli icin)
   │  ├─ calculateInvoice() → fatura
   │  └─ calculateYekdemMahsup() → M-1 mahsup
   └─ Birden fazla tesis varsa: Tum tesislerin toplami
```

### 4.4 Fatura Hesaplama Pipeline'i

```
Girdiler                          Hesaplama                        Cikti
────────                          ─────────                        ─────
tuketim (kWh)      ─┐
PTF (TL/kWh)       ─┤
YEKDEM (TL/kWh)    ─┤─→ unitPriceEnergy = (PTF+YEKDEM)*KBK
KBK (carpan)       ─┘
                         │
tuketim + trafo    ─────→├─→ energyCharge = unitPriceEnergy × tuketim
                         ├─→ trafoCharge  = unitPriceEnergy × trafo
dagitim birim fiyati ───→├─→ distributionCharge = dagitim × (tuketim+trafo)
BTV orani          ─────→├─→ btvCharge = (enerji+trafo) × btvOran
                         │
tarife tipi ────────┐    │
sozlesme gucu ──────┤───→├─→ powerBaseCharge = gucFiyat × sozlesmeGucu
max demand ─────────┤    ├─→ powerExcessCharge = asimFiyat × max(0, demand-limit)
guc fiyatlari ──────┘    │
                         │
reaktif ceza  ──────────→├─→ reactivePenaltyCharge
                         │
                         ├─→ subtotal = enerji+trafo+dagitim+BTV+guc+reaktif
KDV orani ──────────────→├─→ KDV = subtotal × kdvOran
                         │
                         └─→ TOPLAM = subtotal + KDV
                                (YEKDEM mahsup haric)
```

---

## 5. Temel Moduller ve Fonksiyonlar

### 5.1 Yardimci Kutuphaneler (`src/lib/`)

#### `supabase.ts` - Supabase Istemci Baslangici

```typescript
// Supabase istemcisini olusturur ve export eder
export const supabase = createClient(url, anon, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});
```

- **Giris:** `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON` ortam degiskenleri
- **Cikis:** `supabase` istemci nesnesi
- **Not:** Degiskenler eksikse hata firlatir

#### `dayjs.ts` - Turkce Tarih Yardimcisi

```typescript
export const TR_TZ = "Europe/Istanbul";
export function dayjsTR(input?: any) {
  return input ? dayjs(input).tz(TR_TZ) : dayjs().tz(TR_TZ);
}
```

- **Amac:** Tum tarih islemlerini Istanbul saat diliminde yapar
- **Kullanim:** `dayjsTR().format("DD.MM.YYYY")`, `dayjsTR().startOf("month")`

#### `paginatedFetch.ts` - Sayfalama Yardimcisi

PostgREST'in varsayilan 1000 satir limitini asan sorgular icin otomatik sayfalama saglar.

| Fonksiyon | Parametreler | Dondurulen | Aciklama |
|-----------|-------------|-----------|----------|
| `fetchAllConsumption` | `supabase, userId, subscriptionSerno, columns, startIso, endIso` | `{ data: any[], error }` | Kullanici bazli saatlik tuketim |
| `fetchAllConsumptionAdmin` | `supabase, columns, startIso, endIso` | `{ data: any[], error }` | Admin icin tum tuketim (RLS admin policy) |
| `fetchAllPtf` | `supabase, columns, startIso, endIso` | `{ data: any[], error }` | PTF piyasa fiyat verileri |

**Calisma Mantigi:**
```
1000 satir al → hepsi geldiyse sonraki 1000'i al → batch < 1000 olana kadar devam
```

#### `subscriptionVisibility.ts` - Tesis Gorunurluk Yonetimi

| Fonksiyon | Aciklama |
|-----------|----------|
| `fetchHiddenSernos(uid)` | Gizlenmis tesis numaralarini `Set<number>` olarak dondurur |
| `setSubscriptionHidden(uid, serno, isHidden)` | Tesisin gizlilik flagini DB'ye yazar (update-then-insert) |
| `resolveSelectedSub(visibleSernos, currentSelected)` | Secili tesisi belirler, gizlenmisse ilk gorunur tesise duser |

#### `btvToggle.ts` - BTV Toggle

```typescript
export async function setBtvEnabled(uid: string, serno: number, btvEnabled: boolean): Promise<void>
```

- Tesisin `btv_enabled` flagini `owner_subscriptions` tablosuna yazar
- Update-then-insert deseni kullanir

### 5.2 Custom Hook'lar (`src/hooks/`)

#### `useSession.ts`

```typescript
export function useSession(): { session: Session | null; loading: boolean }
```

- Supabase oturumunu dinler ve state'e yazar
- `onAuthStateChange` ile gercek zamanli guncellemeler
- Cleanup fonksiyonu ile bellek sizintisini onler

#### `useIsAdmin.ts`

```typescript
export function useIsAdmin(): { isAdmin: boolean; loading: boolean }
```

- `session.user.app_metadata.is_admin` degerini kontrol eder
- `useSession()` hook'unu iceride kullanir

### 5.3 Hesaplama Fonksiyonlari (`src/components/utils/`)

#### `calculateInvoice.ts`

**`calculateInvoice(input: InvoiceInput): InvoiceBreakdown`**

Enerji faturasi hesaplama motoru. Girdi parametreleri:

| Parametre | Tip | Aciklama |
|-----------|-----|----------|
| `totalConsumptionKwh` | `number` | Toplam tuketim (kWh) |
| `unitPriceEnergy` | `number` | Enerji birim fiyati `(PTF+YEKDEM)*KBK` |
| `unitPriceDistribution` | `number` | Dagitim birim fiyati (TL/kWh) |
| `btvRate` | `number` | BTV orani (ornek: 0.01) |
| `vatRate` | `number` | KDV orani (ornek: 0.20) |
| `tariffType` | `"single" \| "dual"` | Tek/cift terim tarife |
| `contractPowerKw` | `number` | Sozlesme gucu (kW) |
| `monthFinalDemandKw` | `number` | Ayin max demand'i (kW) |
| `powerPrice` | `number` | Guc bedeli birim fiyati (TL/kW) |
| `powerExcessPrice` | `number` | Guc bedeli asim birim fiyati (TL/kW) |
| `reactivePenaltyCharge` | `number?` | Reaktif ceza tutari (TL, KDV oncesi) |
| `trafoDegeri` | `number?` | Trafo degeri (kWh) |

Dondurulen `InvoiceBreakdown`:

| Alan | Aciklama |
|------|----------|
| `energyCharge` | Enerji bedeli |
| `trafoCharge` | Trafo bedeli |
| `distributionCharge` | Dagitim bedeli |
| `btvCharge` | BTV tutari |
| `powerBaseCharge` | Guc bedeli (baz) |
| `powerExcessCharge` | Guc bedeli (asim) |
| `reactivePenaltyCharge` | Reaktif ceza |
| `subtotalBeforeVat` | KDV oncesi ara toplam |
| `vatCharge` | KDV tutari |
| `totalInvoice` | Toplam (KDV dahil, YEKDEM mahsup haric) |

**`calculateYekdemMahsup(params: YekdemMahsupParams): number`**

YEKDEM mahsup hesabi (onceki donem icin):

```
fark = (yekdemNew - yekdemOld) * kbk * totalKwh * (1 + btvRate) * (1 + vatRate)
```

- Pozitif deger: Kullanicinin aleyhine (ek odeme)
- Negatif deger: Kullanicinin lehine (iade)

#### `calculateInvoiceToDate.ts`

**`computeMonthInvoiceToDate(params): Promise<MonthInvoiceToDateResult | null>`**

Ay icindeki guncel verilerle canli fatura hesabi yapar:

1. YEKDEM degeri var mi kontrol et
2. PTF verisinin son noktasini bul (cutoff)
3. Tuketim ve PTF verisini esle (saat bazinda)
4. Tuketim-agirlikli ortalama PTF hesapla
5. Tarife, guc, reaktif bilgilerini cek
6. `calculateInvoice()` ile fatura hesapla
7. YEKDEM mahsup (M-1) ekle

#### `exportConsumptionXlsx.ts` / `xlsx.ts`

Tuketim verilerini Excel formatinda aktarir. XLSX kutuphanesini kullanarak `.xlsx` dosyasi olusturur.

---

## 6. API Endpoint'leri

### 6.1 Supabase PostgREST Otomatik Endpoint'leri

Tum tablolar icin Supabase otomatik olarak REST endpoint'leri olusturur:

```
Temel URL: https://<proje-id>.supabase.co/rest/v1/

GET    /rest/v1/<tablo>               → Kayitlari listele (filtre ve sayfalama destekli)
POST   /rest/v1/<tablo>               → Yeni kayit ekle
PATCH  /rest/v1/<tablo>?id=eq.<id>    → Kayit guncelle
DELETE /rest/v1/<tablo>?id=eq.<id>    → Kayit sil
```

**Kullanilan Tablolar ve HTTP Islemleri:**

| Tablo | GET | POST | PATCH | DELETE | Aciklama |
|-------|-----|------|-------|--------|----------|
| `owner_subscriptions` | ✅ | - | ✅ | - | Tesis/abonelik bilgileri |
| `subscription_settings` | ✅ | ✅ | ✅ | - | Tesis ayarlari (KBK, tarife, vb.) |
| `subscription_yekdem` | ✅ | ✅ | ✅ | - | YEKDEM degerleri |
| `consumption_hourly` | ✅ | - | - | - | Saatlik tuketim verileri |
| `consumption_daily` | ✅ | - | - | - | Gunluk tuketim verileri |
| `epias_ptf_hourly` | ✅ | - | - | - | EPIAS PTF fiyatlari |
| `distribution_tariff_official` | ✅ | - | - | - | Resmi dagitim tarifeleri |
| `demand_monthly` | ✅ | - | - | - | Aylik talep verileri |
| `yekdem_official` | ✅ | - | - | - | Resmi YEKDEM oranlari |
| `invoice_snapshots` | ✅ | ✅ | - | - | Fatura snapshot'lari |
| `user_phone_numbers` | ✅ | ✅ | ✅ | ✅ | Kullanici telefon numaralari |
| `user_emails` | ✅ | ✅ | ✅ | ✅ | Kullanici e-posta adresleri |
| `sms_logs` | ✅ | - | - | - | SMS gonderim log'lari |
| `email_logs` | ✅ | - | - | - | E-posta gonderim log'lari |
| `reactive_alert_state` | ✅ | - | - | - | Reaktif uyari durumlari |
| `contact_messages` | ✅ | ✅ | ✅ | - | Iletisim formu mesajlari |
| `user_integrations` | ✅ | - | - | - | Kullanici entegrasyonlari |
| `notification_channels` | ✅ | - | - | - | Bildirim kanallari (legacy) |
| `notification_events` | ✅ | - | - | - | Bildirim olaylari |
| `posts` | ✅ | ✅ | ✅ | ✅ | Blog yazilari |

### 6.2 RPC Fonksiyonlari (Sunucu Tarafi)

**`POST /rest/v1/rpc/reactive_mtd_totals`**

Ay-icindeki reaktif enerji toplamlarini dondurur.

```
Giris: { p_user_id: uuid }
Cikis: [{ subscription_serno, active_kwh, ri_kvarh, rc_kvarh }]
```

```sql
-- Mevcut ayin consumption_hourly tablosundan cn, ri, rc kolonlarini toplar
SELECT subscription_serno,
       SUM(cn)  AS active_kwh,
       SUM(ri)  AS ri_kvarh,
       SUM(rc)  AS rc_kvarh
FROM consumption_hourly
WHERE user_id = p_user_id
  AND ts >= ay_basi AND ts < sonraki_ay_basi
GROUP BY subscription_serno
```

**`POST /rest/v1/rpc/monthly_ptf_prev_sub`**

Tesis bazli aylik PTF verisi.

```
Giris: { p_user_id, p_subscription_serno, p_year, p_month }
```

**`POST /rest/v1/rpc/monthly_dashboard_series`**

Dashboard grafikleri icin zaman serisi verisi.

```
Giris: { p_user_id, p_subscription_serno, p_year, p_month, p_kind }
```

### 6.3 Edge Function: reactive-alerts

**Dosya:** `supabase/functions/reactive-alerts/index.ts`

```
Metod:  GET
Header: x-cron-token: <CRON_TOKEN>
Yanit:  { ok: boolean, sent: number, errors?: string[] }
```

**Calisma Akisi:**

1. Tum kullanicilarin entegrasyon bilgilerini al (`user_integrations`)
2. Her kullanici icin aktif telefon numaralarini al (`user_phone_numbers`)
3. Tesisleri al (`owner_subscriptions`)
4. `reactive_mtd_totals` RPC ile ay-icindeki reaktif oranlari hesapla
5. Esikleri kontrol et:
   - **RI (Reaktif Induktif):** Uyari %18, Limit %20
   - **RC (Reaktif Kapasitif):** Uyari %13, Limit %15
6. `reactive_alert_state` tablosunu guncelle (upsert)
7. Esik asilmissa:
   - **E-posta:** Resend API uzerinden gonder
   - **SMS:** Ileti Merkezi API uzerinden gonder
8. Tum islemleri `sms_logs` ve `email_logs` tablolarina kaydet

### 6.4 Kimlik Dogrulama Endpoint'leri

```
POST /auth/v1/token?grant_type=password  → E-posta/sifre ile giris
POST /auth/v1/recover                    → Sifre sifirlama e-postasi
GET  /auth/v1/user                       → Mevcut kullanici bilgisi
POST /auth/v1/logout                     → Oturumu sonlandir
```

---

## 7. Veritabani Yapisi

### 7.1 Migration Dosyalariyla Olusturulan Tablolar

#### `user_phone_numbers`

| Kolon | Tip | Varsayilan | Aciklama |
|-------|-----|-----------|----------|
| `id` | uuid (PK) | `gen_random_uuid()` | Benzersiz kimlik |
| `user_id` | uuid (FK → auth.users) | - | Kullanici referansi |
| `phone_number` | text | - | Telefon numarasi |
| `label` | text | `'Birincil'` | Etiket (Is Telefonu, vb.) |
| `is_active` | boolean | `true` | Aktif mi |
| `receive_warnings` | boolean | `true` | Sari bolge uyarilari |
| `receive_alerts` | boolean | `true` | Kirmizi bolge uyarilari |
| `created_at` | timestamptz | `now()` | Olusturma zamani |
| `updated_at` | timestamptz | `now()` | Son guncelleme (trigger ile) |

**Kisit:** `UNIQUE (user_id, phone_number)`

#### `sms_logs`

| Kolon | Tip | Aciklama |
|-------|-----|----------|
| `id` | uuid (PK) | Benzersiz kimlik |
| `user_id` | uuid (FK) | Kullanici referansi |
| `subscription_serno` | text | Tesis numarasi |
| `phone_number` | text | Gonderilen numara |
| `message_type` | text | `reactive_ri_warn`, `reactive_ri_limit`, vb. |
| `message_body` | text | Mesaj icerigi |
| `status` | text | `pending`, `sent`, `failed` |
| `provider_response` | jsonb | SMS saglayici yaniti |
| `error_message` | text | Hata mesaji (varsa) |
| `created_at` | timestamptz | Gonderim zamani |

#### `contact_messages`

| Kolon | Tip | Varsayilan | Aciklama |
|-------|-----|-----------|----------|
| `id` | uuid (PK) | `gen_random_uuid()` | Benzersiz kimlik |
| `first_name` | text | - | Ad |
| `last_name` | text | - | Soyad |
| `email` | text | - | E-posta |
| `phone` | text | - | Telefon |
| `message` | text | - | Mesaj icerigi |
| `is_read` | boolean | `false` | Okundu mu |
| `created_at` | timestamptz | `now()` | Gonderim zamani |

#### `reactive_alert_state`

| Kolon | Tip | Aciklama |
|-------|-----|----------|
| `id` | uuid (PK) | Benzersiz kimlik |
| `user_id` | uuid (FK) | Kullanici referansi |
| `subscription_serno` | bigint | Tesis numarasi |
| `kind` | text | `'ri'` veya `'rc'` |
| `period_ym` | text | Donem (`'2026-02'`) |
| `status` | text | `'ok'`, `'warn'`, `'limit'` |
| `last_value_pct` | double precision | Son yuzde degeri |
| `last_sent_at` | timestamptz | Son bildirim zamani |
| `updated_at` | timestamptz | Son guncelleme |

**Kisit:** `UNIQUE (user_id, subscription_serno, kind, period_ym)`

#### `user_emails`

| Kolon | Tip | Varsayilan | Aciklama |
|-------|-----|-----------|----------|
| `id` | uuid (PK) | `gen_random_uuid()` | Benzersiz kimlik |
| `user_id` | uuid (FK) | - | Kullanici referansi |
| `email` | text | - | E-posta adresi |
| `label` | text | `'Birincil'` | Etiket |
| `is_active` | boolean | `true` | Aktif mi |
| `receive_warnings` | boolean | `true` | Uyari bildirimlerini al |
| `receive_alerts` | boolean | `true` | Alarm bildirimlerini al |
| `created_at` | timestamptz | `now()` | Olusturma zamani |
| `updated_at` | timestamptz | `now()` | Son guncelleme (trigger ile) |

**Kisit:** `UNIQUE (user_id, email)`

#### `email_logs`

`sms_logs` ile ayni yapida, ek olarak `subject` kolonu vardir.

### 7.2 Diger Tablolar (Kod Analizinden Cikarilan)

Bu tablolar migration dosyalarinda tanimlanmamis olup, Supabase yonetim panelinden veya harici entegrasyonlarla olusturulmustur:

| Tablo | Temel Kolonlar | Aciklama |
|-------|---------------|----------|
| `user_integrations` | `user_id, aril_user` | Kullanici ARIL sistem entegrasyonu |
| `owner_subscriptions` | `user_id, subscription_serno, multiplier, meter_serial, title, btv_enabled` | Tesis/abonelik temel bilgileri |
| `subscription_settings` | `user_id, subscription_serno, kbk, terim, gerilim, tarife, guc_bedel_limit, trafo_degeri, is_hidden, nickname, meter_serial` | Tesis yapilandirma ayarlari |
| `subscription_yekdem` | `user_id, subscription_serno, period_year/year, period_month/month, yekdem_value, yekdem_final, diger_degerler` | YEKDEM destek degerleri |
| `consumption_hourly` | `user_id, subscription_serno, ts, cn, ri, rc` | Saatlik tuketim (kWh) |
| `consumption_daily` | `user_id, subscription_serno, day, kwh_in` | Gunluk tuketim (kWh) |
| `epias_ptf_hourly` | `ts, ptf_tl_mwh / ptf_tl_kwh` | EPIAS piyasa takas fiyatlari |
| `distribution_tariff_official` | `terim, gerilim, tarife, dagitim_bedeli, guc_bedeli, guc_bedeli_asim, kdv, btv, reaktif_bedel` | Resmi dagitim tarifeleri |
| `demand_monthly` | `user_id, subscription_serno, period_year, period_month, max_demand_kw, is_final` | Aylik pik talep verileri |
| `yekdem_official` | `year/period_year, month/period_month, value` | Resmi YEKDEM oranlari |
| `invoice_snapshots` | `user_id, subscription_serno, year, month, ...` | Onceden hesaplanmis fatura kayitlari |
| `posts` | `slug, title, content, ...` | Blog yazilari |
| `notification_channels` | `user_id, phone, ...` | Bildirim kanallari (legacy) |
| `notification_events` | `...` | Bildirim olay turleri |
| `monthly_overview` | `...` | Aylik ozet verileri |

### 7.3 RLS (Row Level Security) Politikalari

Tum tablolarda RLS aktiftir. Temel politika desenleri:

**Kullaniciya ait veri:**
```sql
-- Kullanici kendi verisini gorur/duzenler
USING (auth.uid() = user_id)
```

**Admin erisimi:**
```sql
-- Admin tum veriyi gorur
USING ((auth.jwt() -> 'app_metadata' ->> 'is_admin')::boolean = true)
```

**Herkese acik ekleme (iletisim formu):**
```sql
-- Herkes mesaj gonderebilir
WITH CHECK (true)
-- Sadece adminler okur/gunceller
```

**Service role bypass:**
- `SB_SERVICE_ROLE_KEY` ile yapilan istekler RLS'i bypass eder
- Cron job'lar ve Edge Function'lar icin kullanilir

---

## 8. Ortam Degiskenleri ve Konfigurasyon

### 8.1 `.env` Dosyasi

```bash
# ─── Supabase Baglanti ───
VITE_SUPABASE_URL=https://<proje-id>.supabase.co    # Supabase proje URL'i
VITE_SUPABASE_ANON=<anon-key>                        # Supabase anonim anahtar (public)

# ─── Backend Erisimi (Gizli) ───
SB_SERVICE_ROLE_KEY=<service-role-key>               # Supabase service role (RLS bypass)

# ─── SMS Yapilandirmasi (Ileti Merkezi) ───
SMS_PROVIDER=iletimerkezi                             # SMS saglayici adi
SMS_SENDER=MBAHCIVANCI                                # SMS gonderici baslik
ILETIMERKEZI_KEY=<api-key>                            # Ileti Merkezi API anahtari
ILETIMERKEZI_HASH=<api-hash>                          # Ileti Merkezi API hash

# ─── E-posta Yapilandirmasi (Resend) ───
RESEND_API_KEY=<resend-key>                           # Resend API anahtari
RESEND_FROM=PORTECO muratbahcivanci@ecoenerji.net.tr  # Gonderici adresi
```

**Onemli Notlar:**
- `VITE_` on eki ile baslayan degiskenler istemciye (tarayici) acilir
- `VITE_` on eki olmayan degiskenler sadece sunucu tarafinda kullanilir
- Frontend'de: `import.meta.env.VITE_SUPABASE_URL`
- Backend'de (Deno): `Deno.env.get("SB_SERVICE_ROLE_KEY")`
- Script'lerde (Node): `process.env.SB_SERVICE_ROLE_KEY` (dotenv ile)

### 8.2 Edge Function Ortam Degiskenleri

`supabase/functions/reactive-alerts/index.ts` icin gereken ek degiskenler:

| Degisken | Aciklama |
|----------|----------|
| `SB_URL` | Supabase URL (Edge Function icinde `VITE_` on eki kullanilmaz) |
| `CRON_TOKEN` | Cron job guvenlik tokeni (`x-cron-token` header'inda gonderilir) |

### 8.3 Vite Yapilandirmasi (`vite.config.ts`)

```typescript
export default defineConfig({
  base: "/",
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      "@components": path.resolve(__dirname, "src/components"),
    },
  },
});
```

### 8.4 TypeScript Yapilandirmasi (`tsconfig.app.json`)

- **Hedef:** ES2022
- **Modul:** ESNext
- **Strict mod:** Aktif
- **JSX:** react-jsx
- **Yol alias'lari:** `@/*` → `src/*`, `@components/*` → `src/components/*`

### 8.5 Tailwind CSS Yapilandirmasi (`tailwind.config.cjs`)

**Marka Renkleri:**

| Token | Deger | Aciklama |
|-------|-------|----------|
| `blue` | `#00AEEF` | Ana marka rengi |
| `blueLight` | `#40CFFF` | Acik mavi |
| `blueDark` | `#005B96` | Koyu mavi |
| `dark` | `#0F1C2E` | Koyu arka plan |
| `gray` | `#7A8C99` | Metin grisi |
| `lightBlue` | `#E6F8FD` | Acik mavi arka plan |

**Diger:**
- Varsayilan `borderRadius`: 8px
- Font ailesi: Inter sans-serif

---

## 9. Kurulum ve Calistirma Adimlari

### 9.1 Onkosuller

- **Node.js** (v18 veya ustu)
- **npm** (v9 veya ustu)
- **Supabase CLI** (migration'lar ve Edge Function'lar icin - opsiyonel)
- Supabase projesine erisim (URL ve anahtarlar)

### 9.2 Projeyi Klonlama ve Bagimliliklari Kurma

```bash
# Repoyu klonla
git clone <repo-url>
cd PORTECO-v3-main-main

# Bagimliliklari kur
npm install
```

### 9.3 Ortam Degiskenlerini Ayarlama

```bash
# .env dosyasini olustur (veya mevcut .env dosyasini duzenle)
# Asagidaki degiskenleri doldurun:

VITE_SUPABASE_URL=https://<proje-id>.supabase.co
VITE_SUPABASE_ANON=<anon-key>
SB_SERVICE_ROLE_KEY=<service-role-key>

# SMS (opsiyonel - reaktif uyari sistemi icin)
SMS_PROVIDER=iletimerkezi
SMS_SENDER=<gonderici-adi>
ILETIMERKEZI_KEY=<api-key>
ILETIMERKEZI_HASH=<api-hash>

# E-posta (opsiyonel - reaktif uyari sistemi icin)
RESEND_API_KEY=<resend-key>
RESEND_FROM=<gonderici-adi> <gonderici@email.com>
```

### 9.4 Gelistirme Sunucusunu Baslatma

```bash
# Gelistirme sunucusu (HMR aktif)
npm run dev

# Tarayicida ac: http://localhost:5173
```

### 9.5 Mevcut npm Betikleri

| Betik | Komut | Aciklama |
|-------|-------|----------|
| `dev` | `vite` | Gelistirme sunucusu (HMR) |
| `build` | `vite build` | Uretim derlemesi (`/dist` klasorune) |
| `preview` | `vite preview` | Derlenmis uygulamayi onizleme |
| `typecheck` | `tsc --noEmit` | Tip kontrolu (dosya cikisi yok) |
| `lint` | `eslint .` | Kod lint kontrolu |
| `cron:alerts` | `tsx scripts/reactive-alerts.ts` | Reaktif uyari cron job'u calistir |
| `test:sms` | `tsx scripts/test-sms.ts` | SMS gonderim testi |

### 9.6 Supabase Migration'larini Uygulama (Opsiyonel)

```bash
# Supabase CLI kurulumu
npm install -g supabase

# Supabase projesine baglan
supabase link --project-ref <proje-ref>

# Migration'lari uygula
supabase db push
```

### 9.7 Edge Function Deploy

```bash
# Reaktif uyari fonksiyonunu deploy et
supabase functions deploy reactive-alerts
```

### 9.8 Uretim Derlemesi

```bash
# Uretim build'i olustur
npm run build

# Cikti: /dist klasorune statik dosyalar olarak
# Herhangi bir statik dosya sunucusu ile sunulabilir (Vercel, Netlify, vb.)
```

---

## 10. Bilinen Sorunlar ve Yapilacaklar (TODO)

### Bilinen Sorunlar

| Sorun | Oncelik | Aciklama |
|-------|---------|----------|
| README.md merge conflict | Dusuk | README.md dosyasinda cozulmemis git merge cakismasi var |
| `.env` dosyasi git'te takip ediliyor | Yuksek | Gizli anahtarlar (API key, service role) repoda aciga cikabilir. `.gitignore`'a eklenmeli |
| `nul` dosyasi | Dusuk | Proje kokunde gereksiz `nul` dosyasi var, temizlenmeli |
| Kolon adi tutarsizligi | Orta | `subscription_yekdem` tablosunda `period_year/year` ve `period_month/month` kolon adi farkliligini handle eden fallback kodu var |

### Yapilacaklar (TODO)

| Gorev | Oncelik | Aciklama |
|-------|---------|----------|
| Test altyapisi | Yuksek | Hicbir test dosyasi yok. Vitest + React Testing Library ile test altyapisi kurulmali |
| `.env` guvenligi | Yuksek | `.env` dosyasi `.gitignore`'a eklenmeli, `.env.example` dosyasi olusturulmali |
| README.md duzeltme | Orta | Merge conflict cozulup README guncellenmeli |
| Hata izleme | Orta | Sentry veya benzeri bir hata izleme servisi entegre edilmeli |
| PWA destegi | Dusuk | Progressive Web App ozellikleri (offline erisim, push bildirim) |
| i18n altyapisi | Dusuk | Ileride coklu dil destegi icin altyapi hazirlanabilir |
| Performans | Dusuk | Dashboard.tsx 500+ satir; buyuk bilesenler parcalanabilir |
| Code splitting | Dusuk | Admin sayfalari icin lazy loading uygulanabilir |

---

> **Son Guncelleme:** Subat 2026
