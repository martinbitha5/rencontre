-- 020 : le match mutuel redevient gratuit.
--
-- Avant : les profils qui m'avaient liké étaient retirés du feed Découvrir et
-- swipe() refusait le match (statut 'liked_you') pour forcer le like retour
-- payant depuis Activité. Conséquence : sans pièces, impossible de matcher.
-- Maintenant : ces profils réapparaissent dans le feed et un like mutuel crée
-- le match, gratuitement. Le like retour payant reste un raccourci (matcher
-- tout de suite depuis Activité sans attendre de croiser le profil).
-- (Copie locale de la migration appliquée via MCP le 2026-07-27.)

-- 1. Feed Découvrir : on ne cache plus les profils qui m'ont liké.
create or replace function public.get_discovery_feed(p_limit integer default 20)
returns table(user_id uuid, display_name text, birth_date date, gender public.gender,
  city_name text, bio text, photos jsonb, last_active_at timestamptz,
  height_cm smallint, job_title text, education text, relationship_goal text,
  has_children text, wants_children text, smoking text, drinking text,
  religion text, commune text, languages text[], interests text[])
language sql stable security definer set search_path to ''
as $$
  select p.user_id, p.display_name, p.birth_date, p.gender, c.name, p.bio,
    coalesce((
      select jsonb_agg(jsonb_build_object('id', ph.id, 'path', ph.storage_path) order by ph.position)
      from public.photos ph where ph.user_id = p.user_id
    ), '[]'::jsonb),
    p.last_active_at,
    p.height_cm, p.job_title, p.education, p.relationship_goal,
    p.has_children, p.wants_children, p.smoking, p.drinking,
    p.religion, p.commune, p.languages, p.interests
  from public.profiles p
  join public.cities c on c.id = p.city_id
  join public.profiles me on me.user_id = (select auth.uid())
  where p.user_id <> me.user_id
    and me.is_onboarded and not me.is_banned
    and p.is_onboarded and not p.is_banned
    and not p.incognito
    and (p.city_id = me.city_id or me.search_whole_country)
    and p.gender = me.looking_for
    and p.looking_for = me.gender
    and extract(year from age(p.birth_date))::int between me.age_min and me.age_max
    and extract(year from age(me.birth_date))::int between p.age_min and p.age_max
    and (me.filter_goals is null or p.relationship_goal = any(me.filter_goals))
    and (me.filter_religions is null or p.religion = any(me.filter_religions))
    and (me.filter_has_children is null or p.has_children = me.filter_has_children)
    and (me.filter_smoking is null
      or (me.filter_smoking = 'non' and p.smoking = 'jamais')
      or (me.filter_smoking = 'oui' and p.smoking in ('parfois', 'souvent')))
    and (not me.filter_online_only or p.last_active_at > now() - interval '15 minutes')
    and not exists (select 1 from public.swipes s where s.swiper_id = me.user_id and s.target_id = p.user_id)
    and not exists (
      select 1 from public.matches m
      where m.user_a = least(me.user_id, p.user_id) and m.user_b = greatest(me.user_id, p.user_id)
    )
    and not exists (
      select 1 from public.blocks b
      where (b.blocker_id = me.user_id and b.blocked_id = p.user_id)
         or (b.blocker_id = p.user_id and b.blocked_id = me.user_id)
    )
  order by p.last_active_at desc
  limit least(greatest(p_limit, 1), 50);
$$;

-- 2. Feed soirée : même règle.
create or replace function public.get_event_feed(p_event uuid, p_limit integer default 20)
returns table(user_id uuid, display_name text, birth_date date, gender public.gender,
  city_name text, bio text, photos jsonb, last_active_at timestamptz,
  height_cm smallint, job_title text, education text, relationship_goal text,
  has_children text, wants_children text, smoking text, drinking text,
  religion text, commune text, languages text[], interests text[])
language plpgsql stable security definer set search_path to ''
as $$
declare
  v_me uuid := (select auth.uid());
