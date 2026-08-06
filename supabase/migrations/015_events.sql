-- Dowe : soirées avec accès par QR code (appliqué le 2026-07-26)
--
-- Le backoffice crée une soirée avec un coût en coins et obtient un QR
-- (contenu : dowe://event/{qr_token}). Dans l'app, scanner le QR débite le
-- coût UNE SEULE FOIS : sortir et re-scanner ne recoûte rien. Les personnes
-- présentes se découvrent entre elles sur l'écran de la soirée.

create table public.events (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 80),
  cost int not null default 0 check (cost >= 0),
  qr_token text not null unique default replace(gen_random_uuid()::text, '-', ''),
  is_active boolean not null default true,
  ends_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.events enable row level security;
create policy "events_admin_all" on public.events
  for all to authenticated
  using (exists (select 1 from public.admin_users a where a.user_id = (select auth.uid())))
  with check (exists (select 1 from public.admin_users a where a.user_id = (select auth.uid())));

create table public.event_attendees (
  event_id uuid not null references public.events(id) on delete cascade,
  user_id uuid not null references public.profiles(user_id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (event_id, user_id)
);
create index event_attendees_user_idx on public.event_attendees (user_id);
alter table public.event_attendees enable row level security;
create policy "event_attendees_admin_select" on public.event_attendees
  for select to authenticated
  using (exists (select 1 from public.admin_users a where a.user_id = (select auth.uid())));

-- Nouvelle nature de transaction : entrée en soirée.
do $$
declare v_name text;
begin
  select conname into v_name from pg_constraint
  where conrelid = 'public.coin_transactions'::regclass and contype = 'c'
    and pg_get_constraintdef(oid) ilike '%kind%';
  if v_name is not null then
    execute format('alter table public.coin_transactions drop constraint %I', v_name);
  end if;
end $$;
alter table public.coin_transactions add constraint coin_transactions_kind_check
  check (kind in ('welcome','recharge','like_back','dm','event','admin'));

-- Scanner un QR de soirée : débit unique, ré-entrée gratuite.
create function public.scan_event(p_token text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_me uuid := (select auth.uid());
  v_event record;
  v_balance int;
begin
  if v_me is null then raise exception 'non_authentifie'; end if;

  select id, name, cost, is_active, ends_at into v_event
  from public.events where qr_token = p_token;
  if v_event.id is null or not v_event.is_active
     or (v_event.ends_at is not null and v_event.ends_at < now()) then
    return jsonb_build_object('status', 'invalid');
  end if;

  -- Déjà entré : on ne redébite jamais.
  if exists (
    select 1 from public.event_attendees
    where event_id = v_event.id and user_id = v_me
  ) then
    return jsonb_build_object('status', 'ok', 'already', true,
      'event_id', v_event.id, 'name', v_event.name);
  end if;

  perform public.ensure_wallet(v_me);
  if v_event.cost > 0 then
    if not public.debit_coins(v_me, v_event.cost, 'event', null) then
      select balance into v_balance from public.coin_wallets where user_id = v_me;
      return jsonb_build_object('status', 'insufficient_coins',
        'cost', v_event.cost, 'balance', coalesce(v_balance, 0), 'name', v_event.name);
    end if;
  end if;

  insert into public.event_attendees (event_id, user_id) values (v_event.id, v_me);

  select balance into v_balance from public.coin_wallets where user_id = v_me;
  return jsonb_build_object('status', 'ok', 'already', false,
    'event_id', v_event.id, 'name', v_event.name,
    'cost', v_event.cost, 'balance', coalesce(v_balance, 0));
end $$;

-- Mes soirées en cours (pour y revenir sans re-scanner).
create function public.get_my_events()
returns table (event_id uuid, name text, ends_at timestamptz, joined_at timestamptz)
language sql security definer set search_path = '' stable as $$
  select e.id, e.name, e.ends_at, a.created_at
  from public.event_attendees a
  join public.events e on e.id = a.event_id
  where a.user_id = (select auth.uid())
    and e.is_active
    and (e.ends_at is null or e.ends_at > now())
  order by a.created_at desc;
$$;

-- Qui est sur place : réservé aux participants de la soirée.
create function public.get_event_attendees(p_event uuid)
returns table (
  user_id uuid, display_name text, birth_date date, gender public.gender,
  city_name text, bio text, photos jsonb, last_active_at timestamptz,
  height_cm smallint, job_title text, education text, relationship_goal text,
  has_children text, wants_children text, smoking text, drinking text,
  religion text, commune text, languages text[], interests text[],
  joined_at timestamptz
)
language plpgsql security definer set search_path = '' stable as $$
declare
  v_me uuid := (select auth.uid());
begin
  if not exists (
    select 1 from public.event_attendees a
    join public.events e on e.id = a.event_id
    where a.event_id = p_event and a.user_id = v_me and e.is_active
  ) then
    raise exception 'non_participant';
  end if;
  return query
  select p.user_id, p.display_name, p.birth_date, p.gender, c.name, p.bio,
    coalesce((
      select jsonb_agg(jsonb_build_object('id', ph.id, 'path', ph.storage_path) order by ph.position)
      from public.photos ph where ph.user_id = p.user_id
    ), '[]'::jsonb),
    p.last_active_at,
    p.height_cm, p.job_title, p.education, p.relationship_goal,
    p.has_children, p.wants_children, p.smoking, p.drinking,
    p.religion, p.commune, p.languages, p.interests,
    a.created_at
  from public.event_attendees a
  join public.profiles p on p.user_id = a.user_id
  left join public.cities c on c.id = p.city_id
  where a.event_id = p_event
    and a.user_id <> v_me
    and p.is_onboarded and not p.is_banned
    and not exists (
      select 1 from public.blocks b
      where (b.blocker_id = v_me and b.blocked_id = p.user_id)
         or (b.blocker_id = p.user_id and b.blocked_id = v_me)
    )
  order by a.created_at desc;
end $$;

revoke execute on function public.scan_event(text) from public, anon;
revoke execute on function public.get_my_events() from public, anon;
revoke execute on function public.get_event_attendees(uuid) from public, anon;
grant execute on function public.scan_event(text) to authenticated;
grant execute on function public.get_my_events() to authenticated;
grant execute on function public.get_event_attendees(uuid) to authenticated;
