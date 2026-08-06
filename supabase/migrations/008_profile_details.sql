-- Dowe : champs de profil détaillés + RPC enrichies (appliqué le 2026-07-26)

alter table public.profiles
  add column if not exists height_cm smallint check (height_cm is null or height_cm between 100 and 250),
  add column if not exists job_title text check (job_title is null or char_length(job_title) <= 80),
  add column if not exists education text check (education is null or education in ('secondaire','universitaire','licence','master','doctorat','autre')),
  add column if not exists relationship_goal text check (relationship_goal is null or relationship_goal in ('relation_serieuse','mariage','amitie','je_me_laisse_surprendre')),
  add column if not exists has_children text check (has_children is null or has_children in ('non','oui')),
  add column if not exists wants_children text check (wants_children is null or wants_children in ('oui','non','peut_etre')),
  add column if not exists smoking text check (smoking is null or smoking in ('jamais','parfois','souvent')),
  add column if not exists drinking text check (drinking is null or drinking in ('jamais','parfois','souvent')),
  add column if not exists religion text check (religion is null or char_length(religion) <= 40),
  add column if not exists commune text check (commune is null or char_length(commune) <= 60),
  add column if not exists languages text[] not null default '{}' check (array_length(languages, 1) is null or array_length(languages, 1) <= 6),
  add column if not exists interests text[] not null default '{}' check (array_length(interests, 1) is null or array_length(interests, 1) <= 10);

-- Le type de retour change : drop obligatoire avant recréation
drop function if exists public.get_discovery_feed(int);
create function public.get_discovery_feed(p_limit int default 20)
returns table (
  user_id uuid, display_name text, birth_date date, gender public.gender,
  city_name text, bio text, photos jsonb, last_active_at timestamptz,
  height_cm smallint, job_title text, education text, relationship_goal text,
  has_children text, wants_children text, smoking text, drinking text,
  religion text, commune text, languages text[], interests text[]
)
language sql security definer set search_path = '' stable as $$
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
    and p.city_id = me.city_id
    and p.gender = me.looking_for
    and p.looking_for = me.gender
    and extract(year from age(p.birth_date))::int between me.age_min and me.age_max
    and extract(year from age(me.birth_date))::int between p.age_min and p.age_max
    and not exists (select 1 from public.swipes s where s.swiper_id = me.user_id and s.target_id = p.user_id)
    and not exists (
      select 1 from public.blocks b
      where (b.blocker_id = me.user_id and b.blocked_id = p.user_id)
         or (b.blocker_id = p.user_id and b.blocked_id = me.user_id)
    )
  order by p.last_active_at desc
  limit least(greatest(p_limit, 1), 50);
$$;
grant execute on function public.get_discovery_feed(int) to authenticated;

drop function if exists public.get_likers();
create function public.get_likers()
returns table (
  user_id uuid, display_name text, birth_date date, city_name text, bio text, photos jsonb,
  job_title text, commune text, relationship_goal text
)
language plpgsql security definer set search_path = '' stable as $$
declare
  v_me uuid := (select auth.uid());
  v_is_premium boolean;
begin
  select coalesce(e.is_premium and (e.expires_at is null or e.expires_at > now()), false)
    into v_is_premium
    from public.entitlements e where e.user_id = v_me;
  if not coalesce(v_is_premium, false) then
    raise exception 'premium_requis';
  end if;
  return query
  select p.user_id, p.display_name, p.birth_date, c.name, p.bio,
    coalesce((
      select jsonb_agg(jsonb_build_object('id', ph.id, 'path', ph.storage_path) order by ph.position)
      from public.photos ph where ph.user_id = p.user_id
    ), '[]'::jsonb),
    p.job_title, p.commune, p.relationship_goal
  from public.swipes s
  join public.profiles p on p.user_id = s.swiper_id
  left join public.cities c on c.id = p.city_id
  where s.target_id = v_me and s.liked
    and p.is_onboarded and not p.is_banned
    and not exists (select 1 from public.swipes s2 where s2.swiper_id = v_me and s2.target_id = p.user_id)
    and not exists (
      select 1 from public.blocks b
      where (b.blocker_id = v_me and b.blocked_id = p.user_id)
         or (b.blocker_id = p.user_id and b.blocked_id = v_me)
    )
  order by s.created_at desc
  limit 100;
end $$;
grant execute on function public.get_likers() to authenticated;
