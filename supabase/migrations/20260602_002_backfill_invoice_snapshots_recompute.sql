-- Bir kerelik backfill: invoice_snapshots saklı toplamlarını güncel
-- calculateInvoice formülüyle yeniden hesapla (recomputeSnapshotTotalWithMahsup
-- ile parite). 2026-04 dağıtım bedeli / veriş satış formülü düzeltmelerinden
-- önce yazılmış snapshot'ların saklı `total_with_mahsup` (ve türetilmiş kalem)
-- değerleri eski formülü içeriyordu; Dashboard kartı bunları okurken canlı
-- recompute ediyordu ama grafik (monthly_dashboard_series) saklı değeri
-- okuduğu için kart ⇄ grafik fatura sapması oluşuyordu.
--
-- Bu migration, türetilmiş kalemleri snapshot input alanlarından (değişmeyen
-- ham girdiler) yeniden üretir; girdiler değiştirilmez. Yalnızca güncel formülle
-- farklı çıkan satırları günceller (idempotent: tekrar çalıştırılınca no-op).
--
-- Çevirim doğrulaması: 122 billed snapshot'ın 117'sinde bu SQL'in ürettiği
-- total_invoice, saklı total_invoice ile birebir eşleşti; eşleşen küme
-- calculateInvoice'ın tüm dallarını (veriş>tüketim, lisanslı satış, çift terim,
-- veriş-USD fazlası) kapsıyor.

with src as (
  select s.user_id, s.subscription_serno, s.period_year, s.period_month, s.invoice_type,
    coalesce(s.total_consumption_kwh,0)::numeric tc,
    coalesce(s.unit_price_energy,0)::numeric upe,
    coalesce(s.unit_price_distribution,0)::numeric upd,
    coalesce(s.btv_rate,0)::numeric btv,
    coalesce(s.vat_rate,0)::numeric vat,
    coalesce(s.tariff_type,'single') tariff,
    coalesce(s.contract_power_kw,0)::numeric cpk,
    coalesce(s.month_final_demand_kw,0)::numeric mfd,
    coalesce(s.power_price,0)::numeric pp,
    coalesce(s.power_excess_price,0)::numeric pep,
    coalesce(s.reactive_penalty_charge,0)::numeric rpen,
    case when coalesce(s.trafo_degeri,0) > 0 then s.trafo_degeri::numeric else 0 end trafo,
    coalesce(s.total_production_kwh,0)::numeric tpk,
    coalesce(s.on_yil, true) on_yil,                 -- recompute defaults on_yil to true
    coalesce(s.perakende_enerji_bedeli,0)::numeric perakende,
    coalesce(s.usd_kur,0)::numeric usd,
    coalesce(s.lisansli_satis, false) lisansli,
    coalesce(s.yekdem_mahsup,0)::numeric yek,
    coalesce(s.diger_degerler,0)::numeric diger,
    s.total_with_mahsup stored_twm
  from invoice_snapshots s
  where s.invoice_type = 'billed'
),
c as (
  select *,
    upe*tc as energy_charge,
    upe*trafo as trafo_chg,
    (case when lisansli then tc else tc+trafo end) as dist_base,
    (case when tpk>0 then tpk else 0 end) as veris,
    (tc - (case when tpk>0 then tpk else 0 end)) as netkwh
  from src
),
c2 as (
  select *,
    (upd*dist_base) as cekis_charge,
    (case
       when lisansli      then upd*dist_base
       when veris > tc    then (upd/2)*dist_base
       when netkwh <= 0   then upd*dist_base
       else                    upd*dist_base - (upd/2)*veris
     end) as dist_charge,
    (case
       when lisansli      then 0
       when veris > tc    then (upd*dist_base) - (upd/2)*dist_base   -- = cekis/2
       when netkwh <= 0   then 0
       else                    (upd/2)*veris
     end) as dist_adjustment,
    (case
       when lisansli      then upd
       when veris > tc    then upd/2
       when netkwh <= 0   then upd
       when netkwh <> 0   then null      -- placeholder; set below from dist_charge/netkwh
       else                    upd
     end) as eff_dist_unit_pre,
    (case when lisansli then tc else abs(netkwh) end) as net_energy_kwh
  from c
),
c3 as (
  select *,
    (case when lisansli then (upe*net_energy_kwh)*btv
          else ((upe*net_energy_kwh)+trafo_chg)*btv end) as btv_charge,
    (case when tariff='dual' then pp*cpk else 0 end) as power_base,
    (case when tariff='dual' and mfd>cpk then (mfd-cpk)*pep else 0 end) as power_excess,
    (case when lisansli then 0 when veris>0 then least(veris,tc) else 0 end) as vmk,
    (case when lisansli then veris when veris>0 then greatest(0, veris-tc) else 0 end) as vfk,
    (case when (on_yil and usd>0) then 0.133*usd else perakende end) as vfb,
    coalesce(eff_dist_unit_pre,
             case when netkwh <> 0 then dist_charge/netkwh else upd end) as eff_dist_unit
  from c2
),
c4 as (
  select *,
    (case when veris>0 then vmk*upe + vfk*vfb else 0 end) as veris_satis
  from c3
),
r as (
  select *,
    (energy_charge + trafo_chg + dist_charge + btv_charge + (power_base+power_excess) + rpen - veris_satis) as subtotal
  from c4
),
r2 as (
  select *,
    (subtotal*(1+vat)) as total_invoice_calc,
    (subtotal*(1+vat)) + yek + diger as twm_calc
  from r
)
update invoice_snapshots t
set
  energy_charge        = r2.energy_charge,
  trafo_charge         = r2.trafo_chg,
  distribution_charge  = r2.dist_charge,
  distribution_adjustment = r2.dist_adjustment,
  effective_distribution_unit_price = r2.eff_dist_unit,
  veris_kwh            = r2.veris,
  btv_charge           = r2.btv_charge,
  power_base_charge    = r2.power_base,
  power_excess_charge  = r2.power_excess,
  veris_satis_bedeli   = r2.veris_satis,
  subtotal_before_vat  = r2.subtotal,
  vat_charge           = r2.subtotal * r2.vat,
  total_invoice        = r2.total_invoice_calc,
  total_with_mahsup    = r2.twm_calc,
  updated_at           = now()
from r2
where t.user_id = r2.user_id
  and t.subscription_serno = r2.subscription_serno
  and t.period_year = r2.period_year
  and t.period_month = r2.period_month
  and t.invoice_type = r2.invoice_type
  -- yalnızca güncel formülle farklı çıkan satırları güncelle (idempotent)
  and round(r2.twm_calc, 2) <> round(coalesce(r2.stored_twm, 0), 2);
