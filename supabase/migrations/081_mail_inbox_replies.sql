-- ---------------------------------------------------------------------------
-- 081 : Courrier du backoffice, en vraie messagerie (28/11/2026)
--
-- 1. LU / NON LU. inbound_mail.read_at : posé à la première ouverture d'un
--    message par un administrateur. La liste met les non lus en gras.
-- 2. LECTURE COMPLÈTE. admin_get_inbound_mail(p_id) rend le message entier,
--    les champs du formulaire du site (téléphone, sujet, précisions) et
--    l'historique des réponses envoyées depuis le backoffice.
-- 3. RÉPONSES. inbound_mail_replies garde chaque réponse envoyée par la
--    fonction Edge admin-mail-reply (Brevo, expéditeur support@zola-rdc.com) :
--    qui a répondu, à qui, quoi, quand. Écriture réservée au service_role.
-- ---------------------------------------------------------------------------

alter table public.inbound_mail
  add column if not exists read_at timestamptz;

create table if not exists public.inbound_mail_replies (
  id bigint generated always as identity primary key,
  mail_id bigint not null references public.inbound_mail (id) on delete cascade,
  sent_by uuid references auth.users (id) on delete set null,
  to_address text not null,
  subject text not null,
  body text not null,
  brevo_message_id text,
  created_at timestamptz not null default now()
);

create index if not exists inbound_mail_replies_mail_idx on public.inbound_mail_replies (mail_id, created_at);

alter table public.inbound_mail_replies enable row level security;
revoke all on table public.inbound_mail_replies from public, anon, authenticated;

-- Liste : comme avant, plus read_at et le nombre de réponses envoyées.
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

-- Lecture d'un message : le marque lu, rend tout ce qu'on sait de lui.
create or replace function public.admin_get_inbound_mail(p_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin uuid := public.require_admin();
  v_mail public.inbound_mail%rowtype;
begin
  update public.inbound_mail set read_at = coalesce(read_at, now()) where id = p_id
  returning * into v_mail;
  if v_mail.id is null then raise exception 'courrier_introuvable'; end if;

  return jsonb_build_object(
    'id', v_mail.id,
    'category', v_mail.category,
    'status', v_mail.status,
    'source', v_mail.source,
    'mailbox', v_mail.mailbox,
    'from_name', v_mail.from_name,
    'from_address', v_mail.from_address,
    'to_addresses', to_jsonb(v_mail.to_addresses),
    'cc', case when v_mail.source = 'mail' then v_mail.raw->'data'->'cc' else null end,
    'subject', v_mail.subject,
    'body', v_mail.body_preview,
    'received_at', coalesce(v_mail.received_at, v_mail.created_at),
    'read_at', v_mail.read_at,
    'handled_at', v_mail.handled_at,
    'handled_by_email', (select u.email from auth.users u where u.id = v_mail.handled_by),
    'note', v_mail.note,
    -- Formulaire du site : les champs saisis, tels quels.
    'form', case when v_mail.source = 'site' then jsonb_build_object(
      'name', v_mail.raw->>'name',
      'email', v_mail.raw->>'email',
      'phone', v_mail.raw->>'phone',
      'topic', v_mail.raw->>'topic',
      'details', v_mail.raw->'details'
    ) else null end,
    'attachments', case when v_mail.source = 'mail'
      then coalesce(v_mail.raw->'data'->'attachments', '[]'::jsonb) else '[]'::jsonb end,
    'replies', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', r.id,
        'to_address', r.to_address,
        'subject', r.subject,
        'body', r.body,
        'created_at', r.created_at,
        'sent_by_email', (select u.email from auth.users u where u.id = r.sent_by)
      ) order by r.created_at)
      from public.inbound_mail_replies r where r.mail_id = v_mail.id
    ), '[]'::jsonb)
  );
end;
$$;

-- Remettre un message en non lu (clic droit « Marquer non lu » du backoffice).
create or replace function public.admin_mark_inbound_mail_unread(p_id bigint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin uuid := public.require_admin();
begin
  update public.inbound_mail set read_at = null where id = p_id;
end;
$$;

revoke all on function public.admin_get_inbound_mail(bigint) from public, anon;
revoke all on function public.admin_mark_inbound_mail_unread(bigint) from public, anon;
grant execute on function public.admin_get_inbound_mail(bigint) to authenticated;
grant execute on function public.admin_mark_inbound_mail_unread(bigint) to authenticated;
