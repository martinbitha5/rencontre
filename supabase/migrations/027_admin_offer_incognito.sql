-- 027 — Offrir l'abonnement Incognito depuis le backoffice
--
-- L'abonnement Incognito existe déjà et se paie (entitlements.incognito_until,
-- crédité par `credit_incognito`). Ce qui manquait : pouvoir l'offrir. Cas
-- d'usage principal, l'équipe de modération : un modérateur doit pouvoir
-- parcourir l'application sans apparaître dans le deck des autres, sinon il
-- devient lui-même une cible.
--
-- On réutilise `credit_incognito` plutôt que d'écrire une seconde règle de
-- prolongation : un abonnement offert et un abonnement payé sont exactement la
-- même chose côté produit, seule la trace dans le journal les distingue.

create or replace function public.admin_grant_incognito(
  p_user_id  uuid,
  p_months   integer default 12,
  p_reason   text default null,
  p_activate boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin uuid := public.require_admin('admin');
  v_until timestamptz;
begin
  if p_months is null or p_months <= 0 or p_months > 60 then
    raise exception 'invalid_duration';
  end if;
  if not exists (select 1 from public.profiles where user_id = p_user_id) then
    raise exception 'user_not_found';
  end if;

  -- Prolonge un abonnement en cours au lieu de l'écraser.
  v_until := public.credit_incognito(p_user_id, p_months);

  -- On active dans la foulée : offrir l'abonnement sans allumer le mode
  -- obligerait la personne à aller le chercher dans ses réglages. Elle reste
  -- libre de le couper depuis l'application.
  if p_activate then
    update public.profiles set incognito = true, updated_at = now() where user_id = p_user_id;
  end if;

  perform public.log_admin_action(
    v_admin, 'incognito_granted', p_user_id, p_reason, 'entitlement', p_user_id::text,
    jsonb_build_object('months', p_months, 'until', v_until, 'activated', p_activate)
  );

  return jsonb_build_object('ok', true, 'incognito_until', v_until);
end;
$$;

create or replace function public.admin_revoke_incognito(p_user_id uuid, p_reason text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin uuid := public.require_admin('admin');
begin
  update public.entitlements set incognito_until = null, updated_at = now()
  where user_id = p_user_id;

  update public.profiles set incognito = false, updated_at = now()
  where user_id = p_user_id;

  perform public.log_admin_action(
    v_admin, 'incognito_revoked', p_user_id, p_reason, 'entitlement', p_user_id::text
  );

  return jsonb_build_object('ok', true);
end;
$$;

revoke execute on function public.admin_grant_incognito(uuid, integer, text, boolean) from public, anon;
revoke execute on function public.admin_revoke_incognito(uuid, text) from public, anon;
grant execute on function public.admin_grant_incognito(uuid, integer, text, boolean) to authenticated;
grant execute on function public.admin_revoke_incognito(uuid, text) to authenticated;

-- L'équipe doit voir d'un coup d'œil qui a déjà l'abonnement offert.
create or replace function public.admin_list_admins()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_admin uuid := public.require_admin();
begin
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'user_id', a.user_id,
      'email', (select u.email from auth.users u where u.id = a.user_id),
      'last_sign_in_at', (select u.last_sign_in_at from auth.users u where u.id = a.user_id),
      'full_name', a.full_name,
      'display_name', (select p.display_name from public.profiles p where p.user_id = a.user_id),
      'role', a.role,
      'is_active', a.is_active,
      'created_at', a.created_at,
      'incognito_until', (select e.incognito_until from public.entitlements e where e.user_id = a.user_id),
      'incognito_on', coalesce((select p.incognito from public.profiles p where p.user_id = a.user_id), false),
      'actions_30d', (select count(*) from public.moderation_actions m
                      where m.actor_id = a.user_id and m.created_at > now() - interval '30 days')
    ) order by a.created_at)
    from public.admin_users a
  ), '[]'::jsonb);
end;
$$;

revoke execute on function public.admin_list_admins() from public, anon;
grant execute on function public.admin_list_admins() to authenticated;
