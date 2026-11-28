-- 074 : Zola est ouvert de 18 à 60 ans.
--
-- Décision produit du 27/11/2026. La tranche d'âge des filtres passe de
-- 18-99 à 18-60, et l'inscription n'accepte plus plus de 60 ans (sinon la
-- personne serait inscrite mais invisible : aucun filtre ne monterait jusqu'à
-- son âge). Au moment de la migration, aucun profil n'a plus de 60 ans.
--
--   - les fourchettes au-dessus de 60 sont ramenées à 60 ;
--   - la valeur par défaut de age_max devient 60 ;
--   - les bornes sont tenues en base : 18 <= age_min <= age_max <= 60 ;
--   - une date de naissance de plus de 60 ans est refusée à l'inscription
--     (seulement quand elle est posée ou changée : un membre qui fête ses
--     61 ans n'est pas bloqué pour autant).

update public.profiles set age_max = 60 where age_max > 60;
update public.profiles set age_min = least(age_min, age_max);

alter table public.profiles alter column age_max set default 60;

alter table public.profiles drop constraint if exists profiles_age_max_check;
alter table public.profiles add constraint profiles_age_max_check check (age_max <= 60);

create or replace function public.profiles_check_signup_age()
 returns trigger
 language plpgsql
 set search_path to ''
as $function$
begin
  if new.birth_date is not null
     and (tg_op = 'INSERT' or new.birth_date is distinct from old.birth_date)
     and new.birth_date <= (current_date - interval '61 years')::date then
    raise exception 'age_hors_tranche'
      using hint = 'Zola est ouvert de 18 à 60 ans.';
  end if;
  return new;
end $function$;

drop trigger if exists profiles_check_signup_age on public.profiles;
create trigger profiles_check_signup_age
  before insert or update of birth_date on public.profiles
  for each row execute function public.profiles_check_signup_age();
