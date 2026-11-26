-- 061 : compteur public du site (bandeau de chiffres de la page d'accueil).
--
-- Avant le lancement, le site affiche le nombre de personnes inscrites sur la
-- liste d'attente. Une fois l'app en ligne dans les stores, il affiche le
-- nombre de comptes créés. Le passage de l'un à l'autre est un réglage, pas
-- un déploiement :
--
--   update public.site_settings set value = 'members' where key = 'counter_mode';
--
-- La fonction ne renvoie QU'UN NOMBRE et le mode : aucune adresse, aucune
-- ligne de la liste d'attente ne sort. La table waitlist reste fermée à
-- anon (053).

create table if not exists public.site_settings (
  key        text primary key,
  value      text not null,
  updated_at timestamptz not null default now()
);

comment on table public.site_settings is
  'Réglages du site public. counter_mode : waitlist (avant lancement) ou members (après).';

alter table public.site_settings enable row level security;
-- Aucune politique : seuls le service_role et les fonctions security definer
-- lisent ou écrivent ici.
revoke all on table public.site_settings from public, anon, authenticated;

insert into public.site_settings (key, value)
values ('counter_mode', 'waitlist')
on conflict (key) do nothing;

create or replace function public.public_counter()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_mode text;
  v_count bigint;
begin
  select value into v_mode from public.site_settings where key = 'counter_mode';
  v_mode := coalesce(v_mode, 'waitlist');

  if v_mode = 'members' then
    select count(*) into v_count from public.profiles;
  else
    v_mode := 'waitlist';
    select count(*) into v_count from public.waitlist;
  end if;

  return jsonb_build_object('mode', v_mode, 'count', v_count);
end;
$$;

comment on function public.public_counter() is
  'Chiffre affiché sur la page d''accueil : inscrits en liste d''attente ou comptes créés, selon site_settings.counter_mode.';

revoke execute on function public.public_counter() from public;
grant execute on function public.public_counter() to anon, authenticated;
