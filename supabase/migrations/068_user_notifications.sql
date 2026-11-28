-- ---------------------------------------------------------------------------
-- 068 : centre de notifications dans l'app
--
-- Jusqu'ici, une décision de la modération (photo retirée, vérification,
-- avertissement...) n'arrivait que par un push. Un push raté, refusé ou
-- effacé, et la personne ne savait jamais ce qui s'était passé. Désormais
-- chaque décision qui la concerne laisse aussi une trace lisible dans l'app,
-- onglet Profil, cloche en haut à droite.
--
-- Une seule source : le journal moderation_actions, que toutes les fonctions
-- admin_* alimentent déjà via log_admin_action(). Un déclencheur traduit
-- chaque action en notification (titre et texte pour la personne, jamais le
-- motif interne du backoffice) et envoie le push correspondant. Ajouter une
-- action plus tard = ajouter un cas dans notify_from_moderation().
--
-- Les envois de push directs des migrations 063 et 067 sont retirés de
-- admin_delete_photo, admin_review_verification et admin_set_verified : le
-- déclencheur s'en charge, sans doublon.
-- ---------------------------------------------------------------------------

create table if not exists public.user_notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  type       text not null,
  title      text not null,
  body       text not null,
  url        text,
  created_at timestamptz not null default now(),
  read_at    timestamptz
);

create index if not exists user_notifications_user_created
  on public.user_notifications (user_id, created_at desc);
create index if not exists user_notifications_unread
  on public.user_notifications (user_id) where read_at is null;

alter table public.user_notifications enable row level security;

drop policy if exists user_notifications_select_own on public.user_notifications;
create policy user_notifications_select_own on public.user_notifications
  for select to authenticated using (user_id = (select auth.uid()));

drop policy if exists user_notifications_update_own on public.user_notifications;
create policy user_notifications_update_own on public.user_notifications
  for update to authenticated using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

revoke all on public.user_notifications from anon, authenticated;
grant select on public.user_notifications to authenticated;
-- Seule la date de lecture est modifiable par la personne.
grant update (read_at) on public.user_notifications to authenticated;

-- Crée la notification et envoie le push. Réservée au serveur.
create or replace function public.notify_user(
  p_user  uuid,
  p_type  text,
  p_title text,
  p_body  text,
  p_url   text default null,
  p_push  boolean default true
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_user is null then return; end if;
  insert into public.user_notifications (user_id, type, title, body, url)
  values (p_user, p_type, p_title, p_body, p_url);
  if p_push then
    perform public.send_push_event(jsonb_build_object(
      'type', 'notice',
      'user_id', p_user,
      'notice_type', p_type,
      'title', p_title,
      'body', p_body,
      'url', coalesce(p_url, '/notifications')
    ));
  end if;
exception when others then
  -- Une notification ne doit jamais faire échouer une décision.
  null;
end;
$$;

revoke all on function public.notify_user(uuid, text, text, text, text, boolean)
  from public, anon, authenticated;

-- Traduction des actions de la modération en messages pour la personne.
create or replace function public.notify_from_moderation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_report public.reports;
begin
  case new.action
    when 'photo_deleted' then
      perform public.notify_user(new.target_user_id, 'photo_removed',
        'Une de tes photos a été retirée',
        'Elle ne respectait pas nos règles. Ajoute une nouvelle photo pour rester visible dans Rencontres.',
        '/(tabs)/profile/edit?focus=photos');

    when 'verification_approved', 'user_verified' then
      perform public.notify_user(new.target_user_id, 'verification_approved',
        'Ton profil est vérifié',
        'Le badge bleu s’affiche maintenant sur ton profil.',
        '/(tabs)/profile');

    when 'verification_rejected' then
      perform public.notify_user(new.target_user_id, 'verification_rejected',
        'Ta vérification n’a pas abouti',
        'La photo ne permettait pas de te reconnaître. Tu peux réessayer avec un nouveau geste.',
        '/verify-profile');

    when 'user_warned' then
      perform public.notify_user(new.target_user_id, 'warning',
        'Tu as reçu un avertissement',
        'Un de tes comportements ne respecte pas les règles de Zola. Au bout de trois avertissements, le compte est suspendu.',
        null);

    when 'user_unbanned' then
      perform public.notify_user(new.target_user_id, 'account_restored',
        'Ton compte est de nouveau actif',
        'Bon retour sur Zola. Merci de respecter les règles de la communauté.',
        '/(tabs)');

    when 'incognito_granted' then
      perform public.notify_user(new.target_user_id, 'incognito_granted',
        'Mode Invisible activé',
        'L’équipe Zola t’a offert le mode Invisible. Tu peux le gérer depuis ton profil.',
        '/(tabs)/profile');

    when 'incognito_revoked' then
      perform public.notify_user(new.target_user_id, 'incognito_revoked',
        'Mode Invisible retiré',
        'Ton profil apparaît de nouveau dans Rencontres.',
        '/(tabs)/profile');

    when 'report_actioned', 'report_dismissed' then
      -- Le signalement est traité : on remercie la personne qui l'a fait,
      -- sans rien dire de la sanction éventuelle.
      select * into v_report from public.reports where id::text = new.target_id;
      if v_report.reporter_id is not null then
        perform public.notify_user(v_report.reporter_id, 'report_reviewed',
          'Ton signalement a été examiné',
          case when new.action = 'report_actioned'
            then 'Merci. Notre équipe a pris les mesures nécessaires.'
            else 'Merci. Notre équipe n’a pas relevé d’infraction cette fois.' end,
          null);
      end if;

    else
      null;
  end case;
  return new;
exception when others then
  return new;
end;
$$;

drop trigger if exists moderation_actions_notify on public.moderation_actions;
create trigger moderation_actions_notify
  after insert on public.moderation_actions
  for each row execute function public.notify_from_moderation();

-- ---------------------------------------------------------------------------
-- Les trois fonctions qui envoyaient leur propre push n'en envoient plus.
-- ---------------------------------------------------------------------------

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

  -- Le journal déclenche la notification (notify_from_moderation).
  perform public.log_admin_action(
    v_admin, 'photo_deleted', v_photo.user_id, p_reason, 'photo', p_photo_id::text,
    jsonb_build_object('path', v_photo.storage_path)
  );

  return jsonb_build_object(
    'ok', true,
    'storage_path', case when v_photo.storage_path like 'http%' then null else v_photo.storage_path end
  );
end;
$$;

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
  -- Seule une vraie attribution du badge est journalisée comme telle (et
  -- donc annoncée) : reposer un badge déjà présent ne prévient personne.
  if p_on and coalesce(v_was, false) then
    return jsonb_build_object('ok', true, 'is_verified', p_on);
  end if;
  perform public.log_admin_action(
    v_admin, case when p_on then 'user_verified' else 'user_unverified' end,
    p_user_id, null, 'user', p_user_id::text
  );
  return jsonb_build_object('ok', true, 'is_verified', p_on);
end;
$$;
