-- Dowe : notes vocales + historique complet des profils passés (appliqué le 2026-07-26)

-- ---------------------------------------------------------------------------
-- 1. Messages audio : kind + chemin du fichier dans le bucket "voice"
-- ---------------------------------------------------------------------------
alter table public.messages
  add column kind text not null default 'text' check (kind in ('text','audio')),
  add column audio_path text;

-- La contrainte de longueur du contenu doit tolérer les messages audio
-- (content sert alors de libellé de repli : "Note vocale").
do $$
declare v_name text;
begin
  select conname into v_name from pg_constraint
  where conrelid = 'public.messages'::regclass and contype = 'c'
    and pg_get_constraintdef(oid) ilike '%char_length(content)%';
  if v_name is not null then
    execute format('alter table public.messages drop constraint %I', v_name);
  end if;
end $$;

alter table public.messages add constraint messages_content_check check (
  (kind = 'text' and char_length(content) between 1 and 2000)
  or (kind = 'audio' and audio_path is not null and char_length(content) <= 200)
);

-- Bucket des notes vocales (public en lecture, comme les photos).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('voice', 'voice', true, 10485760,
  array['audio/mp4','audio/m4a','audio/x-m4a','audio/aac','audio/mpeg','audio/webm'])
on conflict (id) do nothing;

create policy "voice_storage_insert_own" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'voice' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "voice_storage_delete_own" on storage.objects
  for delete to authenticated
  using (bucket_id = 'voice' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- Aperçu de conversation : afficher "Note vocale" plutôt que le contenu brut.
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
    select case when kind = 'audio' then 'Note vocale' else content end as content,
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

-- ---------------------------------------------------------------------------
-- 2. Historique : TOUS les profils passés (y compris ceux qui m'ont liké —
--    like_from_history renvoie alors "liked_you" et l'app redirige vers
--    "J'aime"), avec possibilité de masquer une entrée (croix dans l'UI).
-- ---------------------------------------------------------------------------
alter table public.swipes add column hidden_from_history boolean not null default false;

create function public.hide_passed_profile(p_target uuid)
returns void language sql security definer set search_path = '' as $$
  update public.swipes set hidden_from_history = true
  where swiper_id = (select auth.uid()) and target_id = p_target and not liked;
$$;

drop function if exists public.get_passed_profiles();
create function public.get_passed_profiles()
returns table (
  user_id uuid, display_name text, birth_date date, gender public.gender,
  city_name text, bio text, photos jsonb, last_active_at timestamptz,
  height_cm smallint, job_title text, education text, relationship_goal text,
  has_children text, wants_children text, smoking text, drinking text,
  religion text, commune text, languages text[], interests text[],
  swiped_at timestamptz
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
    p.religion, p.commune, p.languages, p.interests,
    s.created_at
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

-- ---------------------------------------------------------------------------
-- 3. Grants (les default privileges accordent EXECUTE à tout le monde :
--    on retire puis on ne rend qu'aux connectés, comme en 010)
-- ---------------------------------------------------------------------------
revoke execute on function public.hide_passed_profile(uuid) from public, anon;
revoke execute on function public.get_passed_profiles() from public, anon;
revoke execute on function public.get_my_matches() from public, anon;
grant execute on function public.hide_passed_profile(uuid) to authenticated;
grant execute on function public.get_passed_profiles() to authenticated;
grant execute on function public.get_my_matches() to authenticated;
