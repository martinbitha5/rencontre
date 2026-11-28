-- ---------------------------------------------------------------------------
-- 082 : Activité > Vues ne montre que les visiteurs « silencieux » (28/11/2026)
--
-- Une visite n'apprend rien quand on connaît déjà la personne. Vues ne
-- montre donc plus quelqu'un qui :
--   - a déjà un match avec moi (actif, archivé, ou invitation DM en attente
--     dans un sens ou dans l'autre) ;
--   - m'a liké (il est déjà dans Likes).
-- Reste : ceux qui ont regardé mon profil sans liker ni écrire.
-- La pastille d'Activité (get_my_badges) suit exactement la même règle.
-- ---------------------------------------------------------------------------

create or replace function public.get_profile_views()
returns table(user_id uuid, display_name text, birth_date date, gender gender, city_name text, bio text, photos jsonb, last_active_at timestamp with time zone, height_cm smallint, job_title text, education text, relationship_goal text, has_children text, wants_children text, smoking text, drinking text, religion text, commune text, languages text[], interests text[], viewed_at timestamp with time zone, is_verified boolean)
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
    v.viewed_at, p.is_verified
  from public.profile_views v
  join public.profiles p on p.user_id = v.viewer_id
  left join public.cities c on c.id = p.city_id
  where v.viewed_id = (select auth.uid())
    and v.viewed_at > now() - interval '24 hours'
    and p.is_onboarded and not p.is_banned
    and not p.shadowbanned
    -- Déjà en lien : match, conversation ou invitation DM, quel qu'en soit
    -- le sens ou l'état.
    and not exists (
      select 1 from public.matches m
      where m.user_a = least((select auth.uid()), p.user_id)
        and m.user_b = greatest((select auth.uid()), p.user_id)
    )
    -- M'a liké : il apparaît déjà dans Likes.
    and not exists (
      select 1 from public.swipes s
      where s.swiper_id = p.user_id and s.target_id = (select auth.uid()) and s.liked
    )
    and not exists (
      select 1 from public.blocks b
      where (b.blocker_id = (select auth.uid()) and b.blocked_id = p.user_id)
         or (b.blocker_id = p.user_id and b.blocked_id = (select auth.uid()))
    )
  order by v.viewed_at desc
  limit 100;
$function$;

-- Même règle pour la pastille « Vues » : on recrée get_my_badges en ne
-- changeant que le bloc des visites.
create or replace function public.get_my_badges()
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  v_me uuid := (select auth.uid());
  v_seen public.activity_seen%rowtype;
  v_messages integer;
  v_requests integer;
  v_likes integer;
  v_views integer;
begin
  if v_me is null then raise exception 'non_authentifie'; end if;
  select * into v_seen from public.activity_seen where user_id = v_me;

  select count(*) into v_messages
    from public.messages ms
    join public.matches m on m.id = ms.match_id
    join public.profiles p
      on p.user_id = case when m.user_a = v_me then m.user_b else m.user_a end
   where (m.user_a = v_me or m.user_b = v_me)
     and m.is_active
     and m.status <> 'pending'
     and not p.is_banned
     and ms.sender_id <> v_me
     and ms.read_at is null
     and not exists (
       select 1 from public.match_archives a where a.match_id = m.id and a.user_id = v_me
     )
     and not exists (
       select 1 from public.blocks b
        where (b.blocker_id = m.user_a and b.blocked_id = m.user_b)
           or (b.blocker_id = m.user_b and b.blocked_id = m.user_a)
     );

  select count(distinct m.id) into v_requests
    from public.matches m
    join public.messages ms on ms.match_id = m.id
    join public.profiles p
      on p.user_id = case when m.user_a = v_me then m.user_b else m.user_a end
   where (m.user_a = v_me or m.user_b = v_me)
     and m.is_active
     and m.status = 'pending'
     and m.initiated_by <> v_me
     and not p.is_banned
     and ms.sender_id <> v_me
     and ms.read_at is null
     and not exists (
       select 1 from public.blocks b
        where (b.blocker_id = m.user_a and b.blocked_id = m.user_b)
           or (b.blocker_id = m.user_b and b.blocked_id = m.user_a)
     );

  select count(*) into v_likes
    from public.swipes s
    join public.profiles p on p.user_id = s.swiper_id
   where s.target_id = v_me and s.liked
     and s.created_at > now() - interval '7 days'
     and s.created_at > coalesce(v_seen.likes_seen_at, '-infinity'::timestamptz)
     and p.is_onboarded and not p.is_banned and not p.shadowbanned
     and not exists (
       select 1 from public.swipes s2
        where s2.swiper_id = v_me and s2.target_id = p.user_id and s2.liked
     )
     and not exists (
       select 1 from public.matches m
        where m.user_a = least(v_me, p.user_id) and m.user_b = greatest(v_me, p.user_id)
     )
     and not exists (
       select 1 from public.blocks b
        where (b.blocker_id = v_me and b.blocked_id = p.user_id)
           or (b.blocker_id = p.user_id and b.blocked_id = v_me)
     );

  select count(*) into v_views
    from public.profile_views v
    join public.profiles p on p.user_id = v.viewer_id
   where v.viewed_id = v_me
     and v.viewed_at > now() - interval '24 hours'
     and v.viewed_at > coalesce(v_seen.views_seen_at, '-infinity'::timestamptz)
     and p.is_onboarded and not p.is_banned and not p.shadowbanned
     and not exists (
       select 1 from public.matches m
        where m.user_a = least(v_me, p.user_id) and m.user_b = greatest(v_me, p.user_id)
     )
     and not exists (
       select 1 from public.swipes s
        where s.swiper_id = p.user_id and s.target_id = v_me and s.liked
     )
     and not exists (
       select 1 from public.blocks b
        where (b.blocker_id = v_me and b.blocked_id = p.user_id)
           or (b.blocker_id = p.user_id and b.blocked_id = v_me)
     );

  return jsonb_build_object(
    'messages', v_messages,
    'requests', v_requests,
    'likes', v_likes,
    'views', v_views
  );
end $function$;
