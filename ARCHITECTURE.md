# Zola — Architecture Système

> App de rencontre pour la RDC. Mobile-only (iOS + Android), backend Supabase, landing page sur Vercel.
> Nom provisoire : **Zola** (renommage facile : le nom n'apparaît que dans les configs, jamais en dur dans la logique).

---

## 1. Vue d'ensemble

```
┌─────────────────────┐        ┌──────────────────────────────────────┐
│   App Mobile (Expo)  │        │              SUPABASE                │
│   iOS + Android      │◄──────►│                                      │
│                      │  HTTPS │  ┌────────────┐  ┌───────────────┐  │
│  - expo-router       │        │  │    Auth     │  │   Postgres    │  │
│  - supabase-js       │        │  │ email +     │  │  + RLS        │  │
│  - RevenueCat SDK    │        │  │ Google/Apple│  │  + RPC        │  │
└─────────┬───────────┘        │  └────────────┘  └───────────────┘  │
          │                     │  ┌────────────┐  ┌───────────────┐  │
          │ IAP                 │  │  Realtime   │  │   Storage     │  │
┌─────────▼───────────┐        │  │  (chat)     │  │   (photos)    │  │
│ App Store / Play     │        │  └────────────┘  └───────────────┘  │
│ Billing (RevenueCat) │───────►│  ┌────────────────────────────────┐ │
└─────────────────────┘ webhook│  │ Edge Functions (webhooks, push)│ │
                                │  └────────────────────────────────┘ │
┌─────────────────────┐        └──────────────────────────────────────┘
│  Landing (Vercel)    │
│  1 page + légal      │
└─────────────────────┘
```

**Principe de scaling** : zéro serveur à gérer. Supabase (Postgres managé) tient des millions de lignes sans problème si les indexes et les requêtes sont bons — c'est là que se joue la scalabilité, pas dans le nombre de serveurs. Quand la croissance l'exigera : réplicas de lecture, partitionnement de `swipes` et `messages` (les 2 tables qui explosent en volume), et cache. Rien de tout ça n'est nécessaire au MVP, mais le schéma est conçu pour le permettre sans refonte.

---

## 2. Stack technique

| Couche | Techno | Pourquoi |
|---|---|---|
| Mobile | **Expo SDK (React Native + TypeScript)** | 1 codebase → iOS + Android, OTA updates via EAS Update |
| Navigation | **expo-router** | File-based routing, standard actuel |
| Backend | **Supabase** (projet `sbsxgwdpdjxsrxcccwno`, eu-west-1) | Auth + Postgres + Realtime + Storage + Edge Functions |
| Auth | Supabase Auth : **email/mot de passe + Google + Apple** | Apple exige "Sign in with Apple" si Google est proposé sur iOS |
| Chat temps réel | **Supabase Realtime** (postgres_changes sur `messages`) | Inclus, respecte la RLS, rien à héberger |
| Photos | **Supabase Storage** (bucket `photos`) | Upload direct depuis l'app, CDN inclus |
| Paiement | **RevenueCat** + Apple IAP / Google Play Billing | Obligatoire : les stores imposent l'IAP pour du contenu numérique (pas de mobile money possible dans l'app pour un abonnement) |
| Push | **Expo Push Notifications** | Gratuit, simple (nouveau match, nouveau message) |
| Landing | **HTML/CSS statique** sur **Vercel** | 1 page, la solution la plus simple et la plus rapide qui existe |

---

## 3. Structure de fichiers (monorepo)

