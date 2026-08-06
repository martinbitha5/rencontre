-- ============================================================================
-- 043 — Identifiant public de compte (DW-XXXXXX)
--
-- L'UUID Supabase reste la clé primaire interne, mais il ne doit plus jamais
-- servir d'identifiant visible : illisible, indictable au téléphone, et il
-- expose une clé technique dans les conversations de support. Chaque compte
-- reçoit donc à la création un identifiant court « DW- » + 6 caractères,
-- tiré dans le même alphabet sans ambiguïté que le code de parrainage
-- (migration 028) : pas de 0/O ni de 1/I, 32 caractères, soit ~1,07 milliard
-- de combinaisons — assez pour interdire la devinette, assez court pour se
-- dicter en une phrase.
--
-- Choix de conception :
--   - Aléatoire, pas séquentiel : un numéro séquentiel révèle le nombre
--     d'inscrits et l'ordre d'arrivée de chacun.
--   - Généré par TRIGGER à l'insertion du profil, pas en rattrapage paresseux :
--     le referral_code de la 028 (posé par get_rewards à la première lecture)
--     a montré le piège — un compte qui n'ouvre jamais l'écran n'a pas de code.
--   - Immuable : le trigger d'update réécrit silencieusement l'ancienne
--     valeur. Les grants de la 002 (update par liste de colonnes) empêchent
--     déjà le client d'y toucher ; le trigger protège aussi des RPC admin
--     futures qui feraient un update large par erreur.
--   - Distinct du referral_code : la 028 révoque volontairement la lecture du
--     graphe de parrainage. L'identifiant public, lui, est fait pour être vu
--     et cherché — fusionner les deux aurait exposé ce que la 028 protège.
--   - La recherche côté app passe par une RPC SECURITY INVOKER : la RLS
--     profiles_select s'applique, donc un compte banni ou bloqué (dans un
--     sens ou dans l'autre) est introuvable, exactement comme dans le feed.
--     Un profil incognito reste trouvable par identifiant exact : partager
--     son identifiant est un acte volontaire, c'est le contraire d'être
--     découvert dans un fil.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Colonne + générateur
-- ----------------------------------------------------------------------------

alter table public.profiles add column if not exists public_id text;

create or replace function public.gen_public_id()
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  -- Même alphabet que gen_referral_code (028) : lisible au téléphone.
  v_alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_code text;
begin
  loop
    v_code := 'DW-';
    for i in 1..6 loop
      v_code := v_code || substr(v_alphabet, 1 + floor(random() * 32)::int, 1);
    end loop;
    exit when not exists (select 1 from public.profiles p where p.public_id = v_code);
  end loop;
  return v_code;
end;
$$;

revoke execute on function public.gen_public_id() from public, anon, authenticated;

-- ----------------------------------------------------------------------------
-- 2. Trigger : génération à l'insertion, immuabilité à l'update
-- ----------------------------------------------------------------------------

create or replace function public.profiles_set_public_id()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.public_id is null then
      new.public_id := public.gen_public_id();
    end if;
  elsif tg_op = 'UPDATE' then
    -- Jamais modifié, silencieusement : une RPC admin qui ferait un update
    -- large ne doit pas pouvoir casser un identifiant déjà communiqué. Le
    -- passage null -> valeur reste permis : c'est le chemin du backfill.
    if old.public_id is not null then
      new.public_id := old.public_id;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_public_id on public.profiles;
create trigger profiles_public_id
  before insert or update on public.profiles
  for each row execute function public.profiles_set_public_id();

-- ----------------------------------------------------------------------------
-- 3. Backfill des comptes existants, puis verrouillage du schéma
-- ----------------------------------------------------------------------------

update public.profiles set public_id = public.gen_public_id()
where public_id is null;

alter table public.profiles alter column public_id set not null;

create unique index if not exists profiles_public_id_idx
  on public.profiles (public_id);

