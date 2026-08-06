-- Dowe : fonctions métier (appliqué le 2026-07-24)

create or replace function public.get_discovery_feed(p_limit int default 20)
returns table (
  user_id uuid, display_name text, birth_date date, gender public.gender,
  city_name text, bio text, photos jsonb, last_active_at timestamptz
)
language sql security definer set search_path = '' stable as $$
  select p.user_id, p.display_name, p.birth_date, p.gender, c.name, p.bio,
    coalesce((
      select jsonb_agg(jsonb_build_object('id', ph.id, 'path', ph.storage_path) order by ph.position)
      from public.photos ph where ph.user_id = p.user_id
    ), '[]'::jsonb),
    p.last_active_at
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

create or replace function public.swipe(p_target uuid, p_liked boolean)
returns jsonb language plpgsql security definer set search_path = '' as $$
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
    on conflict (user_a, user_b) do update set is_active = true
    returning id into v_match_id;
    return jsonb_build_object('status', 'match', 'match_id', v_match_id);
  end if;

  return jsonb_build_object('status', 'ok');
end $$;

create or replace function public.get_my_matches()
returns table (
  match_id uuid, other_user_id uuid, display_name text, photo_path text,
  last_message text, last_message_at timestamptz, last_sender_id uuid,
  unread_count bigint, matched_at timestamptz
)
language sql security definer set search_path = '' stable as $$
  select m.id,
    p.user_id,
    p.display_name,
    (select ph.storage_path from public.photos ph where ph.user_id = p.user_id order by ph.position limit 1),
    lm.content, lm.created_at, lm.sender_id,
    (select count(*) from public.messages ms
      where ms.match_id = m.id and ms.sender_id <> (select auth.uid()) and ms.read_at is null),
    m.created_at
  from public.matches m
  join public.profiles p
    on p.user_id = case when m.user_a = (select auth.uid()) then m.user_b else m.user_a end
  left join lateral (
    select content, created_at, sender_id from public.messages
    where match_id = m.id order by id desc limit 1
  ) lm on true
  where (m.user_a = (select auth.uid()) or m.user_b = (select auth.uid()))
    and m.is_active
    and not p.is_banned
    and not exists (
      select 1 from public.blocks b
      where (b.blocker_id = m.user_a and b.blocked_id = m.user_b)
         or (b.blocker_id = m.user_b and b.blocked_id = m.user_a)
    )
  order by coalesce(lm.created_at, m.created_at) desc;
$$;

create or replace function public.get_likers()
returns table (user_id uuid, display_name text, birth_date date, city_name text, bio text, photos jsonb)
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
    ), '[]'::jsonb)
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

create or replace function public.mark_messages_read(p_match_id uuid)
returns void language sql security definer set search_path = '' as $$
  update public.messages
  set read_at = now()
  where match_id = p_match_id
    and sender_id <> (select auth.uid())
    and read_at is null
    and exists (
      select 1 from public.matches m
      where m.id = p_match_id
        and (m.user_a = (select auth.uid()) or m.user_b = (select auth.uid()))
    );
$$;

create or replace function public.unmatch(p_match_id uuid)
returns void language sql security definer set search_path = '' as $$
  update public.matches
  set is_active = false
  where id = p_match_id
    and (user_a = (select auth.uid()) or user_b = (select auth.uid()));
$$;

create or replace function public.block_user(p_target uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_me uuid := (select auth.uid());
begin
  if v_me is null or p_target = v_me then raise exception 'cible_invalide'; end if;
  insert into public.blocks (blocker_id, blocked_id) values (v_me, p_target)
  on conflict do nothing;
  update public.matches set is_active = false
  where user_a = least(v_me, p_target) and user_b = greatest(v_me, p_target);
end $$;

create or replace function public.delete_my_account()
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_me uuid := (select auth.uid());
begin
  if v_me is null then raise exception 'non_authentifie'; end if;
  delete from auth.users where id = v_me;
end $$;
