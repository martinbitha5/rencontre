-- ---------------------------------------------------------------------------
-- 085 : correctif de 084, « Profil indisponible » (28/11/2026)
--
-- 084 avait ajouté une seconde clé étrangère de profiles vers cities
-- (other_congo_city_id). L'API (PostgREST) ne savait alors plus laquelle
-- suivre pour « profiles -> cities(name) » et refusait la requête : ouvrir
-- un profil depuis une conversation affichait « Profil indisponible ».
--
-- La clé est retirée. La ville de l'autre Congo reste contrôlée par le
-- trigger profiles_sync_search_scope (ville inconnue ou de mon propre pays :
-- remise à null), et les villes ne sont jamais supprimées (is_active).
-- ---------------------------------------------------------------------------

alter table public.profiles drop constraint if exists profiles_other_congo_city_id_fkey;
