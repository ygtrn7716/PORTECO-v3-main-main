# PortEco Guvenlik Audit Raporu

**Tarih:** 2026-04-17  
**Auditor:** Claude Code AI Security Audit  
**Kapsam:** PORTECO-v3 kod tabani + Supabase yapilandirmasi  
**Site:** https://ecoenerji.net.tr/  
**Tech Stack:** React 18 + Vite 7, Supabase (Auth + PostgreSQL + Edge Functions), Node.js cron scriptleri

---

## Yonetici Ozeti

| Metrik | Deger |
|--------|-------|
| Toplam bulgu sayisi | **27** |
| KRITIK | **6** |
| YUKSEK | **8** |
| ORTA | **8** |
| DUSUK | **5** |

**En acil eylem gereken bulgular:**
1. `intake_forms.osos_sifre` duz metin saklanmasi
2. `FORCE ROW LEVEL SECURITY` hicbir tabloda aktif degil
3. `notification_events` ve `user_integrations` tablolari icin RLS durumu dogrulanamadi
4. Email dogrulama devre disi + zayif sifre politikasi
5. 13 npm dependency acikligi (9 high, 4 moderate)
6. Web guvenlik header'lari tamamen eksik

---

## ALAN 1: Git Gecmisinde Sizan Gizli Anahtarlar

**Seviye:** DUSUK  
**Dosya(lar):** `.env`, `.gitignore`

### Kontrol Sonuclari

| Kontrol | Sonuc | Durum |
|---------|-------|-------|
| `.env` git'te takip ediliyor mu? | `git log --all --oneline -- .env` => bos sonuc | GECTI |
| `.gitignore`'da `.env` var mi? | `.gitignore` satir 10: `.env` | GECTI |
| `service_role` git gecmisinde sizmis mi? | Sadece migration yorum satirinda (commit `03dc91f`, `20260326_003_create_ges_satis_hakki.sql` satir 23: "yazma sadece service_role ile") | GECTI |
| `ILETIMERKEZI` git gecmisinde var mi? | Sadece `docs/porteco-01-genel-mimari.md` dokumantasyonunda (deger yok, sadece isim) | GECTI |
| `RESEND_API_KEY` git gecmisinde var mi? | Sadece `docs/porteco-01-genel-mimari.md` dokumantasyonunda (deger yok, sadece isim) | GECTI |
| `EPIAS_PASSWORD` git gecmisinde var mi? | Bulunamadi | GECTI |

### Kanitlar

```bash
$ git log --all --oneline -- .env
# (bos — hic commit edilmemis)

$ git log --all -p -S "service_role" -- .
# Sadece migration dosyasindaki yorum satiri:
# "-- RLS: kullanıcı kendi kaydını okuyabilir, yazma sadece service_role ile"
```

### Degerlendirme

`.env` dosyasi git gecmisinde hicbir zaman commit edilmemis — bu iyi bir pratik. Ancak `.env` dosyasinin repo dizininde acik metin olarak bulunmasi, lokal erisimi olan herkesin tum secret'lara ulasabilecegi anlamina gelir. Secret'larin bir secret manager (Supabase Secrets, Vault, vb.) ile yonetilmesi onerilir.

### Duzeltme

1. `.env` dosyasinin icerigi zaten korunuyor ancak ek onlem olarak:
   - Tum gelistiriciler icin `.env.example` sablonu olusturun (degerler olmadan)
   - CI/CD ortaminda secret'lari environment variable olarak yonetin
   - Pre-commit hook ile secret scanning ekleyin (`git-secrets` veya `detect-secrets`)

---

## ALAN 2: Environment Degiskenleri ve Client-Side Sizdirma

**Seviye:** DUSUK  
**Dosya(lar):** `src/lib/supabase.ts`, `scripts/reactive-alerts.ts`, `supabase/functions/reactive-alerts/index.ts`, `supabase/functions/contact-notify/index.ts`

### Frontend (import.meta.env) Kullanimi

| Dosya | Satir | Degisken | Tarayiciya acik mi? |
|-------|-------|----------|---------------------|
| `src/lib/supabase.ts` | 4 | `VITE_SUPABASE_URL` | Evet (beklenen) |
| `src/lib/supabase.ts` | 5 | `VITE_SUPABASE_ANON` | Evet (beklenen) |

**OLUMLU:** `SB_SERVICE_ROLE_KEY` frontend kodunda **hicbir yerde** referans edilmiyor. Service role key sadece backend scriptlerinde ve Edge Function'larda kullaniliyor.

### Backend Scripts (process.env) Kullanimi

| Dosya | Satirlar | Degiskenler |
|-------|----------|-------------|
| `scripts/reactive-alerts.ts` | 9-18 | `VITE_SUPABASE_URL`, `SB_SERVICE_ROLE_KEY`, `SMS_PROVIDER`, `SMS_SENDER`, `ILETIMERKEZI_KEY`, `ILETIMERKEZI_HASH`, `RESEND_API_KEY`, `RESEND_FROM` |
| `scripts/test-sms.ts` | 5-7 | `ILETIMERKEZI_KEY`, `ILETIMERKEZI_HASH`, `SMS_SENDER` |
| `scripts/test-email.ts` | 5-6 | `RESEND_API_KEY`, `RESEND_FROM` |

### Edge Functions (Deno.env.get) Kullanimi

