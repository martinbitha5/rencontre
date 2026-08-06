-- ---------------------------------------------------------------------------
-- 035 : l'entrée en soirée se paie en francs, plus en pièces
--
-- Une soirée est un lieu physique : l'entrée n'est pas du contenu numérique
-- mais un service consommé hors de l'application. Elle se paie donc en CDF sur
-- le portail web (carte ou Mobile Money) au lieu d'être débitée du solde de
-- pièces.
--
-- Conséquence sur la chaîne de confiance : scan_event() ne débite plus rien,
-- elle valide le QR et annonce le prix. L'accès est posé par
-- grant_event_access(), appelée par multipay-return APRÈS revérification de la
-- transaction chez Interswitch. C'est exactement la règle déjà appliquée aux
-- pièces et à l'Incognito : le client ne s'accorde jamais un droit qu'il n'a
-- pas payé, et il n'existe qu'une seule porte d'entrée pour ce droit.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 1. Le prix d'une soirée passe des pièces aux francs congolais
-- ---------------------------------------------------------------------------

alter table public.events
  add column price_cdf integer not null default 0 check (price_cdf >= 0);

-- Les soirées déjà en base sont tarifées en pièces : le nombre n'a aucun sens
-- lu en francs. On repart d'une entrée libre et le prix se refixe au
-- backoffice. Convertir au taux courant aurait produit des tarifs faux sans
-- que personne ne s'en aperçoive.
update public.events set price_cdf = 0;

alter table public.events drop column cost;

-- ---------------------------------------------------------------------------
-- 2. Une commande de paiement peut porter une entrée en soirée
-- ---------------------------------------------------------------------------

-- 'custom' disparaît en même temps : le montant sur mesure n'existait que pour
-- compléter son solde juste avant une entrée, il n'a plus d'objet. Aucune
-- commande de ce type n'a jamais été créée, rien à conserver.
alter table public.payment_orders drop constraint payment_orders_kind_check;
alter table public.payment_orders add constraint payment_orders_kind_check
  check (kind in ('coins', 'incognito', 'event'));

