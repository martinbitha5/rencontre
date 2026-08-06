-- Dowe : photos et vidéos dans le chat (appliqué le 2026-07-26)

-- audio_path devient media_path : un seul chemin pour audio, image et vidéo.
alter table public.messages rename column audio_path to media_path;

-- Remplace les contraintes kind/content par des versions couvrant les médias.
do $$
declare c record;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'public.messages'::regclass and contype = 'c'
      and (pg_get_constraintdef(oid) ilike '%kind%' or pg_get_constraintdef(oid) ilike '%content%')
  loop
    execute format('alter table public.messages drop constraint %I', c.conname);
  end loop;
end $$;

alter table public.messages add constraint messages_kind_check
  check (kind in ('text','audio','image','video'));
alter table public.messages add constraint messages_content_check check (
  (kind = 'text' and char_length(content) between 1 and 2000)
  or (kind <> 'text' and media_path is not null and char_length(content) <= 200)
);

-- Bucket des médias de chat (public en lecture, 25 Mo max).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('chat-media', 'chat-media', true, 26214400,
  array['image/jpeg','image/png','image/webp','image/gif','video/mp4','video/quicktime','video/webm'])
on conflict (id) do nothing;

create policy "chat_media_insert_own" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'chat-media' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "chat_media_delete_own" on storage.objects
  for delete to authenticated
  using (bucket_id = 'chat-media' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- Aperçu de conversation selon le type du dernier message.
create or replace function public.get_my_matches()
returns table (
  match_id uuid, other_user_id uuid, display_name text, photo_path text,
  last_message text, last_message_at timestamptz, last_sender_id uuid,
  unread_count bigint, matched_at timestamptz, status text, initiated_by uuid
)
language sql security definer set search_path = '' stable as $$
  select m.id,
    p.user_id,
    p.display_name,
    (select ph.storage_path from public.photos ph where ph.user_id = p.user_id order by ph.position limit 1),
    lm.content, lm.created_at, lm.sender_id,
    (select count(*) from public.messages ms
      where ms.match_id = m.id and ms.sender_id <> (select auth.uid()) and ms.read_at is null),
    m.created_at,
    m.status,
    m.initiated_by
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
