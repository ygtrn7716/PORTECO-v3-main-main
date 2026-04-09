# PortEco v3 — Admin Paneli

**Layout:** `src/components/admin/AdminShell.tsx` + `src/components/admin/AdminSidebar.tsx`
**Tablo Yöneticisi:** `src/components/admin/TableManager.tsx`

---

## 1. Admin Sayfaları Route'ları

Tüm admin sayfaları `/dashboard/admin/*` altındadır ve `AdminRoute` ile korunur.

### Kullanıcı & Tesis Yönetimi
| Route | Component | Tablo |
|-------|-----------|-------|
| `/dashboard/admin/kullanıcılar` | AdminUsersPage | auth.users |
| `/dashboard/admin/user-integrations` | UserIntegrationsAdmin | user_integrations |
| `/dashboard/admin/owner-subscriptions` | OwnerSubscriptionsAdmin | owner_subscriptions |
| `/dashboard/admin/subscription-settings` | SubscriptionSettingsAdmin | subscription_settings |

### Enerji & Tarife
| Route | Component | Tablo |
|-------|-----------|-------|
| `/dashboard/admin/subscription-yekdem` | SubscriptionYekdemAdmin | subscription_yekdem |
| `/dashboard/admin/distribution-tariff` | DistributionTariffAdmin | distribution_tariff_official |
| `/dashboard/admin/epias-ptf` | EpiasPtfAdmin | epias_ptf_hourly |

### Tüketim & Demand
| Route | Component | Tablo |
|-------|-----------|-------|
| `/dashboard/admin/consumption-daily` | ConsumptionDailyAdmin | consumption_daily |
| `/dashboard/admin/consumption-hourly` | ConsumptionHourlyAdmin | consumption_hourly |
| `/dashboard/admin/demand-monthly` | DemandMonthlyAdmin | demand_monthly |

### Fatura & Finansal
| Route | Component | Tablo |
|-------|-----------|-------|
| `/dashboard/admin/invoice-snapshots` | InvoiceSnapshotsAdmin | invoice_snapshots |
| `/dashboard/admin/monthly-overview` | MonthlyOverviewAdmin | monthly_overview |

### GES (Güneş Enerjisi)
| Route | Component | Tablo |
|-------|-----------|-------|
| `/dashboard/admin/ges-providers` | GesProvidersAdmin | ges_providers |
| `/dashboard/admin/ges-credentials` | GesCredentialsAdmin | ges_credentials |
| `/dashboard/admin/ges-plants` | GesPlantsAdmin | ges_plants |
| `/dashboard/admin/ges-production` | GesProductionAdmin | ges_production_daily |
| `/dashboard/admin/ges-sync-logs` | GesSyncLogAdmin | ges_sync_log |
| `/dashboard/admin/ges-satis-hakki` | GesSatisHakkiAdmin | ges_satis_hakki |

### Bildirimler & İletişim
| Route | Component | Tablo |
|-------|-----------|-------|
| `/dashboard/admin/notification-channels` | NotificationChannelsAdmin | notification_channels |
| `/dashboard/admin/notification-events` | NotificationEventsAdmin | notification_events |
| `/dashboard/admin/reactive-alerts` | ReactiveAlertsAdmin | reactive_alert_state |
| `/dashboard/admin/user-phone-numbers` | UserPhoneNumbersAdmin | user_phone_numbers |
| `/dashboard/admin/user-emails` | UserEmailsAdmin | user_emails |
| `/dashboard/admin/sms-logs` | SmsLogsAdmin | sms_logs |
| `/dashboard/admin/email-logs` | EmailLogsAdmin | email_logs |
| `/dashboard/admin/contact-messages` | ContactMessagesAdmin | contact_messages |

### İçerik & Formlar
| Route | Component | Tablo |
|-------|-----------|-------|
| `/dashboard/admin/posts` | PostsAdmin | posts |
| `/dashboard/admin/tanimlama` | IntakeFormsAdmin | intake_forms |

---

## 2. Admin Tespiti — JWT Metadata Kontrolü

**Dosya:** `src/hooks/useIsAdmin.ts`

```typescript
import { useSession } from "@/hooks/useSession";

export function useIsAdmin() {
  const { session, loading } = useSession();
  const isAdmin = !!session?.user?.app_metadata?.is_admin;
  return { isAdmin, loading };
}
```

**Dosya:** `src/components/auth/AdminRoute.tsx`

```typescript
export default function AdminRoute({ children }: { children: React.ReactNode }) {
  const { session, loading: sessionLoading } = useSession();
  const { isAdmin, loading: adminLoading } = useIsAdmin();

  if (sessionLoading || adminLoading) return <LoadingSpinner />;

  if (!session) return <Navigate to="/login" />;
  if (!isAdmin) return <Navigate to="/dashboard" />;

  return <>{children}</>;
}
```

