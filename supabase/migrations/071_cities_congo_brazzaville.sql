-- 071 : grandes villes de la RDC et Congo-Brazzaville.
--
-- 1. Les villes portent désormais leur pays : 'CD' (RDC) ou 'CG'
--    (Congo-Brazzaville). Toutes les villes existantes sont en RDC.
-- 2. Dix grandes villes de RDC qui ne sont pas chefs-lieux s'ajoutent aux 26
--    chefs-lieux de province (Butembo, Beni, Uvira, Likasi, Kikwit...).
-- 3. Le Congo-Brazzaville arrive avec ses villes principales, au moins une
--    par département (le Kouilou est couvert par Pointe-Noire).
-- 4. « Tout le pays » reste dans le pays de la personne : chercher dans toute
--    la RDC depuis Kinshasa ne montre pas Brazzaville, et inversement. Dans sa
--    ville, chacun ne voit que sa ville, comme avant.
--
-- L'app est gratuite : rien de payant ne dépend du pays. Le paiement des
-- soirées (Mobile Money en CDF, numéros +243) reste à adapter pour le Congo.
-- Les identifiants sont posés à la main : la colonne id n'a pas de séquence.

alter table public.cities
  add column if not exists country text not null default 'CD'
  check (country in ('CD', 'CG'));

-- Retour sur 044 (une seule ville par province) : Butembo, Beni, Likasi ou
-- Kikwit sont de vraies villes, souvent à des centaines de kilomètres du
-- chef-lieu, et leurs habitants ne se reconnaissaient pas dans « Goma » ou
-- « Bandundu ». Décision produit du 27/11/2026 : elles reviennent. Les
-- profils rattachés au chef-lieu par 044 y restent, chacun peut changer de
-- ville dans ses préférences. Le nom reste unique (cities_name_key).
drop index if exists public.cities_one_per_province_idx;

insert into public.cities (id, name, province, country) values
  -- RDC, grandes villes hors chefs-lieux
  (34, 'Butembo', 'Nord-Kivu', 'CD'),
  (35, 'Beni', 'Nord-Kivu', 'CD'),
  (36, 'Uvira', 'Sud-Kivu', 'CD'),
  (37, 'Likasi', 'Haut-Katanga', 'CD'),
  (38, 'Kikwit', 'Kwilu', 'CD'),
  (39, 'Boma', 'Kongo-Central', 'CD'),
  (40, 'Mwene-Ditu', 'Lomami', 'CD'),
  (41, 'Kipushi', 'Haut-Katanga', 'CD'),
  (42, 'Mbanza-Ngungu', 'Kongo-Central', 'CD'),
  (43, 'Zongo', 'Sud-Ubangi', 'CD'),
  -- Congo-Brazzaville
  (50, 'Brazzaville', 'Brazzaville', 'CG'),
  (51, 'Pointe-Noire', 'Pointe-Noire', 'CG'),
  (52, 'Dolisie', 'Niari', 'CG'),
  (53, 'Nkayi', 'Bouenza', 'CG'),
  (54, 'Madingou', 'Bouenza', 'CG'),
  (55, 'Ouesso', 'Sangha', 'CG'),
  (56, 'Owando', 'Cuvette', 'CG'),
  (57, 'Oyo', 'Cuvette', 'CG'),
  (58, 'Impfondo', 'Likouala', 'CG'),
  (59, 'Sibiti', 'Lékoumou', 'CG'),
  (60, 'Djambala', 'Plateaux', 'CG'),
  (61, 'Kinkala', 'Pool', 'CG'),
  (62, 'Ewo', 'Cuvette-Ouest', 'CG'),
  (63, 'Mossendjo', 'Niari', 'CG')
on conflict (id) do update set
  name = excluded.name, province = excluded.province, country = excluded.country;

-- « Tout le pays » : même pays que la personne. Seule la ligne du périmètre
-- change par rapport à 069.
create or replace function public.get_discovery_feed(p_limit integer default 20)
 returns table(user_id uuid, display_name text, birth_date date, gender public.gender, city_name text, bio text, photos jsonb, last_active_at timestamp with time zone, height_cm smallint, job_title text, education text, relationship_goal text, has_children text, wants_children text, smoking text, drinking text, religion text, commune text, languages text[], interests text[], is_verified boolean)
 language plpgsql
 stable security definer
 set search_path to ''
 set plan_cache_mode to 'force_custom_plan'