```
meet/
├── ARCHITECTURE.md
├── README.md
├── apps/
│   ├── mobile/                    # App Expo
│   │   ├── src/
│   │   │   ├── app/               # expo-router : carte des URL, uniquement
│   │   │   │   │                  #   des re-exports d'une ligne vers screens/
│   │   │   │   ├── _layout.tsx    # → navigation/RootLayout
│   │   │   │   ├── (auth)/        # Non connecté
│   │   │   │   ├── (tabs)/        # Connecté + profil complet
│   │   │   │   ├── chat/[matchId].tsx
│   │   │   │   └── onboarding.tsx, scan.tsx, recharge.tsx, ...
│   │   │   ├── screens/           # UNE page = UN dossier. Point d'entrée du code.
│   │   │   │   ├── Discover/      # Découverte (swipe)
│   │   │   │   │   ├── Discover.tsx        # écran + logique de l'écran
│   │   │   │   │   ├── Discover.styles.ts  # ses styles, et rien d'autre
│   │   │   │   │   ├── SwipeDeck.tsx       # composants propres à cet écran
│   │   │   │   │   └── ProfileCard.tsx
│   │   │   │   ├── Chat/, Matches/, Activity/, ProfileHome/, Wallet/,
│   │   │   │   ├── Transactions/, Settings/, SearchPreferences/, Scan/,
│   │   │   │   ├── Onboarding/, Welcome/, SignIn/, Rewards/, ... (30 écrans)
│   │   │   ├── navigation/        # RootLayout (providers + Stack), TabsLayout
│   │   │   │                      #   (barre d'onglets), AuthLayout, ProfileLayout
│   │   │   ├── services/          # api.ts (RPC + queries), supabase.ts,
│   │   │   │                      #   payments.ts, notifications.ts, photoPicker.ts
│   │   │   ├── providers/         # Contextes React : auth, wallet, applock
│   │   │   ├── hooks/             # Hooks réutilisables (useKeyboardInset)
│   │   │   ├── components/        # Partagés par PLUSIEURS écrans, uniquement :
│   │   │   │                      #   ui, motion, coins, brand, mascot, ZolaLogo,
│   │   │   │                      #   ProfileDetailModal, DirectMessageModal...
│   │   │   ├── utils/             # cache, cityGeo, haptics, preload, partySignal
│   │   │   ├── config/            # economy.ts (prix, packs), support.ts
│   │   │   ├── theme.ts           # Jetons Velours : couleurs, espacements, ombres
│   │   │   └── types.ts           # Types partagés (profil, message, transaction)
│   │   ├── app.json               # Config Expo (nom, icônes, bundle id)
│   │   ├── eas.json               # Build/submit stores
│   │   └── package.json
│   └── web/                       # Landing page → Vercel
│       ├── index.html             # La page unique style Heyama
│       ├── confidentialite.html   # Politique de confidentialité (exigée par les stores)
│       ├── conditions.html        # CGU
│       ├── contact.html
│       └── vercel.json
└── supabase/
    └── migrations/                # Copie locale des migrations appliquées
```

---

## 4. Schéma de base de données

Toutes les tables sont protégées par **RLS** (Row Level Security) : un utilisateur ne voit que ce qu'il a le droit de voir, même si le client est compromis. Les écritures sensibles (swipe, match) passent par des **fonctions RPC** côté Postgres — jamais d'insertion directe depuis le client.

```
auth.users (géré par Supabase)
    │ 1:1
    ▼
profiles ──── city_id ───► cities (seed : villes RDC)
         (public_id DW-XXXXXX : identifiant visible, unique, immuable — migration 043.
          L'UUID reste la clé interne et ne s'affiche plus nulle part ; le backoffice
          cherche et affiche le DW-, l'app mobile ne montre aucun identifiant.)
    │ 1:N
    ▼
photos (storage_path → bucket "photos")

swipes  (swiper_id, target_id, liked)          ← volume énorme, index critiques
matches (user_a < user_b, unique)              ← + status pending/active, origin swipe/dm, initiated_by
messages (match_id, sender_id, content)        ← realtime activé ; kind text/audio + audio_path (bucket "voice")
blocks  (blocker_id, blocked_id)
reports (reporter_id, reported_id, reason)
entitlements (user_id, incognito_until)           ← abonnement Incognito, webhook uniquement
events (name, price_cdf, qr_token, is_active, ends_at) ← soirées, créées au backoffice
event_attendees (event_id, user_id)            ← qui a scanné ; l'accès, posé une seule fois
event_swipes (event_id, swiper_id, target_id, liked) ← décisions prises DANS la soirée ; effacées à sa fin (056)
inbound_mail (category, status, source, from, subject, body_preview) ← courrier des boîtes du domaine, poussé par le webhook Hostinger (057, 058), et formulaire de contact du site (062, source = 'site')
push_tokens (user_id, token)

economy_config (key, value)                    ← coûts de l'économie de coins (source de vérité)
coin_wallets (user_id, balance, free_dms_used) ← solde interne (pas de blockchain)
             (expiring_balance, expiring_at)   ← part périssable du solde (pack DIAMOND, 30 j)
coin_transactions (user_id, amount, kind)      ← welcome/recharge/like_back/dm/event/filter/admin/reward/expire
coin_rewards (user_id, kind, ref_user_id)      ← primes déjà versées ; index unique = une seule fois
profile_views (viewer_id, viewed_id, viewed_at)← onglet Vues ; une ligne par couple, dernière visite

admin_users (user_id, role, is_active)         ← équipe du backoffice : owner / admin / moderator
moderation_actions (actor, action, target...)  ← journal d'audit, en lecture seule
user_sanctions (user_id, kind, reason, ...)    ← avertissement / shadowban / suspension / ban
user_notes (user_id, author_id, body)          ← notes internes sur un compte
verification_requests (user_id, selfie_path,   ← vérification de profil : selfie + geste
  gesture, status)                                tiré au sort, bucket privé "verifications"
```

