-- 066 : choisir de montrer, ou non, son statut en ligne.
--
-- Réglage de l'écran « Confidentialité ». Activé par défaut : les autres
-- voient « En ligne » (moins de 15 minutes) ou « En ligne récemment ». Coupé :
-- l'heure de dernière activité n'est plus envoyée aux autres, exactement
-- comme pour un profil en mode Invisible, et le profil sort du filtre
-- « en ligne uniquement » (qui sinon trahirait sa présence).
--
-- Les sept fonctions qui servent un profil à un autre membre sont réécrites
-- à partir de leur définition en base, avec des remplacements vérifiés : si
-- l'une d'elles a changé de forme, la migration s'arrête au lieu de passer à
-- côté en silence. Le tri du fil par activité, lui, ne change pas.
--
-- Limite connue, la même que pour le mode Invisible : la table profiles reste
-- lisible directement par un membre connecté (RLS profiles_select). L'app
-- masque aussi le statut à l'ouverture d'un profil complet.

alter table public.profiles
  add column if not exists show_online boolean not null default true;

comment on column public.profiles.show_online is
  'Montrer aux autres mon statut en ligne (En ligne, En ligne récemment).';

grant update (show_online) on public.profiles to authenticated;

do $$
declare
  fn text;
  def text;
  before text;
  masked constant text :=
    '    case when p.incognito or not p.show_online then null else p.last_active_at end,';
begin
  foreach fn in array array[
    'get_discovery_feed(integer)', 'get_event_feed(uuid,integer)', 'get_likers()',
    'get_favorites()', 'get_passed_profiles()', 'get_event_passed(uuid)', 'get_profile_views()'
  ] loop
    def := pg_get_functiondef(('public.' || fn)::regprocedure);
    before := def;
    def := replace(def, E'\n    p.last_active_at,', E'\n' || masked);
    def := replace(def, E'\n    case when p.incognito then null else p.last_active_at end,', E'\n' || masked);
    if def = before then
      raise exception 'show_online : sélection de last_active_at introuvable dans %', fn;
    end if;
    if fn = 'get_discovery_feed(integer)' then
      before := def;
      def := replace(def,
        'and (not me.filter_online_only or p.last_active_at > now() - interval ''15 minutes'')',
        'and (not me.filter_online_only or (p.show_online and p.last_active_at > now() - interval ''15 minutes''))');
      if def = before then
        raise exception 'show_online : filtre en ligne introuvable dans get_discovery_feed';
      end if;
    end if;
    execute def;
  end loop;
end $$;
