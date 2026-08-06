-- ---------------------------------------------------------------------------
-- 040 : les soirées entrent dans l'historique des actions
--
-- Jusqu'ici, créer, modifier ou supprimer une soirée ne laissait aucune trace :
-- le backoffice écrit directement dans public.events, sans passer par une RPC
-- qui journalise. Des triggers comblent ce trou : quoi qu'il arrive à une
-- soirée et par quel chemin que ce soit, une ligne part dans
-- moderation_actions. La ligne embarque le nombre d'entrées et les francs
-- encaissés, pour que l'historique raconte toute la vie d'une soirée même
-- après sa suppression.
-- ---------------------------------------------------------------------------

create or replace function public.log_event_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor   uuid := (select auth.uid());
  v_entries integer;
  v_revenue bigint;
begin
  if tg_op = 'INSERT' then
    perform public.log_admin_action(
      v_actor, 'event_created', null,
      format('Soirée « %s », entrée %s', new.name,
        case when new.price_cdf > 0 then format('à %s CDF', new.price_cdf) else 'libre' end),
      'event', new.id::text,
      jsonb_build_object('name', new.name, 'price_cdf', new.price_cdf, 'ends_at', new.ends_at));
    return new;
  end if;

  if tg_op = 'DELETE' then
    -- Trigger BEFORE DELETE : les participants existent encore, on fige le
    -- bilan final dans la ligne d'audit avant que la cascade ne les efface.
    select count(*) into v_entries from public.event_attendees where event_id = old.id;
    select coalesce(sum(amount_cdf), 0) into v_revenue
      from public.payment_orders
      where kind = 'event' and status = 'success' and item_id = old.id::text;
    perform public.log_admin_action(
      v_actor, 'event_deleted', null,
      format('Soirée « %s » : %s entrée(s), %s CDF encaissés', old.name, v_entries, v_revenue),
      'event', old.id::text,
      jsonb_build_object('name', old.name, 'price_cdf', old.price_cdf,
        'entries', v_entries, 'revenue_cdf', v_revenue));
    return old;
  end if;

  -- UPDATE : ne journaliser que ce qui a réellement changé.
  if new.price_cdf is distinct from old.price_cdf then
    perform public.log_admin_action(
      v_actor, 'event_price_changed', null,
      format('Soirée « %s » : prix passé de %s à %s CDF', new.name, old.price_cdf, new.price_cdf),
      'event', new.id::text,
      jsonb_build_object('name', new.name,
        'old_price_cdf', old.price_cdf, 'new_price_cdf', new.price_cdf));
  end if;

  if new.is_active is distinct from old.is_active then
    select count(*) into v_entries from public.event_attendees where event_id = new.id;
    select coalesce(sum(amount_cdf), 0) into v_revenue
      from public.payment_orders
      where kind = 'event' and status = 'success' and item_id = new.id::text;
    perform public.log_admin_action(
      v_actor,
      case when new.is_active then 'event_reopened' else 'event_closed' end,
      null,
      format('Soirée « %s » : %s entrée(s), %s CDF encaissés', new.name, v_entries, v_revenue),
      'event', new.id::text,
      jsonb_build_object('name', new.name, 'entries', v_entries, 'revenue_cdf', v_revenue));
  elsif new.ends_at is distinct from old.ends_at then
    -- La fermeture pose aussi ends_at : déjà couverte par event_closed
    -- ci-dessus, d'où le elsif pour ne pas journaliser deux fois.
    perform public.log_admin_action(
      v_actor, 'event_ends_changed', null,
      format('Soirée « %s » : fin %s', new.name,
        case when new.ends_at is null then 'retirée'
             else 'fixée au ' || to_char(new.ends_at at time zone 'Africa/Kinshasa', 'DD/MM/YYYY à HH24:MI') end),
      'event', new.id::text,
      jsonb_build_object('name', new.name,
        'old_ends_at', old.ends_at, 'new_ends_at', new.ends_at));
  end if;

  return new;
end;
$$;

revoke execute on function public.log_event_change() from public, anon, authenticated;

drop trigger if exists events_audit_ins_upd on public.events;
create trigger events_audit_ins_upd
  after insert or update on public.events
  for each row execute function public.log_event_change();

drop trigger if exists events_audit_del on public.events;
create trigger events_audit_del
  before delete on public.events
  for each row execute function public.log_event_change();
