# Zola — consignes de travail

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

Portail web (`apps/web/public/` depuis le passage à Astro du 22/11/2026) :
`payer.html`, `paiement-retour.html`, et `inline-checkout.js` à la racine du dépôt — laissés en ligne, plus rien ne pointe dessus depuis
l'app. `index.html`, `faq.html` et `conseils.html` (sources dans
`apps/web/src/pages/*.astro`) ont été alignés sur la
gratuité le 15/09/2026 (aucun tarif affiché ; le bloc « Gratuit au lancement »
de l'accueil a été retiré le 22/11/2026) : à la
réactivation, y remettre la grille de `config/economy.ts`.

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

**Exception, depuis le 25/11/2026 : l'entrée payante en soirée.** Une
seconde constante, `EVENT_PAYMENTS_ENABLED = true` (même fichier), rouvre le
seul rail des soirées. Au scan d'une soirée avec `price_cdf > 0`, l'écran Scan
crée la commande (`multipay-checkout`, kind `event`, sans opérateur ni numéro)
et ouvre la page `https://zola-rdc.com/payer` dans le navigateur : Mobile
Money ou carte, sur la page Interswitch. L'accès n'est accordé que par
`multipay-return` après revérification, la chaîne de confiance est inchangée.
C'est un service hors app (une place à une soirée réelle), donc hors IAP.
Mode serveur au moment de l'activation : `MULTIPAY_MODE = TEST`,
`MULTIPAY_WALLET_PUSH = OFF`. Passer en LIVE est une décision à prendre à part,
après un achat de bout en bout en TEST (§16, test 10). Pièces et Incognito
restent gratuits et masqués.

**Serveur** — migration `052_free_mode.sql` : drapeau
`economy_config.free_mode = 1`, tous les coûts en pièces à 0, quota de DM
offerts porté à 100 000, `debit_coins()` qui ne journalise plus un débit nul,
`set_incognito()` qui accorde l'incognito quand `free_mode = 1`.

### 12. Comment le réactiver proprement

1. Vérifier que la migration `055_incognito_expiry.sql` est en base (elle est
   dormante tant que `free_mode` vaut 1, voir §18).
2. Jouer `supabase/rollback/052_free_mode_rollback.sql` sur la base (il
   restitue les prix depuis `economy_config_paid_backup` et les deux fonctions
   dans leur version d'origine).
3. Jouer `supabase/rollback/incognito_grace_period.sql` juste après : 21 jours
   d'incognito offerts aux comptes passés incognito pendant la gratuité (§18).
4. Passer `PAYMENTS_ENABLED` à `true` dans
   `apps/mobile/src/config/features.ts`.
5. Vérifier que les secrets `MULTIPAY_*` sont toujours en place (environnement
   ou Vault) et que `MULTIPAY_MODE` vaut bien ce qu'on veut (`TEST` d'abord).
6. Vérifier que la fonction Edge `send-push` déployée connaît les types
   `incognito_ending` et `incognito_ended` (ajoutés le 14/09/2026 dans
   `supabase/functions/send-push/index.ts`) ; la redéployer sinon.
7. Publier une nouvelle version du client.
8. Dérouler les tests du §16.

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
- `supabase/rollback/052_free_mode_rollback.sql` et
  `supabase/rollback/incognito_grace_period.sql`.
- Les migrations 009, 019, 027, 029, 032, 035, 048, 051, 055 (elles portent
  tout le schéma monétaire).
- La migration `060_multipay_checkout_idempotency.sql` (une clé stable par
   tentative de paiement, unique par utilisateur).
- La migration `059_revenuecat_purchases.sql` et la fonction Edge
   `revenuecat-webhook` (crédit IAP idempotent).
- Les pages `apps/web/public/payer.html` et `paiement-retour.html` (servies telles quelles par Astro).

### 14. Dépendances à conserver

`expo-web-browser` (ouverture du tunnel de paiement), `expo-linking` (retour
`zola://checkout-return`), `@supabase/supabase-js` (`functions.invoke`).
Aucune n'est exclusive au paiement, aucune n'a été retirée du `package.json`.
Le SDK `react-native-purchases` et `expo-dev-client` sont maintenant installés.
Le service `apps/mobile/src/services/revenuecat.ts` identifie le client avec
son UUID Supabase, lit les packages du Offering courant, achète via le store et
expose la restauration. Les prix affichés sur mobile viennent du store; les
pièces achetées via Apple/Google ne sont pas périssables.

### 15. Apple In-App Purchase — modifications nécessaires

Le SDK et le traitement serveur sont intégrés, mais le rail n'est pas prêt à
vendre. État au 03/11/2026 : RevenueCat contient le projet `Zola rdc`
(`proj46bcb2de`) et l'app iOS `Zola iOS` (`app440f7507d6`, bundle
`com.zola.app`). La clé publique iOS est dans le profil EAS production. Les
identifiants App Store Connect ne sont pas configurés; aucun produit,
entitlement, Offering ou webhook n'existe encore. L'app Android RevenueCat
n'est pas créée.

