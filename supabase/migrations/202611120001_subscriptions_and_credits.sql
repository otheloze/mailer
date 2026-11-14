create table public.subscription_packages (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  price_cents integer not null check (price_cents >= 0),
  email_sending_credits integer not null check (email_sending_credits >= 0),
  email_discovery_credits integer not null check (email_discovery_credits >= 0),
  duration_days integer not null default 30 check (duration_days between 1 and 3650),
  rollover_policy text not null default 'expire' check (rollover_policy in ('expire', 'rollover')),
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.subscription_packages
  (slug, name, price_cents, email_sending_credits, email_discovery_credits)
values
  ('basic', 'BASIC', 500, 5000, 50),
  ('bronze', 'BRONZE', 1500, 10000, 100),
  ('silver', 'SILVER', 3000, 30000, 200),
  ('premium', 'PREMIUM', 5000, 50000, 1000)
on conflict (slug) do nothing;

create table public.client_account_controls (
  user_id uuid primary key references auth.users(id) on delete cascade,
  status text not null default 'active' check (status in ('active', 'suspended', 'deactivated')),
  note text,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

create table public.client_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  package_id uuid not null references public.subscription_packages(id),
  status text not null default 'active' check (status in ('active', 'suspended', 'expired', 'canceled')),
  started_at timestamptz not null default now(),
  expires_at timestamptz not null,
  last_payment_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index client_subscriptions_expiry_idx on public.client_subscriptions(status, expires_at);
alter table public.campaigns add column credit_reservation_key text;
create unique index campaigns_credit_reservation_key_idx on public.campaigns(credit_reservation_key) where credit_reservation_key is not null;

create table public.credit_balances (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email_sending integer not null default 0 check (email_sending >= 0),
  email_discovery integer not null default 0 check (email_discovery >= 0),
  updated_at timestamptz not null default now()
);

create table public.subscription_payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  subscription_id uuid references public.client_subscriptions(id) on delete set null,
  package_id uuid not null references public.subscription_packages(id),
  amount_cents integer not null check (amount_cents >= 0),
  refunded_cents integer not null default 0 check (refunded_cents >= 0 and refunded_cents <= amount_cents),
  currency text not null default 'usd',
  status text not null default 'pending' check (status in ('pending', 'paid', 'failed', 'refunded', 'canceled')),
  stripe_checkout_session text not null unique,
  stripe_payment_intent text,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);

create index subscription_payments_user_time_idx on public.subscription_payments(user_id, created_at desc);
create index subscription_payments_status_idx on public.subscription_payments(status);
create unique index subscription_payments_payment_intent_idx
  on public.subscription_payments(stripe_payment_intent) where stripe_payment_intent is not null;

create table public.credit_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  service text not null check (service in ('email_sending', 'email_discovery')),
  amount integer not null,
  balance_after integer not null check (balance_after >= 0),
  transaction_type text not null check (transaction_type in ('allocation', 'usage', 'refund', 'admin_adjustment', 'expiration')),
  reference_key text not null unique,
  related_reference text,
  note text,
  actor_id uuid references auth.users(id) on delete set null,
  settled_amount integer,
  created_at timestamptz not null default now(),
  check (settled_amount is null or settled_amount >= 0)
);

create index credit_transactions_user_time_idx on public.credit_transactions(user_id, created_at desc);
create index credit_transactions_related_idx on public.credit_transactions(related_reference) where related_reference is not null;

