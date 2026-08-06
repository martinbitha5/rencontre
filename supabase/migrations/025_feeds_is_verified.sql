-- 025 — Le badge « profil vérifié » remonte dans les feeds
--
-- Un badge de confiance ne sert à rien s'il ne se voit que sur son propre
-- profil. Les cinq fonctions qui renvoient une carte de profil exposent donc
-- `is_verified`. Changer le type de retour impose un DROP, et un DROP efface
-- les droits : les GRANT sont reposés en fin de fichier.

drop function if exists public.get_discovery_feed(integer);
create function public.get_discovery_feed(p_limit integer default 20)
returns table (
  user_id uuid, display_name text, birth_date date, gender public.gender,
  city_name text, bio text, photos jsonb, last_active_at timestamptz,
  height_cm smallint, job_title text, education text, relationship_goal text,
  has_children text, wants_children text, smoking text, drinking text,
  religion text, commune text, languages text[], interests text[],
  is_verified boolean
)
language sql
stable
security definer
set search_path = ''
as $$
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
  join public.profiles me on me.user_id = (select auth.uid())
  where p.user_id <> me.user_id
    and me.is_onboarded and not me.is_banned
    and p.is_onboarded and not p.is_banned
    and not p.shadowbanned
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

drop function if exists public.get_likers();
create function public.get_likers()
returns table (
  user_id uuid, display_name text, birth_date date, gender public.gender,
  city_name text, bio text, photos jsonb, last_active_at timestamptz,
  height_cm smallint, job_title text, education text, relationship_goal text,
  has_children text, wants_children text, smoking text, drinking text,
  religion text, commune text, languages text[], interests text[],
  liked_at timestamptz, is_verified boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select p.user_id, p.display_name, p.birth_date, p.gender, c.name, p.bio,
    coalesce((
      select jsonb_agg(jsonb_build_object('id', ph.id, 'path', ph.storage_path) order by ph.position)
      from public.photos ph where ph.user_id = p.user_id
    ), '[]'::jsonb),
    p.last_active_at,
    p.height_cm, p.job_title, p.education, p.relationship_goal,
    p.has_children, p.wants_children, p.smoking, p.drinking,
    p.religion, p.commune, p.languages, p.interests,
    s.created_at, p.is_verified
  from public.swipes s
  join public.profiles p on p.user_id = s.swiper_id
  left join public.cities c on c.id = p.city_id
  where s.target_id = (select auth.uid()) and s.liked
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
$$;

drop function if exists public.get_event_feed(uuid, integer);
create function public.get_event_feed(p_event uuid, p_limit integer default 20)
returns table (
  user_id uuid, display_name text, birth_date date, gender public.gender,
  city_name text, bio text, photos jsonb, last_active_at timestamptz,
  height_cm smallint, job_title text, education text, relationship_goal text,
  has_children text, wants_children text, smoking text, drinking text,
  religion text, commune text, languages text[], interests text[],
  is_verified boolean
)
language plpgsql
stable
security definer
set search_path = ''
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
    p.religion, p.commune, p.languages, p.interests,
    p.is_verified
  from public.event_attendees a
  join public.profiles p on p.user_id = a.user_id
  left join public.cities c on c.id = p.city_id
  where a.event_id = p_event
    and a.user_id <> v_me
    and p.is_onboarded and not p.is_banned
    and not p.shadowbanned
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
end;
$$;

drop function if exists public.get_favorites();
create function public.get_favorites()
returns table (
  user_id uuid, display_name text, birth_date date, gender public.gender,
  city_name text, bio text, photos jsonb, last_active_at timestamptz,
  height_cm smallint, job_title text, education text, relationship_goal text,
  has_children text, wants_children text, smoking text, drinking text,
  religion text, commune text, languages text[], interests text[],
  favorited_at timestamptz, is_verified boolean
)
language sql stable security definer set search_path = ''
as $$
  select p.user_id, p.display_name, p.birth_date, p.gender, c.name, p.bio,
    coalesce((
      select jsonb_agg(jsonb_build_object('id', ph.id, 'path', ph.storage_path) order by ph.position)
      from public.photos ph where ph.user_id = p.user_id
    ), '[]'::jsonb),
    p.last_active_at,
    p.height_cm, p.job_title, p.education, p.relationship_goal,
    p.has_children, p.wants_children, p.smoking, p.drinking,
    p.religion, p.commune, p.languages, p.interests,
    f.created_at, p.is_verified
  from public.favorites f
  join public.profiles p on p.user_id = f.target_id
  left join public.cities c on c.id = p.city_id
  where f.user_id = (select auth.uid())
    and p.is_onboarded and not p.is_banned
    and not exists (
      select 1 from public.blocks b
      where (b.blocker_id = (select auth.uid()) and b.blocked_id = p.user_id)
         or (b.blocker_id = p.user_id and b.blocked_id = (select auth.uid()))
    )
  order by f.created_at desc;
$$;

drop function if exists public.get_passed_profiles();
create function public.get_passed_profiles()
returns table (
  user_id uuid, display_name text, birth_date date, gender public.gender,
  city_name text, bio text, photos jsonb, last_active_at timestamptz,
  height_cm smallint, job_title text, education text, relationship_goal text,
  has_children text, wants_children text, smoking text, drinking text,
  religion text, commune text, languages text[], interests text[],
  swiped_at timestamptz, is_verified boolean
)
language sql stable security definer set search_path = ''
as $$
  select p.user_id, p.display_name, p.birth_date, p.gender, c.name, p.bio,
    coalesce((
      select jsonb_agg(jsonb_build_object('id', ph.id, 'path', ph.storage_path) order by ph.position)
      from public.photos ph where ph.user_id = p.user_id
    ), '[]'::jsonb),
    p.last_active_at,
    p.height_cm, p.job_title, p.education, p.relationship_goal,
    p.has_children, p.wants_children, p.smoking, p.drinking,
    p.religion, p.commune, p.languages, p.interests,
    s.created_at, p.is_verified
  from public.swipes s
  join public.profiles p on p.user_id = s.target_id
  left join public.cities c on c.id = p.city_id
  where s.swiper_id = (select auth.uid()) and not s.liked
    and not s.hidden_from_history
    and p.is_onboarded and not p.is_banned
    and not exists (
      select 1 from public.blocks b
      where (b.blocker_id = (select auth.uid()) and b.blocked_id = p.user_id)
         or (b.blocker_id = p.user_id and b.blocked_id = (select auth.uid()))
    )
  order by s.created_at desc
  limit 200;
$$;

revoke execute on function public.get_discovery_feed(integer) from public, anon;
revoke execute on function public.get_likers() from public, anon;
revoke execute on function public.get_favorites() from public, anon;
revoke execute on function public.get_passed_profiles() from public, anon;
revoke execute on function public.get_event_feed(uuid, integer) from public, anon;

grant execute on function public.get_discovery_feed(integer) to authenticated;
grant execute on function public.get_likers() to authenticated;
grant execute on function public.get_favorites() to authenticated;
grant execute on function public.get_passed_profiles() to authenticated;
grant execute on function public.get_event_feed(uuid, integer) to authenticated;