- Les pièces et Incognito sont du **contenu numérique consommé dans l'app** :
   Apple impose l'IAP sur iOS (App Store Review Guidelines 3.1.1). Google Play
   Billing doit également être utilisé sur Android. Ne pas proposer MultiPay
   pour ces achats dans les apps natives; le rail MultiPay des entrées en
   soirée reste distinct.
- Dans App Store Connect, créer les packs comme consommables (`decouverte`,
   `elan`, `envol`, `prestige`) et Incognito comme achats non renouvelables
   (`3m`, `6m`, `12m`), conformément aux promesses affichées. Les connecter à
   RevenueCat, créer l'Offering courant et ses packages. Les clés App Store
   Connect doivent être ajoutées dans le dashboard RevenueCat, pas dans le
   client ni dans le dépôt.
- Déployer `supabase/functions/revenuecat-webhook` après avoir appliqué
   `059_revenuecat_purchases.sql`. Configurer `REVENUECAT_WEBHOOK_AUTH` comme
   secret Edge Function et le même Bearer token dans l'intégration webhook
   RevenueCat. La fonction appelle `credit_revenuecat_purchase()`, qui valide
   uniquement les SKU connus, refuse le crédit tant que `free_mode` vaut 1 et
   déduplique chaque transaction avant d'appeler `credit_coins()` ou
   `credit_incognito()`.
- Les clés SDK publiques locales utilisent
   `EXPO_PUBLIC_REVENUECAT_IOS_KEY` et
   `EXPO_PUBLIC_REVENUECAT_ANDROID_KEY`. Ne jamais mettre une clé secrète
   RevenueCat ou le token du webhook dans l'app.
- Le bouton « Restaurer mes achats » est présent sur iOS. Tester les achats
   dans un build natif EAS; Expo Go ne fournit pas StoreKit/RevenueCat.
- Pour Android, créer aussi l'app Play Store `com.zolardc.app` dans RevenueCat
   (le package Android diffère du bundle iOS : `com.zola.app` était déjà pris
   sur Google Play),
   configurer Google Play et sa clé publique, puis déclarer les mêmes produits
   et packages avant d'exposer le parcours.

À ce stade, `PAYMENTS_ENABLED` reste `false`, la migration 052 garde `free_mode`
à 1, et la migration 059 n'est pas encore appliquée en production. Ne pas
activer le paiement avant la séquence de réactivation du §12, le déploiement du
webhook et la validation TestFlight/Play Internal Testing.

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
   page de paiement, retour `zola://checkout-return`, solde crédité **une
   seule fois** (idempotence).
   Rejouer deux fois, y compris en parallèle, la requête avec la même clé
   `idempotencyKey` : une seule ligne `payment_orders` et la même référence
   MultiPay doivent être retournées. Une nouvelle tentative après un statut
   final doit utiliser une nouvelle clé.
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
13. Achat sandbox RevenueCat de chaque type de produit : le pack crédite le bon
   solde une seule fois après le webhook; Incognito prolonge
   `entitlements.incognito_until` sans l'écraser.
14. Rejouer le même webhook RevenueCat : aucun double crédit. Vérifier aussi
   qu'un SKU inconnu est ignoré et qu'un achat ne crédite rien tant que
   `free_mode = 1`.
