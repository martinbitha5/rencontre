-- 027 : recalibrage de la pièce sur le marché local + pièces périssables.
--
-- 1. Recalibrage (×40)
-- La pièce Dowe valait 40 pièces Heyama : un DM coûtait 5 pièces chez nous
-- contre 200 chez eux, pour des packs vendus au même prix en CDF. À prix de
-- pack égal on livrait donc 5 fois trop de valeur. On aligne l'unité sur celle
-- du marché (DM = 200 pièces) et on multiplie par 40 tous les coûts et tous
-- les soldes existants : à cet instant précis, rien ne change pour personne,
-- seule la nouvelle grille de packs (apps/mobile/src/config/economy.ts et
-- supabase/functions/multipay-checkout) applique le nouveau tarif.
--
-- 2. Pièces périssables
-- Le pack DIAMOND est vendu avec une validité de 30 jours. coin_wallets.balance
-- reste le solde TOTAL (tous les lecteurs existants restent justes) ;
-- expiring_balance en est la part périssable, expiring_at son échéance.
-- Les pièces périssables sont toujours dépensées EN PREMIER, et l'expiration
-- est balayée paresseusement par expire_coins() à chaque lecture ou débit :
-- pas de dépendance à pg_cron, un solde affiché est toujours un solde dépensable.

-- ---------------------------------------------------------------------------
-- 1. Coûts : nouvelle échelle
-- ---------------------------------------------------------------------------
update public.economy_config set value = value * 40
where key in ('like_back_cost', 'dm_cost', 'welcome_coins',
              'filter_online_cost', 'filter_goals_cost', 'filter_dm_cost');

-- Durée de validité du pack DIAMOND, en jours (0 = pas de péremption).
insert into public.economy_config (key, value) values ('pack_diamond_days', 30)
on conflict (key) do update set value = excluded.value;

-- ---------------------------------------------------------------------------
-- 2. Soldes et historique : même multiplicateur, plafonnés à la borne int
--    (un portefeuille de test crédité par le back-office dépasse sinon int4)
-- ---------------------------------------------------------------------------
update public.coin_wallets
set balance = least(balance::bigint * 40, 2000000000)::int, updated_at = now()
where balance > 0;

update public.coin_transactions
set amount = (sign(amount) * least(abs(amount)::bigint * 40, 2000000000))::int
where amount <> 0;

-- Le prix d'entrée des soirées est libellé en pièces, stocké par événement :
-- même multiplicateur, sinon une entrée créée avant ce jour vaudrait 40 fois
-- moins cher qu'un DM.
update public.events
set cost = least(cost::bigint * 40, 2000000000)::int
where cost > 0;

-- ---------------------------------------------------------------------------
-- 3. Colonnes de péremption
-- ---------------------------------------------------------------------------
alter table public.coin_wallets
  add column if not exists expiring_balance int not null default 0,
  add column if not exists expiring_at timestamptz;

alter table public.coin_wallets drop constraint if exists coin_wallets_expiring_check;
alter table public.coin_wallets add constraint coin_wallets_expiring_check
  check (
    expiring_balance >= 0
    and expiring_balance <= balance
    and (expiring_balance = 0) = (expiring_at is null)
  );

alter table public.coin_transactions drop constraint coin_transactions_kind_check;
alter table public.coin_transactions add constraint coin_transactions_kind_check
  check (kind in ('welcome', 'recharge', 'like_back', 'dm', 'event', 'admin',
                  'filter', 'expire'));

