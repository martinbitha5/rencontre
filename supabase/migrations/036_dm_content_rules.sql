-- Règles de contenu du premier DM : 150 caractères maximum, pas de chiffres,
-- pas de caractères spéciaux, pas de noms de réseaux sociaux ou messageries.
-- Empêche le partage de coordonnées avant le match. Le client applique les
-- mêmes règles ; ici c'est la garantie côté serveur.

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
  if p_content is null or char_length(btrim(p_content)) < 1 or char_length(btrim(p_content)) > 150 then
    raise exception 'message_invalide';
  end if;
  if p_content ~ '[0-9]'
     or p_content ~ '[@#$%^&*()_+=<>\[\]{}/\\|~:;"`€£§°]'
     or p_content ~* '\m(whatsapp|instagram|insta|facebook|telegram|snapchat|tiktok|gmail|email|mail|numero|numéro|telephone|téléphone)\M'
  then
    raise exception 'message_contenu_interdit';
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