**Signalement et vérification : l'application produit, le backoffice décide.** Un
signalement ne peut naître que dans l'app mobile (`reports`, insert RLS limité à son
auteur) ; un trigger serveur fixe la gravité et ne retient la conversation jointe que si le
déclarant en fait partie. Une demande de vérification part de l'app avec un selfie déposé
dans un bucket privé, et seul un administrateur peut la trancher. Dans les deux cas le
backoffice ne crée rien : il lit, décide, et laisse une trace.

Points de conception importants :
- **`matches (user_a < user_b)`** : la paire est stockée ordonnée + contrainte unique → impossible d'avoir un match en double, et une seule ligne à chercher.
- **Le match est créé par la fonction `swipe()`**, atomiquement, dans la même transaction que le like. Pas de race condition possible.
- **Limite de likes quotidienne** (30/jour pour les gratuits) vérifiée dans `swipe()` côté serveur — impossible à contourner depuis le client.
- **Âge ≥ 18 ans** : contrainte SQL sur `birth_date`, en plus de la validation dans l'app.
- **Modération** : `is_banned` sur le profil (exclu du feed instantanément), `reports` consultable depuis le dashboard Supabase au début.

## 5. API (endpoints)

Supabase expose automatiquement l'API REST (PostgREST) filtrée par la RLS. Les opérations métier passent par des RPC :

| Endpoint | Type | Description |
|---|---|---|
| `POST /auth/v1/signup`, `/token`, OAuth Google/Apple | Auth | Géré par Supabase Auth |
| `rpc/get_discovery_feed` | RPC | Candidats : même ville, préférences croisées, jamais swipés, non bloqués, non bannis |
| `rpc/swipe(target_id, liked)` | RPC | Enregistre le swipe, applique le quota de likes (illimité si profil vérifié), crée le match si mutuel → retourne `match_id` |
| `rpc/get_my_matches` | RPC | Matchs actifs + dernier message + compteur non-lus |
| `rpc/get_likers` | RPC | Qui m'a liké — profils en clair, ouvert à tous (le paywall est le like retour) |
| `rpc/like_back(target_id)` | RPC | Liker en retour depuis "J'aime" — débite des coins, crée le match |
| `rpc/send_direct_message(target_id, content)` | RPC | DM sans match — quota gratuit puis coins, payé par l'initiateur ; crée un match `pending` activé quand le destinataire répond (trigger) |
| `rpc/get_passed_profiles` | RPC | Historique des profils passés (re-likables gratuitement) |
| `rpc/hide_passed_profile(target_id)` | RPC | Retire une entrée de l'historique (sans la remettre dans le feed) |
| `rpc/like_from_history(target_id)` | RPC | Re-liker un profil passé — gratuit, même quota de likes |
| `rpc/get_wallet` | RPC | Solde + paramètres de l'économie (coûts, quota DM, likes restants) |
| `rpc/find_user_by_public_id` | RPC | Identifiant DW-XXXXXX → user_id (RLS : bannis et bloqués introuvables). Disponible côté serveur, pas encore branché dans l'app — l'identifiant se gère au backoffice |
| `rpc/mark_messages_read(match_id)` | RPC | Marque la conversation comme lue |
| `rpc/unmatch(match_id)` | RPC | Désactive le match |
| `rpc/block_user(target_id)` | RPC | Bloque + désactive le match éventuel |
| `rpc/delete_my_account()` | RPC | Suppression complète (exigence Apple) |
| `GET/PATCH /rest/v1/profiles` | REST | Lire/modifier son profil (RLS) |
| `POST /rest/v1/reports` | REST | Signaler un utilisateur (RLS) |
| `POST /rest/v1/push_tokens` | REST | Enregistrer le token push (RLS) |
| `storage/v1/object/photos/{user_id}/…` | Storage | Upload photos (policy : son propre dossier uniquement) |
| Realtime `messages` + `matches` | WS | Nouveaux messages / nouveaux matchs en direct |
| `functions/v1/revenuecat-webhook` | Edge Fn | RevenueCat → met à jour `entitlements` (plus tard) |

