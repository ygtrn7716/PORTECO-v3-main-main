# PortEco — Güvenlik Raporu

Bu rapor, PortEco Web ve aril-sync ekosisteminin güvenlik durumunu kaynak kod ve migration dosyalarına göre değerlendirir. Yenileme tarihi: 2026-05-03 (PortEco Web `03aa828`, aril-sync `c3c29d5`).

## 1. RLS Durumu

PostgREST üzerinden anon-key ile erişilen tablolar için Row Level Security şarttır. PortEco bu konuda iki kategoriye ayrılır.

### 1.1 Migration ile Tanımlı RLS

| Tablo | Migration | İçerik |
| --- | --- | --- |
| `ges_providers` | `20260221_007_ges_rls_policies.sql` | Public select; admin all |
| `ges_credentials` | `20260221_007_*.sql` | User self-select/insert; admin all |
| `ges_plants` | `20260221_007_*.sql` | User self-select; admin all |
| `ges_production_daily` | `20260221_007_*.sql` | User select via plant join; admin all |
| `ges_snapshot` | `20260221_007_*.sql` | User select via plant join; admin all |
| `ges_sync_log` | `20260221_007_*.sql` | Admin only |
| `ges_production_hourly` | `20260221_008_create_ges_production_hourly.sql` | Aynı pattern |
| `ges_satis_hakki` | `20260326_004_ges_satis_hakki_admin_policies.sql` | Admin all |
| `intake_forms` | `20260403_002_create_intake_forms.sql` + `20260417_001_rate_limit_public_forms.sql` | Public insert (rate limit + bot trap), admin all |
| `contact_messages` | `20260205_001_*.sql` + `20260417_001_*.sql` | Aynı pattern |

### 1.2 Migration İçermeyen Tablolar (Manuel RLS)

Aşağıdaki tablolar production'da RLS açıktır ancak repo'da migration olarak yer almaz; Supabase Studio üzerinden manuel tanımlanmıştır:

- `subscription_settings`, `subscription_yekdem`, `owner_subscriptions`
- `consumption_hourly`, `consumption_daily`, `demand_monthly`
- `distribution_tariff_official` (genelde public read, admin write)
- `invoice_snapshots`, `invoice_history`, `monthly_overview`
- `epias_ptf_hourly`, `yekdem_official` (genelde public read)
- `posts` (public read for `is_published = true`, admin all)
- `user_integrations`
- `notification_channels`, `notification_events`
- `user_phone_numbers`, `user_emails`
- `sms_logs`, `email_logs`
- `reactive_alert_state`

> Bu durum yeni ortam kurulumlarında risk yaratır: migration dosyaları RLS'siz tablo oluşturur, manuel adım atlanırsa anon-key tablo içeriklerini çekebilir. Önerilen iyileştirme: Tüm RLS policy'lerini `supabase/migrations/` altına taşımak.

### 1.3 Doğrulama

Tüm tabloların `relrowsecurity` durumu Supabase Studio üzerinden veya psql ile aşağıdaki sorguyla kontrol edilebilir:

```sql
SELECT n.nspname AS schema, c.relname AS table, c.relrowsecurity AS rls_enabled
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind = 'r'
ORDER BY c.relname;
```

## 2. Edge Function Güvenliği

### 2.1 `reactive-alerts`

```typescript
if ((req.headers.get("x-cron-token") ?? "") !== CRON_TOKEN) {
  return new Response("Forbidden", { status: 403 });
}
```

- ✅ Header tabanlı doğrulama mevcut.
- ⚠️ Karşılaştırma `===` ile yapılır (string comparison) — **timing-safe değildir**. Saldırgan token uzunluğunu sızdırma teorik olarak mümkündür. Bcrypt veya `crypto.subtle.timingSafeEqual` ile değiştirilmelidir.
- ✅ CORS header'ı yok; yalnızca cron tetikleyiciden çağrılır.

### 2.2 `contact-notify`

```typescript
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "https://ecoenerji.net.tr",
  ...
};
```

- ✅ CORS Origin **`https://ecoenerji.net.tr`** ile sınırlandırılmıştır (önceki sürümde `*` idi). Production domain dışından çağrı kabul edilmez.
- ⚠️ Ancak fonksiyon `record` payload'ını `req.json()` üzerinden okur ve doğrulama yapmaz; cookie veya JWT denetimi yoktur. Supabase webhook'u tarafından çağrılması bekleniyor. Yetkisiz biri Origin spoofing ile çağırırsa SMS atılabilir. Önerilen iyileştirme: Webhook secret ekleyip header'da doğrulamak.
- ✅ SMS log tablosuna her gönderim yazılır; istismar tespit edilebilir.

