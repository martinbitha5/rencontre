-- 028 : récompenses en pièces et parrainage.
--
-- Trois façons de gagner des pièces sans payer :
--   verify_account : vérifier son profil (bon pour la confiance du réseau)
--   share_app      : partager l'application
--   referral       : un filleul s'inscrit ET fait vérifier son compte
--
-- Le parrainage n'est PAS réclamable à la main : il est crédité par un trigger
-- au moment où le filleul devient vérifié. Sinon il suffirait de créer des
-- comptes vides pour se payer des pièces. La vérification est revue par un
-- humain (migration 024), c'est elle qui fait office de garde-fou.
--
-- Tous les crédits passent par credit_coins() : une seule porte d'entrée pour
-- le solde, jamais le client.

-- ---------------------------------------------------------------------------
-- 1. Montants (modifiables en base sans redéployer l'app)
-- ---------------------------------------------------------------------------
insert into public.economy_config (key, value) values
  ('reward_verify_account', 400),
  ('reward_share_app', 200),
  ('reward_referral', 600)
on conflict (key) do nothing;

alter table public.coin_transactions drop constraint coin_transactions_kind_check;
alter table public.coin_transactions add constraint coin_transactions_kind_check
  check (kind in ('welcome', 'recharge', 'like_back', 'dm', 'event', 'admin',
                  'filter', 'reward', 'expire'));

-- ---------------------------------------------------------------------------
-- 2. Code de parrainage porté par le profil
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column if not exists referral_code text,
  add column if not exists referred_by uuid references public.profiles(user_id) on delete set null;

create unique index if not exists profiles_referral_code_idx
  on public.profiles (referral_code) where referral_code is not null;

-- Code court, sans caractères ambigus (0/O, 1/I) : il sera lu à voix haute.
create or replace function public.gen_referral_code()
returns text language plpgsql security definer set search_path = '' as $$
declare
  v_alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_code text;
  i int;
begin
  loop
    v_code := '';
    for i in 1..6 loop
      v_code := v_code || substr(v_alphabet, 1 + floor(random() * length(v_alphabet))::int, 1);
    end loop;
    exit when not exists (select 1 from public.profiles p where p.referral_code = v_code);
  end loop;
  return v_code;
end $$;

update public.profiles set referral_code = public.gen_referral_code()
where referral_code is null;

-- ---------------------------------------------------------------------------
-- 3. Journal des récompenses : c'est lui qui rend chaque prime unique
-- ---------------------------------------------------------------------------
create table if not exists public.coin_rewards (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles(user_id) on delete cascade,
  kind text not null check (kind in ('verify_account', 'share_app', 'referral')),
  ref_user_id uuid references public.profiles(user_id) on delete set null,
  amount int not null,
  created_at timestamptz not null default now()
);
alter table public.coin_rewards enable row level security;
create policy "coin_rewards_select_own" on public.coin_rewards
  for select to authenticated using (user_id = (select auth.uid()));

-- Les primes individuelles ne tombent qu'une fois...
create unique index if not exists coin_rewards_once_idx
  on public.coin_rewards (user_id, kind) where kind <> 'referral';
-- ...et un filleul donné ne peut être compté qu'une seule fois.
create unique index if not exists coin_rewards_referral_idx
  on public.coin_rewards (user_id, ref_user_id) where kind = 'referral';

-- ---------------------------------------------------------------------------
-- 4. Réclamer une prime. Les conditions sont vérifiées ICI, jamais côté client.
-- ---------------------------------------------------------------------------
create or replace function public.claim_reward(p_kind text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_me uuid := (select auth.uid());
  v_amount int;
  v_balance int;
begin
  if v_me is null then raise exception 'non_authentifie'; end if;
  if p_kind not in ('verify_account', 'share_app') then
    raise exception 'recompense_inconnue';
  end if;

  v_amount := coalesce(public.economy_value('reward_' || p_kind), 0);
  if v_amount <= 0 then
    return jsonb_build_object('status', 'unavailable');
  end if;

  if p_kind = 'verify_account'
     and not exists (select 1 from public.profiles p
                     where p.user_id = v_me and p.is_verified) then
    return jsonb_build_object('status', 'not_eligible');
  end if;

  begin
    insert into public.coin_rewards (user_id, kind, amount)
    values (v_me, p_kind, v_amount);
  exception when unique_violation then
    return jsonb_build_object('status', 'already_claimed');
  end;

  v_balance := public.credit_coins(v_me, v_amount, 'reward', 0);
  return jsonb_build_object('status', 'granted', 'amount', v_amount, 'balance', v_balance);
end $$;

-- ---------------------------------------------------------------------------
-- 5. Saisir le code d'un parrain. Ne crédite rien tout de suite : la prime
--    part quand ce compte est vérifié (voir le trigger).
-- ---------------------------------------------------------------------------
create or replace function public.redeem_referral_code(p_code text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_me uuid := (select auth.uid());
  v_sponsor uuid;
  v_already uuid;
  v_verified boolean;
begin
  if v_me is null then raise exception 'non_authentifie'; end if;
  if p_code is null or btrim(p_code) = '' then
    return jsonb_build_object('status', 'unknown_code');
  end if;

  select referred_by, is_verified into v_already, v_verified
  from public.profiles where user_id = v_me;
  if v_already is not null then
    return jsonb_build_object('status', 'already_referred');
  end if;
  -- Un compte déjà vérifié ne peut plus se rattacher à un parrain : sinon on
  -- collerait un code après coup pour déclencher la prime immédiatement.
  if coalesce(v_verified, false) then
    return jsonb_build_object('status', 'too_late');
  end if;

  select user_id into v_sponsor from public.profiles
  where referral_code = upper(btrim(p_code));
  if v_sponsor is null then
    return jsonb_build_object('status', 'unknown_code');
  end if;
  if v_sponsor = v_me then
    return jsonb_build_object('status', 'self_referral');
  end if;

  update public.profiles set referred_by = v_sponsor where user_id = v_me;
  return jsonb_build_object('status', 'ok');
end $$;

-- ---------------------------------------------------------------------------
-- 6. Le parrain est payé à la vérification du filleul.
-- ---------------------------------------------------------------------------
create or replace function public.grant_referral_on_verify()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_amount int := coalesce(public.economy_value('reward_referral'), 0);
begin
  if new.referred_by is null or v_amount <= 0 then
    return new;
  end if;
  begin
    insert into public.coin_rewards (user_id, kind, ref_user_id, amount)
    values (new.referred_by, 'referral', new.user_id, v_amount);
  exception when unique_violation then
    return new;
  end;
  perform public.credit_coins(new.referred_by, v_amount, 'reward', 0);
  return new;
end $$;

drop trigger if exists profiles_referral_reward on public.profiles;
create trigger profiles_referral_reward
  after update of is_verified on public.profiles
  for each row
  when (new.is_verified and not old.is_verified)
  execute function public.grant_referral_on_verify();

-- ---------------------------------------------------------------------------
-- 7. Vue consommée par l'écran Récompenses
-- ---------------------------------------------------------------------------
create or replace function public.get_rewards()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_me uuid := (select auth.uid());
  v_code text;
  v_verified boolean;
  v_referred boolean;
begin
  if v_me is null then raise exception 'non_authentifie'; end if;
  perform public.ensure_wallet(v_me);

  select referral_code, is_verified, referred_by is not null
    into v_code, v_verified, v_referred
  from public.profiles where user_id = v_me;

  -- Rattrapage : les comptes créés avant cette migration n'ont pas de code.
  if v_code is null then
    v_code := public.gen_referral_code();
    update public.profiles set referral_code = v_code where user_id = v_me;
  end if;

  return jsonb_build_object(
    'balance', (select balance from public.coin_wallets where user_id = v_me),
    'referral_code', v_code,
    'has_sponsor', coalesce(v_referred, false),
    'is_verified', coalesce(v_verified, false),
    'referrals_paid', (select count(*) from public.coin_rewards
                       where user_id = v_me and kind = 'referral'),
    'rewards', jsonb_build_array(
      jsonb_build_object(
        'kind', 'referral',
        'amount', coalesce(public.economy_value('reward_referral'), 0),
        'claimed', false),
      jsonb_build_object(
        'kind', 'share_app',
        'amount', coalesce(public.economy_value('reward_share_app'), 0),
        'claimed', exists (select 1 from public.coin_rewards
                           where user_id = v_me and kind = 'share_app')),
      jsonb_build_object(
        'kind', 'verify_account',
        'amount', coalesce(public.economy_value('reward_verify_account'), 0),
        'claimed', exists (select 1 from public.coin_rewards
                           where user_id = v_me and kind = 'verify_account'))
    )
  );
end $$;

-- ---------------------------------------------------------------------------
-- 8. Grants
-- ---------------------------------------------------------------------------
revoke execute on function public.gen_referral_code() from public, anon, authenticated;
revoke execute on function public.grant_referral_on_verify() from public, anon, authenticated;
revoke execute on function public.claim_reward(text) from public, anon;
revoke execute on function public.redeem_referral_code(text) from public, anon;
revoke execute on function public.get_rewards() from public, anon;
grant execute on function public.claim_reward(text) to authenticated;
grant execute on function public.redeem_referral_code(text) to authenticated;
grant execute on function public.get_rewards() to authenticated;

-- Le graphe de parrainage ne regarde personne d'autre que son propriétaire :
-- get_rewards() (security definer) est la seule lecture légitime, et les
-- colonnes ne sont jamais écrites par le client.
revoke update (referral_code, referred_by) on public.profiles from authenticated;
revoke select (referral_code, referred_by) on public.profiles from anon, authenticated;
