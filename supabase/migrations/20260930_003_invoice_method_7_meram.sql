-- Metod 7 — Meram (MEPAŞ).
--
-- Niğde As Beton Ağustos 2026 MEPAŞ faturaları (10126953 / 10128583 / 9062757) ve
-- Meram mahsup exceli ile Meram formülü kuruşuna çözüldü; Metod 1'den ayrışıyor:
--   U = (wPos + Y) × KBK + adj · Enerji = N × U (YEK ayrı satır değil)
--   "YEKDEM Mahsup + GDDK + Mahsuplaşma Farkı" = F + GDDK,
--     F = M × ((wM + Y) × KBK − perakende) · GDDK aylık elle (override 'yekdem_gddk')
--   Dağıtım = G_own > C ? D×C/2 : D×C − D×G_own/2  (C trafo kaybı dahil brüt)
--   BTV = oran × (Enerji + Satır 2) · sonraki ay YEKDEM mahsubu YOK
-- Metod 1 (Sepaş golden baseline) DEĞİŞMEZ.
--
-- ⚠️ Bu migration Meram'ı Metod 7'ye GEÇİRMEZ: invoice_companies.meram → 7 ayrı
-- migration'da, testler + karşılaştırma tablosu onaylandıktan SONRA yapılır.
-- Idempotent; veri yazmaz (yalnız invoice_methods seed satırı).

-- 1) Saatlik trafo kaybı (yalnız Metod 7).
alter table public.subscription_settings
  add column if not exists trafo_kaybi_saatlik numeric;

alter table public.subscription_settings
  drop constraint if exists subscription_settings_trafo_kaybi_saatlik_chk;
alter table public.subscription_settings
  add constraint subscription_settings_trafo_kaybi_saatlik_chk
  check (trafo_kaybi_saatlik is null or trafo_kaybi_saatlik >= 0);

comment on column public.subscription_settings.trafo_kaybi_saatlik is
  'kWh/saat. YALNIZ Metod 7 (Meram): faturalama döneminin HER saatine tüketime eklenir, '
  'sayaç satırı eksik saatler dahil (eksik satır = cn 0 → tüketim = t). Havuz tahsisinde '
  'kapasite kap(h) = cn(h) + t. AG ölçümlü tesiste ör. 1.12; OG ölçümlüde NULL. '
  'Metod 7''de aylık trafo_degeri KULLANILMAZ. NULL/0 → davranış birebir eskisi.';

-- 2) Metod 7 kaydı.
insert into public.invoice_methods (id, name, description) values
  (7, 'Metod 7 | Meram (MEPAŞ)', 'Meram (MEPAŞ): saatlik-net iskelet. Enerji = net tüketim × (wPos + YEKDEM) × KBK; "YEKDEM Mahsup + GDDK + Mahsuplaşma Farkı" tek satır (F = mahsup × ((mahsup PTF + YEKDEM) × KBK − perakende), GDDK aylık elle); dağıtım kendi verişiyle aylık yarım kural; BTV = %1 × (Enerji + Satır 2); saatlik trafo kaybı (trafo_kaybi_saatlik) tüketime dahil; sonraki ay YEKDEM mahsubu yok.')
on conflict (id) do nothing;

-- 3) Fatura kalem override anahtarı: 'yekdem_gddk' (Metod 7, yalnız amount_override).
alter table public.invoice_line_overrides
  drop constraint if exists invoice_line_overrides_item_key_check;
alter table public.invoice_line_overrides
  add constraint invoice_line_overrides_item_key_check
  check (item_key in ('enerji', 'dagitim', 'btv', 'reaktif', 'guc', 'trafo',
                      'yekdem_mahsup', 'mahsuplasma', 'yek', 'yekdem_gddk'));

-- 4) Snapshot replay alanları (yalnız Metod 7 damgalar; diğer metodlarda NULL).
--    U ve F saklanmaz: w_pos, w_mahsup, yekdem_tahmini (= Y), kbk, perakende,
--    unit_price_adjustment'tan türetilir. N = net_positive_draw_kwh (m7'de t'li).
alter table public.invoice_snapshots
  add column if not exists trafo_kaybi_saatlik numeric,
  add column if not exists trafo_kaybi_kwh numeric,
  add column if not exists own_gn_kwh numeric,
  add column if not exists yekdem_gddk numeric,
  add column if not exists yekdem_is_final boolean;

comment on column public.invoice_snapshots.trafo_kaybi_saatlik is
  'Metod 7 (Meram): kesim anındaki t (kWh/saat). Diğer metodlarda NULL.';
comment on column public.invoice_snapshots.trafo_kaybi_kwh is
  'Metod 7 (Meram): t × saat (kWh). Replay: C = total_consumption_kwh (ham Σcn) + bu. Diğer metodlarda NULL.';
comment on column public.invoice_snapshots.own_gn_kwh is
  'Metod 7 (Meram): G_own — tesisin kendi sayacının dönem verişi (ham Σgn); dağıtım bedeline yalnız bu girer. Diğer metodlarda NULL.';
comment on column public.invoice_snapshots.yekdem_gddk is
  'Metod 7 (Meram): yazım anındaki efektif YEKDEM GDDK (TL, işaretli). Replay''de override varsa override kazanır. Diğer metodlarda NULL.';
comment on column public.invoice_snapshots.yekdem_is_final is
  'Metod 7 (Meram): yekdem_tahmini kolonundaki Y dönemin yekdem_final''ı mı (false → tahmini yekdem_value). Diğer metodlarda NULL.';
