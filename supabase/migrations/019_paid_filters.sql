-- 019 : filtres premium payants (à la Heyama).
-- « En ligne uniquement » 200, « intentions » 200, « filtre DM » 400 pièces.
-- Débit UNIQUEMENT à l'activation (off -> on) ; désactiver est gratuit.
-- (Copie locale de la migration appliquée via MCP le 2026-07-27.)

insert into public.economy_config (key, value) values
  ('filter_online_cost', 200),
  ('filter_goals_cost', 200),
  ('filter_dm_cost', 400)
on conflict (key) do nothing;

alter table public.coin_transactions drop constraint coin_transactions_kind_check;
alter table public.coin_transactions add constraint coin_transactions_kind_check
  check (kind in ('welcome', 'recharge', 'like_back', 'dm', 'event', 'admin', 'filter'));

-- Les filtres payants ne sont plus modifiables directement par le client :
-- tout passe par la RPC qui débite.
revoke update (filter_online_only, filter_goals, filter_dm_strict)
  on public.profiles from authenticated;

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
begin
  if v_me is null then raise exception 'non_authentifie'; end if;
  select filter_online_only, filter_goals, filter_dm_strict into cur
  from public.profiles where user_id = v_me;
  if not found then raise exception 'profil_introuvable'; end if;

  if p_online_only and not cur.filter_online_only then v_cost := v_cost + v_online_cost; end if;
  if p_goals is not null and cur.filter_goals is null then v_cost := v_cost + v_goals_cost; end if;
  if p_dm_strict and not cur.filter_dm_strict then v_cost := v_cost + v_dm_cost; end if;

  if v_cost > 0 then
    perform public.ensure_wallet(v_me);
    if not public.debit_coins(v_me, v_cost, 'filter', null) then
      select balance into v_balance from public.coin_wallets where user_id = v_me;
      return jsonb_build_object('status', 'insufficient_coins', 'cost', v_cost,
        'balance', coalesce(v_balance, 0));
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

revoke execute on function public.update_search_filters(boolean, text[], boolean) from public, anon;
grant execute on function public.update_search_filters(boolean, text[], boolean) to authenticated;

-- Le portefeuille expose les coûts des filtres pour l'affichage.
create or replace function public.get_wallet()
returns jsonb
language plpgsql security definer set search_path to ''
as $$
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
    'incognito_cost', coalesce(public.economy_value('incognito_cost'), 0),
    'filter_online_cost', coalesce(public.economy_value('filter_online_cost'), 200),
    'filter_goals_cost', coalesce(public.economy_value('filter_goals_cost'), 200),
    'filter_dm_cost', coalesce(public.economy_value('filter_dm_cost'), 400)
  );
end $$;
