-- Les favoris servent à garder un profil sous la main avant de se décider.
-- Dès qu'un match actif existe avec la personne, la conversation a pris le
-- relais : le profil ne doit plus apparaître dans les favoris.

create or replace function public.get_favorites()
returns table (
  user_id uuid, display_name text, birth_date date, gender public.gender,
  city_name text, bio text, photos jsonb, last_active_at timestamptz,
  height_cm smallint, job_title text, education text, relationship_goal text,
  has_children text, wants_children text, smoking text, drinking text,
  religion text, commune text, languages text[], interests text[],
  favorited_at timestamptz, is_verified boolean
)
language sql stable security definer set search_path = '' as $$
  select p.user_id, p.display_name, p.birth_date, p.gender, c.name, p.bio,
    coalesce((
      select jsonb_agg(jsonb_build_object('id', ph.id, 'path', ph.storage_path) order by ph.position)
      from public.photos ph where ph.user_id = p.user_id
    ), '[]'::jsonb),
    case when p.incognito then null else p.last_active_at end,
    p.height_cm, p.job_title, p.education, p.relationship_goal,
    p.has_children, p.wants_children, p.smoking, p.drinking,
    p.religion, p.commune, p.languages, p.interests,
    f.created_at, p.is_verified
  from public.favorites f
  join public.profiles p on p.user_id = f.target_id
  left join public.cities c on c.id = p.city_id
  where f.user_id = (select auth.uid())
    and p.is_onboarded and not p.is_banned
    and not exists (
      select 1 from public.blocks b
      where (b.blocker_id = (select auth.uid()) and b.blocked_id = p.user_id)
         or (b.blocker_id = p.user_id and b.blocked_id = (select auth.uid()))
    )
    -- match actif = conversation en cours : le profil sort des favoris
    and not exists (
      select 1 from public.matches m
      where m.user_a = least((select auth.uid()), p.user_id)
        and m.user_b = greatest((select auth.uid()), p.user_id)
        and m.is_active and m.status = 'active'
    )
  order by f.created_at desc;
$$;
grant execute on function public.get_favorites() to authenticated;
