-- ---------------------------------------------------------------------------
-- 075 : pawaPay pour les deux Congo, et règlement atomique d'une commande
--
-- 1. DEUX PAYS. Zola sert la RDC (CDF) et le Congo-Brazzaville (XAF) depuis
--    la migration 071. Une soirée porte maintenant sa devise (events.currency)
--    et une commande la sienne (payment_orders.currency). Les colonnes de
--    montant gardent leur nom historique (events.price_cdf,
--    payment_orders.amount_cdf) : elles portent le montant DANS LA DEVISE de
--    la ligne. Les renommer casserait le backoffice, scan_event et les
--    journaux d'audit pour un gain purement cosmétique.
--
-- 2. RÈGLEMENT ATOMIQUE. Jusqu'ici pawapay-return passait la commande en
--    success puis appelait la RPC de crédit dans une seconde requête. Une
--    fonction coupée entre les deux laissait une commande « réglée » sans
--    rien accorder. settle_payment_order() fait les deux dans UNE transaction
--    Postgres : soit la commande passe en success ET le droit est accordé,
--    soit rien ne bouge. Le verrou de ligne (for update) sérialise les appels
--    concurrents (callback, sondage de l'app, retour navigateur) : un seul
--    gagne, les autres lisent « déjà réglée ».
-- ---------------------------------------------------------------------------

alter table public.events
  add column if not exists currency text not null default 'CDF'
    check (currency in ('CDF', 'XAF'));

comment on column public.events.currency is
  'Devise du prix d''entrée : CDF (RDC) ou XAF (Congo-Brazzaville). '
  'events.price_cdf porte le montant dans cette devise, malgré son nom.';

alter table public.payment_orders
  add column if not exists currency text not null default 'CDF'
    check (currency in ('CDF', 'XAF'));

comment on column public.payment_orders.currency is
  'Devise encaissée. payment_orders.amount_cdf porte le montant dans cette devise, malgré son nom.';

-- scan_event renvoie aussi la devise, pour que l'app affiche « 5 000 XAF »
-- et non « 5 000 CDF » à une porte de Brazzaville.
create or replace function public.scan_event(p_token text)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_me uuid := (select auth.uid());
  v_event record;
begin
  if v_me is null then raise exception 'non_authentifie'; end if;

  select id, name, price_cdf, currency, is_active, ends_at into v_event
  from public.events where qr_token = p_token;
  if v_event.id is null or not v_event.is_active
     or (v_event.ends_at is not null and v_event.ends_at < now()) then
    return jsonb_build_object('status', 'invalid');
  end if;

  if exists (
    select 1 from public.event_attendees
    where event_id = v_event.id and user_id = v_me
  ) then
    return jsonb_build_object('status', 'ok', 'already', true,
      'event_id', v_event.id, 'name', v_event.name,
      'price_cdf', v_event.price_cdf, 'currency', v_event.currency);
  end if;

  if v_event.price_cdf = 0 then
    insert into public.event_attendees (event_id, user_id)
    values (v_event.id, v_me)
    on conflict (event_id, user_id) do nothing;
    return jsonb_build_object('status', 'ok', 'already', false,
      'event_id', v_event.id, 'name', v_event.name, 'price_cdf', 0,
      'currency', v_event.currency);
  end if;

  return jsonb_build_object('status', 'payment_required',
    'event_id', v_event.id, 'name', v_event.name,
    'price_cdf', v_event.price_cdf, 'currency', v_event.currency);
end $function$;

-- Règle une commande pending en success et accorde le droit acheté, dans la
-- même transaction. Retour : 'credited' (cette requête a crédité),
-- 'already' (déjà réglée avant), 'not_pending' (failed/cancelled, intouchable),
-- 'not_found'. Toute erreur de crédit fait échouer la transaction entière :
-- la commande reste pending et le prochain passage retente.
create or replace function public.settle_payment_order(
  p_txn_ref text,
  p_code text,
  p_description text,
  p_payload jsonb
)
returns text
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_order public.payment_orders%rowtype;
begin
  select * into v_order
    from public.payment_orders
   where txn_ref = p_txn_ref
   for update;

  if not found then return 'not_found'; end if;
  if v_order.status = 'success' then return 'already'; end if;
  if v_order.status <> 'pending' then return 'not_pending'; end if;

  update public.payment_orders
     set status = 'success',
         response_code = p_code,
         response_description = p_description,
         provider_payload = p_payload,
         credited_at = now()
   where id = v_order.id;

  if v_order.kind = 'incognito' then
    perform public.credit_incognito(v_order.user_id, coalesce(v_order.months, 1));
  elsif v_order.kind = 'event' then
    perform public.grant_event_access(v_order.user_id, v_order.item_id::uuid);
  else
    perform public.credit_coins(v_order.user_id, coalesce(v_order.coins, 0), 'recharge',
      coalesce(v_order.validity_days, 0));
  end if;

  return 'credited';
end $function$;

comment on function public.settle_payment_order(text, text, text, jsonb) is
  'Règlement atomique : commande pending -> success ET octroi du droit, dans une transaction. '
  'Réservée au service_role (fonctions Edge), jamais au client.';

revoke all on function public.settle_payment_order(text, text, text, jsonb) from public;
revoke all on function public.settle_payment_order(text, text, text, jsonb) from anon;
revoke all on function public.settle_payment_order(text, text, text, jsonb) from authenticated;
grant execute on function public.settle_payment_order(text, text, text, jsonb) to service_role;