-- Lisible par tous les connectés (le grant table de la 001 couvre la
-- colonne) ; non modifiable par le client (le grant update de la 002 est une
-- liste de colonnes qui ne l'inclut pas).

-- ----------------------------------------------------------------------------
-- 4. Résolution côté app : identifiant -> user_id
-- ----------------------------------------------------------------------------

-- SECURITY INVOKER assumé : la RLS profiles_select filtre bannis, bloqués et
-- non-onboardés. Renvoie null si introuvable ou invisible — l'app ne peut pas
-- distinguer les deux, et c'est voulu (pas d'oracle d'existence de compte).
create or replace function public.find_user_by_public_id(p_id text)
returns uuid
language sql
stable
set search_path = ''
as $$
  select p.user_id
  from public.profiles p
  where p.public_id = 'DW-' || upper(regexp_replace(btrim(coalesce(p_id, '')), '^\s*(dw|DW)[-_ ]?', '', 'i'))
  limit 1;
$$;

revoke execute on function public.find_user_by_public_id(text) from public, anon;
grant execute on function public.find_user_by_public_id(text) to authenticated;

-- ----------------------------------------------------------------------------
-- 5. Backoffice : recherche par identifiant + fiche
-- ----------------------------------------------------------------------------

-- Copie de la 022, deux ajouts : le where matche public_id (saisie normalisée,
-- préfixe DW- optionnel) et chaque item du tableau porte public_id.
create or replace function public.admin_list_users(
  p_search text default null,
  p_filter text default 'all',
  p_limit  integer default 50,
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
  v_lim   integer := least(greatest(coalesce(p_limit, 50), 1), 200);
  v_off   integer := greatest(coalesce(p_offset, 0), 0);
  v_pubid text := 'DW-' || upper(regexp_replace(btrim(coalesce(p_search, '')), '^\s*(dw|DW)[-_ ]?', '', 'i'));
  v_out   jsonb;
begin
  with base as (
    select p.user_id, p.public_id, p.display_name, p.birth_date, p.gender, p.city_id,
           p.is_banned, p.shadowbanned, p.is_verified, p.is_onboarded,
           p.created_at, p.last_active_at, p.warnings_count
    from public.profiles p
    where (p_search is null or p_search = ''
           or p.display_name ilike '%' || p_search || '%'
           or p.user_id::text = p_search
           or p.public_id = v_pubid
           or exists (select 1 from auth.users u
                      where u.id = p.user_id and u.email ilike '%' || p_search || '%'))
      and (coalesce(p_filter, 'all') = 'all'
           or (p_filter = 'banned' and p.is_banned)
           or (p_filter = 'shadowbanned' and p.shadowbanned)
           or (p_filter = 'warned' and p.warnings_count > 0)
           or (p_filter = 'reported' and exists (
                 select 1 from public.reports r
                 where r.reported_id = p.user_id and r.status in ('pending', 'in_review')))
           or (p_filter = 'new' and p.created_at > now() - interval '7 days')
           or (p_filter = 'incomplete' and not p.is_onboarded)
           or (p_filter = 'premium' and exists (
                 select 1 from public.entitlements e
                 where e.user_id = p.user_id and e.is_premium)))
  ),
  page as (
    select b.*, row_number() over (order by b.created_at desc) as rn
    from base b
    order by b.created_at desc
    limit v_lim offset v_off
  )
  select jsonb_build_object(
    'total', (select count(*) from base),
    'items', coalesce(jsonb_agg(jsonb_build_object(
      'user_id', pg.user_id,
      'public_id', pg.public_id,
      'display_name', pg.display_name,
      'age', case when pg.birth_date is null then null
                  else extract(year from age(pg.birth_date))::int end,
      'gender', pg.gender,
      'city', (select c.name from public.cities c where c.id = pg.city_id),
      'photo', (select ph.storage_path from public.photos ph
                where ph.user_id = pg.user_id order by ph.position limit 1),
      'is_banned', pg.is_banned,
      'shadowbanned', pg.shadowbanned,
      'is_verified', pg.is_verified,
      'is_onboarded', pg.is_onboarded,
      'warnings_count', pg.warnings_count,
      'created_at', pg.created_at,
      'last_active_at', pg.last_active_at,
      'open_reports', (select count(*) from public.reports r
                       where r.reported_id = pg.user_id and r.status in ('pending', 'in_review'))
    ) order by pg.rn), '[]'::jsonb)
  ) into v_out
  from page pg;

  return coalesce(v_out, jsonb_build_object('total', 0, 'items', '[]'::jsonb));
end;
$$;

-- Copie de la 022, un seul ajout : profile.public_id.
create or replace function public.admin_user_detail(p_user_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_admin uuid := public.require_admin();
  v_out   jsonb;
begin
  select jsonb_build_object(
    'profile', jsonb_build_object(
      'user_id', p.user_id,
      'public_id', p.public_id,
      'display_name', p.display_name,
      'email', (select u.email from auth.users u where u.id = p.user_id),
      'last_sign_in_at', (select u.last_sign_in_at from auth.users u where u.id = p.user_id),
      'email_confirmed_at', (select u.email_confirmed_at from auth.users u where u.id = p.user_id),
      'birth_date', p.birth_date,
      'age', case when p.birth_date is null then null
                  else extract(year from age(p.birth_date))::int end,
      'gender', p.gender,
      'looking_for', p.looking_for,
      'city', (select c.name from public.cities c where c.id = p.city_id),
      'commune', p.commune,
      'bio', p.bio,
      'job_title', p.job_title,
      'education', p.education,
      'relationship_goal', p.relationship_goal,
      'height_cm', p.height_cm,
      'has_children', p.has_children,
      'wants_children', p.wants_children,
      'smoking', p.smoking,
      'drinking', p.drinking,
      'religion', p.religion,
      'languages', p.languages,
      'interests', p.interests,
      'is_onboarded', p.is_onboarded,
      'is_banned', p.is_banned,
      'banned_at', p.banned_at,
      'banned_until', p.banned_until,
      'ban_reason', p.ban_reason,
      'shadowbanned', p.shadowbanned,
      'warnings_count', p.warnings_count,
      'is_verified', p.is_verified,
      'incognito', p.incognito,
      'created_at', p.created_at,
      'last_active_at', p.last_active_at,
      'is_premium', coalesce((select e.is_premium from public.entitlements e where e.user_id = p.user_id), false)
    ),
    'photos', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', ph.id, 'path', ph.storage_path, 'position', ph.position,
        'status', ph.moderation_status, 'created_at', ph.created_at
      ) order by ph.position)
      from public.photos ph where ph.user_id = p.user_id
    ), '[]'::jsonb),
    'wallet', jsonb_build_object(
      'balance', coalesce((select w.balance from public.coin_wallets w where w.user_id = p.user_id), 0),
      'free_dms_used', coalesce((select w.free_dms_used from public.coin_wallets w where w.user_id = p.user_id), 0),
      'spent_total', coalesce((select -sum(t.amount) from public.coin_transactions t where t.user_id = p.user_id and t.amount < 0), 0),
      'recharged_total', coalesce((select sum(t.amount) from public.coin_transactions t where t.user_id = p.user_id and t.kind = 'recharge'), 0)
    ),
    'stats', jsonb_build_object(
      'likes_sent',       (select count(*) from public.swipes s where s.swiper_id = p.user_id and s.liked),
      'passes_sent',      (select count(*) from public.swipes s where s.swiper_id = p.user_id and not s.liked),
      'likes_received',   (select count(*) from public.swipes s where s.target_id = p.user_id and s.liked),
      'matches',          (select count(*) from public.matches m where (m.user_a = p.user_id or m.user_b = p.user_id) and m.is_active),
      'messages_sent',    (select count(*) from public.messages g where g.sender_id = p.user_id),
      'reports_against',  (select count(*) from public.reports r where r.reported_id = p.user_id),
      'reports_filed',    (select count(*) from public.reports r where r.reporter_id = p.user_id),
      'blocked_by_count', (select count(*) from public.blocks b where b.blocked_id = p.user_id),
      'events',           (select count(*) from public.event_attendees a where a.user_id = p.user_id)
    ),
    'sanctions', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', s.id, 'kind', s.kind, 'reason', s.reason, 'notes', s.notes,
        'created_at', s.created_at, 'expires_at', s.expires_at,
        'lifted_at', s.lifted_at, 'lifted_reason', s.lifted_reason,
        'by', (select u.email from auth.users u where u.id = s.created_by)
      ) order by s.created_at desc)
      from public.user_sanctions s where s.user_id = p.user_id
    ), '[]'::jsonb),
    'notes', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', n.id, 'body', n.body, 'created_at', n.created_at,
        'author', (select u.email from auth.users u where u.id = n.author_id)
      ) order by n.created_at desc)
      from public.user_notes n where n.user_id = p.user_id
    ), '[]'::jsonb),
    'reports', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', r.id, 'created_at', r.created_at, 'reason', r.reason,
        'details', r.details, 'status', r.status, 'severity', r.severity,
        'resolution', r.resolution, 'match_id', r.match_id,
        'reporter', (select p2.display_name from public.profiles p2 where p2.user_id = r.reporter_id)
      ) order by r.created_at desc)
      from public.reports r where r.reported_id = p.user_id
    ), '[]'::jsonb),
    'conversations', coalesce((
      select jsonb_agg(jsonb_build_object(
        'match_id', m.id,
        'other_id', case when m.user_a = p.user_id then m.user_b else m.user_a end,
        'other_name', (select p3.display_name from public.profiles p3
                       where p3.user_id = case when m.user_a = p.user_id then m.user_b else m.user_a end),
        'status', m.status,
        'origin', m.origin,
        'created_at', m.created_at,
        'messages', (select count(*) from public.messages g where g.match_id = m.id)
      ) order by m.created_at desc)
      from public.matches m
      where (m.user_a = p.user_id or m.user_b = p.user_id)
    ), '[]'::jsonb)
  ) into v_out
  from public.profiles p
  where p.user_id = p_user_id;

  if v_out is null then
    raise exception 'user_not_found';
  end if;

  return v_out;
end;
$$;
