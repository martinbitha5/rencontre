-- ---------------------------------------------------------------------------
-- PÉRIODE DE GRÂCE INCOGNITO : 21 jours offerts aux comptes passés incognito
-- pendant la période gratuite, le jour où le paiement revient.
--
-- Ce fichier n'est PAS une migration : il vit hors de supabase/migrations/
-- pour ne jamais être appliqué par `supabase db push`. Il se joue à la main,
-- le jour J, JUSTE APRÈS 052_free_mode_rollback.sql (qui remet free_mode à 0)
-- et AVANT la publication du client payant.
--
-- Décision produit du 14/09/2026 : 21 jours, pas un mois. La chute automatique
-- au terme des 21 jours est portée par la migration 055 (trigger sur
-- profiles.last_active_at), qui doit donc déjà être en base.
--
-- Rejouable sans danger : un compte qui a déjà une échéance à venir n'est pas
-- touché, un compte déjà traité par ce script non plus.
-- ---------------------------------------------------------------------------

-- Pré-requis : le mode gratuit doit être coupé, sinon le trigger 055 ne fera
-- rien et les 21 jours ne se termineront jamais.
do $$
begin
  if coalesce(public.economy_value('free_mode'), 0) = 1 then
    raise exception 'free_mode vaut encore 1 : jouer 052_free_mode_rollback.sql d''abord';
  end if;
end $$;

-- Contrôle avant : combien de comptes sont concernés.
-- select count(*) from public.profiles p
-- where p.incognito
--   and not exists (select 1 from public.entitlements e
--                   where e.user_id = p.user_id and e.incognito_until > now());

-- 1. Une ligne entitlements pour chaque profil incognito qui n'en a pas.
insert into public.entitlements (user_id)
select p.user_id from public.profiles p
where p.incognito
on conflict (user_id) do nothing;

-- 2. 21 jours à compter de maintenant, uniquement pour ceux qui n'ont pas
--    d'abonnement en cours. Un abonnement payé qui court encore garde sa date.
update public.entitlements e
set incognito_until = now() + interval '21 days',
    incognito_reminded_for = null,
    updated_at = now()
from public.profiles p
where p.user_id = e.user_id
  and p.incognito
  and (e.incognito_until is null or e.incognito_until <= now());

-- Contrôle après : tous les profils incognito ont désormais une échéance.
-- select count(*) filter (where e.incognito_until > now()) as couverts,
--        count(*) as incognito
-- from public.profiles p
-- left join public.entitlements e on e.user_id = p.user_id
-- where p.incognito;

-- Ce que voit l'utilisateur ensuite, sans rien coder de plus :
--   - la carte Incognito du Profil affiche « Abonnement valable jusqu'au … »
--     (ProfileHome lit wallet.incognito_until dès que PAYMENTS_ENABLED = true) ;
--   - 3 jours avant l'échéance, un push « bientôt fini » (trigger 055) ;
--   - à l'échéance, l'incognito tombe à la prochaine ouverture de l'app et
--     un push « terminé » part ; le bouton du Profil renvoie alors vers
--     l'offre Incognito.