-- ---------------------------------------------------------------------------
-- 4. Expiration : balayage paresseux, idempotent
-- ---------------------------------------------------------------------------
create or replace function public.expire_coins(p_user uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  with due as (
    select c.user_id, c.expiring_balance
    from public.coin_wallets c
    where c.user_id = p_user
      and c.expiring_balance > 0
      and c.expiring_at <= now()
    for update
  ), swept as (
    update public.coin_wallets c
    set balance = c.balance - due.expiring_balance,
        expiring_balance = 0,
        expiring_at = null,
        updated_at = now()
    from due
    where c.user_id = due.user_id
    returning due.expiring_balance as expired
  )
  insert into public.coin_transactions (user_id, amount, kind)
  select p_user, -swept.expired, 'expire' from swept;
end $$;

-- ---------------------------------------------------------------------------
-- 5. Portefeuille : l'expiration est balayée à chaque passage
-- ---------------------------------------------------------------------------
create or replace function public.ensure_wallet(p_user uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_welcome int := coalesce(public.economy_value('welcome_coins'), 0);
  v_created boolean;
begin
  insert into public.coin_wallets (user_id, balance) values (p_user, v_welcome)
  on conflict (user_id) do nothing;
  v_created := found;
  if v_created and v_welcome > 0 then
    insert into public.coin_transactions (user_id, amount, kind)
    values (p_user, v_welcome, 'welcome');
  end if;
  perform public.expire_coins(p_user);
end $$;

-- Débit atomique : false si solde insuffisant.
-- Les pièces périssables sont consommées avant les pièces permanentes.
create or replace function public.debit_coins(p_user uuid, p_amount int, p_kind text, p_ref uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  perform public.expire_coins(p_user);
  update public.coin_wallets
  set balance = balance - p_amount,
      expiring_balance = greatest(expiring_balance - p_amount, 0),
      expiring_at = case when expiring_balance - p_amount > 0 then expiring_at else null end,
      updated_at = now()
  where user_id = p_user and balance >= p_amount;
  if not found then return false; end if;
  insert into public.coin_transactions (user_id, amount, kind, ref_user_id)
  values (p_user, -p_amount, p_kind, p_ref);
  return true;
end $$;

-- Crédit d'un pack. p_validity_days > 0 rend les pièces périssables ;
-- un nouvel achat périssable repousse l'échéance de tout le lot en cours.
-- Appelé par le webhook de paiement UNIQUEMENT (jamais par le client).
create or replace function public.credit_coins(
  p_user uuid, p_amount int, p_kind text, p_validity_days int default 0
) returns int language plpgsql security definer set search_path = '' as $$
declare
  v_balance int;
begin
  if p_amount is null or p_amount <= 0 then raise exception 'montant_invalide'; end if;
  perform public.ensure_wallet(p_user);

  if coalesce(p_validity_days, 0) > 0 then
    update public.coin_wallets
    set balance = balance + p_amount,
        expiring_balance = expiring_balance + p_amount,
        expiring_at = greatest(coalesce(expiring_at, now()),
                               now() + make_interval(days => p_validity_days)),
        updated_at = now()
    where user_id = p_user
    returning balance into v_balance;
  else
    update public.coin_wallets
    set balance = balance + p_amount, updated_at = now()
    where user_id = p_user
    returning balance into v_balance;
  end if;

  insert into public.coin_transactions (user_id, amount, kind)
  values (p_user, p_amount, p_kind);
  return v_balance;
end $$;

-- ---------------------------------------------------------------------------
-- 6. get_wallet : expose la part périssable et son échéance
-- ---------------------------------------------------------------------------
create or replace function public.get_wallet()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_me uuid := (select auth.uid());
  v_balance int;
  v_free_used int;
  v_expiring int;
  v_expiring_at timestamptz;
begin
  if v_me is null then raise exception 'non_authentifie'; end if;
  perform public.ensure_wallet(v_me);
  select balance, free_dms_used, expiring_balance, expiring_at
    into v_balance, v_free_used, v_expiring, v_expiring_at
  from public.coin_wallets where user_id = v_me;
  return jsonb_build_object(
    'balance', v_balance,
    'expiring_balance', v_expiring,
    'expiring_at', v_expiring_at,
    'free_dms_used', v_free_used,
    'free_dm_quota', coalesce(public.economy_value('free_dm_quota'), 5),
    'like_back_cost', coalesce(public.economy_value('like_back_cost'), 400),
    'dm_cost', coalesce(public.economy_value('dm_cost'), 200),
    'incognito_cost', coalesce(public.economy_value('incognito_cost'), 0),
    'filter_online_cost', coalesce(public.economy_value('filter_online_cost'), 8000),
    'filter_goals_cost', coalesce(public.economy_value('filter_goals_cost'), 8000),
    'filter_dm_cost', coalesce(public.economy_value('filter_dm_cost'), 16000)
  );
end $$;

-- ---------------------------------------------------------------------------
-- 7. Back-office : plafond d'ajustement à la nouvelle échelle, et la part
--    périssable ne peut jamais dépasser le solde après un retrait manuel.
-- ---------------------------------------------------------------------------
create or replace function public.admin_adjust_coins(p_user_id uuid, p_amount integer, p_reason text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_admin   uuid := public.require_admin('admin');
  v_balance integer;
begin
  if p_amount is null or p_amount = 0 then
    raise exception 'amount_required';
  end if;
  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'reason_required';
  end if;
  if abs(p_amount) > 40000000 then
    raise exception 'amount_too_large';
  end if;

  insert into public.coin_wallets (user_id, balance)
  values (p_user_id, 0)
  on conflict (user_id) do nothing;

  update public.coin_wallets
  set balance = greatest(balance + p_amount, 0),
      expiring_balance = least(expiring_balance, greatest(balance + p_amount, 0)),
      expiring_at = case
        when least(expiring_balance, greatest(balance + p_amount, 0)) > 0 then expiring_at
        else null end,
      updated_at = now()
  where user_id = p_user_id
  returning balance into v_balance;

  insert into public.coin_transactions (user_id, amount, kind)
  values (p_user_id, p_amount, 'admin');

  perform public.log_admin_action(
    v_admin, 'coins_adjusted', p_user_id, p_reason, 'wallet', p_user_id::text,
    jsonb_build_object('amount', p_amount, 'balance', v_balance)
  );

  return jsonb_build_object('ok', true, 'balance', v_balance);
end $$;

-- ---------------------------------------------------------------------------
-- 8. Grants : expire_coins et credit_coins sont internes (RPC definer et
--    webhook service_role uniquement), jamais exposés via PostgREST.
-- ---------------------------------------------------------------------------
revoke execute on function public.expire_coins(uuid) from public, anon, authenticated;
revoke execute on function public.credit_coins(uuid, int, text, int) from public, anon, authenticated;
revoke execute on function public.debit_coins(uuid, int, text, uuid) from public, anon, authenticated;
revoke execute on function public.ensure_wallet(uuid) from public, anon, authenticated;
grant execute on function public.get_wallet() to authenticated;
grant execute on function public.admin_adjust_coins(uuid, integer, text) to authenticated;
