-- 017 : filtres de recherche avancés (structure Heyama) + filtre de réception des DM.
-- null = « pas de préférence » pour tous les filtres optionnels.
-- (Copie locale de la migration appliquée via MCP le 2026-07-26.)

alter table public.profiles
  add column if not exists search_whole_country boolean not null default false,
  add column if not exists filter_goals text[],
  add column if not exists filter_religions text[],
  add column if not exists filter_has_children text check (filter_has_children in ('oui', 'non')),
  add column if not exists filter_smoking text check (filter_smoking in ('oui', 'non')),
  add column if not exists filter_online_only boolean not null default false,
  add column if not exists filter_dm_strict boolean not null default false;

-- Les updates de profils passent par des grants de colonnes : ne pas oublier les nouvelles.
grant update (search_whole_country, filter_goals, filter_religions, filter_has_children,
  filter_smoking, filter_online_only, filter_dm_strict)
  on public.profiles to authenticated;

-- Feed Découvrir : mêmes règles qu'avant + application des nouveaux filtres du chercheur.
create or replace function public.get_discovery_feed(p_limit integer default 20)
returns table(user_id uuid, display_name text, birth_date date, gender public.gender,
  city_name text, bio text, photos jsonb, last_active_at timestamptz,
  height_cm smallint, job_title text, education text, relationship_goal text,
  has_children text, wants_children text, smoking text, drinking text,
  religion text, commune text, languages text[], interests text[])
language sql stable security definer set search_path to ''
as $$
  select p.user_id, p.display_name, p.birth_date, p.gender, c.name, p.bio,
    coalesce((
      select jsonb_agg(jsonb_build_object('id', ph.id, 'path', ph.storage_path) order by ph.position)
      from public.photos ph where ph.user_id = p.user_id
    ), '[]'::jsonb),
    p.last_active_at,
    p.height_cm, p.job_title, p.education, p.relationship_goal,
    p.has_children, p.wants_children, p.smoking, p.drinking,
    p.religion, p.commune, p.languages, p.interests
  from public.profiles p
  join public.cities c on c.id = p.city_id
  join public.profiles me on me.user_id = (select auth.uid())
  where p.user_id <> me.user_id
    and me.is_onboarded and not me.is_banned
    and p.is_onboarded and not p.is_banned
    and not p.incognito
    and (p.city_id = me.city_id or me.search_whole_country)
    and p.gender = me.looking_for
    and p.looking_for = me.gender
    and extract(year from age(p.birth_date))::int between me.age_min and me.age_max
    and extract(year from age(me.birth_date))::int between p.age_min and p.age_max
    -- Filtres optionnels du chercheur (null = pas de préférence).
    and (me.filter_goals is null or p.relationship_goal = any(me.filter_goals))
    and (me.filter_religions is null or p.religion = any(me.filter_religions))
    and (me.filter_has_children is null or p.has_children = me.filter_has_children)
    and (me.filter_smoking is null
      or (me.filter_smoking = 'non' and p.smoking = 'jamais')
      or (me.filter_smoking = 'oui' and p.smoking in ('parfois', 'souvent')))
    and (not me.filter_online_only or p.last_active_at > now() - interval '15 minutes')
    and not exists (select 1 from public.swipes s where s.swiper_id = me.user_id and s.target_id = p.user_id)
    and not exists (
      select 1 from public.swipes sl
      where sl.swiper_id = p.user_id and sl.target_id = me.user_id and sl.liked
    )
    and not exists (
      select 1 from public.matches m
      where m.user_a = least(me.user_id, p.user_id) and m.user_b = greatest(me.user_id, p.user_id)
    )
    and not exists (
      select 1 from public.blocks b
      where (b.blocker_id = me.user_id and b.blocked_id = p.user_id)
         or (b.blocker_id = p.user_id and b.blocked_id = me.user_id)
    )
  order by p.last_active_at desc
  limit least(greatest(p_limit, 1), 50);
