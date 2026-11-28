-- ---------------------------------------------------------------------------
-- 078 : programme testeur, 14 jours avant le lancement officiel
--
-- Google Play exige des testeurs actifs pendant 14 jours avant d'ouvrir la
-- production. On transforme cette contrainte en défi : chaque jour où un
-- testeur ouvre l'app, il confirme sa présence d'un appui. Au 14e jour
-- confirmé, sa récompense est notée (tester_rewards) et sera remise au
-- lancement.
--
-- Règles :
-- - un jour = une date au fuseau de Kinshasa (même heure à Brazzaville) ;
-- - une seule confirmation par jour et par personne (clé primaire), donc
--   rejouer l'appel ne compte jamais deux fois ;
-- - les jours n'ont pas besoin d'être consécutifs, seuls comptent les jours
--   confirmés pendant la fenêtre du programme ;
-- - le client ne fait qu'appeler tester_checkin() : la date, le compte et la
--   récompense sont décidés par la base.
-- ---------------------------------------------------------------------------

create table if not exists public.tester_program (
  id smallint primary key default 1 check (id = 1),
  is_active boolean not null default true,
  required_days smallint not null default 14 check (required_days between 1 and 60),
  starts_on date not null default ((now() at time zone 'Africa/Kinshasa')::date),
  ends_on date,
  reward_label text not null default 'Badge Testeur fondateur, remis au lancement'
);

comment on table public.tester_program is
  'Réglage unique du programme testeur (ligne id = 1). Couper le programme : is_active = false.';

insert into public.tester_program (id) values (1) on conflict (id) do nothing;

create table if not exists public.tester_checkins (
  user_id uuid not null references auth.users (id) on delete cascade,
  day date not null,
  created_at timestamptz not null default now(),
  primary key (user_id, day)
);

create table if not exists public.tester_rewards (
  user_id uuid primary key references auth.users (id) on delete cascade,
  completed_at timestamptz not null default now(),
  granted_at timestamptz,
  note text
);

comment on table public.tester_rewards is
  'Testeurs qui ont confirmé tous les jours requis. granted_at : récompense remise.';

alter table public.tester_program enable row level security;
alter table public.tester_checkins enable row level security;
alter table public.tester_rewards enable row level security;

drop policy if exists tester_program_select on public.tester_program;
create policy tester_program_select on public.tester_program
  for select to authenticated using (true);

drop policy if exists tester_checkins_select_own on public.tester_checkins;
create policy tester_checkins_select_own on public.tester_checkins
  for select to authenticated using (user_id = (select auth.uid()));

drop policy if exists tester_rewards_select_own on public.tester_rewards;
create policy tester_rewards_select_own on public.tester_rewards
  for select to authenticated using (user_id = (select auth.uid()));

-- Aucune policy d'écriture : tout passe par les deux fonctions ci-dessous.

create or replace function public.tester_progress()
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  v_me uuid := (select auth.uid());
  v_prog public.tester_program%rowtype;
  v_today date := (now() at time zone 'Africa/Kinshasa')::date;
  v_days integer;
  v_checked boolean;
  v_reward public.tester_rewards%rowtype;
  v_open boolean;
begin
  if v_me is null then raise exception 'non_authentifie'; end if;
  select * into v_prog from public.tester_program where id = 1;

  v_open := coalesce(v_prog.is_active, false)
    and v_today >= v_prog.starts_on
    and (v_prog.ends_on is null or v_today <= v_prog.ends_on);

  select count(*) into v_days
    from public.tester_checkins
   where user_id = v_me
     and day >= v_prog.starts_on
     and (v_prog.ends_on is null or day <= v_prog.ends_on);

  select exists (select 1 from public.tester_checkins where user_id = v_me and day = v_today)
    into v_checked;
  select * into v_reward from public.tester_rewards where user_id = v_me;

  return jsonb_build_object(
    'active', v_open,
    'required', coalesce(v_prog.required_days, 14),
    'days', v_days,
    'checked_today', v_checked,
    'completed', v_reward.user_id is not null,
    'reward_label', v_prog.reward_label,
    'today', v_today
  );
end $function$;

create or replace function public.tester_checkin()
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_me uuid := (select auth.uid());
  v_prog public.tester_program%rowtype;
  v_today date := (now() at time zone 'Africa/Kinshasa')::date;
  v_days integer;
begin
  if v_me is null then raise exception 'non_authentifie'; end if;
  select * into v_prog from public.tester_program where id = 1;

  if coalesce(v_prog.is_active, false)
     and v_today >= v_prog.starts_on
     and (v_prog.ends_on is null or v_today <= v_prog.ends_on) then
    insert into public.tester_checkins (user_id, day)
    values (v_me, v_today)
    on conflict (user_id, day) do nothing;

    select count(*) into v_days
      from public.tester_checkins
     where user_id = v_me
       and day >= v_prog.starts_on
       and (v_prog.ends_on is null or day <= v_prog.ends_on);

    if v_days >= v_prog.required_days then
      insert into public.tester_rewards (user_id) values (v_me)
      on conflict (user_id) do nothing;
    end if;
  end if;

  return public.tester_progress();
end $function$;

revoke all on function public.tester_progress() from public, anon;
revoke all on function public.tester_checkin() from public, anon;
grant execute on function public.tester_progress() to authenticated;
grant execute on function public.tester_checkin() to authenticated;
