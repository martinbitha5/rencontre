# Dowe — consignes de travail

Application de rencontre pour la RDC. Expo (React Native) + Supabase.
L'architecture détaillée vit dans [ARCHITECTURE.md](ARCHITECTURE.md).

---

## TEMPORARILY DISABLED PAYMENT SYSTEM

> **Le système de paiement est volontairement désactivé temporairement.**
> **Il ne doit pas être considéré comme supprimé.** Lorsqu'une demande de
> réactivation est faite, il faut restaurer le comportement précédent en
> utilisant l'architecture existante et la documentation de cette section,
> **sans réinventer un nouveau système de paiement**.

### 1. Pourquoi

Première version publique livrée 100 % gratuite : aucun utilisateur ne doit
payer, aucune fonctionnalité prévue au produit ne doit être bloquée derrière un
achat. La monétisation reviendra plus tard, avec la même architecture.

### 2. Date de désactivation

**24 août 2026.** Commit de sauvegarde de l'état payant complet :
`d9ea615` (`chore: backup current version before temporary payment removal`),
branche `main`.

### 3. Comment le paiement fonctionnait avant

Deux objets vendus, plus un service :

| Produit | Nature | Grille |
| --- | --- | --- |
| Packs de pièces | consommable | Découverte 800 (4 500 CDF / 1,79 $), Élan 3 000 (13 300 CDF / 5,49 $), Envol 6 500 (22 200 CDF / 8,99 $), Prestige 20 000 (44 300 CDF / 17,99 $, périmé après 30 j) |
| Abonnement Incognito | droit dans le temps, sans reconduction | 3 mois 110 900 CDF / 44,99 $ · 6 mois 177 400 CDF / 71,99 $ · 12 mois 287 700 CDF / 116,99 $ |
| Entrée en soirée | service hors app | `events.price_cdf`, fixé par l'organisateur au backoffice |

Les pièces achetaient : liker en retour (400), écrire en premier au-delà du
quota gratuit de 5 DM (200), activer un filtre de recherche premium
(en ligne 8 000, intentions 8 000, filtre DM 16 000).
L'abonnement Incognito donnait : sortie du fil Rencontres, statut en ligne
masqué, code secret de verrouillage de l'app.

Chaîne de confiance, invariante et **à ne jamais assouplir** : le client
INITIE seulement. `multipay-checkout` calcule le montant et crée la commande ;
le droit acheté n'est accordé que par `multipay-return` (ou le webhook), après
revérification de la transaction chez Interswitch. Le client ne s'accorde
jamais un droit qu'il n'a pas payé.

### 4. Fournisseurs

- **MultiPay / Interswitch** — Mobile Money RDC (Airtel Money, Orange Money,
  M-Pesa Vodacom) et carte bancaire, en CDF. Deux rails : poussée directe sur
  le téléphone (LIVE, API wallet) et page de paiement hébergée (TEST ou repli).
- **Apple In-App Purchase / Google Play Billing** — jamais branché. Prévu via
  **RevenueCat**, prix en USD déjà présents dans `COIN_PACKS` et
  `INCOGNITO_PLANS`. Voir §15.

### 5. Fichiers concernés

Client (`apps/mobile/src/`) :

| Fichier | Rôle |
| --- | --- |
| `config/features.ts` | **l'interrupteur** : `PAYMENTS_ENABLED` |
| `config/economy.ts` | grilles de prix, packs, forfaits, opérateurs — **inchangé, intact** |
| `services/payments.ts` | initiation, sondage, annulation d'un paiement |
| `providers/wallet.tsx` | solde, coûts, quota de likes — **inchangé** |
| `services/api.ts` | RPC `get_wallet`, `like_back`, `send_direct_message`, `update_search_filters`, `set_incognito` |
| `screens/Recharge/`, `Incognito/`, `PaymentMethods/`, `MobileMoney/`, `Checkout/`, `CheckoutReturn/`, `Wallet/`, `Transactions/`, `Rewards/`, `Referral/` | écrans du rail monétaire — **intacts, aucun n'a été modifié** |
| `app/recharge.tsx`, `incognito.tsx`, `payment.tsx`, `mobile-money.tsx`, `checkout.tsx`, `checkout-return.tsx`, `rewards.tsx`, `referral.tsx`, `(tabs)/profile/wallet.tsx`, `(tabs)/profile/transactions.tsx` | routes neutralisées (redirection) |
| `components/coins.tsx`, `PaymentResultToast.tsx` | pastille de solde, modale de solde insuffisant, retour de paiement |

