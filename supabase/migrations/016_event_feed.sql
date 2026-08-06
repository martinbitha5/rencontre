-- Dowe : le deck Rencontres en mode soirée (appliqué le 2026-07-26)
--
-- Plus d'écran "participants" : quand on est entré dans une soirée, l'onglet
-- Rencontres sert le deck habituel mais restreint aux personnes présentes.
-- Les filtres ville / genre / âge ne s'appliquent pas (on est sur place) ;
-- les règles économiques restent : profils déjà swipés exclus, likers
-- réservés à "Activité > Likes" (like retour payant), paires déjà en
-- conversation exclues.

drop function if exists public.get_event_attendees(uuid);

create function public.get_event_feed(p_event uuid, p_limit int default 20)
returns table (
  user_id uuid, display_name text, birth_date date, gender public.gender,
  city_name text, bio text, photos jsonb, last_active_at timestamptz,
  height_cm smallint, job_title text, education text, relationship_goal text,
  has_children text, wants_children text, smoking text, drinking text,
  religion text, commune text, languages text[], interests text[]
)
language plpgsql security definer set search_path = '' stable as $$
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
    and not exists (select 1 from public.swipes s where s.swiper_id = v_me and s.target_id = p.user_id)
    and not exists (
      select 1 from public.swipes sl
      where sl.swiper_id = p.user_id and sl.target_id = v_me and sl.liked
    )
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
end $$;

revoke execute on function public.get_event_feed(uuid, int) from public, anon;
grant execute on function public.get_event_feed(uuid, int) to authenticated;
