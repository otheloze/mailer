alter table public.subscription_packages
  add column paystack_price_kobo integer not null default 0 check (paystack_price_kobo >= 0);

update public.subscription_packages set paystack_price_kobo = case slug
  when 'basic' then 600000
  when 'bronze' then 1800000
  when 'silver' then 4500000
  when 'premium' then 6500000
  else 0
end;

alter table public.subscription_payments
  add column payment_provider text not null default 'stripe'
    check (payment_provider in ('stripe', 'paypal', 'paystack')),
  add column provider_reference text;

update public.subscription_payments
  set provider_reference = stripe_checkout_session
  where stripe_checkout_session is not null;

alter table public.subscription_payments alter column stripe_checkout_session drop not null;
create unique index subscription_payments_provider_reference_idx
  on public.subscription_payments(payment_provider, provider_reference)
  where provider_reference is not null;

create or replace function public.process_verified_subscription_payment(
  p_event_id text,
  p_provider text,
  p_reference text,
  p_amount_minor integer,
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
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise exception 'Service role required.'; end if;
  if p_provider not in ('paypal', 'paystack') then raise exception 'Unsupported payment provider.'; end if;
  insert into public.stripe_webhook_events (id, event_type) values (p_event_id, p_provider || '.payment')
    on conflict (id) do nothing;
  if not found then return jsonb_build_object('processed', false, 'duplicate', true); end if;

  select * into v_payment from public.subscription_payments
    where payment_provider = p_provider and provider_reference = p_reference for update;
  if not found then raise exception 'Payment reference is not registered.'; end if;
  if v_payment.status = 'paid' then return jsonb_build_object('processed', false, 'duplicate_payment', true); end if;
  if p_amount_minor <> v_payment.amount_cents or lower(p_currency) <> lower(v_payment.currency) then
    raise exception 'Verified payment amount or currency does not match the stored checkout.';
  end if;
  select * into v_package from public.subscription_packages where id = v_payment.package_id;
  if not found then raise exception 'Purchased package is not available.'; end if;

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
  update public.subscription_payments set status = 'paid', subscription_id = v_subscription.id,
    paid_at = p_paid_at, metadata = p_metadata
    where id = v_payment.id;
  insert into public.credit_transactions (user_id, service, amount, balance_after, transaction_type, reference_key, note)
    values
      (v_payment.user_id, 'email_sending', v_new_email - v_old_email, v_new_email, 'allocation',
        'payment:' || p_provider || ':' || p_reference || ':email', v_package.name || ' email-sending credit allocation.'),
      (v_payment.user_id, 'email_discovery', v_new_discovery - v_old_discovery, v_new_discovery, 'allocation',
        'payment:' || p_provider || ':' || p_reference || ':discovery', v_package.name || ' email-discovery credit allocation.');
  return jsonb_build_object('processed', true, 'subscription_id', v_subscription.id, 'expires_at', v_expiry);
end;
$$;

revoke all on function public.process_verified_subscription_payment(text, text, text, integer, text, timestamptz, jsonb) from public, anon, authenticated;
grant execute on function public.process_verified_subscription_payment(text, text, text, integer, text, timestamptz, jsonb) to service_role;
