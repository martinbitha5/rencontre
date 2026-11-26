-- ---------------------------------------------------------------------------
-- 058 : le courrier reçu garde un extrait du texte
--
-- L'envoi de test du webhook (15/09/2026) a montré le format réel de la
-- notification Hostinger :
--   { id, event: "message.received", timestamp,
--     data: { mailboxAddress, from, to[], cc[], date, subject, messageId,
--             plainBody, htmlBody, bodyUrl, attachments[] } }
-- Le texte du message y est (plainBody) : on en garde les 2 000 premiers
-- caractères pour que le backoffice montre de quoi il s'agit sans ouvrir la
-- boîte. Pas plus : la file sert à trier, la lecture complète reste dans la
-- boîte, et un texte entier avec pièces jointes n'a rien à faire en base.
-- ---------------------------------------------------------------------------

alter table public.inbound_mail
  add column if not exists body_preview text;

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
     subject, received_at, category, body_preview, raw)
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
    nullif(left(coalesce(p_mail->>'body_preview', ''), 2000), ''),
    coalesce(p_mail->'raw', '{}'::jsonb)
  )
  on conflict do nothing
  returning id into v_id;
  v_inserted := v_id is not null;

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
      'body_preview', m.body_preview,
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
