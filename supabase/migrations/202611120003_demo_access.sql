create or replace function public.provision_demo_account(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_email_balance integer;
  v_discovery_balance integer;
begin
  if not exists (
    select 1 from auth.users
    where id = p_user_id and raw_app_meta_data->>'role' = 'demo'
  ) then
    return;
  end if;

  insert into public.client_account_controls (user_id)
    values (p_user_id) on conflict (user_id) do nothing;
  insert into public.credit_balances (user_id)
    values (p_user_id) on conflict (user_id) do nothing;

  perform 1 from public.credit_balances where user_id = p_user_id for update;
  if not exists (
    select 1 from public.credit_transactions
    where reference_key = 'demo-allocation:' || p_user_id::text || ':email'
  ) then
    update public.credit_balances
      set email_sending = email_sending + 100, updated_at = now()
      where user_id = p_user_id returning email_sending into v_email_balance;
    insert into public.credit_transactions
      (user_id, service, amount, balance_after, transaction_type, reference_key, note)
    values
      (p_user_id, 'email_sending', 100, v_email_balance, 'allocation',
       'demo-allocation:' || p_user_id::text || ':email', 'Demo allowance: 100 email sends.');
  end if;

  if not exists (
    select 1 from public.credit_transactions
    where reference_key = 'demo-allocation:' || p_user_id::text || ':discovery'
  ) then
    update public.credit_balances
      set email_discovery = email_discovery + 10, updated_at = now()
      where user_id = p_user_id returning email_discovery into v_discovery_balance;
    insert into public.credit_transactions
      (user_id, service, amount, balance_after, transaction_type, reference_key, note)
    values
      (p_user_id, 'email_discovery', 10, v_discovery_balance, 'allocation',
       'demo-allocation:' || p_user_id::text || ':discovery', 'Demo allowance: 10 discovery credits.');
  end if;
end;
$$;

revoke all on function public.provision_demo_account(uuid) from public, anon, authenticated;

create or replace function public.handle_demo_account_metadata()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.raw_app_meta_data->>'role' = 'demo' then
    perform public.provision_demo_account(new.id);
  end if;
  return new;
end;
$$;

create trigger on_auth_user_demo_account_insert
after insert on auth.users
for each row execute procedure public.handle_demo_account_metadata();

create trigger on_auth_user_demo_account_metadata_update
after update of raw_app_meta_data on auth.users
for each row execute procedure public.handle_demo_account_metadata();

do $$
declare
  v_user_id uuid;
begin
  for v_user_id in
    select id from auth.users where raw_app_meta_data->>'role' = 'demo'
  loop
    perform public.provision_demo_account(v_user_id);
  end loop;
end;
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
  v_is_demo boolean := coalesce(auth.jwt()->'app_metadata'->>'role', '') = 'demo';
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
  if not v_is_demo and not exists (
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

revoke all on function public.reserve_service_credits(text, integer, text, text) from public, anon;
grant execute on function public.reserve_service_credits(text, integer, text, text) to authenticated;