begin
  if not exists (
    select 1 from public.event_attendees a
    join public.events e on e.id = a.event_id
    where a.event_id = p_event and a.user_id = v_me
      and e.is_active and (e.ends_at is null or e.ends_at > now())
  ) then
    raise exception 'non_participant';
  end if;

  return query
  select p.user_id, p.display_name, p.birth_date, p.gender, c.name, p.bio,
    coalesce((
      select jsonb_agg(jsonb_build_object('id', ph.id, 'path', ph.storage_path) order by ph.position)
      from public.photos ph where ph.user_id = p.user_id
    ), '[]'::jsonb),
    p.last_active_at,
    p.height_cm, p.job_title, p.education, p.relationship_goal,
    p.has_children, p.wants_children, p.smoking, p.drinking,
    p.religion, p.commune, p.languages, p.interests
  from public.event_attendees a
  join public.profiles p on p.user_id = a.user_id
  left join public.cities c on c.id = p.city_id
  where a.event_id = p_event
    and a.user_id <> v_me
    and p.is_onboarded and not p.is_banned
    and not exists (select 1 from public.swipes s where s.swiper_id = v_me and s.target_id = p.user_id)
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
end $$;

-- 3. swipe() : un like mutuel crée le match, sans passer par le paiement.
create or replace function public.swipe(p_target uuid, p_liked boolean)
returns jsonb
language plpgsql security definer set search_path to ''
as $$
declare
  v_me uuid := (select auth.uid());
  v_is_premium boolean;
  v_likes_today int;
  v_match_id uuid;
begin
  if v_me is null then raise exception 'non_authentifie'; end if;
  if p_target = v_me then raise exception 'cible_invalide'; end if;
  if not exists (
    select 1 from public.profiles where user_id = p_target and is_onboarded and not is_banned
  ) then
    raise exception 'profil_introuvable';
  end if;

  if p_liked then
    select coalesce(e.is_premium and (e.expires_at is null or e.expires_at > now()), false)
      into v_is_premium
      from public.entitlements e where e.user_id = v_me;
    if not coalesce(v_is_premium, false) then
      select count(*) into v_likes_today
      from public.swipes
      where swiper_id = v_me and liked and created_at >= date_trunc('day', now());
      if v_likes_today >= 30 then
        return jsonb_build_object('status', 'limit_reached');
      end if;
    end if;
  end if;

  insert into public.swipes (swiper_id, target_id, liked)
  values (v_me, p_target, p_liked)
  on conflict (swiper_id, target_id) do nothing;

  if not p_liked then
    return jsonb_build_object('status', 'ok');
  end if;

  if exists (select 1 from public.swipes where swiper_id = p_target and target_id = v_me and liked) then
    insert into public.matches (user_a, user_b)
    values (least(v_me, p_target), greatest(v_me, p_target))
    on conflict (user_a, user_b) do update set is_active = true, status = 'active'
    returning id into v_match_id;
    return jsonb_build_object('status', 'match', 'match_id', v_match_id);
  end if;

  return jsonb_build_object('status', 'ok');
end $$;

-- 4. like_from_history() : idem, et le match est créé si c'est mutuel.
create or replace function public.like_from_history(p_target uuid)
returns jsonb
language plpgsql security definer set search_path to ''
as $$
declare
  v_me uuid := (select auth.uid());
  v_is_premium boolean;
  v_likes_today int;
  v_match_id uuid;
begin
  if v_me is null then raise exception 'non_authentifie'; end if;
  if not exists (
    select 1 from public.swipes s
    where s.swiper_id = v_me and s.target_id = p_target and not s.liked
  ) then raise exception 'introuvable'; end if;
  if not exists (
    select 1 from public.profiles where user_id = p_target and is_onboarded and not is_banned
  ) then raise exception 'profil_introuvable'; end if;

  select coalesce(e.is_premium and (e.expires_at is null or e.expires_at > now()), false)
    into v_is_premium from public.entitlements e where e.user_id = v_me;
  if not coalesce(v_is_premium, false) then
    select count(*) into v_likes_today from public.swipes
    where swiper_id = v_me and liked and created_at >= date_trunc('day', now());
    if v_likes_today >= 30 then
      return jsonb_build_object('status', 'limit_reached');
    end if;
  end if;

  update public.swipes set liked = true, created_at = now()
  where swiper_id = v_me and target_id = p_target;

  if exists (select 1 from public.swipes where swiper_id = p_target and target_id = v_me and liked) then
    insert into public.matches (user_a, user_b)
    values (least(v_me, p_target), greatest(v_me, p_target))
    on conflict (user_a, user_b) do update set is_active = true, status = 'active'
    returning id into v_match_id;
    return jsonb_build_object('status', 'match', 'match_id', v_match_id);
  end if;

  return jsonb_build_object('status', 'ok');
end $$;
