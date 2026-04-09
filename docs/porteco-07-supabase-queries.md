# PortEco v3 — Supabase Query'leri

Bu belge projede kullanılan tüm Supabase query'lerini dosya bazında listeler.

---

## 1. Dashboard Ana Sayfa

**Dosya:** `src/pages/Dashboard.tsx`

### Tesis Listesi
```typescript
// Satır 403-406: Ana tesis listesi
supabase.from("owner_subscriptions")
  .select("subscription_serno, meter_serial, title")
  .eq("user_id", uid)
  .order("subscription_serno", { ascending: true });

// Satır 425-429: Nickname override
supabase.from("subscription_settings")
  .select("subscription_serno, title, nickname")
  .eq("user_id", uid)
  .in("subscription_serno", sernos);

// Satır 460-464: Fallback tesis listesi
supabase.from("subscription_settings")
  .select("subscription_serno, title, nickname")
  .eq("user_id", uid)
  .order("subscription_serno", { ascending: true });
```

### Tüketim (Geçen Ay)
```typescript
// Satır 524-531: Saatlik tüketim (paginated)
fetchAllConsumption({
  supabase, userId: uid, subscriptionSerno: selectedSub,
  columns: "ts, cn, ri, rc, gn",
  startIso: geçenAyBaşı, endIso: buAyBaşı,
});
// Dönen: cn (aktif kWh), ri (indüktif), rc (kapasitif), gn (üretim)
```

### PTF
```typescript
// Satır 585-588: RPC — tesis bazlı ağırlıklı PTF
supabase.rpc("monthly_ptf_prev_sub", {
  p_tz: "Europe/Istanbul",
  p_subscription_serno: selectedSub,
});
// Dönen: [{ ptf_tl_per_kwh: number }]
```

### YEKDEM
```typescript
// Satır 80-87 (fetchSubscriptionYekdem): Tesis özel YEKDEM
supabase.from("subscription_yekdem")
  .select("yekdem_value, yekdem_final")
  .eq("user_id", uid).eq("subscription_serno", sub)
  .eq("period_year", year).eq("period_month", month)
  .maybeSingle();

// Satır 655-660: Resmi YEKDEM (fallback)
supabase.from("yekdem_official")
  .select("yekdem_value, yekdem_tl_per_kwh")
  .eq("year", periodYear).eq("month", periodMonth)
  .maybeSingle();
```

### KBK
```typescript
// Satır 706-711
supabase.from("subscription_settings")
  .select("kbk")
  .eq("user_id", uid).eq("subscription_serno", selectedSub)
  .maybeSingle();
```

### Fatura Hesab��
```typescript
// Satır 764-772: Snapshot kontrolü
supabase.from("invoice_snapshots")
  .select("total_with_mahsup, has_yekdem_mahsup, yekdem_mahsup")
  .eq("user_id", uid).eq("subscription_serno", selectedSub)
  .eq("period_year", periodYear).eq("period_month", periodMonth)
  .eq("invoice_type", "billed")
  .maybeSingle();

// Satır 789-794: Tesis ayarları
supabase.from("subscription_settings")
  .select("terim, gerilim, tarife, guc_bedel_limit, trafo_degeri")
  .eq("user_id", uid).eq("subscription_serno", selectedSub)
  .maybeSingle();

// Satır 825-831: Dağıtım tarifesi
supabase.from("distribution_tariff_official")
  .select("dagitim_bedeli, guc_bedeli, guc_bedeli_asim, kdv, btv, reaktif_bedel")
  .eq("terim", terim).eq("gerilim", gerilim).eq("tarife", tarife)
  .maybeSingle();

// Satır 843-848: Multiplier + BTV toggle
supabase.from("owner_subscriptions")
  .select("multiplier, btv_enabled")
  .eq("user_id", uid).eq("subscription_serno", selectedSub)
  .maybeSingle();

// Satır 858-866: Demand
supabase.from("demand_monthly")
  .select("max_demand_kw")
  .eq("user_id", uid).eq("subscription_serno", selectedSub)
  .eq("period_year", pYear).eq("period_month", pMonth)
  .eq("is_final", true)
  .maybeSingle();
```

