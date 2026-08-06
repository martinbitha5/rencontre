-- Dowe : économie de coins, messages directs, historique des passés (appliqué le 2026-07-26)
--
-- Règles métier :
-- - Liker en retour depuis "J'aime" coûte des coins (like_back_cost).
-- - Un DM depuis "Découvrir" est payé par celui qui écrit en premier ;
--   les N premiers DM (free_dm_quota) sont gratuits. Répondre ne coûte rien.
-- - Un profil qui m'a liké ne retombe jamais dans le feed Découvrir.
-- - Les coûts vivent dans economy_config : c'est la source de vérité serveur,
--   l'app la lit via get_wallet(). Ne jamais coder un coût en dur dans une RPC.

-- ---------------------------------------------------------------------------
-- 0. Réparation : les colonnes ajoutées en 008 n'avaient pas de grant UPDATE,
--    l'édition du profil détaillé échouait silencieusement côté PostgREST.
-- ---------------------------------------------------------------------------
grant update (height_cm, job_title, education, relationship_goal, has_children,
  wants_children, smoking, drinking, religion, commune, languages, interests)
  on public.profiles to authenticated;

-- ---------------------------------------------------------------------------
-- 1. Mode incognito : le profil n'apparaît plus dans le feed des autres.
-- ---------------------------------------------------------------------------
alter table public.profiles add column if not exists incognito boolean not null default false;
grant update (incognito) on public.profiles to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Configuration de l'économie
-- ---------------------------------------------------------------------------
create table public.economy_config (
  key text primary key,
  value int not null
);
alter table public.economy_config enable row level security;
create policy "economy_config_select" on public.economy_config
  for select to authenticated using (true);

insert into public.economy_config (key, value) values
  ('like_back_cost', 10),
  ('dm_cost', 5),
  ('free_dm_quota', 5),
  ('welcome_coins', 10),
  ('incognito_cost', 0);

create or replace function public.economy_value(p_key text)
returns int language sql security definer set search_path = '' stable as $$
  select value from public.economy_config where key = p_key;
$$;

-- ---------------------------------------------------------------------------
-- 3. Portefeuille + transactions
-- ---------------------------------------------------------------------------
create table public.coin_wallets (
  user_id uuid primary key references public.profiles(user_id) on delete cascade,
  balance int not null default 0 check (balance >= 0),
  free_dms_used int not null default 0 check (free_dms_used >= 0),
  updated_at timestamptz not null default now()
);
alter table public.coin_wallets enable row level security;
create policy "coin_wallets_select_own" on public.coin_wallets
  for select to authenticated using (user_id = (select auth.uid()));

create table public.coin_transactions (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles(user_id) on delete cascade,
  amount int not null,
  kind text not null check (kind in ('welcome','recharge','like_back','dm','admin')),
  ref_user_id uuid references public.profiles(user_id) on delete set null,
  created_at timestamptz not null default now()
);
create index coin_transactions_user_idx on public.coin_transactions (user_id, id desc);
alter table public.coin_transactions enable row level security;
create policy "coin_transactions_select_own" on public.coin_transactions
  for select to authenticated using (user_id = (select auth.uid()));

