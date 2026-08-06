-- Dowe : verrouillage des grants après la migration 009 (appliqué le 2026-07-26)
--
-- Les fonctions créées en 009 ont hérité du grant EXECUTE par défaut de
-- Postgres (le "alter default privileges" de 005 ne couvrait pas le rôle
-- utilisé par l'outil de migration). Les advisors Supabase ont signalé que
-- les fonctions internes étaient exposées via PostgREST : debit_coins
-- permettrait à un utilisateur connecté de débiter n'importe quel compte.

-- Fonctions internes : jamais appelables par l'API.
revoke execute on function public.economy_value(text) from public, anon, authenticated;
revoke execute on function public.ensure_wallet(uuid) from public, anon, authenticated;
revoke execute on function public.debit_coins(uuid, int, text, uuid) from public, anon, authenticated;
revoke execute on function public.activate_match_on_reply() from public, anon, authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.set_updated_at() from public, anon, authenticated;
revoke execute on function public.notify_push_new_match() from public, anon, authenticated;
revoke execute on function public.notify_push_new_message() from public, anon, authenticated;

-- RPC utilisateur : réservées aux comptes connectés (jamais anon).
revoke execute on function public.get_wallet() from public, anon;
revoke execute on function public.like_back(uuid) from public, anon;
revoke execute on function public.send_direct_message(uuid, text) from public, anon;
revoke execute on function public.get_passed_profiles() from public, anon;
revoke execute on function public.like_from_history(uuid) from public, anon;
revoke execute on function public.get_likers() from public, anon;
revoke execute on function public.get_my_matches() from public, anon;
revoke execute on function public.get_discovery_feed(int) from public, anon;
revoke execute on function public.swipe(uuid, boolean) from public, anon;