## 3. CRON_TOKEN Kullanımı

| Yer | Var mı? | Doğrulama |
| --- | --- | --- |
| `supabase/functions/reactive-alerts/index.ts` | ✅ | `x-cron-token` header (timing-unsafe) |
| `scripts/reactive-alerts.ts` | ❌ Token yok | Servis-role key direkt env'den okunur |
| `aril-sync` GitHub Actions | N/A | Service-role key secrets üzerinden |

Cron script'i (`npm run cron:alerts`) doğrudan service-role key kullanır; Edge Function ise CRON_TOKEN doğrulaması gerektirir. İki yol arasında seçim yapılırken bu fark dikkate alınmalıdır.

## 4. Auth Ayarları (Supabase)

Aşağıdakiler Supabase Studio üzerinden manuel ayarlanır; repo'da kayıt yok. Önerilen değerler:

| Ayar | Önerilen | Etki |
| --- | --- | --- |
| `auth.enable_signup` | `false` | Kayıt yalnızca admin tarafından (intake form üzerinden) yapılır |
| `auth.enable_confirmations` | `true` | E-posta doğrulama zorunlu |
| `auth.email_confirm_change` | `true` | E-posta değişiminde doğrulama |
| `auth.security_update_password_require_reauthentication` | `true` | Parola değişiminde mevcut parola gerekli (ProfilePage zaten bu davranışı uygular) |
| `auth.password_min_length` | `>= 8` | Minimum parola uzunluğu |
| `auth.jwt_secret` rotation | Düzenli | JWT signing key'i periyodik döndürülmeli |

## 5. Frontend Env Exposure

Vite, yalnızca `VITE_` ile başlayan env değişkenlerini build çıktısına gömer. `dist/assets/*.js` içinde aşağıdakiler **bulunabilir**:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON`

Bu iki değer **public** kabul edilmelidir. Anon-key sızması RLS bypass riski yaratmaz; ama:

- ⚠️ Anon-key ile erişilen herhangi bir tabloda RLS yoksa veri okunabilir.
- ✅ `SB_SERVICE_ROLE_KEY`, `RESEND_API_KEY`, `ILETIMERKEZI_KEY/HASH`, `CRON_TOKEN` gibi sırlar **`VITE_` ön ekiyle başlamaz**, dolayısıyla istemciye sızmaz. Yalnızca `scripts/` ve `supabase/functions/` çalışma zamanında erişilir.

Doğrulama:

```bash
grep -r "VITE_" src/ | grep -i "ROLE\|KEY\|SECRET\|HASH"
# → Boş çıkmalı
```

## 6. Yeni Eklenen Tablolar — RLS Kontrolü

2026 yılında eklenen tablolar için kontrol listesi:

| Tablo | RLS migration | Doğrulama |
| --- | --- | --- |
| `user_phone_numbers` (2026-02-03) | ❌ Yok | Manuel kontrol gerekir |
| `sms_logs` (2026-02-03) | ❌ Yok | Manuel kontrol gerekir |
| `contact_messages` (2026-02-05) | ✅ `20260417_001_*.sql` rate limit ekledi | OK |
| `reactive_alert_state` (2026-02-05) | ❌ Yok | Manuel kontrol gerekir |
| `user_emails` (2026-02-11) | ❌ Yok | Manuel kontrol gerekir |
| `email_logs` (2026-02-11) | ❌ Yok | Manuel kontrol gerekir |
| `ges_*` (2026-02-21) | ✅ `20260221_007_*.sql` | OK |
| `ges_satis_hakki` (2026-03-26) | ✅ `20260326_004_*.sql` | OK |
| `intake_forms` (2026-04-03) | ✅ `20260417_001_*.sql` rate limit | OK |

## 7. API Anahtarı Yönetimi

PortEco ekosisteminde aşağıdaki sırlar kullanılır:

| Sır | Tutucu | Yer |
| --- | --- | --- |
| `VITE_SUPABASE_URL` | Public | Frontend `.env` |
| `VITE_SUPABASE_ANON` | Public | Frontend `.env` |
| `SB_SERVICE_ROLE_KEY` | Sunucu | `scripts/reactive-alerts.ts` (lokal `.env`), Supabase Edge Function secrets |
| `CRON_TOKEN` | Sunucu | Supabase Edge Function secrets |
| `RESEND_API_KEY` | Sunucu | Supabase Edge Function secrets, lokal `.env` |
| `RESEND_FROM` | Yarı-public | E-posta gönderici adresi; sızsa da kritik değil |
| `ILETIMERKEZI_KEY` | Sunucu | Supabase Edge Function secrets, lokal `.env` |
| `ILETIMERKEZI_HASH` | Sunucu | Aynı |
| `SMS_SENDER` | Yarı-public | İleti Merkezi başlık (`ECOENERJI`) |
| aril-sync `SUPABASE_SERVICE_ROLE` | Sunucu | GitHub Actions secrets |
| aril-sync `ARIL_BASE`, `ARIL_KCETAS_BASE` | Sunucu | GitHub Actions secrets (URL içinde IP olabilir) |
| aril-sync `EPIAS_USERNAME`, `EPIAS_PASSWORD` | Sunucu | EPİAŞ portal kimlikleri (workflow secret'lara henüz eklenmemiş) |
| aril-sync `MERAM_USER`, `MERAM_PASS` | Sunucu | MEDAŞ kimlikleri (manuel çalıştırma için lokal `.env`) |

Hiçbir gerçek anahtar repo'ya commit edilmemiştir. `.gitignore` `.env`, `.env.local`, `.env.*.local` desenlerini engeller.

> ⚠️ EPİAŞ secrets'ları `sync_aril_6h.yml` workflow'unda yer almaz; `sync_epias_ptf.js` şu an manuel çalıştırılır. Otomatik PTF çekimi production'a alınmadan önce GitHub Actions secrets'a eklenmelidir.

## 8. SMS / E-posta İstismar Riski

`reactive-alerts` her uyarı tetikleyicide hem e-posta hem SMS gönderir. Eşik tetikleme mantığı:

```
shouldSend =
  (nextLevel === "warn" && prevLevel === "ok") ||
  (nextLevel === "limit" && prevLevel !== "limit")
