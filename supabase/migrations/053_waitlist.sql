-- ---------------------------------------------------------------------------
-- 053 : LISTE D'ATTENTE DU SITE PUBLIC
--
-- Avant la mise en ligne sur les stores, le site collecte les adresses e-mail
-- des personnes qui veulent être prévenues. Le formulaire vit sur
-- apps/web/index.html et appelle `join_waitlist()` avec la clé publique, sans
-- compte : c'est la seule écriture anonyme du projet, elle est donc bornée
-- (adresse validée et normalisée, doublon silencieux, jamais de lecture).
--
-- Personne ne lit la table depuis le web hormis le backoffice, par
-- `admin_list_waitlist()` derrière require_admin(). La table elle-même n'a
-- aucune policy : ni anon ni authenticated ne la voient directement.
-- ---------------------------------------------------------------------------

create table if not exists public.waitlist (
  id          bigint generated always as identity primary key,
  email       text not null,
  source      text not null default 'site',
  platform    text check (platform in ('ios', 'android')),
  created_at  timestamptz not null default now(),
  notified_at timestamptz,
  constraint waitlist_email_lower check (email = lower(email)),
  constraint waitlist_email_len   check (char_length(email) between 6 and 254)
);

create unique index if not exists waitlist_email_key on public.waitlist (email);
create index if not exists waitlist_created_at_idx on public.waitlist (created_at desc);

alter table public.waitlist enable row level security;

revoke all on table public.waitlist from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Inscription (appel anonyme depuis le site)
-- ---------------------------------------------------------------------------
-- Retour : 'ok' (nouvelle ligne), 'already' (adresse déjà connue, on ne
-- révèle pas la différence au visiteur : le site affiche le même message),
-- 'invalid_email'.

create or replace function public.join_waitlist(
  p_email    text,
  p_platform text default null,
  p_source   text default 'site'
)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_platform text := nullif(lower(btrim(coalesce(p_platform, ''))), '');
  v_source text := left(coalesce(nullif(btrim(p_source), ''), 'site'), 40);
  v_inserted bigint;
begin
  -- Validation volontairement simple : un seul @, pas d'espace, un point dans
  -- le domaine. Le but est d'écarter les fautes de frappe évidentes, pas de
  -- réimplémenter la RFC 5322.
  if v_email !~ '^[a-z0-9._%+''-]+@[a-z0-9.-]+\.[a-z]{2,}$'
     or char_length(v_email) > 254 then
    return 'invalid_email';
  end if;

  if v_platform is not null and v_platform not in ('ios', 'android') then
    v_platform := null;
  end if;

  insert into public.waitlist (email, platform, source)
  values (v_email, v_platform, v_source)
  on conflict (email) do nothing
  returning id into v_inserted;

  return case when v_inserted is null then 'already' else 'ok' end;
end;
$$;

revoke execute on function public.join_waitlist(text, text, text) from public;
grant execute on function public.join_waitlist(text, text, text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Lecture par le backoffice
-- ---------------------------------------------------------------------------

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

revoke execute on function public.admin_list_waitlist(integer, integer) from public, anon;
grant execute on function public.admin_list_waitlist(integer, integer) to authenticated;

-- Retire une adresse (demande de la personne, ou adresse manifestement fausse).
create or replace function public.admin_remove_waitlist(p_id bigint)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_admin uuid := public.require_admin('admin');
  v_email text;
begin
  delete from public.waitlist where id = p_id returning email into v_email;
  if v_email is null then
    raise exception 'waitlist_not_found' using errcode = 'P0002';
  end if;
  perform public.log_admin_action(v_admin, 'waitlist_removed', null, null, 'waitlist', p_id::text,
    jsonb_build_object('email', v_email));
end;
$$;

revoke execute on function public.admin_remove_waitlist(bigint) from public, anon;
grant execute on function public.admin_remove_waitlist(bigint) to authenticated;
