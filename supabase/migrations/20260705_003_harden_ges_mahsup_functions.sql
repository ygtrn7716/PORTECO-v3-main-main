-- Advisor: function_search_path_mutable — yeni fonksiyonlarda search_path sabitle.
-- (Fonksiyon gövdeleri zaten şema-nitelikli public.* referansları kullanıyor.)
alter function public.validate_ges_mahsup_assignment() set search_path = '';
alter function public.set_ges_mahsup_priorities(uuid, uuid[]) set search_path = '';