### YEKDEM Mahsup (M-1) Tüketim
```typescript
// Satır 948-954: Günlük tüketim
supabase.from("consumption_daily")
  .select("day, kwh_in")
  .eq("user_id", uid).eq("subscription_serno", selectedSub)
  .gte("day", prevStart).lt("day", prevEnd);

// Satır 136-143 (fetchSubscriptionDigerDegerler): Diğer değerler
supabase.from("subscription_yekdem")
  .select("diger_degerler")
  .eq("user_id", uid).eq("subscription_serno", sub)
  .eq("period_year", year).eq("period_month", month)
  .maybeSingle();
```

### GES
```typescript
// Satır 1358-1362: GES plant'leri
supabase.from("ges_plants")
  .select("id")
  .eq("user_id", uid).eq("is_active", true);

// Satır 1380-1385: GES üretim
supabase.from("ges_production_daily")
  .select("energy_kwh")
  .in("ges_plant_id", plantIds)
  .gte("date", startOfMonth).lte("date", endOfMonth);
```

### Tüm Tesisler Toplamı (satır 1062-1343)
Yukarıdaki query'lerin her tesis için tekrarı. Ek olarak:
```typescript
// Satır 1125-1133: Snapshot kontrolü (per tesis)
supabase.from("invoice_snapshots")
  .select("total_with_mahsup, yekdem_mahsup")
  .eq("user_id", uid).eq("subscription_serno", serno)
  .eq("period_year", pYear).eq("period_month", pMonth)
  .eq("invoice_type", "billed")
  .maybeSingle();
```

---

## 2. YEKDEM Mahsup Detay

**Dosya:** `src/components/dashboard/YekdemMahsupDetail.tsx`

```typescript
// Satır 141-145: Tesis listesi
supabase.from("subscription_settings")
  .select("subscription_serno, title, nickname, is_hidden")
  .eq("user_id", uid)
  .order("subscription_serno", { ascending: true });

// Satır 160-164: Fallback tesis listesi
supabase.from("owner_subscriptions")
  .select("subscription_serno, title")
  .eq("user_id", uid)
  .order("subscription_serno", { ascending: true });

// Satır 229-234: Tesis ayarları (kbk, tarife)
supabase.from("subscription_settings")
  .select("kbk, terim, gerilim, tarife")
  .eq("user_id", uid).eq("subscription_serno", selectedSub)
  .maybeSingle();

// Satır 253-259: BTV/KDV oranları
supabase.from("distribution_tariff_official")
  .select("kdv, btv")
  .eq("terim", terim).eq("gerilim", gerilim).eq("tarife", tarife)
  .maybeSingle();

// Satır 273-279: M-1 günlük tüketim
supabase.from("consumption_daily")
  .select("day, kwh_in")
  .eq("user_id", uid).eq("subscription_serno", selectedSub)
  .gte("day", prevStart).lt("day", prevEnd);

// Satır 55-62 (fetchSubYekdemForMahsup): YEKDEM verileri
supabase.from("subscription_yekdem")
  .select("yekdem_value, yekdem_final")
  .eq("user_id", uid).eq("subscription_serno", sub)
  .eq("period_year", year).eq("period_month", month)
  .maybeSingle();
```

---

## 3. YEKDEM Detay

**Dosya:** `src/components/dashboard/YekdemDetail.tsx`

```typescript
// Satır 104-107: Tesis listesi
supabase.from("owner_subscriptions")
  .select("subscription_serno, meter_serial")
  .eq("user_id", uid)
  .order("subscription_serno", { ascending: true });

// Satır 116-119: Nickname'ler
supabase.from("subscription_settings")
  .select("subscription_serno, nickname")
  .eq("user_id", uid)
  .in("subscription_serno", sernos);

// Satır 191-195: Yıllık YEKDEM verileri
supabase.from("subscription_yekdem")
  .select("period_month, yekdem_value, yekdem_final")
  .eq("user_id", uid).eq("subscription_serno", selectedSub)
  .eq("period_year", selectedYear)
  .order("period_month", { ascending: true });
```

---

## 4. Fatura Detay

**Dosya:** `src/components/dashboard/InvoiceDetail.tsx`

