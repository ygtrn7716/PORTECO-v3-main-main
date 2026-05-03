# PortEco Web — Reaktif İşlemler

Bu doküman, reaktif enerji uyarı sistemini uçtan uca anlatır: frontend göstergeleri, ay-içi (MTD) veri akışı, fatura cezasının hesaplanması, Edge Function ve VPS cron arasındaki paralel implementasyon, SMS / e-posta gönderimi, log tabloları ve admin paneli görünümü.

Kaynak dosyalar:

- `src/components/dashboard/ReactiveSection.tsx` — frontend gösterge
- `src/pages/AlertsPage.tsx` — log + telefon/e-posta yönetimi sayfası
- `src/components/dashboard/PhoneNumberManager.tsx`, `EmailManager.tsx`
- `supabase/functions/reactive-alerts/index.ts` — Deno tabanlı Edge Function
- `scripts/reactive-alerts.ts` — VPS/Cron için tsx çalıştırılabilir script (`npm run cron:alerts`)
- `scripts/test-sms.ts`, `scripts/test-email.ts`
- Migration dosyaları: `20260205_002_create_reactive_alert_state.sql`, `20260205_003_create_reactive_mtd_totals.sql`, `20260326_001_alter_reactive_mtd_totals.sql`, `20260326_002_alter_reactive_alert_state_kind.sql`, `20260203_001_create_user_phone_numbers.sql`, `20260211_001_create_user_emails.sql`, `20260203_002_create_sms_logs.sql`, `20260211_002_create_email_logs.sql`

## 1. Reaktif Enerji Nedir

Şebekeden çekilen veya şebekeye verilen aktif enerjinin (kWh) yanında, yük karakteristiğine bağlı olarak reaktif enerji (kVArh) de akar. Türkiye'de tüketim ölçümlerinde dört reaktif kanal sayaçtan gelir:

| Kısaltma | Tam adı | Şebeke yönü |
| --- | --- | --- |
| RI | Reaktif İndüktif | Şebekeden çekilen |
| RC | Reaktif Kapasitif | Şebekeden çekilen |
| RIO | Reaktif İndüktif (Veriş) | Şebekeye verilen (GES tesisli) |
| RCO | Reaktif Kapasitif (Veriş) | Şebekeye verilen (GES tesisli) |

Aktif enerjiye oranı belirli yüzdeleri aştığında dağıtım şirketi reaktif ceza tahakkuk eder. Cezanın temel formülü "limit aşan reaktif × reaktif birim bedeli (`distribution_tariff_official.reaktif_bedel`)" şeklindedir.

## 2. Eşik Değerleri

Eşikler iki ayrı yerde tanımlıdır ve aynı değerleri taşır:

- Frontend (`ReactiveSection.tsx`):
  - `REACTIVE_LIMIT_RI = 20` (yüzde, hard limit)
  - `REACTIVE_LIMIT_RC = 15` (yüzde, hard limit)
- Edge Function ve cron script (`levelFor` fonksiyonu):
  - RI / RIO: warn @ %18, limit @ %20
  - RC / RCO: warn @ %13, limit @ %15

Frontend tek bir kademeli eşik (`>limit` → kırmızı) kullanır; cron katmanı **iki kademeli** sistem uygular (ok → warn → limit). Aynı oran sınıflandırılırken bu farkı dikkate almak gerekir: kullanıcı UI'da hâlâ yeşil görse de cron uyarı SMS'i atmış olabilir (warn kademesinde).

`Dashboard.tsx` Effect 5 / Effect 6'daki ceza hesabı yalnızca **hard limit** üzerinden çalışır; warn kademesi cezayı tetiklemez (yalnızca uyarı gönderir).

## 3. Akış Diyagramı

```
┌──────────────┐    cron     ┌────────────────────────┐   RPC    ┌────────────────────┐
│  GitHub      │─────────────►│  reactive-alerts       │─────────►│ reactive_mtd_totals │
│  Actions /   │ HTTP POST   │  (Edge Function veya  │          │ (Postgres function) │
│  VPS cron    │             │   scripts/...ts)      │          └────────┬───────────┘
└──────────────┘             └──────────┬─────────────┘                   │
                                        │                                  │
                                        ▼                                  ▼
                          ┌─────────────────────────┐         ┌────────────────────────┐
                          │ Eşik kontrol (levelFor) │         │ owner_subscriptions     │
                          │ ok / warn / limit       │         │ user_phone_numbers      │
                          └────────┬────────────────┘         │ user_emails             │
                                   │                          │ user_integrations       │
              ┌────────────────────┼─────────────────────┐    └────────────────────────┘
              ▼                    ▼                     ▼
┌─────────────────────┐ ┌─────────────────────┐ ┌──────────────────────────┐
│ reactive_alert_state│ │ Resend (e-posta)    │ │ İleti Merkezi (SMS)      │
│ (upsert: status,    │ │ → email_logs INSERT │ │ → sms_logs INSERT        │
│  period_ym, last...) │ └─────────────────────┘ └──────────────────────────┘
└─────────────────────┘
```

