-- ---------------------------------------------------------------------------
-- 062 : le formulaire de contact du site arrive dans le Courrier du backoffice
--
-- La page contact propose un formulaire où l'on choisit d'abord son besoin
-- (soirée ou partenariat, souci de compte, signalement, sécurité d'un enfant,
-- données personnelles, presse, autre). Chaque besoin a ses champs propres.
--
-- Pas de nouveau circuit : le message est rangé dans inbound_mail (057, 058),
-- dans la même catégorie que s'il avait été écrit à l'adresse du sujet. Il
-- apparaît donc dans l'onglet Courrier, avec le même tri, le même compteur,
-- et pour la sécurité des enfants la même trace dans l'historique des actions.
-- La colonne source distingue le courrier reçu (mail) du formulaire (site).
--
-- Garde-fous, tous côté base puisque la fonction est ouverte à anon :
--   - sujet dans une liste fermée, adresse e-mail valide, message de 10 à
--     4 000 caractères, champs bornés en longueur ;
--   - champ piège (p_website) : rempli, il signe un robot, on répond « ok »
--     sans rien enregistrer ;
--   - 3 envois par adresse et par heure, 60 envois par 10 minutes au total.
-- ---------------------------------------------------------------------------

alter table public.inbound_mail
  add column if not exists source text not null default 'mail';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'inbound_mail_source_check'
  ) then
    alter table public.inbound_mail
      add constraint inbound_mail_source_check check (source in ('mail', 'site'));
  end if;
end $$;

create index if not exists inbound_mail_site_recent_idx
  on public.inbound_mail (from_address, created_at desc) where source = 'site';

create or replace function public.submit_contact_form(
  p_topic   text,
  p_name    text,
  p_email   text,
  p_message text,
  p_phone   text  default null,
  p_details jsonb default '{}'::jsonb,
  p_website text  default null
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email    text := lower(btrim(coalesce(p_email, '')));
  v_name     text := left(btrim(coalesce(p_name, '')), 120);
  v_phone    text := nullif(left(btrim(coalesce(p_phone, '')), 40), '');
  v_message  text := btrim(coalesce(p_message, ''));
  v_label    text;
  v_category text;
  v_to       text;
  v_lines    text := '';
  v_key      text;
  v_val      text;
  v_n        integer := 0;
  v_ref      text;
  v_subject  text;
  v_id       bigint;
begin
  -- Robot : le champ invisible est rempli. Réponse neutre, rien n'est gardé.
  if coalesce(btrim(p_website), '') <> '' then
    return 'ok';
  end if;

  select t.label, t.category, t.address
    into v_label, v_category, v_to
  from (values
    ('partenariat', 'Organiser une soirée, partenariat', 'partenaires', 'partenaires@zola-rdc.com'),
    ('support',     'Souci avec mon compte',            'support',     'support@zola-rdc.com'),
    ('signalement', 'Signaler un membre',               'support',     'support@zola-rdc.com'),
    ('securite',    'Sécurité d''un enfant',            'securite',    'securite@zola-rdc.com'),
    ('donnees',     'Mes données personnelles',         'support',     'support@zola-rdc.com'),
    ('presse',      'Presse et médias',                 'contact',     'contact@zola-rdc.com'),
    ('autre',       'Une question, une idée',           'contact',     'contact@zola-rdc.com')
  ) as t(topic, label, category, address)
  where t.topic = p_topic;

  if v_label is null then
    return 'invalid_topic';
  end if;
  if v_email !~ '^[^\s@]+@[^\s@]+\.[^\s@]{2,}$' or length(v_email) > 254 then
    return 'invalid_email';
  end if;
  if length(v_name) < 2 then
    return 'invalid_name';
  end if;
  if length(v_message) < 10 or length(v_message) > 4000 then
    return 'invalid_message';
  end if;

  if (select count(*) from public.inbound_mail
       where source = 'site' and from_address = v_email
         and created_at > now() - interval '1 hour') >= 3
     or (select count(*) from public.inbound_mail
          where source = 'site' and created_at > now() - interval '10 minutes') >= 60 then
    return 'too_many';
  end if;

  -- Champs propres au besoin : 8 au plus, libellé et valeur bornés.
  if jsonb_typeof(p_details) = 'object' then
    for v_key, v_val in select key, value from jsonb_each_text(p_details) loop
      v_val := btrim(coalesce(v_val, ''));
      continue when v_val = '';
      v_n := v_n + 1;
      exit when v_n > 8;
      v_lines := v_lines || left(btrim(v_key), 60) || ' : ' || left(v_val, 300) || E'\n';
    end loop;
  end if;

  -- Une référence de rattachement pour le sujet : le lieu, le média, le
  -- profil signalé quand il y en a un, sinon le nom.
  v_ref := coalesce(
    nullif(btrim(coalesce(p_details->>'Lieu ou marque', '')), ''),
    nullif(btrim(coalesce(p_details->>'Média', '')), ''),
    v_name);
  v_subject := left(format('[Site] %s - %s', v_label, v_ref), 500);

  insert into public.inbound_mail
    (message_id, mailbox, folder, from_name, from_address, to_addresses,
     subject, received_at, category, body_preview, source, raw)
  values (
    'site-' || gen_random_uuid()::text,
    'site', 'formulaire',
    v_name, v_email, array[v_to],
    v_subject, now(), v_category,
    left(
      'Besoin : ' || v_label || E'\n'
      || 'Nom : ' || v_name || E'\n'
      || 'E-mail : ' || v_email || E'\n'
      || coalesce('Téléphone : ' || v_phone || E'\n', '')
      || v_lines || E'\n' || v_message,
      2000),
    'site',
    jsonb_build_object(
      'topic', p_topic, 'name', v_name, 'email', v_email, 'phone', v_phone,
      'details', coalesce(p_details, '{}'::jsonb), 'message', left(v_message, 4000))
  )
  returning id into v_id;

  if v_category = 'securite' then
    perform public.log_admin_action(
      null, 'inbound_mail_securite', null,
      format('Formulaire du site, sécurité des enfants, envoyé par %s', v_email),
      'inbound_mail', v_id::text,
      jsonb_build_object('from', v_email, 'subject', v_subject, 'source', 'site'));
  end if;

  return 'ok';
end;
$$;

revoke all on function public.submit_contact_form(text, text, text, text, text, jsonb, text) from public;
grant execute on function public.submit_contact_form(text, text, text, text, text, jsonb, text) to anon, authenticated;

-- Le backoffice affiche d'où vient le message.
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
      'source', m.source,
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
