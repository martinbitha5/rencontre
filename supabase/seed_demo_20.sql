-- ---------------------------------------------------------------------------
-- Petit jeu de démonstration : 20 profils (10 femmes, 10 hommes) à Kinshasa,
-- pour essayer le swipe depuis un vrai compte.
--
-- Même convention que seed_demo.sql : adresse en @mock.zola, identifiant en
-- d0c0d0c0-..., aucun mot de passe (personne ne peut s'y connecter). Retrait :
--   delete from auth.users where email like '%@mock.zola';
--
-- Le fil ne montre un profil que si les recherches se croisent (genre et
-- « je cherche » dans les deux sens). Répartition :
--   femmes 1-10  : cherchent un homme   -> visibles des hommes qui cherchent une femme
--   hommes 11-15 : cherchent une femme  -> visibles des femmes qui cherchent un homme
--   hommes 16-20 : cherchent un homme   -> visibles des hommes qui cherchent un homme
--
-- Quelques profils ont déjà liké les comptes de test : un swipe à droite sur
-- eux crée un match immédiat.
-- ---------------------------------------------------------------------------

begin;

delete from auth.users where email like '%@mock.zola';

create temporary table demo20 (
  n int, name text, gender public.gender, looking public.gender, age int,
  job text, bio text, goal text, religion text, interests text[], photo text, verified boolean
) on commit drop;

insert into demo20 values
 (1,'Grâce','femme','homme',24,'Infirmière','La foi, la famille et le rire, c''est ce qui compte pour moi.','relation_serieuse','Catholique',array['Musique','Cuisine','Église'],'https://randomuser.me/api/portraits/women/65.jpg',true),
 (2,'Merveille','femme','homme',27,'Comptable','Kinshasa, la musique et les bons petits plats.','mariage','Protestante',array['Rumba','Cuisine','Voyage'],'https://randomuser.me/api/portraits/women/68.jpg',false),
 (3,'Naomi','femme','homme',22,'Étudiante','Je ne mords pas, promis. Dis-moi juste bonjour.','je_me_laisse_surprendre','Chrétienne',array['Danse','Mode','Cinéma'],'https://randomuser.me/api/portraits/women/79.jpg',false),
 (4,'Esther','femme','homme',29,'Pharmacienne','Je préfère les sorties tranquilles aux grandes soirées.','relation_serieuse','Catholique',array['Lecture','Nature','Gospel'],'https://randomuser.me/api/portraits/women/44.jpg',true),
 (5,'Christelle','femme','homme',26,'Styliste','Ambitieuse le jour, cuisinière le soir.','amitie','Chrétienne',array['Mode','Photographie','Musique'],'https://randomuser.me/api/portraits/women/90.jpg',false),
 (6,'Sarah','femme','homme',31,'Juriste','Je cherche quelqu''un de sérieux, respectueux et drôle.','mariage','Protestante',array['Lecture','Voyage','Cinéma'],'https://randomuser.me/api/portraits/women/12.jpg',false),
 (7,'Déborah','femme','homme',23,'Coiffeuse','Amoureuse de la rumba et des dimanches en famille.','relation_serieuse','Chrétienne',array['Rumba','Danse','Karaoké'],'https://randomuser.me/api/portraits/women/33.jpg',false),
 (8,'Gloria','femme','homme',28,'Journaliste','Passionnée de voyages, même si je rêve encore de partir loin.','je_me_laisse_surprendre','Sans religion',array['Voyage','Photographie','Plage'],'https://randomuser.me/api/portraits/women/52.jpg',true),
 (9,'Ketsia','femme','homme',25,'Enseignante','J''aime les vraies conversations et les gens simples.','relation_serieuse','Catholique',array['Lecture','Gospel','Nature'],'https://randomuser.me/api/portraits/women/21.jpg',false),
 (10,'Divine','femme','homme',30,'Entrepreneure','On verra bien où ça nous mène. Écris-moi.','amitie','Protestante',array['Sport','Mode','Musique'],'https://randomuser.me/api/portraits/women/8.jpg',false),
 (11,'Patrick','homme','femme',30,'Ingénieur','Calme, drôle quand il faut, sérieux quand il le faut.','relation_serieuse','Catholique',array['Football','Musique','Voyage'],'https://randomuser.me/api/portraits/men/32.jpg',true),
 (12,'Jonathan','homme','femme',27,'Développeur','Code le jour, rumba le soir.','je_me_laisse_surprendre','Chrétienne',array['Rumba','Cinéma','Sport'],'https://randomuser.me/api/portraits/men/45.jpg',false),
 (13,'Cédric','homme','femme',33,'Médecin','Je cherche une vraie complicité, pas un passe-temps.','mariage','Protestante',array['Lecture','Nature','Gospel'],'https://randomuser.me/api/portraits/men/11.jpg',false),
 (14,'Yannick','homme','femme',25,'Commercial','Toujours partant pour un bon plat et une belle balade.','relation_serieuse','Catholique',array['Cuisine','Basketball','Voyage'],'https://randomuser.me/api/portraits/men/75.jpg',false),
 (15,'Junior','homme','femme',29,'Photographe','Je regarde le monde à travers mon objectif.','amitie','Sans religion',array['Photographie','Mode','Plage'],'https://randomuser.me/api/portraits/men/86.jpg',true),
 (16,'Christian','homme','homme',28,'Architecte','J''aime les gens vrais et les longues discussions.','relation_serieuse','Chrétienne',array['Peinture','Voyage','Cinéma'],'https://randomuser.me/api/portraits/men/22.jpg',false),
 (17,'Fiston','homme','homme',24,'Étudiant','Sportif, curieux et un peu gourmand.','je_me_laisse_surprendre','Catholique',array['Sport','Cuisine','Musique'],'https://randomuser.me/api/portraits/men/54.jpg',false),
 (18,'Héritier','homme','homme',31,'Banquier','Sérieux au travail, beaucoup moins le week-end.','relation_serieuse','Protestante',array['Football','Karaoké','Voyage'],'https://randomuser.me/api/portraits/men/67.jpg',true),
 (19,'Glody','homme','homme',26,'Musicien','La musique d''abord, le reste suit.','amitie','Chrétienne',array['Rumba','Gospel','Danse'],'https://randomuser.me/api/portraits/men/91.jpg',false),
 (20,'Trésor','homme','homme',34,'Chef cuisinier','Je cuisine mieux que je ne parle. Viens vérifier.','mariage','Catholique',array['Cuisine','Lecture','Nature'],'https://randomuser.me/api/portraits/men/3.jpg',false);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data
)
select ('d0c0d0c0-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
       '00000000-0000-0000-0000-000000000000'::uuid,
       'authenticated', 'authenticated', 'demo' || n || '@mock.zola', '',
       now(), now(), now(),
       '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb
from demo20;

insert into public.profiles (
  user_id, display_name, birth_date, gender, looking_for, city_id, bio,
  age_min, age_max, is_onboarded, last_active_at, height_cm, job_title,
  education, relationship_goal, has_children, wants_children, smoking,
  drinking, religion, languages, interests, is_verified
)
select ('d0c0d0c0-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
       name,
       (current_date - (age || ' years')::interval - ((n * 37) % 300 || ' days')::interval)::date,
       gender, looking, 1, bio, 18, 60, true,
       -- Un sur trois est « en ligne » à l'instant, les autres récemment.
       case when n % 3 = 0 then now() - (n || ' minutes')::interval
            else now() - (n * 2 || ' hours')::interval end,
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
from demo20
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
select ('d0c0d0c0-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid, photo, 0
from demo20;

-- Likes déjà reçus : deux profils par compte de test, choisis parmi ceux qui
-- apparaissent dans son fil. Un swipe à droite sur eux crée le match.
insert into public.swipes (swiper_id, target_id, liked)
select ('d0c0d0c0-0000-4000-8000-' || lpad(d.n::text, 12, '0'))::uuid, me.user_id, true
from public.profiles me
join auth.users u on u.id = me.user_id and u.email not like '%@mock.zola'
join demo20 d on d.gender = me.looking_for and d.looking = me.gender
where me.is_onboarded
  and d.n in (2, 5, 11, 14, 16, 19)
on conflict do nothing;

commit;