| Dosya | Satirlar | Degiskenler |
|-------|----------|-------------|
| `supabase/functions/reactive-alerts/index.ts` | 5-15 | `SB_URL`, `SB_SERVICE_ROLE_KEY`, `CRON_TOKEN`, `RESEND_API_KEY`, `RESEND_FROM`, `SMS_PROVIDER`, `SMS_SENDER`, `ILETIMERKEZI_KEY`, `ILETIMERKEZI_HASH` |
| `supabase/functions/contact-notify/index.ts` | 39-41, 70-72 | `ILETIMERKEZI_KEY`, `ILETIMERKEZI_HASH`, `SMS_SENDER`, `SB_URL`/`SUPABASE_URL`, `SB_SERVICE_ROLE_KEY`/`SUPABASE_SERVICE_ROLE_KEY` |

### CRON_TOKEN Guvenligi

```typescript
// supabase/functions/reactive-alerts/index.ts:155
if ((req.headers.get("x-cron-token") ?? "") !== CRON_TOKEN) {
  return new Response("Forbidden", { status: 403 });
}
```

**Degerlendirme:** Token karsilastirmasi `!==` (strict equality) ile yapiliyor. Bu timing-safe degil ama pratik risk dusuk. Ancak token brute-force'a karsi koruma (rate limiting) mevcut degil.

### vite.config.ts Analizi

`vite.config.ts`'de `define` ile ek degisken acilamasi **bulunmadi**. Sadece path alias'lari tanimli.

### Duzeltme

1. CRON_TOKEN dogrulamasi icin timing-safe karsilastirma kullanin:
```typescript
import { timingSafeEqual } from "node:crypto";
const a = new TextEncoder().encode(req.headers.get("x-cron-token") ?? "");
const b = new TextEncoder().encode(CRON_TOKEN);
if (a.length !== b.length || !timingSafeEqual(a, b)) {
  return new Response("Forbidden", { status: 403 });
}
```

---

## ALAN 3: Supabase RLS (Row Level Security) Kapsamli Analiz

**Seviye:** KRITIK  
**Dosya(lar):** `supabase/migrations/*.sql` (29 dosya)

### Tablo RLS Durumu Tablosu

| Tablo | RLS Aktif | FORCE RLS | SELECT | INSERT | UPDATE | DELETE |
|-------|-----------|-----------|--------|--------|--------|--------|
| `user_phone_numbers` | Evet | HAYIR | Kullanici: kendi kayitlari, Admin: tumu | Kullanici: kendi | Kullanici: kendi | Kullanici: kendi |
| `sms_logs` | Evet | HAYIR | Kullanici: kendi, Admin: tumu | Yok (service_role) | — | — |
| `user_emails` | Evet | HAYIR | Kullanici: kendi, Admin: tumu | Kullanici: kendi | Kullanici: kendi | Kullanici: kendi |
| `email_logs` | Evet | HAYIR | Kullanici: kendi, Admin: tumu | Yok (service_role) | — | — |
| `contact_messages` | Evet | HAYIR | Admin: tumu | Herkes (anonim) | Admin: tumu | — |
| `intake_forms` | Evet | HAYIR | Admin: tumu | Herkes (anonim) | Admin: tumu | — |
| `reactive_alert_state` | Evet | HAYIR | Kullanici: kendi, Admin: tumu | — | Admin: tumu | — |
| `ges_providers` | Evet | HAYIR | Herkes (public read) | Admin: tumu | Admin: tumu | Admin: tumu |
| `ges_credentials` | Evet | HAYIR | Kullanici: kendi, Admin: tumu | Kullanici: kendi | Admin: tumu | — |
| `ges_plants` | Evet | HAYIR | Kullanici: kendi, Admin: tumu | Admin: tumu | Admin: tumu | Admin: tumu |
| `ges_production_daily` | Evet | HAYIR | Kullanici: kendi plant'lari (JOIN), Admin: tumu | Admin: tumu | Admin: tumu | Admin: tumu |
| `ges_production_hourly` | Evet | HAYIR | Kullanici: kendi plant'lari (JOIN), Admin: tumu | Admin: tumu | Admin: tumu | Admin: tumu |
| `ges_snapshot` | Evet | HAYIR | Kullanici: kendi, Admin: tumu | Admin: tumu | Admin: tumu | Admin: tumu |
| `ges_sync_log` | Evet | HAYIR | Admin: tumu | Admin: tumu | Admin: tumu | Admin: tumu |
| `ges_satis_hakki` | Evet | HAYIR | Kullanici: kendi, Admin: tumu | Admin: tumu | Admin: tumu | — |
| `notification_events` | **BILINMIYOR** | **BILINMIYOR** | **BILINMIYOR** | **BILINMIYOR** | **BILINMIYOR** | **BILINMIYOR** |
| `user_integrations` | **BILINMIYOR** | **BILINMIYOR** | **BILINMIYOR** | **BILINMIYOR** | **BILINMIYOR** | **BILINMIYOR** |

### KRITIK Bulgular

#### 3.1 — FORCE ROW LEVEL SECURITY Hicbir Tabloda Aktif Degil

**Seviye:** KRITIK

`FORCE ROW LEVEL SECURITY` komutu olmadan, tablo sahibi (owner) rolundeki sorgular RLS politikalarini bypass eder. Eger herhangi bir SQL injection veya privilege escalation olusursa, RLS korumalari gecersiz kalir.

