-- ---------------------------------------------------------------------------
-- 083 : zone de recherche, jusqu'aux deux Congo (28/11/2026)
--
-- Avant : « ma ville » ou « tout mon pays » (search_whole_country). Kinshasa
-- et Brazzaville ne se voyaient jamais.
-- Maintenant, profiles.search_scope :
--   'city'    ma ville seulement ;
--   'country' toutes les villes de mon pays ;
--   'both'    les deux Congo, RDC et Congo-Brazzaville.
-- Le choix vaut pour moi seul : élargir ma zone ne m'impose à personne,
-- exactement comme avant pour la ville (les critères de genre et d'âge
-- restent réciproques, eux).
--
-- search_whole_country reste en place et suit search_scope (trigger), pour
-- les anciennes versions de l'app qui l'écrivent encore.
--
-- Le fil rend aussi le pays de chaque profil : la carte peut afficher
-- « Brazzaville, Congo-Brazzaville » à quelqu'un de Kinshasa.
-- ---------------------------------------------------------------------------

alter table public.profiles
  add column if not exists search_scope text not null default 'city'
    check (search_scope in ('city', 'country', 'both'));

comment on column public.profiles.search_scope is
  'Zone du fil Rencontres : city (ma ville), country (mon pays), both (les deux Congo).';

update public.profiles
   set search_scope = case when search_whole_country then 'country' else 'city' end
 where search_scope = 'city' and search_whole_country;

-- Les deux colonnes restent d'accord, quelle que soit celle qu'on écrit.
create or replace function public.profiles_sync_search_scope()
returns trigger
language plpgsql
set search_path to ''
as $function$
begin
  if tg_op = 'UPDATE' and new.search_scope is distinct from old.search_scope then
    new.search_whole_country := new.search_scope <> 'city';
  elsif tg_op = 'UPDATE' and new.search_whole_country is distinct from old.search_whole_country then
    -- Ancienne app : elle ne connaît que le booléen.
    new.search_scope := case when new.search_whole_country then 'country' else 'city' end;
  end if;
  return new;
end $function$;

drop trigger if exists profiles_sync_search_scope on public.profiles;
create trigger profiles_sync_search_scope
  before update of search_scope, search_whole_country on public.profiles
  for each row execute function public.profiles_sync_search_scope();

-- Fil Rencontres : même règles qu'avant, zone étendue, pays rendu.
drop function if exists public.get_discovery_feed(integer);
create function public.get_discovery_feed(p_limit integer default 20)
returns table(user_id uuid, display_name text, birth_date date, gender gender, city_name text, bio text, photos jsonb, last_active_at timestamp with time zone, height_cm smallint, job_title text, education text, relationship_goal text, has_children text, wants_children text, smoking text, drinking text, religion text, commune text, languages text[], interests text[], is_verified boolean, country text)
language plpgsql
stable security definer
set search_path to ''
set plan_cache_mode to 'force_custom_plan'
as $function$
#variable_conflict use_column
declare
  me         public.profiles%rowtype;
  my_age     int;
  my_country text;
  d_min      date;
  d_max      date;
begin
  select * into me from public.profiles p where p.user_id = (select auth.uid());

  if me.user_id is null or not me.is_onboarded or me.is_banned then
    return;
  end if;

  select ci.country into my_country from public.cities ci where ci.id = me.city_id;

  my_age := extract(year from age(me.birth_date))::int;
  d_min  := (current_date - ((me.age_max + 1) || ' years')::interval)::date;
  d_max  := (current_date - (me.age_min || ' years')::interval)::date;

  return query
  select p.user_id, p.display_name, p.birth_date, p.gender, c.name, p.bio,
    coalesce((
      select jsonb_agg(jsonb_build_object('id', ph.id, 'path', ph.storage_path) order by ph.position)
      from public.photos ph where ph.user_id = p.user_id
    ), '[]'::jsonb),
    case when p.incognito or not p.show_online then null else p.last_active_at end,
    p.height_cm, p.job_title, p.education, p.relationship_goal,
    p.has_children, p.wants_children, p.smoking, p.drinking,
    p.religion, p.commune, p.languages, p.interests,
    p.is_verified,
    c.country
  from public.profiles p
  join public.cities c on c.id = p.city_id
  where p.user_id <> me.user_id
    and p.is_onboarded and not p.is_banned
    and not p.shadowbanned
    and not p.incognito
    -- Zone : ma ville, mon pays, ou les deux Congo.
    and (p.city_id = me.city_id
      or (me.search_scope = 'country' and c.country = coalesce(my_country, 'CD'))
      or me.search_scope = 'both')
    and p.gender = me.looking_for
    and p.looking_for = me.gender
    and p.birth_date >  d_min
    and p.birth_date <= d_max
    and p.age_min <= my_age
    and p.age_max >= my_age
    and (me.filter_goals is null or p.relationship_goal = any(me.filter_goals))
    and (me.filter_religions is null or p.religion = any(me.filter_religions))
    and (me.filter_has_children is null or p.has_children = me.filter_has_children)
    and (me.filter_smoking is null
      or (me.filter_smoking = 'non' and p.smoking = 'jamais')
      or (me.filter_smoking = 'oui' and p.smoking in ('parfois', 'souvent')))
    and (not me.filter_online_only or (p.show_online and p.last_active_at > now() - interval '15 minutes'))
    and (not me.filter_verified_only or p.is_verified)
    and not exists (
      select 1 from public.swipes s
      where s.swiper_id = me.user_id and s.target_id = p.user_id
    )
    and not exists (
      select 1 from public.favorites f
      where f.user_id = me.user_id and f.target_id = p.user_id
    )
    and not exists (
      select 1 from public.matches m
      where m.user_a = least(me.user_id, p.user_id)
        and m.user_b = greatest(me.user_id, p.user_id)
    )
    and not exists (
      select 1 from public.blocks b
      where (b.blocker_id = me.user_id and b.blocked_id = p.user_id)
         or (b.blocker_id = p.user_id and b.blocked_id = me.user_id)
    )
  order by p.last_active_at desc
  limit least(greatest(p_limit, 1), 50);
end;
$function$;

revoke all on function public.get_discovery_feed(integer) from public, anon;
grant execute on function public.get_discovery_feed(integer) to authenticated, service_role;

-- Filtre de réception des DM : la zone du destinataire suit la même règle.
do $$
declare
  d text;
  old_rule text := '(not t.search_whole_country or (select ci.country from public.cities ci where ci.id = s.city_id) is distinct from (select ci.country from public.cities ci where ci.id = t.city_id))';
  new_rule text := '(t.search_scope = ''city'' or (t.search_scope = ''country'' and (select ci.country from public.cities ci where ci.id = s.city_id) is distinct from (select ci.country from public.cities ci where ci.id = t.city_id)))';
begin
  select pg_get_functiondef('public.send_direct_message(uuid, text)'::regprocedure) into d;
  if position(old_rule in d) = 0 then
    raise exception 'send_direct_message : règle de zone introuvable, rien n''est modifié';
  end if;
  execute replace(d, old_rule, new_rule);
end $$;