## 6. Monétisation

- **Gratuit** : chat illimité avec ses matchs, 5 DM offerts (au total), et les likes — illimités pour un compte vérifié, 30/jour sinon.
- **Le like illimité s'obtient par la vérification, pas par l'argent** (migration 033). Un compte vérifié like sans limite ; un compte non vérifié consomme un quota quotidien (`economy_config.free_daily_likes`, 30). C'est le seul levier produit qui paie deux fois : la contrainte pousse vers la vérification, donc vers moins de faux profils, alors qu'un quota levé contre paiement laissait les faux profils intacts et faisait payer les vrais. `like_quota()` est le seul endroit qui tranche, et `swipe()`, `like_from_history()` et `get_wallet()` l'appellent : l'app ne peut pas afficher un quota différent de celui qui est appliqué. `is_verified` n'est écrit que par `admin_review_verification()`, donc la règle ne se contourne pas depuis le client.
- **Économie de pièces** (nom d'affichage "pièce" — simple solde en base, aucune blockchain) :
  - Échelle calée sur le marché local : un DM coûte 200 pièces, comme chez le concurrent de référence. Migration 027 (×40 sur tous les coûts et soldes) : comparer un tarif Zola à un tarif concurrent se fait toujours à coût d'action égal, jamais au prix affiché du pack.
  - Liker en retour depuis "J'aime" : 400 pièces. Les profils qui m'ont liké sont visibles en clair mais retirés du feed Découvrir — la conversation passe obligatoirement par cette dépense.
  - Premier message sans match (DM depuis Découvrir) : 200 pièces après le quota gratuit. C'est celui qui écrit en premier qui paie ; répondre est gratuit et crée le match.
  - Coûts centralisés dans `economy_config` (serveur) + `src/config/economy.ts` (affichage). Bonus de bienvenue : 400 pièces.
  - Packs : Découverte 800 / Élan 3 000 / Envol 6 500 / Prestige 20 000 pièces à 4 300 / 12 900 / 21 500 / 42 900 CDF, soit 10 % sous le concurrent à quantité égale. Montants faisant foi dans `supabase/functions/multipay-checkout`. Les identifiants techniques suivent les noms commerciaux (`decouverte`/`elan`/`envol`/`prestige`) : ils circulent dans les webhooks, un identifiant qui ne correspond plus à l'offre affichée est un piège au rapprochement des paiements.
  - Il n'existe pas de montant sur mesure. Le « Montant Événement » a disparu avec la migration 035 : il ne servait qu'à compléter son solde avant une entrée en soirée, et l'entrée ne se paie plus en pièces.
  - Récompenses (migration 028) : compte vérifié 400, partage de l'app 200, filleul vérifié 600. Le parrainage n'est jamais réclamable à la main — un trigger crédite le parrain quand le filleul passe `is_verified`, et la vérification est revue par un humain, ce qui coupe le farming de comptes vides. Chaque prime est rendue unique par un index sur `coin_rewards`.
  - Pièces périssables : le pack Prestige expire après 30 jours (`pack_prestige_days`). `balance` reste le solde total, `expiring_balance` en est la part périssable, dépensée en premier. Expiration balayée paresseusement par `expire_coins()` à chaque lecture ou débit, sans pg_cron.
  - Recharge : écran en place, crédit du solde via webhook (Mobile Money MultiPay, IAP RevenueCat) appelant `credit_coins()` — jamais par le client.
- **Entrée en soirée** (migration 035) : elle se paie **en francs, pas en pièces**. Une soirée est un lieu physique et son entrée un service consommé hors de l'application : c'est la seule chose vendue par Zola qui échappe légitimement à l'achat intégré des stores, et la faire passer par une monnaie interne l'y aurait ramenée. Le prix est fixé au backoffice (`events.price_cdf`). Scanner le QR appelle `scan_event()`, qui ne débite rien : elle valide le code et renvoie `invalid`, `ok` (déjà sur la liste, ou entrée libre) ou `payment_required` avec le prix. L'app ouvre alors le portail MultiPay, et c'est `multipay-return` qui pose l'accès via `grant_event_access()` après vérification de la transaction chez Interswitch. Le prix n'est jamais envoyé par le client : `multipay-checkout` le relit dans `events`, refuse une soirée fermée et refuse de facturer deux fois quelqu'un qui est déjà sur la liste. Ré-entrée toujours gratuite (`event_attendees` a la paire pour clé primaire).
- **Soirée : le paquet des présents** (migrations 016 et 056, décision produit du 15/09/2026). La soirée est le produit central : un compte Zola est un passe, et une fois entré, l'onglet Rencontres sert le même paquet de cartes, limité aux personnes qui ont scanné. Un seul profil, celui qu'on a déjà : pas de « mode pro », pas de contexte par événement, chacun voit tout le monde quelle que soit sa raison d'être sur l'app. **Deux univers qui ne se parlent pas.** Un recalage fait en soirée va dans `event_swipes` (via `event_swipe()`), jamais dans `swipes` : il ne touche pas au fil Rencontres, et un profil passé dans Rencontres réapparaît dans le paquet de la soirée. **Le like est une relation, il survit** : il est recopié dans `swipes`, peut devenir un match, et la personne le retrouve dans Activité > Likes. **L'historique de soirée est temporaire** (`get_event_passed()`, se raviser par `event_like_from_history()`) : il s'efface quand la soirée se termine, à l'heure programmée (`ends_at`) ou par « Mettre fin à l'accès » au backoffice. La purge suit les deux chemins, trigger `events_purge_swipes` sur `events` et balayage paresseux dans `get_my_events()` à chaque ouverture de l'app, pas de pg_cron. Prolonger une soirée ouverte ne purge rien ; rouvrir une soirée fermée ne ressuscite rien. Le bilan par soirée (`admin_event_stats()`) compte entrées, likes et matchs nés entre participants pendant la fenêtre de la soirée, et reste lisible après la purge puisqu'il lit `swipes` et `matches`.
- **Courrier du domaine au backoffice** (migrations 057 et 058, fonction Edge `hostinger-mail-webhook`, 15/09/2026). Les boîtes support@, contact@, partenaires@ et securite@ sont chez Hostinger, dont l'API Mail sait appeler une adresse web à chaque message reçu (webhook `message.received`, créé sur la boîte support@, id `01a0a5d3-4be8-71a6-b4f9-3bd3513e5dea`). La fonction Edge vérifie le secret du webhook (`Authorization: Bearer`, comparaison en temps constant, secret dans Vault sous `HOSTINGER_MAIL_WEBHOOK_SECRET`, lu par `mail_webhook_config()`), normalise la notification et appelle `record_inbound_mail()`, qui classe le message d'après l'adresse de destination (partenaires, securite, contact, support, waitlist_reply) et journalise dans `moderation_actions` tout message reçu sur securite@. Format réel de la notification, constaté à l'envoi de test : `{ id, event, timestamp, data: { mailboxAddress, from, to[], cc[], date, subject, messageId, plainBody, htmlBody, bodyUrl, attachments } }`. On garde un extrait de 2 000 caractères du texte, pas le HTML. Dédoublonnage par `messageId`. L'onglet Courrier du backoffice liste la file, avec un bouton Répondre qui ouvre la messagerie déjà adressée, et un marquage traité avec note. Si les trois autres adresses sont des boîtes séparées et non des redirections vers support@, il faut créer un webhook par boîte avec le même URL et ranger chaque secret dans Vault sous un nom `HOSTINGER_MAIL_*` (la fonction ne compare pour l'instant qu'au secret unique).
- **Formulaire de contact du site** (migration 062, 24/11/2026). La page `/contact` commence par un formulaire où l'on choisit son besoin (soirée ou partenariat, souci de compte, signalement, sécurité d'un enfant, données personnelles, presse, autre) ; chaque besoin affiche ses champs propres. L'envoi appelle la RPC publique `submit_contact_form()`, qui range le message dans `inbound_mail` avec `source = 'site'`, dans la catégorie qu'aurait eue un e-mail à l'adresse du sujet : il apparaît donc dans l'onglet Courrier (mention « Via le formulaire du site »), et un message sécurité des enfants est journalisé comme un e-mail à securite@. Garde-fous en base, la fonction étant ouverte à `anon` : sujet en liste fermée, e-mail valide, message de 10 à 4 000 caractères, champ piège `p_website` (rempli = robot, réponse « ok » sans enregistrement), 3 envois par adresse et par heure, 60 par 10 minutes au total. Le lien `/contact#partenaires` ouvre le formulaire avec le besoin partenariat déjà choisi. Aucun e-mail n'est envoyé à l'équipe à la réception : la file du backoffice fait foi.
- **Incognito** (abonnement 3 / 6 / 12 mois, migrations 029 et 030) : 107 500 / 172 000 / 279 000 CDF. Le profil sort du fil Rencontres **et du fil soirée** (`get_event_feed`), sa dernière activité n'est plus exposée, ses visites ne sont pas enregistrées dans les Vues des autres, et il débloque le verrou par code secret. L'invisibilité vaut partout, soirée comprise : un abonné qui redevient visible en scannant un QR, c'est la promesse vendue qui saute, dans un lieu physique en plus.
- **Vues** (migration 030) : qui a ouvert mon profil dans les dernières 24 h. Consultation ouverte à tous, comme « Likes » — le paywall reste l'action, pas le regard. `record_profile_view()` est appelée à l'ouverture d'une fiche et n'écrit rien si le visiteur est en incognito.
- **Vérification de profil** (migrations 024 et 031) : selfie reproduisant un geste **tiré au sort par le serveur** et assigné au compte (`verification_challenges`). Le geste est stable tant que la demande n'est pas tranchée, et retiré au sort après un refus. L'app ne le choisit pas et ne peut pas le rejouer : relancer l'application pour tomber sur un geste dont on possède déjà une photo ne marche pas. Huit gestes possibles, catalogue serveur dans `draw_gesture()`. Relance `VerifyPrompt` une fois par ouverture d'application tant que le compte n'est pas vérifié.
- **Signalement et blocage** : accessibles depuis n'importe quelle fiche profil (`ProfileDetailModal`), y compris sans match — le paywall n'est jamais la sécurité. `block_user()` rend l'invisibilité mutuelle et ferme la conversation ; le signalement bloque aussi, et la personne signalée n'en est jamais informée. Le backoffice ne crée pas de signalements, il ne fait que les traiter.
- **Matière et mouvement** (`components/motion.tsx`) : `Reveal` (entrée décalée 40 ms), `PressableScale` (ressort à l'appui), `CountUp` (compteur en courbe sortante), `GlassSurface` (flou réel). Le flou n'habille que les barres flottantes et les calques de modale, jamais les cartes statiques : sur Android il exige `experimentalBlurMethod` et reste expérimental côté performances.
- **Code secret** (`providers/applock.tsx`) : verrou local à quatre chiffres, code rangé dans le trousseau système via expo-secure-store, jamais envoyé au serveur. Protège contre quelqu'un qui prend le téléphone en main, **ne chiffre rien** — c'est écrit tel quel dans l'écran de réglage. `entitlements.incognito_until` porte le droit ; le client ne peut plus écrire `profiles.incognito`, il passe par `set_incognito()` qui exige un abonnement en cours. Couper l'incognito reste toujours autorisé. Crédit par `credit_incognito()`, webhook uniquement, un rachat prolonge l'échéance.
- **Parcours d'achat** : offre (`/recharge` ou `/incognito`) → moyens de paiement → numéro Mobile Money → **résumé de l'achat** (`/checkout`, dernier écran avant débit, avec accès au support WhatsApp) → MultiPay. Les écrans de paiement manipulent un `Purchase` normalisé et ne font pas la différence entre un pack de pièces et un abonnement. L'entrée en soirée ne passe pas par là : tout tient sur l'écran Scanner, où le prix, le choix de l'opérateur et la saisie du numéro sont réunis avant l'ouverture du portail. `apps/web/payer.html` omet `cust_mobile_no` plutôt que de l'envoyer vide.

  **Deux rails de paiement, dans cet ordre.** L'app a déjà fait choisir l'opérateur et saisir le numéro : rouvrir une page web qui redemande « carte ou mobile money » est une étape morte. En LIVE, `multipay-checkout` appelle donc l'API Wallet Payments (`mobile-wallet/initialize`, authentifiée par OAuth `client_credentials` sur `passport.interswitchng.com`) et l'opérateur pousse la demande de confirmation directement sur le téléphone : **aucun navigateur ne s'ouvre**, l'app affiche « Confirme sur ton téléphone » et sonde `multipay-return`. Le rail navigateur (`/payer`) reste le repli si la poussée échoue, et l'unique rail du mode TEST — la simulation d'approbation y repose sur le marqueur `done=1` que seule cette page pose. Format du numéro : MultiPay attend le **national nu**, `0827241919` saisi devient `827241919` envoyé, sans indicatif ni zéro (constaté sur le compte marchand réel, la doc montre pourtant un exemple avec indicatif). Correspondance des opérateurs : `airtel`→`AIRTELMONEY`, `orange`→`ORANGE`, `vodacom`→`MPESA`.

  **Notification serveur à serveur** (`multipay-webhook`, à déclarer dans le portail MultiPay, onglet Webhooks). Sans elle, une commande n'est réglée que si quelqu'un vient la réclamer : un client qui paie puis tue l'app laisse une commande `pending` que plus rien ne réveille, argent encaissé sans contrepartie. La fonction authentifie la notification (HmacSHA512 du corps **brut** — le re-sérialiser casse la signature — comparé à temps constant à l'en-tête `X-Interswitch-Signature`), en extrait la référence, puis frappe à la porte unique du crédit. Elle ne crédite jamais elle-même : dupliquer cette logique, c'est signer un double crédit le jour où l'une des deux copies dérive. L'appel vers `multipay-return` **doit** être un POST JSON — tout autre appel y passe pour une navigation du navigateur, et un retour sans `done=1` vaut abandon : une notification de paiement réussi annulerait la commande. Réponse 200 à corps vide, sinon Interswitch rejoue jusqu'à cinq fois ; un 404 (commande inconnue) est acquitté plutôt que rejoué.

  **Où vivent les identifiants** (migration 051). Variables d'environnement des fonctions d'abord, puis à défaut le coffre **Vault** de la base, lu par `public.multipay_config()` (SECURITY DEFINER, réservée au `service_role`, filtrée sur le préfixe `MULTIPAY_`). Le coffre existe parce que les variables d'environnement ne se posent ni depuis une migration ni depuis l'API de gestion : elles exigent un passage à la main par le tableau de bord ou la CLI, et sur un rail de paiement qui se reconfigure plusieurs fois avant d'être juste, c'est l'étape qu'on oublie. La préséance garde la voie conventionnelle prioritaire. Clés attendues : `MULTIPAY_MODE`, `MERCHANT_CODE`, `PAY_ITEM_ID`, `CLIENT_ID`, `SECRET_KEY`, `WEBHOOK_SECRET`, `REQUERY_URL`. Le cache est à l'échelle de l'instance : changer une valeur prend effet après extinction des instances chaudes, ou tout de suite après un redéploiement.

  **Endpoint de confirmation en LIVE.** `newwebpay.interswitchng.com` renvoie la page HTML du portail sur la route `gettransaction.json`, pas du JSON : c'est `webpay.interswitchng.com` qui répond, et sans authentification. D'où `MULTIPAY_REQUERY_URL` posé explicitement plutôt que laissé à la liste de repli, qui gaspillait un aller-retour en erreur à chaque sondage — jusqu'à trente par paiement.

  **Plafond par transaction de l'accepteur.** Interswitch refuse au-delà d'un certain montant, et son refus s'affiche « Incorrect Transaction : some of the payment details entered appear to be incorrect », un message qui accuse les coordonnées bancaires alors que seul le montant est en cause. Mesuré le 2026-07-31 en rejouant `POST /collections/w/pay` sur le marchand sandbox `MX228251`, montant seul variable : 490 000 CDF passe, 500 000 CDF renvoie `responseCode Z1`, bascule vers 496 000 CDF. Sans garde-fou, un prix trop élevé ne se découvre qu'à l'entrée, par le client, devant la porte. Le backoffice avertit donc au moment de la saisie (`MAX_ENTRY_CDF` dans `apps/web/src/scripts/admin.js`) et laisse trancher plutôt que de bloquer : ce plafond est une mesure sur un marchand de démonstration, pas une règle du produit, et il est **à reconfirmer auprès de MultiPay le jour où les identifiants marchand LIVE sont posés**.
