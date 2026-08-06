-- 048 : bonus du FILLEUL. Le parrainage ne payait que le parrain (600) ; le
-- nouvel écran Parrainage promet aussi une prime au filleul, créditée au même
-- moment : quand son compte devient vérifié. Montant piloté par
-- economy_config.reward_referred_bonus (200 au lancement).

insert into public.economy_config (key, value)
values ('reward_referred_bonus', 200)
on conflict (key) do nothing;

-- Nouveau kind dans le journal des primes. L'index unique partiel
-- coin_rewards_once_idx (kind <> 'referral') garantit déjà qu'un filleul ne
-- touche ce bonus qu'une seule fois.
alter table public.coin_rewards drop constraint coin_rewards_kind_check;
alter table public.coin_rewards add constraint coin_rewards_kind_check
  check (kind in ('verify_account', 'share_app', 'referral', 'referral_bonus'));

create or replace function public.grant_referral_on_verify()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_amount int := coalesce(public.economy_value('reward_referral'), 0);
  v_bonus  int := coalesce(public.economy_value('reward_referred_bonus'), 0);
begin
  if new.referred_by is null then
    return new;
  end if;
  -- Le parrain, comme avant : une seule fois par filleul.
  if v_amount > 0 then
    begin
      insert into public.coin_rewards (user_id, kind, ref_user_id, amount)
      values (new.referred_by, 'referral', new.user_id, v_amount);
      perform public.credit_coins(new.referred_by, v_amount, 'reward', 0);
    exception when unique_violation then
      null;
    end;
  end if;
  -- Le filleul : son bonus tombe à sa propre vérification, une seule fois.
  if v_bonus > 0 then
    begin
      insert into public.coin_rewards (user_id, kind, ref_user_id, amount)
      values (new.user_id, 'referral_bonus', new.referred_by, v_bonus);
      perform public.credit_coins(new.user_id, v_bonus, 'reward', 0);
    exception when unique_violation then
      null;
    end;
  end if;
  return new;
end $$;

revoke execute on function public.grant_referral_on_verify() from public, anon, authenticated;

-- get_rewards expose le montant du bonus filleul pour l'écran Parrainage.
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
    'referred_bonus', coalesce(public.economy_value('reward_referred_bonus'), 0),
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

revoke execute on function public.get_rewards() from public, anon;
grant execute on function public.get_rewards() to authenticated;