create table public.subscription_admin_audit (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid not null references auth.users(id),
  target_user_id uuid references auth.users(id) on delete set null,
  action text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.stripe_webhook_events (
  id text primary key,
  event_type text not null,
  processed_at timestamptz not null default now(),
  payment_intent text,
  refunded_cents integer
);

create or replace function public.ensure_client_account_control()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.client_account_controls (user_id)
  values (new.id)
  on conflict (user_id) do nothing;
  insert into public.credit_balances (user_id)
  values (new.id)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_subscription_setup
after insert on auth.users
for each row execute procedure public.ensure_client_account_control();

insert into public.client_account_controls (user_id)
select id from auth.users
on conflict (user_id) do nothing;

insert into public.credit_balances (user_id)
select id from auth.users
on conflict (user_id) do nothing;

create or replace function public.is_platform_admin()
returns boolean
language sql
stable
security invoker
set search_path = public
as $$
  select coalesce(auth.jwt()->'app_metadata'->>'role', '') = 'admin';
$$;

create or replace function public.reserve_service_credits(
  p_service text,
  p_amount integer,
  p_reference_key text,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_balance integer;
  v_existing public.credit_transactions%rowtype;
  v_status text;
  v_transaction_id uuid;
begin
  if v_user_id is null then raise exception 'Authentication required.'; end if;
  if p_service not in ('email_sending', 'email_discovery') then raise exception 'Unknown credit service.'; end if;
  if p_amount < 1 or p_amount > 100000 then raise exception 'Invalid credit amount.'; end if;
  if p_reference_key is null or length(p_reference_key) < 8 or length(p_reference_key) > 200 then raise exception 'Invalid credit reference.'; end if;

  select * into v_existing from public.credit_transactions
    where reference_key = p_reference_key for update;
  if found then
    if v_existing.user_id <> v_user_id or v_existing.service <> p_service
      or v_existing.transaction_type <> 'usage' or -v_existing.amount <> p_amount then
      raise exception 'Credit reference has already been used.';
    end if;
    return jsonb_build_object('transaction_id', v_existing.id, 'reserved', p_amount, 'balance_after', v_existing.balance_after);
  end if;

  select status into v_status from public.client_account_controls where user_id = v_user_id;
  if coalesce(v_status, 'active') <> 'active' then raise exception 'This account is not active.'; end if;
  if not exists (
    select 1 from public.client_subscriptions
    where user_id = v_user_id and status = 'active' and expires_at > now()
  ) then
    update public.client_subscriptions set status = 'expired', updated_at = now()
      where user_id = v_user_id and status = 'active' and expires_at <= now();
    raise exception 'An active subscription is required.';
  end if;

  insert into public.credit_balances (user_id) values (v_user_id) on conflict (user_id) do nothing;
  if p_service = 'email_sending' then
    select email_sending into v_balance from public.credit_balances where user_id = v_user_id for update;
  else
    select email_discovery into v_balance from public.credit_balances where user_id = v_user_id for update;
  end if;
  if v_balance < p_amount then raise exception 'Insufficient % credits. Available: %, required: %.', p_service, v_balance, p_amount; end if;

  if p_service = 'email_sending' then
    update public.credit_balances set email_sending = email_sending - p_amount, updated_at = now() where user_id = v_user_id returning email_sending into v_balance;
  else
    update public.credit_balances set email_discovery = email_discovery - p_amount, updated_at = now() where user_id = v_user_id returning email_discovery into v_balance;
  end if;
  insert into public.credit_transactions (user_id, service, amount, balance_after, transaction_type, reference_key, note)
    values (v_user_id, p_service, -p_amount, v_balance, 'usage', p_reference_key, p_note)
    returning id into v_transaction_id;
  return jsonb_build_object('transaction_id', v_transaction_id, 'reserved', p_amount, 'balance_after', v_balance);
end;
$$;

create or replace function public.settle_service_credit_reservation(
  p_reference_key text,
  p_consumed integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_usage public.credit_transactions%rowtype;
  v_reserved integer;
  v_refund integer;
  v_balance integer;
  v_existing_settlement integer;
begin
  if v_user_id is null then raise exception 'Authentication required.'; end if;
  if p_consumed < 0 then raise exception 'Invalid consumed credit amount.'; end if;
  select * into v_usage from public.credit_transactions
    where reference_key = p_reference_key and user_id = v_user_id and transaction_type = 'usage'
    for update;
  if not found then raise exception 'Credit reservation was not found.'; end if;
  v_reserved := -v_usage.amount;
  if p_consumed > v_reserved then raise exception 'Consumed credits exceed the reservation.'; end if;
  if v_usage.settled_amount is not null then
    if v_usage.settled_amount <> p_consumed then raise exception 'Credit reservation is already settled.'; end if;
    return jsonb_build_object('settled', true, 'consumed', p_consumed, 'refunded', v_reserved - p_consumed);
  end if;

  update public.credit_transactions set settled_amount = p_consumed where id = v_usage.id;
  v_refund := v_reserved - p_consumed;
  if v_refund > 0 then
    if v_usage.service = 'email_sending' then
      update public.credit_balances set email_sending = email_sending + v_refund, updated_at = now()
        where user_id = v_user_id returning email_sending into v_balance;
    else
      update public.credit_balances set email_discovery = email_discovery + v_refund, updated_at = now()
        where user_id = v_user_id returning email_discovery into v_balance;
    end if;
    insert into public.credit_transactions (user_id, service, amount, balance_after, transaction_type, reference_key, related_reference, note)
      values (v_user_id, v_usage.service, v_refund, v_balance, 'refund', 'settlement-refund:' || p_reference_key, p_reference_key, 'Unused reserved credits returned.');
  end if;
  return jsonb_build_object('settled', true, 'consumed', p_consumed, 'refunded', v_refund);
end;
$$;

create or replace function public.refund_service_credit_reservation(
  p_reference_key text,
  p_refund_key text,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_usage public.credit_transactions%rowtype;
  v_consumed integer;
  v_refunded integer;
  v_refund integer;
  v_balance integer;
begin
  if v_user_id is null then raise exception 'Authentication required.'; end if;
  select * into v_usage from public.credit_transactions
    where reference_key = p_reference_key and user_id = v_user_id and transaction_type = 'usage'
    for update;
  if not found or v_usage.settled_amount is null then raise exception 'Settled credit reservation was not found.'; end if;
  if exists (select 1 from public.credit_transactions where reference_key = p_refund_key) then
    return jsonb_build_object('refunded', true, 'duplicate', true);
  end if;
  v_consumed := v_usage.settled_amount;
  select coalesce(sum(amount), 0) into v_refunded from public.credit_transactions
    where related_reference = p_reference_key and transaction_type = 'refund';
  v_refund := v_consumed - v_refunded;
  if v_refund <= 0 then return jsonb_build_object('refunded', false, 'amount', 0); end if;

  if v_usage.service = 'email_sending' then
    update public.credit_balances set email_sending = email_sending + v_refund, updated_at = now()
      where user_id = v_user_id returning email_sending into v_balance;
  else
    update public.credit_balances set email_discovery = email_discovery + v_refund, updated_at = now()
      where user_id = v_user_id returning email_discovery into v_balance;
  end if;
  insert into public.credit_transactions (user_id, service, amount, balance_after, transaction_type, reference_key, related_reference, note)
    values (v_user_id, v_usage.service, v_refund, v_balance, 'refund', p_refund_key, p_reference_key, p_note);
  return jsonb_build_object('refunded', true, 'amount', v_refund, 'balance_after', v_balance);
end;
$$;

create or replace function public.admin_adjust_service_credits(
  p_user_id uuid,
  p_service text,
  p_amount integer,
  p_reference_key text,
  p_note text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_balance integer;
  v_transaction_id uuid;
begin
  if not public.is_platform_admin() then raise exception 'Administrator access required.'; end if;
  if p_service not in ('email_sending', 'email_discovery') or p_amount = 0 or abs(p_amount) > 1000000 then raise exception 'Invalid credit adjustment.'; end if;
  if exists (select 1 from public.credit_transactions where reference_key = p_reference_key) then raise exception 'Credit adjustment reference already exists.'; end if;
  insert into public.credit_balances (user_id) values (p_user_id) on conflict (user_id) do nothing;
  if p_service = 'email_sending' then
    select email_sending into v_balance from public.credit_balances where user_id = p_user_id for update;
  else
    select email_discovery into v_balance from public.credit_balances where user_id = p_user_id for update;
  end if;
  if v_balance + p_amount < 0 then raise exception 'Adjustment would make the credit balance negative.'; end if;
  if p_service = 'email_sending' then
    update public.credit_balances set email_sending = email_sending + p_amount, updated_at = now()
      where user_id = p_user_id returning email_sending into v_balance;
  else
    update public.credit_balances set email_discovery = email_discovery + p_amount, updated_at = now()
      where user_id = p_user_id returning email_discovery into v_balance;
  end if;
  insert into public.credit_transactions (user_id, service, amount, balance_after, transaction_type, reference_key, note, actor_id)
    values (p_user_id, p_service, p_amount, v_balance, 'admin_adjustment', p_reference_key, p_note, auth.uid())
    returning id into v_transaction_id;
  return jsonb_build_object('transaction_id', v_transaction_id, 'balance_after', v_balance);
end;
$$;

create or replace function public.admin_assign_subscription(
  p_user_id uuid,
  p_package_slug text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_package public.subscription_packages%rowtype;
  v_subscription public.client_subscriptions%rowtype;
  v_old_email integer;
  v_old_discovery integer;
  v_new_email integer;
  v_new_discovery integer;
  v_started timestamptz := now();
  v_expiry_base timestamptz := now();
  v_expiry timestamptz;
  v_reference text := 'admin-allocation:' || gen_random_uuid()::text;
begin
  if not public.is_platform_admin() then raise exception 'Administrator access required.'; end if;
  select * into v_package from public.subscription_packages where slug = p_package_slug and enabled;
  if not found then raise exception 'Enabled package not found.'; end if;
  select * into v_subscription from public.client_subscriptions where user_id = p_user_id for update;
  if v_subscription.id is not null then
    if v_subscription.package_id = v_package.id and v_subscription.status = 'active' and v_subscription.expires_at > now() then
      v_expiry_base := v_subscription.expires_at;
    end if;
  end if;
  v_expiry := v_expiry_base + make_interval(days => v_package.duration_days);
  insert into public.client_subscriptions (user_id, package_id, status, started_at, expires_at, updated_at)
    values (p_user_id, v_package.id, 'active', v_started, v_expiry, now())
    on conflict (user_id) do update set package_id = excluded.package_id, status = 'active',
      started_at = excluded.started_at, expires_at = excluded.expires_at, updated_at = now()
    returning * into v_subscription;

  insert into public.credit_balances (user_id) values (p_user_id) on conflict (user_id) do nothing;
  select email_sending, email_discovery into v_old_email, v_old_discovery
    from public.credit_balances where user_id = p_user_id for update;
  if v_package.rollover_policy = 'rollover' then
    v_new_email := v_old_email + v_package.email_sending_credits;
    v_new_discovery := v_old_discovery + v_package.email_discovery_credits;
  else
    v_new_email := v_package.email_sending_credits;
    v_new_discovery := v_package.email_discovery_credits;
  end if;
  update public.credit_balances set email_sending = v_new_email, email_discovery = v_new_discovery, updated_at = now()
    where user_id = p_user_id;
  insert into public.credit_transactions (user_id, service, amount, balance_after, transaction_type, reference_key, note, actor_id)
    values
      (p_user_id, 'email_sending', v_new_email - v_old_email, v_new_email, 'allocation', v_reference || ':email', 'Administrator assigned ' || v_package.name || ' package.', auth.uid()),
      (p_user_id, 'email_discovery', v_new_discovery - v_old_discovery, v_new_discovery, 'allocation', v_reference || ':discovery', 'Administrator assigned ' || v_package.name || ' package.', auth.uid());
  return jsonb_build_object('subscription_id', v_subscription.id, 'status', v_subscription.status, 'expires_at', v_subscription.expires_at);
end;
$$;

create or replace function public.admin_update_subscription_status(
  p_user_id uuid,
  p_status text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_platform_admin() then raise exception 'Administrator access required.'; end if;
  if p_status not in ('active', 'suspended', 'expired', 'canceled') then raise exception 'Invalid subscription status.'; end if;
  update public.client_subscriptions set status = p_status, updated_at = now()
    where user_id = p_user_id;
  if not found then raise exception 'Subscription not found.'; end if;
end;
$$;

create or replace function public.admin_extend_subscription(
  p_user_id uuid,
  p_days integer
)
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  v_expiry timestamptz;
begin
  if not public.is_platform_admin() then raise exception 'Administrator access required.'; end if;
  if p_days < 1 or p_days > 3650 then raise exception 'Extension must be between 1 and 3650 days.'; end if;
  update public.client_subscriptions set expires_at = greatest(expires_at, now()) + make_interval(days => p_days), updated_at = now()
    where user_id = p_user_id returning expires_at into v_expiry;
  if not found then raise exception 'Subscription not found.'; end if;
  return v_expiry;
end;
$$;

create or replace function public.admin_set_account_status(
  p_user_id uuid,
  p_status text,
  p_note text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_platform_admin() then raise exception 'Administrator access required.'; end if;
  if p_status not in ('active', 'suspended', 'deactivated') then raise exception 'Invalid account status.'; end if;
  insert into public.client_account_controls (user_id, status, note, updated_by, updated_at)
    values (p_user_id, p_status, p_note, auth.uid(), now())
    on conflict (user_id) do update set status = excluded.status, note = excluded.note,
      updated_by = excluded.updated_by, updated_at = now();
end;
$$;

create or replace function public.get_subscription_credit_usage()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_started_at timestamptz;
  v_email_used bigint;
  v_discovery_used bigint;
begin
  if v_user_id is null then raise exception 'Authentication required.'; end if;
  select started_at into v_started_at from public.client_subscriptions where user_id = v_user_id;
  if v_started_at is null then return jsonb_build_object('email_sending', 0, 'email_discovery', 0); end if;
  select
    coalesce(sum(case when service = 'email_sending' and transaction_type = 'usage' then -amount
      when service = 'email_sending' and transaction_type = 'refund' then -amount else 0 end), 0),
    coalesce(sum(case when service = 'email_discovery' and transaction_type = 'usage' then -amount
      when service = 'email_discovery' and transaction_type = 'refund' then -amount else 0 end), 0)
    into v_email_used, v_discovery_used
    from public.credit_transactions
    where user_id = v_user_id and created_at >= v_started_at;
  return jsonb_build_object(
    'email_sending', greatest(0, v_email_used),
    'email_discovery', greatest(0, v_discovery_used)
  );
end;
$$;

create or replace function public.process_subscription_checkout(
  p_event_id text,
  p_event_type text,
  p_checkout_session text,
  p_payment_intent text,
  p_amount_cents integer,
  p_currency text,
  p_paid_at timestamptz,
  p_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payment public.subscription_payments%rowtype;
  v_package public.subscription_packages%rowtype;
  v_subscription public.client_subscriptions%rowtype;
  v_old_email integer;
  v_old_discovery integer;
  v_new_email integer;
  v_new_discovery integer;
  v_started timestamptz := coalesce(p_paid_at, now());
  v_expiry_base timestamptz := coalesce(p_paid_at, now());
  v_expiry timestamptz;
  v_refunded integer;
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise exception 'Service role required.'; end if;
  insert into public.stripe_webhook_events (id, event_type) values (p_event_id, p_event_type)
    on conflict (id) do nothing;
  if not found then return jsonb_build_object('processed', false, 'duplicate', true); end if;

  select * into v_payment from public.subscription_payments
    where stripe_checkout_session = p_checkout_session for update;
  if not found then raise exception 'Checkout session is not registered.'; end if;
  if v_payment.status = 'paid' then return jsonb_build_object('processed', false, 'duplicate_payment', true); end if;
  if p_amount_cents <> v_payment.amount_cents or lower(p_currency) <> lower(v_payment.currency) then
    raise exception 'Verified Stripe amount does not match the stored checkout.';
  end if;
  select coalesce(max(refunded_cents), 0) into v_refunded from public.stripe_webhook_events
    where payment_intent = p_payment_intent and event_type = 'charge.refunded';
  if v_refunded >= v_payment.amount_cents and v_payment.amount_cents > 0 then
    update public.subscription_payments set status = 'refunded', refunded_cents = v_payment.amount_cents,
      stripe_payment_intent = p_payment_intent, paid_at = p_paid_at, metadata = p_metadata
      where id = v_payment.id;
    return jsonb_build_object('processed', false, 'fully_refunded', true);
  end if;
  select * into v_package from public.subscription_packages where id = v_payment.package_id;
  if not found then raise exception 'Purchased package is no longer enabled.'; end if;

  select * into v_subscription from public.client_subscriptions where user_id = v_payment.user_id for update;
  if v_subscription.id is not null and v_subscription.package_id = v_package.id
    and v_subscription.status = 'active' and v_subscription.expires_at > v_started then
    v_expiry_base := v_subscription.expires_at;
  end if;
  v_expiry := v_expiry_base + make_interval(days => v_package.duration_days);
  insert into public.client_subscriptions (user_id, package_id, status, started_at, expires_at, last_payment_at, updated_at)
    values (v_payment.user_id, v_package.id, 'active', v_started, v_expiry, p_paid_at, now())
    on conflict (user_id) do update set package_id = excluded.package_id, status = 'active',
      started_at = excluded.started_at, expires_at = excluded.expires_at,
      last_payment_at = excluded.last_payment_at, updated_at = now()
    returning * into v_subscription;

  insert into public.credit_balances (user_id) values (v_payment.user_id) on conflict (user_id) do nothing;
  select email_sending, email_discovery into v_old_email, v_old_discovery
    from public.credit_balances where user_id = v_payment.user_id for update;
  if v_package.rollover_policy = 'rollover' then
    v_new_email := v_old_email + v_package.email_sending_credits;
    v_new_discovery := v_old_discovery + v_package.email_discovery_credits;
  else
    v_new_email := v_package.email_sending_credits;
    v_new_discovery := v_package.email_discovery_credits;
  end if;
  update public.credit_balances set email_sending = v_new_email, email_discovery = v_new_discovery, updated_at = now()
    where user_id = v_payment.user_id;
  update public.subscription_payments set status = 'paid', refunded_cents = least(v_payment.amount_cents, v_refunded),
    subscription_id = v_subscription.id,
    stripe_payment_intent = p_payment_intent, paid_at = p_paid_at, metadata = p_metadata
    where id = v_payment.id;
  insert into public.credit_transactions (user_id, service, amount, balance_after, transaction_type, reference_key, note)
    values
      (v_payment.user_id, 'email_sending', v_new_email - v_old_email, v_new_email, 'allocation', 'payment:' || p_checkout_session || ':email', v_package.name || ' email-sending credit allocation.'),
      (v_payment.user_id, 'email_discovery', v_new_discovery - v_old_discovery, v_new_discovery, 'allocation', 'payment:' || p_checkout_session || ':discovery', v_package.name || ' email-discovery credit allocation.');
  return jsonb_build_object('processed', true, 'subscription_id', v_subscription.id, 'expires_at', v_expiry);
end;
$$;

create or replace function public.process_subscription_refund(
  p_event_id text,
  p_payment_intent text,
  p_refunded_cents integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payment public.subscription_payments%rowtype;
  v_refunded integer;
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise exception 'Service role required.'; end if;
  if p_refunded_cents < 0 then raise exception 'Invalid refund amount.'; end if;
  insert into public.stripe_webhook_events (id, event_type, payment_intent, refunded_cents)
    values (p_event_id, 'charge.refunded', p_payment_intent, p_refunded_cents)
    on conflict (id) do nothing;
  if not found then return jsonb_build_object('processed', false, 'duplicate', true); end if;

  select * into v_payment from public.subscription_payments
    where stripe_payment_intent = p_payment_intent for update;
  if not found then return jsonb_build_object('processed', false, 'pending_checkout', true); end if;

  v_refunded := least(v_payment.amount_cents, greatest(v_payment.refunded_cents, p_refunded_cents));
  update public.subscription_payments set
    refunded_cents = v_refunded,
    status = case when v_refunded >= amount_cents then 'refunded' else status end
    where id = v_payment.id;
  return jsonb_build_object('processed', true, 'refunded_cents', v_refunded);
end;
$$;

alter table public.subscription_packages enable row level security;
alter table public.client_account_controls enable row level security;
alter table public.client_subscriptions enable row level security;
alter table public.credit_balances enable row level security;
alter table public.subscription_payments enable row level security;
alter table public.credit_transactions enable row level security;
alter table public.subscription_admin_audit enable row level security;
alter table public.stripe_webhook_events enable row level security;

create policy "Enabled packages are visible to clients and all packages to admins"
  on public.subscription_packages for select to authenticated
  using (
    enabled
    or public.is_platform_admin()
    or exists (
      select 1 from public.client_subscriptions s
      where s.package_id = public.subscription_packages.id and s.user_id = auth.uid()
    )
  );
create policy "Clients can view their account control status"
  on public.client_account_controls for select to authenticated
  using (auth.uid() = user_id or public.is_platform_admin());
create policy "Clients and admins can view subscriptions"
  on public.client_subscriptions for select to authenticated
  using (auth.uid() = user_id or public.is_platform_admin());
create policy "Clients and admins can view credit balances"
  on public.credit_balances for select to authenticated
  using (auth.uid() = user_id or public.is_platform_admin());
create policy "Clients and admins can view payments"
  on public.subscription_payments for select to authenticated
  using (auth.uid() = user_id or public.is_platform_admin());
create policy "Clients and admins can view credit transactions"
  on public.credit_transactions for select to authenticated
  using (auth.uid() = user_id or public.is_platform_admin());
create policy "Only admins can view subscription audit"
  on public.subscription_admin_audit for select to authenticated
  using (public.is_platform_admin());

revoke all on public.subscription_packages, public.client_account_controls, public.client_subscriptions,
  public.credit_balances, public.subscription_payments, public.credit_transactions,
  public.subscription_admin_audit, public.stripe_webhook_events from anon;
grant select on public.subscription_packages, public.client_account_controls, public.client_subscriptions,
  public.credit_balances, public.subscription_payments, public.credit_transactions to authenticated;

revoke all on function public.reserve_service_credits(text, integer, text, text) from public, anon;
revoke all on function public.settle_service_credit_reservation(text, integer) from public, anon;
revoke all on function public.refund_service_credit_reservation(text, text, text) from public, anon;
revoke all on function public.admin_adjust_service_credits(uuid, text, integer, text, text) from public, anon;
revoke all on function public.admin_assign_subscription(uuid, text) from public, anon;
revoke all on function public.admin_update_subscription_status(uuid, text) from public, anon;
revoke all on function public.admin_extend_subscription(uuid, integer) from public, anon;
revoke all on function public.admin_set_account_status(uuid, text, text) from public, anon;
revoke all on function public.get_subscription_credit_usage() from public, anon;
revoke all on function public.process_subscription_checkout(text, text, text, text, integer, text, timestamptz, jsonb) from public, anon, authenticated;
revoke all on function public.process_subscription_refund(text, text, integer) from public, anon, authenticated;
grant execute on function public.reserve_service_credits(text, integer, text, text) to authenticated;
grant execute on function public.settle_service_credit_reservation(text, integer) to authenticated;
grant execute on function public.refund_service_credit_reservation(text, text, text) to authenticated;
grant execute on function public.admin_adjust_service_credits(uuid, text, integer, text, text) to authenticated;
grant execute on function public.admin_assign_subscription(uuid, text) to authenticated;
grant execute on function public.admin_update_subscription_status(uuid, text) to authenticated;
grant execute on function public.admin_extend_subscription(uuid, integer) to authenticated;
grant execute on function public.admin_set_account_status(uuid, text, text) to authenticated;
grant execute on function public.get_subscription_credit_usage() to authenticated;
grant execute on function public.process_subscription_checkout(text, text, text, text, integer, text, timestamptz, jsonb) to service_role;
grant execute on function public.process_subscription_refund(text, text, integer) to service_role;
