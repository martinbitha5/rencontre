-- 072 : la ville ne change plus après l'inscription.
--
-- Décision produit du 27/11/2026 : la ville est choisie à l'inscription,
-- dans le pays choisi juste avant, et vérifiée par la position. Ensuite elle
-- est figée. Pour voir plus de monde, les filtres ouvrent « tout le pays »
-- (et seulement son pays, migration 071). L'app ne propose plus de changer de
-- ville (ni dans les filtres, ni dans Modifier mon profil) ; ce trigger tient
-- la règle même face à un appel direct à l'API.
--
-- Restent autorisés :
--   - la première ville (city_id encore vide, fin de l'inscription) ;
--   - un membre actif de l'équipe (admin_users), pour un déménagement signalé
--     au support ;
--   - les opérations serveur sans utilisateur connecté (service_role, SQL).

create or replace function public.profiles_lock_city()
 returns trigger
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_uid uuid := (select auth.uid());
begin
  if old.city_id is null or new.city_id is not distinct from old.city_id then
    return new;
  end if;
  if v_uid is null then
    return new;
  end if;
  if exists (select 1 from public.admin_users a where a.user_id = v_uid and a.is_active) then
    return new;
  end if;
  raise exception 'ville_verrouillee'
    using hint = 'La ville est fixée à l''inscription. Écris au support en cas de déménagement.';
end $function$;

drop trigger if exists profiles_lock_city on public.profiles;
create trigger profiles_lock_city
  before update of city_id on public.profiles
  for each row execute function public.profiles_lock_city();
