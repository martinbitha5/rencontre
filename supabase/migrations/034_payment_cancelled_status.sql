-- ---------------------------------------------------------------------------
-- 033 : Statut « annulé » pour les paiements
--
-- Un paiement abandonné (fermeture du navigateur, bouton Annuler de la page
-- Interswitch) n'est pas un échec bancaire : le distinguer évite de confondre
-- « le client a renoncé » et « la banque a refusé » lors d'un rapprochement,
-- et surtout ferme définitivement la commande — une commande non-pending ne
-- peut plus JAMAIS être créditée (garde d'idempotence de multipay-return).
-- ---------------------------------------------------------------------------

alter table public.payment_orders
  drop constraint payment_orders_status_check;

alter table public.payment_orders
  add constraint payment_orders_status_check
  check (status in ('pending', 'success', 'failed', 'cancelled'));