### Admin Olma Koşulu

Supabase Auth'da kullanıcının `app_metadata` alanına `is_admin: true` set edilmiş olmalıdır. Bu işlem Supabase Dashboard'dan veya service role key ile API üzerinden yapılır:

```sql
-- Supabase SQL Editor ile:
UPDATE auth.users
SET raw_app_meta_data = raw_app_meta_data || '{"is_admin": true}'::jsonb
WHERE email = 'admin@example.com';
```

---

## 3. YEKDEM Veri Girişi Akışı

**Route:** `/dashboard/admin/subscription-yekdem`
**Component:** `src/pages/admin/SubscriptionYekdemAdmin.tsx`

### Adım Adım Akış

**Adım 1: Sayfaya git**
Admin → Sidebar → "Subscription YEKDEM" tıkla

**Adım 2: Filtreleme**
- User dropdown'ından kullanıcı seç (opsiyonel)
- SerNo alanına tesis numarası gir (opsiyonel)
- Yıl/Ay filtreleri kullan (opsiyonel)

**Adım 3: Mevcut kayıtları gör**
TableManager, `subscription_yekdem` tablosundan verileri çeker:
```typescript
supabase.from("subscription_yekdem").select("*", { count: "exact" })
```

**Adım 4a: Mevcut kaydı düzenle**
- Satırdaki `yekdem_value`, `yekdem_final`, `diger_degerler` alanlarını düzenle
- "Kaydet" butonuna bas

```typescript
// TableManager.saveRow():
await supabase
  .from("subscription_yekdem")
  .update(patch)
  .match({
    user_id: r.user_id,
    subscription_serno: r.subscription_serno,
    period_year: r.period_year,
    period_month: r.period_month,
  });
```

**Adım 4b: Yeni kayıt ekle**
- "+ Yeni Satır" butonuna bas
- Modalda doldur:
  - `user_id` — Kullanıcı UUID
  - `subscription_serno` — Tesis numarası
  - `period_year` — Yıl (örn: 2026)
  - `period_month` — Ay (1-12)
  - `yekdem_value` — Tahmini YEKDEM (TL/kWh)
  - `yekdem_final` — Kesin YEKDEM (TL/kWh)
  - `diger_degerler` — Diğer kalemler (TL)
  - `note` — Not (opsiyonel)
- "Ekle" butonuna bas

```typescript
// TableManager.insertRow():
await supabase.from("subscription_yekdem").insert(payload);
```

**Adım 5: Kayıt silme**
- Satırdaki "Sil" butonuna bas → Onay dialogu → Silme

```typescript
await supabase.from("subscription_yekdem").delete().match({...});
```

### Tablo Yapısı: `subscription_yekdem`

| Kolon | Tip | Açıklama |
|-------|-----|----------|
| `user_id` | UUID | Kullanıcı (matchKey) |
| `subscription_serno` | number | Tesis numarası (matchKey) |
| `period_year` | number | Yıl (matchKey) |
| `period_month` | number | Ay (matchKey) |
| `yekdem_value` | numeric | Tahmini YEKDEM (fatura kesilirken) |
| `yekdem_final` | numeric | Kesin YEKDEM (sonradan açıklanan) |
| `diger_degerler` | numeric | Ek kalemler (TL) |
| `note` | text | Açıklama notu |
| `created_at` | timestamp | Oluşturma (readOnly) |

---

## 4. TableManager — Genel CRUD Mekanizması

**Dosya:** `src/components/admin/TableManager.tsx`

Tüm admin sayfaları `TableManager` component'ini kullanır. Her sayfa bir `TableConfig` objesi geçirir:

```typescript
type TableConfig = {
  title: string;          // Sayfa başlığı
  table: string;          // Supabase tablo adı
  matchKeys: string[];    // Primary key kolonları
  orderBy?: { key: string; asc?: boolean };
  columns: ColumnDef[];   // Kolon tanımları
  filters?: FilterDef[];  // Filtre tanımları
  pageSize?: number;      // Sayfa başı kayıt (varsayılan: 100)
  readOnly?: boolean;     // Salt okunur mod
};
```

### CRUD Operasyonları

| Operasyon | Supabase Call |
|-----------|---------------|
| List | `.from(table).select("*", { count: "exact" })` + filtreler |
| Update | `.from(table).update(patch).match(matchKeys)` |
| Delete | `.from(table).delete().match(matchKeys)` |
| Insert | `.from(table).insert(payload)` |

### Kullanıcı Dropdown

