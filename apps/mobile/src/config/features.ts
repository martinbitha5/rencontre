// Interrupteurs de fonctionnalités de l'application.
//
// PAYMENTS_ENABLED est l'unique interrupteur du rail monétaire. À false :
//   - aucun écran d'achat, d'abonnement ou de recharge n'est atteignable ;
//   - aucun prix, solde ou coût en pièces n'est affiché ;
//   - aucun appel n'est fait aux services de paiement (MultiPay / Interswitch),
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
