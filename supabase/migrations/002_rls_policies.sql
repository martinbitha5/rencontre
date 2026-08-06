-- Dowe : RLS (appliqué le 2026-07-24)
alter table public.cities enable row level security;
alter table public.profiles enable row level security;
alter table public.photos enable row level security;
alter table public.swipes enable row level security;
alter table public.matches enable row level security;
alter table public.messages enable row level security;
alter table public.blocks enable row level security;
alter table public.reports enable row level security;
alter table public.entitlements enable row level security;
alter table public.push_tokens enable row level security;

create policy "cities_select" on public.cities
  for select to authenticated using (is_active);

create policy "profiles_select" on public.profiles
  for select to authenticated using (
    user_id = (select auth.uid())
    or (
      is_onboarded and not is_banned
      and not exists (
        select 1 from public.blocks b
        where (b.blocker_id = (select auth.uid()) and b.blocked_id = user_id)
           or (b.blocker_id = user_id and b.blocked_id = (select auth.uid()))
      )
    )
  );
create policy "profiles_update_own" on public.profiles
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

revoke update on public.profiles from authenticated, anon;
grant update (display_name, birth_date, gender, looking_for, city_id, bio, age_min, age_max, is_onboarded, last_active_at)
  on public.profiles to authenticated;

create policy "photos_select" on public.photos
  for select to authenticated using (
    exists (select 1 from public.profiles p where p.user_id = photos.user_id)
  );
create policy "photos_insert_own" on public.photos
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "photos_update_own" on public.photos
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "photos_delete_own" on public.photos
  for delete to authenticated using (user_id = (select auth.uid()));

-- swipes : aucun accès direct client (RPC uniquement)

create policy "matches_select_own" on public.matches
  for select to authenticated using (
    user_a = (select auth.uid()) or user_b = (select auth.uid())
  );

create policy "messages_select" on public.messages
  for select to authenticated using (
    exists (
      select 1 from public.matches m
      where m.id = messages.match_id
        and (m.user_a = (select auth.uid()) or m.user_b = (select auth.uid()))
    )
  );
create policy "messages_insert" on public.messages
  for insert to authenticated with check (
    sender_id = (select auth.uid())
    and exists (
      select 1 from public.matches m
      where m.id = messages.match_id
        and m.is_active
        and (m.user_a = (select auth.uid()) or m.user_b = (select auth.uid()))
        and not exists (
          select 1 from public.blocks b
          where (b.blocker_id = m.user_a and b.blocked_id = m.user_b)
             or (b.blocker_id = m.user_b and b.blocked_id = m.user_a)
        )
    )
  );

create policy "blocks_select_own" on public.blocks
  for select to authenticated using (blocker_id = (select auth.uid()));

create policy "reports_insert_own" on public.reports
  for insert to authenticated with check (reporter_id = (select auth.uid()));
create policy "reports_select_own" on public.reports
  for select to authenticated using (reporter_id = (select auth.uid()));

create policy "entitlements_select_own" on public.entitlements
  for select to authenticated using (user_id = (select auth.uid()));

create policy "push_tokens_all_own" on public.push_tokens
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
