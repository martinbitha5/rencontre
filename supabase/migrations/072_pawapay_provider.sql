-- ---------------------------------------------------------------------------
-- 072 : pawaPay remplace MultiPay comme rail Mobile Money (RDC)
--
-- Le schéma monétaire ne change pas : payment_orders reste la table des
-- commandes, la chaîne de confiance reste la même (le client initie, le
-- serveur revérifie chez le fournisseur puis accorde). On ajoute seulement :
--
-- 1. payment_orders.provider : qui encaisse la commande. Les commandes
--    MultiPay déjà en base gardent 'multipay' et restent réglables par les
--    fonctions multipay-* (aucune n'a été supprimée).
-- 2. public.pawapay_config() : même principe que multipay_config() (051),
--    les secrets PAWAPAY_* lus dans Vault à défaut de l'environnement.
--
-- Pour une commande pawaPay, txn_ref porte le depositId (UUID v4) envoyé à
-- pawaPay : c'est la clé de consultation du statut côté serveur.
-- ---------------------------------------------------------------------------

alter table public.payment_orders
  add column if not exists provider text not null default 'multipay'
    check (provider in ('multipay', 'pawapay'));

comment on column public.payment_orders.provider is
  'Fournisseur qui encaisse : multipay (historique) ou pawapay (depuis le 27/11/2026).';

create or replace function public.pawapay_config()
returns jsonb
language sql
security definer
set search_path = ''
stable
as $$
  select coalesce(jsonb_object_agg(name, decrypted_secret), '{}'::jsonb)
    from vault.decrypted_secrets
   where name like 'PAWAPAY\_%';
$$;

comment on function public.pawapay_config() is
  'Configuration pawaPay déchiffrée depuis Vault. Réservée au service_role : '
  'le jeton API autorise à encaisser au nom de Goblaire Ltd.';

revoke all on function public.pawapay_config() from public;
revoke all on function public.pawapay_config() from anon;
revoke all on function public.pawapay_config() from authenticated;
grant execute on function public.pawapay_config() to service_role;
