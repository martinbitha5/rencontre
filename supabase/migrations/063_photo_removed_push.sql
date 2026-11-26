-- 063 : prévenir la personne quand la modération retire une de ses photos.
--
-- Avant, la photo disparaissait du profil sans un mot : la personne ne savait
-- ni pourquoi son profil avait changé, ni qu'elle pouvait en remettre une.
-- admin_delete_photo envoie maintenant un push « photo_removed » (fonction
-- Edge send-push) dont le lien ouvre Modifier le profil, sur la grille photos.
--
-- Le motif saisi au backoffice n'est PAS transmis : c'est une note interne,
-- écrite pour l'équipe. Le push reste générique.
--
-- L'adresse de send-push et le secret partagé sont lus dans Vault
-- (push_function_url, push_secret), jamais écrits dans ce fichier.
-- L'envoi est best-effort : un échec n'annule jamais la suppression.

create or replace function public.admin_delete_photo(p_photo_id uuid, p_reason text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin  uuid := public.require_admin();
  v_photo  public.photos;
  v_left   integer;
  v_url    text;
  v_secret text;
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

  select count(*) into v_left from public.photos where user_id = v_photo.user_id;

  begin
    select max(decrypted_secret) filter (where name = 'push_function_url'),
           max(decrypted_secret) filter (where name = 'push_secret')
      into v_url, v_secret
      from vault.decrypted_secrets
     where name in ('push_function_url', 'push_secret');

    if v_url is not null and v_secret is not null then
      perform net.http_post(
        url := v_url,
        headers := jsonb_build_object('Content-Type', 'application/json', 'x-push-secret', v_secret),
        body := jsonb_build_object(
          'type', 'photo_removed',
          'user_id', v_photo.user_id,
          'photos_left', v_left::text
        )
      );
    end if;
  exception when others then
    null;
  end;

  -- Les photos de démo pointent sur des URL externes : on ne renvoie un chemin
  -- que s'il s'agit d'un vrai fichier du bucket.
  return jsonb_build_object(
    'ok', true,
    'storage_path', case when v_photo.storage_path like 'http%' then null else v_photo.storage_path end
  );
end;
$$;

revoke execute on function public.admin_delete_photo(uuid, text) from public, anon;
grant execute on function public.admin_delete_photo(uuid, text) to authenticated;
