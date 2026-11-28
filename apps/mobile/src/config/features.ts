// Interrupteurs de fonctionnalités de l'application.
//
// PAYMENTS_ENABLED est l'unique interrupteur du rail monétaire. À false :
//   - aucun écran d'achat, d'abonnement ou de recharge n'est atteignable ;
//   - aucun prix, solde ou coût en pièces n'est affiché ;
//   - aucun appel n'est fait au service de paiement (pawaPay),
//     même si les fonctions Edge restent déployées ;
//   - l'économie de pièces devient invisible : liker en retour, écrire en
//     premier et activer un filtre de recherche ne coûtent plus rien.
//
// RIEN N'EST SUPPRIMÉ. Les écrans, services, types, migrations et fonctions
// Edge du paiement restent en place, intacts. Repasser cette constante à true
// (et rejouer le retour arrière SQL, voir CLAUDE.md, section
// « TEMPORARILY DISABLED PAYMENT SYSTEM ») restitue le comportement précédent.
//
// Le miroir de cet interrupteur côté serveur est la clé `free_mode` de la
// table economy_config (migration 052_free_mode.sql) : le client peut cacher
// un prix, seul le serveur peut décider de ne pas facturer. Les deux doivent
// être basculés ensemble, sinon un utilisateur se heurte à un refus de
// paiement sans avoir de moyen de payer.
export const PAYMENTS_ENABLED = false;

// EVENT_PAYMENTS_ENABLED ouvre UNE seule exception au mode gratuit : l'entrée
// payante d'une soirée (events.price_cdf > 0), réglée sur le web. Au scan du
// QR, l'app crée la commande (pawapay-checkout, kind 'event', sans numéro) et
// ouvre la page de paiement hébergée pawaPay, où l'on paie par Mobile Money
// (Airtel, Orange, M-Pesa). L'accès n'est accordé que par pawapay-return,
// après revérification du dépôt chez pawaPay : la chaîne de confiance est
// inchangée. (MultiPay / Interswitch jusqu'au 27/11/2026.)
//
// C'est un service hors app (une place à une soirée réelle), pas du contenu
// numérique : il n'est pas concerné par l'IAP Apple / Google. Les pièces et
// Incognito restent gratuits et masqués tant que PAYMENTS_ENABLED vaut false.
//
// Le mode SANDBOX ou LIVE se règle côté serveur (secret PAWAPAY_MODE), jamais
// ici. Activé le 25/11/2026, en TEST.
export const EVENT_PAYMENTS_ENABLED = true;
