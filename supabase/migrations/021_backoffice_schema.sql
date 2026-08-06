-- 021 — Socle du backoffice de modération
--
-- Ce que cette migration met en place :
--   1. Des rôles pour l'équipe (owner / admin / moderator) sur admin_users
--   2. Un journal d'audit inviolable de toutes les actions de modération
--   3. Les sanctions (avertissement, shadowban, suspension, bannissement)
--   4. Des signalements enrichis : gravité, assignation, résolution, volet CSAE
--   5. La modération des photos
--   6. L'application réelle des sanctions dans les fonctions du produit
--
-- Principe de sécurité : le backoffice n'écrit JAMAIS en direct. Tout passe par
-- des RPC SECURITY DEFINER (migrations 022 et 023) qui vérifient le rôle et
-- écrivent une ligne d'audit. Les tables ci-dessous sont en lecture seule pour
-- le client, et uniquement pour un administrateur actif.

-- ---------------------------------------------------------------------------
-- 1. Rôles de l'équipe
-- ---------------------------------------------------------------------------

alter table public.admin_users
  add column if not exists role text not null default 'moderator',
  add column if not exists full_name text,
  add column if not exists is_active boolean not null default true,
  add column if not exists created_by uuid references auth.users(id) on delete set null;

alter table public.admin_users drop constraint if exists admin_users_role_check;
alter table public.admin_users
  add constraint admin_users_role_check check (role in ('owner', 'admin', 'moderator'));

-- Le compte historique devient propriétaire : sans lui personne ne peut plus
-- gérer l'équipe.
update public.admin_users a
set role = 'owner'
where a.created_at = (select min(created_at) from public.admin_users)
  and not exists (select 1 from public.admin_users o where o.role = 'owner');

comment on column public.admin_users.role is
  'owner = gère l''équipe et l''économie ; admin = modère + économie ; moderator = modère seulement';

-- ---------------------------------------------------------------------------
-- 2. Helpers de contrôle d'accès
-- ---------------------------------------------------------------------------

-- SECURITY DEFINER : utilisable dans les policies RLS sans récursion sur
-- admin_users (dont la policy de lecture est limitée à sa propre ligne).
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.admin_users a
    where a.user_id = (select auth.uid()) and a.is_active
  );
$$;

create or replace function public.my_admin_role()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select a.role from public.admin_users a
  where a.user_id = (select auth.uid()) and a.is_active;
$$;

