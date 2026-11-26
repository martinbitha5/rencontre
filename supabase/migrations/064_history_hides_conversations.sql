-- 064 : un profil recalé à qui l'on a écrit quitte l'historique.
--
-- L'historique (Rencontres et soirée) propose maintenant d'écrire un premier
-- message à un profil passé, en plus du like. Écrire ne change pas le swipe
-- (il reste « non ») : sans ce filtre, le profil revenait dans l'historique au
-- chargement suivant alors que la conversation existe déjà (DMs, Envoyés).
-- On l'exclut dès qu'un match existe entre les deux comptes, en attente ou
-- actif. Seul ajout : le bloc « not exists matches ».

create or replace function public.get_passed_profiles()
returns table(user_id uuid, display_name text, birth_date date, gender public.gender, city_name text, bio text, photos jsonb, last_active_at timestamp with time zone, height_cm smallint, job_title text, education text, relationship_goal text, has_children text, wants_children text, smoking text, drinking text, religion text, commune text, languages text[], interests text[], swiped_at timestamp with time zone, is_verified boolean)
language sql
stable security definer
set search_path to ''
as $function$
  select p.user_id, p.display_name, p.birth_date, p.gender, c.name, p.bio,
    coalesce((
      select jsonb_agg(jsonb_build_object('id', ph.id, 'path', ph.storage_path) order by ph.position)
      from public.photos ph where ph.user_id = p.user_id
    ), '[]'::jsonb),
    p.last_active_at,
    p.height_cm, p.job_title, p.education, p.relationship_goal,
    p.has_children, p.wants_children, p.smoking, p.drinking,
    p.religion, p.commune, p.languages, p.interests,
    s.created_at, p.is_verified
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
    and not exists (
      select 1 from public.matches m
      where m.user_a = least((select auth.uid()), p.user_id)
        and m.user_b = greatest((select auth.uid()), p.user_id)
    )
  order by s.created_at desc
  limit 200;
$function$;

create or replace function public.get_event_passed(p_event uuid)
returns table(user_id uuid, display_name text, birth_date date, gender public.gender, city_name text, bio text, photos jsonb, last_active_at timestamp with time zone, height_cm smallint, job_title text, education text, relationship_goal text, has_children text, wants_children text, smoking text, drinking text, religion text, commune text, languages text[], interests text[], swiped_at timestamp with time zone, is_verified boolean)
language plpgsql
stable security definer
set search_path to ''
as $function$
declare
  v_me uuid := (select auth.uid());
begin
  if not exists (
    select 1 from public.event_attendees a where a.event_id = p_event and a.user_id = v_me
  ) then
    raise exception 'non_participant';
  end if;

  return query
  select p.user_id, p.display_name, p.birth_date, p.gender, c.name, p.bio,
    coalesce((
      select jsonb_agg(jsonb_build_object('id', ph.id, 'path', ph.storage_path) order by ph.position)
      from public.photos ph where ph.user_id = p.user_id
    ), '[]'::jsonb),
    case when p.incognito then null else p.last_active_at end,
    p.height_cm, p.job_title, p.education, p.relationship_goal,
    p.has_children, p.wants_children, p.smoking, p.drinking,
    p.religion, p.commune, p.languages, p.interests,
    es.created_at, p.is_verified
  from public.event_swipes es
  join public.profiles p on p.user_id = es.target_id
  left join public.cities c on c.id = p.city_id
  where es.event_id = p_event and es.swiper_id = v_me and not es.liked
    and p.is_onboarded and not p.is_banned
    and not exists (
      select 1 from public.blocks b
      where (b.blocker_id = v_me and b.blocked_id = p.user_id)
         or (b.blocker_id = p.user_id and b.blocked_id = v_me)
    )
    and not exists (
      select 1 from public.matches m
      where m.user_a = least(v_me, p.user_id)
        and m.user_b = greatest(v_me, p.user_id)
    )
  order by es.created_at desc
  limit 200;
end $function$;