**Duzeltme SQL'i:**
```sql
-- TUM tablolar icin FORCE RLS ekleyin
ALTER TABLE public.user_phone_numbers FORCE ROW LEVEL SECURITY;
ALTER TABLE public.sms_logs FORCE ROW LEVEL SECURITY;
ALTER TABLE public.user_emails FORCE ROW LEVEL SECURITY;
ALTER TABLE public.email_logs FORCE ROW LEVEL SECURITY;
ALTER TABLE public.contact_messages FORCE ROW LEVEL SECURITY;
ALTER TABLE public.intake_forms FORCE ROW LEVEL SECURITY;
ALTER TABLE public.reactive_alert_state FORCE ROW LEVEL SECURITY;
ALTER TABLE public.ges_providers FORCE ROW LEVEL SECURITY;
ALTER TABLE public.ges_credentials FORCE ROW LEVEL SECURITY;
ALTER TABLE public.ges_plants FORCE ROW LEVEL SECURITY;
ALTER TABLE public.ges_production_daily FORCE ROW LEVEL SECURITY;
ALTER TABLE public.ges_production_hourly FORCE ROW LEVEL SECURITY;
ALTER TABLE public.ges_snapshot FORCE ROW LEVEL SECURITY;
ALTER TABLE public.ges_sync_log FORCE ROW LEVEL SECURITY;
ALTER TABLE public.ges_satis_hakki FORCE ROW LEVEL SECURITY;
```

#### 3.2 — notification_events Tablosu: Migration Dosyasi Yok

**Seviye:** KRITIK

`notification_events` tablosu admin panelinde referans ediliyor (`src/pages/admin/NotificationEventsAdmin.tsx`) ancak `supabase/migrations/` dizininde bu tablo icin hicbir migration dosyasi bulunamadi. Bu tablo muhtemelen Supabase Dashboard'dan manual olarak olusturulmus.

**Risk:** RLS durumu dogrulanamaz. Eger RLS aktif degilse, anon key ile tum bildirim olaylarina erisilebilir.

**Duzeltme:**
```sql
-- notification_events icin RLS dogrulayin ve migration olusturun
ALTER TABLE public.notification_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_events FORCE ROW LEVEL SECURITY;

CREATE POLICY "users_select_own_notification_events"
  ON public.notification_events FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "admins_select_all_notification_events"
  ON public.notification_events FOR SELECT
  USING ((auth.jwt() -> 'app_metadata' ->> 'is_admin')::boolean = true);
```

#### 3.3 — user_integrations Tablosu: Migration Dosyasi Yok

**Seviye:** KRITIK

`user_integrations` tablosu Edge Function'da referans ediliyor (`supabase/functions/reactive-alerts/index.ts:162`) ancak migration dosyasi yok.

**Risk:** Bir kullanici baskasinni entegrasyon bilgisini (aril_user, vb.) gorebilir.

**Duzeltme:**
```sql
ALTER TABLE public.user_integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_integrations FORCE ROW LEVEL SECURITY;

CREATE POLICY "users_select_own_integrations"
  ON public.user_integrations FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "users_update_own_integrations"
  ON public.user_integrations FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "admins_all_integrations"
  ON public.user_integrations FOR ALL
  USING ((auth.jwt() -> 'app_metadata' ->> 'is_admin')::boolean = true);
```

#### 3.4 — contact_messages: Anonim INSERT Spam Riski

**Seviye:** YUKSEK

```sql
-- supabase/migrations/20260205_001_create_contact_messages.sql
CREATE POLICY "anyone_can_insert_contact"
  ON public.contact_messages FOR INSERT
  WITH CHECK (true);
```

Herhangi bir kimlik dogrulamasi veya CAPTCHA olmadan sinirsiz mesaj gonderilebilir. Her mesaj `contact-notify` Edge Function'i tetikleyerek SMS gonderir — bu hem SMS maliyeti hem de spam riski olusturur.

**Duzeltme:** Supabase config'de CAPTCHA aktif edin veya Edge Function'da rate limiting ekleyin.

#### 3.5 — intake_forms: Anonim INSERT + OSOS Sifreleri Duz Metin

**Seviye:** KRITIK

```sql
-- supabase/migrations/20260403_002_create_intake_forms.sql
osos_sifre text not null,
...
CREATE POLICY "Anyone can submit intake form"
  ON public.intake_forms FOR INSERT
  WITH CHECK (true);
```

Anonim kullanicilar OSOS kullanici adi ve sifresini gonderebilir. Bu sifreler **duz metin** olarak saklanir. Rate limit yok.

#### 3.6 — ges_credentials: password_enc Alani

**Seviye:** ORTA

```sql
-- supabase/migrations/20260221_002_create_ges_credentials.sql
password_enc    text not null,  -- şifrelenmiş
```

Alan adi `password_enc` ve yorum "sifrelenmis" diyor. Sifreleme yontemi kod tabanindan dogrulanamadi (muhtemelen uygulama katmaninda). RLS dogru yapilandirilmis — kullanici sadece kendi kayitlarini gorebilir.

---

## ALAN 4: Admin Yetkilendirme Guvenligi

**Seviye:** DUSUK  
**Dosya(lar):** `src/components/auth/AdminRoute.tsx`, `src/hooks/useIsAdmin.ts`, `src/components/admin/TableManager.tsx`

### Analiz

