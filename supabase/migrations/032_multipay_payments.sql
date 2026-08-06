-- ---------------------------------------------------------------------------
-- 032 : Paiements MultiPay (Interswitch Web Checkout RDC)
--
-- Chaque tentative de paiement devient une ligne payment_orders, créée par la
-- fonction Edge multipay-checkout (service_role) avec le montant calculé côté
-- serveur. Le crédit (pièces ou incognito) n'a lieu qu'après vérification de
-- la transaction chez Interswitch (gettransaction.json), et une seule fois :
-- la transition pending -> success est atomique.
-- ---------------------------------------------------------------------------

create table public.payment_orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  -- Ce qui est acheté, tel que résolu par le serveur (jamais par le client).
  kind text not null check (kind in ('coins', 'incognito', 'custom')),
  item_id text not null,
  amount_cdf integer not null check (amount_cdf > 0),
  -- Ce que la confirmation devra créditer.
  coins integer,
  validity_days integer not null default 0,
  months integer,
  -- Contexte client, purement informatif (le checkout web accepte toute carte
  -- ou wallet, l'opérateur choisi dans l'app n'est qu'une préférence).
  operator text,
  phone text,
  customer_email text,
  -- Référence envoyée à Interswitch (txn_ref) : unique, non devinable.
  txn_ref text not null unique,
  status text not null default 'pending'
    check (status in ('pending', 'success', 'failed')),
  -- Dernière réponse de la requête de vérification.
  response_code text,
  response_description text,
  provider_payload jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  credited_at timestamptz
);

create index payment_orders_user_idx on public.payment_orders (user_id, created_at desc);

create trigger payment_orders_updated_at
  before update on public.payment_orders
  for each row execute function public.set_updated_at();

-- Lecture : chacun voit ses propres paiements (historique d'achats).
-- Écriture : service_role uniquement (fonctions Edge), aucune policy d'insert
-- ou d'update pour les clients.
alter table public.payment_orders enable row level security;

create policy payment_orders_select_own on public.payment_orders
  for select to authenticated
  using (user_id = (select auth.uid()));

revoke all on public.payment_orders from anon, authenticated;
grant select on public.payment_orders to authenticated;

-- Les RPC de crédit avaient été retirées à tous les rôles (migrations 027/029)
-- sans grant explicite : service_role ne pouvait donc pas créditer via
-- PostgREST. Le webhook/la fonction de retour en a besoin.
grant execute on function public.credit_coins(uuid, int, text, int) to service_role;
grant execute on function public.credit_incognito(uuid, int) to service_role;