-- Crée le portefeuille avec le bonus de bienvenue (idempotent).
create or replace function public.ensure_wallet(p_user uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_welcome int := coalesce(public.economy_value('welcome_coins'), 0);
begin
  insert into public.coin_wallets (user_id, balance) values (p_user, v_welcome)
  on conflict (user_id) do nothing;
  if found and v_welcome > 0 then
    insert into public.coin_transactions (user_id, amount, kind)
    values (p_user, v_welcome, 'welcome');
  end if;
end $$;

-- Débit atomique : false si solde insuffisant.
create or replace function public.debit_coins(p_user uuid, p_amount int, p_kind text, p_ref uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  update public.coin_wallets
  set balance = balance - p_amount, updated_at = now()
  where user_id = p_user and balance >= p_amount;
  if not found then return false; end if;
  insert into public.coin_transactions (user_id, amount, kind, ref_user_id)
  values (p_user, -p_amount, p_kind, p_ref);
  return true;
end $$;

-- Portefeuille à l'inscription + rattrapage des comptes existants.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (user_id) values (new.id) on conflict do nothing;
  insert into public.entitlements (user_id) values (new.id) on conflict do nothing;
  perform public.ensure_wallet(new.id);
  return new;
end $$;

select public.ensure_wallet(user_id) from public.profiles;

-- ---------------------------------------------------------------------------
-- 4. Matches : statut (pending = DM sans réponse) + origine + initiateur
-- ---------------------------------------------------------------------------
alter table public.matches
  add column status text not null default 'active' check (status in ('pending','active')),
  add column origin text not null default 'swipe' check (origin in ('swipe','dm')),
  add column initiated_by uuid references public.profiles(user_id) on delete set null;

-- Le match devient réel dès que le destinataire du DM répond.
create or replace function public.activate_match_on_reply()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  update public.matches
  set status = 'active'
  where id = new.match_id
    and status = 'pending'
    and initiated_by is not null
    and initiated_by <> new.sender_id;
  return new;
end $$;
create trigger messages_activate_pending after insert on public.messages
  for each row execute function public.activate_match_on_reply();

-- ---------------------------------------------------------------------------
-- 5. get_wallet : solde + paramètres de l'économie pour l'app
-- ---------------------------------------------------------------------------
create or replace function public.get_wallet()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_me uuid := (select auth.uid());
  v_balance int;
  v_free_used int;
begin
  if v_me is null then raise exception 'non_authentifie'; end if;
  perform public.ensure_wallet(v_me);
  select balance, free_dms_used into v_balance, v_free_used
  from public.coin_wallets where user_id = v_me;
  return jsonb_build_object(
    'balance', v_balance,
    'free_dms_used', v_free_used,
    'free_dm_quota', coalesce(public.economy_value('free_dm_quota'), 5),
    'like_back_cost', coalesce(public.economy_value('like_back_cost'), 10),
    'dm_cost', coalesce(public.economy_value('dm_cost'), 5),
    'incognito_cost', coalesce(public.economy_value('incognito_cost'), 0)
  );
end $$;

-- ---------------------------------------------------------------------------
-- 6. like_back : liker en retour depuis "J'aime" (payant)
-- ---------------------------------------------------------------------------
create or replace function public.like_back(p_target uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_me uuid := (select auth.uid());
  v_cost int := coalesce(public.economy_value('like_back_cost'), 10);
  v_match_id uuid;
  v_balance int;
begin
  if v_me is null then raise exception 'non_authentifie'; end if;
  if p_target = v_me then raise exception 'cible_invalide'; end if;
  if not exists (
    select 1 from public.profiles where user_id = p_target and is_onboarded and not is_banned
  ) then raise exception 'profil_introuvable'; end if;
  if exists (
    select 1 from public.blocks b
    where (b.blocker_id = v_me and b.blocked_id = p_target)
       or (b.blocker_id = p_target and b.blocked_id = v_me)
  ) then raise exception 'bloque'; end if;
  if not exists (
    select 1 from public.swipes s
    where s.swiper_id = p_target and s.target_id = v_me and s.liked
  ) then raise exception 'pas_de_like'; end if;

  -- Déjà liké en retour : renvoyer le match existant sans redébiter.
  if exists (
    select 1 from public.swipes s
    where s.swiper_id = v_me and s.target_id = p_target and s.liked
  ) then
    select id into v_match_id from public.matches
    where user_a = least(v_me, p_target) and user_b = greatest(v_me, p_target);
    if v_match_id is not null then
      return jsonb_build_object('status', 'match', 'match_id', v_match_id);
    end if;
  end if;

  perform public.ensure_wallet(v_me);
  if not public.debit_coins(v_me, v_cost, 'like_back', p_target) then
    select balance into v_balance from public.coin_wallets where user_id = v_me;
    return jsonb_build_object('status', 'insufficient_coins', 'cost', v_cost,
      'balance', coalesce(v_balance, 0));
  end if;

  insert into public.swipes (swiper_id, target_id, liked)
  values (v_me, p_target, true)
  on conflict (swiper_id, target_id) do update set liked = true, created_at = now();

  insert into public.matches (user_a, user_b, status, origin, initiated_by)
  values (least(v_me, p_target), greatest(v_me, p_target), 'active', 'swipe', v_me)
  on conflict (user_a, user_b) do update set is_active = true, status = 'active'
  returning id into v_match_id;

  select balance into v_balance from public.coin_wallets where user_id = v_me;
  return jsonb_build_object('status', 'match', 'match_id', v_match_id, 'balance', v_balance);
end $$;

-- ---------------------------------------------------------------------------
-- 7. send_direct_message : DM depuis "Découvrir", payé par l'initiateur
-- ---------------------------------------------------------------------------
create or replace function public.send_direct_message(p_target uuid, p_content text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_me uuid := (select auth.uid());
  v_cost int := coalesce(public.economy_value('dm_cost'), 5);
  v_quota int := coalesce(public.economy_value('free_dm_quota'), 5);
  v_free_used int;
  v_match_id uuid;
  v_active boolean;
  v_balance int;
  v_charged boolean := false;
begin
  if v_me is null then raise exception 'non_authentifie'; end if;
  if p_target = v_me then raise exception 'cible_invalide'; end if;
  if p_content is null or char_length(btrim(p_content)) < 1 or char_length(p_content) > 2000 then
    raise exception 'message_invalide';
  end if;
  if not exists (
    select 1 from public.profiles where user_id = p_target and is_onboarded and not is_banned
  ) then raise exception 'profil_introuvable'; end if;
  if exists (
    select 1 from public.blocks b
    where (b.blocker_id = v_me and b.blocked_id = p_target)
       or (b.blocker_id = p_target and b.blocked_id = v_me)
  ) then raise exception 'bloque'; end if;

  select id, is_active into v_match_id, v_active
  from public.matches
  where user_a = least(v_me, p_target) and user_b = greatest(v_me, p_target);

  if v_match_id is not null and not v_active then
    raise exception 'conversation_fermee';
  end if;

  if v_match_id is null then
    -- Nouvelle conversation : quota gratuit d'abord, puis débit de coins.
    perform public.ensure_wallet(v_me);
    select free_dms_used into v_free_used from public.coin_wallets where user_id = v_me;
    if v_free_used < v_quota then
      update public.coin_wallets
      set free_dms_used = free_dms_used + 1, updated_at = now()
      where user_id = v_me;
    else
      if not public.debit_coins(v_me, v_cost, 'dm', p_target) then
        select balance into v_balance from public.coin_wallets where user_id = v_me;
        return jsonb_build_object('status', 'insufficient_coins', 'cost', v_cost,
          'balance', coalesce(v_balance, 0));
      end if;
      v_charged := true;
    end if;

    insert into public.matches (user_a, user_b, status, origin, initiated_by)
    values (least(v_me, p_target), greatest(v_me, p_target), 'pending', 'dm', v_me)
    returning id into v_match_id;
  end if;

  insert into public.messages (match_id, sender_id, content)
  values (v_match_id, v_me, btrim(p_content));

  select balance, free_dms_used into v_balance, v_free_used
  from public.coin_wallets where user_id = v_me;
  return jsonb_build_object(
    'status', 'sent', 'match_id', v_match_id,
    'balance', coalesce(v_balance, 0),
    'free_dms_left', greatest(v_quota - coalesce(v_free_used, 0), 0),
    'charged', v_charged
  );
end $$;

-- ---------------------------------------------------------------------------
-- 8. swipe : garde-fou "liker" — un profil qui m'a liké passe par "J'aime"
--    (le feed les exclut déjà ; ceci empêche le contournement direct de la RPC)
-- ---------------------------------------------------------------------------
create or replace function public.swipe(p_target uuid, p_liked boolean)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_me uuid := (select auth.uid());
  v_is_premium boolean;
  v_likes_today int;
  v_match_id uuid;
begin
  if v_me is null then raise exception 'non_authentifie'; end if;
  if p_target = v_me then raise exception 'cible_invalide'; end if;
  if not exists (
    select 1 from public.profiles where user_id = p_target and is_onboarded and not is_banned
  ) then
    raise exception 'profil_introuvable';
  end if;

  if p_liked and exists (
    select 1 from public.swipes s
    where s.swiper_id = p_target and s.target_id = v_me and s.liked
  ) then
    return jsonb_build_object('status', 'liked_you');
  end if;

  if p_liked then
    select coalesce(e.is_premium and (e.expires_at is null or e.expires_at > now()), false)
      into v_is_premium
      from public.entitlements e where e.user_id = v_me;
    if not coalesce(v_is_premium, false) then
      select count(*) into v_likes_today
      from public.swipes
      where swiper_id = v_me and liked and created_at >= date_trunc('day', now());
      if v_likes_today >= 30 then
        return jsonb_build_object('status', 'limit_reached');
      end if;
    end if;
  end if;

  insert into public.swipes (swiper_id, target_id, liked)
  values (v_me, p_target, p_liked)
  on conflict (swiper_id, target_id) do nothing;

  if not p_liked then
    return jsonb_build_object('status', 'ok');
  end if;

  if exists (select 1 from public.swipes where swiper_id = p_target and target_id = v_me and liked) then
    insert into public.matches (user_a, user_b)
    values (least(v_me, p_target), greatest(v_me, p_target))
    on conflict (user_a, user_b) do update set is_active = true, status = 'active'
    returning id into v_match_id;
    return jsonb_build_object('status', 'match', 'match_id', v_match_id);
  end if;

  return jsonb_build_object('status', 'ok');
end $$;

-- ---------------------------------------------------------------------------
-- 9. get_discovery_feed : exclut les likers (règle "J'aime" payant),
--    les paires ayant déjà une conversation, et les profils incognito
-- ---------------------------------------------------------------------------
create or replace function public.get_discovery_feed(p_limit int default 20)
returns table (
  user_id uuid, display_name text, birth_date date, gender public.gender,
  city_name text, bio text, photos jsonb, last_active_at timestamptz,
  height_cm smallint, job_title text, education text, relationship_goal text,
  has_children text, wants_children text, smoking text, drinking text,
  religion text, commune text, languages text[], interests text[]
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
    p.religion, p.commune, p.languages, p.interests
  from public.profiles p
  join public.cities c on c.id = p.city_id
  join public.profiles me on me.user_id = (select auth.uid())
  where p.user_id <> me.user_id
    and me.is_onboarded and not me.is_banned
    and p.is_onboarded and not p.is_banned
    and not p.incognito
    and p.city_id = me.city_id
    and p.gender = me.looking_for
    and p.looking_for = me.gender
    and extract(year from age(p.birth_date))::int between me.age_min and me.age_max
    and extract(year from age(me.birth_date))::int between p.age_min and p.age_max
    and not exists (select 1 from public.swipes s where s.swiper_id = me.user_id and s.target_id = p.user_id)
    and not exists (
      select 1 from public.swipes sl
      where sl.swiper_id = p.user_id and sl.target_id = me.user_id and sl.liked
    )
    and not exists (
      select 1 from public.matches m
      where m.user_a = least(me.user_id, p.user_id) and m.user_b = greatest(me.user_id, p.user_id)
    )
    and not exists (
      select 1 from public.blocks b
      where (b.blocker_id = me.user_id and b.blocked_id = p.user_id)
         or (b.blocker_id = p.user_id and b.blocked_id = me.user_id)
    )
  order by p.last_active_at desc
  limit least(greatest(p_limit, 1), 50);
$$;

-- ---------------------------------------------------------------------------
-- 10. get_likers : ouvert à tous (le paywall est le like retour), profil complet
-- ---------------------------------------------------------------------------
drop function if exists public.get_likers();
create function public.get_likers()
returns table (
  user_id uuid, display_name text, birth_date date, gender public.gender,
  city_name text, bio text, photos jsonb, last_active_at timestamptz,
  height_cm smallint, job_title text, education text, relationship_goal text,
  has_children text, wants_children text, smoking text, drinking text,
  religion text, commune text, languages text[], interests text[],
  liked_at timestamptz
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
  join public.profiles p on p.user_id = s.swiper_id
  left join public.cities c on c.id = p.city_id
  where s.target_id = (select auth.uid()) and s.liked
    and p.is_onboarded and not p.is_banned
    and not exists (
      select 1 from public.swipes s2
      where s2.swiper_id = (select auth.uid()) and s2.target_id = p.user_id and s2.liked
    )
    and not exists (
      select 1 from public.matches m
      where m.user_a = least((select auth.uid()), p.user_id)
        and m.user_b = greatest((select auth.uid()), p.user_id)
    )
    and not exists (
      select 1 from public.blocks b
      where (b.blocker_id = (select auth.uid()) and b.blocked_id = p.user_id)
         or (b.blocker_id = p.user_id and b.blocked_id = (select auth.uid()))
    )
  order by s.created_at desc
  limit 100;
$$;

-- ---------------------------------------------------------------------------
-- 11. get_passed_profiles : profils passés, re-likables depuis l'historique
-- ---------------------------------------------------------------------------
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
    and p.is_onboarded and not p.is_banned and not p.incognito
    and not exists (
      select 1 from public.swipes sl
      where sl.swiper_id = p.user_id and sl.target_id = (select auth.uid()) and sl.liked
    )
    and not exists (
      select 1 from public.matches m
      where m.user_a = least((select auth.uid()), p.user_id)
        and m.user_b = greatest((select auth.uid()), p.user_id)
    )
    and not exists (
      select 1 from public.blocks b
      where (b.blocker_id = (select auth.uid()) and b.blocked_id = p.user_id)
         or (b.blocker_id = p.user_id and b.blocked_id = (select auth.uid()))
    )
  order by s.created_at desc
  limit 100;
$$;

-- ---------------------------------------------------------------------------
-- 12. like_from_history : re-liker un profil passé (gratuit, limite quotidienne)
-- ---------------------------------------------------------------------------
create function public.like_from_history(p_target uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_me uuid := (select auth.uid());
  v_is_premium boolean;
  v_likes_today int;
begin
  if v_me is null then raise exception 'non_authentifie'; end if;
  if not exists (
    select 1 from public.swipes s
    where s.swiper_id = v_me and s.target_id = p_target and not s.liked
  ) then raise exception 'introuvable'; end if;
  if not exists (
    select 1 from public.profiles where user_id = p_target and is_onboarded and not is_banned
  ) then raise exception 'profil_introuvable'; end if;

  -- S'il m'a liké entre-temps, la conversation passe par "J'aime" (payant).
  if exists (
    select 1 from public.swipes s
    where s.swiper_id = p_target and s.target_id = v_me and s.liked
  ) then
    return jsonb_build_object('status', 'liked_you');
  end if;

  select coalesce(e.is_premium and (e.expires_at is null or e.expires_at > now()), false)
    into v_is_premium from public.entitlements e where e.user_id = v_me;
  if not coalesce(v_is_premium, false) then
    select count(*) into v_likes_today from public.swipes
    where swiper_id = v_me and liked and created_at >= date_trunc('day', now());
    if v_likes_today >= 30 then
      return jsonb_build_object('status', 'limit_reached');
    end if;
  end if;

  update public.swipes set liked = true, created_at = now()
  where swiper_id = v_me and target_id = p_target;

  return jsonb_build_object('status', 'ok');
end $$;

-- ---------------------------------------------------------------------------
-- 13. get_my_matches : + statut (pending = invitation DM) et initiateur
-- ---------------------------------------------------------------------------
drop function if exists public.get_my_matches();
create function public.get_my_matches()
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
    select content, created_at, sender_id from public.messages
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
-- 14. Grants (les fonctions internes ensure_wallet/debit_coins/economy_value
--     restent non exposées : elles ne sont appelées que par les RPC definer)
-- ---------------------------------------------------------------------------
grant execute on function public.get_wallet() to authenticated;
grant execute on function public.like_back(uuid) to authenticated;
grant execute on function public.send_direct_message(uuid, text) to authenticated;
grant execute on function public.get_passed_profiles() to authenticated;
grant execute on function public.like_from_history(uuid) to authenticated;
grant execute on function public.get_likers() to authenticated;
grant execute on function public.get_my_matches() to authenticated;