**Client-Side Kontrol:**
```typescript
// src/hooks/useIsAdmin.ts:6
const isAdmin = !!session?.user?.app_metadata?.is_admin;
```

```typescript
// src/components/auth/AdminRoute.tsx:6-9
const { isAdmin, loading } = useIsAdmin();
if (loading) return <div>...</div>;
if (!isAdmin) return <Navigate to="/dashboard" replace />;
```

**Backend (RLS) Kontrol:**
```sql
-- Tum admin politikalarinda kullanilan pattern:
(auth.jwt() -> 'app_metadata' ->> 'is_admin')::boolean = true
```

### Guvenlik Degerlendirmesi

| Soru | Cevap | Durum |
|------|-------|-------|
| Admin kontrolu sadece client-side mi? | Hayir — RLS backend'de de kontrol ediyor | GECTI |
| `app_metadata` kullanici tarafindan degistirilebilir mi? | Hayir — Supabase'de `app_metadata` sadece `service_role` ile degistirilebilir | GECTI |
| `user_metadata` yerine `app_metadata` mi kullaniliyor? | Evet — dogru tercih | GECTI |
| JWT manipulasyonu ile admin olunabilir mi? | Hayir — JWT Supabase tarafindan imzalaniyor, istemci degistiremez | GECTI |

### TableManager.tsx CRUD Guvenligi

`TableManager.tsx` admin CRUD operasyonlari icin Supabase client kullanir. Ek yetki kontrolu frontend'de yapilmaz, ancak RLS politikalari backend'de kontrol saglar. Bu kabul edilebilir bir mimari.

### Duzeltme

Admin yetkilendirme mimarisi **dogru ve guvenli**. Ek oneri:
- Admin islemlerinin audit loglanmasi (kim, ne zaman, ne yapti)
- Admin hesaplari icin MFA zorunlulugu

---

## ALAN 5: Frontend Guvenligi (XSS, Injection, IDOR)

**Seviye:** ORTA  
**Dosya(lar):** `src/pages/BlogDetailPage.tsx`, `src/pages/InvoiceSnapshotDetail.tsx`, `src/pages/IntakeFormPage.tsx`

### 5.1 — dangerouslySetInnerHTML

**Sonuc:** Kod tabaninda `dangerouslySetInnerHTML` **KULLANILMIYOR**. Bu onemli bir olumlu bulgu.

### 5.2 — Blog Icerik Render

```typescript
// src/pages/BlogDetailPage.tsx:2
import ReactMarkdown from "react-markdown";
```

Blog icerigi `react-markdown` ile render ediliyor. `react-markdown` varsayilan olarak raw HTML'i render etmez, bu nedenle XSS riski **dusuk**. Ancak `remark-gfm` eklentisi ile genisletilmis markdown kullaniliyor — bu ek saldiri yuzeyine dikkat edilmeli.

**Ek bilgi:** Blog icerigi `src/content/blog.ts`'den statik olarak geliyor (veritabanindan degil), bu da XSS riskini daha da azaltir.

### 5.3 — URL Parametre Kullanimi

```typescript
// src/pages/InvoiceSnapshotDetail.tsx:28-31
const params = useParams();
const sub = Number(params.sub);
const year = Number(params.year);
const month = Number(params.month);
```

URL parametreleri `Number()` ile donusturuluyor. `Number("malicious-input")` => `NaN` dondurecegi icin injection riski dusuk. Ancak `NaN` degerlerin sorguya gitmesi beklenmedik sonuclar olusturabilir.

```typescript
// src/pages/BlogDetailPage.tsx:39-40
const { slug } = useParams();
const post = BLOG_POSTS.find((p) => p.slug === slug);
```

Blog slug'i statik array'de aranir — injection riski yok.

### 5.4 — localStorage Manipulasyonu

```typescript
// src/pages/Dashboard.tsx:37 (yaklanik)
localStorage.getItem("eco_selected_sub")
```

`eco_selected_sub` degeri localStorage'da saklanir. Bir saldirgan bu degeri degistirebilir, ancak:
- Supabase sorgulari `auth.uid()` ile filtrelenir (RLS)
- Baska bir kullanicinin subscription_serno'sunu girmek RLS nedeniyle bos sonuc dondurecektir

**Risk:** DUSUK — RLS koruyor.

### 5.5 — Form Input Sanitization

```typescript
// src/components/forms/LeadForm.tsx:59
`[${featureTitle}] ${form.message.trim()}`
```

Form verileri `.trim()` ile temizleniyor ancak HTML escape veya XSS korumasii yapilmiyor. Veri Supabase'e kaydediliyor ve admin panelinde goruntuleniyor. React otomatik olarak JSX icerisinde string'leri escape eder, bu nedenle XSS riski dusuk — **ancak sadece `dangerouslySetInnerHTML` kullanilmadigi surece**.

### Duzeltme

1. `InvoiceSnapshotDetail.tsx`'de `NaN` kontrolu ekleyin:
```typescript
if (isNaN(sub) || isNaN(year) || isNaN(month)) {
  return <Navigate to="/dashboard" replace />;
}
```

---

## ALAN 6: API ve Endpoint Guvenligi

**Seviye:** YUKSEK  
**Dosya(lar):** `supabase/functions/reactive-alerts/index.ts`, `supabase/functions/contact-notify/index.ts`, `supabase/config.toml`

### 6.1 — Supabase PostgREST Endpoint

