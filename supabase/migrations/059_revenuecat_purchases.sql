create table public.revenuecat_purchase_events (
  event_id text primary key,
  transaction_id text not null,
  user_id uuid not null references auth.users (id) on delete cascade,
  product_id text not null,
  event_type text not null,
  store text not null check (store in ('APP_STORE', 'PLAY_STORE')),
  environment text not null check (environment in ('SANDBOX', 'PRODUCTION')),
  credited_at timestamptz not null default now(),
  unique (transaction_id, product_id)
);

alter table public.revenuecat_purchase_events enable row level security;
revoke all on public.revenuecat_purchase_events from public, anon, authenticated;
grant all on public.revenuecat_purchase_events to service_role;

create or replace function public.credit_revenuecat_purchase(
  p_event_id text,
  p_transaction_id text,
  p_user uuid,
  p_product_id text,
  p_event_type text,
  p_store text,
  p_environment text
) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  v_product_id text := split_part(p_product_id, ':', 1);
  v_coin_amount integer;
  v_incognito_months integer;
  v_claimed_event text;
begin
  if p_event_id is null or p_event_id = '' or p_transaction_id is null or p_transaction_id = '' then
    raise exception 'transaction_invalide';
  end if;
  if p_event_type not in ('INITIAL_PURCHASE', 'NON_RENEWING_PURCHASE') then
    raise exception 'type_evenement_invalide';
  end if;
  if p_store not in ('APP_STORE', 'PLAY_STORE') then
    raise exception 'store_invalide';
  end if;
  if p_environment not in ('SANDBOX', 'PRODUCTION') then
    raise exception 'environnement_invalide';
  end if;
  if coalesce(public.economy_value('free_mode'), 1) <> 0 then
    raise exception 'paiements_desactives';
  end if;

  case v_product_id
    when 'decouverte' then v_coin_amount := 800;
    when 'elan' then v_coin_amount := 3000;
    when 'envol' then v_coin_amount := 6500;
    when 'prestige' then v_coin_amount := 20000;
    when '3m' then v_incognito_months := 3;
    when '6m' then v_incognito_months := 6;
    when '12m' then v_incognito_months := 12;
    else raise exception 'produit_inconnu';
  end case;

  insert into public.revenuecat_purchase_events (
    event_id, transaction_id, user_id, product_id, event_type, store, environment
  ) values (
    p_event_id, p_transaction_id, p_user, v_product_id, p_event_type, p_store, p_environment
  ) on conflict do nothing
  returning event_id into v_claimed_event;

  if v_claimed_event is null then return false; end if;

  if v_coin_amount is not null then
    perform public.credit_coins(p_user, v_coin_amount, 'recharge', 0);
  else
    perform public.credit_incognito(p_user, v_incognito_months);
  end if;

  return true;
end;
$$;

revoke execute on function public.credit_revenuecat_purchase(text, text, uuid, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.credit_revenuecat_purchase(text, text, uuid, text, text, text, text)
  to service_role;