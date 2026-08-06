-- Dowe : la limite de 10 favoris était contournable et l'app pouvait afficher
-- « 12/10 ». Deux causes : (1) deux ajouts simultanés lisaient chacun un
-- compte à 9 et passaient tous les deux ; (2) les favoris de profils ensuite
-- matchés restaient en base (le client et get_favorites les masquaient
-- seulement), et consommaient le quota en silence. Trois verrous :
--   1) add_favorite se sérialise par utilisateur (verrou consultatif),
--   2) un match actif efface le favori en base, dans les deux sens,
--   3) nettoyage des comptes déjà au-dessus de la limite.

-- 1. Ajout sous verrou : deux appuis rapides ne peuvent plus se croiser.
create or replace function public.add_favorite(p_target uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_me uuid := (select auth.uid());
begin
  if v_me is null then raise exception 'non_authentifie'; end if;
  if p_target = v_me then raise exception 'cible_invalide'; end if;
  if not exists (
    select 1 from public.profiles where user_id = p_target and is_onboarded and not is_banned
  ) then raise exception 'profil_introuvable'; end if;
  -- Sérialise les ajouts d'un même utilisateur le temps de la transaction :
  -- sans ce verrou, deux appuis simultanés voyaient tous deux 9 favoris.
  perform pg_advisory_xact_lock(hashtextextended('favorites:' || v_me::text, 0));
  if (select count(*) from public.favorites where user_id = v_me) >= 10 then
    return jsonb_build_object('status', 'limit_reached');
  end if;
  insert into public.favorites (user_id, target_id) values (v_me, p_target)
  on conflict do nothing;
  return jsonb_build_object('status', 'ok');
end $$;

-- 2. Un match actif retire le favori en base. Le client le retirait déjà de
-- l'écran et get_favorites l'excluait ; la ligne fantôme, elle, restait et
-- mangeait le quota.
create or replace function public.drop_favorites_on_match()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.status = 'active' and new.is_active then
    delete from public.favorites
    where (user_id = new.user_a and target_id = new.user_b)
       or (user_id = new.user_b and target_id = new.user_a);
  end if;
  return new;
end $$;

drop trigger if exists trg_drop_favorites_on_match on public.matches;
create trigger trg_drop_favorites_on_match
after insert or update of status, is_active on public.matches
for each row execute function public.drop_favorites_on_match();

-- 3a. Purge des favoris déjà masqués par un match actif.
delete from public.favorites f
where exists (
  select 1 from public.matches m
  where m.user_a = least(f.user_id, f.target_id)
    and m.user_b = greatest(f.user_id, f.target_id)
    and m.is_active and m.status = 'active'
);

-- 3b. Les comptes au-dessus de 10 redescendent à 10 : les plus anciens
-- favoris sortent en premier.
delete from public.favorites f
where (f.user_id, f.target_id) in (
  select user_id, target_id from (
    select user_id, target_id,
      row_number() over (partition by user_id order by created_at desc) as rn
    from public.favorites
  ) ranked
  where rn > 10
);