Anon key ile erisim RLS politikalarina tabidir. Yukaridaki RLS analizine gore cogu tablo korunuyor. Ancak `notification_events` ve `user_integrations` tablolarinin RLS durumu bilinmiyor — bu tablolara anon key ile erisim mumkun olabilir.

### 6.2 — Edge Function: reactive-alerts

```typescript
// supabase/functions/reactive-alerts/index.ts:155
if ((req.headers.get("x-cron-token") ?? "") !== CRON_TOKEN) {
  return new Response("Forbidden", { status: 403 });
}
```

| Kontrol | Sonuc |
|---------|-------|
| Token dogrulamasi var mi? | Evet |
| Timing-safe mi? | Hayir (string ===) |
| Rate limiting var mi? | Hayir |
| Token brute-force korunmasi? | Hayir |

### 6.3 — Edge Function: contact-notify

**Seviye:** YUKSEK

```typescript
// supabase/functions/contact-notify/index.ts:14-18
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
```

CORS `*` olarak ayarli — herhangi bir domain'den istek gonderilebilir. Bu Edge Function SMS gonderimi tetiklediginden, CORS kisitlanmalidir.

### 6.4 — Login Rate Limiting

```toml
# supabase/config.toml:184
sign_in_sign_ups = 30  # 5 dakikada IP basina
```

Rate limiting mevcut ancak bu ayar sadece **lokal gelistirme** icin. Production Supabase instance'indaki ayarlar Supabase Dashboard'dan kontrol edilmeli.

### 6.5 — Signup Durumu

```toml
# supabase/config.toml:163
enable_signup = true
enable_anonymous_sign_ins = false
```

Signup acik. Email dogrulama kapali (`enable_confirmations = false`). Istenmeyen kullanici kaydi mumkun.

### Duzeltme

1. `contact-notify` CORS'u kisitlayin:
```typescript
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "https://ecoenerji.net.tr",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
```
2. Production Supabase Dashboard'dan rate limiting ayarlarini dogrulayin.
3. CAPTCHA aktif edin (hCaptcha veya Turnstile).
4. Email dogrulamayi aktif edin.

---

## ALAN 7: Ucuncu Parti API Entegrasyonlari

**Seviye:** KRITIK  
**Dosya(lar):** `supabase/migrations/20260403_002_create_intake_forms.sql`, `supabase/migrations/20260221_002_create_ges_credentials.sql`, `scripts/reactive-alerts.ts`

### 7.1 — sync_aril.js, sync_epias_ptf.js, sync_growatt.js

**Sonuc:** Bu dosyalar repo'da **BULUNAMADI**. Muhtemelen ayri bir ortamda veya baska bir repo'da yonetiliyorlar. Bu alanda guvenlik analizi yapilamadi.

### 7.2 — ges_credentials: Growatt Credential'lari

```sql
-- supabase/migrations/20260221_002_create_ges_credentials.sql:12
password_enc    text not null,  -- şifrelenmiş
api_token       text,           -- Provider API token
```

- `password_enc`: Alan adi ve yorum "sifrelenmis" gosteriyor. Sifreleme yontemi uygulama katmaninda.
- `api_token`: Duz metin olarak saklaniyor.
- RLS: Kullanici sadece kendi kayitlarini gorebilir (`auth.uid() = user_id`).

**Risk:** Sifreleme anahtarinin nerede ve nasil yonetildigi bilinmiyor. Eger anahtar kaybolursa veriler okunamaz hale gelir.

### 7.3 — intake_forms: OSOS Sifreleri DUZ METIN

**Seviye:** KRITIK

```sql
-- supabase/migrations/20260403_002_create_intake_forms.sql:10
osos_sifre text not null,
```

OSOS (enerji dagitim sirketleri) kullanici sifreleri **duz metin** olarak saklanir. Bu tablo anonim INSERT'e acik. Eger veritabani ihlal edilirse, tum musteri OSOS sifreleri acinir.

**Duzeltme:**
```sql
-- Mevcut duz metin sifreleri sifreleyin
-- Uygulama katmaninda pgcrypto veya Supabase Vault kullanin:
ALTER TABLE public.intake_forms
  ADD COLUMN osos_sifre_enc text;

-- Sonra duz metin sutununu kaldirin:
-- ALTER TABLE public.intake_forms DROP COLUMN osos_sifre;
```

### 7.4 — Ileti Merkezi SMS API

```typescript
// scripts/reactive-alerts.ts:107-116 (yaklasik)
url.searchParams.set("key", ILETIM_KEY);
url.searchParams.set("hash", ILETIM_HASH);
```

API credential'lari GET parametresi olarak gonderiliyor. Bu, proxy cache'lerinde ve log dosyalarinda credential'larin gorunmesine neden olabilir.

**Duzeltme:** Ileti Merkezi API POST endpoint'ini kullanin.

### 7.5 — Resend Email API

API key `process.env.RESEND_API_KEY` ile guvenli bir sekilde yonetiliyor. `Authorization: Bearer` header'i ile gonderiliyor — bu dogru bir pratik.

---

## ALAN 8: Dependency ve Supply Chain Guvenligi

**Seviye:** YUKSEK  
**Dosya(lar):** `package.json`, `package-lock.json`

### npm audit Sonuclari

**Toplam: 13 guvenlik acigi (9 high, 4 moderate)**

