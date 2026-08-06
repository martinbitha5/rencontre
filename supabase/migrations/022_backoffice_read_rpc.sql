-- 022 — Backoffice : fonctions de lecture
--
-- Toutes ces fonctions sont SECURITY DEFINER et commencent par require_admin().
-- Elles retournent du jsonb : une seule forme de réponse à traiter côté client,
-- et aucune fuite de colonne non voulue (chaque champ est listé explicitement).

-- ---------------------------------------------------------------------------
-- Tableau de bord
-- ---------------------------------------------------------------------------

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
      'event_spend_7d',    coalesce((select -sum(amount) from public.coin_transactions where kind = 'event' and created_at > now() - interval '7 days'), 0)
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

-- ---------------------------------------------------------------------------
-- Signalements
-- ---------------------------------------------------------------------------

create or replace function public.admin_list_reports(
  p_status   text default 'open',
  p_severity text default null,
  p_reason   text default null,
  p_search   text default null,
  p_limit    integer default 50,
  p_offset   integer default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_admin uuid := public.require_admin();
  v_lim   integer := least(greatest(coalesce(p_limit, 50), 1), 200);
  v_off   integer := greatest(coalesce(p_offset, 0), 0);
  v_out   jsonb;
begin
  with base as (
    select r.id, r.created_at, r.reason, r.details, r.status, r.severity,
           r.resolution, r.handled_at, r.match_id, r.csae_escalated_at,
           r.reported_id, r.reporter_id
    from public.reports r
    join public.profiles rp on rp.user_id = r.reported_id
    where (p_status is null
           or (p_status = 'open' and r.status in ('pending', 'in_review'))
           or (p_status = 'closed' and r.status in ('actioned', 'dismissed', 'reviewed'))
           or r.status = p_status)
      and (p_severity is null or r.severity = p_severity)
      and (p_reason is null or r.reason = p_reason)
      and (p_search is null or p_search = ''
           or rp.display_name ilike '%' || p_search || '%')
  ),
  page as (
    select b.*,
           row_number() over (
             order by case b.severity when 'critical' then 0 when 'high' then 1 else 2 end,
                      b.created_at desc
           ) as rn
    from base b
    order by case b.severity when 'critical' then 0 when 'high' then 1 else 2 end,
             b.created_at desc
    limit v_lim offset v_off
  )
  select jsonb_build_object(
    'total', (select count(*) from base),
    'items', coalesce(jsonb_agg(jsonb_build_object(
      'id', p.id,
      'created_at', p.created_at,
      'reason', p.reason,
      'details', p.details,
      'status', p.status,
      'severity', p.severity,
      'resolution', p.resolution,
      'handled_at', p.handled_at,
      'match_id', p.match_id,
      'csae_escalated_at', p.csae_escalated_at,
      'reported', jsonb_build_object(
        'user_id', rp.user_id,
        'display_name', rp.display_name,
        'age', case when rp.birth_date is null then null
                    else extract(year from age(rp.birth_date))::int end,
        'city', (select c.name from public.cities c where c.id = rp.city_id),
        'photo', (select ph.storage_path from public.photos ph
                  where ph.user_id = rp.user_id order by ph.position limit 1),
        'is_banned', rp.is_banned,
        'shadowbanned', rp.shadowbanned,
        'reports_count', (select count(*) from public.reports r2 where r2.reported_id = rp.user_id)
      ),
      'reporter', jsonb_build_object(
        'user_id', op.user_id,
        'display_name', op.display_name
      )
    ) order by p.rn), '[]'::jsonb)
  ) into v_out
  from page p
  join public.profiles rp on rp.user_id = p.reported_id
  left join public.profiles op on op.user_id = p.reporter_id;

  return coalesce(v_out, jsonb_build_object('total', 0, 'items', '[]'::jsonb));
end;
$$;

-- ---------------------------------------------------------------------------
-- Fiche complète d'un compte
-- ---------------------------------------------------------------------------

create or replace function public.admin_user_detail(p_user_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_admin uuid := public.require_admin();
  v_out   jsonb;
begin
  select jsonb_build_object(
    'profile', jsonb_build_object(
      'user_id', p.user_id,
      'display_name', p.display_name,
      'email', (select u.email from auth.users u where u.id = p.user_id),
      'last_sign_in_at', (select u.last_sign_in_at from auth.users u where u.id = p.user_id),
      'email_confirmed_at', (select u.email_confirmed_at from auth.users u where u.id = p.user_id),
      'birth_date', p.birth_date,
      'age', case when p.birth_date is null then null
                  else extract(year from age(p.birth_date))::int end,
      'gender', p.gender,
      'looking_for', p.looking_for,
      'city', (select c.name from public.cities c where c.id = p.city_id),
      'commune', p.commune,
      'bio', p.bio,
      'job_title', p.job_title,
      'education', p.education,
      'relationship_goal', p.relationship_goal,
      'height_cm', p.height_cm,
      'has_children', p.has_children,
      'wants_children', p.wants_children,
      'smoking', p.smoking,
      'drinking', p.drinking,
      'religion', p.religion,
      'languages', p.languages,
      'interests', p.interests,
      'is_onboarded', p.is_onboarded,
      'is_banned', p.is_banned,
      'banned_at', p.banned_at,
      'banned_until', p.banned_until,
      'ban_reason', p.ban_reason,
      'shadowbanned', p.shadowbanned,
      'warnings_count', p.warnings_count,
      'is_verified', p.is_verified,
      'incognito', p.incognito,
      'created_at', p.created_at,
      'last_active_at', p.last_active_at,
      'is_premium', coalesce((select e.is_premium from public.entitlements e where e.user_id = p.user_id), false)
    ),
    'photos', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', ph.id, 'path', ph.storage_path, 'position', ph.position,
        'status', ph.moderation_status, 'created_at', ph.created_at
      ) order by ph.position)
      from public.photos ph where ph.user_id = p.user_id
    ), '[]'::jsonb),
    'wallet', jsonb_build_object(
      'balance', coalesce((select w.balance from public.coin_wallets w where w.user_id = p.user_id), 0),
      'free_dms_used', coalesce((select w.free_dms_used from public.coin_wallets w where w.user_id = p.user_id), 0),
      'spent_total', coalesce((select -sum(t.amount) from public.coin_transactions t where t.user_id = p.user_id and t.amount < 0), 0),
      'recharged_total', coalesce((select sum(t.amount) from public.coin_transactions t where t.user_id = p.user_id and t.kind = 'recharge'), 0)
    ),
    'stats', jsonb_build_object(
      'likes_sent',       (select count(*) from public.swipes s where s.swiper_id = p.user_id and s.liked),
      'passes_sent',      (select count(*) from public.swipes s where s.swiper_id = p.user_id and not s.liked),
      'likes_received',   (select count(*) from public.swipes s where s.target_id = p.user_id and s.liked),
      'matches',          (select count(*) from public.matches m where (m.user_a = p.user_id or m.user_b = p.user_id) and m.is_active),
      'messages_sent',    (select count(*) from public.messages g where g.sender_id = p.user_id),
      'reports_against',  (select count(*) from public.reports r where r.reported_id = p.user_id),
      'reports_filed',    (select count(*) from public.reports r where r.reporter_id = p.user_id),
      'blocked_by_count', (select count(*) from public.blocks b where b.blocked_id = p.user_id),
      'events',           (select count(*) from public.event_attendees a where a.user_id = p.user_id)
    ),
    'sanctions', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', s.id, 'kind', s.kind, 'reason', s.reason, 'notes', s.notes,
        'created_at', s.created_at, 'expires_at', s.expires_at,
        'lifted_at', s.lifted_at, 'lifted_reason', s.lifted_reason,
        'by', (select u.email from auth.users u where u.id = s.created_by)
      ) order by s.created_at desc)
      from public.user_sanctions s where s.user_id = p.user_id
    ), '[]'::jsonb),
    'notes', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', n.id, 'body', n.body, 'created_at', n.created_at,
        'author', (select u.email from auth.users u where u.id = n.author_id)
      ) order by n.created_at desc)
      from public.user_notes n where n.user_id = p.user_id
    ), '[]'::jsonb),
    'reports', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', r.id, 'created_at', r.created_at, 'reason', r.reason,
        'details', r.details, 'status', r.status, 'severity', r.severity,
        'resolution', r.resolution, 'match_id', r.match_id,
        'reporter', (select p2.display_name from public.profiles p2 where p2.user_id = r.reporter_id)
      ) order by r.created_at desc)
      from public.reports r where r.reported_id = p.user_id
    ), '[]'::jsonb),
    'conversations', coalesce((
      select jsonb_agg(jsonb_build_object(
        'match_id', m.id,
        'other_id', case when m.user_a = p.user_id then m.user_b else m.user_a end,
        'other_name', (select p3.display_name from public.profiles p3
                       where p3.user_id = case when m.user_a = p.user_id then m.user_b else m.user_a end),
        'status', m.status,
        'origin', m.origin,
        'created_at', m.created_at,
        'messages', (select count(*) from public.messages g where g.match_id = m.id)
      ) order by m.created_at desc)
      from public.matches m
      where (m.user_a = p.user_id or m.user_b = p.user_id)
    ), '[]'::jsonb)
  ) into v_out
  from public.profiles p
  where p.user_id = p_user_id;

  if v_out is null then
    raise exception 'user_not_found';
  end if;

  return v_out;
