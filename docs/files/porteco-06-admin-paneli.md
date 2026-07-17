# PortEco Web — Admin Paneli

Admin panelinin tamamı `/dashboard/admin` ön ekiyle başlar ve `<AdminRoute>` korumasıyla ön planda tutulur. Bu doküman; erişim kontrolü, generic CRUD altyapısı `TableManager`, kategorize edilmiş 31 admin sayfası, RLS bypass yaklaşımı, özel davranışlı sayfalar (örn. realtime), bilinen bug'lar ve admin tarafına ait migration referanslarını birebir kod gerçekleriyle anlatır.

Kaynak dosyalar:

- `src/components/auth/AdminRoute.tsx`
- `src/components/admin/AdminShell.tsx`, `AdminSidebar.tsx`, `TableManager.tsx`
- `src/components/admin/dataHealth/*` (Modal, DataHealthDetailModal, DataHealthThresholdsModal)
- `src/hooks/useIsAdmin.ts`
- `src/pages/admin/*` (32 dosya + 1 `.bak`)
- `src/lib/dataHealth.ts`
- `src/App.tsx` (admin route tanımları)
- `supabase/migrations/20260221_007_ges_rls_policies.sql`, `20260326_004_ges_satis_hakki_admin_policies.sql`, `20260417_001_rate_limit_public_forms.sql`, `20260617_001_create_data_health_config.sql`, `20260617_002_get_consumption_health.sql`, `20260705_001_create_ges_mahsup_assignments.sql`, `20260705_003_harden_ges_mahsup_functions.sql`, `20260706_001_atomic_remove_ges_mahsup_assignment.sql`

## 1. Admin Erişim Kontrolü

Yetki kontrolü iki adımdadır:

1. **`<ProtectedRoute>`** kullanıcının login olduğunu doğrular. Aksi halde `/login`'e yönlendirir.
2. **`<AdminRoute>`** (`src/components/auth/AdminRoute.tsx`) `useIsAdmin` hook'unu çağırır.

`useIsAdmin` (`src/hooks/useIsAdmin.ts`):

```typescript
export function useIsAdmin() {
  const { session, loading } = useSession();
  const isAdmin = !!session?.user?.app_metadata?.is_admin;
  return { isAdmin, loading };
}
```

`AdminRoute`:

```typescript
export default function AdminRoute() {
  const { isAdmin, loading } = useIsAdmin();
  if (loading) return <div className="p-6 text-sm text-neutral-500">Yetki kontrol ediliyor…</div>;
  if (!isAdmin) return <Navigate to="/dashboard" replace />;
  return <AdminShell />;
}
```

`is_admin` flag'i JWT'nin `app_metadata` alanından okunur. Bu alan istemciden değiştirilemez; yalnızca service-role key ile sunucu tarafından (`supabase.auth.admin.updateUserById({ app_metadata: { is_admin: true } })`) set edilebilir. Supabase Studio üzerinden de aynı işlem yapılabilir.

## 2. AdminShell ve AdminSidebar

`AdminShell` (`src/components/admin/AdminShell.tsx`) admin layout'unu sağlar: solda `AdminSidebar`, üstte breadcrumb, ana içerik alanında `<Outlet />`. `AdminSidebar` admin sayfalarına linkleri kategori başlıklarıyla render eder.

`AdminHome` (`/dashboard/admin`) açılış sayfasıdır:

- **Kullanıcı sayısı:** `auth.users` count (RLS bypass admin policy ile).
- **Tesis sayısı:** `owner_subscriptions` count.
- **Reaktif özet tablosu:** Tüm tesislerin ay başından şimdiye `cn`, `ri`, `rc` toplamları + RI/RC yüzdeleri. `paginatedFetch.fetchAllConsumptionAdmin()` kullanılır.
- **Hızlı linkler bloğu:** En çok ziyaret edilen 19 admin sayfası kısayolu (sidebar dışı bir grid; "Veri Sağlığı" dahil).

AdminHome içinde `quickLinks` dizisi sayfanın bağladığı yolları sabit olarak tutar; yeni admin sayfası eklendiğinde buraya ve sidebar'a eklenmesi gerekir.

## 3. TableManager — Generic CRUD Mekanizması

`src/components/admin/TableManager.tsx`. Tüm admin sayfaları (4 istisna hariç) bu bileşeni `TableConfig` ile çağırır. Tek implementasyon, her tablo için aynı UI ve kod yolu.

### 3.1 TableConfig Tipi