| Paket | Seviye | Aciklama | Duzeltme |
|-------|--------|----------|----------|
| `react-router` 7.0.0-7.12.0 | **HIGH** | CSRF, XSS via Open Redirects, SSR XSS, Unexpected external redirect (5 CVE) | `npm audit fix` |
| `xlsx` * | **HIGH** | Prototype Pollution + ReDoS | **Duzeltme YOK** — alternatif paket gerekli |
| `rollup` 4.0.0-4.58.0 | **HIGH** | Arbitrary File Write via Path Traversal | `npm audit fix` |
| `vite` (coklu CVE) | **HIGH** | Path Traversal, fs.deny bypass, WebSocket file read | `npm audit fix` |
| `flatted` <=3.4.1 | **HIGH** | Unbounded recursion DoS + Prototype Pollution | `npm audit fix` |
| `minimatch` <=3.1.3 | **HIGH** | ReDoS (3 CVE) | `npm audit fix` |
| `picomatch` <=2.3.1 | **HIGH** | Method Injection + ReDoS | `npm audit fix` |
| `tar` <=7.5.10 | **HIGH** | Arbitrary File Creation/Overwrite (6 CVE) | `npm audit fix` |
| `ajv` <6.14.0 | MODERATE | ReDoS | `npm audit fix` |
| `brace-expansion` <1.1.13 | MODERATE | Process hang via zero-step sequence | `npm audit fix` |
| `js-yaml` 4.0.0-4.1.0 | MODERATE | Prototype Pollution | `npm audit fix` |

### Kritik Dependency Versiyonlari

| Paket | Mevcut | Guncel? | Not |
|-------|--------|---------|-----|
| `@supabase/supabase-js` | ^2.57.4 | Kontrol edilmeli | |
| `vite` | ^7.1.0 | Guvenlik aciklari mevcut | Guncelle |
| `react` | ^18.3.1 | Guncel | |
| `react-dom` | ^18.3.1 | Guncel | |
| `react-router-dom` | ^7.8.0 | 5 CVE mevcut | **Acil guncelle** |
| `xlsx` | ^0.18.5 | Duzeltme yok | **Alternatif kullan** |
| `dayjs` | ^1.11.18 | Guncel | |

### Duzeltme

1. **Acil:** `npm audit fix` calistirin (cogu sorun otomatik cozulecek)
2. **xlsx paketi:** `xlsx` paketinin duzeltmesi yok. Alternatif olarak `exceljs` veya `sheetjs-ce` (community edition) kullanin.
3. **react-router-dom:** v7.12.1+ surumune guncelleyin.

---

## ALAN 9: Deployment ve Infrastructure Guvenligi

**Seviye:** ORTA  
**Dosya(lar):** `.github/workflows/` (BULUNAMADI)

### Analiz

`.github/workflows/` dizini repo'da **mevcut degil**. Bu su anlamlara gelebilir:
- CI/CD baska bir platformda yonetiliyor (Vercel, Netlify, vb.)
- Manuel deployment yapiliyor
- Workflow dosyalari baska bir branch'te

### Degerlendirme

| Kontrol | Sonuc |
|---------|-------|
| GitHub Actions workflow dosyalari | BULUNAMADI |
| Self-hosted runner guvenligi | Degerlendirilemedi |
| `aril_sync_5min.yml` | BULUNAMADI |
| Workflow'larda SHA pinning | Degerlendirilemedi |

### Duzeltme

1. CI/CD pipeline'inin nerede yonetildigini dogrulayin.
2. Eger GitHub Actions kullaniliyorsa:
   - `actions/checkout` gibi action'lari SHA ile pin'leyin
   - Self-hosted runner'larda izolasyon saglayin
   - Secret'lari GitHub Secrets ile yonetin

---

## ALAN 10: Supabase Konfigurasyonu Guvenligi

**Seviye:** YUKSEK  
**Dosya(lar):** `supabase/config.toml`

### Konfigurasyion Analizi

| Ayar | Deger | Degerlendirme |
|------|-------|---------------|
| JWT Expiry | 3600s (1 saat) | UYGUN |
| Refresh Token Rotation | `true` | UYGUN |
| Refresh Token Reuse Interval | 10s | UYGUN |
| `enable_signup` | `true` | DİKKAT — kayit acik |
| `enable_anonymous_sign_ins` | `false` | UYGUN |
| `enable_confirmations` | **`false`** | SORUNLU — email dogrulama kapali |
| `secure_password_change` | `false` | SORUNLU — reauth gerektirmiyor |
| `minimum_password_length` | **6** | SORUNLU — cok kisa |
| `password_requirements` | **`""`** (bos) | SORUNLU — hicbir gereksinim yok |
| CAPTCHA | Devre disi | SORUNLU — bot korumasii yok |
| MFA | Yapilandirilmamis | SORUNLU |
| Max Rows | 1000 | UYGUN |
| Email max_frequency | `1s` | SORUNLU — cok sik gonderilebilir |

### KRITIK: Email Dogrulama Kapali

```toml
# supabase/config.toml:203
enable_confirmations = false
```

Kullanicilar email dogrulamasi olmadan kayit olabilir. Bu, sahte email'lerle hesap olusturulmasina izin verir.

### KRITIK: Zayif Sifre Politikasi

```toml
# supabase/config.toml:169-172
minimum_password_length = 6
password_requirements = ""
```

