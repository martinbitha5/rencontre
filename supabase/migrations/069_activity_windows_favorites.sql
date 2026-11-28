-- 069 : fenêtres de l'onglet Activité et favoris hors du fil.
--
-- 1. Likes reçus : un like reste visible 7 jours dans Activité, plus
--    éternellement. Le like lui-même reste en base (un swipe à droite en retour
--    crée toujours le match), il ne s'affiche simplement plus dans la liste.
-- 2. Vues : déjà limitées aux dernières 24 heures (get_profile_views), rien
--    ne change.
-- 3. Favoris : un profil mis en favori quitte Rencontres et ne revient plus
--    dans le fil, ni dans celui d'une soirée. Il se retrouve dans l'onglet
--    Favoris d'Activité. Les favoris restent strictement privés : la table
--    n'est lisible que par son propriétaire (favorites_select_own), aucune
--    notification ni aucun compteur n'en parle à la personne concernée.

-- 1. Likes reçus, 7 jours ---------------------------------------------------
create or replace function public.get_likers()
 returns table(user_id uuid, display_name text, birth_date date, gender public.gender, city_name text, bio text, photos jsonb, last_active_at timestamp with time zone, height_cm smallint, job_title text, education text, relationship_goal text, has_children text, wants_children text, smoking text, drinking text, religion text, commune text, languages text[], interests text[], liked_at timestamp with time zone, is_verified boolean)
 language sql
 stable security definer
 set search_path to ''
as $function$
  select p.user_id, p.display_name, p.birth_date, p.gender, c.name, p.bio,
    coalesce((
      select jsonb_agg(jsonb_build_object('id', ph.id, 'path', ph.storage_path) order by ph.position)
      from public.photos ph where ph.user_id = p.user_id
    ), '[]'::jsonb),
    case when p.incognito or not p.show_online then null else p.last_active_at end,
    p.height_cm, p.job_title, p.education, p.relationship_goal,
    p.has_children, p.wants_children, p.smoking, p.drinking,
    p.religion, p.commune, p.languages, p.interests,
    s.created_at, p.is_verified
  from public.swipes s
  join public.profiles p on p.user_id = s.swiper_id
  left join public.cities c on c.id = p.city_id
  where s.target_id = (select auth.uid()) and s.liked
    -- Un like reçu s'affiche 7 jours, puis disparaît de la liste.
    and s.created_at > now() - interval '7 days'
    and p.is_onboarded and not p.is_banned
    and not p.shadowbanned
    and not exists (
      select 1 from public.swipes s2
      where s2.swiper_id = (select auth.uid()) and s2.target_id = p.user_id and s2.liked
    )
    and not exists (
      select 1 from public.matches m
      where m.user_a = least((select auth.uid()), p.user_id)
        and m.user_b = greatest((select auth.uid()), p.user_id)
    )
    and not exists (
      select 1 from public.blocks b
      where (b.blocker_id = (select auth.uid()) and b.blocked_id = p.user_id)
         or (b.blocker_id = p.user_id and b.blocked_id = (select auth.uid()))
    )
  order by s.created_at desc
  limit 100;
$function$;

-- 3a. Fil Rencontres sans les favoris ---------------------------------------
create or replace function public.get_discovery_feed(p_limit integer default 20)
 returns table(user_id uuid, display_name text, birth_date date, gender public.gender, city_name text, bio text, photos jsonb, last_active_at timestamp with time zone, height_cm smallint, job_title text, education text, relationship_goal text, has_children text, wants_children text, smoking text, drinking text, religion text, commune text, languages text[], interests text[], is_verified boolean)
 language plpgsql
 stable security definer
 set search_path to ''
 set plan_cache_mode to 'force_custom_plan'
as $function$
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
    case when p.incognito or not p.show_online then null else p.last_active_at end,
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
    and (not me.filter_online_only or (p.show_online and p.last_active_at > now() - interval '15 minutes'))
    -- Filtre certifiés : ne montrer que les profils au badge bleu.
    and (not me.filter_verified_only or p.is_verified)
    and not exists (
      select 1 from public.swipes s
      where s.swiper_id = me.user_id and s.target_id = p.user_id
    )
    -- Mis en favori : rangé dans Activité, il ne repasse plus dans le fil.
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

-- 3b. Fil d'une soirée sans les favoris -------------------------------------
create or replace function public.get_event_feed(p_event uuid, p_limit integer default 20)
 returns table(user_id uuid, display_name text, birth_date date, gender public.gender, city_name text, bio text, photos jsonb, last_active_at timestamp with time zone, height_cm smallint, job_title text, education text, relationship_goal text, has_children text, wants_children text, smoking text, drinking text, religion text, commune text, languages text[], interests text[], is_verified boolean)
 language plpgsql
 stable security definer
 set search_path to ''
as $function$
declare
  v_me uuid := (select auth.uid());
begin
  if not exists (
    select 1 from public.event_attendees a
    where a.event_id = p_event and a.user_id = v_me
  ) or not public.event_is_open(p_event) then
    raise exception 'non_participant';
  end if;

  return query
  select p.user_id, p.display_name, p.birth_date, p.gender, c.name, p.bio,
    coalesce((
      select jsonb_agg(jsonb_build_object('id', ph.id, 'path', ph.storage_path) order by ph.position)
      from public.photos ph where ph.user_id = p.user_id
    ), '[]'::jsonb),
    case when p.incognito or not p.show_online then null else p.last_active_at end,
    p.height_cm, p.job_title, p.education, p.relationship_goal,
    p.has_children, p.wants_children, p.smoking, p.drinking,
    p.religion, p.commune, p.languages, p.interests, p.is_verified
  from public.event_attendees a
  join public.profiles p on p.user_id = a.user_id
  left join public.cities c on c.id = p.city_id
  where a.event_id = p_event
    and a.user_id <> v_me
    and p.is_onboarded and not p.is_banned
    and not p.incognito
    and not exists (
      select 1 from public.event_swipes es
      where es.event_id = p_event and es.swiper_id = v_me and es.target_id = p.user_id
    )
    and not exists (
      select 1 from public.swipes s
      where s.swiper_id = v_me and s.target_id = p.user_id and s.liked
    )
    and not exists (
      select 1 from public.swipes sl
      where sl.swiper_id = p.user_id and sl.target_id = v_me and sl.liked
    )
    -- Mis en favori : rangé dans Activité, il ne repasse plus dans le fil.
    and not exists (
      select 1 from public.favorites f
      where f.user_id = v_me and f.target_id = p.user_id
    )
    and not exists (
      select 1 from public.matches m
      where m.user_a = least(v_me, p.user_id) and m.user_b = greatest(v_me, p.user_id)
    )
    and not exists (
      select 1 from public.blocks b
      where (b.blocker_id = v_me and b.blocked_id = p.user_id)
         or (b.blocker_id = p.user_id and b.blocked_id = v_me)
    )
  order by a.created_at desc
  limit least(greatest(p_limit, 1), 50);
end $function$;
