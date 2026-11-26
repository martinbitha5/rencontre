-- ---------------------------------------------------------------------------
-- 057 : le courrier reçu sur les boîtes du domaine arrive au backoffice
--
-- Le domaine zola-rdc.com a quatre adresses (support@, contact@, partenaires@,
-- securite@), hébergées chez Hostinger. Hostinger sait prévenir une adresse
-- web à chaque message reçu (webhook « message.received », API Mail). La
-- fonction Edge `hostinger-mail-webhook` reçoit cet appel, vérifie le secret
-- porté en Authorization: Bearer, et range le message ici par la RPC
-- record_inbound_mail(). Le backoffice liste ensuite le courrier, classé par
-- adresse de destination, et marque ce qui a été traité.
--
-- Ce qu'on garde : les en-têtes utiles (expéditeur, destinataires, sujet,
-- date, identifiant de message) et le corps brut de la notification. Pas le
-- texte du mail : Hostinger ne l'envoie pas forcément dans la notification,
-- et le lire exigerait un jeton d'API rangé côté serveur. La lecture se fait
-- dans la boîte, le backoffice sert à ne rien laisser passer.
--
-- Catégories, déduites de l'adresse de destination :
--   partenaires    partenaires@  demande de soirée d'un lieu ou d'une marque
--   securite       securite@     sécurité des enfants, journalisée en plus
--                                dans l'historique des actions (priorité)
--   contact        contact@      général, presse
--   waitlist_reply support@      réponse à l'e-mail de la liste d'attente
--   support        support@      tout le reste
--   other          adresse inconnue, ou notification sans destinataire
-- ---------------------------------------------------------------------------

create table if not exists public.inbound_mail (
  id            bigint generated always as identity primary key,
  message_id    text,
  mailbox       text,
  folder        text,
  uid           bigint,
  from_name     text,
  from_address  text,
  to_addresses  text[] not null default '{}',
  subject       text,
  received_at   timestamptz,
  category      text not null default 'other'
    check (category in ('partenaires', 'securite', 'contact', 'support', 'waitlist_reply', 'other')),
  status        text not null default 'new' check (status in ('new', 'handled')),
  handled_by    uuid references auth.users(id) on delete set null,
  handled_at    timestamptz,
  note          text,
  raw           jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now()
);

comment on table public.inbound_mail is
  'Courrier reçu sur les boîtes du domaine, poussé par le webhook Hostinger. Sert de file « à traiter » au backoffice ; la lecture se fait dans la boîte.';

-- Un même message notifié deux fois (rejeu du webhook) ne fait qu'une ligne.
create unique index if not exists inbound_mail_message_id_key
  on public.inbound_mail (message_id) where message_id is not null;
create unique index if not exists inbound_mail_mailbox_uid_key
  on public.inbound_mail (mailbox, folder, uid) where uid is not null;
create index if not exists inbound_mail_status_idx
  on public.inbound_mail (status, created_at desc);

alter table public.inbound_mail enable row level security;
revoke all on public.inbound_mail from anon, authenticated;
-- Aucune policy : tout passe par les RPC ci-dessous.

-- ---------------------------------------------------------------------------
-- 1. Le secret du webhook vit dans Vault, comme MultiPay (051) et Brevo (054)
-- ---------------------------------------------------------------------------
-- Clé attendue : HOSTINGER_MAIL_WEBHOOK_SECRET (variable d'environnement de la
-- fonction en priorité, coffre à défaut). Une seule valeur par webhook : si le
-- secret est régénéré chez Hostinger, le remplacer ici.
create or replace function public.mail_webhook_config()
returns jsonb
language sql
security definer
set search_path = ''
stable
as $$
  select coalesce(jsonb_object_agg(name, decrypted_secret), '{}'::jsonb)
    from vault.decrypted_secrets
   where name like 'HOSTINGER\_MAIL\_%';
$$;

revoke all on function public.mail_webhook_config() from public, anon, authenticated;
grant execute on function public.mail_webhook_config() to service_role;

