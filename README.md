# Dowe 💜

App de rencontre pour la RDC — « le Tinder de la RDC ». Nom provisoire : **Dowe**.

## Structure

```
apps/mobile     → App iOS + Android (Expo / React Native / TypeScript)
apps/web        → Landing page (statique, déployée sur Vercel)
supabase/       → Migrations SQL (déjà appliquées au projet Supabase)
ARCHITECTURE.md → Architecture système complète
```

## Démarrer l'app mobile

```bash
cd apps/mobile
npm install
npm start          # scanne le QR code avec Expo Go
```

Configuration : copie `.env.example` en `.env` (les clés du projet Supabase y sont déjà pour le dev).

## Landing page

`apps/web` est 100 % statique. Déploiement :

```bash
cd apps/web
npx vercel --prod
```

## Blog et backoffice

Le blog est alimenté par Supabase (table `posts`) :

- `blog.html` : liste des articles publiés
- `article.html#mon-slug` : lecture d'un article (markdown rendu côté client)
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
2. **Auth → URL Configuration** : ajouter `dowe://auth-callback` aux Redirect URLs.
3. **Auth → Email** : personnaliser les e-mails de confirmation (en français).

## Stores

- Bundle ID iOS / package Android : `com.dowe.app`
- Build et soumission via EAS : `cd apps/mobile && npx eas build --platform all`
- Politique de confidentialité (exigée par les stores) : page `/confidentialite` de la landing.
