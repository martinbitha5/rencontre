-- ---------------------------------------------------------------------------
-- Jeu de démonstration Dowe
--
-- Remplace les 20 anciens comptes de test par 10 000 profils complets, et
-- met en place de quoi voir chaque fonctionnalité de l'app depuis le compte
-- goblaire50@gmail.com : file de swipe, personnes qui m'ont liké, matchs avec
-- conversations, invitations en message direct, favoris, vues de profil,
-- solde de pièces et une soirée.
--
-- Les comptes créés portent tous une adresse en @mock.dowe et un identifiant
-- commençant par d0c0d0c0, pour pouvoir être retirés d'un seul coup :
--   delete from auth.users where email like '%@mock.dowe';
--
-- Ils n'ont pas de mot de passe : ils s'affichent dans l'app mais personne ne
-- peut s'y connecter.
-- ---------------------------------------------------------------------------

begin;

-- Les déclencheurs de notification enverraient une push par match et par
-- message créés ici. On les met en pause le temps du peuplement.
alter table public.matches  disable trigger matches_push_notify;
alter table public.messages disable trigger messages_push_notify;
alter table public.messages disable trigger messages_activate_pending;

-- 1. Table rase des anciens comptes de démonstration (cascade sur profils,
--    photos, swipes, matchs et messages).
delete from auth.users where email like '%@mock.dowe';

