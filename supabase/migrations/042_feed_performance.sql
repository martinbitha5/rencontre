-- ---------------------------------------------------------------------------
-- 042 : le feed de découverte tient la charge
--
-- Test de charge du 2026-08-02 sur 100 000 profils, 105 000 swipes,
-- 50 000 matchs et 250 000 messages, avec un compte ayant déjà vu 5 000
-- profils (les plus récemment actifs, donc le haut exact de la file) :
--
--                        avant        après
--   feed ville          5 574 ms      2,7 ms
--   feed national      13 722 ms     57,6 ms
--
-- Deux causes, indépendantes l'une de l'autre :
--
-- 1. `me` était joint comme une table. Toutes les conditions du filtre
--    (ville, genre, âge) comparaient donc une colonne de `p` à une colonne de
--    `me`, valeurs inconnues au moment de la planification. Le planificateur ne
--    pouvait pas descendre le filtre dans l'index et parcourait les profils.
--    En chargeant `me` dans une variable, ces conditions deviennent des
--    constantes et l'index redevient utilisable. `force_custom_plan` garantit
--    que le plan est recalculé avec les vraies valeurs à chaque appel, sinon
--    Postgres bascule sur un plan générique après cinq exécutions et le gain
--    disparaît.
--
-- 2. `extract(year from age(p.birth_date)) between ...` calculait l'âge de
--    chaque profil, ligne par ligne, et interdisait tout usage d'index sur la
--    date de naissance. La même règle exprimée en bornes de dates coûte une
--    comparaison. Les bornes sont calculées une fois, à partir de la date du
--    jour : un profil est retenu si sa date de naissance est postérieure à
--    (aujourd'hui - age_max - 1 an), exclue, et antérieure ou égale à
--    (aujourd'hui - age_min). Le résultat est identique à l'ancien calcul,
--    bornes comprises.
--
-- Le tri par activité récente vient désormais de l'index. Sans filtre de
-- ville, la ville ne peut plus servir de préfixe : d'où un second index dédié
-- à la recherche nationale.
-- ---------------------------------------------------------------------------

-- Les deux index portent le même filtre partiel que le feed, pour que seules
-- les lignes réellement affichables soient parcourues.
create index if not exists profiles_feed_city_idx
  on public.profiles (city_id, gender, last_active_at desc)
  where is_onboarded and not is_banned and not shadowbanned and not incognito;

create index if not exists profiles_feed_country_idx
  on public.profiles (gender, last_active_at desc)
  where is_onboarded and not is_banned and not shadowbanned and not incognito;

-- Remplacé par profiles_feed_city_idx, qui couvre le même accès avec un filtre
-- plus étroit. Un index de moins sur profiles, c'est autant d'écritures
-- économisées à chaque battement de présence.
drop index if exists public.profiles_feed_idx;

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
