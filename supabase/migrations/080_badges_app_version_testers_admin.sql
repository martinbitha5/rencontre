-- ---------------------------------------------------------------------------
-- 080 : pastilles des onglets, version de l'app, suivi des testeurs (28/11/2026)
--
-- 1. PASTILLES. get_my_badges() rend en un seul appel ce que l'app affiche
--    sur ses onglets :
--      messages : messages non lus des conversations (Discussions), hors
--                 invitations en attente et hors conversations archivées ;
--      requests : invitations DM reçues avec un message non lu (Activité) ;
--      likes    : likes reçus depuis la dernière visite de la page Likes ;
--      views    : visites de profil depuis la dernière visite de la page Vues.
--    Les filtres reprennent exactement ceux de get_my_matches, get_likers et
--    get_profile_views : une pastille ne compte jamais ce que la page ne
--    montrerait pas. activity_seen garde l'heure de dernière visite des pages
--    Likes et Vues, posée par mark_activity_seen().
--
-- 2. VERSION DE L'APP. app_release (ligne unique) porte la dernière version
--    publiée sur les stores et la version minimale encore acceptée. L'app la
--    lit au démarrage et au retour au premier plan : plus ancienne que
--    latest, elle propose la mise à jour ; plus ancienne que minimum, elle
--    l'impose. Lisible par tous (même déconnecté), modifiable au backoffice.
--
-- 3. TESTEURS. admin_tester_overview() donne au backoffice, pour chaque
--    personne invitée ou inscrite au programme, ses jours confirmés, sa
--    dernière activité et l'état de sa récompense.
-- ---------------------------------------------------------------------------

-- --- 1. Pastilles ----------------------------------------------------------

create table if not exists public.activity_seen (
  user_id uuid primary key references auth.users (id) on delete cascade,
  likes_seen_at timestamptz,
  views_seen_at timestamptz
);

alter table public.activity_seen enable row level security;
-- Aucune policy : lecture et écriture passent par les fonctions ci-dessous.

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

  -- Conversations actives (Discussions) : même périmètre que get_my_matches,
  -- sans les invitations en attente ni les archivées.
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

  -- Invitations DM reçues (Activité > DMs), encore non lues.
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

  -- Likes reçus : mêmes règles que get_likers, depuis la dernière visite.
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

  -- Visites de profil : mêmes règles que get_profile_views.
  select count(*) into v_views
    from public.profile_views v
    join public.profiles p on p.user_id = v.viewer_id
   where v.viewed_id = v_me
     and v.viewed_at > now() - interval '24 hours'
     and v.viewed_at > coalesce(v_seen.views_seen_at, '-infinity'::timestamptz)
     and p.is_onboarded and not p.is_banned and not p.shadowbanned
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

create or replace function public.mark_activity_seen(p_section text)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_me uuid := (select auth.uid());
begin
  if v_me is null then raise exception 'non_authentifie'; end if;
  if p_section = 'likes' then
    insert into public.activity_seen (user_id, likes_seen_at) values (v_me, now())
    on conflict (user_id) do update set likes_seen_at = excluded.likes_seen_at;
  elsif p_section = 'views' then
    insert into public.activity_seen (user_id, views_seen_at) values (v_me, now())
    on conflict (user_id) do update set views_seen_at = excluded.views_seen_at;
  end if;
end $function$;

revoke all on function public.get_my_badges() from public, anon;
revoke all on function public.mark_activity_seen(text) from public, anon;
grant execute on function public.get_my_badges() to authenticated;
grant execute on function public.mark_activity_seen(text) to authenticated;

-- --- 2. Version de l'app ---------------------------------------------------

create table if not exists public.app_release (
  id smallint primary key default 1 check (id = 1),
  latest_version text not null default '1.0.0',
  minimum_version text not null default '1.0.0',
  android_url text not null default 'https://play.google.com/store/apps/details?id=com.zolardc.app',
  ios_url text,
  message text,
  updated_at timestamptz not null default now()
);

insert into public.app_release (id) values (1) on conflict (id) do nothing;

alter table public.app_release enable row level security;

drop policy if exists app_release_select on public.app_release;
create policy app_release_select on public.app_release
  for select to anon, authenticated using (true);

drop policy if exists app_release_admin_update on public.app_release;
create policy app_release_admin_update on public.app_release
  for update to authenticated
  using (exists (select 1 from public.admin_users a where a.user_id = (select auth.uid()) and a.is_active))
  with check (exists (select 1 from public.admin_users a where a.user_id = (select auth.uid()) and a.is_active));

comment on table public.app_release is
  'Dernière version publiée et version minimale acceptée. L''app propose (latest) ou impose (minimum) la mise à jour.';

-- --- 3. Suivi des testeurs au backoffice -----------------------------------

create or replace function public.admin_tester_overview()
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  v_admin uuid := public.require_admin();
  v_prog public.tester_program%rowtype;
begin
  select * into v_prog from public.tester_program where id = 1;

  return jsonb_build_object(
    'program', to_jsonb(v_prog),
    'today', (now() at time zone 'Africa/Kinshasa')::date,
    'people', coalesce((
      select jsonb_agg(row_to_json(t) order by t.days desc, t.last_checkin desc nulls last, t.email)
      from (
        select
          coalesce(u.email, i.email) as email,
          u.id as user_id,
          p.display_name,
          p.public_id,
          p.last_active_at,
          u.created_at as signed_up_at,
          i.status as invite_status,
          i.sent_at as invited_at,
          coalesce(c.days, 0) as days,
          c.last_checkin,
          coalesce(c.dates, '[]'::jsonb) as dates,
          r.completed_at,
          r.granted_at
        from (
          select email from public.tester_invites
          union
          select lower(u2.email) from auth.users u2
           where exists (select 1 from public.tester_checkins tc where tc.user_id = u2.id)
        ) e
        left join public.tester_invites i on i.email = e.email
        left join auth.users u on lower(u.email) = e.email
        left join public.profiles p on p.user_id = u.id
        left join lateral (
          select count(*)::int as days,
                 max(tc.day) as last_checkin,
                 jsonb_agg(tc.day order by tc.day) as dates
            from public.tester_checkins tc
           where tc.user_id = u.id
             and tc.day >= v_prog.starts_on
             and (v_prog.ends_on is null or tc.day <= v_prog.ends_on)
        ) c on true
        left join public.tester_rewards r on r.user_id = u.id
      ) t
    ), '[]'::jsonb)
  );
end $function$;

create or replace function public.admin_mark_tester_reward(p_user uuid, p_note text default null)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_admin uuid := public.require_admin('admin');
begin
  update public.tester_rewards
     set granted_at = now(), note = coalesce(p_note, note)
   where user_id = p_user and granted_at is null;
  if not found then raise exception 'recompense_introuvable'; end if;
end $function$;

revoke all on function public.admin_tester_overview() from public, anon;
revoke all on function public.admin_mark_tester_reward(uuid, text) from public, anon;
grant execute on function public.admin_tester_overview() to authenticated;
grant execute on function public.admin_mark_tester_reward(uuid, text) to authenticated;
