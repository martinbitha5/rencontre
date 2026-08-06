-- 029 : le mode incognito devient un abonnement.
--
-- Jusqu'ici `profiles.incognito` était directement modifiable par le client et
-- la fonctionnalité était gratuite. À partir d'ici elle se vend au mois, donc :
--   - le client ne peut plus écrire la colonne, il passe par set_incognito() ;
--   - l'activation exige un abonnement en cours (entitlements.incognito_until) ;
--   - la désactivation reste toujours possible, on n'enferme personne.
--
-- Le droit est posé par credit_incognito(), appelée UNIQUEMENT par le webhook
-- de paiement, comme credit_coins() pour les pièces.
--
-- Note produit : les comptes qui avaient activé l'incognito gratuitement le
-- gardent tant qu'ils n'y touchent pas, mais ne pourront pas le réactiver sans
-- abonnement. Voir la requête de grand-père en fin de fichier si tu préfères
-- leur offrir une période.

alter table public.entitlements
  add column if not exists incognito_until timestamptz;

-- ---------------------------------------------------------------------------
-- 1. Le client n'écrit plus la colonne directement
-- ---------------------------------------------------------------------------
revoke update (incognito) on public.profiles from authenticated;

create or replace function public.incognito_active(p_user uuid)
returns boolean language sql security definer set search_path = '' stable as $$
  select coalesce(
    (select e.incognito_until > now() from public.entitlements e where e.user_id = p_user),
    false);
$$;

create or replace function public.set_incognito(p_on boolean)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_me uuid := (select auth.uid());
  v_until timestamptz;
begin
  if v_me is null then raise exception 'non_authentifie'; end if;

  select incognito_until into v_until from public.entitlements where user_id = v_me;

  -- Couper l'incognito est toujours autorisé, même sans abonnement valide.
  if p_on and not public.incognito_active(v_me) then
    return jsonb_build_object('status', 'subscription_required');
  end if;

  update public.profiles set incognito = p_on, updated_at = now() where user_id = v_me;
  return jsonb_build_object('status', 'ok', 'incognito', p_on, 'incognito_until', v_until);
end $$;

-- ---------------------------------------------------------------------------
-- 2. Crédit de l'abonnement (webhook de paiement uniquement).
--    Un rachat prolonge l'échéance en cours au lieu de l'écraser.
-- ---------------------------------------------------------------------------
create or replace function public.credit_incognito(p_user uuid, p_months int)
returns timestamptz language plpgsql security definer set search_path = '' as $$
declare
  v_until timestamptz;
begin
  if p_months is null or p_months <= 0 then raise exception 'duree_invalide'; end if;
  insert into public.entitlements (user_id) values (p_user) on conflict (user_id) do nothing;

  update public.entitlements
  set incognito_until = greatest(coalesce(incognito_until, now()), now())
                        + make_interval(months => p_months)
  where user_id = p_user
  returning incognito_until into v_until;

  return v_until;
end $$;

-- ---------------------------------------------------------------------------
-- 3. « Cache ton statut en ligne » : promesse vendue avec l'abonnement.
--    Un profil incognito n'expose plus sa dernière activité là où il reste
--    visible — la liste de ceux qui m'ont liké et mes favoris. Il est déjà
--    absent des fils Rencontres et Historique.
-- ---------------------------------------------------------------------------
create or replace function public.get_likers()
returns table (
  user_id uuid, display_name text, birth_date date, gender public.gender,
  city_name text, bio text, photos jsonb, last_active_at timestamptz,
  height_cm smallint, job_title text, education text, relationship_goal text,
  has_children text, wants_children text, smoking text, drinking text,
  religion text, commune text, languages text[], interests text[],
  liked_at timestamptz, is_verified boolean
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
    s.created_at, p.is_verified
  from public.swipes s
  join public.profiles p on p.user_id = s.swiper_id
  left join public.cities c on c.id = p.city_id
  where s.target_id = (select auth.uid()) and s.liked
    and p.is_onboarded and not p.is_banned
    and not p.shadowbanned
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
-- 4. get_wallet expose l'échéance : l'app sait s'il faut proposer le paywall
--    ou le simple interrupteur.
-- ---------------------------------------------------------------------------
create or replace function public.get_wallet()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_me uuid := (select auth.uid());
  v_balance int;
  v_free_used int;
  v_expiring int;
  v_expiring_at timestamptz;
  v_incognito_until timestamptz;
begin
  if v_me is null then raise exception 'non_authentifie'; end if;
  perform public.ensure_wallet(v_me);
  select balance, free_dms_used, expiring_balance, expiring_at
    into v_balance, v_free_used, v_expiring, v_expiring_at
  from public.coin_wallets where user_id = v_me;
  select incognito_until into v_incognito_until
  from public.entitlements where user_id = v_me;

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
    'filter_dm_cost', coalesce(public.economy_value('filter_dm_cost'), 16000)
  );
end $$;

-- ---------------------------------------------------------------------------
-- 5. Grants
-- ---------------------------------------------------------------------------
revoke execute on function public.credit_incognito(uuid, int) from public, anon, authenticated;
revoke execute on function public.incognito_active(uuid) from public, anon, authenticated;
revoke execute on function public.set_incognito(boolean) from public, anon;
grant execute on function public.set_incognito(boolean) to authenticated;
grant execute on function public.get_likers() to authenticated;
grant execute on function public.get_wallet() to authenticated;

-- Grand-père (facultatif, à décommenter avant l'ouverture au public) : offrir
-- un mois aux comptes qui utilisaient déjà l'incognito quand il était gratuit.
-- select public.credit_incognito(user_id, 1) from public.profiles where incognito;