end;
$$;

-- ---------------------------------------------------------------------------
-- Annuaire des comptes
-- ---------------------------------------------------------------------------

create or replace function public.admin_list_users(
  p_search text default null,
  p_filter text default 'all',
  p_limit  integer default 50,
  p_offset integer default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_admin uuid := public.require_admin();
  v_lim   integer := least(greatest(coalesce(p_limit, 50), 1), 200);
  v_off   integer := greatest(coalesce(p_offset, 0), 0);
  v_out   jsonb;
begin
  with base as (
    select p.user_id, p.display_name, p.birth_date, p.gender, p.city_id,
           p.is_banned, p.shadowbanned, p.is_verified, p.is_onboarded,
           p.created_at, p.last_active_at, p.warnings_count
    from public.profiles p
    where (p_search is null or p_search = ''
           or p.display_name ilike '%' || p_search || '%'
           or p.user_id::text = p_search
           or exists (select 1 from auth.users u
                      where u.id = p.user_id and u.email ilike '%' || p_search || '%'))
      and (coalesce(p_filter, 'all') = 'all'
           or (p_filter = 'banned' and p.is_banned)
           or (p_filter = 'shadowbanned' and p.shadowbanned)
           or (p_filter = 'warned' and p.warnings_count > 0)
           or (p_filter = 'reported' and exists (
                 select 1 from public.reports r
                 where r.reported_id = p.user_id and r.status in ('pending', 'in_review')))
           or (p_filter = 'new' and p.created_at > now() - interval '7 days')
           or (p_filter = 'incomplete' and not p.is_onboarded)
           or (p_filter = 'premium' and exists (
                 select 1 from public.entitlements e
                 where e.user_id = p.user_id and e.is_premium)))
  ),
  page as (
    select b.*, row_number() over (order by b.created_at desc) as rn
    from base b
    order by b.created_at desc
    limit v_lim offset v_off
  )
  select jsonb_build_object(
    'total', (select count(*) from base),
    'items', coalesce(jsonb_agg(jsonb_build_object(
      'user_id', pg.user_id,
      'display_name', pg.display_name,
      'age', case when pg.birth_date is null then null
                  else extract(year from age(pg.birth_date))::int end,
      'gender', pg.gender,
      'city', (select c.name from public.cities c where c.id = pg.city_id),
      'photo', (select ph.storage_path from public.photos ph
                where ph.user_id = pg.user_id order by ph.position limit 1),
      'is_banned', pg.is_banned,
      'shadowbanned', pg.shadowbanned,
      'is_verified', pg.is_verified,
      'is_onboarded', pg.is_onboarded,
      'warnings_count', pg.warnings_count,
      'created_at', pg.created_at,
      'last_active_at', pg.last_active_at,
      'open_reports', (select count(*) from public.reports r
                       where r.reported_id = pg.user_id and r.status in ('pending', 'in_review'))
    ) order by pg.rn), '[]'::jsonb)
  ) into v_out
  from page pg;

  return coalesce(v_out, jsonb_build_object('total', 0, 'items', '[]'::jsonb));
end;
$$;

-- ---------------------------------------------------------------------------
-- Photos
-- ---------------------------------------------------------------------------

create or replace function public.admin_list_photos(
  p_status text default null,
  p_limit  integer default 60,
  p_offset integer default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_admin uuid := public.require_admin();
  v_lim   integer := least(greatest(coalesce(p_limit, 60), 1), 200);
  v_off   integer := greatest(coalesce(p_offset, 0), 0);
  v_out   jsonb;
begin
  with base as (
    select ph.id, ph.user_id, ph.storage_path, ph.position,
           ph.moderation_status, ph.created_at
    from public.photos ph
    where p_status is null or p_status = '' or ph.moderation_status = p_status
  ),
  page as (
    select b.*, row_number() over (order by b.created_at desc) as rn
    from base b order by b.created_at desc limit v_lim offset v_off
  )
  select jsonb_build_object(
    'total', (select count(*) from base),
    'items', coalesce(jsonb_agg(jsonb_build_object(
      'id', pg.id,
      'path', pg.storage_path,
      'status', pg.moderation_status,
      'created_at', pg.created_at,
      'user_id', pg.user_id,
      'display_name', (select p.display_name from public.profiles p where p.user_id = pg.user_id),
      'age', (select case when p.birth_date is null then null
                          else extract(year from age(p.birth_date))::int end
              from public.profiles p where p.user_id = pg.user_id),
      'is_banned', (select p.is_banned from public.profiles p where p.user_id = pg.user_id),
      'open_reports', (select count(*) from public.reports r
                       where r.reported_id = pg.user_id and r.status in ('pending', 'in_review'))
    ) order by pg.rn), '[]'::jsonb)
  ) into v_out
  from page pg;

  return coalesce(v_out, jsonb_build_object('total', 0, 'items', '[]'::jsonb));
end;
$$;

-- ---------------------------------------------------------------------------
-- Journal d'audit
-- ---------------------------------------------------------------------------

create or replace function public.admin_list_audit(
  p_limit  integer default 100,
  p_offset integer default 0,
  p_action text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_admin uuid := public.require_admin();
  v_lim   integer := least(greatest(coalesce(p_limit, 100), 1), 300);
  v_off   integer := greatest(coalesce(p_offset, 0), 0);
  v_out   jsonb;
begin
  with base as (
    select a.* from public.moderation_actions a
    where p_action is null or p_action = '' or a.action = p_action
  ),
  page as (
    select b.*, row_number() over (order by b.created_at desc) as rn
    from base b order by b.created_at desc limit v_lim offset v_off
  )
  select jsonb_build_object(
    'total', (select count(*) from base),
    'items', coalesce(jsonb_agg(jsonb_build_object(
      'id', pg.id,
      'created_at', pg.created_at,
      'action', pg.action,
      'actor', coalesce(pg.actor_email, 'compte supprime'),
      'reason', pg.reason,
      'target_type', pg.target_type,
      'target_id', pg.target_id,
      'target_user_id', pg.target_user_id,
      'target_name', (select p.display_name from public.profiles p where p.user_id = pg.target_user_id),
      'metadata', pg.metadata
    ) order by pg.rn), '[]'::jsonb)
  ) into v_out
  from page pg;

  return coalesce(v_out, jsonb_build_object('total', 0, 'items', '[]'::jsonb));
end;
$$;

-- ---------------------------------------------------------------------------
-- Économie
-- ---------------------------------------------------------------------------

create or replace function public.admin_economy(
  p_limit  integer default 50,
  p_offset integer default 0,
  p_kind   text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_admin uuid := public.require_admin();
  v_lim   integer := least(greatest(coalesce(p_limit, 50), 1), 200);
  v_off   integer := greatest(coalesce(p_offset, 0), 0);
  v_out   jsonb;
begin
  with base as (
    select t.* from public.coin_transactions t
    where p_kind is null or p_kind = '' or t.kind = p_kind
  ),
  page as (
    select b.*, row_number() over (order by b.created_at desc) as rn
    from base b order by b.created_at desc limit v_lim offset v_off
  )
  select jsonb_build_object(
    'config', coalesce((
      select jsonb_object_agg(e.key, e.value) from public.economy_config e
    ), '{}'::jsonb),
    'totals', jsonb_build_object(
      'circulating', coalesce((select sum(balance) from public.coin_wallets), 0),
      'wallets',     (select count(*) from public.coin_wallets),
      'spent_30d',   coalesce((select -sum(amount) from public.coin_transactions
                               where amount < 0 and created_at > now() - interval '30 days'), 0),
      'granted_30d', coalesce((select sum(amount) from public.coin_transactions
                               where amount > 0 and created_at > now() - interval '30 days'), 0)
    ),
    'by_kind', coalesce((
      select jsonb_agg(jsonb_build_object('kind', k.kind, 'count', k.n, 'volume', k.v) order by k.n desc)
      from (
        select kind, count(*) as n, sum(abs(amount)) as v
        from public.coin_transactions
        where created_at > now() - interval '30 days'
        group by kind
      ) k
    ), '[]'::jsonb),
    'top_spenders', coalesce((
      select jsonb_agg(jsonb_build_object(
        'user_id', s.user_id,
        'display_name', (select p.display_name from public.profiles p where p.user_id = s.user_id),
        'spent', s.spent
      ) order by s.spent desc)
      from (
        select user_id, -sum(amount) as spent
        from public.coin_transactions
        where amount < 0 and created_at > now() - interval '30 days'
        group by user_id order by spent desc limit 10
      ) s
    ), '[]'::jsonb),
    'total', (select count(*) from base),
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', pg.id,
        'created_at', pg.created_at,
        'amount', pg.amount,
        'kind', pg.kind,
        'user_id', pg.user_id,
        'display_name', (select p.display_name from public.profiles p where p.user_id = pg.user_id),
        'balance', (select w.balance from public.coin_wallets w where w.user_id = pg.user_id)
      ) order by pg.rn)
      from page pg
    ), '[]'::jsonb)
  ) into v_out;

  return v_out;