```

Bu mantık ilk uyarı + ilk limit aşımı durumunda **bir kez** gönderir; tekrar gönderim için durum `ok`'a inip tekrar yükselmeli. Aynı dönemde sonsuz SMS atılması engellenir. Ancak:

- Bir tesis aynı ay içinde RI ve RC eşikleri için ayrı uyarı + limit gönderebilir → en fazla 4 SMS / e-posta / dönem / tesis.
- GES varsa RIO ve RCO ek 4 mesaj → toplam 8 / dönem / tesis.

Çok kullanıcı ortamında üst sınır kontrolü için mesaj başına bir log kontrolü (`sms_logs.created_at` üzerinde rate limit) önerilir.

## 9. Çıktı Sayım

| Kontrol | Durum |
| --- | --- |
| RLS migration dosyalarında tanımlı tablo | 9 |
| RLS manuel tanımlanan tablo | ~15 |
| `service-role` key sızıntısı (`VITE_` ön ekli) | 0 ✅ |
| CRON_TOKEN timing-safe karşılaştırma | ❌ Yapılmamış |
| `contact-notify` CORS | `https://ecoenerji.net.tr` ✅ |
| Edge Function `Authorization` JWT kontrolü | Yok (cron / webhook tetikli) |

## 10. Önerilen İyileştirmeler (Öncelik Sırasına Göre)

1. **Yüksek**: RLS politikalarını migration dosyalarına taşı (15 tablo). Yeni ortam kurulumlarında manuel adım kalmasın.
2. **Yüksek**: `reactive-alerts` Edge Function'ında CRON_TOKEN karşılaştırmasını `crypto.subtle.timingSafeEqual` ile değiştir.
3. **Orta**: `contact-notify` Edge Function'ına webhook secret kontrolü ekle.
4. **Orta**: EPİAŞ ve diğer aril-sync secret'larını üretim workflow'larına ekle; manuel çalıştırma bağımlılığını kaldır.
5. **Düşük**: `Dashboard.tsx:1379` ve `calculateInvoice.ts:134` üzerinde production'a girmeden temizlenmesi gereken `console.log` debug satırları var. Production build'inde sızdırma riski düşük ama gereksiz.
6. **Düşük**: `subscription_settings` ve `owner_subscriptions` üzerinde admin paneli kayıt eksikliklerinde net hata mesajı (Bilinen Bug 7.1, porteco-03).

---

## Son Güncelleme

- **Tarih:** 2026-05-03
- **Branch:** main
- **Son commit (PortEco Web):** `03aa828` — valla bişeler yaptık da hatırlamıyom amk
- **Kapsanan dosyalar:** `supabase/migrations/*.sql` (30 dosya), `supabase/functions/reactive-alerts/index.ts`, `supabase/functions/contact-notify/index.ts`, `scripts/reactive-alerts.ts`, `src/lib/supabase.ts`, frontend env değişkenleri