-- ---------------------------------------------------------------------------
-- 3. Scanner un QR : la fonction ne débite plus, elle tranche
-- ---------------------------------------------------------------------------
--   invalid          : aucune soirée ouverte derrière ce code
--   ok               : accès déjà acquis, ou soirée gratuite (accès posé ici)
--   payment_required : il reste à payer ; le prix vient de la base, jamais du
--                      client, et le QR est validé AVANT qu'un paiement puisse
--                      être initié.
create or replace function public.scan_event(p_token text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_me uuid := (select auth.uid());
  v_event record;
begin
  if v_me is null then raise exception 'non_authentifie'; end if;

  select id, name, price_cdf, is_active, ends_at into v_event
  from public.events where qr_token = p_token;
  if v_event.id is null or not v_event.is_active
     or (v_event.ends_at is not null and v_event.ends_at < now()) then
    return jsonb_build_object('status', 'invalid');
  end if;

  -- Déjà sur la liste : sortir et revenir ne recoûte jamais rien.
  if exists (
    select 1 from public.event_attendees
    where event_id = v_event.id and user_id = v_me
  ) then
    return jsonb_build_object('status', 'ok', 'already', true,
      'event_id', v_event.id, 'name', v_event.name,
      'price_cdf', v_event.price_cdf);
  end if;

  -- Entrée libre : rien à payer, l'accès est posé tout de suite.
  if v_event.price_cdf = 0 then
    insert into public.event_attendees (event_id, user_id)
    values (v_event.id, v_me)
    on conflict (event_id, user_id) do nothing;
    return jsonb_build_object('status', 'ok', 'already', false,
      'event_id', v_event.id, 'name', v_event.name, 'price_cdf', 0);
  end if;

  return jsonb_build_object('status', 'payment_required',
    'event_id', v_event.id, 'name', v_event.name,
    'price_cdf', v_event.price_cdf);
end $$;

-- ---------------------------------------------------------------------------
-- 4. La seule porte de l'accès payant
-- ---------------------------------------------------------------------------
-- Appelée par multipay-return (service_role) une fois la transaction vérifiée.
-- Idempotente, et volontairement muette sur l'état de la soirée : le paiement
-- est encaissé, l'accès est dû même si l'organisateur a fermé entre-temps.
create function public.grant_event_access(p_user uuid, p_event uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  insert into public.event_attendees (event_id, user_id)
  values (p_event, p_user)
  on conflict (event_id, user_id) do nothing;
  return true;
end $$;

revoke execute on function public.grant_event_access(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.grant_event_access(uuid, uuid) to service_role;

-- ---------------------------------------------------------------------------
-- 5. Tableau de bord : les entrées se comptent en francs encaissés
-- ---------------------------------------------------------------------------
-- Le seul changement porte sur 'economy' : event_spend_7d (pièces dépensées)
-- devient event_revenue_7d (CDF encaissés sur des commandes réglées). Le reste
-- de la fonction est identique à la migration 022.
create or replace function public.admin_dashboard()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin uuid := public.require_admin();
  v_out   jsonb;
begin
  perform public.expire_temporary_bans();

  select jsonb_build_object(
    'me', jsonb_build_object(
      'user_id', v_admin,
      'role', (select a.role from public.admin_users a where a.user_id = v_admin),
      'email', (select u.email from auth.users u where u.id = v_admin)
    ),
    'users', jsonb_build_object(
      'total',        (select count(*) from public.profiles),
      'onboarded',    (select count(*) from public.profiles where is_onboarded),
      'new_24h',      (select count(*) from public.profiles where created_at > now() - interval '24 hours'),
      'new_7d',       (select count(*) from public.profiles where created_at > now() - interval '7 days'),
      'active_24h',   (select count(*) from public.profiles where last_active_at > now() - interval '24 hours'),
      'banned',       (select count(*) from public.profiles where is_banned),
      'shadowbanned', (select count(*) from public.profiles where shadowbanned),
      'premium',      (select count(*) from public.entitlements where is_premium)
    ),
    'reports', jsonb_build_object(
      'pending',       (select count(*) from public.reports where status = 'pending'),
      'in_review',     (select count(*) from public.reports where status = 'in_review'),
      'critical_open', (select count(*) from public.reports where severity = 'critical' and status in ('pending', 'in_review')),
      'high_open',     (select count(*) from public.reports where severity = 'high' and status in ('pending', 'in_review')),
      'actioned_7d',   (select count(*) from public.reports where status = 'actioned' and handled_at > now() - interval '7 days'),
      'oldest_pending_hours', coalesce((
        select round(extract(epoch from (now() - min(created_at))) / 3600)
        from public.reports where status in ('pending', 'in_review')
      ), 0)
    ),
    'safety', jsonb_build_object(
      'csae_open',      (select count(*) from public.reports where reason = 'mineur' and status in ('pending', 'in_review')),
      'csae_total',     (select count(*) from public.reports where reason = 'mineur'),
      'csae_escalated', (select count(*) from public.reports where csae_escalated_at is not null),
      'bans_7d',        (select count(*) from public.user_sanctions where kind in ('ban', 'suspension') and created_at > now() - interval '7 days'),
      'warnings_7d',    (select count(*) from public.user_sanctions where kind = 'warning' and created_at > now() - interval '7 days'),
      'blocks_7d',      (select count(*) from public.blocks where created_at > now() - interval '7 days'),
      'photos_flagged', (select count(*) from public.photos where moderation_status = 'flagged')
    ),
    'activity', jsonb_build_object(
      'matches_24h',   (select count(*) from public.matches where created_at > now() - interval '24 hours'),
      'messages_24h',  (select count(*) from public.messages where created_at > now() - interval '24 hours'),
      'swipes_24h',    (select count(*) from public.swipes where created_at > now() - interval '24 hours'),
      'photos_total',  (select count(*) from public.photos),
      'events_active', (select count(*) from public.events where is_active and (ends_at is null or ends_at > now()))
    ),
    'economy', jsonb_build_object(
      'coins_circulating', coalesce((select sum(balance) from public.coin_wallets), 0),
      'spent_7d',          coalesce((select -sum(amount) from public.coin_transactions where amount < 0 and created_at > now() - interval '7 days'), 0),
      'recharges_7d',      coalesce((select sum(amount) from public.coin_transactions where kind = 'recharge' and created_at > now() - interval '7 days'), 0),
      'event_revenue_7d',  coalesce((
        select sum(amount_cdf) from public.payment_orders
        where kind = 'event' and status = 'success'
          and created_at > now() - interval '7 days'
      ), 0)
    ),
    'series', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'day',      to_char(d.day, 'YYYY-MM-DD'),
        'signups',  (select count(*) from public.profiles p where p.created_at >= d.day and p.created_at < d.day + interval '1 day'),
        'reports',  (select count(*) from public.reports r where r.created_at >= d.day and r.created_at < d.day + interval '1 day'),
        'matches',  (select count(*) from public.matches m where m.created_at >= d.day and m.created_at < d.day + interval '1 day'),
        'messages', (select count(*) from public.messages g where g.created_at >= d.day and g.created_at < d.day + interval '1 day')
      ) order by d.day), '[]'::jsonb)
      from generate_series(current_date - 13, current_date, interval '1 day') as d(day)
    )
  ) into v_out;

  return v_out;
end;
$$;
