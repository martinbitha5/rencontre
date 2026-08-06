-- 024 — Vérification de profil
--
-- Principe : la personne prend un selfie en reproduisant un geste tiré au sort.
-- Un modérateur compare ce selfie aux photos du profil depuis le backoffice,
-- puis approuve ou refuse. Le badge « Profil vérifié » est posé par le serveur
-- (`profiles.is_verified`), jamais par le client.
--
-- Vie privée : le selfie part dans un bucket PRIVÉ, visible seulement par son
-- auteur et par l'équipe, et il est supprimé dès que la demande est traitée.
-- On garde la décision, pas la donnée biométrique.

-- ---------------------------------------------------------------------------
-- 1. Demandes
-- ---------------------------------------------------------------------------

create table if not exists public.verification_requests (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.profiles(user_id) on delete cascade,
  selfie_path   text not null,
  gesture       text not null,
  status        text not null default 'pending'
                check (status in ('pending', 'approved', 'rejected')),
  created_at    timestamptz not null default now(),
  reviewed_by   uuid references auth.users(id) on delete set null,
  reviewed_at   timestamptz,
  reject_reason text
);

-- Une seule demande en attente à la fois : sinon la file se remplit de doublons
-- envoyés par impatience.
create unique index if not exists verification_requests_one_pending
  on public.verification_requests (user_id) where status = 'pending';
create index if not exists verification_requests_status_idx
  on public.verification_requests (status, created_at);

alter table public.verification_requests enable row level security;

drop policy if exists verification_requests_select_own on public.verification_requests;
create policy verification_requests_select_own on public.verification_requests
  for select to authenticated
  using (user_id = (select auth.uid()) or public.is_admin());

revoke all on public.verification_requests from anon, authenticated;
grant select on public.verification_requests to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Stockage des selfies (bucket privé)
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('verifications', 'verifications', false, 5242880, array['image/jpeg'])
on conflict (id) do update
  set public = false, file_size_limit = 5242880, allowed_mime_types = array['image/jpeg'];

drop policy if exists verifications_insert_own on storage.objects;
create policy verifications_insert_own on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'verifications'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists verifications_read_own_or_admin on storage.objects;
create policy verifications_read_own_or_admin on storage.objects
  for select to authenticated
  using (
    bucket_id = 'verifications'
    and ((storage.foldername(name))[1] = (select auth.uid())::text or public.is_admin())
  );

-- ---------------------------------------------------------------------------
-- 3. Côté application
-- ---------------------------------------------------------------------------