```typescript
type TableConfig = {
  title: string;          // Sayfa başlığı
  table: string;          // Postgres tablo adı
  matchKeys: string[];    // UPDATE/DELETE'de WHERE üreten anahtarlar
  orderBy?: { key: string; asc?: boolean };
  columns: ColumnDef[];
  filters?: FilterDef[];
  pageSize?: number;      // varsayılan 100
  readOnly?: boolean;     // true ise INSERT butonu ve inline edit gizli
};
```

### 3.2 ColumnDef Tipi

```typescript
type ColumnDef = {
  key: string;                              // sütun adı
  label: string;                            // görünen etiket
  type: "text" | "number" | "bool" | "enum" | "uuid";
  readOnly?: boolean;                       // inline edit kapalı
  options?: string[];                       // enum için
  hideInTable?: boolean;                    // tabloda gösterme (insert form'unda olabilir)
  mask?: boolean;                           // gizli alan, boş bırakılırsa update'e dahil edilmez
  multiline?: boolean;                      // textarea
  rows?: number;                            // textarea boy
  autoSlugFrom?: string;                    // başka bir kolondan slug üret (örn. title→slug)
};
```

### 3.3 FilterDef Tipi

```typescript
type FilterDef = {
  key: string;
  label: string;
  type: "user_id" | "subscription_serno" | "text" | "date_range"
        | "period_month" | "period_year";
};
```

### 3.4 4 Operasyon

| Operasyon | Implementasyon | Notlar |
| --- | --- | --- |
| **List** | `supabase.from(cfg.table).select("*", { count: "exact" })` + filtreler + `.range(from, to)` | Sayfa boyutu varsayılan 100 |
| **Update** | `supabase.from(cfg.table).update(patch).match(buildMatch(r))` | Yalnızca değişen alanlar; `mask=true` boş alan atlanır |
| **Delete** | `supabase.from(cfg.table).delete().match(buildMatch(r))` | `confirm()` diyalogu sonrası tetiklenir |
| **Insert** | `supabase.from(cfg.table).insert(payload)` | Modal açılır; `readOnly` kolonlar atlanır |

### 3.5 Filtreleme

`useEffect` `[cfg.table, userId, serno, q, dateFrom, dateTo, periodMonth, periodYear, page]` bağımlılıklarıyla yeniden sorgu atar. Filtre tipleri:

- `user_id`: `user_integrations` tablosundan dropdown ile seçilir, etiket olarak `aril_user` gösterilir.
- `subscription_serno`: Sayısal input (rakam dışı karakter temizlenir).
- `text`: İlk `text` filtresinin `key`'ine `ilike "%q%"` uygulanır.
- `date_range`: `gte`/`lt` aralığı (varsayılan İstanbul saati).
- `period_month`: 1-12 dropdown, Ocak-Aralık etiketleriyle.
- `period_year`: Son 5 yıl dropdown.

### 3.6 Pagination ve Sıralama

Sayfa numarası state'inde tutulur (`page`); filtre değişikliği `setPage(1)` ile sıfırlanır. Sıralama `cfg.orderBy.key` (asc/desc).

### 3.7 Slug Otomasyonu

`PostsAdmin.tsx` gibi sayfalarda `title` kolonu değiştiğinde slug otomatik oluşur (`autoSlugFrom: "title"` ayarı). `slugifyTR()` Türkçe karakterleri ASCII'ye çevirir, küçük harfe alır, boşlukları tire yapar.

## 4. Admin Sayfaları — Kategori Tablosu

### 4.1 Kullanıcı & Tesis Yönetimi

| Route | Component | Tablo | Açıklama |
| --- | --- | --- | --- |
| `/dashboard/admin/kullanıcılar` | `AdminUsersPage` | `auth.users` (özel görünüm) | Kullanıcı listesi, e-posta arama, son giriş tarihi |
| `/dashboard/admin/tanimlama` | `IntakeFormsAdmin` | `intake_forms` | Başvuru formu kayıtları (özel UI; aşağıda detay) |
| `/dashboard/admin/user-integrations` | `UserIntegrationsAdmin` | `user_integrations` | ARiL hesap bilgileri (`aril_user`, `aril_pass` gibi) |
| `/dashboard/admin/owner-subscriptions` | `OwnerSubscriptionsAdmin` | `owner_subscriptions` | Tesis kataloğu, multiplier, btv_enabled |

### 4.2 Enerji & Tarife