```typescript
// Satır 121-128: YEKDEM value (period_year/period_month)
supabase.from("subscription_yekdem")
  .select("yekdem_value")
  .eq("user_id", uid).eq("subscription_serno", sub)
  .eq("period_year", year).eq("period_month", month)
  .maybeSingle();

// Satır 161-167: YEKDEM value + final (mahsup için)
supabase.from("subscription_yekdem")
  .select("yekdem_value, yekdem_final")
  .eq("user_id", uid).eq("subscription_serno", sub)
  .eq("period_year", year).eq("period_month", month)
  .maybeSingle();

// Satır 207-214: Diğer değerler
supabase.from("subscription_yekdem")
  .select("diger_degerler")
  .eq("user_id", uid).eq("subscription_serno", sub)
  .eq("period_year", year).eq("period_month", month)
  .maybeSingle();

// Satır 380-383: RPC PTF
supabase.rpc("monthly_ptf_prev_sub", {
  p_tz: "Europe/Istanbul",
  p_subscription_serno: sub,
});
```

---

## 5. Reaktif Bölüm

**Dosya:** `src/components/dashboard/ReactiveSection.tsx`

```typescript
// Satır 180-187: Bu ayın reaktif verileri (paginated)
fetchAllConsumption({
  supabase, userId: uid, subscriptionSerno: subscriptionSerNo,
  columns: "cn, ri, rc, rio, rco, gn",
  startIso: buAyBaşı, endIso: şimdi,
});
```

---

## 6. Grafikler

**Dosya:** `src/components/dashboard/ChartsPage.tsx`

```typescript
// Satır 300-309: Aylık dashboard serisi (mevcut yıl + önceki yıl)
supabase.rpc("monthly_dashboard_series", {
  p_user_id: uid,
  p_subscription_serno: selectedSub,
  p_year: currentYear,
  p_tz: "Europe/Istanbul",
});
```

---

## 7. Bildirimler

**Dosya:** `src/pages/AlertsPage.tsx`

```typescript
// Satır 148-150: Tesis listesi
supabase.from("owner_subscriptions")
  .select("subscription_serno, meter_serial, title")
  .eq("user_id", uid);

// Satır 167-169: Reaktif uyarı durumları
supabase.from("reactive_alert_state")
  .select("subscription_serno, kind, period_ym, status, last_value_pct, last_sent_at")
  .eq("user_id", uid);

// Satır 196-198: SMS logları
supabase.from("sms_logs")
  .select("id, subscription_serno, phone_number, message_type, message_body, status, error_message, created_at")
  .eq("user_id", uid);

// Satır 223-225: E-posta logları
supabase.from("email_logs")
  .select("id, subscription_serno, email_address, subject, message_body, status, error_message, created_at")
  .eq("user_id", uid);
```

---

## 8. Profil Sayfası

**Dosya:** `src/pages/ProfilePage.tsx`

```typescript
// Satır 125-127: Tesis listesi + BTV durumu
supabase.from("owner_subscriptions")
  .select("subscription_serno, meter_serial, title, btv_enabled")
  .eq("user_id", uid);

// Satır 144-146: Tesis ayarları (nickname, gizleme)
supabase.from("subscription_settings")
  .select("subscription_serno, title, nickname, is_hidden")
  .eq("user_id", uid);

// Satır 235-237: Nickname güncelleme
supabase.from("subscription_settings")
  .update({ nickname })
  .eq("user_id", uid).eq("subscription_serno", serno);

// Satır 245-247: Yeni settings kaydı oluşturma
supabase.from("subscription_settings")
  .insert({ user_id: uid, subscription_serno: serno, nickname });

// Satır 312-314: GES sağlayıcı listesi
supabase.from("ges_providers").select("id, name, display_name");

// Satır 325-327: Kullanıcının GES kimlik bilgileri
supabase.from("ges_credentials")
  .select("id, provider_id, username, is_active, sync_status, last_sync_at, sync_error")
  .eq("user_id", uid);

// Satır 337-339: GES plant sayısı
supabase.from("ges_plants").select("*", { count: "exact", head: true }).eq("user_id", uid);

// Satır 376-378: GES kimlik bilgisi ekleme
supabase.from("ges_credentials").insert({ user_id: uid, provider_id, username, password });
```

---

## 9. Snapshot İşlemleri

**Dosya:** `src/components/utils/invoiceSnapshots.ts`

