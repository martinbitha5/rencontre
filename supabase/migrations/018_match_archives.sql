-- 018 : archives de conversations (par utilisateur, à la Heyama).
-- Archiver ne touche pas au match : chaque participant range sa propre liste.
-- (Copie locale de la migration appliquée via MCP le 2026-07-26.)

create table public.match_archives (
  match_id uuid not null references public.matches(id) on delete cascade,
  user_id uuid not null references public.profiles(user_id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (match_id, user_id)
);

alter table public.match_archives enable row level security;

create policy match_archives_select on public.match_archives
  for select to authenticated using (user_id = (select auth.uid()));

create policy match_archives_insert on public.match_archives
  for insert to authenticated with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.matches m
      where m.id = match_id
        and (m.user_a = (select auth.uid()) or m.user_b = (select auth.uid()))
    )
  );

create policy match_archives_delete on public.match_archives
  for delete to authenticated using (user_id = (select auth.uid()));

grant select, insert, delete on public.match_archives to authenticated;

-- get_my_matches retourne maintenant l'état d'archivage pour l'appelant.
drop function public.get_my_matches();

create function public.get_my_matches()
returns table(match_id uuid, other_user_id uuid, display_name text, photo_path text,
  last_message text, last_message_at timestamptz, last_sender_id uuid,
  unread_count bigint, matched_at timestamptz, status text, initiated_by uuid,
  is_archived boolean)
language sql stable security definer set search_path to ''
as $$
  select m.id,
    p.user_id,
    p.display_name,
    (select ph.storage_path from public.photos ph where ph.user_id = p.user_id order by ph.position limit 1),
    lm.content, lm.created_at, lm.sender_id,
    (select count(*) from public.messages ms
      where ms.match_id = m.id and ms.sender_id <> (select auth.uid()) and ms.read_at is null),
    m.created_at,
    m.status,
    m.initiated_by,
    exists (
      select 1 from public.match_archives a
      where a.match_id = m.id and a.user_id = (select auth.uid())
    )
  from public.matches m
  join public.profiles p
    on p.user_id = case when m.user_a = (select auth.uid()) then m.user_b else m.user_a end
  left join lateral (
    select case kind
             when 'audio' then 'Note vocale'
             when 'image' then 'Photo'
             when 'video' then 'Vidéo'
             else content
           end as content,
           created_at, sender_id
    from public.messages
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

revoke execute on function public.get_my_matches() from public, anon;
grant execute on function public.get_my_matches() to authenticated;