## 4. Edge Function (`supabase/functions/reactive-alerts/index.ts`)

### 4.1 Header Güvenliği

```typescript
if ((req.headers.get("x-cron-token") ?? "") !== CRON_TOKEN) {
  return new Response("Forbidden", { status: 403 });
}
```

Yalnızca `x-cron-token` header'ında doğru sırrın geldiği isteklere yanıt verir. CRON_TOKEN env değişkeni Supabase tarafına eklenmelidir. Şu anki karşılaştırma `===` operatörü ile yapılır (timing-safe değil); güvenlik raporu bunu iyileştirme önerisi olarak işaretler ([PORTECO_SECURITY_REPORT.md](./PORTECO_SECURITY_REPORT.md)).

### 4.2 Adım Adım İş Akışı

1. **`periodYM = trYM()`** — `Europe/Istanbul` saatine göre `YYYY-MM` (örn. `2026-05`).
2. **Kullanıcı listesi:** `user_integrations` tablosundan `aril_user` (e-posta) dolu satırlar çekilir; `user_id → e-posta listesi` map'i oluşturulur.
3. **Her kullanıcı için:**
   - `user_phone_numbers` (`is_active = true`, kolonlar: `phone_number, receive_warnings, receive_alerts`).
   - `owner_subscriptions` (kolonlar: `subscription_serno, meter_serial, title`).
   - `reactive_mtd_totals(p_user_id)` RPC ile aktif kWh, RI kVArh ve RC kVArh toplamları (ay başından itibaren) çekilir.
4. **Her tesis × `kind` (`ri`, `rc`):**
   - `valuePct = pct(reactive, active)`.
   - `nextLevel = levelFor(kind, valuePct)` → `"ok" | "warn" | "limit"`.
   - `reactive_alert_state` tablosundan o ay için mevcut `status` okunur (`prevLevel`).
   - Gönderim koşulu:
     - `nextLevel === "warn" && prevLevel === "ok"` → ilk uyarı.
     - `nextLevel === "limit" && prevLevel !== "limit"` → eşik aşımı.
   - State her durumda upsert edilir (status, last_value_pct, gönderildiyse last_sent_at).
   - Mesaj `msgText()` ile oluşturulur.
   - E-posta Resend API'ye POST atılır (`from`, `to`, `subject`, `text`).
   - SMS İleti Merkezi GET endpoint'ine atılır (`key, hash, text, receipents, sender, iys, iysList`).
   - Sonuç `sms_logs`'a yazılır (status `sent` veya `failed`).

### 4.3 Yanıt Formatı

```json
{ "ok": true, "sent": <int>, "errors": ["..."] }
```

`errors` boşsa alan eklenmez. HTTP 500 yalnızca kullanıcı listesi sorgusu hata verirse döner.

### 4.4 Edge Function Sınırlamaları

- E-posta logu yazımı **yoktur** — Edge Function yalnızca SMS log'u yazar. E-posta logu için cron script kullanılmalıdır.
- Veriş reaktifi (RIO/RCO) Edge Function'da **işlenmez**. Yalnızca cron script (`scripts/reactive-alerts.ts`) RIO/RCO kontrolü yapar.

## 5. Cron Script (`scripts/reactive-alerts.ts`)

VPS / GitHub Actions üzerinde `npm run cron:alerts` ile çalıştırılır. Edge Function ile aynı temel mantığı paylaşır, ancak ek özellikleri vardır:

- `user_emails` tablosundan aktif e-posta adresleri okunur ve **her e-posta için ayrı** Resend isteği atılır.
- `email_logs` tablosuna her e-posta için INSERT yapılır.
- `gn_kwh, rio_kvarh, rco_kvarh` `reactive_mtd_totals` RPC'sinden ek olarak okunur (Edge Function'da bu kolonlar henüz okunmuyor).
- `gn > 0` ise Veriş reaktif (RIO ve RCO) kontrolü yapılır; eşikler RI/RC ile aynıdır.
- Konsol log'ları zaman damgalı (`[YYYY-MM-DD HH:MM:SS]`) basılır.

