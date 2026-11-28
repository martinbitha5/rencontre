-- ---------------------------------------------------------------------------
-- 084 : l'autre Congo, avec le choix de la ville (28/11/2026)
--
-- Retour de l'utilisateur sur 083 : garder le réglage d'avant (« Chercher
-- uniquement dans la ville », pour MON pays) et y ajouter l'autre Congo à
-- part, en précisant la ville. Donc :
--   search_scope          'city' ou 'country' : ma zone dans mon pays ;
--   other_congo_enabled   voir aussi des profils de l'autre Congo ;
--   other_congo_city_id   la ville choisie là-bas (Brazzaville, Kinshasa...),
--                         null = toutes ses villes.
-- L'ancienne valeur 'both' de 083 est reprise : mon pays entier, plus tout
-- l'autre Congo.
-- ---------------------------------------------------------------------------

alter table public.profiles
  add column if not exists other_congo_enabled boolean not null default false,
  add column if not exists other_congo_city_id smallint references public.cities (id) on delete set null;

comment on column public.profiles.other_congo_enabled is
  'Le fil Rencontres montre aussi des profils de l''autre Congo.';
comment on column public.profiles.other_congo_city_id is
  'Ville de l''autre Congo choisie dans les filtres. null = toutes ses villes.';

update public.profiles
   set search_scope = 'country', other_congo_enabled = true
 where search_scope = 'both';

-- Garde-fous : 'both' n'est plus écrit qu'en ancien format (repris ici), et
-- la ville choisie doit bien être de l'AUTRE pays.
create or replace function public.profiles_sync_search_scope()
returns trigger
language plpgsql
set search_path to ''
as $function$
declare
  v_mine text;
  v_other text;
begin
  if new.search_scope = 'both' then
    new.search_scope := 'country';
    new.other_congo_enabled := true;
  end if;

  if tg_op = 'UPDATE' and new.search_scope is distinct from old.search_scope then
    new.search_whole_country := new.search_scope <> 'city';
  elsif tg_op = 'UPDATE' and new.search_whole_country is distinct from old.search_whole_country then
    new.search_scope := case when new.search_whole_country then 'country' else 'city' end;
  end if;

  if new.other_congo_city_id is not null then
    select country into v_mine from public.cities where id = new.city_id;
    select country into v_other from public.cities where id = new.other_congo_city_id;
    if v_other is null or v_other = v_mine then
      new.other_congo_city_id := null;
    end if;
  end if;
  return new;
end $function$;

drop trigger if exists profiles_sync_search_scope on public.profiles;
create trigger profiles_sync_search_scope
  before update of search_scope, search_whole_country, other_congo_city_id, city_id on public.profiles
  for each row execute function public.profiles_sync_search_scope();

-- Fil Rencontres : ma zone, plus l'autre Congo si demandé.
do $$
declare
  d text;
  old_rule text := '(p.city_id = me.city_id
      or (me.search_scope = ''country'' and c.country = coalesce(my_country, ''CD''))
      or me.search_scope = ''both'')';
  new_rule text := '(p.city_id = me.city_id
      or (me.search_scope <> ''city'' and c.country = coalesce(my_country, ''CD''))
      or (me.other_congo_enabled
          and c.country <> coalesce(my_country, ''CD'')
          and (me.other_congo_city_id is null or p.city_id = me.other_congo_city_id)))';
begin
  select pg_get_functiondef('public.get_discovery_feed(integer)'::regprocedure) into d;
  if position(old_rule in d) = 0 then
    raise exception 'get_discovery_feed : règle de zone introuvable, rien n''est modifié';
  end if;
  execute replace(d, old_rule, new_rule);
end $$;

-- Filtre de réception des DM : même zone, autre Congo compris.
do $$
declare
  d text;
  old_rule text := '(t.search_scope = ''city'' or (t.search_scope = ''country'' and (select ci.country from public.cities ci where ci.id = s.city_id) is distinct from (select ci.country from public.cities ci where ci.id = t.city_id)))';
  new_rule text := '(not (t.search_scope <> ''city'' and (select ci.country from public.cities ci where ci.id = s.city_id) is not distinct from (select ci.country from public.cities ci where ci.id = t.city_id)) and not (t.other_congo_enabled and (select ci.country from public.cities ci where ci.id = s.city_id) is distinct from (select ci.country from public.cities ci where ci.id = t.city_id) and (t.other_congo_city_id is null or s.city_id = t.other_congo_city_id)))';
begin
  select pg_get_functiondef('public.send_direct_message(uuid, text)'::regprocedure) into d;
  if position(old_rule in d) = 0 then
    raise exception 'send_direct_message : règle de zone introuvable, rien n''est modifié';
  end if;
  execute replace(d, old_rule, new_rule);
end $$;

-- Le profil est protégé colonne par colonne : l'app doit pouvoir écrire ces
-- trois réglages de filtre (le trigger ci-dessus valide la ville).
grant update (search_scope, other_congo_enabled, other_congo_city_id) on public.profiles to authenticated;