$$;

-- Le destinataire peut exiger que seuls les profils correspondant à ses
-- critères lui écrivent en premier (filter_dm_strict).
create or replace function public.send_direct_message(p_target uuid, p_content text)
returns jsonb
language plpgsql security definer set search_path to ''
as $$
declare
  v_me uuid := (select auth.uid());
  v_cost int := coalesce(public.economy_value('dm_cost'), 5);
  v_quota int := coalesce(public.economy_value('free_dm_quota'), 5);
  v_free_used int;
  v_match_id uuid;
  v_active boolean;
  v_balance int;
  v_charged boolean := false;
begin
  if v_me is null then raise exception 'non_authentifie'; end if;
  if p_target = v_me then raise exception 'cible_invalide'; end if;
  if p_content is null or char_length(btrim(p_content)) < 1 or char_length(p_content) > 2000 then
    raise exception 'message_invalide';
  end if;
  if not exists (
    select 1 from public.profiles where user_id = p_target and is_onboarded and not is_banned
  ) then raise exception 'profil_introuvable'; end if;
  if exists (
    select 1 from public.blocks b
    where (b.blocker_id = v_me and b.blocked_id = p_target)
       or (b.blocker_id = p_target and b.blocked_id = v_me)
  ) then raise exception 'bloque'; end if;

  -- Filtre de réception : le destinataire n'accepte que les DM des profils
  -- qui correspondent à ses critères (sauf conversation déjà existante).
  if exists (
    select 1
    from public.profiles t, public.profiles s
    where t.user_id = p_target and s.user_id = v_me and t.filter_dm_strict
      and (
        s.gender <> t.looking_for
        or extract(year from age(s.birth_date))::int not between t.age_min and t.age_max
        or (not t.search_whole_country and s.city_id <> t.city_id)
        or (t.filter_goals is not null
            and (s.relationship_goal is null or not (s.relationship_goal = any(t.filter_goals))))
      )
  ) and not exists (
    select 1 from public.matches m
    where m.user_a = least(v_me, p_target) and m.user_b = greatest(v_me, p_target)
  ) then
    raise exception 'dm_filtre';
  end if;

  select id, is_active into v_match_id, v_active
  from public.matches
  where user_a = least(v_me, p_target) and user_b = greatest(v_me, p_target);

  if v_match_id is not null and not v_active then
    raise exception 'conversation_fermee';
  end if;

  if v_match_id is null then
    -- Nouvelle conversation : quota gratuit d'abord, puis débit de coins.
    perform public.ensure_wallet(v_me);
    select free_dms_used into v_free_used from public.coin_wallets where user_id = v_me;
    if v_free_used < v_quota then
      update public.coin_wallets
      set free_dms_used = free_dms_used + 1, updated_at = now()
      where user_id = v_me;
    else
      if not public.debit_coins(v_me, v_cost, 'dm', p_target) then
        select balance into v_balance from public.coin_wallets where user_id = v_me;
        return jsonb_build_object('status', 'insufficient_coins', 'cost', v_cost,
          'balance', coalesce(v_balance, 0));
      end if;
      v_charged := true;
    end if;

    insert into public.matches (user_a, user_b, status, origin, initiated_by)
    values (least(v_me, p_target), greatest(v_me, p_target), 'pending', 'dm', v_me)
    returning id into v_match_id;
  end if;

  insert into public.messages (match_id, sender_id, content)
  values (v_match_id, v_me, btrim(p_content));

  select balance, free_dms_used into v_balance, v_free_used
  from public.coin_wallets where user_id = v_me;
  return jsonb_build_object(
    'status', 'sent', 'match_id', v_match_id,
    'balance', coalesce(v_balance, 0),
    'free_dms_left', greatest(v_quota - coalesce(v_free_used, 0), 0),
    'charged', v_charged
  );
end $$;