Admin sayfalarında kullanıcı filtresi varsa, dropdown `user_integrations` tablosundan dolar:
```typescript
const { data } = await supabase
  .from("user_integrations")
  .select("user_id, aril_user")
  .order("aril_user", { ascending: true })
  .limit(5000);
```

---

## 5. Diğer Admin İşlemleri

### Dağıtım Tarifesi Yönetimi
**Route:** `/dashboard/admin/distribution-tariff`
**Tablo:** `distribution_tariff_official`
- BTV, KDV, reaktif bedel, güç bedeli vb. resmi tarife değerleri

### Blog Yazısı Yönetimi
**Route:** `/dashboard/admin/posts`
**Tablo:** `posts`
- Başlık, slug, içerik (markdown), yayın durumu

### Başvuru Formları (Realtime)
**Route:** `/dashboard/admin/tanimlama`
**Tablo:** `intake_forms`
- **Realtime subscription** aktif — yeni başvuru geldiğinde otomatik güncellenir

---

## 6. RLS Bypass

Admin kullanıcıları için RLS bypass, JWT `app_metadata` üzerinden yapılır.

**Genel pattern (SQL):**
```sql
CREATE POLICY "table_admin_all"
  ON public.table_name
  FOR ALL
  USING ((auth.jwt() -> 'app_metadata' ->> 'is_admin')::boolean = true);
```

**Projede uygulanan tablolar (migration dosyalarından):**
- `ges_providers` — admin all
- `ges_credentials` — admin all
- `ges_plants` — admin all
- `ges_production_daily` — admin all
- `ges_snapshot` — admin all
- `ges_sync_log` — admin all (sadece admin)
- `ges_satis_hakki` — admin select/insert/update

**Migration dosyaları:**
- `supabase/migrations/20260221_007_ges_rls_policies.sql`
- `supabase/migrations/20260326_004_ges_satis_hakki_admin_policies.sql`

> **Not:** GES dışındaki tablolar (consumption_hourly, subscription_yekdem vb.) için RLS politikaları migration dosyalarında bulunmamakta. Bunlar muhtemelen Supabase Dashboard üzerinden veya daha eski migration'larla tanımlanmıştır.

---

## 7. Bilinen Bug: Admin YEKDEM Girişi → Dashboard'da Görünmeme

### Sorun
Admin `subscription_yekdem` tablosuna bir tesis için `yekdem_value` ve `yekdem_final` girer. Ancak o tesis için dashboard'da YEKDEM mahsup kartı "—" gösterir.

### Kök Neden

Dashboard mahsup hesabı şu zinciri gerektirir:

```
1. subscription_settings → kbk, terim, gerilim, tarife  ← BURADA KIRIYOR
2. distribution_tariff_official → btv, kdv
3. consumption_hourly / consumption_daily → totalKwh
4. subscription_yekdem → yekdem_value, yekdem_final
```

Admin YEKDEM verisini girer ama tesis için `subscription_settings` kaydı oluşturmayı atlayabilir. Settings kaydı olmadan:
- `kbk` değeri yok → birim fiyat hesaplanamaz
- `terim/gerilim/tarife` yok → tarife eşleştirilemez → BTV/KDV bulunamaz

**Dashboard.tsx satır 798-802:**
```typescript
if (!settings) {
  setInvoiceTotal(null);
  setYekdemMahsup(null);
  setHasYekdemMahsup(false);
  return;  // Sessizce çıkar — kullanıcıya hata gösterilmez
}
```

### Çözüm Önerisi
1. Admin YEKDEM giriş sayfasında, tesis için `subscription_settings` kaydı yoksa uyarı göster
2. Dashboard'da settings bulunamazsa açıklayıcı hata mesajı göster
3. Admin'e "Eksik tesis ayarları" kontrol paneli ekle

---

## 8. İlgili Component Dosyaları

| Dosya | Açıklama |
|-------|----------|
| `src/components/admin/AdminShell.tsx` | Admin layout wrapper |
| `src/components/admin/AdminSidebar.tsx` | Admin navigasyon menüsü |
| `src/components/admin/TableManager.tsx` | Genel tablo CRUD component'i |
| `src/components/auth/AdminRoute.tsx` | Admin route koruması |
| `src/hooks/useIsAdmin.ts` | Admin kontrolü hook'u |
| `src/pages/admin/SubscriptionYekdemAdmin.tsx` | YEKDEM veri girişi |
| `src/pages/admin/SubscriptionSettingsAdmin.tsx` | Tesis ayarları |
| `src/pages/admin/DistributionTariffAdmin.tsx` | Tarife yönetimi |
| `src/pages/admin/IntakeFormsAdmin.tsx` | Başvuru formları (realtime) |
