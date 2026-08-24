-- ---------------------------------------------------------------------------
-- RETOUR ARRIÈRE de la migration 052 : réactivation du rail monétaire
--
-- Ce fichier n'est PAS une migration : il vit hors de supabase/migrations/
-- pour ne jamais être appliqué par `supabase db push`. Il se joue à la main,
-- le jour où le paiement redevient actif, EN MÊME TEMPS que le passage de
-- PAYMENTS_ENABLED à true dans apps/mobile/src/config/features.ts.
--
-- Il restitue :
--   1. les prix exacts d'avant, depuis economy_config_paid_backup
--   2. le drapeau free_mode à 0
--   3. debit_coins() dans sa version d'origine (migration 009)
--   4. set_incognito() dans sa version d'origine (migration 029)
--
-- Ordre recommandé le jour J : jouer ce fichier D'ABORD, publier la nouvelle
-- version du client ENSUITE. L'inverse afficherait des prix que le serveur ne
-- réclame pas encore, ce qui est sans danger, mais laisserait surtout des
-- clients gratuits face à une base qui facture de nouveau.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 1. Les prix d'avant
-- ---------------------------------------------------------------------------
update public.economy_config c
set value = b.value
from public.economy_config_paid_backup b
where b.key = c.key;

-- Contrôle : doit renvoyer la grille payante (like_back_cost 400, dm_cost 200,
-- free_dm_quota 5, filtres 8000/8000/16000 au moment de la désactivation).
-- select key, value from public.economy_config order by key;

update public.economy_config set value = 0 where key = 'free_mode';

-- ---------------------------------------------------------------------------
-- 2. debit_coins() d'origine (migration 009)
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- 3. set_incognito() d'origine (migration 029)
-- ---------------------------------------------------------------------------
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

revoke execute on function public.debit_coins(uuid, int, text, uuid) from public, anon, authenticated;
revoke execute on function public.set_incognito(boolean) from public, anon;
grant execute on function public.set_incognito(boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Ce qu'il ne faut PAS faire
-- ---------------------------------------------------------------------------
-- Ne pas supprimer public.economy_config_paid_backup : si le mode gratuit
-- revient un jour, c'est encore elle qui portera la grille de référence.
-- Ne pas toucher aux profils passés en incognito pendant la période gratuite :
-- leur invisibilité leur reste acquise tant qu'ils n'y touchent pas, exactement
-- comme la migration 029 l'avait prévu pour les comptes d'avant l'abonnement.