-- 2. Comptes d'authentification, sans mot de passe.
insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at,
  raw_app_meta_data, raw_user_meta_data
)
select
  ('d0c0d0c0-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid,
  '00000000-0000-0000-0000-000000000000'::uuid,
  'authenticated', 'authenticated',
  'demo' || i || '@mock.dowe',
  '',
  now() - ((i % 200) || ' days')::interval,
  now() - ((i % 200) || ' days')::interval,
  now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{}'::jsonb
from generate_series(1, 10000) i;

-- 3. Profils. 7 000 à Kinshasa pour remplir la file locale, 3 000 ailleurs
--    pour que le filtre « toute la RDC » change visiblement le résultat.
with d as (
  select
    array['Grâce','Merveille','Naomi','Esther','Christelle','Sarah','Déborah','Gloria',
          'Ketsia','Divine','Dorcas','Ruth','Priscille','Laetitia','Chancelle','Bénédicte',
          'Rachel','Jemima','Olga','Tracy','Nadège','Carine','Aimée','Josée','Bibiche',
          'Nathalie','Sandrine','Patricia','Céline','Rebecca','Judith','Sylvie','Cathy',
          'Rosette','Emmanuelle','Prisca','Micheline','Annie','Fabiola','Gisèle',
          'Huguette','Irène','Jeanne','Laure','Mireille','Noëlla','Pascaline','Reine',
          'Sonia','Thérèse','Viviane','Yvette','Zawadi','Kavira','Furaha','Mapendo',
          'Neema','Riziki','Espérance','Bénie']::text[] as noms,
    array['M.','K.','N.','B.','L.','T.','I.','W.','A.','S.']::text[] as initiales,
    array['Gombe','Limete','Ngaliema','Lemba','Masina','Matete','Bandalungwa','Kalamu',
          'Kasa-Vubu','Kintambo','Lingwala','Barumbu','Ngiri-Ngiri','Selembao','Bumbu',
          'Makala','Ndjili','Kimbanseke','Mont-Ngafula','Kisenso']::text[] as communes,
    array['Infirmière','Enseignante','Commerçante','Étudiante','Coiffeuse','Comptable',
          'Juriste','Journaliste','Styliste','Pharmacienne','Assistante de direction',
          'Entrepreneure','Sage-femme','Couturière','Restauratrice','Agente marketing',
          'Secrétaire','Vendeuse','Informaticienne','Architecte']::text[] as metiers,
    array['Chrétienne','Catholique','Protestante','Musulmane','Sans religion']::text[] as religions,
    array['Lingala','Swahili','Kikongo','Tshiluba','Anglais']::text[] as langues,
    array['Musique','Cuisine','Voyage','Cinéma','Lecture','Danse','Sport','Mode',
          'Photographie','Église','Football','Basketball','Rumba','Gospel','Nature',
          'Plage','Karaoké','Peinture']::text[] as centres,
    array[
      'J’aime les vraies conversations et les gens simples.',
      'Kinshasa, la musique et les bons petits plats.',
      'Je cherche quelqu’un de sérieux, respectueux et drôle.',
      'Passionnée de voyages, même si je rêve encore de partir loin.',
      'La foi, la famille et le rire, c’est ce qui compte pour moi.',
      'Je préfère les sorties tranquilles aux grandes soirées.',
      'On verra bien où ça nous mène. Écris-moi.',
      'Amoureuse de la rumba et des dimanches en famille.',
      'Ambitieuse le jour, cuisinière le soir.',
      'Je ne mords pas, promis. Dis-moi juste bonjour.'
    ]::text[] as bios,
    (select array_agg(id order by id) from public.cities) as villes
)
insert into public.profiles (
  user_id, display_name, birth_date, gender, looking_for, city_id, bio,
  age_min, age_max, is_onboarded, last_active_at, created_at,
  height_cm, job_title, education, relationship_goal, has_children,
  wants_children, smoking, drinking, religion, commune, languages, interests,
  is_verified
)
select
  ('d0c0d0c0-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid,
  d.noms[1 + (i % array_length(d.noms, 1))] || ' ' || d.initiales[1 + (i % 10)],
  (current_date
     - ((18 + (i % 27)) || ' years')::interval
     - (((i * 37) % 360) || ' days')::interval)::date,
  'femme', 'homme',
  case when i <= 7000 then 1 else d.villes[1 + (i % array_length(d.villes, 1))] end,
  d.bios[1 + (i % 10)],
  18, 99, true,
  -- Un profil sur douze est actif à l'instant : le badge « En ligne » doit se
  -- voir dans la file, pas seulement exister dans le code.
  case when i % 12 = 0 then now() - ((i % 14) || ' minutes')::interval
       else now() - ((i % 20000) || ' minutes')::interval end,
  now() - ((i % 200) || ' days')::interval,
  (155 + (i % 30))::smallint,
  d.metiers[1 + (i % array_length(d.metiers, 1))],
  (array['secondaire','universitaire','licence','master'])[1 + (i % 4)],
  (array['relation_serieuse','mariage','amitie','je_me_laisse_surprendre'])[1 + (i % 4)],
  case when i % 5 = 0 then 'oui' else 'non' end,
  (array['oui','non','peut_etre'])[1 + (i % 3)],
  case when i % 7 = 0 then 'parfois' else 'jamais' end,
  (array['jamais','parfois','souvent'])[1 + (i % 3)],
  d.religions[1 + (i % array_length(d.religions, 1))],
  case when i <= 7000 then d.communes[1 + (i % array_length(d.communes, 1))] else null end,
  array['Français', d.langues[1 + (i % array_length(d.langues, 1))]],
  array[
    d.centres[1 + (i % 18)],
    d.centres[1 + ((i + 5) % 18)],
    d.centres[1 + ((i + 11) % 18)]
  ],
  (i % 9 = 0)
from generate_series(1, 10000) i
cross join d
-- Un déclencheur sur auth.users crée déjà une ligne de profil vide à chaque
-- compte : on la complète au lieu d'en insérer une seconde.
on conflict (user_id) do update set
  display_name = excluded.display_name, birth_date = excluded.birth_date,
  gender = excluded.gender, looking_for = excluded.looking_for,
  city_id = excluded.city_id, bio = excluded.bio,
  age_min = excluded.age_min, age_max = excluded.age_max,
  is_onboarded = excluded.is_onboarded, last_active_at = excluded.last_active_at,
  created_at = excluded.created_at, height_cm = excluded.height_cm,
  job_title = excluded.job_title, education = excluded.education,
  relationship_goal = excluded.relationship_goal, has_children = excluded.has_children,
  wants_children = excluded.wants_children, smoking = excluded.smoking,
  drinking = excluded.drinking, religion = excluded.religion,
  commune = excluded.commune, languages = excluded.languages,
  interests = excluded.interests, is_verified = excluded.is_verified;

-- 4. Trois photos par profil, pour que le carrousel soit testable.
insert into public.photos (user_id, storage_path, position, created_at)
select
  ('d0c0d0c0-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid,
  'https://randomuser.me/api/portraits/women/' || (((i * 7) + p) % 100) || '.jpg',
  p::smallint,
  now() - ((i % 200) || ' days')::interval
from generate_series(1, 10000) i
cross join generate_series(0, 2) p;

-- ---------------------------------------------------------------------------
-- 5. Interactions avec le compte goblaire50@gmail.com
-- ---------------------------------------------------------------------------

-- 5a. Soixante profils m'ont liké : ils alimentent l'onglet Activité et
--     restent dans la file, où un like en retour crée un match immédiat.
insert into public.swipes (swiper_id, target_id, liked, created_at)
select ('d0c0d0c0-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid,
       '8b4dc426-5c80-4b0f-b645-68bc55aab6da'::uuid,
       true,
       now() - ((i * 47) || ' minutes')::interval
from generate_series(1, 60) i
on conflict do nothing;

-- 5b. Douze matchs déjà noués, avec swipes réciproques pour rester cohérent.
insert into public.swipes (swiper_id, target_id, liked, created_at)
select ('d0c0d0c0-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid,
       '8b4dc426-5c80-4b0f-b645-68bc55aab6da'::uuid, true,
       now() - ((i * 90) || ' minutes')::interval
from generate_series(61, 72) i
on conflict do nothing;

insert into public.swipes (swiper_id, target_id, liked, created_at)
select '8b4dc426-5c80-4b0f-b645-68bc55aab6da'::uuid,
       ('d0c0d0c0-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid, true,
       now() - ((i * 85) || ' minutes')::interval
from generate_series(61, 72) i
on conflict do nothing;

insert into public.matches (user_a, user_b, status, origin, initiated_by, created_at)
select
  least('8b4dc426-5c80-4b0f-b645-68bc55aab6da'::uuid, u),
  greatest('8b4dc426-5c80-4b0f-b645-68bc55aab6da'::uuid, u),
  'active', 'swipe', '8b4dc426-5c80-4b0f-b645-68bc55aab6da'::uuid,
  now() - ((i * 80) || ' minutes')::interval
from generate_series(61, 72) i
cross join lateral (select ('d0c0d0c0-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid as u) x
on conflict do nothing;

-- Conversations : elle ouvre, je réponds, elle relance. Le dernier message
-- reste non lu pour que la pastille de badge soit visible.
insert into public.messages (match_id, sender_id, content, created_at, read_at)
select m.id,
       case when t.n = 2 then '8b4dc426-5c80-4b0f-b645-68bc55aab6da'::uuid else other.u end,
       t.texte,
       m.created_at + ((t.n * 11) || ' minutes')::interval,
       case when t.n < 3 then m.created_at + ((t.n * 12) || ' minutes')::interval else null end
from public.matches m
cross join lateral (
  select case when m.user_a = '8b4dc426-5c80-4b0f-b645-68bc55aab6da'::uuid
              then m.user_b else m.user_a end as u
) other
cross join (values
  (1, 'Salut ! Ton profil m’a plu 🙂'),
  (2, 'Merci, le tien aussi. Tu fais quoi de beau ?'),
  (3, 'Pas grand-chose ce week-end. Et toi, tu sors ce soir ?')
) as t(n, texte)
where m.status = 'active'
  and m.origin = 'swipe'
  and (m.user_a = '8b4dc426-5c80-4b0f-b645-68bc55aab6da'::uuid
       or m.user_b = '8b4dc426-5c80-4b0f-b645-68bc55aab6da'::uuid);

-- 5c. Six invitations en message direct, en attente de ma réponse.
insert into public.matches (user_a, user_b, status, origin, initiated_by, created_at)
select
  least('8b4dc426-5c80-4b0f-b645-68bc55aab6da'::uuid, u),
  greatest('8b4dc426-5c80-4b0f-b645-68bc55aab6da'::uuid, u),
  'pending', 'dm', u,
  now() - ((i * 140) || ' minutes')::interval
from generate_series(73, 78) i
cross join lateral (select ('d0c0d0c0-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid as u) x
on conflict do nothing;

insert into public.messages (match_id, sender_id, content, created_at)
select m.id,
       case when m.user_a = '8b4dc426-5c80-4b0f-b645-68bc55aab6da'::uuid
            then m.user_b else m.user_a end,
       (array[
         'Bonjour ! J’ai vu ton profil, j’aimerais faire connaissance.',
         'Salut, tu es de Kinshasa aussi ?',
         'Hello 🙂 tu as l’air sympa, on discute ?',
         'Bonsoir, j’espère que je ne dérange pas.',
         'Coucou ! Ton sourire m’a fait cliquer.',
         'Salut, on se connaît pas mais j’ai tenté ma chance.'
       ])[1 + (m.rn % 6)],
       m.created_at + interval '2 minutes'
from (
  select mm.id, mm.user_a, mm.user_b, mm.created_at,
         (row_number() over (order by mm.created_at))::int as rn
  from public.matches mm
  where mm.status = 'pending'
    and mm.origin = 'dm'
    and (mm.user_a = '8b4dc426-5c80-4b0f-b645-68bc55aab6da'::uuid
         or mm.user_b = '8b4dc426-5c80-4b0f-b645-68bc55aab6da'::uuid)
) m;

-- 5d. Douze profils mis en favori.
insert into public.favorites (user_id, target_id, created_at)
select '8b4dc426-5c80-4b0f-b645-68bc55aab6da'::uuid,
       ('d0c0d0c0-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid,
       now() - ((i * 60) || ' minutes')::interval
from generate_series(79, 90) i
on conflict do nothing;

-- 5e. Quarante visites de mon profil. L'écran « Vues » ne remonte que les
--     dernières 24 heures : les dates doivent tenir dans cette fenêtre, sinon
--     l'écran reste vide alors que les lignes existent.
insert into public.profile_views (viewer_id, viewed_id, viewed_at)
select ('d0c0d0c0-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid,
       '8b4dc426-5c80-4b0f-b645-68bc55aab6da'::uuid,
       now() - (((i - 90) * 33) || ' minutes')::interval
from generate_series(91, 130) i
on conflict do nothing;

-- Pas de solde de pièces à poser ici : le compte en a déjà, et coin_wallets
-- porte une contrainte liant le solde à la part expirante. Passer par
-- admin_adjust_coins depuis le backoffice si besoin.

-- ---------------------------------------------------------------------------
-- 6. Une soirée ouverte, avec des participantes et moi déjà sur la liste.
-- ---------------------------------------------------------------------------
with e as (
  insert into public.events (name, price_cdf, ends_at, created_by, is_active)
  values ('Soirée Dowe au Fleuve Congo', 10000,
          now() + interval '7 days',
          '8b4dc426-5c80-4b0f-b645-68bc55aab6da'::uuid, true)
  returning id
)
insert into public.event_attendees (event_id, user_id)
select e.id, u
from e
cross join lateral (
  select ('d0c0d0c0-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid as u
  from generate_series(131, 170) i
  union all
  select '8b4dc426-5c80-4b0f-b645-68bc55aab6da'::uuid
) x
on conflict do nothing;

alter table public.matches  enable trigger matches_push_notify;
alter table public.messages enable trigger messages_push_notify;
alter table public.messages enable trigger messages_activate_pending;

analyze public.profiles;
analyze public.photos;
analyze public.swipes;
analyze public.matches;
analyze public.messages;

commit;