6 karakterlik, hicbir karmasiklik gereksinimi olmayan sifreler kabul edilir. "123456" gibi sifreler gecerli.

### Duzeltme

```toml
# supabase/config.toml guncellemeleri:

# Email dogrulamayi aktif edin
enable_confirmations = true

# Sifre politikasini gucendirin
minimum_password_length = 8
password_requirements = "lower_upper_letters_digits"

# Sifre degisikliginde reauth zorunlu
secure_password_change = true

# CAPTCHA aktif edin
[auth.captcha]
enabled = true
provider = "turnstile"
secret = "env(TURNSTILE_SECRET)"

# Email gonderim frekansini sinirlayin
max_frequency = "60s"
```

**NOT:** `supabase/config.toml` sadece lokal gelistirme icin kullanilir. Production ayarlari Supabase Dashboard'dan yapilmalidir. Dashboard'daki ayarlarin da kontrol edilmesi gerekir.

---

## ALAN 11: Veri Gizliligi ve KVKK Uyumu

**Seviye:** YUKSEK  
**Dosya(lar):** Coklu migration ve frontend dosyalari

### Kisisel Veri Haritalamasi

| Tablo | Kisisel Veri | Hassasiyet |
|-------|-------------|------------|
| `auth.users` | Email, sifre hash | Yuksek |
| `user_phone_numbers` | Telefon numarasi | Yuksek |
| `user_emails` | Email adresleri | Yuksek |
| `intake_forms` | Ad, soyad, telefon, firma, **OSOS sifre (duz metin)** | **Kritik** |
| `contact_messages` | Ad, email, telefon, mesaj | Yuksek |
| `ges_credentials` | GES saglayici kullanici adi, sifre (enc), API token | Yuksek |
| `user_integrations` | ARIL kullanici bilgisi | Orta |
| `sms_logs` | Telefon numarasi, mesaj icerigi | Yuksek |
| `email_logs` | Email adresi, mesaj icerigi | Yuksek |

### KVKK Uyum Eksiklikleri

| Gereksinim | Durum | Detay |
|------------|-------|-------|
| Veri isleme envanteri | EKSIK | Hangi verilerin neden toplandigi belgelenmemis |
| Erisim loglama (audit trail) | EKSIK | Kim hangi veriye ne zaman eristigi loglanmiyor |
| Veri silme mekanizmasi | KISMI | `ON DELETE CASCADE` mevcut ama kullanici hesap silme UI'i kontrol edilmeli |
| Veri saklama suresi | EKSIK | `sms_logs` ve `email_logs` icin retention policy yok |
| 3. parti sifreler | SORUNLU | `intake_forms.osos_sifre` duz metin, `ges_credentials.api_token` duz metin |
| Acik riza | KONTROL EDILMELI | Formlar KVKK bilgilendirmesi iceriyor mu? |

### Console.log ile Hassas Veri

```typescript
// src/lib/supabase.ts:9
console.error("[ENV CHECK] VITE_SUPABASE_URL?", !!url, " VITE_SUPABASE_ANON?", !!anon);
```

Bu satir sadece boolean degerleri basildigindan guvenli. Ancak diger console.error kullaanimlari:

```typescript
// src/pages/Login.tsx:27
console.error(error);  // Supabase auth error objesi — stack trace icerebilir
```

```typescript
// src/components/forms/LeadForm.tsx:78
console.error("SMS notify failed:", err);  // Hata detaylari
```

### Edge Function Hata Sizdirmasi

```typescript
// supabase/functions/contact-notify/index.ts:99
return new Response(
  JSON.stringify({ error: (err as Error).message }),
  { status: 500, ... }
);
```

Hata mesajlari dogrudan istemciye iletiliyor — veritabani hatalari, API hatalari, vb. bilgi sizdirebilir.

### Duzeltme

