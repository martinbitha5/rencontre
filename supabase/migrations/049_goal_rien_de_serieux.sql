-- 049 : l'intention « Rien de sérieux » ajoutée à l'app le 2026-08-05 n'était
-- pas dans la contrainte de profiles.relationship_goal : la choisir à
-- l'onboarding faisait échouer TOUT l'enregistrement du profil
-- (« Impossible d'enregistrer le profil »). La liste des intentions vit à
-- deux endroits qui doivent rester identiques : profileOptions.ts côté app et
-- cette contrainte côté base.

alter table public.profiles drop constraint profiles_relationship_goal_check;
alter table public.profiles add constraint profiles_relationship_goal_check
  check (
    relationship_goal is null
    or relationship_goal = any (array[
      'relation_serieuse'::text,
      'mariage'::text,
      'amitie'::text,
      'rien_de_serieux'::text,
      'je_me_laisse_surprendre'::text
    ])
  );