as $function$
#variable_conflict use_column
declare
  me         public.profiles%rowtype;
  my_age     int;
  my_country text;
  d_min      date;
  d_max      date;
begin
  select * into me from public.profiles p where p.user_id = (select auth.uid());

  if me.user_id is null or not me.is_onboarded or me.is_banned then
    return;
  end if;

  select ci.country into my_country from public.cities ci where ci.id = me.city_id;

  my_age := extract(year from age(me.birth_date))::int;
  d_min  := (current_date - ((me.age_max + 1) || ' years')::interval)::date;
  d_max  := (current_date - (me.age_min || ' years')::interval)::date;

  return query
  select p.user_id, p.display_name, p.birth_date, p.gender, c.name, p.bio,
    coalesce((
      select jsonb_agg(jsonb_build_object('id', ph.id, 'path', ph.storage_path) order by ph.position)
      from public.photos ph where ph.user_id = p.user_id
    ), '[]'::jsonb),
    case when p.incognito or not p.show_online then null else p.last_active_at end,
    p.height_cm, p.job_title, p.education, p.relationship_goal,
    p.has_children, p.wants_children, p.smoking, p.drinking,
    p.religion, p.commune, p.languages, p.interests,
    p.is_verified
  from public.profiles p
  join public.cities c on c.id = p.city_id
  where p.user_id <> me.user_id
    and p.is_onboarded and not p.is_banned
    and not p.shadowbanned
    and not p.incognito
    -- Sa ville, ou tout son pays : jamais l'autre rive du fleuve sans le vouloir.
    and (p.city_id = me.city_id
      or (me.search_whole_country and c.country = coalesce(my_country, 'CD')))
    and p.gender = me.looking_for
    and p.looking_for = me.gender
    and p.birth_date >  d_min
    and p.birth_date <= d_max
    and p.age_min <= my_age
    and p.age_max >= my_age
    and (me.filter_goals is null or p.relationship_goal = any(me.filter_goals))
    and (me.filter_religions is null or p.religion = any(me.filter_religions))
    and (me.filter_has_children is null or p.has_children = me.filter_has_children)
    and (me.filter_smoking is null
      or (me.filter_smoking = 'non' and p.smoking = 'jamais')
      or (me.filter_smoking = 'oui' and p.smoking in ('parfois', 'souvent')))
    and (not me.filter_online_only or (p.show_online and p.last_active_at > now() - interval '15 minutes'))
    and (not me.filter_verified_only or p.is_verified)
    and not exists (
      select 1 from public.swipes s
      where s.swiper_id = me.user_id and s.target_id = p.user_id
    )
    and not exists (
      select 1 from public.favorites f
      where f.user_id = me.user_id and f.target_id = p.user_id
    )
    and not exists (
      select 1 from public.matches m
      where m.user_a = least(me.user_id, p.user_id)
        and m.user_b = greatest(me.user_id, p.user_id)
    )
    and not exists (
      select 1 from public.blocks b
      where (b.blocker_id = me.user_id and b.blocked_id = p.user_id)
         or (b.blocker_id = p.user_id and b.blocked_id = me.user_id)
    )
  order by p.last_active_at desc
  limit least(greatest(p_limit, 1), 50);
end;
$function$;

-- Filtre de réception des DM : même règle de pays. On ne réécrit pas toute la
-- fonction (elle porte aussi le débit des pièces) : seule la condition de
-- ville est remplacée, et la migration échoue si elle ne la trouve pas.
do $$
declare
  v_def text := pg_get_functiondef('public.send_direct_message'::regproc);
  v_old text := 'or (not t.search_whole_country and s.city_id <> t.city_id)';
  v_new text := 'or (s.city_id <> t.city_id and (not t.search_whole_country'
             || ' or (select ci.country from public.cities ci where ci.id = s.city_id)'
             || ' is distinct from (select ci.country from public.cities ci where ci.id = t.city_id)))';
begin
  if position(v_old in v_def) = 0 then
    if position('is distinct from (select ci.country' in v_def) > 0 then
      return; -- déjà appliqué
    end if;
    raise exception 'send_direct_message : condition de ville introuvable';
  end if;
  execute replace(v_def, v_old, v_new);
end $$;