Cron script env değişkenleri:

| Anahtar | Kullanım |
| --- | --- |
| `VITE_SUPABASE_URL` | Supabase URL'i (frontend ile aynı) |
| `SB_SERVICE_ROLE_KEY` | Service role key, RLS bypass |
| `SMS_PROVIDER` | Şu an `iletimerkezi` (varsayılan) |
| `SMS_SENDER` | İleti Merkezi başlık (varsayılan `ECOENERJI`) |
| `ILETIMERKEZI_KEY`, `ILETIMERKEZI_HASH` | İleti Merkezi API kimliği |
| `RESEND_API_KEY`, `RESEND_FROM` | Resend kimliği |

Eksik kimlik durumunda script "WARNING" log'u yazıp ilgili kanalı atlar (fatal değil).

## 6. Frontend Gösterimi (`ReactiveSection.tsx`)

Bileşen bir **prop** alır ve aşağıdaki state'i tutar: `activeKwh, totalRi, totalRc, totalRio, totalRco, totalGn`.

### 6.1 Veri Çekimi

`useEffect` (`ReactiveSection.tsx:165`), bağımlılık `[uid, sessionLoading, subscriptionSerNo]`:

- Tarih aralığı: `start = dayjsTR().startOf("month")`, `end = dayjsTR().add(1,"hour")` (ufak pay).
- `paginatedFetch.fetchAllConsumption({ columns: "cn, ri, rc, rio, rco, gn", ... })`.
- Toplamlar tek geçişte hesaplanır.

### 6.2 Hesaplamalar

```typescript
riPct  = totalRi / activeKwh × 100
rcPct  = totalRc / activeKwh × 100
rioPct = totalRio / totalGn  × 100   // hasGes=true ise
rcoPct = totalRco / totalGn  × 100   // hasGes=true ise
```

`activeKwh` veya `totalGn` `0` ise yüzde otomatik `0` olur (bölme by zero koruması `percent()` yardımcı fonksiyonu).

### 6.3 Görünüm Modları

`Props.displayMode` iki değer alır:

- **`toggle`** — Segmented control ile "Çekiş Değerleri" ve "Veriş Değerleri" sekmesi. Her sekmede iki kart yan yana (`md:grid-cols-2`).
- **`pill`** — Liste şeklinde küçük rozetler. Limit aşanlar otomatik genişletilmiş (`isExpanded = over || expandedPills.has(key)`); diğerleri tıklamayla açılır.

`hasGes = false` ise yalnızca çekiş tarafı (RI, RC) gösterilir; veriş sekmesi/kartları gizlenir.

### 6.4 Renk Mantığı

- `over = ratioPct > limitPct` ise kart ve rozet kırmızı (`text-red-700`, `bg-red-50`).
- Aksi halde yeşil (`text-emerald-700`, `bg-emerald-50`).
- Bar bileşeni: değer dolduğu kısım yeşil/kırmızı, limit konumunda gri çizgi (`bg-neutral-500/70`).

Yazılı durum mesajı:

- Limit içi: "Limit içinde, aktif ceza bulunmamaktadır."
- Limit aşımı: "Limit aşıldığı için reaktif ceza riski vardır."

## 7. AlertsPage (`/dashboard/alerts`)

Bu sayfa üç parçaya ayrılır:

1. **Reaktif uyarı durum tablosu** — `reactive_alert_state` tablosundan kullanıcı için tüm satırlar (period_ym + kind + status). Status'a göre renklendirilir.
2. **SMS log tablosu** — `sms_logs`'tan (sent / failed kayıtları, mesaj gövdesi, telefon, tarih).
3. **E-posta log tablosu** — `email_logs`'tan (sent / failed, e-posta adresi, konu, tarih).

Sayfa ayrıca `PhoneNumberManager` ve `EmailManager` bileşenlerini render eder.

## 8. PhoneNumberManager / EmailManager

`src/components/dashboard/PhoneNumberManager.tsx` ve `EmailManager.tsx` benzer arabirim sunar:

