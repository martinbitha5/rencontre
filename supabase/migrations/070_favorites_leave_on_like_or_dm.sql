-- 070 : un favori libère sa place dès qu'on passe à l'acte.
--
-- Avant, un favori ne sortait de la liste qu'au match actif (049,
-- drop_favorites_on_match). Un like envoyé, ou un DM encore en attente de
-- réponse, laissait la personne dans Favoris et occupait une des 10 places.
-- Désormais :
--   - un like envoyé (swipes.liked, quel que soit l'écran d'où il part) retire
--     la personne des favoris de celui qui like ;
--   - un DM, qui crée un match « pending » initié par l'expéditeur, la retire
--     des favoris de l'expéditeur ;
--   - le match actif retire toujours les deux côtés, comme avant.
-- Les favoris restent privés : seule la ligne du propriétaire est supprimée,
-- la personne concernée ne reçoit rien.

-- 1. Like envoyé ------------------------------------------------------------
create or replace function public.drop_favorite_on_like()
 returns trigger
 language plpgsql
 security definer
 set search_path to ''
as $function$
begin
  if new.liked then
    delete from public.favorites
    where user_id = new.swiper_id and target_id = new.target_id;
  end if;
  return new;
end $function$;

drop trigger if exists trg_drop_favorite_on_like on public.swipes;
create trigger trg_drop_favorite_on_like
  after insert or update of liked on public.swipes
  for each row execute function public.drop_favorite_on_like();

-- 2. DM en attente et match actif -------------------------------------------
create or replace function public.drop_favorites_on_match()
 returns trigger
 language plpgsql
 security definer
 set search_path to ''
as $function$
begin
  if new.status = 'active' and new.is_active then
    -- Match : la conversation est ouverte, les deux côtés libèrent la place.
    delete from public.favorites
    where (user_id = new.user_a and target_id = new.user_b)
       or (user_id = new.user_b and target_id = new.user_a);
  elsif new.initiated_by is not null then
    -- DM en attente : seul l'expéditeur a agi, seul son favori s'en va.
    delete from public.favorites
    where user_id = new.initiated_by
      and target_id = case when new.initiated_by = new.user_a then new.user_b else new.user_a end;
  end if;
  return new;
end $function$;

-- 3. Rattrapage : favoris déjà likés ou déjà contactés -----------------------
delete from public.favorites f
where exists (
  select 1 from public.swipes s
  where s.swiper_id = f.user_id and s.target_id = f.target_id and s.liked
)
or exists (
  select 1 from public.matches m
  where m.user_a = least(f.user_id, f.target_id)
    and m.user_b = greatest(f.user_id, f.target_id)
    and m.initiated_by = f.user_id
);
