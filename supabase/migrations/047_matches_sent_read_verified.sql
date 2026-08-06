-- 047 : la vue Envoyés des DMs (Activité) devient des cartes à la Heyama,
-- avec l'état de lecture du message et le badge certifié du destinataire.
-- get_my_matches gagne deux colonnes :
--   is_verified : badge bleu de l'autre personne (posé sur l'avatar) ;
--   sent_read   : mon DERNIER message envoyé dans ce match a-t-il été lu ?
--                 (null si je n'ai encore rien envoyé)
-- Changement de type de retour = drop obligatoire, puis re-poser les droits.

drop function public.get_my_matches();

create function public.get_my_matches()
returns table(match_id uuid, other_user_id uuid, display_name text, photo_path text,
  last_message text, last_message_at timestamptz, last_sender_id uuid,
  unread_count bigint, matched_at timestamptz, status text, initiated_by uuid,
  is_archived boolean, is_verified boolean, sent_read boolean)
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
    ),
    p.is_verified,
    (select ms.read_at is not null from public.messages ms
      where ms.match_id = m.id and ms.sender_id = (select auth.uid())
      order by ms.id desc limit 1)
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
