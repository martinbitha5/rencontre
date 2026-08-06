-- 026 — Suppression réelle des fichiers de stockage
--
-- Leçon apprise en testant la vérification de profil : un `delete from
-- storage.objects` dans une fonction SQL ne fait pas le travail. La table
-- appartient à supabase_storage_admin et porte ses propres triggers, la
-- suppression échoue silencieusement, et même si elle passait le fichier
-- resterait dans le bucket : seule l'API Storage retire vraiment l'objet.
--
-- Donc : les RPC renvoient le chemin du fichier, et le backoffice appelle
-- `storage.remove()` juste après, avec une policy qui l'autorise à l'équipe.

drop policy if exists verifications_delete_admin on storage.objects;
create policy verifications_delete_admin on storage.objects
  for delete to authenticated
  using (bucket_id = 'verifications' and public.is_admin());

drop policy if exists photos_storage_delete_admin on storage.objects;
create policy photos_storage_delete_admin on storage.objects
  for delete to authenticated
  using (bucket_id = 'photos' and public.is_admin());

create or replace function public.admin_review_verification(
  p_id      uuid,
  p_approve boolean,
  p_reason  text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin uuid := public.require_admin();
  v_row   public.verification_requests;
begin
  select * into v_row from public.verification_requests where id = p_id;
  if v_row.id is null then
    raise exception 'request_not_found';
  end if;
  if v_row.status <> 'pending' then
    raise exception 'already_reviewed';
  end if;
  if not p_approve and (p_reason is null or btrim(p_reason) = '') then
    raise exception 'reason_required';
  end if;

  update public.verification_requests
  set status = case when p_approve then 'approved' else 'rejected' end,
      reviewed_by = v_admin,
      reviewed_at = now(),
      reject_reason = case when p_approve then null else p_reason end
  where id = p_id;

  update public.profiles
  set is_verified = p_approve
  where user_id = v_row.user_id;

  perform public.log_admin_action(
    v_admin,
    case when p_approve then 'verification_approved' else 'verification_rejected' end,
    v_row.user_id, p_reason, 'verification', p_id::text,
    jsonb_build_object('gesture', v_row.gesture)
  );

  -- Le selfie a rempli son rôle : le backoffice le supprime dans la foulée.
  return jsonb_build_object('ok', true, 'approved', p_approve, 'selfie_path', v_row.selfie_path);
end;
$$;

create or replace function public.admin_delete_photo(p_photo_id uuid, p_reason text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin uuid := public.require_admin();
  v_photo public.photos;
begin
  select * into v_photo from public.photos where id = p_photo_id;
  if v_photo.id is null then
    raise exception 'photo_not_found';
  end if;

  delete from public.photos where id = p_photo_id;

  perform public.log_admin_action(
    v_admin, 'photo_deleted', v_photo.user_id, p_reason, 'photo', p_photo_id::text,
    jsonb_build_object('path', v_photo.storage_path)
  );

  -- Les photos de démo pointent sur des URL externes : on ne renvoie un chemin
  -- que s'il s'agit d'un vrai fichier du bucket.
  return jsonb_build_object(
    'ok', true,
    'storage_path', case when v_photo.storage_path like 'http%' then null else v_photo.storage_path end
  );
end;
$$;

revoke execute on function public.admin_review_verification(uuid, boolean, text) from public, anon;
revoke execute on function public.admin_delete_photo(uuid, text) from public, anon;
grant execute on function public.admin_review_verification(uuid, boolean, text) to authenticated;
grant execute on function public.admin_delete_photo(uuid, text) to authenticated;
