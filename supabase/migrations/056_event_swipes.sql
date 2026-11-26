-- ---------------------------------------------------------------------------
-- 056 : ce qui se passe en soirée reste en soirée (décision produit du
--       15/09/2026)
--
-- La soirée devient le produit central : un compte Zola est un passe, le scan
-- ouvre le même paquet de cartes que Rencontres, limité aux personnes qui ont
-- scanné. Jusqu'ici, un recalage fait en soirée tombait dans public.swipes,
-- c'est-à-dire dans l'historique de Rencontres, pour toujours. Le refus d'un
-- soir devenait un refus définitif, et l'historique de Rencontres se
-- remplissait de gens croisés dans un bar.
--
-- Règles posées :
--   1. Deux univers qui ne se parlent pas. Un recalage de soirée est rangé
--      dans event_swipes, jamais dans swipes. Il n'a aucun effet sur le fil
--      Rencontres, ni maintenant ni plus tard. À l'inverse, quelqu'un qu'on a
--      recalé dans Rencontres réapparaît dans le paquet de la soirée : c'est
--      un autre contexte.
--   2. Le like est une relation, il survit. Un like fait en soirée s'écrit
--      dans swipes comme un like normal (il peut donc devenir un match, et la
--      personne le retrouve dans Activité > Likes). Ce qui s'efface, c'est le
--      recalage, pas la relation. Les matchs et les conversations restent.
--   3. L'historique de soirée est temporaire. Tant que la soirée est ouverte,
--      on peut revoir les profils recalés et se raviser. Quand elle se
--      termine, à l'heure fixée au backoffice ou par « Mettre fin à
--      l'accès », il s'efface. L'historique de Rencontres, lui, ne bouge pas.
--
-- Fin de soirée : « les deux ». Une heure de fin par défaut (events.ends_at)
-- et un bouton pour clore plus tôt ou prolonger (backoffice, déjà en place).
-- La purge suit les deux chemins : un trigger sur events pour la fermeture à
-- la main, et un balayage paresseux dans get_my_events() (appelée à chaque
-- ouverture de l'app) pour l'heure de fin atteinte sans que personne ne touche
-- à la ligne. Pas de pg_cron sur ce projet (021, 027), comme partout.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 1. La table
-- ---------------------------------------------------------------------------
create table if not exists public.event_swipes (
  event_id   uuid not null references public.events(id) on delete cascade,
  swiper_id  uuid not null references public.profiles(user_id) on delete cascade,
  target_id  uuid not null references public.profiles(user_id) on delete cascade,
  liked      boolean not null,
  created_at timestamptz not null default now(),
  primary key (event_id, swiper_id, target_id)
);

comment on table public.event_swipes is
  'Décisions prises dans le paquet d''une soirée. Effacées à la fin de la soirée. Les likes sont aussi recopiés dans swipes : seul le recalage est temporaire.';

-- Historique d'un participant, et purge par soirée.
create index if not exists event_swipes_target_idx
  on public.event_swipes (target_id);

alter table public.event_swipes enable row level security;
-- Aucune policy : la table ne se lit et ne s'écrit que par les RPC ci-dessous.
revoke all on public.event_swipes from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. Purge
-- ---------------------------------------------------------------------------
-- Une soirée est fermée quand elle n'est plus active OU que sa fin est passée :
-- exactement les deux conditions de scan_event() et du backoffice.
create or replace function public.event_is_open(p_event uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.events e
    where e.id = p_event and e.is_active and (e.ends_at is null or e.ends_at > now())
  );
$$;
revoke execute on function public.event_is_open(uuid) from public, anon, authenticated;

-- Balayage paresseux : efface l'historique de toute soirée fermée. Appelé par
-- get_my_events(), c'est-à-dire à chaque ouverture de l'app par n'importe qui.
-- Idempotent, et quasi gratuit quand il n'y a rien à faire : events tient sur
-- une page.
create or replace function public.purge_ended_event_swipes()
returns void language sql security definer set search_path = '' as $$
  delete from public.event_swipes es
  using public.events e
  where e.id = es.event_id
    and (not e.is_active or (e.ends_at is not null and e.ends_at <= now()));
$$;
revoke execute on function public.purge_ended_event_swipes() from public, anon, authenticated;

-- Fermeture à la main (« Mettre fin à l'accès ») : l'historique part tout de
-- suite, sans attendre que quelqu'un ouvre l'app. La purge se déclenche sur
-- toute transition qui passe par un état fermé, y compris une réouverture :
-- si la fin avait été atteinte sans que le balayage ne passe, rouvrir ne doit
-- pas ressusciter les recalages de la veille. Prolonger une soirée encore
-- ouverte (ends_at repoussé) ne touche à rien.
create or replace function public.events_purge_swipes_on_close()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_old_open boolean := old.is_active and (old.ends_at is null or old.ends_at > now());
  v_new_open boolean := new.is_active and (new.ends_at is null or new.ends_at > now());
begin
  if not (v_old_open and v_new_open) then
    delete from public.event_swipes where event_id = new.id;
  end if;
  return new;
end $$;
revoke execute on function public.events_purge_swipes_on_close() from public, anon, authenticated;

drop trigger if exists events_purge_swipes on public.events;
create trigger events_purge_swipes
  after update of is_active, ends_at on public.events
  for each row execute function public.events_purge_swipes_on_close();

-- get_my_events() : même signature, même résultat, plus le balayage. Passe de
-- sql stable à plpgsql volatile, puisqu'elle écrit désormais.
create or replace function public.get_my_events()
returns table (event_id uuid, name text, ends_at timestamptz, joined_at timestamptz)
language plpgsql security definer set search_path = '' as $$
begin
  perform public.purge_ended_event_swipes();
  return query
  select e.id, e.name, e.ends_at, a.created_at
  from public.event_attendees a
  join public.events e on e.id = a.event_id
  where a.user_id = (select auth.uid())
    and e.is_active
    and (e.ends_at is null or e.ends_at > now())
  order by a.created_at desc;
end $$;

-- ---------------------------------------------------------------------------
-- 3. Le paquet de la soirée
-- ---------------------------------------------------------------------------
-- Même signature que depuis 025/030. Ce qui change : on exclut les décisions
-- prises DANS CETTE SOIRÉE (event_swipes) et les likes déjà donnés dans
-- Rencontres (swipes.liked), mais plus les recalages de Rencontres : un
-- profil passé dans le fil du quotidien a le droit de réapparaître dans un
-- bar. Les autres règles restent : les personnes qui m'ont liké se retrouvent
-- dans Activité > Likes, pas dans le paquet ; paires déjà en match exclues ;
-- blocages ; incognito.
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
    where a.event_id = p_event and a.user_id = v_me
  ) or not public.event_is_open(p_event) then
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
    and not exists (
      select 1 from public.event_swipes es
      where es.event_id = p_event and es.swiper_id = v_me and es.target_id = p.user_id
    )
    and not exists (
      select 1 from public.swipes s
      where s.swiper_id = v_me and s.target_id = p.user_id and s.liked
    )
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

-- ---------------------------------------------------------------------------
-- 4. Décider dans la soirée
-- ---------------------------------------------------------------------------
-- Un like passe par le même chemin que swipe() : quota des comptes non
-- vérifiés, écriture dans swipes (relation durable), match si l'autre m'a déjà
-- liké, d'où qu'il vienne. Un recalage ne quitte jamais event_swipes.
--   ok / match / limit_reached : mêmes verdicts que swipe()
--   exception evenement_termine : la soirée s'est fermée entre deux cartes ;
--                                 le client resynchronise et repasse en
--                                 Rencontres.
create or replace function public.event_swipe(p_event uuid, p_target uuid, p_liked boolean)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_me uuid := (select auth.uid());
  v_quota jsonb;
  v_match_id uuid;
begin
  if v_me is null then raise exception 'non_authentifie'; end if;
  if p_target = v_me then raise exception 'cible_invalide'; end if;
  if not exists (
    select 1 from public.event_attendees a where a.event_id = p_event and a.user_id = v_me
  ) then
    raise exception 'non_participant';
  end if;
  if not public.event_is_open(p_event) then
    raise exception 'evenement_termine';
  end if;
  -- La cible doit être sur place : le paquet ne sert que des présents, et une
  -- décision de soirée sur quelqu'un d'absent n'aurait pas de sens.
  if not exists (
    select 1 from public.event_attendees a
    join public.profiles p on p.user_id = a.user_id
    where a.event_id = p_event and a.user_id = p_target
      and p.is_onboarded and not p.is_banned
  ) then
    raise exception 'profil_introuvable';
  end if;

  if p_liked then
    v_quota := public.like_quota(v_me);
    if not (v_quota->>'unlimited')::boolean and (v_quota->>'left')::int <= 0 then
      return jsonb_build_object(
        'status', 'limit_reached', 'limit', (v_quota->>'limit')::int);
    end if;
  end if;

  insert into public.event_swipes (event_id, swiper_id, target_id, liked)
  values (p_event, v_me, p_target, p_liked)
  on conflict (event_id, swiper_id, target_id)
    do update set liked = excluded.liked, created_at = now();

  if not p_liked then
    return jsonb_build_object('status', 'ok');
  end if;

  -- Le like est une relation : il rejoint swipes et y écrase un éventuel
  -- recalage de Rencontres, exactement comme like_from_history().
  insert into public.swipes (swiper_id, target_id, liked)
  values (v_me, p_target, true)
  on conflict (swiper_id, target_id)
    do update set liked = true, created_at = now(), hidden_from_history = false;

  if exists (
    select 1 from public.swipes where swiper_id = p_target and target_id = v_me and liked
  ) then
    insert into public.matches (user_a, user_b)
    values (least(v_me, p_target), greatest(v_me, p_target))
    on conflict (user_a, user_b) do update set is_active = true, status = 'active'
    returning id into v_match_id;
    return jsonb_build_object('status', 'match', 'match_id', v_match_id);
  end if;

  return jsonb_build_object('status', 'ok');
end $$;

-- ---------------------------------------------------------------------------
-- 5. L'historique de la soirée : revoir les recalés, se raviser
-- ---------------------------------------------------------------------------
-- Même forme que get_passed_profiles(), restreinte à la soirée. Vide dès que
-- la soirée est fermée (purge), et refusée à qui n'y est pas.
create or replace function public.get_event_passed(p_event uuid)
returns table (
  user_id uuid, display_name text, birth_date date, gender public.gender,
  city_name text, bio text, photos jsonb, last_active_at timestamptz,
  height_cm smallint, job_title text, education text, relationship_goal text,
  has_children text, wants_children text, smoking text, drinking text,
  religion text, commune text, languages text[], interests text[],
  swiped_at timestamptz, is_verified boolean
)
language plpgsql security definer set search_path = '' stable as $$
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
  order by es.created_at desc
  limit 200;
end $$;

-- Se raviser depuis l'historique de la soirée : le recalage devient un like,
-- avec les mêmes conséquences qu'un like du paquet.
create or replace function public.event_like_from_history(p_event uuid, p_target uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_me uuid := (select auth.uid());
begin
  if v_me is null then raise exception 'non_authentifie'; end if;
  if not exists (
    select 1 from public.event_swipes es
    where es.event_id = p_event and es.swiper_id = v_me
      and es.target_id = p_target and not es.liked
  ) then
    raise exception 'introuvable';
  end if;
  return public.event_swipe(p_event, p_target, true);
end $$;

-- ---------------------------------------------------------------------------
-- 6. Backoffice : le bilan d'une soirée
-- ---------------------------------------------------------------------------
-- C'est ce qu'on montre à un partenaire : combien de personnes sont entrées,
-- combien de likes et de matchs sont nés sur place, ce qui a été encaissé.
-- Likes et matchs sont comptés entre deux participants, pendant la fenêtre
-- de la soirée (de sa création à sa fin, ou à maintenant). Ils viennent de
-- swipes et matches, qui survivent à la purge : le bilan reste lisible après
-- la soirée. Les recalages, eux, ne sont comptés que tant que la soirée est
-- ouverte, puisqu'ils disparaissent avec elle.
create or replace function public.admin_event_stats(p_event uuid)
returns jsonb
language plpgsql security definer set search_path = '' stable as $$
declare
  v_admin uuid := public.require_admin();
  v_event record;
  v_until timestamptz;
begin
  select id, created_at, ends_at, is_active into v_event from public.events where id = p_event;
  if v_event.id is null then raise exception 'introuvable'; end if;
  v_until := least(coalesce(v_event.ends_at, now()), now());

  return jsonb_build_object(
    'open', public.event_is_open(p_event),
    'entries', (select count(*) from public.event_attendees a where a.event_id = p_event),
    'verified', (
      select count(*) from public.event_attendees a
      join public.profiles p on p.user_id = a.user_id
      where a.event_id = p_event and p.is_verified
    ),
    'revenue_cdf', coalesce((
      select sum(o.amount_cdf) from public.payment_orders o
      where o.kind = 'event' and o.status = 'success' and o.item_id = p_event::text
    ), 0),
    'likes', (
      select count(*) from public.swipes s
      where s.liked
        and s.created_at >= v_event.created_at and s.created_at <= v_until
        and exists (select 1 from public.event_attendees a where a.event_id = p_event and a.user_id = s.swiper_id)
        and exists (select 1 from public.event_attendees a where a.event_id = p_event and a.user_id = s.target_id)
    ),
    'matches', (
      select count(*) from public.matches m
      where m.created_at >= v_event.created_at and m.created_at <= v_until
        and exists (select 1 from public.event_attendees a where a.event_id = p_event and a.user_id = m.user_a)
        and exists (select 1 from public.event_attendees a where a.event_id = p_event and a.user_id = m.user_b)
    ),
    'passes_live', (
      select count(*) from public.event_swipes es where es.event_id = p_event and not es.liked
    ),
    'attendees', coalesce((
      select jsonb_agg(jsonb_build_object(
        'user_id', p.user_id,
        'public_id', p.public_id,
        'display_name', p.display_name,
        'is_verified', p.is_verified,
        'photo', (select ph.storage_path from public.photos ph where ph.user_id = p.user_id order by ph.position limit 1),
        'joined_at', a.created_at
      ) order by a.created_at desc)
      from public.event_attendees a
      join public.profiles p on p.user_id = a.user_id
      where a.event_id = p_event
    ), '[]'::jsonb)
  );
end $$;

-- ---------------------------------------------------------------------------
-- 7. Grants
-- ---------------------------------------------------------------------------
revoke execute on function public.get_my_events() from public, anon;
revoke execute on function public.get_event_feed(uuid, int) from public, anon;
revoke execute on function public.event_swipe(uuid, uuid, boolean) from public, anon;
revoke execute on function public.get_event_passed(uuid) from public, anon;
revoke execute on function public.event_like_from_history(uuid, uuid) from public, anon;
revoke execute on function public.admin_event_stats(uuid) from public, anon;

grant execute on function public.get_my_events() to authenticated;
grant execute on function public.get_event_feed(uuid, int) to authenticated;
grant execute on function public.event_swipe(uuid, uuid, boolean) to authenticated;
grant execute on function public.get_event_passed(uuid) to authenticated;
grant execute on function public.event_like_from_history(uuid, uuid) to authenticated;
grant execute on function public.admin_event_stats(uuid) to authenticated;