```typescript
// Satır 147-151: Snapshot upsert
supabase.from("invoice_snapshots")
  .upsert(payload, {
    onConflict: "user_id,subscription_serno,period_year,period_month,invoice_type",
  });

// Satır 161-174: Snapshot listesi
supabase.from("invoice_snapshots")
  .select("user_id, subscription_serno, period_year, period_month, ...")
  .eq("user_id", userId).eq("invoice_type", invoiceType)
  .order("period_year", { ascending: false })
  .order("period_month", { ascending: false });

// Satır 185-193: Tek snapshot
supabase.from("invoice_snapshots")
  .select("*")
  .eq("user_id", userId).eq("subscription_serno", serno)
  .eq("period_year", year).eq("period_month", month)
  .eq("invoice_type", type)
  .maybeSingle();
```

---

## 10. BTV Toggle

**Dosya:** `src/lib/btvToggle.ts`

```typescript
// Satır 14-15: BTV durumunu güncelle
supabase.from("owner_subscriptions")
  .update({ btv_enabled })
  .eq("user_id", uid).eq("subscription_serno", serno);
```

---

## 11. Paginated Fetch

**Dosya:** `src/lib/paginatedFetch.ts`

```typescript
// fetchAllConsumption: consumption_hourly tablosundan sayfalı veri
supabase.from("consumption_hourly")
  .select(columns)
  .eq("user_id", userId).eq("subscription_serno", serno)
  .gte("ts", startIso).lt("ts", endIso)
  .range(from, to);

// fetchAllPtf: epias_ptf_hourly tablosundan sayfalı veri
supabase.from("epias_ptf_hourly")
  .select(columns)
  .gte(dateCol, startIso).lt(dateCol, endIso)
  .range(from, to);
```

---

## 12. Gizli Tesisler

**Dosya:** `src/lib/subscriptionVisibility.ts`

```typescript
// fetchHiddenSernos: Gizli tesis numaralarını getir
supabase.from("subscription_settings")
  .select("subscription_serno")
  .eq("user_id", uid).eq("is_hidden", true);
```

---

## 13. İletişim Formu

**Dosya:** `src/components/sections/ContactUs.tsx`

```typescript
supabase.from("contact_messages").insert({
  name, email, phone, company, message,
});
```

---

## 14. Başvuru Formu

**Dosya:** `src/pages/IntakeFormPage.tsx`

```typescript
supabase.from("intake_forms").insert({
  company_name, contact_name, email, phone, ...
});
```

---

## 15. Admin Panel (TableManager)

**Dosya:** `src/components/admin/TableManager.tsx`

```typescript
// Satır 112-116: Kullanıcı listesi (dropdown için)
supabase.from("user_integrations")
  .select("user_id, aril_user")
  .order("aril_user", { ascending: true })
  .limit(5000);

// Satır 136: Dinamik tablo okuma
supabase.from(cfg.table).select("*", { count: "exact" });
// + filtreler (user_id, subscription_serno, text search, date range, period)

// Satır 215: Kayıt güncelleme
supabase.from(cfg.table).update(patch).match(buildMatch(r));

// Satır 224: Kayıt silme
supabase.from(cfg.table).delete().match(buildMatch(r));

// Satır 278: Kayıt ekleme
supabase.from(cfg.table).insert(payload);
```

---

## 16. RLS Politikaları

### GES Tabloları (migration 007)

| Tablo | Politika | Erişim |
|-------|----------|--------|
| `ges_providers` | `ges_providers_public_read` | Herkes okuyabilir |
| `ges_providers` | `ges_providers_admin_all` | Admin tüm işlemler |
| `ges_credentials` | `ges_credentials_user_select` | Kendi kaydını okur |
| `ges_credentials` | `ges_credentials_user_insert` | Kendi kaydını ekler |
| `ges_credentials` | `ges_credentials_admin_all` | Admin tüm işlemler |
| `ges_plants` | `ges_plants_user_select` | Kendi plant'lerini okur |
| `ges_plants` | `ges_plants_admin_all` | Admin tüm işlemler |
| `ges_production_daily` | `ges_production_daily_user_select` | Plant sahibi okur (join) |
| `ges_production_daily` | `ges_production_daily_admin_all` | Admin tüm işlemler |
| `ges_snapshot` | `ges_snapshot_user_select` | Plant sahibi okur (join) |
| `ges_snapshot` | `ges_snapshot_admin_all` | Admin tüm işlemler |
| `ges_sync_log` | `ges_sync_log_admin_all` | Sadece admin |

### GES Satış Hakkı (migration 004)

