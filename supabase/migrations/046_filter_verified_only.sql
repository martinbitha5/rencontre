-- Dowe : filtre « Profils certifiés uniquement » (gratuit), pour la page
-- Filtres redessinée. La vérification existe depuis la migration 024 ; il ne
-- manquait que le filtre de recherche côté chercheur.

alter table public.profiles
  add column if not exists filter_verified_only boolean not null default false;

-- Grant colonne par colonne, comme pour les autres filtres (leçon 008/017) :
-- sans lui, l'update RLS du propriétaire échoue en silence.
grant update (filter_verified_only) on public.profiles to authenticated;

-- get_discovery_feed : même corps que la 042 (version optimisée), plus la
-- condition du filtre certifié. Signature inchangée, les droits sont
-- conservés par create or replace.
create or replace function public.get_discovery_feed(p_limit integer default 20)
returns table(user_id uuid, display_name text, birth_date date, gender public.gender,
  city_name text, bio text, photos jsonb, last_active_at timestamptz,
  height_cm smallint, job_title text, education text, relationship_goal text,
  has_children text, wants_children text, smoking text, drinking text,
  religion text, commune text, languages text[], interests text[], is_verified boolean)
language plpgsql
stable
security definer
set search_path to ''
set plan_cache_mode to 'force_custom_plan'
as $fn$
#variable_conflict use_column
declare
  me     public.profiles%rowtype;
  my_age int;
  d_min  date;
  d_max  date;
begin
  select * into me from public.profiles p where p.user_id = (select auth.uid());

  -- Compte absent, incomplet ou sanctionné : file vide, comme avant.
  if me.user_id is null or not me.is_onboarded or me.is_banned then
    return;
  end if;

  my_age := extract(year from age(me.birth_date))::int;
  d_min  := (current_date - ((me.age_max + 1) || ' years')::interval)::date;
  d_max  := (current_date - (me.age_min || ' years')::interval)::date;

  return query
  select p.user_id, p.display_name, p.birth_date, p.gender, c.name, p.bio,
    coalesce((
      select jsonb_agg(jsonb_build_object('id', ph.id, 'path', ph.storage_path) order by ph.position)
      from public.photos ph where ph.user_id = p.user_id
    ), '[]'::jsonb),
    p.last_active_at,
    p.height_cm, p.job_title, p.education, p.relationship_goal,
    p.has_children, p.wants_children, p.smoking, p.drinking,
    p.religion, p.commune, p.languages, p.interests,
    p.is_verified
  from public.profiles p
  join public.cities c on c.id = p.city_id
  where p.user_id <> me.user_id
    and p.is_onboarded and not p.is_banned
    and not p.shadowbanned
    and not p.incognito
    and (me.search_whole_country or p.city_id = me.city_id)
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
    and (not me.filter_online_only or p.last_active_at > now() - interval '15 minutes')
    -- Filtre certifiés : ne montrer que les profils au badge bleu.
    and (not me.filter_verified_only or p.is_verified)
    and not exists (
      select 1 from public.swipes s
      where s.swiper_id = me.user_id and s.target_id = p.user_id
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
$fn$;