-- ---------------------------------------------------------------------------
-- 2. Enregistrer une notification (service_role uniquement)
-- ---------------------------------------------------------------------------
-- p_mail est déjà normalisé par la fonction Edge :
--   { message_id, mailbox, folder, uid, from_name, from_address,
--     to_addresses[], subject, received_at, in_reply_to, raw }
-- La classification se fait ici, pas dans la fonction : c'est la règle métier,
-- elle doit vivre avec la table.
create or replace function public.record_inbound_mail(p_mail jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_to        text[];
  v_to_lower  text;
  v_category  text := 'other';
  v_subject   text := left(coalesce(p_mail->>'subject', ''), 500);
  v_id        bigint;
  v_inserted  boolean := false;
begin
  select coalesce(array_agg(lower(btrim(x))), '{}')
    into v_to
  from jsonb_array_elements_text(coalesce(p_mail->'to_addresses', '[]'::jsonb)) as x;
  v_to_lower := array_to_string(v_to, ',');

  if v_to_lower like '%partenaires@zola-rdc.com%' then
    v_category := 'partenaires';
  elsif v_to_lower like '%securite@zola-rdc.com%' then
    v_category := 'securite';
  elsif v_to_lower like '%contact@zola-rdc.com%' then
    v_category := 'contact';
  elsif v_to_lower like '%support@zola-rdc.com%' then
    if coalesce(p_mail->>'in_reply_to', '') <> ''
       or v_subject ilike 're:%tu es sur la liste%' then
      v_category := 'waitlist_reply';
    else
      v_category := 'support';
    end if;
  end if;

  insert into public.inbound_mail
    (message_id, mailbox, folder, uid, from_name, from_address, to_addresses,
     subject, received_at, category, raw)
  values (
    nullif(btrim(coalesce(p_mail->>'message_id', '')), ''),
    nullif(p_mail->>'mailbox', ''),
    nullif(p_mail->>'folder', ''),
    nullif(p_mail->>'uid', '')::bigint,
    left(coalesce(p_mail->>'from_name', ''), 200),
    lower(left(coalesce(p_mail->>'from_address', ''), 254)),
    v_to,
    v_subject,
    nullif(p_mail->>'received_at', '')::timestamptz,
    v_category,
    coalesce(p_mail->'raw', '{}'::jsonb)
  )
  on conflict do nothing
  returning id into v_id;
  v_inserted := v_id is not null;

  -- Un message sécurité des enfants laisse une trace dans l'historique des
  -- actions dès sa réception : c'est ce que l'équipe regarde en premier.
  if v_inserted and v_category = 'securite' then
    perform public.log_admin_action(
      null, 'inbound_mail_securite', null,
      format('Message reçu sur securite@ de %s : « %s »',
        coalesce(nullif(p_mail->>'from_address', ''), 'expéditeur inconnu'), v_subject),
      'inbound_mail', v_id::text,
      jsonb_build_object('from', p_mail->>'from_address', 'subject', v_subject));
  end if;

  return jsonb_build_object('inserted', v_inserted, 'id', v_id, 'category', v_category);
end;
$$;

revoke all on function public.record_inbound_mail(jsonb) from public, anon, authenticated;
grant execute on function public.record_inbound_mail(jsonb) to service_role;

-- ---------------------------------------------------------------------------
-- 3. Backoffice
-- ---------------------------------------------------------------------------
create or replace function public.admin_inbound_mail_counts()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'new', (select count(*) from public.inbound_mail where status = 'new'),
    'securite_new', (select count(*) from public.inbound_mail where status = 'new' and category = 'securite')
  )
  where public.require_admin() is not null;
$$;

create or replace function public.admin_list_inbound_mail(
  p_status text default null,
  p_limit  integer default 300
)
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
      'from_name', m.from_name,
      'from_address', m.from_address,
      'to_addresses', to_jsonb(m.to_addresses),
      'subject', m.subject,
      'received_at', coalesce(m.received_at, m.created_at),
      'handled_at', m.handled_at,
      'handled_by_email', (select u.email from auth.users u where u.id = m.handled_by),
      'note', m.note
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

create or replace function public.admin_handle_inbound_mail(
  p_id      bigint,
  p_handled boolean,
  p_note    text default null
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_admin uuid := public.require_admin();
begin
  update public.inbound_mail
     set status     = case when p_handled then 'handled' else 'new' end,
         handled_by = case when p_handled then v_admin else null end,
         handled_at = case when p_handled then now() else null end,
         note       = coalesce(nullif(btrim(p_note), ''), note)
   where id = p_id;
  if not found then raise exception 'introuvable'; end if;
end;
$$;

revoke all on function public.admin_inbound_mail_counts() from public, anon;
revoke all on function public.admin_list_inbound_mail(text, integer) from public, anon;
revoke all on function public.admin_handle_inbound_mail(bigint, boolean, text) from public, anon;
grant execute on function public.admin_inbound_mail_counts() to authenticated;
grant execute on function public.admin_list_inbound_mail(text, integer) to authenticated;
grant execute on function public.admin_handle_inbound_mail(bigint, boolean, text) to authenticated;