Serveur :

| Fichier | Rôle |
| --- | --- |
| `supabase/functions/multipay-checkout/` | crée la commande, calcule le montant, pousse ou renvoie l'URL |
| `supabase/functions/multipay-pay/` | rail poussée wallet |
| `supabase/functions/multipay-return/` | revérifie chez Interswitch et **accorde** le droit |
| `supabase/functions/multipay-webhook/` | notification asynchrone MultiPay |
| `supabase/migrations/052_free_mode.sql` | **la désactivation côté base** |
| `supabase/rollback/052_free_mode_rollback.sql` | **le retour arrière**, hors de `migrations/` pour ne jamais être appliqué par `db push` |

Portail web (`apps/web/`) : `payer.html`, `paiement-retour.html`,
`inline-checkout.js` — laissés en ligne, plus rien ne pointe dessus depuis
l'app. `index.html` et `faq.html` **annoncent encore les tarifs** : à corriger
au moment de la communication publique (voir §16).

### 6. Composants concernés

`CoinPill` et `InsufficientCoinsModal` (`components/coins.tsx`), le badge de
coût du bouton DM (`Discover`), la ligne de coût de `DirectMessageModal`, le
`CostBadge` et la barre « Payer X pièces » de `SearchPreferences`, la pastille
de coût du like en retour (`Activity` + `ProfileDetailModal.likeCost`), la
carte promo « Plus de pièces » et l'entrée de menu « Mon portefeuille »
(`ProfileHome`), le tunnel de paiement d'entrée en soirée (`Scan`).

### 7. Services / API concernés

`initiateMobileMoneyPayment`, `getPaymentStatus`, `cancelPayment`,
`waitForPaymentSettlement` (`services/payments.ts`) — toutes court-circuitées
en tête de fonction, corps intact.

RPC Postgres du rail : `get_wallet`, `debit_coins`, `credit_coins`,
`credit_incognito`, `grant_event_access`, `like_back`, `send_direct_message`,
`update_search_filters`, `set_incognito`, `scan_event`, `economy_value`,
`multipay_config`.

### 8. Variables d'environnement concernées

Aucune variable client n'est liée au paiement (`.env.example` ne contient que
`EXPO_PUBLIC_SUPABASE_URL` et `EXPO_PUBLIC_SUPABASE_KEY`).

Côté Edge Functions, la configuration marchand est lue d'abord dans
l'environnement (`supabase secrets set`), à défaut dans le coffre Vault
(migration 051, fonction `public.multipay_config()` réservée au `service_role`) :

`MULTIPAY_MODE`, `MULTIPAY_MERCHANT_CODE`, `MULTIPAY_PAY_ITEM_ID`,
`MULTIPAY_CLIENT_ID`, `MULTIPAY_SECRET_KEY`, `MULTIPAY_WALLET_PUSH`,
`MULTIPAY_WEB_BASE`.

**Ne rien effacer.** Aucun de ces secrets n'a été touché : ils dorment, ils ne
sont plus sollicités.

### 9. Tables / base de données concernées

