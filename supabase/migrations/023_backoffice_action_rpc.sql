-- 023 — Backoffice : fonctions d'action
--
-- Aucune de ces fonctions n'écrit sans avoir vérifié le rôle de l'appelant, et
-- toutes déposent une ligne dans moderation_actions. Les sanctions exigent un
-- motif : c'est ce qui rend le journal exploitable six mois plus tard, ou
-- devant un juge.

-- ---------------------------------------------------------------------------
-- Signalements
-- ---------------------------------------------------------------------------

create or replace function public.admin_set_report_status(
  p_id         uuid,
  p_status     text,
  p_resolution text default null,
  p_notes      text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin uuid := public.require_admin();
  v_row   public.reports;
begin
  if p_status not in ('pending', 'in_review', 'actioned', 'dismissed') then
    raise exception 'invalid_status';
  end if;

  update public.reports r
  set status      = p_status,
      resolution  = case when p_status in ('actioned', 'dismissed') then p_resolution else null end,
      admin_notes = coalesce(p_notes, r.admin_notes),
      assigned_to = case when p_status = 'in_review' then v_admin else r.assigned_to end,
      handled_by  = case when p_status in ('actioned', 'dismissed') then v_admin else null end,
      handled_at  = case when p_status in ('actioned', 'dismissed') then now() else null end
  where r.id = p_id
  returning r.* into v_row;

  if v_row.id is null then
    raise exception 'report_not_found';
  end if;

  perform public.log_admin_action(
    v_admin, 'report_' || p_status, v_row.reported_id,
    coalesce(p_resolution, p_notes), 'report', p_id::text,
    jsonb_build_object('reason', v_row.reason, 'severity', v_row.severity)
  );

  return jsonb_build_object('ok', true, 'status', p_status);
end;
$$;

-- Trace la transmission d'un dossier « mineur » aux autorités. La référence du
-- dépôt est la preuve que Dowe a rempli son obligation de signalement.
create or replace function public.admin_escalate_csae(
  p_id  uuid,
  p_ref text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin uuid := public.require_admin();
  v_row   public.reports;
begin
  update public.reports r
  set csae_escalated_at  = coalesce(r.csae_escalated_at, now()),
      csae_escalated_by  = v_admin,
      csae_authority_ref = coalesce(p_ref, r.csae_authority_ref),
      status             = 'actioned',
      resolution         = 'signale_autorites',
      handled_by         = v_admin,
      handled_at         = now()
  where r.id = p_id
  returning r.* into v_row;

  if v_row.id is null then
    raise exception 'report_not_found';
  end if;

  perform public.log_admin_action(
    v_admin, 'csae_escalated', v_row.reported_id, p_ref, 'report', p_id::text,
    jsonb_build_object('reason', v_row.reason)
  );

  return jsonb_build_object('ok', true);
end;
$$;

-- ---------------------------------------------------------------------------
-- Sanctions
-- ---------------------------------------------------------------------------

-- p_days null = bannissement définitif, sinon suspension qui se lève seule.
create or replace function public.admin_ban_user(
  p_user_id   uuid,
  p_reason    text,
  p_days      integer default null,
  p_report_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin uuid := public.require_admin();
  v_until timestamptz;
begin
  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'reason_required';
  end if;
  if not exists (select 1 from public.profiles where user_id = p_user_id) then
    raise exception 'user_not_found';
  end if;
  if exists (select 1 from public.admin_users a where a.user_id = p_user_id and a.is_active) then
    raise exception 'cannot_sanction_admin';
  end if;

  v_until := case when p_days is null or p_days <= 0
                  then null
                  else now() + make_interval(days => p_days) end;

  update public.profiles
  set is_banned = true, banned_at = now(), banned_until = v_until, ban_reason = p_reason
  where user_id = p_user_id;

  update public.matches
  set is_active = false
  where (user_a = p_user_id or user_b = p_user_id) and is_active;

  insert into public.user_sanctions (user_id, kind, reason, report_id, created_by, expires_at)
  values (p_user_id,
          case when v_until is null then 'ban' else 'suspension' end,
          p_reason, p_report_id, v_admin, v_until);

  -- Déconnexion immédiate : sans cela, un jeton encore valide laisserait la
  -- personne naviguer jusqu'à son expiration.
  begin
    delete from auth.sessions where user_id = p_user_id;
  exception when others then
    null;
  end;

  update public.reports
  set status = 'actioned',
      resolution = case when v_until is null then 'compte_banni' else 'compte_suspendu' end,
      handled_by = v_admin, handled_at = now()
  where reported_id = p_user_id and status in ('pending', 'in_review') and reason <> 'mineur';

  -- Les dossiers « mineur » ne se referment jamais tout seuls : la
  -- transmission aux autorités doit être faite et enregistrée à la main.
  update public.reports
  set status = 'in_review', assigned_to = coalesce(assigned_to, v_admin)
  where reported_id = p_user_id and status = 'pending' and reason = 'mineur';

  perform public.log_admin_action(
    v_admin,
    case when v_until is null then 'user_banned' else 'user_suspended' end,
    p_user_id, p_reason, 'user', p_user_id::text,
    jsonb_build_object('days', p_days, 'until', v_until, 'report_id', p_report_id)
  );

  return jsonb_build_object('ok', true, 'banned_until', v_until);
end;
$$;

create or replace function public.admin_unban_user(p_user_id uuid, p_reason text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin uuid := public.require_admin();
begin
  update public.profiles
  set is_banned = false, banned_at = null, banned_until = null, ban_reason = null
  where user_id = p_user_id;

  update public.user_sanctions
  set lifted_at = now(), lifted_by = v_admin,
      lifted_reason = coalesce(p_reason, 'Levée manuelle')
  where user_id = p_user_id and kind in ('ban', 'suspension') and lifted_at is null;

  perform public.log_admin_action(v_admin, 'user_unbanned', p_user_id, p_reason, 'user', p_user_id::text);

  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.admin_set_shadowban(
  p_user_id uuid,
  p_on      boolean,
  p_reason  text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin uuid := public.require_admin();
begin
  if p_on and exists (select 1 from public.admin_users a where a.user_id = p_user_id and a.is_active) then
    raise exception 'cannot_sanction_admin';
  end if;

  update public.profiles set shadowbanned = p_on where user_id = p_user_id;

  if p_on then
    insert into public.user_sanctions (user_id, kind, reason, created_by)
    values (p_user_id, 'shadowban', coalesce(p_reason, 'Non précisé'), v_admin);
  else
    update public.user_sanctions
    set lifted_at = now(), lifted_by = v_admin, lifted_reason = coalesce(p_reason, 'Levée manuelle')
    where user_id = p_user_id and kind = 'shadowban' and lifted_at is null;
  end if;

  perform public.log_admin_action(
    v_admin, case when p_on then 'shadowban_on' else 'shadowban_off' end,
    p_user_id, p_reason, 'user', p_user_id::text
  );

  return jsonb_build_object('ok', true, 'shadowbanned', p_on);
end;
$$;

create or replace function public.admin_warn_user(
  p_user_id   uuid,
  p_reason    text,
  p_report_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin uuid := public.require_admin();
  v_count integer;
begin
  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'reason_required';
  end if;

  update public.profiles
  set warnings_count = warnings_count + 1
  where user_id = p_user_id
  returning warnings_count into v_count;

  if v_count is null then
    raise exception 'user_not_found';
  end if;

  insert into public.user_sanctions (user_id, kind, reason, report_id, created_by)
  values (p_user_id, 'warning', p_reason, p_report_id, v_admin);

  perform public.log_admin_action(v_admin, 'user_warned', p_user_id, p_reason, 'user', p_user_id::text,
    jsonb_build_object('warnings_count', v_count));

  return jsonb_build_object('ok', true, 'warnings_count', v_count);
end;
$$;

create or replace function public.admin_set_verified(p_user_id uuid, p_on boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin uuid := public.require_admin();
begin
  update public.profiles set is_verified = p_on where user_id = p_user_id;
  perform public.log_admin_action(
    v_admin, case when p_on then 'user_verified' else 'user_unverified' end,
    p_user_id, null, 'user', p_user_id::text
  );
  return jsonb_build_object('ok', true, 'is_verified', p_on);
end;
$$;

create or replace function public.admin_add_note(p_user_id uuid, p_body text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin uuid := public.require_admin();
  v_id    bigint;
begin
  if p_body is null or btrim(p_body) = '' then
    raise exception 'body_required';
  end if;

  insert into public.user_notes (user_id, author_id, body)
  values (p_user_id, v_admin, btrim(p_body))
  returning id into v_id;

  perform public.log_admin_action(v_admin, 'note_added', p_user_id, null, 'note', v_id::text);

  return jsonb_build_object('ok', true, 'id', v_id);
end;
$$;

-- ---------------------------------------------------------------------------
-- Contenus
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

  -- Le fichier part aussi du stockage. Les photos de démo pointent sur des URL
  -- externes : dans ce cas la suppression ne trouve rien, sans conséquence.
  begin
    delete from storage.objects
    where bucket_id = 'photos' and name = v_photo.storage_path;
  exception when others then
    null;
  end;

  perform public.log_admin_action(
    v_admin, 'photo_deleted', v_photo.user_id, p_reason, 'photo', p_photo_id::text,
    jsonb_build_object('path', v_photo.storage_path)
  );

  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.admin_flag_photo(p_photo_id uuid, p_status text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin uuid := public.require_admin();
  v_user  uuid;
begin
  if p_status not in ('approved', 'flagged') then
    raise exception 'invalid_status';
  end if;

  update public.photos
  set moderation_status = p_status, reviewed_by = v_admin, reviewed_at = now()
  where id = p_photo_id
  returning user_id into v_user;

  if v_user is null then
    raise exception 'photo_not_found';
  end if;

  perform public.log_admin_action(v_admin, 'photo_' || p_status, v_user, null, 'photo', p_photo_id::text);

  return jsonb_build_object('ok', true, 'status', p_status);
end;
$$;

-- Lecture d'une conversation privée : systématiquement tracée.
create or replace function public.admin_get_conversation(p_match_id uuid, p_limit integer default 300)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin uuid := public.require_admin();
  v_match public.matches;
  v_out   jsonb;
begin
  select * into v_match from public.matches where id = p_match_id;
  if v_match.id is null then
    raise exception 'match_not_found';
  end if;

  perform public.log_admin_action(
    v_admin, 'conversation_read', v_match.user_a, null, 'match', p_match_id::text,
    jsonb_build_object('user_b', v_match.user_b)
  );

  select jsonb_build_object(
    'match', jsonb_build_object(
      'id', v_match.id, 'status', v_match.status, 'origin', v_match.origin,
      'is_active', v_match.is_active, 'created_at', v_match.created_at,
      'initiated_by', v_match.initiated_by
    ),
    'participants', jsonb_build_object(
      'a', jsonb_build_object(
        'user_id', v_match.user_a,
        'display_name', (select p.display_name from public.profiles p where p.user_id = v_match.user_a),
        'photo', (select ph.storage_path from public.photos ph where ph.user_id = v_match.user_a order by ph.position limit 1)
      ),
      'b', jsonb_build_object(
        'user_id', v_match.user_b,
        'display_name', (select p.display_name from public.profiles p where p.user_id = v_match.user_b),
        'photo', (select ph.storage_path from public.photos ph where ph.user_id = v_match.user_b order by ph.position limit 1)
      )
    ),
    'messages', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', g.id, 'sender_id', g.sender_id, 'content', g.content,
        'kind', g.kind, 'media_path', g.media_path,
        'created_at', g.created_at, 'read_at', g.read_at
      ) order by g.created_at)
      from (
        select * from public.messages m
        where m.match_id = p_match_id
        order by m.created_at desc
        limit least(greatest(coalesce(p_limit, 300), 1), 1000)
      ) g
    ), '[]'::jsonb)
  ) into v_out;

  return v_out;
end;
$$;

-- ---------------------------------------------------------------------------
-- Économie et suppression (administrateur et plus)
-- ---------------------------------------------------------------------------

create or replace function public.admin_adjust_coins(p_user_id uuid, p_amount integer, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin   uuid := public.require_admin('admin');
  v_balance integer;
begin
  if p_amount is null or p_amount = 0 then
    raise exception 'amount_required';
  end if;
  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'reason_required';
  end if;
  if abs(p_amount) > 1000000 then
    raise exception 'amount_too_large';
  end if;

  insert into public.coin_wallets (user_id, balance)
  values (p_user_id, 0)
  on conflict (user_id) do nothing;

  update public.coin_wallets
  set balance = greatest(balance + p_amount, 0), updated_at = now()
  where user_id = p_user_id
  returning balance into v_balance;

  insert into public.coin_transactions (user_id, amount, kind)
  values (p_user_id, p_amount, 'admin');

  perform public.log_admin_action(
    v_admin, 'coins_adjusted', p_user_id, p_reason, 'wallet', p_user_id::text,
    jsonb_build_object('amount', p_amount, 'balance', v_balance)
  );

  return jsonb_build_object('ok', true, 'balance', v_balance);
end;
$$;

-- Suppression totale. La ligne d'audit est écrite AVANT la suppression, sinon
-- la clé étrangère la viderait de sa cible.
create or replace function public.admin_delete_user(p_user_id uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin uuid := public.require_admin('admin');
  v_name  text;
begin
  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'reason_required';
  end if;
  if exists (select 1 from public.admin_users a where a.user_id = p_user_id) then
    raise exception 'cannot_delete_admin';
  end if;

  select display_name into v_name from public.profiles where user_id = p_user_id;
  if v_name is null and not exists (select 1 from public.profiles where user_id = p_user_id) then
    raise exception 'user_not_found';
  end if;

  perform public.log_admin_action(
    v_admin, 'user_deleted', null, p_reason, 'user', p_user_id::text,
    jsonb_build_object('display_name', v_name)
  );

  delete from auth.users where id = p_user_id;

  return jsonb_build_object('ok', true);
end;
$$;

-- ---------------------------------------------------------------------------
-- Équipe (propriétaire uniquement)
-- ---------------------------------------------------------------------------

create or replace function public.admin_add_admin(p_email text, p_role text default 'moderator', p_full_name text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin  uuid := public.require_admin('owner');
  v_target uuid;
begin
  if p_role not in ('owner', 'admin', 'moderator') then
    raise exception 'invalid_role';
  end if;

  select u.id into v_target from auth.users u
  where lower(u.email) = lower(btrim(coalesce(p_email, '')));

  if v_target is null then
    raise exception 'account_not_found';
  end if;

  insert into public.admin_users (user_id, role, full_name, is_active, created_by)
  values (v_target, p_role, p_full_name, true, v_admin)
  on conflict (user_id) do update
    set role = excluded.role, full_name = coalesce(excluded.full_name, public.admin_users.full_name), is_active = true;

  perform public.log_admin_action(v_admin, 'admin_added', null, p_role, 'admin', v_target::text,
    jsonb_build_object('email', p_email));

  return jsonb_build_object('ok', true, 'user_id', v_target);
end;
$$;

create or replace function public.admin_set_admin_role(p_user_id uuid, p_role text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin uuid := public.require_admin('owner');
begin
  if p_role not in ('owner', 'admin', 'moderator') then
    raise exception 'invalid_role';
  end if;
  if p_user_id = v_admin and p_role <> 'owner' then
    raise exception 'cannot_demote_self';
  end if;

  update public.admin_users set role = p_role where user_id = p_user_id;

  perform public.log_admin_action(v_admin, 'admin_role_changed', null, p_role, 'admin', p_user_id::text);

  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.admin_set_admin_active(p_user_id uuid, p_active boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin uuid := public.require_admin('owner');
begin
  if p_user_id = v_admin then
    raise exception 'cannot_disable_self';
  end if;
  if not p_active and (
    select count(*) from public.admin_users a where a.role = 'owner' and a.is_active
  ) <= 1 and exists (
    select 1 from public.admin_users a where a.user_id = p_user_id and a.role = 'owner' and a.is_active
  ) then
    raise exception 'last_owner';
  end if;

  update public.admin_users set is_active = p_active where user_id = p_user_id;

  perform public.log_admin_action(
    v_admin, case when p_active then 'admin_enabled' else 'admin_disabled' end,
    null, null, 'admin', p_user_id::text
  );

  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.admin_remove_admin(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin uuid := public.require_admin('owner');
begin
  if p_user_id = v_admin then
    raise exception 'cannot_remove_self';
  end if;

  delete from public.admin_users where user_id = p_user_id;

  perform public.log_admin_action(v_admin, 'admin_removed', null, null, 'admin', p_user_id::text);

  return jsonb_build_object('ok', true);
end;
$$;

-- ---------------------------------------------------------------------------
-- Droits d'exécution
-- ---------------------------------------------------------------------------

revoke execute on function public.admin_set_report_status(uuid, text, text, text) from public, anon;
revoke execute on function public.admin_escalate_csae(uuid, text) from public, anon;
revoke execute on function public.admin_ban_user(uuid, text, integer, uuid) from public, anon;
revoke execute on function public.admin_unban_user(uuid, text) from public, anon;
revoke execute on function public.admin_set_shadowban(uuid, boolean, text) from public, anon;
revoke execute on function public.admin_warn_user(uuid, text, uuid) from public, anon;
revoke execute on function public.admin_set_verified(uuid, boolean) from public, anon;
revoke execute on function public.admin_add_note(uuid, text) from public, anon;
revoke execute on function public.admin_delete_photo(uuid, text) from public, anon;
revoke execute on function public.admin_flag_photo(uuid, text) from public, anon;
revoke execute on function public.admin_get_conversation(uuid, integer) from public, anon;
revoke execute on function public.admin_adjust_coins(uuid, integer, text) from public, anon;
revoke execute on function public.admin_delete_user(uuid, text) from public, anon;
revoke execute on function public.admin_add_admin(text, text, text) from public, anon;
revoke execute on function public.admin_set_admin_role(uuid, text) from public, anon;
revoke execute on function public.admin_set_admin_active(uuid, boolean) from public, anon;
revoke execute on function public.admin_remove_admin(uuid) from public, anon;

grant execute on function public.admin_set_report_status(uuid, text, text, text) to authenticated;
grant execute on function public.admin_escalate_csae(uuid, text) to authenticated;
grant execute on function public.admin_ban_user(uuid, text, integer, uuid) to authenticated;
grant execute on function public.admin_unban_user(uuid, text) to authenticated;
grant execute on function public.admin_set_shadowban(uuid, boolean, text) to authenticated;
grant execute on function public.admin_warn_user(uuid, text, uuid) to authenticated;
grant execute on function public.admin_set_verified(uuid, boolean) to authenticated;
grant execute on function public.admin_add_note(uuid, text) to authenticated;
grant execute on function public.admin_delete_photo(uuid, text) to authenticated;
grant execute on function public.admin_flag_photo(uuid, text) to authenticated;
grant execute on function public.admin_get_conversation(uuid, integer) to authenticated;
grant execute on function public.admin_adjust_coins(uuid, integer, text) to authenticated;
grant execute on function public.admin_delete_user(uuid, text) to authenticated;
grant execute on function public.admin_add_admin(text, text, text) to authenticated;
grant execute on function public.admin_set_admin_role(uuid, text) to authenticated;
grant execute on function public.admin_set_admin_active(uuid, boolean) to authenticated;
grant execute on function public.admin_remove_admin(uuid) to authenticated;