- **Il n'y a pas d'abonnement « Zola+ »**. Les deux seules choses qui se vendent sont les pièces et l'Incognito. `entitlements.is_premium` subsiste en base mais plus rien ne l'écrit ni ne le lit : rebrancher une fonctionnalité dessus sans lui redonner une source d'écriture donnerait un droit que personne ne peut obtenir.
- RevenueCat gérera les deux stores et poussera l'état d'abonnement vers `entitlements` via webhook. La vérité vient toujours du serveur.

## 7. Backoffice (apps/web/src/pages/admin.astro)

Page statique servie par Hostinger, protégée par `noindex`. Depuis le 22/11/2026 le
site est construit par Astro : le code (`src/scripts/admin.js`) et ses librairies
(`@supabase/supabase-js`, `qrcode`) sont regroupés en un seul fichier compressé dans
`/_astro/`, au lieu de sept allers-retours vers esm.sh à chaque ouverture.

Organisation (refonte du 22/11/2026) : le menu suit le travail, pas la technique
(Pilotage, Modération, Communauté, Contenu, Contacts, Équipe et réglages). L'en-tête
porte le fil d'Ariane, une recherche liée à la page ouverte (table `SEARCH` dans
`admin.js` : Utilisateurs et Signalements interrogent la base, les autres pages filtrent
ce qui est affiché, rien sur le tableau de bord), une pastille rouge « urgent »
dès qu'un dossier « mineur suspecté » attend (visible depuis toutes les pages) et le
menu du compte. Le tableau de bord commence par les files de travail (sécurité des
enfants, signalements, vérifications, photos, courrier), puis la communauté et la
liste d'attente ; la carte Économie en est retirée tant que le paiement est en pause,
la page Économie reste dans le menu.

