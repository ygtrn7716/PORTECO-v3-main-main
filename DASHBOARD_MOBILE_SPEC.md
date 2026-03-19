# PORTECO v3 – Dashboard Analizi ve Mobil Tasima Spesifikasyonu

## Icindekiler

- [A – Dashboard Ekran Haritasi](#a--dashboard-ekran-haritasi)
- [B – Veri Katmani (Backend Baglantilari)](#b--veri-katmani-backend-baglantilari)
- [C – Kimlik Dogrulama ve Yetkilendirme](#c--kimlik-dogrulama-ve-yetkilendirme)
- [D – Hesaplama ve Is Mantigi](#d--hesaplama-ve-is-mantigi)
- [E – UI Bilesen Envanteri](#e--ui-bilesen-envanteri)
- [F – Mobil Uyumluluk Degerlendirmesi](#f--mobil-uyumluluk-degerlendirmesi)

---

## A – Dashboard Ekran Haritasi

### A.1 Ana Dashboard

**Dosya:** `src/pages/Dashboard.tsx` (~500+ satir)
**Route:** `/dashboard`

#### Gosterilen Icerik

1. **Baslik Alani**
   - Sayfa basligi: "PortEco Gosterge Paneli"
   - Alt baslik: "Kisiye ve tesise ozel istatistiklerin"
   - Tesis secici dropdown (meter_serial + nickname gosterir)

2. **Hata Banti**
   - Tum veri kaynaklarindan gelen hatalar tek bantta birlestirilir
   - `subsErr`, `prevErr`, `ptfErr`, `yekdemErr`, `kbkErr`, `invoiceErr`

3. **Yukleme Gostergesi**
   - "Veriler yukleniyor..." metni (herhangi bir loading state true iken)

4. **6 Istatistik Karti** (responsive grid: 1/2/3 kolon)

   | Kart | Deger | Detay Linki | Ikon |
   |------|-------|-------------|------|
   | Aylik Toplam Tuketim | `prevMonthKwh` kWh | `/dashboard/consumption` | bolt.png |
   | PTF Fiyati | `monthlyPTF` TL/kWh (6 ondalik) | `/dashboard/ptf` | chart-up.png |
   | YEKDEM Degeri | `monthlyYekdem` TL/kWh (6 ondalik) + kaynak (resmi/ozel) | `/dashboard/yekdem` | coin.png |
   | Birim Fiyat | `(PTF + YEKDEM) * KBK` TL/kWh | – (tiklanmaz) | dollar.png |
   | Fatura Toplami | `invoiceTotal` TL (2 ondalik) | `/dashboard/invoice-detail` | invoice.png |
   | YEKDEM Mahsup | `yekdemMahsup` TL (+/- renk kodlu) | `/dashboard/yekdem-mahsup` | try.png |

   - Her kart coklu tesis varsa (`subs.length > 1`) "Tum tesisler toplami" satiri gosterir
   - Hover efektleri: 3D tilt, shimmer overlay, scale 1.02, "Detay →" butonu

5. **Reaktif Bolum**
   - `ReactiveSection` bileseni: secili tesis icin RI ve RC yuzdeleri

#### Kullanici Aksiyonlari

- Tesis degistirme (dropdown) → tum veriler yeniden cekilir
- Kart tiklama → ilgili detay sayfasina yonlendirme
- localStorage'a secili tesis kaydedilir (`eco_selected_sub`)

---

### A.2 Alt Sayfalar

#### Tuketim Detayi (`/dashboard/consumption`)
**Dosya:** `src/components/dashboard/ConsumptionDetail.tsx`

- Onceki ay toplam kWh ozet karti
- Mevcut ay guncel kWh ozet karti
- Ay-icine-kadar tahmini fatura tutari (genisletilebilir panel)
- Saatlik tuketim tablosu (sayfalamali, 1000 satir/batch)
- Tarih araligi secici
- XLSX export butonu (onceki/mevcut ay)
- Tesis secici dropdown

#### Fatura Detayi (`/dashboard/invoice-detail`)
**Dosya:** `src/components/dashboard/InvoiceDetail.tsx`

- Yil/Ay/Tesis secicileri
- Tam fatura hesaplama tablosu (12+ kalem satiri)
- Manuel parametre override alanlari (PTF, YEKDEM, KBK, kWh, demand)
- Tarife tipi toggle (Tek-terim / Cift-terim)
- KDV/BTV uygulansin mi toggle'lari
- Trafo degeri dahil edilsin mi toggle'i
- Guc sozlesmesi onerisi (son 3 ay max demand analizi)
- Fatura snapshot'i kaydetme butonu
- Alternatif tarife karsilastirma bolumu (`AlternateTariffInvoiceSection`)

#### YEKDEM Detayi (`/dashboard/yekdem`)
**Dosya:** `src/components/dashboard/YekdemDetail.tsx`

- Yillik YEKDEM deger tablosu (12 ay)
- Her ay icin: yekdem_value (baslangic) ve yekdem_final (kesin)
- Fark gostergeleri
- Yil/Tesis secicileri
- XLSX export

#### YEKDEM Mahsup Detayi (`/dashboard/yekdem-mahsup`)
**Dosya:** `src/components/dashboard/YekdemMahsupDetail.tsx`

- M-1 donemi mahsup hesap detayi
- Hesaplama adimlari gorunumu (fark, KBK, BTV, KDV)
- Tarihsel mahsup tablosu
- Yil/Ay/Tesis secicileri

#### PTF Detayi (`/dashboard/ptf`)
**Dosya:** `src/components/dashboard/PtfDetail.tsx`

- Saatlik PTF (TL/MWh) + tuketim (kWh) eslestirmeli tablo
- Satir bazli maliyet hesabi: `kWh * PTF / 1000`
- Tuketim-agirlikli ortalama PTF gosterimi
- Yil/Ay/Tesis secicileri
- XLSX export

#### Grafikler (`/dashboard/charts`)
**Dosya:** `src/components/dashboard/ChartsPage.tsx`

- 12 aylik veri serisi grafikleri (Recharts)
- Grafik turleri:
  - Tuketim (kWh) – BarChart
  - PTF (TL/kWh) – LineChart
  - YEKDEM (resmi vs ozel) – LineChart
  - Aylik fatura toplamlari – BarChart
  - Reaktif oranlar (RI/RC) – LineChart
- Yil/Tesis secicileri
- RPC: `monthly_dashboard_series`

#### Uyarilar (`/dashboard/alerts`)
**Dosya:** `src/pages/AlertsPage.tsx`

- Tesis bazli reaktif uyari durumlari (RI + RC)
- Her tesis icin: durum badge'i (Normal/Uyari/Limit), yuzde deger, ilerleme cubugu
- SMS log tablosu (son 50 kayit)
- Email log tablosu (son 50 kayit)
- PhoneNumberManager bileseni (telefon CRUD)
- EmailManager bileseni (e-posta CRUD)

#### Gecmis Faturalarim (`/dashboard/invoices`)
**Dosya:** `src/pages/InvoiceHistory.tsx`

- Yil bazli gruplanmis fatura kartlari
- Her kart: ay etiketi, tesis no, toplam TL, tuketim kWh
- Kart tiklama → `/dashboard/invoices/{serno}/{year}/{month}`

#### Fatura Snapshot Detayi (`/dashboard/invoices/:sub/:year/:month`)
**Dosya:** `src/pages/InvoiceSnapshotDetail.tsx`

- 3 ozet karti: Toplam Tuketim, Birim Fiyat, Odenecek Tutar
- Guc/Talep ozeti (max demand, sozlesme gucu)
- Fatura kalem tablosu:
  - Enerji Bedeli, Dagitim Bedeli, BTV, Guc Limit Ici, Guc Asim
  - Reaktif Ceza, Trafo Bedeli, KDV, Ara Toplam, Genel Toplam
  - YEKDEM Mahsubu (renk kodlu), Diger Bedeller
  - **Final Toplam** (mahsup dahil)

#### Dosyalarim (`/dashboard/files`)
**Dosya:** `src/pages/FilesPage.tsx`

- Olusturulmus fatura listesi (`GeneratedInvoicesSection`)
- Yil bazli gruplama
- Detay sayfasina yonlendirme

#### Profil (`/dashboard/profile`)
**Dosya:** `src/pages/ProfilePage.tsx`

- Tesis ayarlari (her tesis icin kart):
  - Nickname duzenleme (input + kaydet butonu)
  - Gorunurluk toggle (goz ikonu)
  - BTV toggle (onay kutusu + yuzde etkisi bilgisi)
- PhoneNumberManager bolumu
- EmailManager bolumu

---

### A.3 Navigasyon Akisi

#### Sidebar Navigasyonu (`src/components/dashboard/SideBar.tsx`)

```
Ana Menuler:
├── Gosterge Paneli    → /dashboard
├── Grafikler          → /dashboard/charts
├── Gecmis Faturalarim → /dashboard/invoices
├── Uyarilar           → /dashboard/alerts
├── Profil             → /dashboard/profile
└── Admin Panel        → /dashboard/admin (sadece is_admin)
```

**Desktop:** Genisleyebilir sidebar (260px acik / 80px kapali), toggle butonu, aktif gosterge (sol kenar cizgisi + pulse dot)
**Mobil:** Drawer menu (300px, max %85 ekran), overlay arkaplan, yana kayma animasyonu, body scroll kilidi

#### Kart Tiklamalarindan Yonlendirmeler

```
Dashboard Kartlari:
├── Tuketim karti     → /dashboard/consumption
├── PTF karti         → /dashboard/ptf
├── YEKDEM karti      → /dashboard/yekdem
├── Birim Fiyat karti → (yonlendirme yok)
├── Fatura karti      → /dashboard/invoice-detail
└── Mahsup karti      → /dashboard/yekdem-mahsup

Fatura Gecmisi:
└── Fatura karti      → /dashboard/invoices/{serno}/{year}/{month}
```

#### Layout Bilesenleri

| Bilesen | Dosya | Rol |
|---------|-------|-----|
| DashboardShell | `src/components/dashboard/DashboardShell.tsx` | Grid layout: sidebar + main content, responsive padding, max-w 1560px |
| DetailLayout | `src/components/dashboard/DetailLayout.tsx` | Detay sayfasi sablonu: baslik + alt baslik + sag aksiyon alani + icerik |
| TopBar | `src/components/dashboard/TopBar.tsx` | Sticky ust cubuk: tarih secici, arama, bildirim zili, rapor indir butonu |
| SideBar | `src/components/dashboard/SideBar.tsx` | Navigasyon: desktop sidebar + mobil drawer |

---

### A.4 Admin Sayfalari

**Route:** `/dashboard/admin/*`
**Koruma:** `AdminRoute` → `AdminShell` sarmalama

| Sayfa | Route | Aciklama |
|-------|-------|----------|
| AdminHome | `/dashboard/admin` | Ozet istatistikler, hizli erisim linkleri |
| UserIntegrationsAdmin | `admin/user-integrations` | ARIL entegrasyon yonetimi |
| SubscriptionSettingsAdmin | `admin/subscription-settings` | Tesis ayarlari CRUD |
| SubscriptionYekdemAdmin | `admin/subscription-yekdem` | YEKDEM deger yonetimi |
| DistributionTariffAdmin | `admin/distribution-tariff` | Dagitim tarife yonetimi |
| PostsAdmin | `admin/posts` | Blog yazi yonetimi |
| OwnerSubscriptionsAdmin | `admin/owner-subscriptions` | Abonelik temel bilgileri |
| NotificationChannelsAdmin | `admin/notification-channels` | Bildirim kanallari |
| UserPhoneNumbersAdmin | `admin/user-phone-numbers` | Telefon numaralari |
| UserEmailsAdmin | `admin/user-emails` | E-posta adresleri |
| SmsLogsAdmin | `admin/sms-logs` | SMS loglari |
| EmailLogsAdmin | `admin/email-logs` | E-posta loglari |
| ReactiveAlertsAdmin | `admin/reactive-alerts` | Reaktif uyari yonetimi |
| NotificationEventsAdmin | `admin/notification-events` | Bildirim olaylari |
| EpiasPtfAdmin | `admin/epias-ptf` | PTF veri yonetimi |
| InvoiceSnapshotsAdmin | `admin/invoice-snapshots` | Fatura snapshot yonetimi |
| MonthlyOverviewAdmin | `admin/monthly-overview` | Aylik ozet yonetimi |
| ContactMessagesAdmin | `admin/contact-messages` | Iletisim mesajlari |

Tum admin sayfalari `TableManager` (`src/components/admin/TableManager.tsx`) genel amacli CRUD bilesenini kullanir.

---

## B – Veri Katmani (Backend Baglantilari)

### B.1 Dashboard.tsx – Veri Akisi Detayi

#### useState Degiskenleri (20+)

| Degisken | Tip | Varsayilan | Aciklama |
|----------|-----|-----------|----------|
| `subs` | `SubscriptionOption[]` | `[]` | Gorunur tesis listesi |
| `selectedSub` | `number \| null` | localStorage | Secili tesis numarasi |
| `subsLoading` | `boolean` | `true` | Tesis yukleme durumu |
| `subsErr` | `string` | `""` | Tesis hata mesaji |
| `prevMonthKwh` | `number` | `0` | Onceki ay toplam tuketim |
| `prevMonthRi` | `number` | `0` | Onceki ay reaktif induktif |
| `prevMonthRc` | `number` | `0` | Onceki ay reaktif kapasitif |
| `prevLoading` | `boolean` | `true` | Tuketim yukleme durumu |
| `monthlyPTF` | `number` | `0` | Aylik PTF (TL/kWh) |
| `ptfLoading` | `boolean` | `true` | PTF yukleme durumu |
| `monthlyYekdem` | `number` | `0` | Aylik YEKDEM (TL/kWh) |
| `yekdemMode` | `"official" \| "custom"` | `"official"` | YEKDEM kaynagi |
| `yekdemLoading` | `boolean` | `true` | YEKDEM yukleme durumu |
| `monthlyKbk` | `number` | `1` | KBK katsayisi |
| `kbkLoading` | `boolean` | `true` | KBK yukleme durumu |
| `invoiceTotal` | `number` | `0` | Fatura toplami (mahsup dahil) |
| `yekdemMahsup` | `number` | `0` | YEKDEM mahsup tutari |
| `hasYekdemMahsup` | `boolean` | `false` | Mahsup hesaplandi mi |
| `yekdemMissing` | `string` | `"both"` | Eksik YEKDEM verisi |
| `invoiceLoading` | `boolean` | `true` | Fatura yukleme durumu |
| `allSubsTotalKwh` | `number` | `0` | Tum tesisler toplam kWh |
| `allSubsTotalInvoice` | `number` | `0` | Tum tesisler toplam TL |
| `allSubsTotalMahsup` | `number` | `0` | Tum tesisler toplam mahsup |

#### useEffect Zincirleri (7 adet)

**Effect 1 – Tesis Listesi**
```
Tetikleyici: [uid, sessionLoading]
Sorgular:
  1. supabase.from("owner_subscriptions").select("subscription_serno, meter_serial, title")
  2. supabase.from("subscription_settings").select("subscription_serno, title, nickname")
  3. fetchHiddenSernos(uid) → gizli tesisleri filtrele
Guncellenen state: subs, selectedSub, subsLoading, subsErr
```

**Effect 2 – Onceki Ay Tuketim**
```
Tetikleyici: [uid, sessionLoading, selectedSub]
Sorgular:
  1. fetchAllConsumption({ columns: "ts, cn, ri, rc", startIso, endIso })
     → paginatedFetch (1000 satir/batch)
Hesaplama: totalKwh = sum(cn), totalRi = sum(ri), totalRc = sum(rc)
Guncellenen state: prevMonthKwh, prevMonthRi, prevMonthRc, prevLoading
```

**Effect 3 – Aylik PTF**
```
Tetikleyici: [uid, sessionLoading, selectedSub]
Sorgular:
  1. supabase.rpc("monthly_ptf_prev_sub", { p_tz, p_subscription_serno })
Guncellenen state: monthlyPTF, ptfLoading
```

**Effect 4 – YEKDEM Degeri**
```
Tetikleyici: [uid, sessionLoading, selectedSub]
Sorgular:
  1. supabase.from("subscription_yekdem").select("yekdem_value")
     → period_year/period_month ile (fallback: year/month)
  2. Fallback: supabase.from("yekdem_official").select("value")
Guncellenen state: monthlyYekdem, yekdemMode, yekdemLoading
```

**Effect 5 – KBK Degeri**
```
Tetikleyici: [uid, sessionLoading, selectedSub]
Sorgular:
  1. supabase.from("subscription_settings").select("kbk")
Guncellenen state: monthlyKbk, kbkLoading
```

**Effect 6 – Fatura Hesaplama**
```
Tetikleyici: [uid, sessionLoading, selectedSub, prevMonthKwh, prevMonthRi, prevMonthRc,
              monthlyPTF, monthlyYekdem, monthlyKbk]
Sorgular:
  1. supabase.from("invoice_snapshots") → onbellek kontrolu
  2. supabase.from("subscription_settings").select("terim, gerilim, tarife, guc_bedel_limit, trafo_degeri")
  3. supabase.from("distribution_tariff_official").select("dagitim_bedeli, guc_bedeli, ...")
  4. supabase.from("owner_subscriptions").select("multiplier, btv_enabled")
  5. supabase.from("demand_monthly").select("max_demand_kw")
  6. supabase.from("consumption_daily") → M-1 tuketimi (mahsup icin)
  7. supabase.from("subscription_yekdem").select("yekdem_value, yekdem_final") → M-1
Hesaplamalar:
  - calculateInvoice() → fatura donusumu
  - calculateYekdemMahsup() → onceki donem mahsup
  - fetchSubscriptionDigerDegerler() → diger bedeller
  - totalWithMahsup = invoice + mahsup + digerDegerler
Guncellenen state: invoiceTotal, yekdemMahsup, hasYekdemMahsup, yekdemMissing
```

**Effect 7 – Tum Tesisler Toplami**
```
Tetikleyici: [uid, sessionLoading, subs]
Kosul: subs.length > 1
Islem: Her tesis icin Effect 2 + Effect 6 tekrarlaniyor
Guncellenen state: allSubsTotalKwh, allSubsTotalInvoice, allSubsTotalMahsup
```

---

### B.2 Diger Ekranlarin Veri Baglantilari

#### ConsumptionDetail.tsx

| Supabase Tablosu | Islem | Aciklama |
|------------------|-------|----------|
| `owner_subscriptions` | SELECT | Tesis listesi |
| `subscription_settings` | SELECT (nested) | Nickname, tarife bilgileri |
| `consumption_daily` | SELECT | Gunluk tuketim toplamlari |
| `consumption_hourly` | SELECT (paginated) | Saatlik tuketim (fallback) |
| `epias_ptf_hourly` | SELECT (paginated) | PTF eslestirme |
| `distribution_tariff_official` | SELECT | Tarife parametreleri |
| `owner_subscriptions` | SELECT | multiplier, btv_enabled |
| `demand_monthly` | SELECT | max_demand_kw |

**Sayfalama kullanilan yerler:** `fetchAllConsumption()`, `fetchAllPtf()`
**Ozel:** `computeMonthInvoiceToDate()` pipeline'i calistirilir

#### InvoiceDetail.tsx

| Supabase Tablosu | Islem | Aciklama |
|------------------|-------|----------|
| `subscription_settings` | SELECT | Tesis listesi + tarife ayarlari |
| `owner_subscriptions` | SELECT | Fallback tesis listesi, multiplier |
| `consumption_hourly` | SELECT (paginated) | Aylik tuketim (cn, ri, rc) |
| `yekdem_official` | SELECT | Resmi YEKDEM oranlari |
| `subscription_yekdem` | SELECT | Ozel YEKDEM + mahsup verileri |
| `distribution_tariff_official` | SELECT | Tum tarife parametreleri |
| `demand_monthly` | SELECT | Son 3 ay max demand (guc onerisi) |
| `consumption_daily` | SELECT | M-1 tuketim (mahsup icin) |
| `invoice_snapshots` | UPSERT | Hesaplanan faturayi kaydet |

**RPC:** `monthly_ptf_prev_sub`
**Mutasyon:** `upsertInvoiceSnapshot()` – hesaplanan fatura kaydedilir

#### ChartsPage.tsx

| Supabase Tablosu | Islem | Aciklama |
|------------------|-------|----------|
| `owner_subscriptions` | SELECT (nested) | Tesis listesi + KBK |

**RPC:** `monthly_dashboard_series(p_user_id, p_subscription_serno, p_year, p_tz)`
- Mevcut yil + onceki yil icin 2 kez cagrilir
- Donen kolonlar: month, consumption_kwh, ptf_tl_kwh, yekdem_value_tl_kwh, yekdem_final_tl_kwh, invoice_total_tl, yekdem_mahsup_tl, ri_ratio_max, ri_ratio_end, rc_ratio_max, rc_ratio_end

#### PtfDetail.tsx

| Supabase Tablosu | Islem | Aciklama |
|------------------|-------|----------|
| `owner_subscriptions` | SELECT | Tesis listesi |
| `subscription_settings` | SELECT | Nickname |
| `consumption_hourly` | SELECT (paginated) | Saatlik tuketim ("ts, cn") |
| `epias_ptf_hourly` | SELECT (paginated) | Saatlik PTF ("ts, ptf_tl_mwh") |

**Sayfalama:** `fetchAllConsumption()` + `fetchAllPtf()` paralel calistirilir
**Eslestirme:** Saat bazinda hourKey ile consumption ↔ PTF merge

#### AlertsPage.tsx

| Supabase Tablosu | Islem | Aciklama |
|------------------|-------|----------|
| `owner_subscriptions` | SELECT | Tesis bilgileri |
| `reactive_alert_state` | SELECT | Tesis bazli uyari durumlari |
| `sms_logs` | SELECT (limit 50) | SMS gonderim gecmisi |
| `email_logs` | SELECT (limit 50) | E-posta gonderim gecmisi |
| `user_phone_numbers` | SELECT/INSERT/UPDATE/DELETE | Telefon yonetimi |
| `user_emails` | SELECT/INSERT/UPDATE/DELETE | E-posta yonetimi |

#### ProfilePage.tsx

| Supabase Tablosu | Islem | Aciklama |
|------------------|-------|----------|
| `owner_subscriptions` | SELECT | Tesis listesi + btv_enabled |
| `subscription_settings` | SELECT/UPDATE/INSERT | Nickname, is_hidden |

**Mutasyonlar:**
- `setSubscriptionHidden()` → is_hidden toggle (update-then-insert)
- `setBtvEnabled()` → btv_enabled toggle (update-then-insert)
- Nickname kaydetme → subscription_settings.nickname UPDATE

#### ReactiveSection.tsx

| Supabase Tablosu | Islem | Aciklama |
|------------------|-------|----------|
| `consumption_hourly` | SELECT (paginated) | Mevcut ay "cn, ri, rc" |

**Hesaplama:** `riPct = (totalRi / activeKwh) * 100`, `rcPct = (totalRc / activeKwh) * 100`

---

### B.3 Sayfalama (Paginated Fetch) Kullanim Haritasi

**Dosya:** `src/lib/paginatedFetch.ts` — Sayfa boyutu: **1000 satir**

| Fonksiyon | Kullanan Bilesenler |
|-----------|-------------------|
| `fetchAllConsumption()` | Dashboard.tsx, ConsumptionDetail.tsx, InvoiceDetail.tsx, PtfDetail.tsx, ReactiveSection.tsx, YekdemMahsupDetail.tsx, calculateInvoiceToDate.ts |
| `fetchAllConsumptionAdmin()` | AdminHome.tsx |
| `fetchAllPtf()` | PtfDetail.tsx, ConsumptionDetail.tsx, calculateInvoiceToDate.ts |

---

### B.4 Veri Mutasyonlari Ozeti

| Islem | Tablo | Tetikleyici |
|-------|-------|-------------|
| UPSERT | `invoice_snapshots` | InvoiceDetail fatura hesaplamasindan sonra |
| UPDATE | `subscription_settings` (nickname) | ProfilePage kaydet butonu |
| UPDATE/INSERT | `subscription_settings` (is_hidden) | ProfilePage gorunurluk toggle |
| UPDATE/INSERT | `owner_subscriptions` (btv_enabled) | ProfilePage BTV toggle |
| INSERT | `user_phone_numbers` | AlertsPage/ProfilePage telefon ekleme |
| DELETE | `user_phone_numbers` | AlertsPage/ProfilePage telefon silme |
| UPDATE | `user_phone_numbers` (is_active, receive_*) | AlertsPage/ProfilePage toggle |
| INSERT | `user_emails` | AlertsPage/ProfilePage e-posta ekleme |
| DELETE | `user_emails` | AlertsPage/ProfilePage e-posta silme |
| UPDATE | `user_emails` (is_active, receive_*) | AlertsPage/ProfilePage toggle |
| SET | `localStorage` (eco_selected_sub) | Tesis secimi degistiginde |

---

## C – Kimlik Dogrulama ve Yetkilendirme

### C.1 useSession Hook'u

**Dosya:** `src/hooks/useSession.ts`

```typescript
function useSession(): { session: Session | null; loading: boolean }
```

**Calisma Mantigi:**
1. Component mount → `supabase.auth.getSession()` → mevcut oturumu al
2. `supabase.auth.onAuthStateChange()` → auth durum degisikliklerini dinle
3. Cleanup → dinleyici aboneligini iptal et (`sub.subscription.unsubscribe()`)

**Bellek Korumasi:** `let mounted = true` flag'i ile unmount sonrasi state guncelleme engellenir

```
Mount
  ├─ getSession() → session | null
  ├─ onAuthStateChange(callback) → dinleyici baslatilir
  └─ loading = false
Unmount
  └─ mounted = false, subscription.unsubscribe()
```

### C.2 useIsAdmin Hook'u

**Dosya:** `src/hooks/useIsAdmin.ts`

```typescript
function useIsAdmin(): { isAdmin: boolean; loading: boolean }
```

- `useSession()` hook'unu iceride kullanir
- `session?.user?.app_metadata?.is_admin` degerini kontrol eder
- `!!` ile boolean'a donusturur

### C.3 ProtectedRoute

**Dosya:** `src/components/auth/ProtectedRoute.tsx`

```
Kullanici → /dashboard
  ├─ loading? → Yukleme gostergesi
  ├─ session yok? → /login'e redirect (location state ile geri donus bilgisi)
  └─ session var? → <Outlet /> render (alt route'lar gosterilir)
```

- React Router `<Outlet />` deseni kullanir
- `useLocation()` ile mevcut konum saklanir, login sonrasi geri donulebilir

### C.4 AdminRoute

**Dosya:** `src/components/auth/AdminRoute.tsx`

```
Kullanici → /dashboard/admin/*
  ├─ loading? → Yukleme gostergesi
  ├─ isAdmin = false? → /dashboard'a redirect
  └─ isAdmin = true? → <AdminShell> icinde <Outlet /> render
```

### C.5 JWT Token Yonetimi

**Supabase istemci yapilandirmasi** (`src/lib/supabase.ts`):

```typescript
createClient(url, anon, {
  auth: {
    persistSession: true,      // Oturum tarayici storage'a kaydedilir
    autoRefreshToken: true,    // JWT suresi dolmadan otomatik yenilenir
    detectSessionInUrl: true   // URL'deki auth token'lari algilanir (password reset)
  }
})
```

- **Oturum suresi:** JWT expiry 3600 saniye (1 saat) — `supabase/config.toml`
- **Yenileme:** Refresh token rotation aktif, reuse interval 10 saniye
- **Depolama:** Tarayici localStorage'a otomatik persist
- **Yenileme mekanizmasi:** Supabase istemci JWT sure dolmadan ~60 saniye once otomatik yeniler

### C.6 RLS (Row Level Security) Desenleri

| Desen | SQL Politikasi | Kullanan Tablolar |
|-------|---------------|-------------------|
| **Kullanici verisi** | `USING (auth.uid() = user_id)` | user_phone_numbers, user_emails, sms_logs, email_logs, reactive_alert_state |
| **Admin erisimi** | `USING ((auth.jwt()->'app_metadata'->>'is_admin')::boolean = true)` | Tum tablolarda SELECT override |
| **Herkese acik insert** | `WITH CHECK (true)` | contact_messages (iletisim formu) |
| **Service role bypass** | RLS'i tamamen atlar | Edge Function (reactive-alerts), cron job'lar |

---

## D – Hesaplama ve Is Mantigi

### D.1 calculateInvoice()

**Dosya:** `src/components/utils/calculateInvoice.ts`

#### Girdi: InvoiceInput (12 parametre)

| Parametre | Tip | Aciklama |
|-----------|-----|----------|
| `totalConsumptionKwh` | `number` | Toplam tuketim (kWh) |
| `unitPriceEnergy` | `number` | Enerji birim fiyati: `(PTF + YEKDEM) * KBK` |
| `unitPriceDistribution` | `number` | Dagitim birim fiyati (TL/kWh) |
| `btvRate` | `number` | BTV orani (ornek: 0.01 veya 0.05) |
| `vatRate` | `number` | KDV orani (ornek: 0.20) |
| `tariffType` | `"single" \| "dual"` | Tek/cift terim tarife |
| `contractPowerKw` | `number` | Sozlesme gucu (kW) |
| `monthFinalDemandKw` | `number` | Ayin max demand'i (kW, multiplier uygulanmis) |
| `powerPrice` | `number` | Guc bedeli birim fiyati (TL/kW) |
| `powerExcessPrice` | `number` | Guc bedeli asim birim fiyati (TL/kW) |
| `reactivePenaltyCharge` | `number?` | Reaktif ceza tutari (TL, KDV oncesi) |
| `trafoDegeri` | `number?` | Trafo kaybi degeri (kWh) |

#### Cikti: InvoiceBreakdown (12 alan)

| Alan | Formul |
|------|--------|
| `energyCharge` | `unitPriceEnergy * totalConsumptionKwh` |
| `trafoCharge` | `unitPriceEnergy * trafoDegeri` |
| `distributionCharge` | `unitPriceDistribution * (totalConsumptionKwh + trafoDegeri)` |
| `distributionBaseKwh` | `totalConsumptionKwh + trafoDegeri` |
| `btvCharge` | `(energyCharge + trafoCharge) * btvRate` |
| `powerBaseCharge` | `powerPrice * contractPowerKw` (sadece dual tarife) |
| `powerExcessCharge` | `powerExcessPrice * max(0, demand - contractPower)` (sadece dual) |
| `powerTotalCharge` | `powerBaseCharge + powerExcessCharge` |
| `reactivePenaltyCharge` | Giristen dogrudan alinir |
| `subtotalBeforeVat` | `enerji + trafo + dagitim + BTV + guc + reaktif` |
| `vatCharge` | `subtotalBeforeVat * vatRate` |
| `totalInvoice` | `subtotalBeforeVat + vatCharge` (YEKDEM mahsup **haric**) |

### D.2 calculateYekdemMahsup()

**Dosya:** `src/components/utils/calculateInvoice.ts`

#### Girdi: YekdemMahsupParams

| Parametre | Aciklama |
|-----------|----------|
| `totalKwh` | Onceki donem tuketimi (kWh) |
| `kbk` | KBK katsayisi |
| `btvRate` | BTV orani |
| `vatRate` | KDV orani |
| `yekdemOld` | Tahmini YEKDEM (fatura kesilirken kullanilan) |
| `yekdemNew` | Kesin YEKDEM (ertesi ay gelen resmi deger) |

#### Formul

```
diffYekdem    = yekdemNew - yekdemOld
deltaEnergy   = diffYekdem * kbk * totalKwh
subtotalNoVat = deltaEnergy * (1 + btvRate)
deltaTotal    = subtotalNoVat * (1 + vatRate)
```

- **Pozitif sonuc:** Kullanicinin aleyhine (ek odeme)
- **Negatif sonuc:** Kullanicinin lehine (iade/indirim)

### D.3 computeMonthInvoiceToDate() – Tam Pipeline

**Dosya:** `src/components/utils/calculateInvoiceToDate.ts`

15 adimlik hesaplama pipeline'i:

```
Adim  1: YEKDEM degeri var mi kontrol et → yoksa null don
Adim  2: PTF verisinin son zaman damgasini bul (cutoff)
Adim  3: PTF saatlik haritasi olustur (start → cutoff, paginated)
Adim  4: Tuketim verisi cek (cn, ri, rc - paginated)
Adim  5: Tuketim ↔ PTF eslestir (hourKey bazinda)
         → billableKwh (PTF olan saatler), skippedKwh (PTF olmayan)
Adim  6: Tuketim-agirlikli ortalama PTF hesapla
Adim  7: subscription_settings'den tarife bilgilerini al
         (kbk, terim, gerilim, tarife, guc_bedel_limit, trafo_degeri)
Adim  8: owner_subscriptions'dan multiplier ve btv_enabled al
Adim  9: distribution_tariff_official'dan tarife oranlari al
         (dagitim, guc, guc_asim, kdv, btv, reaktif_bedel)
Adim 10: Reaktif ceza hesapla
         → RI > %20 veya RC > %15 ise: penalty = fazlaEnerji * reaktif_bedel
Adim 11: demand_monthly'den max_demand_kw al (is_final=true)
         → monthFinalDemandKw = max_demand_kw * multiplier
Adim 12: unitPriceEnergy = (monthlyPTF + monthlyYekdem) * kbk
Adim 13: calculateInvoice() ile temel fatura hesapla
Adim 14: M-1 YEKDEM mahsup hesapla
         → consumption_daily (veya hourly fallback) + subscription_yekdem
         → calculateYekdemMahsup() cagir
Adim 15: diger_degerler (ek bedeller) cek
         → totalWithMahsup = invoice + mahsup + digerDegerler
```

### D.4 Reaktif Guc Hesaplama Mantigi

**Esikler:**

| Tur | Uyari Esigi | Limit Esigi |
|-----|-------------|-------------|
| RI (Reaktif Induktif) | %18 | %20 |
| RC (Reaktif Kapasitif) | %13 | %15 |

**Hesaplama:**
```
riPercent = (totalRi / activeKwh) * 100
rcPercent = (totalRc / activeKwh) * 100

Eger riPercent > 20:
  riPenaltyEnergy = totalRi
Eger rcPercent > 15:
  rcPenaltyEnergy = totalRc

penaltyEnergy = riPenaltyEnergy + rcPenaltyEnergy
reactivePenaltyCharge = penaltyEnergy * reaktif_bedel  // TL, KDV oncesi
```

**Uyari Gonderimi** (Edge Function `supabase/functions/reactive-alerts/index.ts`):

```
1. reactive_mtd_totals RPC → ay-icindeki RI/RC toplam
2. levelFor(kind, valuePct) → "ok" | "warn" | "limit"
3. Onceki durum ile karsilastir (reactive_alert_state)
4. shouldSend = (ok→warn) veya (ok/warn→limit) gecisi varsa
5. E-posta: Resend API ile gonder
6. SMS: Ileti Merkezi API ile gonder
7. sms_logs / email_logs'a kaydet
```

### D.5 Excel Export

**Dosya:** `src/components/utils/exportConsumptionXlsx.ts`

```
1. fetchAllConsumption() ile sayfalamali veri cek (1000/batch)
2. Her satiri format: { Tarih, Saat, "Aktif (kWh)", "Reaktif Ind.", "Reaktif Kap." }
3. XLSX.utils.json_to_sheet(rows) → calisma sayfasi
4. XLSX.utils.book_new() + book_append_sheet() → calisma kitabi
5. XLSX.writeFile(wb, "tuketim_[meter]_[tarih].xlsx") → tarayici indirme
```

**Dosya:** `src/components/utils/xlsx.ts`

```typescript
function downloadXlsx(opts: {
  rows: Record<string, any>[];
  fileName: string;
  sheetName?: string;  // varsayilan: "Sheet1"
})
```

### D.6 Fatura Snapshot Islemleri

**Dosya:** `src/components/utils/invoiceSnapshots.ts`

| Fonksiyon | Aciklama |
|-----------|----------|
| `upsertInvoiceSnapshot(data)` | Fatura verisi kaydet/guncelle (conflict: user_id, subscription_serno, period_year, period_month, invoice_type) |
| `listInvoiceSnapshots({ userId, invoiceType })` | Kullanici fatura listesi |
| `getInvoiceSnapshot({ userId, subscriptionSerno, year, month })` | Tekil fatura kaydini al |

**Dosya:** `src/components/utils/invoiceHistory.ts`

| Fonksiyon | Aciklama |
|-----------|----------|
| `saveInvoiceToHistory(args)` | invoice_history tablosuna upsert (billed/backdated) |

---

## E – UI Bilesen Envanteri

### E.1 Dashboard Kartlari

#### StatCard (Dashboard.tsx icinde inline tanimli)

**Props:**
```typescript
{
  title: string           // Kart basligi
  value: string           // Ana deger (formatli)
  sub?: string            // Alt bilgi (birim vb.)
  onClick?: () => void    // Tiklama aksiyonu
  img?: ImgSpec           // Arka plan ikonu
  valueClassName?: string // Deger CSS sinifi
  badgeText?: string      // Sag ust badge metni
  badgeClassName?: string // Badge CSS sinifi
  totalLine?: string      // Coklu tesis toplam satiri
}
```

**UI Elemanlari:**
- Beyaz kartlar: `h-[160px]`, `rounded-2xl`, `border-neutral-200`
- Baslik (sol ust): `text-sm text-neutral-500`
- Ana deger: `text-2xl font-semibold`
- Alt bilgi: `text-xs text-neutral-500`
- Badge (sag): `rounded-xl` kucuk metin
- Arka plan ikonu: absolute positioned PNG
- Hover: 3D tilt (perspective, rotateX/Y), shimmer (gradient animasyon), scale 1.02
- Toplam satiri: Mavi nokta + kucuk metin
- "Detay →" butonu: hover'da kayarak gorunur

#### ReactiveCard (ReactiveSection.tsx icinde)

**Props:**
```typescript
{
  title: string           // "Reaktif Induktif (RI)" veya "Reaktif Kapasitif (RC)"
  subtitle: string        // Ek bilgi
  activeKwh: number       // Aktif tuketim
  reactiveTotal: number   // Reaktif toplam
  ratioPct: number        // Yuzde oran
  limitPct: number        // Limit degeri (20 veya 15)
}
```

**UI Elemanlari:**
- Kart: beyaz, border-neutral-200
- Durum badge'i: yesil (limit icinde) / kirmizi (limit asildi)
- Buyuk yuzde gosterimi
- Yatay ilerleme cubugu (renkli dolum + limit isareti)
- Yuzde araligi gostergesi (0% – 100%)
- Uyari metni (kirmizi, limit asilirsa)

### E.2 Grafik Bilesenleri (Recharts)

**Dosya:** `src/components/dashboard/ChartsPage.tsx`

| Grafik Tipi | Recharts Bileseni | Veri Serisi |
|-------------|------------------|-------------|
| Tuketim | `BarChart` | Aylik kWh toplamlari |
| PTF | `LineChart` | Aylik ortalama PTF (TL/kWh) |
| YEKDEM | `LineChart` | Resmi vs ozel degerler |
| Fatura | `BarChart` | Aylik fatura toplamlari (TL) |
| Reaktif | `LineChart` | RI/RC orani maksimumlari (%) |

**Ortak Ozellikler:**
- XAxis: Ay etiketleri (Turkce)
- YAxis: Otomatik olcekleme
- Tooltip: Turkce formatli degerler
- Legend: Seri isimleri
- ResponsiveContainer: %100 genislik
- Onceki yil serisi: karsilastirmali gorunum

### E.3 Tablo Bilesenleri

#### EnergyTable (`src/components/dashboard/EnergyTable.tsx`)

- Tesis secici ("TUMU" veya spesifik serno)
- Tarih araligi secici (baslangic/bitis)
- Sayfalamali veri (1000 satir/batch, "Daha Fazla Yukle" butonu)
- Kolonlar: Zaman Damgasi, Tesis, Aktif (kWh), Reaktif (kVArh)
- CSV export islevi

#### Fatura Kalem Tablosu (InvoiceSnapshotDetail.tsx icinde)

- HTML `<table>` yapisi
- Basliklar: Kalem | Aciklama | Tutar (TL)
- 12+ satir (enerji, dagitim, vergiler, cezalar, toplamlar)
- Renk kodlama: kirmizi (negatif/ceza), yesil (iade/kredi)
- `overflow-x-auto` (mobil yatay kayma)

#### SMS/Email Log Tablolari (AlertsPage.tsx icinde)

- Son 50 kayit (sirali: created_at DESC)
- SMS kolonlar: Tarih, Tur, Telefon, Mesaj, Durum
- Email kolonlar: Tarih, Email, Konu, Durum
- Durum gostergesi: Yesil (sent), Kirmizi (failed), Gri (pending)
- Hata mesaji gorunumu (failed durumda)

### E.4 Form Bilesenleri

#### PhoneNumberManager (`src/components/dashboard/PhoneNumberManager.tsx`)

- Mevcut telefon listesi (kart gorunumu)
- Yeni numara ekleme formu (numara + etiket)
- Toggle switch'ler: is_active, receive_warnings, receive_alerts
- Silme butonu (onay ile)
- Turkce telefon numarasi dogrulama

#### EmailManager (`src/components/dashboard/EmailManager.tsx`)

- Ayni yapi: e-posta listesi + ekleme formu + toggle'lar + silme

### E.5 Responsive Sinif Kullanim Haritasi

| Tailwind Pattern | Kullanim Yeri | Mobil Davranisi |
|-----------------|---------------|-----------------|
| `grid-cols-1 sm:grid-cols-2 xl:grid-cols-3` | Dashboard kartlar | 1→2→3 kolon |
| `md:hidden` | Mobil menu butonu | Sadece mobilde gorunur |
| `hidden md:flex` | Desktop sidebar | Sadece masaustunde |
| `hidden sm:inline-flex` | TopBar tarih secici | Mobilde gizli |
| `hidden md:block` | TopBar arama | Tablet/mobilde gizli |
| `w-full sm:w-[420px] md:w-auto` | Tesis dropdown | Tam genislik→sabit→auto |
| `px-4 sm:px-6 lg:px-8` | Container padding | Kademeli artan padding |
| `flex-col md:flex-row` | Baslik alani | Dikeyden yataya |
| `max-w-[85vw]` | Mobil drawer | Ekranin %85'i |
| `grid-cols-1 md:grid-cols-4` | EnergyTable filtreler | 1→4 kolon |

---

## F – Mobil Uyumluluk Degerlendirmesi

### F.1 Dogrudan Tasinabilir Moduller (~%65 Is Mantigi)

Bu dosyalar hicbir degisiklik olmadan veya minimal degisiklikle React Native'de kullanilabilir:

| Dosya | Durum | Not |
|-------|-------|-----|
| `src/components/utils/calculateInvoice.ts` | ✅ Tam uyumlu | Saf hesaplama, hicbir tarayici bagimliligi yok |
| `src/components/utils/calculateInvoiceToDate.ts` | ✅ Tam uyumlu | dayjsTR + Supabase + paginatedFetch kullanir |
| `src/components/utils/invoiceSnapshots.ts` | ✅ Tam uyumlu | Saf Supabase CRUD |
| `src/components/utils/invoiceHistory.ts` | ✅ Tam uyumlu | Saf Supabase upsert |
| `src/lib/paginatedFetch.ts` | ✅ Tam uyumlu | Saf Supabase sorgu + sayfalama |
| `src/lib/btvToggle.ts` | ✅ Tam uyumlu | Saf Supabase update-then-insert |
| `src/lib/dayjs.ts` | ✅ Tam uyumlu | Saf tarih kutuphanesi + timezone |
| `src/lib/utils.ts` | ✅ Tam uyumlu | cn() sinif birlestirme fonksiyonu |
| `src/hooks/useSession.ts` | ✅ Tam uyumlu | Supabase auth React Native'de calisir |
| `src/hooks/useIsAdmin.ts` | ✅ Tam uyumlu | Saf session kontrol |
| `src/lib/supabase.ts` | ⚠ Minimal degisiklik | `import.meta.env` → `process.env` veya Config |

**Toplam:** 11 dosya, ~1200+ satir is mantigi dogrudan paylasılabilir

### F.2 Kismen Tasinabilir Moduller

| Dosya | Tasinabilir Kisim | Degistirilmesi Gereken |
|-------|-------------------|----------------------|
| `src/lib/subscriptionVisibility.ts` | `fetchHiddenSernos()`, `setSubscriptionHidden()` (saf Supabase) | `resolveSelectedSub()` icindeki `localStorage` → `AsyncStorage` |
| `src/components/admin/TableManager.tsx` | State yonetimi, filtreleme, sayfalama mantigi | HTML table → FlatList, form input'lar → RN TextInput |
| `src/pages/Dashboard.tsx` | 7 useEffect zinciri, 20+ useState (veri akisi mantigi) | JSX tamamen yeniden yazilmali |
| `src/components/dashboard/ChartsPage.tsx` | RPC cagrilari, veri donusumleri | Recharts → react-native-chart-kit veya Victory Native |
| `src/pages/AlertsPage.tsx` | Supabase sorgulari, durum hesaplamalari | Kart/tablo UI yeniden |
| `src/pages/ProfilePage.tsx` | Mutation fonksiyonlari | Form UI yeniden |

### F.3 Yeniden Yazilmasi Gereken Moduller

| Dosya/Kategori | Neden | React Native Alternatifi |
|----------------|-------|-------------------------|
| `src/lib/scroll.ts` | `document.getElementById()`, `window.scrollTo()`, `getBoundingClientRect()` | ScrollView ref, `scrollTo()` metodu |
| `src/components/utils/xlsx.ts` | `XLSX.writeFile()` tarayici dosya indirme | `react-native-fs` + `ExcelJS` veya Share API |
| `src/components/utils/exportConsumptionXlsx.ts` | Ayni tarayici dosya indirme sorunu | Ayni cozum |
| **Tailwind responsive siniflari** | `md:hidden`, `grid-cols-*`, `sm:*` vb. | `Dimensions` API, `useWindowDimensions()` |
| **React Router** | `<Route>`, `<Outlet>`, `useNavigate()`, `useParams()` | React Navigation (`@react-navigation/native`) |
| **SideBar drawer** | `document.body.style.overflow`, DOM manipulasyonu | `@react-navigation/drawer` veya `react-native-drawer-layout` |
| **HTML tablolar** | `<table>`, `<thead>`, `<tbody>`, `<tr>`, `<td>` | `FlatList` + ozel satir bilesenleri |
| **CSS animasyonlar** | 3D tilt, shimmer, translate, transition | `react-native-reanimated` + `react-native-gesture-handler` |
| **Hover efektleri** | mouseEnter/Leave, hover pseudo-class | `Pressable` onPress/onLongPress |
| **`overflow-x-auto`** | Yatay kayma tablosu | `ScrollView horizontal={true}` |

### F.4 Ortam Degiskeni Uyarlamasi

```
Web (Vite):
  import.meta.env.VITE_SUPABASE_URL
  import.meta.env.VITE_SUPABASE_ANON

React Native (Expo):
  process.env.EXPO_PUBLIC_SUPABASE_URL
  process.env.EXPO_PUBLIC_SUPABASE_ANON

React Native (Bare):
  react-native-config ile Config.SUPABASE_URL
```

### F.5 Depolama Uyarlamasi

```
Web:
  localStorage.getItem("eco_selected_sub")
  localStorage.setItem("eco_selected_sub", value)

React Native:
  import AsyncStorage from '@react-native-async-storage/async-storage'
  await AsyncStorage.getItem("eco_selected_sub")
  await AsyncStorage.setItem("eco_selected_sub", value)
```

**Not:** AsyncStorage asenkron oldugundan, senkron localStorage cagrilarini `async/await` ile sarmalamalik gerekir.

### F.6 Onerilen Paylasimli (Shared) Modul Yapisi

```
shared/                          # Web + Mobil ortak moduller
├── calculations/
│   ├── calculateInvoice.ts      # Fatura motoru
│   ├── calculateInvoiceToDate.ts # Tam pipeline
│   └── types.ts                 # InvoiceInput, InvoiceBreakdown, vb.
├── data/
│   ├── paginatedFetch.ts        # Sayfalamali veri cekme
│   ├── invoiceSnapshots.ts      # Snapshot CRUD
│   ├── invoiceHistory.ts        # Gecmis fatura CRUD
│   └── btvToggle.ts             # BTV toggle
├── hooks/
│   ├── useSession.ts            # Auth oturum yonetimi
│   └── useIsAdmin.ts            # Admin kontrol
├── lib/
│   ├── supabase.ts              # Supabase istemci (env abstraction ile)
│   ├── dayjs.ts                 # Tarih yardimcilari
│   └── utils.ts                 # Genel yardimcilar
└── storage/
    └── storage.ts               # IStorage interface (localStorage/AsyncStorage)
```

**storage.ts Abstraction Ornegi:**
```typescript
export interface IStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

// Web implementasyonu
export const webStorage: IStorage = {
  getItem: async (key) => localStorage.getItem(key),
  setItem: async (key, value) => localStorage.setItem(key, value),
  removeItem: async (key) => localStorage.removeItem(key),
};

// React Native implementasyonu
// import AsyncStorage from '@react-native-async-storage/async-storage';
// export const mobileStorage: IStorage = {
//   getItem: (key) => AsyncStorage.getItem(key),
//   setItem: (key, value) => AsyncStorage.setItem(key, value),
//   removeItem: (key) => AsyncStorage.removeItem(key),
// };
```

### F.7 Navigasyon Donusumu

```
Web (React Router):                    React Native (React Navigation):
─────────────────                      ──────────────────────────────
<BrowserRouter>                        <NavigationContainer>
  <Routes>                               <Stack.Navigator>
    <Route path="/dashboard"               <Stack.Screen name="Dashboard"
      element={<Dashboard />} />             component={Dashboard} />
    <Route path="/dashboard/ptf"           <Stack.Screen name="PtfDetail"
      element={<PtfDetail />} />             component={PtfDetail} />
  </Routes>                              </Stack.Navigator>
</BrowserRouter>                       </NavigationContainer>

useNavigate() → "/dashboard/ptf"       navigation.navigate("PtfDetail")
useParams() → { sub, year, month }     route.params.sub, route.params.year
<Outlet />                             (Stack/Tab Navigator icinde otomatik)
ProtectedRoute wrapper                 Auth guard in Navigator screenOptions
```

### F.8 Grafik Kutuphanesi Donusumu

```
Web (Recharts):                        React Native Alternatifleri:
───────────────                        ────────────────────────────
<LineChart>                            react-native-chart-kit
<BarChart>                             victory-native
<ResponsiveContainer>                  react-native-svg-charts
                                       @shopify/react-native-skia (yuksek performans)
```

---

### F.9 Ozet: Tasima Matrisi

| Kategori | Dosya Sayisi | Satir Tahmini | Durum |
|----------|-------------|---------------|-------|
| Dogrudan tasinabilir | 11 dosya | ~1200 satir | ✅ Degisiklik yok |
| Minimal degisiklik | 1 dosya | ~15 satir | ⚠ Env var |
| localStorage → AsyncStorage | 1 dosya | ~30 satir | ⚠ Async sarmalama |
| Mantik OK, UI yeniden | 6+ bilesen | ~2000 satir | ⚠ JSX yeniden |
| Tamamen yeniden | 5+ dosya | ~500 satir | ❌ Platform-spesifik |
| UI bilesenleri (tumu) | 15+ bilesen | ~4000 satir | ❌ RN bilesenler |

**Sonuc:** Is mantigi katmaninin ~%65'i dogrudan React Native'de kullanilabilir. UI katmani tamamen yeniden yazilmali ancak state yonetimi (useEffect/useState desenleri) buyuk olcude korunabilir.

---

> **Son Guncelleme:** Subat 2026
