-- ---------------------------------------------------------------------------
-- 041 : index de clés étrangères et politiques RLS dédoublonnées
--
-- L'analyseur Supabase signale 21 clés étrangères sans index. À petite échelle
-- c'est invisible ; à 100 000 comptes ça devient le coût caché des
-- suppressions : effacer un utilisateur oblige Postgres à vérifier chaque
-- table référencée, et sans index c'est un parcours complet (messages par
-- expéditeur en tête). On indexe tout, c'est peu coûteux à l'écriture et ça
-- borne les suppressions comme les jointures du backoffice.
-- ---------------------------------------------------------------------------

create index if not exists admin_users_created_by_idx on public.admin_users (created_by);
create index if not exists coin_rewards_ref_user_idx on public.coin_rewards (ref_user_id);
create index if not exists coin_transactions_ref_user_idx on public.coin_transactions (ref_user_id);
create index if not exists events_created_by_idx on public.events (created_by);
create index if not exists favorites_target_idx on public.favorites (target_id);
create index if not exists match_archives_user_idx on public.match_archives (user_id);
create index if not exists matches_initiated_by_idx on public.matches (initiated_by);
create index if not exists message_reactions_user_idx on public.message_reactions (user_id);
create index if not exists messages_sender_idx on public.messages (sender_id);
create index if not exists photos_reviewed_by_idx on public.photos (reviewed_by);
create index if not exists profiles_referred_by_idx on public.profiles (referred_by);
create index if not exists reports_assigned_to_idx on public.reports (assigned_to);
create index if not exists reports_csae_escalated_by_idx on public.reports (csae_escalated_by);
create index if not exists reports_handled_by_idx on public.reports (handled_by);
create index if not exists reports_match_idx on public.reports (match_id);
create index if not exists reports_reporter_idx on public.reports (reporter_id);
create index if not exists user_notes_author_idx on public.user_notes (author_id);
create index if not exists user_sanctions_created_by_idx on public.user_sanctions (created_by);
create index if not exists user_sanctions_lifted_by_idx on public.user_sanctions (lifted_by);
create index if not exists user_sanctions_report_idx on public.user_sanctions (report_id);
create index if not exists verification_requests_reviewed_by_idx on public.verification_requests (reviewed_by);

-- ---------------------------------------------------------------------------
-- Politiques permissives doublées : chaque requête paie les deux, autant n'en
-- payer qu'une.
-- ---------------------------------------------------------------------------

-- reports : deux politiques SELECT (admin + déclarant) fusionnées en une.
drop policy if exists reports_select_admin on public.reports;
drop policy if exists reports_select_own on public.reports;
create policy reports_select on public.reports
  for select to authenticated
  using ((select public.is_admin()) or reporter_id = (select auth.uid()));

-- posts : la politique admin était FOR ALL, donc elle doublait la lecture
-- publique. On la limite à l'écriture ; la lecture publique couvre déjà les
-- brouillons pour les admins.
drop policy if exists posts_admin_write on public.posts;
create policy posts_admin_insert on public.posts
  for insert to authenticated
  with check (exists (select 1 from public.admin_users a where a.user_id = (select auth.uid())));
create policy posts_admin_update on public.posts
  for update to authenticated
  using (exists (select 1 from public.admin_users a where a.user_id = (select auth.uid())))
  with check (exists (select 1 from public.admin_users a where a.user_id = (select auth.uid())));
create policy posts_admin_delete on public.posts
  for delete to authenticated
  using (exists (select 1 from public.admin_users a where a.user_id = (select auth.uid())));
