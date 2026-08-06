-- Dowe : durcissement des grants (appliqué le 2026-07-24, suite aux advisors Supabase)
revoke execute on all functions in schema public from public, anon, authenticated;

grant execute on function public.get_discovery_feed(int) to authenticated;
grant execute on function public.swipe(uuid, boolean) to authenticated;
grant execute on function public.get_my_matches() to authenticated;
grant execute on function public.get_likers() to authenticated;
grant execute on function public.mark_messages_read(uuid) to authenticated;
grant execute on function public.unmatch(uuid) to authenticated;
grant execute on function public.block_user(uuid) to authenticated;
grant execute on function public.delete_my_account() to authenticated;

alter default privileges in schema public revoke execute on functions from public;

-- Bucket public : accès par URL publique uniquement, pas de listing
drop policy "photos_storage_read" on storage.objects;
