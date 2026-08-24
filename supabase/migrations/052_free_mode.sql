-- ---------------------------------------------------------------------------
-- 052 : MODE GRATUIT TEMPORAIRE (désactivation du rail monétaire)
--
-- Miroir serveur de la constante PAYMENTS_ENABLED = false du client
-- (apps/mobile/src/config/features.ts). Le client peut cacher un prix ; seul
-- le serveur peut décider de ne pas facturer. Les deux vont ensemble : un
-- client gratuit sur une base payante enferme l'utilisateur devant un refus
-- qu'il n'a aucun moyen de lever, la boutique n'étant plus atteignable.
--
-- RIEN N'EST SUPPRIMÉ. Aucune table n'est retirée, aucune colonne n'est
-- perdue, aucun droit acquis n'est révoqué. Les prix d'origine sont recopiés
-- dans economy_config_paid_backup AVANT d'être mis à zéro : le retour arrière
-- (supabase/rollback/052_free_mode_rollback.sql) les restitue exactement,
-- sans avoir à les retrouver dans l'historique des migrations.
--
-- Ce que cette migration change :
--   1. economy_config.free_mode = 1        (drapeau lisible par les fonctions)
--   2. les coûts en pièces passent à 0     (like en retour, DM, filtres)
--   3. debit_coins() ne journalise plus un débit nul
--   4. set_incognito() accorde l'incognito à tout le monde en mode gratuit
--
-- Ce qu'elle NE change PAS, volontairement :
--   - la limite quotidienne de likes des comptes non vérifiés : elle ne se
--     lève pas en payant, elle se lève en faisant vérifier son profil, ce qui
--     est gratuit. Ce n'est pas un mur de paiement.
--   - le prix d'entrée des soirées (events.price_cdf) : il est fixé par
--     l'organisateur au backoffice, pour un service rendu hors de l'app. Le
--     mettre à 0 est une décision commerciale, pas technique.
--   - les fonctions de crédit (credit_coins, credit_incognito,
--     grant_event_access) et toute la chaîne payment_orders / multipay :
--     intactes et prêtes à resservir.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 1. Sauvegarde des prix en vigueur
-- ---------------------------------------------------------------------------
-- Une seule ligne par clé, posée à la première exécution. `on conflict do
-- nothing` : rejouer la migration ne doit jamais écraser la sauvegarde par
-- des zéros.
create table if not exists public.economy_config_paid_backup (
  key text primary key,
  value int not null,
  saved_at timestamptz not null default now()
);

comment on table public.economy_config_paid_backup is
  'Prix en vigueur avant le passage en mode gratuit (migration 052). '
  'NE PAS SUPPRIMER : c''est la source du retour arrière.';

alter table public.economy_config_paid_backup enable row level security;
-- Aucune politique : personne d'autre que le propriétaire et le service_role
-- n'a à lire la grille tarifaire d'avant.

insert into public.economy_config_paid_backup (key, value)
select key, value from public.economy_config
where key in ('like_back_cost', 'dm_cost', 'free_dm_quota', 'incognito_cost',
              'filter_online_cost', 'filter_goals_cost', 'filter_dm_cost')
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- 2. Le drapeau et les prix
-- ---------------------------------------------------------------------------
insert into public.economy_config (key, value) values ('free_mode', 1)
on conflict (key) do update set value = 1;

update public.economy_config set value = 0
where key in ('like_back_cost', 'dm_cost', 'incognito_cost',
              'filter_online_cost', 'filter_goals_cost', 'filter_dm_cost');

-- Quota de DM offerts porté très haut plutôt que remis à zéro : le premier
-- message continue de passer par le chemin « offert » de
-- send_direct_message(), qui n'écrit aucune ligne dans coin_transactions.
-- Un compte qui écrit 100 000 premiers messages n'existe pas.
update public.economy_config set value = 100000 where key = 'free_dm_quota';

-- ---------------------------------------------------------------------------
-- 3. Un débit nul ne laisse pas de trace
-- ---------------------------------------------------------------------------
-- Sans ce court-circuit, chaque like en retour et chaque filtre activé
-- inscrirait une transaction de 0 pièce dans l'historique. La règle métier
-- est inchangée pour tout montant positif.
create or replace function public.debit_coins(p_user uuid, p_amount int, p_kind text, p_ref uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  -- Mode gratuit : rien à débiter, rien à journaliser, l'opération réussit.
  if p_amount is null or p_amount <= 0 then return true; end if;

  update public.coin_wallets
  set balance = balance - p_amount, updated_at = now()
  where user_id = p_user and balance >= p_amount;
  if not found then return false; end if;
  insert into public.coin_transactions (user_id, amount, kind, ref_user_id)
  values (p_user, -p_amount, p_kind, p_ref);
  return true;
end $$;

-- ---------------------------------------------------------------------------
-- 4. L'incognito n'exige plus d'abonnement
-- ---------------------------------------------------------------------------
-- Seule la condition d'activation change, et uniquement quand free_mode vaut
-- 1. La colonne entitlements.incognito_until reste lue, écrite et renvoyée :
-- un abonnement déjà payé garde sa date d'échéance, et redevient la règle dès
-- que le drapeau retombe.
create or replace function public.set_incognito(p_on boolean)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_me uuid := (select auth.uid());
  v_until timestamptz;
  v_free boolean := coalesce(public.economy_value('free_mode'), 0) = 1;
begin
  if v_me is null then raise exception 'non_authentifie'; end if;

  select incognito_until into v_until from public.entitlements where user_id = v_me;

  -- Couper l'incognito est toujours autorisé, même sans abonnement valide.
  if p_on and not v_free and not public.incognito_active(v_me) then
    return jsonb_build_object('status', 'subscription_required');
  end if;

  update public.profiles set incognito = p_on, updated_at = now() where user_id = v_me;
  return jsonb_build_object('status', 'ok', 'incognito', p_on, 'incognito_until', v_until);
end $$;

-- Grants inchangés, redonnés ici parce qu'un `create or replace` sur une
-- signature identique les conserve mais qu'un projet neuf rejouant les
-- migrations dans l'ordre doit les retrouver.
revoke execute on function public.debit_coins(uuid, int, text, uuid) from public, anon, authenticated;
revoke execute on function public.set_incognito(boolean) from public, anon;
grant execute on function public.set_incognito(boolean) to authenticated;
