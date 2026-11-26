-- 055 : l'incognito expire tout seul quand l'abonnement est échu.
--
-- Contexte. Pendant la période gratuite (052), tout le monde peut activer
-- l'incognito sans abonnement. Le jour où le paiement revient, la fonction
-- set_incognito() redemande un abonnement pour ACTIVER le mode, mais rien ne
-- désactivait un incognito déjà posé : un compte passé incognito gratuitement
-- restait invisible indéfiniment, sans payer. Décision produit du 14/09/2026 :
-- ces comptes reçoivent 21 jours de grâce (script
-- supabase/rollback/incognito_grace_period.sql, joué le jour J), puis leur
-- incognito tombe. Cette migration porte la chute.
--
-- Mécanique. Pas de pg_cron sur ce projet (voir 021, 027) : l'expiration est
-- paresseuse, déclenchée par le compte lui-même. L'app touche
-- profiles.last_active_at à chaque ouverture ; un trigger BEFORE UPDATE OF
-- last_active_at, restreint aux lignes incognito, vérifie l'échéance :
--   - abonnement échu ou absent  → incognito remis à faux, push « terminé » ;
--   - échéance dans moins de 3 j → push « bientôt fini », une seule fois par
--                                  échéance (entitlements.incognito_reminded_for).
-- Un compte qui n'ouvre plus l'app reste incognito : il n'apparaîtrait de
-- toute façon pas dans un fil trié par activité, et il perdra le mode à sa
-- prochaine ouverture.
--
-- Garde-fou. Tant que economy_config.free_mode vaut 1, le trigger ne fait
-- RIEN : cette migration peut donc être poussée dès maintenant sans changer
-- le comportement de la période gratuite. Elle s'arme d'elle-même quand le
-- rollback 052 remet free_mode à 0.
--
-- Ce qui ne passe pas par ce trigger, volontairement : set_incognito() et
-- admin_grant_incognito() écrivent la colonne incognito sans toucher
-- last_active_at, le trigger ne les voit pas. Un abonnement acheté
-- (credit_incognito) repousse incognito_until : le trigger le lit tel quel.

alter table public.entitlements
  add column if not exists incognito_reminded_for timestamptz;

comment on column public.entitlements.incognito_reminded_for is
  'Échéance incognito_until pour laquelle le rappel « bientôt fini » a déjà été envoyé.';

create or replace function public.profiles_incognito_expiry()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_until timestamptz;
  v_reminded timestamptz;
  v_push_url constant text := 'https://sbsxgwdpdjxsrxcccwno.supabase.co/functions/v1/send-push';
  v_push_headers constant jsonb := jsonb_build_object(
    'Content-Type', 'application/json',
    'x-push-secret', '8f9c0ceb97fdaf6240a3d20edbe557a083145083f53b317579e6e3f56eb754c4'
  );
begin
  -- Le WHEN du trigger filtre déjà sur new.incognito ; on le redit pour que
  -- la fonction reste sûre si elle est un jour appelée autrement.
  if not new.incognito then return new; end if;
  if coalesce(public.economy_value('free_mode'), 0) = 1 then return new; end if;

  select incognito_until, incognito_reminded_for
    into v_until, v_reminded
  from public.entitlements where user_id = new.user_id;

  if v_until is null or v_until <= now() then
    new.incognito := false;
    perform net.http_post(
      url := v_push_url,
      headers := v_push_headers,
      body := jsonb_build_object('type', 'incognito_ended', 'user_id', new.user_id)
    );
    return new;
  end if;

  if v_until <= now() + interval '3 days' and v_reminded is distinct from v_until then
    update public.entitlements
    set incognito_reminded_for = v_until, updated_at = now()
    where user_id = new.user_id;
    perform net.http_post(
      url := v_push_url,
      headers := v_push_headers,
      body := jsonb_build_object(
        'type', 'incognito_ending',
        'user_id', new.user_id,
        'until', v_until
      )
    );
  end if;

  return new;
end $$;

revoke execute on function public.profiles_incognito_expiry() from public, anon, authenticated;

drop trigger if exists profiles_incognito_expiry on public.profiles;
create trigger profiles_incognito_expiry
  before update of last_active_at on public.profiles
  for each row
  when (new.incognito)
  execute function public.profiles_incognito_expiry();

-- Les profils incognito sont rares : cet index rend triviales les requêtes
-- du script de grâce et les contrôles du backoffice.
create index if not exists profiles_incognito_idx
  on public.profiles (user_id) where incognito;
