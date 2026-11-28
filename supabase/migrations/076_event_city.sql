-- ---------------------------------------------------------------------------
-- 076 : une soirée a une ville, et la ville décide de la devise
--
-- Jusqu'ici l'organisateur choisissait la devise à la main (migration 075).
-- Une soirée se passe dans une ville réelle : c'est elle qui dit le pays,
-- donc la devise et les opérateurs Mobile Money proposés au paiement.
-- Kinshasa -> RDC -> CDF -> Airtel, Orange, M-Pesa.
-- Brazzaville -> Congo-Brazzaville -> XAF -> MTN, Airtel.
--
-- events.currency reste la colonne lue par le paiement, mais elle est
-- maintenant posée par un trigger à partir de la ville : impossible d'avoir
-- une soirée à Pointe-Noire facturée en francs congolais.
--
-- Changer de ville vers l'autre pays est refusé dès qu'une entrée a été
-- payée : ces entrées l'ont été dans l'ancienne devise.
-- ---------------------------------------------------------------------------

alter table public.events
  add column if not exists city_id smallint references public.cities (id);

comment on column public.events.city_id is
  'Ville de la soirée. Fixe le pays, donc events.currency (trigger events_currency_from_city).';

create index if not exists events_city_id_idx on public.events (city_id);

create or replace function public.events_currency_from_city()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_country text;
  v_currency text;
begin
  if new.city_id is null then
    return new;
  end if;

  select country into v_country from public.cities where id = new.city_id;
  v_currency := case when v_country = 'CG' then 'XAF' else 'CDF' end;

  if tg_op = 'UPDATE' and v_currency is distinct from old.currency and exists (
    select 1 from public.payment_orders
     where kind = 'event' and status = 'success' and item_id = old.id::text
  ) then
    raise exception 'event_currency_locked'
      using hint = 'Des entrées ont déjà été payées dans l''autre devise.';
  end if;

  new.currency := v_currency;
  return new;
end $function$;

drop trigger if exists events_currency_from_city on public.events;
create trigger events_currency_from_city
  before insert or update of city_id, currency on public.events
  for each row execute function public.events_currency_from_city();

-- scan_event renvoie aussi la ville, pour l'afficher à la porte.
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

  select e.id, e.name, e.price_cdf, e.currency, e.is_active, e.ends_at,
         c.name as city_name, c.country
    into v_event
    from public.events e
    left join public.cities c on c.id = e.city_id
   where e.qr_token = p_token;
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
      'price_cdf', v_event.price_cdf, 'currency', v_event.currency,
      'city', v_event.city_name, 'country', v_event.country);
  end if;

  if v_event.price_cdf = 0 then
    insert into public.event_attendees (event_id, user_id)
    values (v_event.id, v_me)
    on conflict (event_id, user_id) do nothing;
    return jsonb_build_object('status', 'ok', 'already', false,
      'event_id', v_event.id, 'name', v_event.name, 'price_cdf', 0,
      'currency', v_event.currency,
      'city', v_event.city_name, 'country', v_event.country);
  end if;

  return jsonb_build_object('status', 'payment_required',
    'event_id', v_event.id, 'name', v_event.name,
    'price_cdf', v_event.price_cdf, 'currency', v_event.currency,
    'city', v_event.city_name, 'country', v_event.country);
end $function$;
