-- ---------------------------------------------------------------------------
-- 054 : e-mail de confirmation à l'inscription sur la liste d'attente
--
-- Le site n'appelle plus join_waitlist() en direct : il passe par la fonction
-- Edge `waitlist-join`, qui enregistre l'adresse (même RPC, en service_role)
-- puis envoie un e-mail de bienvenue par l'API transactionnelle Brevo. La clé
-- Brevo ne peut pas vivre dans la page publique ; elle vit dans
-- l'environnement de la fonction ou, à défaut, dans le coffre Vault, exactement
-- comme la configuration MultiPay (migration 051).
--
-- La date d'envoi est notée dans la ligne : le backoffice la montre, et une
-- adresse déjà inscrite ne reçoit pas un second e-mail à chaque nouvel essai.
-- ---------------------------------------------------------------------------

alter table public.waitlist
  add column if not exists welcome_sent_at timestamptz;

-- Configuration Brevo de la liste d'attente, lue par la fonction Edge.
-- Clés attendues dans Vault (ou en variables d'environnement, prioritaires) :
--   BREVO_API_KEY        clé API v3 (xkeysib-…), pas la clé SMTP
--   BREVO_SENDER_EMAIL   expéditeur validé chez Brevo (défaut support@zola-rdc.com)
--   BREVO_SENDER_NAME    nom affiché (défaut Zola)
create or replace function public.waitlist_config()
returns jsonb
language sql
security definer
set search_path = ''
stable
as $$
  select coalesce(jsonb_object_agg(name, decrypted_secret), '{}'::jsonb)
    from vault.decrypted_secrets
   where name like 'BREVO\_%';
$$;

comment on function public.waitlist_config() is
  'Configuration Brevo déchiffrée depuis Vault. Réservée au service_role : '
  'la clé permet d''envoyer des e-mails au nom de Zola.';

revoke all on function public.waitlist_config() from public;
revoke all on function public.waitlist_config() from anon;
revoke all on function public.waitlist_config() from authenticated;
grant execute on function public.waitlist_config() to service_role;

-- Marque l'e-mail comme envoyé. Réservé au service_role (fonction Edge).
create or replace function public.mark_waitlist_welcome(p_email text)
returns void
language sql
volatile
security definer
set search_path = ''
as $$
  update public.waitlist
     set welcome_sent_at = now()
   where email = lower(btrim(p_email))
     and welcome_sent_at is null;
$$;

revoke all on function public.mark_waitlist_welcome(text) from public, anon, authenticated;
grant execute on function public.mark_waitlist_welcome(text) to service_role;

-- Le service_role doit pouvoir appeler join_waitlist depuis la fonction Edge.
grant execute on function public.join_waitlist(text, text, text) to service_role;

-- Le backoffice voit la date d'envoi.
create or replace function public.admin_list_waitlist(
  p_limit  integer default 500,
  p_offset integer default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_admin uuid := public.require_admin();
  v_total bigint;
  v_week  bigint;
  v_items jsonb;
begin
  select count(*), count(*) filter (where created_at > now() - interval '7 days')
    into v_total, v_week
  from public.waitlist;

  select coalesce(jsonb_agg(jsonb_build_object(
      'id', w.id,
      'email', w.email,
      'platform', w.platform,
      'source', w.source,
      'created_at', w.created_at,
      'welcome_sent_at', w.welcome_sent_at,
      'notified_at', w.notified_at
    ) order by w.created_at desc), '[]'::jsonb)
    into v_items
  from (
    select * from public.waitlist
    order by created_at desc
    limit greatest(1, least(coalesce(p_limit, 500), 5000))
    offset greatest(0, coalesce(p_offset, 0))
  ) w;

  return jsonb_build_object('total', v_total, 'week', v_week, 'items', v_items);
end;
$$;