- Kullanıcının kayıtlı telefon numaraları / e-posta adresleri listelenir.
- Yeni numara/e-posta ekleme (insert).
- Mevcut kayıtların güncellenmesi (`is_active`, `receive_warnings`, `receive_alerts` toggle'ları, label değişikliği).
- Silme işlemi.

Tablolar:

| Tablo | Kolon | Anlam |
| --- | --- | --- |
| `user_phone_numbers` | `phone_number` | E.164 formatında numara |
|  | `is_active` | Sayfa içinde toggle, Edge/cron filtrelemesi |
|  | `receive_warnings` | Warn kademesinde SMS al |
|  | `receive_alerts` | Limit kademesinde SMS al |
| `user_emails` | `email` | E-posta adresi |
|  | `is_active` | Filtreleme |
|  | `receive_warnings` | Warn kademesinde e-posta al |
|  | `receive_alerts` | Limit kademesinde e-posta al |

Cron script `is_active = true` olanları çeker, eşik kademesine göre `receive_warnings` veya `receive_alerts` filtresi uygular.

## 9. Test Scriptleri

`scripts/test-sms.ts` ve `scripts/test-email.ts` SMS ve e-posta entegrasyonunu izole test etmek için yazılmıştır.

```bash
# SMS testi
npm run test:sms
```

`test-sms.ts` çalışırken `ILETIMERKEZI_KEY`, `ILETIMERKEZI_HASH`, `SMS_SENDER` env'lerini kullanır. Hedef telefon numarası genelde script içinde sabit (yorum satırı olarak). `test-email.ts` ise `RESEND_API_KEY` ve `RESEND_FROM` ile minimal bir e-posta atar.

Üretimde manuel cron tetikleme:

```bash
# 1) Edge Function üzerinden
curl -X POST 'https://<ref>.functions.supabase.co/reactive-alerts' \
  -H 'x-cron-token: <CRON_TOKEN>'

# 2) Lokalde script ile
npm run cron:alerts
```

## 10. Tablo Şemaları (Özet)

### `reactive_alert_state`

```
id              uuid PK
user_id         uuid FK auth.users
subscription_serno bigint
kind            text  CHECK IN ('ri','rc','rio','rco')   ← 2026-03-26 alter
period_ym       text  format 'YYYY-MM'
status          text  CHECK IN ('ok','warn','limit')
last_value_pct  numeric
last_sent_at    timestamptz nullable
UNIQUE (user_id, subscription_serno, kind, period_ym)
```

`20260326_002_alter_reactive_alert_state_kind.sql` migration'ı ile `kind` enum'una `rio` ve `rco` eklenmiştir.

### `sms_logs`

```
id, user_id, subscription_serno (text), phone_number, message_type, message_body,
status (sent/failed), provider_response (jsonb), error_message, created_at
```

### `email_logs`

```
id, user_id, subscription_serno (text), email_address, subject, message_body,
status (sent/failed), provider_response (jsonb), error_message, created_at
```

### `user_phone_numbers`

```
id, user_id, phone_number, label, is_active, receive_warnings, receive_alerts, created_at
```

### `user_emails`

```
id, user_id, email, label, is_active, receive_warnings, receive_alerts, created_at
```

### `reactive_mtd_totals` RPC

`20260205_003_create_reactive_mtd_totals.sql` ve `20260326_001_alter_reactive_mtd_totals.sql` migration'larıyla tanımlı. Girdi: `p_user_id uuid`. Çıktı (her satırı bir abonelik):

```
subscription_serno bigint
active_kwh         numeric  (cn toplamı)
ri_kvarh           numeric  (ri toplamı)
rc_kvarh           numeric  (rc toplamı)
gn_kwh             numeric  (gn toplamı)        ← 2026-03-26 alter
rio_kvarh          numeric  (rio toplamı)       ← 2026-03-26 alter
rco_kvarh          numeric  (rco toplamı)       ← 2026-03-26 alter
```

`reactive_mtd_totals`, `Europe/Istanbul` saat dilimine göre ayın başından şimdiki ana kadar sayar.

## 11. Mesaj Şablonları

`msgText()` fonksiyonu üç parça döner:

- Prefix: `<meter_serial> <title>` (whitespace trim).
- Kind adı: `Reaktif Induktif`, `Reaktif Kapasitif`, `Reaktif Induktif (Veris)`, `Reaktif Kapasitif (Veris)`.
- Eşik bilgisi: warn ise alt eşik (%18 veya %13) + üst limit; limit ise aşılan eşik.

Örnek warn (RI):

```
123456789 ABC Tesisi: Dikkat! Reaktif Induktif degeri %18 seviyesine ulasti
(Su an: %18.7). Sinira yaklastiniz. Limit: %20.
```

Örnek limit (RC):

```
123456789 ABC Tesisi: Uyari! Reaktif Kapasitif degeri %15 limitini asti
(Su an: %16.4). Asimdasiniz, kullaniminizi kontrol altina alin.
```

E-posta konusu:

- Çekiş warn: `<prefix> - Reaktif uyari: sinira yaklasiyor`
- Çekiş limit: `<prefix> - Reaktif uyari: limit asildi`
- Veriş warn: `<prefix> - Reaktif uyari (veris): sinira yaklasiyor`
- Veriş limit: `<prefix> - Reaktif uyari (veris): limit asildi`

## 12. Fatura Cezası

`Dashboard.tsx:911-925` (Effect 5) ve `Dashboard.tsx:1257-1263` (Effect 6) reaktif cezayı şu mantıkla hesaplar:

```typescript
const REACTIVE_LIMIT_RI = 20;
const REACTIVE_LIMIT_RC = 15;

const riPercent = prevMonthKwh > 0 ? (totalRi / prevMonthKwh) * 100 : 0;
const rcPercent = prevMonthKwh > 0 ? (totalRc / prevMonthKwh) * 100 : 0;

const reactiveUnitPrice = tariffRow.reaktif_bedel ?? 0;

const riPenaltyEnergy = riPercent > REACTIVE_LIMIT_RI ? totalRi : 0;
const rcPenaltyEnergy = rcPercent > REACTIVE_LIMIT_RC ? totalRc : 0;

const reactivePenaltyCharge = (riPenaltyEnergy + rcPenaltyEnergy) * reactiveUnitPrice;
```

Bu ceza tutarı `calculateInvoice({ ..., reactivePenaltyCharge })` parametresine geçirilir ve `subtotalBeforeVat` toplamına eklenir; KDV de bu kalemin üzerine biner. Limit yalnızca bir kez aşıldığında ilgili kanaldaki **tüm** reaktif enerji birim bedele çarpılır (kademeli değil, tam ceza).

## 13. Kaldırılan / Değişen Yapılar

- **`notification_channels`** tablosu legacy olarak kalmıştır; reaktif uyarıları için `user_phone_numbers` + `user_emails` çiftine geçilmiştir. Migration `20260203_003_migrate_notification_channels.sql` veriyi taşıdı; admin sayfası (`NotificationChannelsAdmin`) hâlâ erişilebilir ama tüketici cron tarafı eski tabloyu **okumaz**.
- **`reactive_alert_state.kind`** kolonu eskiden yalnızca `'ri','rc'` enum'unu kabul ediyordu; `20260326_002_alter_reactive_alert_state_kind.sql` ile `'rio','rco'` eklendi.
- **`reactive_mtd_totals` RPC** çıktısı eskiden `(subscription_serno, active_kwh, ri_kvarh, rc_kvarh)` döndürüyordu. `20260326_001_alter_reactive_mtd_totals.sql` ile `gn_kwh, rio_kvarh, rco_kvarh` eklendi. Edge Function bu yeni alanları **henüz okumuyor**; cron script okuyor. Edge Function ile cron arasındaki bu fark yenileme döngüsünde giderilecek.
- **Edge Function vs Cron Script**: Şu an iki paralel implementasyon vardır. Edge Function yalnızca RI/RC kontrolü ve SMS log'u yapar. Cron script ek olarak veriş kontrolü ve e-posta log'u yapar. Üretimde ikisi birden çalışırsa bildirim çakışmaları yaşanabilir; biri devre dışı bırakılmalıdır.
- **Frontend hard limit** ile **cron warn/limit** ayrımı: kullanıcı UI'da yeşil görmesine rağmen cron uyarı SMS'i atabilir. Bu davranış bilinçli ve mevcut sürümde "feature" olarak kabul edilmiştir; istenirse `ReactiveSection` warn için de kademeli renk gösterimi eklenebilir.
- **Test scripti** `test-sms.ts` daha önceleri sabit numaraya gönderiyordu; bu turda repo'da bulunan sürüm aynı yaklaşımı koruyor (numara değişikliği için scripti elle düzenlemek gerekir).

---

## Son Güncelleme

- **Tarih:** 2026-05-03
- **Branch:** main
- **Son commit:** `03aa828` — valla bişeler yaptık da hatırlamıyom amk
- **Kapsanan dosyalar:** `src/components/dashboard/ReactiveSection.tsx`, `src/pages/AlertsPage.tsx`, `src/components/dashboard/PhoneNumberManager.tsx`, `src/components/dashboard/EmailManager.tsx`, `supabase/functions/reactive-alerts/index.ts`, `scripts/reactive-alerts.ts`, `scripts/test-sms.ts`, `scripts/test-email.ts`, `supabase/migrations/20260203_001_*.sql`, `20260203_002_*.sql`, `20260205_002_*.sql`, `20260205_003_*.sql`, `20260211_001_*.sql`, `20260211_002_*.sql`, `20260326_001_*.sql`, `20260326_002_*.sql`
