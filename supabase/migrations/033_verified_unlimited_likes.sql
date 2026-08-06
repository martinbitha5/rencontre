-- 033 : le like illimité passe de l'abonnement à la vérification du profil.
-- (Copie locale de la migration appliquée via MCP le 2026-07-31.)
--
-- Avant : l'exemption de quota reposait sur entitlements.is_premium, c'est-à-dire
-- l'abonnement « Dowe+ ». Cette offre n'existe plus. Concrètement, plus personne
-- ne pouvait lever la limite, et l'écran de blocage renvoyait vers un produit
-- introuvable.
-- Maintenant : un compte VÉRIFIÉ like sans limite, un compte non vérifié garde un
-- quota quotidien. La contrainte devient un levier de qualité (elle pousse vers la
-- vérification, donc vers moins de faux profils) au lieu d'un levier de vente.
--
-- Trois points de conception :
-- 1. Le quota n'est plus écrit en dur dans deux fonctions : il vit dans
--    economy_config sous la clé 'free_daily_likes'. L'ajuster ne demande plus de
--    migration, comme pour tous les autres coûts.
-- 2. like_quota() est l'unique endroit qui décide. swipe(), like_from_history() et
--    get_wallet() l'appellent : impossible que l'écran affiche « il te reste 3
--    likes » pendant que le serveur en compte un autre.
-- 3. La limite reste imposée côté serveur. Un client modifié ne peut pas la
--    contourner, et se déclarer vérifié n'est pas possible : is_verified n'est
--    écrit que par admin_review_verification().

-- ---------------------------------------------------------------------------
-- 1. Le quota devient un paramètre
-- ---------------------------------------------------------------------------
insert into public.economy_config (key, value) values ('free_daily_likes', 30)
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- 2. Source de vérité unique du quota de likes
-- ---------------------------------------------------------------------------
-- Retourne { unlimited, limit, used, left }. Pour un compte vérifié, limit/used/
-- left sont null : il n'y a rien à compter, et le client n'affiche aucun compteur.
create or replace function public.like_quota(p_user uuid)
returns jsonb
language plpgsql stable security definer set search_path to ''
as $$
declare
  v_verified boolean;
  v_limit int;
  v_used int;
begin
  if p_user is null then raise exception 'non_authentifie'; end if;

  select coalesce(p.is_verified, false) into v_verified
  from public.profiles p where p.user_id = p_user;

  if coalesce(v_verified, false) then
    return jsonb_build_object(
      'unlimited', true, 'limit', null, 'used', null, 'left', null);
  end if;

  v_limit := coalesce(public.economy_value('free_daily_likes'), 30);

  -- Seuls les likes comptent : passer un profil n'a jamais été limité.
  select count(*) into v_used
  from public.swipes
  where swiper_id = p_user and liked and created_at >= date_trunc('day', now());

  return jsonb_build_object(
    'unlimited', false,
    'limit', v_limit,
    'used', v_used,
    'left', greatest(v_limit - coalesce(v_used, 0), 0)
  );
end $$;

-- ---------------------------------------------------------------------------
-- 3. swipe() : la limite ne s'applique plus aux comptes vérifiés
-- ---------------------------------------------------------------------------
create or replace function public.swipe(p_target uuid, p_liked boolean)
returns jsonb
language plpgsql security definer set search_path to ''
as $$
declare
  v_me uuid := (select auth.uid());
  v_quota jsonb;
  v_match_id uuid;