end;
$$;

-- ---------------------------------------------------------------------------
-- Équipe
-- ---------------------------------------------------------------------------

create or replace function public.admin_list_admins()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_admin uuid := public.require_admin();
begin
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'user_id', a.user_id,
      'email', (select u.email from auth.users u where u.id = a.user_id),
      'last_sign_in_at', (select u.last_sign_in_at from auth.users u where u.id = a.user_id),
      'full_name', a.full_name,
      'role', a.role,
      'is_active', a.is_active,
      'created_at', a.created_at,
      'actions_30d', (select count(*) from public.moderation_actions m
                      where m.actor_id = a.user_id and m.created_at > now() - interval '30 days')
    ) order by a.created_at)
    from public.admin_users a
  ), '[]'::jsonb);
end;
$$;

-- ---------------------------------------------------------------------------
-- Droits d'exécution
-- ---------------------------------------------------------------------------

revoke execute on function public.admin_dashboard() from public, anon;
revoke execute on function public.admin_list_reports(text, text, text, text, integer, integer) from public, anon;
revoke execute on function public.admin_user_detail(uuid) from public, anon;
revoke execute on function public.admin_list_users(text, text, integer, integer) from public, anon;
revoke execute on function public.admin_list_photos(text, integer, integer) from public, anon;
revoke execute on function public.admin_list_audit(integer, integer, text) from public, anon;
revoke execute on function public.admin_economy(integer, integer, text) from public, anon;
revoke execute on function public.admin_list_admins() from public, anon;

grant execute on function public.admin_dashboard() to authenticated;
grant execute on function public.admin_list_reports(text, text, text, text, integer, integer) to authenticated;
grant execute on function public.admin_user_detail(uuid) to authenticated;
grant execute on function public.admin_list_users(text, text, integer, integer) to authenticated;
grant execute on function public.admin_list_photos(text, integer, integer) to authenticated;
grant execute on function public.admin_list_audit(integer, integer, text) to authenticated;
grant execute on function public.admin_economy(integer, integer, text) to authenticated;
grant execute on function public.admin_list_admins() to authenticated;
