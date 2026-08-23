-- ---------------------------------------------------------------------------
-- 050 — Un seul DM initial par personne, appliqué côté serveur
-- ---------------------------------------------------------------------------
--
-- Règle produit : un DM initial est payant (quota gratuit puis débit de
-- pièces) et donne droit à UN message. La conversation ne naît que si la
-- personne répond — c'est sa réponse qui fait passer le match de 'pending' à
-- 'active' (trigger messages_activate_pending, migration 009).
--
-- Cette règle n'était tenue que par l'interface. Deux chemins la contournaient
-- entièrement, sans rien détourner d'inhabituel :
--
--   1. send_direct_message ne facturait qu'à la CRÉATION du match. Un second
--      appel sur la même cible retrouvait le match 'pending' existant, sautait
--      tout le bloc de paiement et insérait le message gratuitement. Joignable
--      depuis l'app : il suffisait de rouvrir la fiche de la personne depuis
--      Vues, Favoris ou J'aime et de renvoyer un DM.
--
--   2. La politique messages_insert n'examinait pas `status`. Un match
--      'pending' est `is_active` : l'expéditeur pouvait donc écrire autant de
--      messages qu'il voulait dans son propre DM en attente, en passant par
--      l'écran de conversation.
--
-- Les deux se ferment ici. L'interface a été corrigée en parallèle, mais elle
-- ne peut pas être la seule barrière : ces deux chemins restent ouverts à
-- quiconque appelle l'API directement.
--
-- Base de départ : la version 037 de la fonction (règles de contenu de la 036
-- et filtre de réception de la 017 inclus). Seul le bloc `already_sent` est
-- nouveau, tout le reste est reconduit à l'identique.

-- ---------------------------------------------------------------------------
-- 1. send_direct_message : refuser le second DM au lieu de l'offrir
-- ---------------------------------------------------------------------------
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
  v_status text;
  v_initiated_by uuid;
  v_balance int;
  v_charged boolean := false;
  v_existing boolean := false;
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

  select id, is_active, status, initiated_by
    into v_match_id, v_active, v_status, v_initiated_by
  from public.matches
  where user_a = least(v_me, p_target) and user_b = greatest(v_me, p_target);

  if v_match_id is not null and not v_active then
    raise exception 'conversation_fermee';
  end if;

  -- Mon DM initial est déjà parti et attend toujours sa réponse : le droit
  -- acheté est consommé. On ne facture pas un second message, on le refuse.
  -- Rien n'est débité, rien n'est inséré.
  if v_match_id is not null and v_status = 'pending' and v_initiated_by = v_me then
    select balance into v_balance from public.coin_wallets where user_id = v_me;
    return jsonb_build_object(
      'status', 'already_sent',
      'match_id', v_match_id,
      'balance', coalesce(v_balance, 0)
    );
  end if;

  v_existing := v_match_id is not null;

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
    'charged', v_charged,
    'already_matched', v_existing
  );
end $$;

grant execute on function public.send_direct_message(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. messages_insert : l'expéditeur ne peut pas alimenter son DM en attente
-- ---------------------------------------------------------------------------
-- Reprend la politique de la migration 021 (expéditeur = moi, compte non
-- banni, match actif dont je fais partie, aucun blocage) et lui ajoute la
-- clause de statut.
--
-- Le destinataire, lui, DOIT pouvoir écrire dans un match 'pending' : c'est sa
-- réponse qui active la conversation. La clause ne vise donc que l'initiateur.
--
-- Le premier message, celui inséré par send_direct_message, n'est pas concerné :
-- la fonction est `security definer` et ne passe pas par cette politique.
drop policy if exists messages_insert on public.messages;
create policy messages_insert on public.messages
  for insert to authenticated
  with check (
    sender_id = (select auth.uid())
    and not exists (
      select 1 from public.profiles me
      where me.user_id = (select auth.uid()) and me.is_banned
    )
    and exists (
      select 1 from public.matches m
      where m.id = messages.match_id
        and m.is_active
        and (m.user_a = (select auth.uid()) or m.user_b = (select auth.uid()))
        -- Invitation DM encore sans réponse : son auteur n'écrit plus.
        and not (m.status = 'pending' and m.initiated_by = (select auth.uid()))
        and not exists (
          select 1 from public.blocks b
          where (b.blocker_id = m.user_a and b.blocked_id = m.user_b)
             or (b.blocker_id = m.user_b and b.blocked_id = m.user_a)
        )
    )
  );
