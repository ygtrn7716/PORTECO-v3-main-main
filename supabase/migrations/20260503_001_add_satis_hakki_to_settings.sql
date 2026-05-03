-- subscription_settings.satis_hakki: tesisin yıllık satış hakkı limiti (kWh)
--
-- Önceki sürümde aynı bilgi ges_satis_hakki tablosunda max_satis_kwh kolonu olarak
-- tutuluyordu; artık tüm tesis ayarları subscription_settings tablosunda tek noktadan
-- yönetilecek. Mevcut ges_satis_hakki verileri taşınır; eski tablo legacy olarak korunur
-- (bir sonraki temizlik turunda kaldırılabilir).

alter table public.subscription_settings
  add column if not exists satis_hakki numeric(12,3) default null;

-- Mevcut ges_satis_hakki kayıtlarını subscription_settings'e taşı (idempotent — sadece
-- subscription_settings'te satis_hakki boşsa yazar). Hedef satır yoksa hiçbir şey yapmaz;
-- bu durumda admin AdminUsersPage'den kayıt oluşturduğunda doğru değerle başlar.
update public.subscription_settings ss
set satis_hakki = gsh.max_satis_kwh
from public.ges_satis_hakki gsh
where ss.user_id = gsh.user_id
  and ss.subscription_serno = gsh.subscription_serno
  and gsh.max_satis_kwh is not null
  and ss.satis_hakki is null;