15. Restaurer les achats depuis un second build connecté au même compte Zola;
   confirmer que l'état Incognito et les achats restaurables sont synchronisés.

Période de grâce Incognito (§18) :

16. Après le script de grâce : tout profil `incognito = true` a une ligne
    `entitlements.incognito_until` à J+21 ; un abonnement payé qui courait
    déjà a gardé sa date.
17. Sur un compte de test, forcer `incognito_until = now() + interval '2 days'`
    puis mettre à jour `last_active_at` : un push « bientôt fini » part,
    `incognito_reminded_for` est renseigné, un second `update` ne renvoie
    pas de push.
18. Forcer `incognito_until = now() - interval '1 minute'` puis mettre à jour
    `last_active_at` : `incognito` passe à faux, un push « terminé » part, le
    profil réapparaît dans le fil des autres.
19. Le même test avec `free_mode = 1` ne change rien : le trigger est inerte
    en mode gratuit.

### 17. Points restés ouverts

- Réglé le 15/09/2026 : `apps/web/index.html`, `faq.html` et `conseils.html`
  n'annoncent plus aucun tarif et présentent Zola comme l'app des rencontres
  et des soirées (positionnement du 15/09/2026, voir ARCHITECTURE.md). Les
  pages contractuelles `conditions.html` et `confidentialite.html` décrivent
  encore les pièces et l'abonnement Incognito : décision juridique, non
  touchées.
- La limite quotidienne de likes des comptes non vérifiés (30) subsiste : elle
  se lève par la vérification du profil, qui est gratuite. Ce n'est pas un mur
  de paiement, elle a donc été conservée volontairement.
- Les soirées dont `events.price_cdf > 0` restent tarifées en base : mettre ces
  prix à 0 au backoffice si l'entrée doit être libre pendant la période
  gratuite.

### 18. Incognito : ce que deviennent les comptes gratuits à la réactivation

**Le problème.** Le rollback 052 redemande un abonnement pour *activer*
l'incognito, mais ne touche pas à `profiles.incognito`. Sans rien d'autre, un
compte passé incognito pendant la gratuité resterait invisible indéfiniment,
sans payer, tant qu'il ne coupe pas lui-même le mode.

**La décision (14/09/2026).** Offrir **21 jours** de grâce, prévenir, puis
couper. Pas un mois : trois semaines.

**Les pièces.**

| Pièce | Rôle | Quand |
| --- | --- | --- |
| `supabase/migrations/055_incognito_expiry.sql` | trigger `profiles_incognito_expiry` sur `profiles.last_active_at` : coupe l'incognito échu, envoie les deux push. **Inerte tant que `free_mode = 1`.** | poussée avec les migrations, dès maintenant |
| `supabase/rollback/incognito_grace_period.sql` | pose `incognito_until = now() + 21 jours` sur chaque profil incognito sans abonnement en cours ; rejouable ; refuse de tourner si `free_mode` vaut encore 1 | à la main, le jour J, après le rollback 052 |
| `send-push` types `incognito_ending` / `incognito_ended` | push « bientôt fini » (3 jours avant, une fois par échéance) et « terminé » | déjà dans le code, à redéployer si besoin |
| `ProfileHome` carte Incognito | affiche « Abonnement valable jusqu'au … » dès que `PAYMENTS_ENABLED = true` | rien à faire |

**Pourquoi un trigger et pas pg_cron.** Le projet n'a pas de pg_cron (021,
027) : toutes les expirations sont paresseuses, déclenchées par un passage
naturel. Ici c'est l'ouverture de l'app, qui touche `last_active_at`. Un
compte qui n'ouvre plus l'app reste incognito, ce qui est sans conséquence :
il ne figurerait de toute façon pas en tête d'un fil trié par activité.

**Ce que le trigger ne voit pas, volontairement.** `set_incognito()` et
`admin_grant_incognito()` écrivent `incognito` sans toucher `last_active_at`.
Un achat de forfait (`credit_incognito`) repousse `incognito_until`, le
trigger le lit tel quel à l'ouverture suivante.
