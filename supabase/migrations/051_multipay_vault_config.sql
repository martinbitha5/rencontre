-- ---------------------------------------------------------------------------
-- 051 : la configuration MultiPay vit dans Vault, plus dans l'environnement
--
-- POURQUOI. Les identifiants marchand se posaient jusqu'ici en variables
-- d'environnement des fonctions Edge (`supabase secrets set`). C'est la voie
-- conventionnelle, mais elle n'est accessible ni depuis une migration ni
-- depuis l'API de gestion : elle exige un passage à la main par le tableau de
-- bord ou la CLI. Sur un projet où le rail de paiement se configure et se
-- rejoue plusieurs fois avant d'être juste, cette étape manuelle est le
-- maillon qui casse — on croit avoir tout posé, il manque une clé, et c'est
-- un paiement réel qui l'apprend.
--
-- Vault range la valeur CHIFFRÉE dans la base : elle ne se lit pas dans un
-- dump, ni dans une sauvegarde, ni en interrogeant la table à l'aveugle.
-- Seule la vue vault.decrypted_secrets déchiffre, et elle n'est atteignable
-- que par le propriétaire — d'où la fonction SECURITY DEFINER ci-dessous,
-- ouverte au seul service_role, c'est-à-dire aux seules fonctions Edge.
--
-- PRÉSÉANCE. Les fonctions lisent TOUJOURS la variable d'environnement
-- d'abord, et ne retombent sur le coffre qu'à défaut. Poser un jour les
-- secrets à la CLI reprend donc la main sans rien casser, et sans qu'il faille
-- vider le coffre : la voie conventionnelle reste la voie prioritaire.
-- ---------------------------------------------------------------------------

-- Vault est fourni par la plateforme ; l'extension est déjà installée sur le
-- projet, la ligne ci-dessous ne fait que rendre la migration rejouable
-- ailleurs (branche de développement, projet neuf).
create extension if not exists supabase_vault with schema vault;

-- Toute la configuration MultiPay en un seul aller-retour. Un objet plutôt
-- qu'un secret par appel : une fonction Edge en a besoin de cinq à sept d'un
-- coup, et sept requêtes à froid sur un chemin de paiement, c'est du délai
-- offert à personne.
--
-- Le filtre sur le préfixe est délibérément strict : cette fonction ne doit
-- jamais devenir un moyen de lire TOUT le coffre. Si un secret d'une autre
-- nature entre un jour dans Vault, il reste hors de portée d'ici.
create or replace function public.multipay_config()
returns jsonb
language sql
security definer
set search_path = ''
stable
as $$
  select coalesce(jsonb_object_agg(name, decrypted_secret), '{}'::jsonb)
    from vault.decrypted_secrets
   where name like 'MULTIPAY\_%';
$$;

comment on function public.multipay_config() is
  'Configuration MultiPay déchiffrée depuis Vault. Réservée au service_role : '
  'ces valeurs autorisent à encaisser au nom de Goblaire Ltd.';

-- Personne d'autre que les fonctions Edge. Un utilisateur authentifié qui
-- pourrait lire ceci pourrait initier des paiements au nom du marchand.
revoke all on function public.multipay_config() from public;
revoke all on function public.multipay_config() from anon;
revoke all on function public.multipay_config() from authenticated;
grant execute on function public.multipay_config() to service_role;
