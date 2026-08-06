-- Dowe : favoris (accès rapide à des profils, privé, max 10) — appliqué le 2026-07-26

create table public.favorites (
  user_id uuid not null references public.profiles(user_id) on delete cascade,
  target_id uuid not null references public.profiles(user_id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, target_id),
  check (user_id <> target_id)
);
alter table public.favorites enable row level security;
create policy "favorites_select_own" on public.favorites
  for select to authenticated using (user_id = (select auth.uid()));

create function public.add_favorite(p_target uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_me uuid := (select auth.uid());
begin
  if v_me is null then raise exception 'non_authentifie'; end if;
  if p_target = v_me then raise exception 'cible_invalide'; end if;
  if not exists (
    select 1 from public.profiles where user_id = p_target and is_onboarded and not is_banned
  ) then raise exception 'profil_introuvable'; end if;
  if (select count(*) from public.favorites where user_id = v_me) >= 10 then
    return jsonb_build_object('status', 'limit_reached');
  end if;
  insert into public.favorites (user_id, target_id) values (v_me, p_target)
  on conflict do nothing;
  return jsonb_build_object('status', 'ok');
end $$;

create function public.remove_favorite(p_target uuid)
returns void language sql security definer set search_path = '' as $$
  delete from public.favorites
  where user_id = (select auth.uid()) and target_id = p_target;
$$;

create function public.get_favorites()
returns table (
  user_id uuid, display_name text, birth_date date, gender public.gender,
  city_name text, bio text, photos jsonb, last_active_at timestamptz,
  height_cm smallint, job_title text, education text, relationship_goal text,
  has_children text, wants_children text, smoking text, drinking text,
  religion text, commune text, languages text[], interests text[],
  favorited_at timestamptz
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
    f.created_at
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
  order by f.created_at desc;
$$;

revoke execute on function public.add_favorite(uuid) from public, anon;
revoke execute on function public.remove_favorite(uuid) from public, anon;
revoke execute on function public.get_favorites() from public, anon;
grant execute on function public.add_favorite(uuid) to authenticated;
grant execute on function public.remove_favorite(uuid) to authenticated;
grant execute on function public.get_favorites() to authenticated;
