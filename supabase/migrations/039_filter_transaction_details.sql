-- L'historique des transactions doit dire QUELLE restriction a été payée :
-- un mouvement par filtre activé (en ligne / intentions / DM) au lieu d'un
-- débit global « filter ». L'ancien kind reste accepté pour l'historique.

alter table public.coin_transactions drop constraint coin_transactions_kind_check;
alter table public.coin_transactions add constraint coin_transactions_kind_check
  check (kind in ('welcome', 'recharge', 'like_back', 'dm', 'event', 'admin',
    'filter', 'filter_online', 'filter_goals', 'filter_dm', 'reward', 'expire'));

create or replace function public.update_search_filters(
  p_online_only boolean,
  p_goals text[],
  p_dm_strict boolean
) returns jsonb
language plpgsql security definer set search_path to ''
as $$
declare
  v_me uuid := (select auth.uid());
  v_cost int := 0;
  v_online_cost int := coalesce(public.economy_value('filter_online_cost'), 200);
  v_goals_cost int := coalesce(public.economy_value('filter_goals_cost'), 200);
  v_dm_cost int := coalesce(public.economy_value('filter_dm_cost'), 400);
  cur record;
  v_balance int;
  v_charge_online boolean;
  v_charge_goals boolean;
  v_charge_dm boolean;
begin
  if v_me is null then raise exception 'non_authentifie'; end if;
  select filter_online_only, filter_goals, filter_dm_strict into cur
  from public.profiles where user_id = v_me;
  if not found then raise exception 'profil_introuvable'; end if;

  v_charge_online := p_online_only and not cur.filter_online_only;
  v_charge_goals := p_goals is not null and cur.filter_goals is null;
  v_charge_dm := p_dm_strict and not cur.filter_dm_strict;
  v_cost := (case when v_charge_online then v_online_cost else 0 end)
          + (case when v_charge_goals then v_goals_cost else 0 end)
          + (case when v_charge_dm then v_dm_cost else 0 end);

  if v_cost > 0 then
    perform public.ensure_wallet(v_me);
    -- Verrou + vérification du TOTAL avant les débits détaillés : soit tout
    -- passe, soit rien n'est débité. Jamais de facturation à moitié.
    select balance into v_balance from public.coin_wallets
    where user_id = v_me for update;
    if coalesce(v_balance, 0) < v_cost then
      return jsonb_build_object('status', 'insufficient_coins', 'cost', v_cost,
        'balance', coalesce(v_balance, 0));
    end if;
    if v_charge_online and not public.debit_coins(v_me, v_online_cost, 'filter_online', null) then
      raise exception 'debit_impossible';
    end if;
    if v_charge_goals and not public.debit_coins(v_me, v_goals_cost, 'filter_goals', null) then
      raise exception 'debit_impossible';
    end if;
    if v_charge_dm and not public.debit_coins(v_me, v_dm_cost, 'filter_dm', null) then
      raise exception 'debit_impossible';
    end if;
  end if;

  update public.profiles
  set filter_online_only = p_online_only,
      filter_goals = p_goals,
      filter_dm_strict = p_dm_strict,
      updated_at = now()
  where user_id = v_me;

  select balance into v_balance from public.coin_wallets where user_id = v_me;
  return jsonb_build_object('status', 'ok', 'charged', v_cost,
    'balance', coalesce(v_balance, 0));
end $$;
