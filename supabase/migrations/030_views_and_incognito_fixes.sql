-- 030 : « Vues » (qui a regardé mon profil), cohérence de l'incognito,
--       et identifiants de packs alignés sur les noms commerciaux.

-- ---------------------------------------------------------------------------
-- 1. Fuite d'incognito en soirée
--
-- En mode soirée, l'onglet Rencontres sert get_event_feed() au lieu du deck
-- habituel. Cette fonction ne filtrait pas `incognito` : un abonné payait pour
-- être invisible et réapparaissait dès qu'il scannait le QR d'une soirée.
-- C'est la promesse vendue qui saute, et pour une partie des utilisateurs
-- l'incognito sert justement à ne pas être retrouvé par quelqu'un de précis —
-- dans un lieu physique, c'est le pire endroit pour le réexposer.
-- L'invisibilité s'applique donc partout, soirée comprise.
-- ---------------------------------------------------------------------------
-- La signature reprend celle en vigueur depuis 025 (avec is_verified) :
-- la réécrire sans cette colonne la retirerait au client.
create or replace function public.get_event_feed(p_event uuid, p_limit int default 20)
returns table (
  user_id uuid, display_name text, birth_date date, gender public.gender,
  city_name text, bio text, photos jsonb, last_active_at timestamptz,
  height_cm smallint, job_title text, education text, relationship_goal text,
  has_children text, wants_children text, smoking text, drinking text,
  religion text, commune text, languages text[], interests text[],
  is_verified boolean
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
    p.religion, p.commune, p.languages, p.interests, p.is_verified
  from public.event_attendees a
  join public.profiles p on p.user_id = a.user_id
  left join public.cities c on c.id = p.city_id
  where a.event_id = p_event
    and a.user_id <> v_me
    and p.is_onboarded and not p.is_banned
    and not p.incognito
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

-- Même promesse dans les favoris : un profil incognito n'y expose pas sa
-- dernière activité (déjà fait pour get_likers en 029).
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
  order by f.created_at desc;
$$;
grant execute on function public.get_favorites() to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Identifiants de packs alignés sur les noms commerciaux
--    (bronze/silver/gold/diamond -> decouverte/elan/envol/prestige).
--    Aucun paiement n'a encore transité, le renommage est sans reprise.
-- ---------------------------------------------------------------------------
update public.economy_config set key = 'pack_prestige_days' where key = 'pack_diamond_days';

-- ---------------------------------------------------------------------------
-- 3. Vues : qui a ouvert mon profil dans les dernières 24 h
--
-- Une ligne par couple (regardeur, regardé) : on garde la dernière visite,
-- pas l'historique complet — la table ne gonfle donc pas avec le trafic.
-- Ouverte à tous, comme « Likes » : le paywall reste l'action (like retour,
-- DM), pas la consultation.
-- ---------------------------------------------------------------------------
create table if not exists public.profile_views (
  viewer_id uuid not null references public.profiles(user_id) on delete cascade,
  viewed_id uuid not null references public.profiles(user_id) on delete cascade,
  viewed_at timestamptz not null default now(),
  primary key (viewer_id, viewed_id)
);
create index if not exists profile_views_viewed_idx
  on public.profile_views (viewed_id, viewed_at desc);

alter table public.profile_views enable row level security;
drop policy if exists "profile_views_select_own" on public.profile_views;
-- Je ne vois que les visites reçues. Personne ne peut interroger les siennes
-- pour savoir qui il a consulté, ni celles des autres.
create policy "profile_views_select_own" on public.profile_views
  for select to authenticated using (viewed_id = (select auth.uid()));

-- Enregistre une visite. En incognito, RIEN n'est enregistré : c'est l'autre
-- moitié de la promesse « continue à explorer sans apparaître ».
create or replace function public.record_profile_view(p_target uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_me uuid := (select auth.uid());
begin
  if v_me is null or p_target is null or p_target = v_me then return; end if;
  if exists (select 1 from public.profiles p where p.user_id = v_me and p.incognito) then
    return;
  end if;
  if not exists (
    select 1 from public.profiles p
    where p.user_id = p_target and p.is_onboarded and not p.is_banned
  ) then return; end if;
  if exists (
    select 1 from public.blocks b
    where (b.blocker_id = v_me and b.blocked_id = p_target)
       or (b.blocker_id = p_target and b.blocked_id = v_me)
  ) then return; end if;

  insert into public.profile_views (viewer_id, viewed_id)
  values (v_me, p_target)
  on conflict (viewer_id, viewed_id) do update set viewed_at = now();
end $$;

create or replace function public.get_profile_views()
returns table (
  user_id uuid, display_name text, birth_date date, gender public.gender,
  city_name text, bio text, photos jsonb, last_active_at timestamptz,
  height_cm smallint, job_title text, education text, relationship_goal text,
  has_children text, wants_children text, smoking text, drinking text,
  religion text, commune text, languages text[], interests text[],
  viewed_at timestamptz, is_verified boolean
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
    v.viewed_at, p.is_verified
  from public.profile_views v
  join public.profiles p on p.user_id = v.viewer_id
  left join public.cities c on c.id = p.city_id
  where v.viewed_id = (select auth.uid())
    and v.viewed_at > now() - interval '24 hours'
    and p.is_onboarded and not p.is_banned
    and not p.shadowbanned
    and not exists (
      select 1 from public.blocks b
      where (b.blocker_id = (select auth.uid()) and b.blocked_id = p.user_id)
         or (b.blocker_id = p.user_id and b.blocked_id = (select auth.uid()))
    )
  order by v.viewed_at desc
  limit 100;
$$;

revoke execute on function public.record_profile_view(uuid) from public, anon;
revoke execute on function public.get_profile_views() from public, anon;
grant execute on function public.record_profile_view(uuid) to authenticated;
grant execute on function public.get_profile_views() to authenticated;
