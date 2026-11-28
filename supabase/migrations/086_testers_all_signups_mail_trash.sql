-- ---------------------------------------------------------------------------
-- 086 : testeurs hors liste, et corbeille du Courrier (28/11/2026)
--
-- 1. TESTEURS. admin_tester_overview ne voyait que les adresses invitées et
--    les comptes ayant déjà confirmé un jour. Pendant le programme, l'app
--    n'est disponible qu'aux testeurs : tout compte créé depuis le premier
--    jour du programme est donc un testeur, même si son adresse n'est pas
--    sur la liste. La liste est maintenant bâtie par COMPTE (et non plus par
--    adresse, ce qui ratait aussi un compte sans e-mail), plus les invités
--    qui n'ont pas encore de compte. Nouveaux champs : invited, phone.
--
-- 2. COURRIER. Supprimer un message le met à la corbeille (deleted_at), d'où
--    on peut le restaurer ou le supprimer pour de bon. Les compteurs ignorent
--    la corbeille.
-- ---------------------------------------------------------------------------

-- --- 1. Testeurs -------------------------------------------------------------

create or replace function public.admin_tester_overview()
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  v_admin uuid := public.require_admin();
  v_prog public.tester_program%rowtype;
begin
  select * into v_prog from public.tester_program where id = 1;

  return jsonb_build_object(
    'program', to_jsonb(v_prog),
    'today', (now() at time zone 'Africa/Kinshasa')::date,
    'people', coalesce((
      select jsonb_agg(row_to_json(t) order by t.days desc, t.last_checkin desc nulls last,
                                               t.signed_up_at desc nulls last, t.email)
      from (
        -- Les comptes : invités, inscrits depuis le début du programme, ou
        -- ayant confirmé au moins un jour.
        select
          coalesce(lower(u.email), i.email) as email,
          u.phone,
          u.id as user_id,
          p.display_name,
          p.public_id,
          p.last_active_at,
          u.created_at as signed_up_at,
          (i.email is not null) as invited,
          i.status as invite_status,
          i.sent_at as invited_at,
          coalesce(c.days, 0) as days,
          c.last_checkin,
          coalesce(c.dates, '[]'::jsonb) as dates,
          r.completed_at,
          r.granted_at
        from auth.users u
        left join public.tester_invites i on i.email = lower(u.email)
        left join public.profiles p on p.user_id = u.id
        left join lateral (
          select count(*)::int as days,
                 max(tc.day) as last_checkin,
                 jsonb_agg(tc.day order by tc.day) as dates
            from public.tester_checkins tc
           where tc.user_id = u.id
             and tc.day >= v_prog.starts_on
             and (v_prog.ends_on is null or tc.day <= v_prog.ends_on)
        ) c on true
        left join public.tester_rewards r on r.user_id = u.id
        where i.email is not null
           or exists (select 1 from public.tester_checkins tc where tc.user_id = u.id)
           or (v_prog.starts_on is not null
               and (u.created_at at time zone 'Africa/Kinshasa')::date >= v_prog.starts_on)

        union all

        -- Les invités qui n'ont pas encore de compte.
        select i.email, null, null, null, null, null, null, true, i.status, i.sent_at,
               0, null, '[]'::jsonb, null, null
          from public.tester_invites i
         where not exists (select 1 from auth.users u where lower(u.email) = i.email)
      ) t
    ), '[]'::jsonb)
  );
end $function$;

-- --- 2. Corbeille du Courrier ---------------------------------------------------

alter table public.inbound_mail add column if not exists deleted_at timestamptz;

comment on column public.inbound_mail.deleted_at is
  'Mis à la corbeille du backoffice. null = message visible.';

-- Compteurs (tableau de bord, menu) : la corbeille ne compte pas.
create or replace function public.admin_inbound_mail_counts()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'new', (select count(*) from public.inbound_mail where status = 'new' and deleted_at is null),
    'securite_new', (select count(*) from public.inbound_mail
                      where status = 'new' and category = 'securite' and deleted_at is null)
  )
  where public.require_admin() is not null;
$$;

-- Liste : la même, plus deleted_at (le backoffice range la corbeille à part).
create or replace function public.admin_list_inbound_mail(p_status text default null, p_limit integer default 300)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_admin uuid := public.require_admin();
  v_items jsonb;
begin
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', m.id,
      'category', m.category,
      'status', m.status,
      'source', m.source,
      'from_name', m.from_name,
      'from_address', m.from_address,
      'to_addresses', to_jsonb(m.to_addresses),
      'subject', m.subject,
      'body_preview', m.body_preview,
      'received_at', coalesce(m.received_at, m.created_at),
      'read_at', m.read_at,
      'deleted_at', m.deleted_at,
      'handled_at', m.handled_at,
      'handled_by_email', (select u.email from auth.users u where u.id = m.handled_by),
      'note', m.note,
      'replies', (select count(*) from public.inbound_mail_replies r where r.mail_id = m.id)
    ) order by coalesce(m.received_at, m.created_at) desc), '[]'::jsonb)
    into v_items
  from (
    select * from public.inbound_mail
    where p_status is null or status = p_status
    order by coalesce(received_at, created_at) desc
    limit greatest(1, least(coalesce(p_limit, 300), 2000))
  ) m;
  return jsonb_build_object('items', v_items);
end;
$$;

-- Mettre à la corbeille (p_deleted = true) ou restaurer (false).
create or replace function public.admin_trash_inbound_mail(p_ids bigint[], p_deleted boolean default true)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin uuid := public.require_admin();
  v_n integer;
begin
  update public.inbound_mail
     set deleted_at = case when p_deleted then now() else null end
   where id = any(p_ids);
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

-- Supprimer pour de bon : seulement ce qui est déjà à la corbeille, et
-- réservé aux administrateurs (pas aux modérateurs). Les réponses envoyées
-- partent avec (clé étrangère en cascade).
create or replace function public.admin_purge_inbound_mail(p_ids bigint[])
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin uuid := public.require_admin('admin');
  v_n integer;
begin
  delete from public.inbound_mail
   where id = any(p_ids) and deleted_at is not null;
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

revoke all on function public.admin_trash_inbound_mail(bigint[], boolean) from public, anon;
revoke all on function public.admin_purge_inbound_mail(bigint[]) from public, anon;
grant execute on function public.admin_trash_inbound_mail(bigint[], boolean) to authenticated;
grant execute on function public.admin_purge_inbound_mail(bigint[]) to authenticated;
