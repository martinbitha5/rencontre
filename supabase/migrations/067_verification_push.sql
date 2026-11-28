-- ---------------------------------------------------------------------------
-- 067 : push à la décision de vérification
--
-- Avant, l'app n'apprenait la validation du badge bleu qu'en relisant le
-- profil, au plus tôt 10 minutes après le dernier chargement. La personne
-- devait fermer et rouvrir l'app pour voir son badge. Désormais la décision
-- de l'équipe envoie un push (verification_approved ou verification_rejected) :
-- l'app ouverte relit son profil à la réception, l'app fermée affiche la
-- notification.
--
-- public.send_push_event() factorise l'appel best effort à la fonction Edge
-- send-push (URL et secret dans le coffre Vault, comme la migration 063). Un
-- échec d'envoi ne fait jamais échouer la décision.
-- ---------------------------------------------------------------------------

create or replace function public.send_push_event(p_body jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url    text;
  v_secret text;
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
      body := p_body
    );
  end if;
exception when others then
  null;
end;
$$;

revoke all on function public.send_push_event(jsonb) from public, anon, authenticated;

create or replace function public.admin_review_verification(p_id uuid, p_approve boolean, p_reason text default null)
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
  if v_row.id is null then raise exception 'request_not_found'; end if;
  if v_row.status <> 'pending' then raise exception 'already_reviewed'; end if;
  if not p_approve and (p_reason is null or btrim(p_reason) = '') then
    raise exception 'reason_required';
  end if;

  update public.verification_requests
  set status = case when p_approve then 'approved' else 'rejected' end,
      reviewed_by = v_admin,
      reviewed_at = now(),
      reject_reason = case when p_approve then null else p_reason end
  where id = p_id;

  update public.profiles set is_verified = p_approve where user_id = v_row.user_id;

  if p_approve then
    delete from public.verification_challenges where user_id = v_row.user_id;
  else
    insert into public.verification_challenges (user_id, gesture)
    values (v_row.user_id, public.draw_gesture())
    on conflict (user_id) do update
      set gesture = excluded.gesture, assigned_at = now();
  end if;

  begin
    delete from storage.objects
    where bucket_id = 'verifications' and name = v_row.selfie_path;
  exception when others then
    null;
  end;

  perform public.log_admin_action(
    v_admin,
    case when p_approve then 'verification_approved' else 'verification_rejected' end,
    v_row.user_id, p_reason, 'verification', p_id::text,
    jsonb_build_object('gesture', v_row.gesture)
  );

  perform public.send_push_event(jsonb_build_object(
    'type', case when p_approve then 'verification_approved' else 'verification_rejected' end,
    'user_id', v_row.user_id
  ));

  return jsonb_build_object('ok', true, 'status',
    case when p_approve then 'approved' else 'rejected' end);
end $$;

create or replace function public.admin_set_verified(p_user_id uuid, p_on boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin uuid := public.require_admin();
  v_was   boolean;
begin
  select is_verified into v_was from public.profiles where user_id = p_user_id;
  update public.profiles set is_verified = p_on where user_id = p_user_id;
  perform public.log_admin_action(
    v_admin, case when p_on then 'user_verified' else 'user_unverified' end,
    p_user_id, null, 'user', p_user_id::text
  );
  -- Seule une vraie attribution du badge est annoncée. Le retrait manuel
  -- reste silencieux : l'app le voit à la prochaine relecture du profil.
  if p_on and not coalesce(v_was, false) then
    perform public.send_push_event(jsonb_build_object(
      'type', 'verification_approved', 'user_id', p_user_id
    ));
  end if;
  return jsonb_build_object('ok', true, 'is_verified', p_on);
end;
$$;