| Route | Component | Tablo | Açıklama |
| --- | --- | --- | --- |
| `/dashboard/admin/subscription-settings` | `SubscriptionSettingsAdmin` | `subscription_settings` | KBK, terim, gerilim, tarife, güç bedel limiti, trafo, on_yil, is_hidden, nickname |
| `/dashboard/admin/subscription-yekdem` | `SubscriptionYekdemAdmin` | `subscription_yekdem` | Tesis-aylık YEKDEM (tahmini + kesin), `diger_degerler`, `usd_kur` |
| `/dashboard/admin/distribution-tariff` | `DistributionTariffAdmin` | `distribution_tariff_official` | Resmi tarife matrisi (terim/gerilim/tarife) |
| `/dashboard/admin/epias-ptf` | `EpiasPtfAdmin` | `epias_ptf_hourly` | Saatlik PTF (TL/MWh, USD/MWh, EUR/MWh) |

### 4.3 Tüketim & Demand

| Route | Component | Tablo | Açıklama |
| --- | --- | --- | --- |
| (route: yok) | `ConsumptionHourlyAdmin` | `consumption_hourly` | Saatlik tüketim ham veri (App.tsx'te route bulunmuyor — TableConfig var, sayfa erişilebilir değil) |
| (route: yok) | `ConsumptionDailyAdmin` | `consumption_daily` | Günlük rollup |
| (route: yok) | `DemandMonthlyAdmin` | `demand_monthly` | Aylık demand (max_demand_kw) |

> Yukarıdaki üç sayfa için `App.tsx`'te `<Route>` tanımı **yok**. Bileşenler kodda mevcut ama yönlendirme eksik; AdminSidebar bu linkleri henüz ortaya çıkarmıyor. Geliştirme döngüsünde route eklenmesi planlandı.

### 4.4 Fatura & Finansal

| Route | Component | Tablo | Açıklama |
| --- | --- | --- | --- |
| `/dashboard/admin/invoice-snapshots` | `InvoiceSnapshotsAdmin` | `invoice_snapshots` | Tüm fatura snapshot'ları (billed + backdated) |
| `/dashboard/admin/monthly-overview` | `MonthlyOverviewAdmin` | `monthly_overview` | Aylık özet |

### 4.5 GES (Güneş Enerjisi)

| Route | Component | Tablo | Açıklama |
| --- | --- | --- | --- |
| `/dashboard/admin/ges-providers` | `GesProvidersAdmin` | `ges_providers` | Provider tanımları (Growatt, HopeWind, …) |
| `/dashboard/admin/ges-credentials` | `GesCredentialsAdmin` | `ges_credentials` | Provider API anahtarları |
| `/dashboard/admin/ges-plants` | `GesPlantsAdmin` | `ges_plants` | Kullanıcı tesisleri |
| `/dashboard/admin/ges-production` | `GesProductionAdmin` | `ges_production_daily` | Günlük üretim kWh |
| `/dashboard/admin/ges-production-upload` | `GesProductionUploadAdmin` | `ges_production_daily` (toplu yükleme) | XLSX dosyasından satır çoğaltma |
| `/dashboard/admin/ges-sync-logs` | `GesSyncLogAdmin` | `ges_sync_log` | Sync run kayıtları |
| `/dashboard/admin/ges-satis-hakki` | `GesSatisHakkiAdmin` | `ges_satis_hakki` | Legacy satış hakkı tablosu (aktif limit artık `subscription_settings.satis_hakki`) |
| `/dashboard/admin/talep-birlestirme` | `TalepBirlestirmeAdmin` | `ges_mahsup_assignments` | GES mahsup talep birleştirme: öncelik sıralı tesis atama (özel UI; aşağıda detay) |

### 4.8 İzleme

| Route | Component | Tablo | Açıklama |
| --- | --- | --- | --- |
| `/dashboard/admin/veri-sagligi` | `DataHealthAdmin` | `get_consumption_health()` RPC + `data_health_providers` | Tesislerin veri geliş gecikmesi izleme panosu (özel UI; aşağıda detay) |

### 4.6 Bildirimler & İletişim

| Route | Component | Tablo | Açıklama |
| --- | --- | --- | --- |
| `/dashboard/admin/notification-channels` | `NotificationChannelsAdmin` | `notification_channels` | Legacy bildirim kanalları |
| `/dashboard/admin/notification-events` | `NotificationEventsAdmin` | `notification_events` | Bildirim olayları |
| `/dashboard/admin/user-phone-numbers` | `UserPhoneNumbersAdmin` | `user_phone_numbers` | Aktif telefon listesi |
| `/dashboard/admin/sms-logs` | `SmsLogsAdmin` | `sms_logs` | SMS gönderim kayıtları |
| `/dashboard/admin/reactive-alerts` | `ReactiveAlertsAdmin` | `reactive_alert_state` | Reaktif uyarı durumları |
| `/dashboard/admin/user-emails` | `UserEmailsAdmin` | `user_emails` | Aktif e-posta listesi |
| `/dashboard/admin/email-logs` | `EmailLogsAdmin` | `email_logs` | E-posta gönderim kayıtları |
| `/dashboard/admin/contact-messages` | `ContactMessagesAdmin` | `contact_messages` | İletişim formu mesajları |

### 4.7 İçerik & Formlar

| Route | Component | Tablo | Açıklama |
| --- | --- | --- | --- |
| `/dashboard/admin/posts` | `PostsAdmin` | `posts` | Blog yazıları (slug otomasyonu, markdown body) |

## 5. Özel Davranışlı Sayfalar

### 5.1 IntakeFormsAdmin (`/dashboard/admin/tanimlama`)

`TableManager` kullanılmaz; özel UI'a sahiptir. Realtime aboneliği olan **tek** sayfadır:

```typescript
const channel = supabase
  .channel("intake_forms_inserts")
  .on("postgres_changes",
    { event: "INSERT", schema: "public", table: "intake_forms" },
    (payload) => setRows((prev) => [payload.new as IntakeRow, ...prev])
  )
  .subscribe();
```

Sayfanın özellikleri:

- Status filtresi: `yeni | islendi | beklemede | all`.
- Arama: firma adı, ad soyad, OSOS kullanıcı adı.
- Şifre maskele/göster toggle (`Eye/EyeOff` ikonları).
- Kopyala butonları (`Copy`/`Check`).
- `tesisler` JSON alanı; her tesis için `tesis_no, kbk, terim, tarife, gerilim, guc_bedel_limit, trafo_degeri, yekdem_tahmin_*, yekdem_final_*` alt alanlar.
- Status değiştirme + admin notu yazma.
- **GES bölümü** (`20260531_001_add_ges_to_intake_forms.sql` sonrası): liste satırında GES rozeti (Sun ikonu + tesis sayısı, `IntakeFormsAdmin.tsx:295`); detayda "GES Sağlayıcıları" paneli (`IntakeFormsAdmin.tsx:370-380`) — her `ges_saglayicilar` jsonb kaydı için sağlayıcı adı, portal kullanıcı adı/şifresi (maskele/göster + kopyala), "Lisanslı Satış" ve "10 yıl üstü (USD)" rozetleri, not alanı.

### 5.2 GesProductionUploadAdmin (`/dashboard/admin/ges-production-upload`)

Admin GES üretim verisi yükleme sayfası (~1980 satır; `TableManager` kullanmaz). Akış:

1. Kullanıcı/tesis seçimi (`user_integrations`, `user_emails`, `owner_subscriptions`); GES santral yönetimi — `ges_plants` oluştur/güncelle/tesise bağla (`linked_serno`), sağlayıcı ve kimlik yönetimi (`ges_providers`, `ges_credentials`).
2. XLSX/CSV parse (`xlsx` paketi/SheetJS): tarih/saat/üretim kolonları için esnek alias eşleme.
3. **Şüpheli değer karar akışı**: ondalık/ölçek sorunlu satırlar (örn. Europower CSV'leri) için satır bazlı karar — `divide100` / `asIs` / `skip` / `manual`.
4. Yazım: saatlik satırlar `ges_production_hourly`'ye chunk'lı insert (zaten var olanlar atlanır), gün toplamları `ges_production_daily`'ye upsert. Sonuçta eklenen/atlanan/geçersiz satır ve etkilenen gün istatistiği gösterilir.

(`GesProductionUploadAdmin.tsx.bak` aynı klasörde durur — eski sürümün yedeği.)

### 5.3 AdminUsersPage (`/dashboard/admin/kullanıcılar`)

`auth.users` tablosuna doğrudan SELECT yapılamadığı için (Postgres-internal şema), bu sayfa `user_integrations` tablosundan kullanıcı listesi türetir; e-posta arama `user_integrations.aril_user` üzerinde çalışır. Kullanıcı+tesis seçildikten sonra iki sekme sunar:

- **Ayarlar sekmesi** — `subscription_settings` formu (`AdminUsersPage.tsx:214` select'i): KBK, terim, tarife, gerilim, güç bedel limiti, trafo, nickname, on_yil + yeni alanlar: **"Yıllık Satış Hakkı (kWh)"** (`satis_hakki`, `:643`), **"Birim Fiyat Manipülasyonu"** (`unit_price_adjustment`, `:661`), **"Lisanslı Satış Üretim Tesisi"** checkbox (`lisansli_satis`, `:688`) ve **üç durumlu `anlik_uretim_kullanimi` select'i** (`:704-713`: boş seçenek → `null`, "Evet" → `true`, "Hayır" → `false`; GES Olmasaydı hesabının arazi GES dalını kontrol eder).
- **YEKDEM sekmesi** — ay bazlı `yekdem_value`, `yekdem_final`, `diger_degerler` ve **"USD/TL Kuru (10 yıl üstü)"** (`usd_kur`, `:869-880`) girişleri; tekil kayıt ve toplu kayıt/refresh sorgularının tümü `usd_kur`'u içerir (`:239,299-356`).

### 5.4 SubscriptionYekdemAdmin (`/dashboard/admin/subscription-yekdem`)

`TableManager` ile çalışır; ancak `matchKeys: ["user_id", "subscription_serno", "period_year", "period_month"]` dörtlüsü unique'tir. Filtreler: user, serno, period_year, period_month, note. `yekdem_value`, `yekdem_final`, `diger_degerler` sayısal kolonlar inline edit edilir. Güncellemeler Dashboard kart hesabını ve YEKDEM mahsup sayfasını anında etkiler (Dashboard sonraki render'da yeni değerleri okur).

### 5.5 TalepBirlestirmeAdmin (`/dashboard/admin/talep-birlestirme`)

GES mahsup **talep birleştirme** yönetimi (`TableManager` kullanmaz). Akış: kullanıcı seç → kullanıcının GES tesisleri listelenir ("Talep Birleştirme aktif (N tesis)" chip'iyle) → GES seç → öncelik sıralı atama listesi düzenlenir (ekle / yukarı-aşağı taşı / sil).

- Veri modeli: `ges_mahsup_assignments` (`20260705_001`) — `(ges_plant_id, priority)` üzerinde **DEFERRABLE INITIALLY DEFERRED UNIQUE** kısıtı (`uq_gma_plant_priority`), reorder swap'larının tek transaction'da yapılabilmesi için. Ayrıca `uq_gma_plant_serno` ve `uq_gma_user_serno` (v1: bir tesis kullanıcı genelinde tek listede olabilir) kısıtları ve cross-user atamayı engelleyen `validate_ges_mahsup_assignment` trigger'ı vardır.
- Reorder `supabase.rpc("set_ges_mahsup_priorities")` (`TalepBirlestirmeAdmin.tsx:309`; RPC tanımı `20260705_001:72-101`, `unnest ... with ordinality` ile 1..N renumber), silme `remove_ges_mahsup_assignment` RPC (`:341`; `20260706_001` — silme + renumber tek transaction). `20260705_003` iki fonksiyona `set search_path = ''` hardening'i ekler.
- **Kaynak tesis de öncelik listesine eklenebilir** (`availableFacilities` filtresi yalnızca zaten atanmış tesisleri çıkarır, `TalepBirlestirmeAdmin.tsx:396-400`); listede "Kaynak tesis" chip'iyle işaretlenir (`:577-588`).
- Yumuşak uyarılar: hedef tesisin kendi GES verişi varsa (`:274-277`) ve lisanslı satış tesisi seçilirse (`:669`). "Önceki ay snapshot'larını sıfırla" aksiyonu (`resetSnapshots`, `:358-394`) tahsis değişikliği sonrası eski snapshot'ların yeniden hesaplanmasını tetikler.
- Tahsisin fatura hesabına etkisi caller katmanındadır: bkz. [porteco-05-fatura-sayfasi.md](./porteco-05-fatura-sayfasi.md) §7 ve `src/components/utils/gesAllocation.ts` (saatlik şelale: kaynak serno `source_serno ?? linked_serno`, saat başına `alloc = min(kalan, max(0, cn − ownGn))`, artan `excess` yalnızca 1. önceliğin görünümüne eklenir).

### 5.6 DataHealthAdmin (`/dashboard/admin/veri-sagligi`)

Tesislerin son tüketim verisi geliş gecikmesini sağlayıcı bazlı eşiklerle izler (`TableManager` kullanmaz).

- Veri: `get_consumption_health()` RPC (`20260617_002`) — `consumption_hourly` üzerinde tek `GROUP BY` ile tesis başına `last_ts`, son 24 saatteki kayıt sayısı ve `delay_hours`; `owner_subscriptions` + `data_health_providers` join'iyle döner, en gecikmeli tesis üstte sıralanır.
- Eşik yapılandırması: `data_health_providers` (`20260617_001`) — `provider_key` (`owner_subscriptions.provider`: sepas/kcetas/meram/tredas), `system_type` (aril/gridbox), `expected/healthy/warning_threshold_hours`; admin-only RLS + 4 varsayılan satır seed. Tesis→sağlayıcı eşlemesi için ayrı tablo bilinçli olarak yoktur (`owner_subscriptions.provider` kaynaktır).
- Durum sınıflandırması `src/lib/dataHealth.ts` içindedir: 5 durum (`healthy/warning/problem/critical/nodata`), `computeStatus` (kritik eşik = uyarı eşiği × 3), `STATUS_META` renk/etiket meta'sı.
- UI: durum kartları + tablo, eşik editörü (`DataHealthThresholdsModal`), tesis detay modalı (`DataHealthDetailModal`).

## 6. Kullanıcı Dropdown — `user_integrations` Doldurma

`TableManager`'ın `user_id` filtresi bir dropdown sunar. Bu dropdown `user_integrations` tablosundan doldurulur:

```typescript
const { data, error } = await supabase
  .from("user_integrations")
  .select("user_id, aril_user")
  .order("aril_user", { ascending: true })
  .limit(5000);
```

`aril_user` kolonu kullanıcının ARiL/SEDAŞ portalı kullanıcı adıdır (genellikle e-posta). Etiket olarak gösterilir; arka planda `user_id` UUID'si kullanılır. Limit 5000 satır.

## 7. RLS Bypass — Admin Politikaları

PortEco Web istemcisi her zaman `VITE_SUPABASE_ANON` key ile bağlanır. Admin yetkili kullanıcı için RLS politikaları JWT içindeki `app_metadata.is_admin` flag'ine bakar.

Tipik admin policy SQL pattern (GES tablolarından `20260221_007_ges_rls_policies.sql`):

```sql
create policy "ges_credentials_admin_all"
  on public.ges_credentials
  for all
  using ((auth.jwt() -> 'app_metadata' ->> 'is_admin')::boolean = true);
```

`for all` (SELECT/INSERT/UPDATE/DELETE) admin kullanıcısının tabloya tam erişimini açar. Aynı tabloda kullanıcının kendi satırlarını okuyabildiği `auth.uid() = user_id` policy'si paralel olarak çalışır.

### 7.1 Migration ile Tanımlı Admin RLS Politikaları

| Migration | Tablo |
| --- | --- |
| `20260221_007_ges_rls_policies.sql` | `ges_providers`, `ges_credentials`, `ges_plants`, `ges_production_daily`, `ges_snapshot`, `ges_sync_log` |
| `20260221_008_create_ges_production_hourly.sql` | `ges_production_hourly` (RLS aynı dosyada) |
| `20260326_004_ges_satis_hakki_admin_policies.sql` | `ges_satis_hakki` |
| `20260417_001_rate_limit_public_forms.sql` | Public form (intake_forms, contact_messages) için rate limit + admin bypass |
| `20260617_001_create_data_health_config.sql` | `data_health_providers` (admin-only RLS) |
| `20260705_001_create_ges_mahsup_assignments.sql` | `ges_mahsup_assignments` (RLS + `validate_ges_mahsup_assignment` trigger'ı + `set_ges_mahsup_priorities` RPC'sine `authenticated` grant'i; RPC SECURITY DEFINER değildir, yetki fiilen RLS ile admin'e sınırlanır) |
| `20260706_001_atomic_remove_ges_mahsup_assignment.sql` | `remove_ges_mahsup_assignment(uuid)` fonksiyonu |

### 7.2 Migration İçermeyen Tablolar

Aşağıdaki tablolar için `is_admin` policy'si Supabase Studio üzerinden manuel tanımlanmıştır (migration dosyasında yer almaz, repo'ya eklenmemiştir):

- `subscription_settings`, `subscription_yekdem`, `owner_subscriptions`
- `consumption_hourly`, `consumption_daily`, `demand_monthly`
- `distribution_tariff_official`
- `invoice_snapshots`, `monthly_overview`
- `epias_ptf_hourly`, `yekdem_official`
- `posts`
- `user_integrations`
- `notification_channels`, `notification_events`
- `user_phone_numbers`, `user_emails`
- `sms_logs`, `email_logs`
- `reactive_alert_state`

Bu tablolarda admin yetkisi production'da yer almakla birlikte kaynak kontrol altında izlenebilir bir migration dosyasına sahip değildir. Yeni ortam kurulumlarında manuel tekrar tanımlama gerekir; bu davranış güvenlik raporunda iyileştirme önerisi olarak işaretlenmiştir.

Aynı durum manuel tüketim yükleme altyapısı için de geçerlidir: kodun kullandığı `owner_subscriptions.data_source` kolonu, `manual_data_logs` tablosu ve manuel upsert için gereken `consumption_hourly` yazma politikaları canlı DB'de tanımlıdır ancak repoda migration'ları **yoktur** (bkz. porteco-01 §13 notu).

## 8. Bilinen Bug Listesi

### 8.1 YEKDEM Girişi → Dashboard'da Görünmeme

`SubscriptionYekdemAdmin`'da yeni bir satır eklendiğinde Dashboard kartı **hemen güncellenmez**. Sebep iki kademelidir:

1. Dashboard'da snapshot canlı yeniden hesaplanır — fakat `subscription_yekdem` tablosundaki güncellemeyi tetikleyici bir realtime aboneliği yoktur. Kullanıcı sayfayı yenilemelidir.
2. Eğer `subscription_settings` ilgili tesis için **yoksa**, Effect 5 sessizce çıkar (`setInvoiceTotal(null)`); kullanıcıya hiçbir hata mesajı gösterilmez. Admin tarafının `subscription_settings` ekleme akışı eksik; özellikle yeni eklenmiş tesislerde `terim/gerilim/tarife` alanları bilinçli olarak doldurulmadan dashboard çalışmaz.

Önerilen düzeltme: `subscription_yekdem` insert/update işleminde admin paneli `subscription_settings` varlığını kontrol etsin; yoksa kullanıcıyı uyarsın. Dashboard tarafında ise hata mesajı `setInvoiceErr("Tesis ayarları eksik: …")` ile UI'a yansıtılsın.

### 8.2 Eksik Route'lar

`ConsumptionHourlyAdmin`, `ConsumptionDailyAdmin`, `DemandMonthlyAdmin` bileşenleri kodda mevcut ama `App.tsx`'te route'ları **yok**. AdminSidebar'a da ekli değiller. Bu üç sayfaya erişim için ya route'ların eklenmesi ya da bileşenlerin kaldırılması gerekir.

### 8.3 `valley` Kartı 404

`DASH_CARDS[4]` (`valley`) kartının `path = "/dashboard/valley"`. Bu route `App.tsx`'te tanımlı değildir; tıklandığında React Router'ın varsayılan davranışı sergilenir (boş sayfa). Eski bir özelliğin kalıntısıdır; ya kart kaldırılmalı ya da route eklenmeli.

### 8.4 Multiplier Fallback Davranışı

`computeMonthInvoiceToDate` ve Dashboard Effect 5/6 multiplier okurken önce `(uid, serno)` filtreleriyle deniyor; başarısızsa yalnızca `serno` ile fallback'e geçiyor. Bu fallback farklı kullanıcıların aynı serno'ya sahip multiplier'ını paylaşmasına yol açabilir (multi-tenant izolasyon zayıflığı). RLS policy genelde bunu engeller, ama fallback kodu lokal test ortamında veya RLS off olan tablolarda yanlış davranır.

### 8.5 Eski Snapshot'ların `total_with_mahsup` Tutarsızlığı — ÇÖZÜLDÜ

Bu bug `20260602_002_backfill_invoice_snapshots_recompute.sql` ile giderildi: eski `billed` snapshot'ların saklı `total_with_mahsup` ve türetilmiş kalemleri bir kerelik, idempotent şekilde güncel formülle yeniden hesaplandı (bkz. §10). UI'daki `recomputeSnapshotTotalWithMahsup()` katmanı ileriye dönük güvence olarak durmaya devam eder.

### 8.6 GesProductionUploadAdmin'in `.bak` Dosyası

`src/pages/admin/GesProductionUploadAdmin.tsx.bak` dosyası repo'da kalmıştır. ESLint veya build sürecini etkilemez, ama temizlik gerektirir.

## 9. Admin Sayfa Sayıları — Doğrulama

| Sayım kaynağı | Adet |
| --- | --- |
| `src/pages/admin/*.tsx` (`.bak` hariç) | 32 |
| `App.tsx` içinde admin route satırları (index dahil) | 29 (consumption-hourly, consumption-daily, demand-monthly **yok**) |
| `AdminHome.tsx` `quickLinks` dizisi | 19 |
| Bu dokümandaki kategori tablolarındaki satır toplamı (AdminHome hariç) | 31 |

Üç kayıp route bilinen bug bölümünde belirtilmiştir.

## 10. Kaldırılan / Değişen Yapılar

- **`subscription_settings.btv_enabled`** kolonu kaldırılmış, `owner_subscriptions.btv_enabled` olarak taşınmıştır (`20260216_002_move_btv_enabled_to_owner_subscriptions.sql`). Admin paneli `subscription_settings` sayfası bu alanı **gösterilmez**, `owner_subscriptions` sayfası gösterir.
- **`notification_channels`** tablosu legacy konumda kalmıştır; aktif kullanım `user_phone_numbers` + `user_emails` çiftine kaymıştır. Admin sayfası `NotificationChannelsAdmin` hâlâ erişilebilir, ama yeni veri girişi için kullanılmaz. Kaldırma kararı henüz alınmamıştır.
- **`is_hidden`** kolonu `subscription_settings`'a 2026-02-16'da eklendi. SubscriptionSettingsAdmin sayfasında inline edit bool sütunu vardır; profil sayfasından da `subscriptionVisibility.setSubscriptionHidden` ile yazılır.
- **`meter_serial`** kolonu `subscription_settings`'a 2026-02-16'da eklendi (`20260216_003_add_meter_serial_to_subscription_settings.sql`). `owner_subscriptions.meter_serial` ile redundant; iki yerde tutulmasının nedeni eski join/lookup sırasında performans optimizasyonudur.
- **GES sayfaları** 2026-02-21 migration grubu ile birlikte eklendi. Önceki dokümanlarda yer almıyordu.
- **`ges_satis_hakki`** tablosu 2026-03-26'da eklendi (`20260326_003_create_ges_satis_hakki.sql`). Lisans 10 yıl satış hakkı bilgisini tutar; admin yalnızca buradan girer.
- **`intake_forms`** tablosu 2026-04-03 migration ile eklendi; `IntakeFormsAdmin` sayfası realtime aboneliğiyle yeni başvuruları canlı gösterir.
- **`rate_limit_public_forms`** politikası (`20260417_001_*.sql`) `intake_forms` ve `contact_messages` tablolarına public insert için rate limit ekledi (IP başına dakika başı). Admin bypass bu politika için tanımlıdır.
- **`AdminUsersPage`** önceki sürümlerde `auth.users`'tan `select *` deniyordu (RLS nedeniyle başarısız); şu an `user_integrations` üzerinden türetilmiş kullanıcı listesi gösterilir.
- **`ges_satis_hakki` tablosu legacy'ye düştü** (`20260503_001`): yıllık satış hakkı limiti `subscription_settings.satis_hakki` kolonuna taşındı; `GesSatisHakkiAdmin` sayfası erişilebilir kaldı ama aktif giriş noktası artık `AdminUsersPage` Ayarlar sekmesidir.
- **"Eski snapshot `total_with_mahsup` tutarsızlığı" bug'ı kapatıldı** (`20260602_002` backfill'i, eski 8.5 maddesi).
- **AdminSidebar'a "İzleme" kategorisi eklendi** (`AdminSidebar.tsx:83-86`, Veri Sağlığı) ve GES bölümüne "Talep Birleştirme" linki girdi (`AdminSidebar.tsx:109`).
- **Admin sayfa sayısı 28 → 32'ye çıktı**: `DataHealthAdmin`, `TalepBirlestirmeAdmin` eklendi; `GesProductionUploadAdmin` basit toplu insert aracından tam teşekküllü yükleme/karar-akışı sayfasına dönüştü.

---

## Son Güncelleme

- **Tarih:** 2026-07-12
- **Branch:** main
- **Son commit:** `500506c` — commit (çalışma ağacındaki commit edilmemiş değişiklikler dahil belgelendi)
- **Kapsanan dosyalar:** `src/components/auth/AdminRoute.tsx`, `src/hooks/useIsAdmin.ts`, `src/components/admin/TableManager.tsx`, `src/components/admin/AdminShell.tsx`, `src/components/admin/AdminSidebar.tsx`, `src/components/admin/dataHealth/*.tsx`, `src/lib/dataHealth.ts`, `src/pages/admin/AdminHome.tsx`, `src/pages/admin/AdminUsersPage.tsx`, `src/pages/admin/IntakeFormsAdmin.tsx`, `src/pages/admin/SubscriptionYekdemAdmin.tsx`, `src/pages/admin/GesProductionUploadAdmin.tsx`, `src/pages/admin/TalepBirlestirmeAdmin.tsx`, `src/pages/admin/DataHealthAdmin.tsx`, ve diğer `src/pages/admin/*.tsx`, `src/App.tsx`, `supabase/migrations/20260221_007_*.sql`, `20260326_003_*.sql`, `20260326_004_*.sql`, `20260417_001_*.sql`, `20260503_001_*.sql`, `20260531_001_*.sql`, `20260602_002_*.sql`, `20260617_001_*.sql`, `20260617_002_*.sql`, `20260705_*.sql`, `20260706_001_*.sql`, `20260710_001_*.sql`