-- Lève une exception si l'appelant n'a pas le niveau requis, sinon retourne
-- son identifiant (utilisé comme acteur dans le journal d'audit).
create or replace function public.require_admin(p_min text default 'moderator')
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid  uuid := (select auth.uid());
  v_role text;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  select a.role into v_role
  from public.admin_users a
  where a.user_id = v_uid and a.is_active;

  if v_role is null then
    raise exception 'not_admin' using errcode = '42501';
  end if;

  if p_min = 'owner' and v_role <> 'owner' then
    raise exception 'forbidden_owner_only' using errcode = '42501';
  end if;

  if p_min = 'admin' and v_role not in ('owner', 'admin') then
    raise exception 'forbidden_admin_only' using errcode = '42501';
  end if;

  return v_uid;
end;
$$;

revoke execute on function public.is_admin() from public, anon;
revoke execute on function public.my_admin_role() from public, anon;
revoke execute on function public.require_admin(text) from public, anon;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.my_admin_role() to authenticated;
grant execute on function public.require_admin(text) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Journal d'audit
-- ---------------------------------------------------------------------------

create table if not exists public.moderation_actions (
  id             bigint generated always as identity primary key,
  actor_id       uuid references auth.users(id) on delete set null,
  actor_email    text,
  action         text not null,
  target_user_id uuid references public.profiles(user_id) on delete set null,
  target_type    text,
  target_id      text,
  reason         text,
  metadata       jsonb not null default '{}'::jsonb,
  created_at     timestamptz not null default now()
);

create index if not exists moderation_actions_created_idx
  on public.moderation_actions (created_at desc);
create index if not exists moderation_actions_target_idx
  on public.moderation_actions (target_user_id, created_at desc);
create index if not exists moderation_actions_actor_idx
  on public.moderation_actions (actor_id, created_at desc);

alter table public.moderation_actions enable row level security;

drop policy if exists moderation_actions_select_admin on public.moderation_actions;
create policy moderation_actions_select_admin on public.moderation_actions
  for select to authenticated using (public.is_admin());

revoke all on public.moderation_actions from anon, authenticated;
grant select on public.moderation_actions to authenticated;

-- Écriture réservée aux RPC definer.
create or replace function public.log_admin_action(
  p_actor       uuid,
  p_action      text,
  p_target_user uuid default null,
  p_reason      text default null,
  p_target_type text default null,
  p_target_id   text default null,
  p_metadata    jsonb default '{}'::jsonb
)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.moderation_actions
    (actor_id, actor_email, action, target_user_id, target_type, target_id, reason, metadata)
  values (
    p_actor,
    (select u.email from auth.users u where u.id = p_actor),
    p_action, p_target_user, p_target_type, p_target_id, p_reason,
    coalesce(p_metadata, '{}'::jsonb)
  );
$$;

revoke execute on function public.log_admin_action(uuid, text, uuid, text, text, text, jsonb)
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. Sanctions
-- ---------------------------------------------------------------------------

alter table public.profiles
  add column if not exists shadowbanned   boolean not null default false,
  add column if not exists banned_at      timestamptz,
  add column if not exists banned_until   timestamptz,
  add column if not exists ban_reason     text,
  add column if not exists warnings_count integer not null default 0,
  add column if not exists is_verified    boolean not null default false;

-- Les colonnes de modération ne doivent jamais être modifiables par leur
-- propriétaire. Les GRANT UPDATE sur profiles sont colonne par colonne
-- (leçon des migrations 008 et 017) : ne rien accorder ici suffit, mais on
-- révoque explicitement au cas où un GRANT large serait posé plus tard.
revoke update (shadowbanned, banned_at, banned_until, ban_reason, warnings_count, is_verified)
  on public.profiles from anon, authenticated;

create index if not exists profiles_banned_idx
  on public.profiles (is_banned) where is_banned;
create index if not exists profiles_banned_until_idx
  on public.profiles (banned_until) where banned_until is not null;
create index if not exists profiles_name_search_idx
  on public.profiles (lower(display_name));

create table if not exists public.user_sanctions (
  id            bigint generated always as identity primary key,
  user_id       uuid not null references public.profiles(user_id) on delete cascade,
  kind          text not null check (kind in ('warning', 'shadowban', 'suspension', 'ban')),
  reason        text not null,
  notes         text,
  report_id     uuid references public.reports(id) on delete set null,
  created_by    uuid references auth.users(id) on delete set null,
  created_at    timestamptz not null default now(),
  expires_at    timestamptz,
  lifted_at     timestamptz,
  lifted_by     uuid references auth.users(id) on delete set null,
  lifted_reason text
);

create index if not exists user_sanctions_user_idx
  on public.user_sanctions (user_id, created_at desc);
create index if not exists user_sanctions_active_idx
  on public.user_sanctions (expires_at) where lifted_at is null;

alter table public.user_sanctions enable row level security;

drop policy if exists user_sanctions_select_admin on public.user_sanctions;
create policy user_sanctions_select_admin on public.user_sanctions
  for select to authenticated using (public.is_admin());

revoke all on public.user_sanctions from anon, authenticated;
grant select on public.user_sanctions to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Notes internes sur un compte
-- ---------------------------------------------------------------------------

create table if not exists public.user_notes (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references public.profiles(user_id) on delete cascade,
  author_id  uuid references auth.users(id) on delete set null,
  body       text not null check (char_length(body) between 1 and 4000),
  created_at timestamptz not null default now()
);

create index if not exists user_notes_user_idx
  on public.user_notes (user_id, created_at desc);

alter table public.user_notes enable row level security;

drop policy if exists user_notes_select_admin on public.user_notes;
create policy user_notes_select_admin on public.user_notes
  for select to authenticated using (public.is_admin());

revoke all on public.user_notes from anon, authenticated;
grant select on public.user_notes to authenticated;

-- ---------------------------------------------------------------------------
-- 6. Signalements enrichis
-- ---------------------------------------------------------------------------

alter table public.reports
  add column if not exists match_id          uuid references public.matches(id) on delete set null,
  add column if not exists severity          text not null default 'normal',
  add column if not exists assigned_to       uuid references auth.users(id) on delete set null,
  add column if not exists handled_by        uuid references auth.users(id) on delete set null,
  add column if not exists handled_at        timestamptz,
  add column if not exists resolution        text,
  add column if not exists admin_notes       text,
  add column if not exists csae_escalated_at timestamptz,
  add column if not exists csae_escalated_by uuid references auth.users(id) on delete set null,
  add column if not exists csae_authority_ref text;

alter table public.reports drop constraint if exists reports_status_check;
alter table public.reports
  add constraint reports_status_check
  check (status in ('pending', 'in_review', 'actioned', 'dismissed', 'reviewed'));

alter table public.reports drop constraint if exists reports_severity_check;
alter table public.reports
  add constraint reports_severity_check
  check (severity in ('normal', 'high', 'critical'));

alter table public.reports drop constraint if exists reports_resolution_check;
alter table public.reports
  add constraint reports_resolution_check
  check (resolution is null or resolution in (
    'aucune_action', 'avertissement', 'contenu_supprime',
    'compte_suspendu', 'compte_banni', 'signale_autorites'
  ));

create index if not exists reports_status_created_idx
  on public.reports (status, created_at desc);
create index if not exists reports_severity_idx
  on public.reports (severity, status, created_at desc);
create index if not exists reports_reported_idx
  on public.reports (reported_id, created_at desc);

-- La gravité et l'état du traitement sont décidés par le serveur, jamais par
-- le client. Le contexte (conversation) n'est retenu que si le déclarant en
-- fait réellement partie.
create or replace function public.normalize_report()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.status            := 'pending';
  new.assigned_to       := null;
  new.handled_by        := null;
  new.handled_at        := null;
  new.resolution        := null;
  new.admin_notes       := null;
  new.csae_escalated_at := null;
  new.csae_escalated_by := null;
  new.csae_authority_ref := null;

  new.severity := case
    when new.reason = 'mineur' then 'critical'
    when new.reason in ('harcelement', 'contenu_inapproprie') then 'high'
    else 'normal'
  end;

  if new.match_id is not null and not exists (
    select 1 from public.matches m
    where m.id = new.match_id
      and (m.user_a = new.reporter_id or m.user_b = new.reporter_id)
  ) then
    new.match_id := null;
  end if;

  return new;
end;
$$;

drop trigger if exists normalize_report_trg on public.reports;
create trigger normalize_report_trg
  before insert on public.reports
  for each row execute function public.normalize_report();

-- Fonction de trigger : aucun besoin de l'exposer à l'API. Le trigger continue
-- de fonctionner, Postgres ne vérifie les droits qu'à sa création.
revoke execute on function public.normalize_report() from public, anon, authenticated;

-- Un utilisateur n'a aucune raison de modifier un signalement.
revoke update on public.reports from anon, authenticated;

drop policy if exists reports_select_admin on public.reports;
create policy reports_select_admin on public.reports
  for select to authenticated using (public.is_admin());

-- ---------------------------------------------------------------------------
-- 7. Modération des photos
-- ---------------------------------------------------------------------------

alter table public.photos
  add column if not exists moderation_status text not null default 'approved',
  add column if not exists reviewed_by uuid references auth.users(id) on delete set null,
  add column if not exists reviewed_at timestamptz;

alter table public.photos drop constraint if exists photos_moderation_status_check;
alter table public.photos
  add constraint photos_moderation_status_check
  check (moderation_status in ('approved', 'flagged', 'removed'));

revoke update (moderation_status, reviewed_by, reviewed_at)
  on public.photos from anon, authenticated;

create index if not exists photos_created_idx on public.photos (created_at desc);
create index if not exists photos_flagged_idx
  on public.photos (moderation_status) where moderation_status <> 'approved';

-- ---------------------------------------------------------------------------
-- 8. Application réelle des sanctions
-- ---------------------------------------------------------------------------

-- Shadowban : le compte continue de fonctionner normalement pour son
-- propriétaire mais disparaît des surfaces de découverte des autres.
create or replace function public.get_discovery_feed(p_limit integer default 20)
returns table (
  user_id uuid, display_name text, birth_date date, gender public.gender,
  city_name text, bio text, photos jsonb, last_active_at timestamptz,
  height_cm smallint, job_title text, education text, relationship_goal text,
  has_children text, wants_children text, smoking text, drinking text,
  religion text, commune text, languages text[], interests text[]
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
    p.religion, p.commune, p.languages, p.interests
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

create or replace function public.get_likers()
returns table (
  user_id uuid, display_name text, birth_date date, gender public.gender,
  city_name text, bio text, photos jsonb, last_active_at timestamptz,
  height_cm smallint, job_title text, education text, relationship_goal text,
  has_children text, wants_children text, smoking text, drinking text,
  religion text, commune text, languages text[], interests text[],
  liked_at timestamptz
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
    s.created_at
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

create or replace function public.get_event_feed(p_event uuid, p_limit integer default 20)
returns table (
  user_id uuid, display_name text, birth_date date, gender public.gender,
  city_name text, bio text, photos jsonb, last_active_at timestamptz,
  height_cm smallint, job_title text, education text, relationship_goal text,
  has_children text, wants_children text, smoking text, drinking text,
  religion text, commune text, languages text[], interests text[]
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
    p.religion, p.commune, p.languages, p.interests
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

-- Un compte banni ne doit plus pouvoir écrire, y compris dans ses
-- conversations existantes. Jusqu'ici seul le feed le filtrait.
drop policy if exists messages_insert on public.messages;
create policy messages_insert on public.messages
  for insert to authenticated
  with check (
    sender_id = (select auth.uid())
    and not exists (
      select 1 from public.profiles me
      where me.user_id = (select auth.uid()) and me.is_banned
    )
    and exists (
      select 1 from public.matches m
      where m.id = messages.match_id
        and m.is_active
        and (m.user_a = (select auth.uid()) or m.user_b = (select auth.uid()))
        and not exists (
          select 1 from public.blocks b
          where (b.blocker_id = m.user_a and b.blocked_id = m.user_b)
             or (b.blocker_id = m.user_b and b.blocked_id = m.user_a)
        )
    )
  );

-- Les suspensions temporaires se lèvent toutes seules : sans pg_cron sur ce
-- projet, la levée est déclenchée au chargement du backoffice.
create or replace function public.expire_temporary_bans()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ids uuid[];
begin
  with lifted as (
    update public.profiles p
    set is_banned = false, banned_at = null, banned_until = null, ban_reason = null
    where p.is_banned and p.banned_until is not null and p.banned_until <= now()
    returning p.user_id
  )
  select coalesce(array_agg(user_id), '{}'::uuid[]) into v_ids from lifted;

  if array_length(v_ids, 1) is null then
    return 0;
  end if;

  update public.user_sanctions s
  set lifted_at = now(), lifted_reason = 'Fin automatique de la suspension'
  where s.user_id = any(v_ids) and s.kind = 'suspension' and s.lifted_at is null;

  return array_length(v_ids, 1);
end;
$$;

-- Personne ne l'appelle directement : admin_dashboard() la déclenche, et il
-- est lui-même SECURITY DEFINER.
revoke execute on function public.expire_temporary_bans() from public, anon, authenticated;
