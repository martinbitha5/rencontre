-- ---------------------------------------------------------------------------
-- Dix profils de démonstration de plus (21 à 30), à ajouter à seed_demo_20.sql
-- sans rien effacer. Trois photos chacun, pour essayer le carrousel.
--
-- Même convention : adresse en @mock.zola, identifiant en d0c0d0c0-...,
-- aucun mot de passe (personne ne peut s'y connecter). Retrait de tous les
-- profils de démonstration :
--   delete from auth.users where email like '%@mock.zola';
--
-- Répartition, pour que chaque compte de test en voie de nouveaux :
--   21-24 : femmes à Kinshasa (ville 1), cherchent un homme
--   25-27 : hommes à Kinshasa (ville 1), cherchent un homme
--   28-30 : hommes en ville 19, cherchent une femme
-- Rejouable : les profils 21 à 30 sont recréés à l'identique.
-- ---------------------------------------------------------------------------

begin;

delete from auth.users
where id in (
  select ('d0c0d0c0-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid
  from generate_series(21, 30) as n
);

create temporary table demo30 (
  n int, name text, gender public.gender, looking public.gender, city int, age int,
  job text, bio text, goal text, religion text, interests text[], photos text[], verified boolean
) on commit drop;

insert into demo30 values
 (21,'Bénédicte','femme','homme',1,25,'Sage-femme','Douce mais têtue. J''aime les gens qui tiennent parole.','relation_serieuse','Catholique',array['Gospel','Cuisine','Lecture'],
   array['https://randomuser.me/api/portraits/women/1.jpg','https://randomuser.me/api/portraits/women/2.jpg','https://randomuser.me/api/portraits/women/3.jpg'],true),
 (22,'Plamedie','femme','homme',1,23,'Étudiante en droit','Entre deux révisions, je danse. Viens me parler de ta chanson préférée.','je_me_laisse_surprendre','Chrétienne',array['Danse','Rumba','Mode'],
   array['https://randomuser.me/api/portraits/women/4.jpg','https://randomuser.me/api/portraits/women/5.jpg','https://randomuser.me/api/portraits/women/6.jpg'],false),
 (23,'Ruth','femme','homme',1,28,'Banquière','Organisée la semaine, spontanée le week-end.','mariage','Protestante',array['Voyage','Cinéma','Sport'],
   array['https://randomuser.me/api/portraits/women/7.jpg','https://randomuser.me/api/portraits/women/9.jpg','https://randomuser.me/api/portraits/women/10.jpg'],true),
 (24,'Nathalie','femme','homme',1,32,'Cheffe de projet','Je cherche quelqu''un avec qui rire et construire.','relation_serieuse','Catholique',array['Lecture','Nature','Karaoké'],
   array['https://randomuser.me/api/portraits/women/11.jpg','https://randomuser.me/api/portraits/women/13.jpg','https://randomuser.me/api/portraits/women/14.jpg'],false),
 (25,'Dieumerci','homme','homme',1,27,'Graphiste','Créatif, calme et toujours partant pour un bon film.','relation_serieuse','Chrétienne',array['Cinéma','Peinture','Musique'],
   array['https://randomuser.me/api/portraits/men/1.jpg','https://randomuser.me/api/portraits/men/2.jpg','https://randomuser.me/api/portraits/men/4.jpg'],true),
 (26,'Exaucé','homme','homme',1,30,'Infirmier','Je prends soin des autres, j''aimerais qu''on prenne soin de moi aussi.','je_me_laisse_surprendre','Catholique',array['Sport','Cuisine','Voyage'],
   array['https://randomuser.me/api/portraits/men/5.jpg','https://randomuser.me/api/portraits/men/6.jpg','https://randomuser.me/api/portraits/men/7.jpg'],false),
 (27,'Rodrigue','homme','homme',1,35,'Avocat','Sérieux, fidèle et bon cuisinier. Le reste se découvre.','mariage','Protestante',array['Lecture','Cuisine','Nature'],
   array['https://randomuser.me/api/portraits/men/8.jpg','https://randomuser.me/api/portraits/men/9.jpg','https://randomuser.me/api/portraits/men/10.jpg'],false),
 (28,'Benjamin','homme','femme',19,26,'Agronome','Fils de la terre, amoureux des marchés et des grands espaces.','relation_serieuse','Catholique',array['Nature','Football','Cuisine'],
   array['https://randomuser.me/api/portraits/men/12.jpg','https://randomuser.me/api/portraits/men/13.jpg','https://randomuser.me/api/portraits/men/14.jpg'],true),
 (29,'Aristote','homme','femme',19,29,'Professeur','Je pose beaucoup de questions. Prépare tes meilleures réponses.','je_me_laisse_surprendre','Chrétienne',array['Lecture','Musique','Voyage'],
   array['https://randomuser.me/api/portraits/men/15.jpg','https://randomuser.me/api/portraits/men/16.jpg','https://randomuser.me/api/portraits/men/17.jpg'],false),
 (30,'Prince','homme','femme',19,31,'Mécanicien','Les mains dans le moteur, le cœur sur la main.','mariage','Protestante',array['Football','Rumba','Karaoké'],
   array['https://randomuser.me/api/portraits/men/18.jpg','https://randomuser.me/api/portraits/men/19.jpg','https://randomuser.me/api/portraits/men/20.jpg'],false);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data
)
select ('d0c0d0c0-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
       '00000000-0000-0000-0000-000000000000'::uuid,
       'authenticated', 'authenticated', 'demo' || n || '@mock.zola', '',
       now(), now(), now(),
       '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb
from demo30;

insert into public.profiles (
  user_id, display_name, birth_date, gender, looking_for, city_id, bio,
  age_min, age_max, is_onboarded, last_active_at, height_cm, job_title,
  education, relationship_goal, has_children, wants_children, smoking,
  drinking, religion, languages, interests, is_verified
)
select ('d0c0d0c0-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
       name,
       (current_date - (age || ' years')::interval - ((n * 37) % 300 || ' days')::interval)::date,
       gender, looking, city, bio, 18, 60, true,
       -- Ils passent devant les vingt premiers : actifs il y a quelques minutes.
       now() - (n - 20 || ' minutes')::interval,
       (case when gender = 'femme' then 158 else 170 end + (n * 3) % 15)::smallint,
       job,
       (array['secondaire','universitaire','licence','master'])[1 + n % 4],
       goal,
       case when n % 4 = 0 then 'oui' else 'non' end,
       (array['oui','non','peut_etre'])[1 + n % 3],
       case when n % 5 = 0 then 'parfois' else 'jamais' end,
       (array['jamais','parfois','souvent'])[1 + n % 3],
       religion,
       array['Français', (array['Lingala','Swahili','Kikongo','Tshiluba'])[1 + n % 4]],
       interests,
       verified
from demo30
-- Un trigger sur auth.users crée déjà une ligne de profil vide : on la remplit.
on conflict (user_id) do update set
  display_name = excluded.display_name, birth_date = excluded.birth_date,
  gender = excluded.gender, looking_for = excluded.looking_for,
  city_id = excluded.city_id, bio = excluded.bio,
  age_min = excluded.age_min, age_max = excluded.age_max,
  is_onboarded = excluded.is_onboarded, last_active_at = excluded.last_active_at,
  height_cm = excluded.height_cm, job_title = excluded.job_title,
  education = excluded.education, relationship_goal = excluded.relationship_goal,
  has_children = excluded.has_children, wants_children = excluded.wants_children,
  smoking = excluded.smoking, drinking = excluded.drinking,
  religion = excluded.religion, languages = excluded.languages,
  interests = excluded.interests, is_verified = excluded.is_verified;

insert into public.photos (user_id, storage_path, position)
select ('d0c0d0c0-0000-4000-8000-' || lpad(d.n::text, 12, '0'))::uuid, ph.url, ph.pos - 1
from demo30 d
cross join lateral unnest(d.photos) with ordinality as ph(url, pos);

-- Likes déjà reçus : un swipe à droite sur 22, 26 ou 29 crée un match.
insert into public.swipes (swiper_id, target_id, liked)
select ('d0c0d0c0-0000-4000-8000-' || lpad(d.n::text, 12, '0'))::uuid, me.user_id, true
from public.profiles me
join auth.users u on u.id = me.user_id and u.email not like '%@mock.zola'
join demo30 d on d.gender = me.looking_for and d.looking = me.gender
where me.is_onboarded
  and d.n in (22, 26, 29)
on conflict do nothing;

commit;