begin
  if v_me is null then raise exception 'non_authentifie'; end if;
  if p_target = v_me then raise exception 'cible_invalide'; end if;
  if not exists (
    select 1 from public.profiles where user_id = p_target and is_onboarded and not is_banned
  ) then
    raise exception 'profil_introuvable';
  end if;

  if p_liked then
    v_quota := public.like_quota(v_me);
    if not (v_quota->>'unlimited')::boolean and (v_quota->>'left')::int <= 0 then
      -- On renvoie la limite : le message affiché vient du serveur, il ne peut
      -- pas se désynchroniser de la valeur réellement appliquée.
      return jsonb_build_object(
        'status', 'limit_reached', 'limit', (v_quota->>'limit')::int);
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
-- 4. like_from_history() : même règle
-- ---------------------------------------------------------------------------
create or replace function public.like_from_history(p_target uuid)
returns jsonb
language plpgsql security definer set search_path to ''
as $$
declare
  v_me uuid := (select auth.uid());
  v_quota jsonb;
  v_match_id uuid;
begin
  if v_me is null then raise exception 'non_authentifie'; end if;
  if not exists (
    select 1 from public.swipes s
    where s.swiper_id = v_me and s.target_id = p_target and not s.liked
  ) then raise exception 'introuvable'; end if;
  if not exists (
    select 1 from public.profiles where user_id = p_target and is_onboarded and not is_banned
  ) then raise exception 'profil_introuvable'; end if;

  v_quota := public.like_quota(v_me);
  if not (v_quota->>'unlimited')::boolean and (v_quota->>'left')::int <= 0 then
    return jsonb_build_object(
      'status', 'limit_reached', 'limit', (v_quota->>'limit')::int);
  end if;

  update public.swipes set liked = true, created_at = now()
  where swiper_id = v_me and target_id = p_target;

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
-- 5. get_wallet() expose le quota
-- ---------------------------------------------------------------------------
-- L'app a besoin de savoir, avant le premier refus, combien de likes il reste et
-- si le compte est vérifié : c'est ce qui permet d'afficher un compteur honnête
-- et de proposer la vérification au bon moment plutôt qu'après coup.
create or replace function public.get_wallet()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_me uuid := (select auth.uid());
  v_balance int;
  v_free_used int;
  v_expiring int;
  v_expiring_at timestamptz;
  v_incognito_until timestamptz;
  v_quota jsonb;
begin
  if v_me is null then raise exception 'non_authentifie'; end if;
  perform public.ensure_wallet(v_me);
  select balance, free_dms_used, expiring_balance, expiring_at
    into v_balance, v_free_used, v_expiring, v_expiring_at
  from public.coin_wallets where user_id = v_me;
  select incognito_until into v_incognito_until
  from public.entitlements where user_id = v_me;
  v_quota := public.like_quota(v_me);

  return jsonb_build_object(
    'balance', v_balance,
    'expiring_balance', v_expiring,
    'expiring_at', v_expiring_at,
    'free_dms_used', v_free_used,
    'free_dm_quota', coalesce(public.economy_value('free_dm_quota'), 5),
    'like_back_cost', coalesce(public.economy_value('like_back_cost'), 400),
    'dm_cost', coalesce(public.economy_value('dm_cost'), 200),
    'incognito_cost', coalesce(public.economy_value('incognito_cost'), 0),
    'incognito_until', v_incognito_until,
    'filter_online_cost', coalesce(public.economy_value('filter_online_cost'), 8000),
    'filter_goals_cost', coalesce(public.economy_value('filter_goals_cost'), 8000),
    'filter_dm_cost', coalesce(public.economy_value('filter_dm_cost'), 16000),
    'likes_unlimited', (v_quota->>'unlimited')::boolean,
    'daily_like_limit', (v_quota->>'limit')::int,
    'likes_left', (v_quota->>'left')::int
  );
end $$;

-- ---------------------------------------------------------------------------
-- 6. Grants
-- ---------------------------------------------------------------------------
-- like_quota() n'est appelée que par d'autres fonctions SECURITY DEFINER : le
-- client n'a aucune raison de l'atteindre directement.
revoke execute on function public.like_quota(uuid) from public, anon, authenticated;
grant execute on function public.swipe(uuid, boolean) to authenticated;
grant execute on function public.like_from_history(uuid) to authenticated;
grant execute on function public.get_wallet() to authenticated;