create or replace function public.request_verification(p_path text, p_gesture text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := (select auth.uid());
  v_id uuid;
begin
  if v_me is null then
    raise exception 'not_authenticated';
  end if;
  -- Le chemin doit être dans le dossier de l'appelant : personne ne rattache le
  -- selfie de quelqu'un d'autre à sa propre demande.
  if p_path is null or split_part(p_path, '/', 1) <> v_me::text then
    raise exception 'invalid_path';
  end if;
  if p_gesture is null or btrim(p_gesture) = '' then
    raise exception 'gesture_required';
  end if;
  if exists (select 1 from public.profiles p where p.user_id = v_me and p.is_banned) then
    raise exception 'account_banned';
  end if;
  if exists (select 1 from public.profiles p where p.user_id = v_me and p.is_verified) then
    raise exception 'already_verified';
  end if;
  if not exists (select 1 from public.photos ph where ph.user_id = v_me) then
    raise exception 'no_profile_photo';
  end if;
  if exists (
    select 1 from public.verification_requests r
    where r.user_id = v_me and r.status = 'pending'
  ) then
    raise exception 'already_pending';
  end if;

  insert into public.verification_requests (user_id, selfie_path, gesture)
  values (v_me, p_path, p_gesture)
  returning id into v_id;

  return jsonb_build_object('ok', true, 'id', v_id, 'status', 'pending');
end;
$$;

create or replace function public.get_my_verification()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_me  uuid := (select auth.uid());
  v_row public.verification_requests;
begin
  if v_me is null then
    raise exception 'not_authenticated';
  end if;

  select * into v_row from public.verification_requests r
  where r.user_id = v_me
  order by r.created_at desc
  limit 1;

  return jsonb_build_object(
    'is_verified', coalesce((select p.is_verified from public.profiles p where p.user_id = v_me), false),
    'has_photo', exists (select 1 from public.photos ph where ph.user_id = v_me),
    'status', v_row.status,
    'gesture', v_row.gesture,
    'created_at', v_row.created_at,
    'reviewed_at', v_row.reviewed_at,
    'reject_reason', v_row.reject_reason
  );
end;
$$;

revoke execute on function public.request_verification(text, text) from public, anon;
revoke execute on function public.get_my_verification() from public, anon;
grant execute on function public.request_verification(text, text) to authenticated;
grant execute on function public.get_my_verification() to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Côté backoffice
-- ---------------------------------------------------------------------------

create or replace function public.admin_list_verifications(
  p_status text default 'pending',
  p_limit  integer default 50,
  p_offset integer default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_admin uuid := public.require_admin();
  v_lim   integer := least(greatest(coalesce(p_limit, 50), 1), 200);
  v_off   integer := greatest(coalesce(p_offset, 0), 0);
  v_out   jsonb;
begin
  with base as (
    select r.* from public.verification_requests r
    where p_status is null or p_status = '' or r.status = p_status
  ),
  page as (
    select b.*, row_number() over (order by b.created_at) as rn
    from base b order by b.created_at limit v_lim offset v_off
  )
  select jsonb_build_object(
    'total', (select count(*) from base),
    'pending', (select count(*) from public.verification_requests where status = 'pending'),
    'items', coalesce(jsonb_agg(jsonb_build_object(
      'id', pg.id,
      'created_at', pg.created_at,
      'gesture', pg.gesture,
      'status', pg.status,
      'selfie_path', pg.selfie_path,
      'reject_reason', pg.reject_reason,
      'reviewed_at', pg.reviewed_at,
      'user', jsonb_build_object(
        'user_id', p.user_id,
        'display_name', p.display_name,
        'age', case when p.birth_date is null then null
                    else extract(year from age(p.birth_date))::int end,
        'gender', p.gender,
        'city', (select c.name from public.cities c where c.id = p.city_id),
        'is_verified', p.is_verified,
        'is_banned', p.is_banned,
        'created_at', p.created_at,
        'photos', coalesce((
          select jsonb_agg(ph.storage_path order by ph.position)
          from public.photos ph where ph.user_id = p.user_id
        ), '[]'::jsonb)
      )
    ) order by pg.rn), '[]'::jsonb)
  ) into v_out
  from page pg
  join public.profiles p on p.user_id = pg.user_id;

  return coalesce(v_out, jsonb_build_object('total', 0, 'pending', 0, 'items', '[]'::jsonb));
end;
$$;

create or replace function public.admin_review_verification(
  p_id      uuid,
  p_approve boolean,
  p_reason  text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin uuid := public.require_admin();
  v_row   public.verification_requests;
begin
  select * into v_row from public.verification_requests where id = p_id;
  if v_row.id is null then
    raise exception 'request_not_found';
  end if;
  if v_row.status <> 'pending' then
    raise exception 'already_reviewed';
  end if;
  if not p_approve and (p_reason is null or btrim(p_reason) = '') then
    raise exception 'reason_required';
  end if;

  update public.verification_requests
  set status = case when p_approve then 'approved' else 'rejected' end,
      reviewed_by = v_admin,
      reviewed_at = now(),
      reject_reason = case when p_approve then null else p_reason end
  where id = p_id;

  update public.profiles
  set is_verified = p_approve
  where user_id = v_row.user_id;

  -- Le selfie a rempli son rôle : on ne conserve pas la donnée biométrique.
  begin
    delete from storage.objects
    where bucket_id = 'verifications' and name = v_row.selfie_path;
  exception when others then
    null;
  end;

  perform public.log_admin_action(
    v_admin,
    case when p_approve then 'verification_approved' else 'verification_rejected' end,
    v_row.user_id, p_reason, 'verification', p_id::text,
    jsonb_build_object('gesture', v_row.gesture)
  );

  return jsonb_build_object('ok', true, 'approved', p_approve);
end;
$$;

revoke execute on function public.admin_list_verifications(text, integer, integer) from public, anon;
revoke execute on function public.admin_review_verification(uuid, boolean, text) from public, anon;
grant execute on function public.admin_list_verifications(text, integer, integer) to authenticated;
grant execute on function public.admin_review_verification(uuid, boolean, text) to authenticated;