1. `intake_forms.osos_sifre` sifreleyin (Alan 7'deki oneriye bakin)
2. `ges_credentials.api_token` sifreleyin
3. Audit trail sistemi kurun (Supabase Audit Log veya ozel tablo)
4. `sms_logs` ve `email_logs` icin 90 gunluk retention policy olusturun
5. Production build'lerde `console.error` cagrilarini kaldiriniz veya redact edin
6. Edge Function'lardan genel hata mesajlari dondur:
```typescript
return new Response(
  JSON.stringify({ error: "Islem sirasinda bir hata olustu." }),
  { status: 500, ... }
);
```

---

## ALAN 12: Web Guvenlik Headerlari ve HTTPS

**Seviye:** YUKSEK  
**Dosya(lar):** `index.html`

### Analiz

| Dosya | Aranadi | Bulundu |
|-------|---------|---------|
| `vercel.json` | Evet | BULUNAMADI |
| `netlify.toml` | Evet | BULUNAMADI |
| `_headers` | Evet | BULUNAMADI |
| nginx config | Evet | BULUNAMADI |
| `index.html` CSP meta tag | Evet | BULUNAMADI |

### index.html Incelemesi

```html
<!-- index.html — tam dosya -->
<!doctype html>
<html lang="tr">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <link href="https://fonts.googleapis.com/css2?family=Inter:..." rel="stylesheet">
  <link rel="icon" type="image/png" href="/favicon-32x32.png">
  <title>ECO Enerji</title>
</head>
<body>
  <div id="root"></div>
  <script type="module" src="/src/main.tsx"></script>
</body>
</html>
```

**Eksik Guvenlik Header'lari:**

| Header | Durum | Risk |
|--------|-------|------|
| Content-Security-Policy (CSP) | EKSIK | XSS saldirilarini engellemez |
| X-Frame-Options | EKSIK | Clickjacking saldirilarına acik |
| X-Content-Type-Options | EKSIK | MIME sniffing riski |
| Strict-Transport-Security (HSTS) | EKSIK | HTTP downgrade saldirilari |
| Referrer-Policy | EKSIK | Referer bilgi sizdirma |
| Permissions-Policy | EKSIK | Browser API kotu kullanimi |

### Duzeltme

**Secenek 1: Hosting platformunda header ekleyin**

Vercel icin `vercel.json`:
```json
{
  "headers": [
    {
      "source": "/(.*)",
      "headers": [
        { "key": "X-Frame-Options", "value": "DENY" },
        { "key": "X-Content-Type-Options", "value": "nosniff" },
        { "key": "Referrer-Policy", "value": "strict-origin-when-cross-origin" },
        { "key": "Permissions-Policy", "value": "camera=(), microphone=(), geolocation=()" },
        { "key": "Strict-Transport-Security", "value": "max-age=31536000; includeSubDomains" },
        {
          "key": "Content-Security-Policy",
          "value": "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https:; connect-src 'self' https://umckzgfxucdbukbiidbd.supabase.co wss://umckzgfxucdbukbiidbd.supabase.co;"
        }
      ]
    }
  ]
}
```

**Secenek 2: index.html meta tag**
```html
<meta http-equiv="Content-Security-Policy"
  content="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https:; connect-src 'self' https://umckzgfxucdbukbiidbd.supabase.co wss://umckzgfxucdbukbiidbd.supabase.co;">
```

---

## Acil Eylem Plani

Oncelik sirasina gore hemen yapilmasi gerekenler:

### 1. OSOS Sifrelerini Sifreleyin (KRITIK)
- `intake_forms.osos_sifre` sutununu sifreleyin (pgcrypto veya uygulama katmani)
- Mevcut duz metin verileri sifreleyip eski sutunu kaldirin

### 2. FORCE ROW LEVEL SECURITY Ekleyin (KRITIK)
- Tum tablolara `FORCE ROW LEVEL SECURITY` ekleyen migration olusturun
- `notification_events` ve `user_integrations` tablolarinda RLS durumunu Supabase Dashboard'dan dogrulayin

### 3. npm audit fix Calistirin (YUKSEK)
- `npm audit fix` ile cozulebilen aciklari giderin
- `xlsx` paketini `exceljs` veya `sheetjs-ce` ile degistirin
- `react-router-dom`'u v7.12.1+ surumune guncelleyin

### 4. Email Dogrulama ve Sifre Politikasi (YUKSEK)
- Supabase Dashboard'dan `enable_confirmations = true` yapin
- `minimum_password_length = 8`, `password_requirements = "lower_upper_letters_digits"` ayarlayin

### 5. CORS Kisitlamasi (YUKSEK)
- `contact-notify` Edge Function'da CORS origin'i `https://ecoenerji.net.tr` ile sinirlayin

### 6. Guvenlik Header'lari Ekleyin (YUKSEK)
- CSP, X-Frame-Options, HSTS, vb. header'lari hosting platformunda yapilandirin

---

## Orta Vadeli Iyilestirmeler

1. **CAPTCHA Ekleme:** Contact form ve intake form icin Turnstile/hCaptcha aktif edin
2. **Audit Trail:** Admin islemleri ve hassas veri erisimleri icin loglama sistemi kurun
3. **MFA Zorunlulugu:** Admin hesaplari icin cok faktorlu kimlik dogrulama aktif edin
4. **Data Retention Policy:** SMS ve email loglari icin 90 gunluk otomatik silme politikasi
5. **Secret Scanning:** Pre-commit hook ile git-secrets veya detect-secrets entegre edin
6. **CRON_TOKEN Gucendirme:** Timing-safe karsilastirma + istek imzalama ekleyin
7. **Edge Function Hata Yonetimi:** Detayli hata mesajlarini istemciye gondermek yerine loglayin
8. **ges_credentials.api_token:** Duz metin API token'larini sifreleyin

---

## Uzun Vadeli Oneriler

1. **Supabase Vault Kullanimi:** Tum hassas verileri (3. parti sifreler, API token'lar) Vault ile yonetin
2. **Penetrasyon Testi:** Profesyonel bir pentest firmasina duzenli test yaptirin
3. **KVKK Uyum Programi:** Veri isleme envanteri, acik riza mekanizmalari, veri ihlali bildirimi proseduru
4. **Dependency Otomasyonu:** Dependabot veya Renovate ile otomatik dependency guncelleme
5. **WAF (Web Application Firewall):** Cloudflare WAF veya benzeri bir cozum ile uygulama seviyesi koruma
6. **Log Merkezi:** Tum uygulama loglarini merkezi bir log yonetim sistemine gonderin (Datadog, Grafana Loki, vb.)
7. **Incident Response Plani:** Guvenlik ihlali durumunda izlenecek adimlari belgeleyin

---

*Bu rapor, kod tabani uzerinden yapilan statik analiz sonuclarini icerir. Production Supabase Dashboard ayarlari, hosting platform konfigurasyonlari ve ag seviyesi guvenlik onlemleri ayrica denetlenmelidir.*
