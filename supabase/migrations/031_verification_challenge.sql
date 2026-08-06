-- 031 : le geste de vérification est tiré au sort PAR LE SERVEUR.
--
-- Jusqu'ici l'app tirait le geste au hasard et l'envoyait à request_verification().
-- Deux trous : on pouvait appeler la RPC directement en annonçant le geste de
-- son choix, et surtout redémarrer l'application jusqu'à tomber sur un geste
-- correspondant à une photo déjà en sa possession. Le tirage perdait tout son
-- sens : c'est précisément parce que le geste est imprévisible qu'une photo
-- récupérée ailleurs ne peut pas y répondre.
--
-- Désormais : un geste est assigné au compte, il reste le même tant que la
-- demande n'est pas tranchée (on peut donc fermer l'app et revenir), et il est
-- retiré au sort après un refus — sinon un compte refusé rejouerait avec un
-- geste qu'il connaît déjà.

create table if not exists public.verification_challenges (
  user_id     uuid primary key references public.profiles(user_id) on delete cascade,
  gesture     text not null,
  assigned_at timestamptz not null default now()
);

alter table public.verification_challenges enable row level security;
-- Aucune politique de lecture directe : le geste ne se lit que par la RPC.
revoke all on public.verification_challenges from anon, authenticated;

-- Catalogue serveur. L'app ne fait que traduire ces codes en libellés ; si elle
-- reçoit un code inconnu elle affiche un texte générique plutôt que de mentir.
create or replace function public.draw_gesture()
returns text language sql volatile set search_path = '' as $$
  select (array['main_ouverte', 'pouce_leve', 'signe_v', 'main_joue',
                'main_sur_tete', 'trois_doigts', 'index_leve', 'paume_face'])
         [1 + floor(random() * 8)::int];
$$;

-- Geste en cours pour ce compte, tiré s'il n'y en a pas encore.
create or replace function public.get_verification_challenge()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_me uuid := (select auth.uid());
  v_gesture text;
begin
  if v_me is null then raise exception 'not_authenticated'; end if;

  select gesture into v_gesture
  from public.verification_challenges where user_id = v_me;

  if v_gesture is null then
    v_gesture := public.draw_gesture();
    insert into public.verification_challenges (user_id, gesture)
    values (v_me, v_gesture)
    on conflict (user_id) do nothing;
    -- Course possible entre deux appels : on relit ce qui a réellement été posé.
    select gesture into v_gesture
    from public.verification_challenges where user_id = v_me;
  end if;

  return jsonb_build_object('gesture', v_gesture);
end $$;

-- Le geste n'est plus un paramètre : il vient de la table, point.
drop function if exists public.request_verification(text, text);
create or replace function public.request_verification(p_path text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_me uuid := (select auth.uid());
  v_gesture text;
  v_id uuid;
begin
  if v_me is null then raise exception 'not_authenticated'; end if;
  if p_path is null or split_part(p_path, '/', 1) <> v_me::text then
    raise exception 'invalid_path';
  end if;
  if exists (select 1 from public.profiles p where p.user_id = v_me and p.is_banned) then
    raise exception 'account_banned';
  end if;
  if exists (select 1 from public.profiles p where p.user_id = v_me and p.is_verified) then
    raise exception 'already_verified';
  end if;
  if not exists (select 1 from public.photos ph where ph.user_id = v_me) then
    raise exception 'no_profile_photo';
  end if;
  if exists (
    select 1 from public.verification_requests r
    where r.user_id = v_me and r.status = 'pending'
  ) then
    raise exception 'already_pending';
  end if;

  select gesture into v_gesture
  from public.verification_challenges where user_id = v_me;
  if v_gesture is null then
    -- Envoi sans être passé par l'écran : on tire maintenant, la demande
    -- portera un geste que l'appelant ne pouvait pas connaître à l'avance.
    v_gesture := public.draw_gesture();
    insert into public.verification_challenges (user_id, gesture)
    values (v_me, v_gesture) on conflict (user_id) do nothing;
    select gesture into v_gesture
    from public.verification_challenges where user_id = v_me;
  end if;

  insert into public.verification_requests (user_id, selfie_path, gesture)
  values (v_me, p_path, v_gesture)
  returning id into v_id;

  return jsonb_build_object('ok', true, 'id', v_id, 'status', 'pending',
                            'gesture', v_gesture);
end $$;

-- Un refus rebat les cartes : le compte repart sur un geste qu'il ne connaît pas.
create or replace function public.admin_review_verification(
  p_id      uuid,
  p_approve boolean,
  p_reason  text default null
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_admin uuid := public.require_admin();
  v_row   public.verification_requests;
begin
  select * into v_row from public.verification_requests where id = p_id;
  if v_row.id is null then raise exception 'request_not_found'; end if;
  if v_row.status <> 'pending' then raise exception 'already_reviewed'; end if;
  if not p_approve and (p_reason is null or btrim(p_reason) = '') then
    raise exception 'reason_required';
  end if;

  update public.verification_requests
  set status = case when p_approve then 'approved' else 'rejected' end,
      reviewed_by = v_admin,
      reviewed_at = now(),
      reject_reason = case when p_approve then null else p_reason end
  where id = p_id;

  update public.profiles set is_verified = p_approve where user_id = v_row.user_id;

  if p_approve then
    delete from public.verification_challenges where user_id = v_row.user_id;
  else
    insert into public.verification_challenges (user_id, gesture)
    values (v_row.user_id, public.draw_gesture())
    on conflict (user_id) do update
      set gesture = excluded.gesture, assigned_at = now();
  end if;

  -- Le selfie a rempli son rôle : on ne conserve pas la donnée biométrique.
  begin
    delete from storage.objects
    where bucket_id = 'verifications' and name = v_row.selfie_path;
  exception when others then
    null;
  end;

  perform public.log_admin_action(
    v_admin,
    case when p_approve then 'verification_approved' else 'verification_rejected' end,
    v_row.user_id, p_reason, 'verification', p_id::text,
    jsonb_build_object('gesture', v_row.gesture)
  );

  return jsonb_build_object('ok', true, 'status',
    case when p_approve then 'approved' else 'rejected' end);
end $$;

revoke execute on function public.draw_gesture() from public, anon, authenticated;
revoke execute on function public.request_verification(text) from public, anon;
revoke execute on function public.get_verification_challenge() from public, anon;
grant execute on function public.request_verification(text) to authenticated;
grant execute on function public.get_verification_challenge() to authenticated;
