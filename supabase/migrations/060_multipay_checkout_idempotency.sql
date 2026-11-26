alter table public.payment_orders
  add column idempotency_key text,
  add column checkout_method text not null default 'browser'
    check (checkout_method in ('browser', 'wallet_initializing', 'wallet'));

update public.payment_orders
set idempotency_key = txn_ref
where idempotency_key is null;

alter table public.payment_orders
  alter column idempotency_key set not null;

create unique index payment_orders_user_idempotency_key_idx
  on public.payment_orders (user_id, idempotency_key);