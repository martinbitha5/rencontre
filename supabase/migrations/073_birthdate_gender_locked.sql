-- 073 : date de naissance et genre figés en base, comme la ville (072).
--
-- L'app les affiche déjà avec un cadenas dans Modifier mon profil ; jusqu'ici
-- rien n'empêchait un appel direct à l'API de les changer. Désormais :
--   - la première valeur (champ encore vide, fin de l'inscription) passe ;
--   - un membre actif de l'équipe (admin_users) peut corriger une erreur
--     signalée au support ;
--   - les opérations serveur sans utilisateur connecté passent ;
--   - tout autre changement est refusé.

create or replace function public.profiles_lock_identity()
 returns trigger
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_uid uuid := (select auth.uid());
begin
  if (old.birth_date is null or new.birth_date is not distinct from old.birth_date)
     and (old.gender is null or new.gender is not distinct from old.gender) then
    return new;
  end if;
  if v_uid is null then
    return new;
  end if;
  if exists (select 1 from public.admin_users a where a.user_id = v_uid and a.is_active) then
    return new;
  end if;
  raise exception 'identite_verrouillee'
    using hint = 'Date de naissance et genre ne se modifient pas. Écris au support en cas d''erreur.';
end $function$;

drop trigger if exists profiles_lock_identity on public.profiles;
create trigger profiles_lock_identity
  before update of birth_date, gender on public.profiles
  for each row execute function public.profiles_lock_identity();