`economy_config` (source de vérité des coûts), `economy_config_paid_backup`
(**créée par 052, porte les prix d'avant, ne pas supprimer**), `coin_wallets`,
`coin_transactions`, `coin_rewards`, `entitlements` (`incognito_until`),
`payment_orders`, `events.price_cdf`.

Aucune table n'a été supprimée, aucune colonne retirée, aucun solde modifié.

### 10. Produits / abonnements prévus

Voir le tableau du §3. Les identifiants techniques font foi côté serveur et
dans les webhooks : packs `decouverte`, `elan`, `envol`, `prestige` ;
forfaits Incognito `3m`, `6m`, `12m`. Ils restent définis dans
`config/economy.ts`, inchangés.

### 11. Comment le paiement a été désactivé

**Client** — une constante, `PAYMENTS_ENABLED = false` dans
`apps/mobile/src/config/features.ts`. Elle :

1. redirige vers l'accueil les 10 routes du rail monétaire (les écrans
   eux-mêmes n'ont pas été touchés : les fichiers `app/*.tsx` sont passés d'un
   `export { default } from ...` à un composant qui redirige) ;
2. masque tout affichage de prix, de solde et de coût ;
3. fait retourner `unavailable` / `unknown` aux fonctions de
   `services/payments.ts` **avant tout appel réseau** ;
4. ouvre le code secret à tout le monde (`AppLock`) ;
5. remplace le renvoi vers l'offre Incognito par un message neutre quand le
   serveur refuse encore ;
6. présente une entrée en soirée tarifée comme réglable auprès de
   l'organisateur au lieu d'ouvrir un tunnel de paiement.

**Serveur** — migration `052_free_mode.sql` : drapeau
`economy_config.free_mode = 1`, tous les coûts en pièces à 0, quota de DM
offerts porté à 100 000, `debit_coins()` qui ne journalise plus un débit nul,
`set_incognito()` qui accorde l'incognito quand `free_mode = 1`.

### 12. Comment le réactiver proprement

1. Jouer `supabase/rollback/052_free_mode_rollback.sql` sur la base (il
   restitue les prix depuis `economy_config_paid_backup` et les deux fonctions
   dans leur version d'origine).
2. Passer `PAYMENTS_ENABLED` à `true` dans
   `apps/mobile/src/config/features.ts`.
3. Vérifier que les secrets `MULTIPAY_*` sont toujours en place (environnement
   ou Vault) et que `MULTIPAY_MODE` vaut bien ce qu'on veut (`TEST` d'abord).
4. Publier une nouvelle version du client.
5. Dérouler les tests du §16.

**Dans cet ordre** : la base d'abord, le client ensuite. L'inverse laisserait
des clients gratuits face à une base qui facture de nouveau.

Rien d'autre n'est à réécrire : aucun écran, aucun service, aucune fonction
Edge n'a été supprimé ni modifié dans sa logique.

### 13. Ce qu'il ne faut surtout pas supprimer

- `apps/mobile/src/config/economy.ts` — grilles, packs, forfaits, opérateurs.
- Les dossiers d'écrans `Recharge`, `Incognito`, `PaymentMethods`,
  `MobileMoney`, `Checkout`, `CheckoutReturn`, `Wallet`, `Transactions`,
  `Rewards`, `Referral`.
- `apps/mobile/src/services/payments.ts` et `components/PaymentResultToast.tsx`.
- Les quatre fonctions Edge `multipay-*` et leurs secrets.
- La table `public.economy_config_paid_backup` — sans elle, le retour arrière
  perd la grille exacte.
- `supabase/rollback/052_free_mode_rollback.sql`.
- Les migrations 009, 019, 027, 029, 032, 035, 048, 051 (elles portent tout le
  schéma monétaire).
- Les pages `apps/web/payer.html` et `paiement-retour.html`.

### 14. Dépendances à conserver

`expo-web-browser` (ouverture du tunnel de paiement), `expo-linking` (retour
`dowe://checkout-return`), `@supabase/supabase-js` (`functions.invoke`).
Aucune n'est exclusive au paiement, aucune n'a été retirée du `package.json`.

