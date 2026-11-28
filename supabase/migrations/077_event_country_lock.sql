-- ---------------------------------------------------------------------------
-- 077 : le pays d'une soirée se choisit directement, sans ville
--
-- Décision du 27/11/2026 : au backoffice on choisit le PAYS d'une soirée
-- (RDC ou Congo-Brazzaville), pas une ville. Toutes les villes du pays sont
-- couvertes. events.currency (CDF / XAF) porte ce choix et suffit au
-- paiement : il fixe la monnaie et les opérateurs proposés par pawaPay.
--
-- events.city_id (076) reste en place, facultatif : s'il est renseigné, la
-- devise suit toujours la ville. Le verrou s'applique maintenant dans les deux
-- cas : une soirée qui a déjà encaissé ne change plus de devise, qu'on passe
-- par la ville ou directement par le pays.
-- ---------------------------------------------------------------------------

create or replace function public.events_currency_from_city()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_country text;
begin
  if new.city_id is not null then
    select country into v_country from public.cities where id = new.city_id;
    new.currency := case when v_country = 'CG' then 'XAF' else 'CDF' end;
  end if;

  if tg_op = 'UPDATE' and new.currency is distinct from old.currency and exists (
    select 1 from public.payment_orders
     where kind = 'event' and status = 'success' and item_id = old.id::text
  ) then
    raise exception 'event_currency_locked'
      using hint = 'Des entrées ont déjà été payées dans l''autre devise.';
  end if;

  return new;
end $function$;
