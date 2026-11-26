# Zola 💜

App de rencontre pour la RDC — « le Tinder de la RDC ». Nom provisoire : **Zola**.

## Structure

```
apps/mobile     → App iOS + Android (Expo / React Native / TypeScript)
apps/web        → Site public + blog + backoffice (Astro, déposé sur Hostinger)
supabase/       → Migrations SQL (déjà appliquées au projet Supabase)
ARCHITECTURE.md → Architecture système complète
```

## Démarrer l'app mobile

```bash
cd apps/mobile
npm install
npm start          # scanne le QR code avec Expo Go
npm run iphone     # Expo Go sur iPhone, même Wi-Fi, sans compte Expo
```

`npm run iphone` force le mode Expo Go (`expo-dev-client` est installé, sinon le
QR ouvrirait une development build) et ignore `EXPO_OFFLINE` pour ce lancement.
Sans compte Expo sur l'ordinateur, le projet est servi en anonyme : l'app Expo Go
doit alors être déconnectée elle aussi (Profil, Log out). Connectée à un compte,
elle refuse les projets anonymes.

Configuration : copie `.env.example` en `.env` (les clés du projet Supabase y sont déjà pour le dev).

## Site public (apps/web, Astro)

Le site est construit avec [Astro](https://astro.build) et reste 100 % statique.
Les pages gardent leur HTML et leur CSS d'origine (`src/pages/*.astro`, blocs
`is:inline`) : le design ne change pas, seule la construction accélère le site.

```bash
cd apps/web
npm install
npm run dev        # http://localhost:4173, rechargement à chaud
npm run build      # produit dist/ : c'est ce dossier qu'on dépose sur Hostinger
npm run preview    # sert dist/ pour vérifier avant le dépôt
```

- `src/pages/` : une page par fichier (`faq.astro` donne `faq.html`).
- `public/` : fichiers servis tels quels (`theme.css`, `admin.css`, images,
  polices, `.htaccess`, pages de paiement en sommeil).
- `src/lib/blog.js` : lecture des articles dans Supabase pendant la construction.
- `src/scripts/` : scripts regroupés et compressés par Astro (admin, blog).
- **Aperçu du backoffice sans connexion** : `npm run dev`, puis `http://localhost:4321/admin?apercu`.
  Données fictives (`src/scripts/admin-preview.js`), utiles pour travailler la mise en page.
  Ce mode n'existe qu'en développement : il est retiré de la version construite.

**Compteur de l'accueil** : le premier chiffre du bandeau compte les inscrits de la
liste d'attente (fonction `public_counter()`, migration 061). Le jour du lancement,
passer aux comptes créés puis reconstruire :

```sql
update public.site_settings set value = 'members', updated_at = now() where key = 'counter_mode';
```

**À chaque article publié**, relancer `npm run build` et redéposer `dist/`.
Entre-temps l'article est déjà visible : le blog vérifie Supabase en arrière-plan
et la page de secours `article.html?slug=...` l'affiche en direct.

## Blog et backoffice

Le blog est alimenté par Supabase (table `posts`) :

- `blog.html` : liste des articles publiés, écrite dans la page à la construction
- `article/mon-slug.html` (adresse `/article/mon-slug`) : une page statique par article,
  couverture réduite et aperçu WhatsApp avec la vraie image
- `article.html?slug=mon-slug` : page de secours pour un article publié après la dernière construction
- `admin.html` : backoffice (connexion e-mail + mot de passe, création/édition/publication d'articles, upload d'image de couverture)

Seuls les comptes présents dans la table `admin_users` peuvent gérer les articles. Pour autoriser un compte :

```sql
insert into public.admin_users (user_id)
select id from auth.users where email = 'ton-email@exemple.com';
```

(Le compte doit d'abord exister : crée-le via le dashboard Supabase, Auth > Users > Add user.)

## Backend (Supabase)

- Projet : `sbsxgwdpdjxsrxcccwno` (org Dove, eu-west-1)
- Schéma, RLS, fonctions : voir `supabase/migrations/` et `ARCHITECTURE.md`
- Toute la logique sensible (swipe, match, limite de likes, blocage) est côté Postgres — le client ne peut pas tricher.

## À configurer avant le lancement (dashboard Supabase)

1. **Auth → Providers** : activer Google et Apple (fournir les identifiants OAuth).
2. **Auth → URL Configuration** : ajouter `zola://auth-callback` aux Redirect URLs.
3. **Auth → Email** : personnaliser les e-mails de confirmation (en français).

## Stores

- Bundle ID iOS : `com.zola.app` ; package Android : `com.zolardc.app` (`com.zola.app` était déjà pris sur Google Play)
- Build et soumission via EAS : `cd apps/mobile && npx eas build --platform all`
- Politique de confidentialité (exigée par les stores) : page `/confidentialite` de la landing.