Le SDK RevenueCat n'est pas encore installé : ne pas l'ajouter tant que le
rail IAP n'est pas réellement entrepris.

### 15. Apple In-App Purchase — modifications nécessaires

Le rail des stores n'a jamais été branché. À la réactivation, s'il s'agit de
vendre depuis iOS/Android :

- Les pièces et l'abonnement Incognito sont du **contenu numérique consommé
  dans l'app** : Apple impose l'IAP, un rail Mobile Money seul y est refusé
  (App Store Review Guidelines 3.1.1). Le Mobile Money reste légitime pour
  l'**entrée en soirée** (bien physique / service hors app, 3.1.3(e)) et pour
  un achat fait depuis le portail web.
- Prévoir : déclaration des produits dans App Store Connect avec les mêmes
  identifiants (`decouverte`, `elan`, `envol`, `prestige`, `3m`, `6m`, `12m`),
  intégration RevenueCat, webhook RevenueCat vers une fonction Edge qui appelle
  `credit_coins()` / `credit_incognito()` — exactement le rôle que tient
  `multipay-return` aujourd'hui.
- Le bouton « Restaurer mes achats » est obligatoire côté iOS.
- L'abonnement Incognito est vendu sans reconduction automatique : le déclarer
  en non-renouvelable, ou basculer sur du renouvelable et ajuster la promesse
  affichée dans `screens/Incognito/`.

### 16. Tests à effectuer après réactivation

Base :

1. `select key, value from public.economy_config order by key;` — la grille
   payante est revenue, `free_mode` vaut 0.
2. `set_incognito(true)` depuis un compte sans abonnement — renvoie
   `subscription_required`.
3. Un like en retour avec solde insuffisant — renvoie `insufficient_coins`,
   rien n'est débité.
4. Un like en retour avec solde suffisant — une ligne dans
   `coin_transactions`, solde décrémenté du bon montant.

Client :

5. Le solde réapparaît dans Rencontres et dans Profil ; `/recharge`,
   `/incognito`, `/(tabs)/profile/wallet` s'ouvrent au lieu de rediriger.
6. Les badges de coût reviennent : bouton DM, filtres de recherche, like en
   retour.
7. Achat d'un pack en `MULTIPAY_MODE=TEST` de bout en bout : commande créée,
   page de paiement, retour `dowe://checkout-return`, solde crédité **une
   seule fois** (idempotence).
8. Fermeture du navigateur en cours de paiement : la commande **reste
   `pending`**, elle n'est pas annulée (régression connue, voir le commentaire
   de `cancelPayment` dans `services/payments.ts`).
9. Achat d'un forfait Incognito : `entitlements.incognito_until` prolongé, pas
   écrasé, si un abonnement courait déjà.
10. Scan d'une soirée avec `price_cdf > 0` : le tunnel de paiement s'ouvre,
    l'accès n'est posé qu'après validation serveur ; re-scanner après paiement
    est gratuit.
11. Webhook MultiPay reçu deux fois : un seul crédit.
12. Une fois seulement le rail vérifié en TEST, passer `MULTIPAY_MODE=LIVE` et
    refaire un achat réel du plus petit pack.

### 17. Points restés ouverts

- `apps/web/index.html` et `apps/web/faq.html` annoncent toujours les tarifs
  des packs et de l'Incognito. À aligner sur la gratuité avant toute
  communication publique — ce sont des pages publiques, la décision est
  éditoriale.
- La limite quotidienne de likes des comptes non vérifiés (30) subsiste : elle
  se lève par la vérification du profil, qui est gratuite. Ce n'est pas un mur
  de paiement, elle a donc été conservée volontairement.
- Les soirées dont `events.price_cdf > 0` restent tarifées en base : mettre ces
  prix à 0 au backoffice si l'entrée doit être libre pendant la période
  gratuite.