Affiche de soirée (22/11/2026, `src/scripts/event-poster.js`) : dans la fiche d'une
soirée, le code QR n'est plus une image nue. L'admin génère une affiche 1240 x 1754 px
(format A, nette en A5) aux couleurs du site : logo, accroche, nom de l'endroit en
grand, ligne d'info (prix, horaires), puis le code QR en bas sur une carte blanche avec
le logo au centre (correction d'erreur H, relu par jsQR même réduit à 25 %). Le nom et
la ligne d'info se modifient pour l'affiche seulement. Boutons : télécharger (PNG),
imprimer (A5), QR seul (1024 px). Elle ne
contient aucun secret : la clé publique Supabase et un compte présent dans `admin_users`,
rien d'autre.

Utilisable au téléphone : en dessous de 900 px le menu latéral sort de l'écran et revient
par un bouton, et en dessous de 760 px les tableaux deviennent des cartes empilées (chaque
cellule porte son intitulé) plutôt qu'une grille à faire défiler de côté. Un modérateur
peut donc traiter une file depuis son téléphone, ce qui compte pour le délai d'une heure
imposé sur les dossiers mineurs.

**Règle d'architecture** : le backoffice n'écrit jamais en direct sur les données
sensibles. Toutes les opérations passent par des RPC `admin_*` en `SECURITY DEFINER` qui
(1) vérifient le rôle via `require_admin()`, (2) appliquent la règle métier, (3) déposent
une ligne dans `moderation_actions`. Un utilisateur normal qui appellerait ces endpoints
reçoit `not_admin`, et les tables de modération lui renvoient zéro ligne (RLS).

| Section | Ce qu'elle permet |
|---|---|
| Tableau de bord | Files ouvertes, comptes, activité, économie, courbes sur 14 jours |
| Sécurité des enfants | File dédiée « mineur suspecté », délai d'une heure, transmission aux autorités avec référence de dépôt |
| Signalements | File triée par gravité, prise en charge, décision, classement sans suite |
| Vérifications | Selfie avec geste tiré au sort, comparé aux photos du profil, validation ou refus motivé |
| Utilisateurs | Recherche, fiche complète (identité, photos, activité, historique), sanctions |
| Photos | Dernières photos, signalement, suppression (base + stockage) |
| Conversations | Lecture d'un chat pour instruire un dossier, chaque ouverture est tracée |
| Soirées, Blog | Gestion produit (QR, prix d'entrée en CDF, accès, articles) |
| Économie | Pièces en circulation, transactions, tarifs, ajustement manuel de solde |
| Journal d'audit | Toutes les actions, horodatées et attribuées |
| Administrateurs | Trois rôles, ajout et retrait (propriétaire uniquement), abonnement Incognito offert à l'équipe |
| Guide de modération | Procédure écrite : délais par motif, échelle des sanctions, protocole mineurs |

**Échelle des sanctions** : avertissement (compteur au dossier), shadowban (le compte
fonctionne pour son propriétaire mais sort des surfaces de découverte), suspension datée
(levée automatique), bannissement définitif, suppression totale. Le bannissement coupe les
matchs actifs, supprime les sessions Auth et bloque l'insertion de messages par la policy
RLS : un compte banni ne peut plus écrire, même dans une conversation déjà ouverte.

## 8. Sécurité — résumé

- RLS sur 100 % des tables, deny par défaut.
- Écritures métier uniquement via RPC `SECURITY DEFINER` avec `search_path` fixé.
- Clé `anon`/publishable seule dans l'app — jamais la `service_role`.
- Limite de likes, unicité des swipes/matchs, majorité (18+) : imposées par le schéma, pas par le client.
- Blocage bidirectionnel filtré dans le feed, le chat et les matchs.
