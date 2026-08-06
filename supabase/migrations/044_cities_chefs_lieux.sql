-- Une ville par province : les 26 chefs-lieux de la RDC, rien d'autre.
--
-- Le catalogue initial (migration 004) mélangeait chefs-lieux et grandes villes
-- secondaires (Likasi, Boma, Butembo...), soit 34 entrées pour 26 provinces. Le
-- sélecteur de ville en devenait ambigu : deux villes d'une même province se
-- disputaient les mêmes profils, ce qui découpait le vivier sans que personne
-- l'ait demandé.
--
-- Les profils des villes retirées rejoignent le chef-lieu de LEUR province :
-- personne ne change de région, seul l'intitulé se recentre.

update public.profiles p
set city_id = chef.id
from (values
  ('Likasi',     'Lubumbashi'),
  ('Boma',       'Matadi'),
  ('Butembo',    'Goma'),
  ('Beni',       'Goma'),
  ('Uvira',      'Bukavu'),
  ('Kikwit',     'Bandundu'),
  ('Mwene-Ditu', 'Kabinda'),
  ('Luebo',      'Tshikapa')
) as remap(retiree, chef_lieu)
join public.cities retiree_city on retiree_city.name = remap.retiree
join public.cities chef on chef.name = remap.chef_lieu
where p.city_id = retiree_city.id;

delete from public.cities
where name in ('Likasi', 'Boma', 'Butembo', 'Beni', 'Uvira', 'Kikwit', 'Mwene-Ditu', 'Luebo');

-- Accents rétablis sur les deux Uélé : le reste du catalogue est accentué,
-- ces deux-là étaient les seules exceptions.
update public.cities set province = 'Bas-Uélé'  where province = 'Bas-Uele';
update public.cities set province = 'Haut-Uélé' where province = 'Haut-Uele';

-- Garde-fou : une province, un chef-lieu. Toute future insertion en double
-- échoue au lieu de réintroduire l'ambiguïté silencieusement.
create unique index if not exists cities_one_per_province_idx on public.cities (province);