| Tablo | Politika | Erişim |
|-------|----------|--------|
| `ges_satis_hakki` | `admins_select_all` | Admin select |
| `ges_satis_hakki` | `admins_insert` | Admin insert |
| `ges_satis_hakki` | `admins_update` | Admin update |

### Admin Bypass Pattern

```sql
(auth.jwt() -> 'app_metadata' ->> 'is_admin')::boolean = true
```

Bu pattern tüm admin politikalarında tekrarlanır.

### RLS Etkileyen Sorgular

| Query | RLS Etkisi |
|-------|-----------|
| `owner_subscriptions.select()` | user_id filtresi ile kullanıcı kendi verilerini görür |
| `subscription_settings.select()` | user_id filtresi |
| `consumption_hourly.select()` | user_id filtresi |
| `subscription_yekdem.select()` | user_id filtresi |
| `invoice_snapshots.select()` | user_id filtresi |
| `ges_plants.select()` | RLS + user_id |
| `ges_production_daily.select()` | RLS (plant sahibi join) |
| Admin `TableManager.select()` | Admin JWT ile bypass |

---

## 17. Realtime Subscription

Projede **tek bir yerde** realtime subscription kullanılır:

**Dosya:** `src/pages/admin/IntakeFormsAdmin.tsx` (satır 105-110)

```typescript
const channel = supabase
  .channel("intake_forms_inserts")
  .on("postgres_changes", {
    event: "INSERT",
    schema: "public",
    table: "intake_forms",
  }, (payload) => {
    setRows((prev) => [payload.new as IntakeRow, ...prev]);
  })
  .subscribe();

// Cleanup:
return () => { supabase.removeChannel(channel); };
```

**Amaç:** Admin başvuru formları sayfasında yeni başvuru geldiğinde sayfa yenilenmeden otomatik olarak listeye eklenir.

---

## 18. RPC Fonksiyonları

| Fonksiyon | Kullanıldığı Yer | Parametreler | Dönen |
|-----------|-------------------|--------------|-------|
| `monthly_ptf_prev_sub` | Dashboard.tsx, InvoiceDetail.tsx | `p_tz`, `p_subscription_serno` | `[{ ptf_tl_per_kwh }]` |
| `monthly_dashboard_series` | ChartsPage.tsx | `p_user_id`, `p_subscription_serno`, `p_year`, `p_tz` | Aylık seri verisi |

---

## 19. Tablo Özeti

| Tablo | Okuma | Yazma | Açıklama |
|-------|-------|-------|----------|
| `owner_subscriptions` | Dashboard, Profile, Alerts | BTV toggle | Abonelik sahipleri |
| `subscription_settings` | Dashboard, Mahsup, Profile | Profile (nickname) | Tesis ayarları |
| `subscription_yekdem` | Dashboard, InvoiceDetail, YekdemDetail | Admin CRUD | YEKDEM verileri |
| `yekdem_official` | Dashboard (fallback) | — | Resmi YEKDEM |
| `consumption_hourly` | Dashboard, Reactive, Consumption | — | Saatlik tüketim |
| `consumption_daily` | Dashboard, Mahsup | — | Günlük tüketim |
| `distribution_tariff_official` | Dashboard, Mahsup | Admin CRUD | Dağıtım tarifesi |
| `demand_monthly` | Dashboard | — | Aylık demand |
| `invoice_snapshots` | Dashboard, InvoiceHistory | InvoiceDetail (upsert) | Fatura snapshot'ları |
| `ges_plants` | Dashboard, Profile | Profile (insert) | GES santralleri |
| `ges_production_daily` | Dashboard | — | GES günlük üretim |
| `ges_credentials` | Profile | Profile (insert) | GES kimlik bilgileri |
| `ges_providers` | Profile | — | GES sağlayıcılar |
| `reactive_alert_state` | Alerts | — | Reaktif uyarı durumu |
| `sms_logs` | Alerts | — | SMS logları |
| `email_logs` | Alerts | — | E-posta logları |
| `user_integrations` | Admin (dropdown) | — | Kullanıcı entegrasyonları |
| `contact_messages` | ContactUs | ContactUs (insert) | İletişim mesajları |
| `intake_forms` | Admin (realtime) | IntakeFormPage (insert) | Başvuru formları |
| `epias_ptf_hourly` | PtfDetail (paginated) | — | Saatlik PTF verileri |
| `posts` | Blog | Admin CRUD | Blog yazıları |
