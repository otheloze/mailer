-- Production hardening
-- 1. Credit settlement/refund can only be performed by the server (service role).
-- 2. Campaign delivery state can only be changed by the server.
-- 3. Analytics events are read-only for clients.
-- 4. Per-user sender domain grants.
-- 5. Database-backed rate limiting.

-- ---------------------------------------------------------------------------
-- 1. Server-only credit settlement and refunds
-- ---------------------------------------------------------------------------
-- The original functions trusted auth.uid() and were executable by every
-- signed-in user, which let a client call the refund function directly and
-- recover credits for campaigns that were already delivered.

revoke all on function public.settle_service_credit_reservation(text, integer) from public, anon, authenticated;
revoke all on function public.refund_service_credit_reservation(text, text, text) from public, anon, authenticated;

create or replace function public.server_settle_service_credit_reservation(
  p_user_id uuid,
  p_reference_key text,
  p_consumed integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_usage public.credit_transactions%rowtype;
  v_reserved integer;
  v_refund integer;
  v_balance integer;
begin
  if p_user_id is null then raise exception 'User is required.'; end if;
  if p_consumed is null or p_consumed < 0 then raise exception 'Invalid consumed credit amount.'; end if;
  select * into v_usage from public.credit_transactions
    where reference_key = p_reference_key and user_id = p_user_id and transaction_type = 'usage'
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
        where user_id = p_user_id returning email_sending into v_balance;
    else
      update public.credit_balances set email_discovery = email_discovery + v_refund, updated_at = now()
        where user_id = p_user_id returning email_discovery into v_balance;
    end if;
    insert into public.credit_transactions (user_id, service, amount, balance_after, transaction_type, reference_key, related_reference, note)
      values (p_user_id, v_usage.service, v_refund, v_balance, 'refund', 'settlement-refund:' || p_reference_key, p_reference_key, 'Unused reserved credits returned.');
  end if;
  return jsonb_build_object('settled', true, 'consumed', p_consumed, 'refunded', v_refund);
end;
$$;

create or replace function public.server_refund_service_credit_reservation(
  p_user_id uuid,
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
  v_usage public.credit_transactions%rowtype;
  v_refunded integer;
  v_refund integer;
  v_balance integer;
begin
  if p_user_id is null then raise exception 'User is required.'; end if;
  select * into v_usage from public.credit_transactions
    where reference_key = p_reference_key and user_id = p_user_id and transaction_type = 'usage'
    for update;
  if not found or v_usage.settled_amount is null then raise exception 'Settled credit reservation was not found.'; end if;
  if exists (select 1 from public.credit_transactions where reference_key = p_refund_key) then
    return jsonb_build_object('refunded', true, 'duplicate', true);
  end if;
  select coalesce(sum(amount), 0) into v_refunded from public.credit_transactions
    where related_reference = p_reference_key and transaction_type = 'refund';
  v_refund := v_usage.settled_amount - v_refunded;
  if v_refund <= 0 then return jsonb_build_object('refunded', false, 'amount', 0); end if;

  if v_usage.service = 'email_sending' then
    update public.credit_balances set email_sending = email_sending + v_refund, updated_at = now()
      where user_id = p_user_id returning email_sending into v_balance;
  else
    update public.credit_balances set email_discovery = email_discovery + v_refund, updated_at = now()
      where user_id = p_user_id returning email_discovery into v_balance;
  end if;
  insert into public.credit_transactions (user_id, service, amount, balance_after, transaction_type, reference_key, related_reference, note)
    values (p_user_id, v_usage.service, v_refund, v_balance, 'refund', p_refund_key, p_reference_key, p_note);
  return jsonb_build_object('refunded', true, 'amount', v_refund, 'balance_after', v_balance);
end;
$$;

revoke all on function public.server_settle_service_credit_reservation(uuid, text, integer) from public, anon, authenticated;
revoke all on function public.server_refund_service_credit_reservation(uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.server_settle_service_credit_reservation(uuid, text, integer) to service_role;
grant execute on function public.server_refund_service_credit_reservation(uuid, text, text, text) to service_role;

-- ---------------------------------------------------------------------------
-- 2. Clients may edit campaign content, but not delivery state
-- ---------------------------------------------------------------------------
revoke insert, update on public.campaigns from anon, authenticated;
grant insert (user_id, audience_id, name, subject, preview_text, from_name, from_email, reply_to, html, text_content)
  on public.campaigns to authenticated;
grant update (audience_id, name, subject, preview_text, from_name, from_email, reply_to, html, text_content, updated_at)
  on public.campaigns to authenticated;

-- Content edits are only allowed while a campaign is still a draft or scheduled.
drop policy if exists "Campaigns are private to their owner" on public.campaigns;
create policy "Owners can view campaigns" on public.campaigns
  for select using (auth.uid() = user_id);
create policy "Owners can create draft campaigns" on public.campaigns
  for insert with check (auth.uid() = user_id and status = 'draft');
create policy "Owners can edit unsent campaigns" on public.campaigns
  for update using (auth.uid() = user_id and status in ('draft', 'scheduled'))
  with check (auth.uid() = user_id);
create policy "Owners can delete unsent campaigns" on public.campaigns
  for delete using (auth.uid() = user_id and status in ('draft', 'failed', 'canceled'));

-- ---------------------------------------------------------------------------
-- 3. Analytics are written only by verified webhooks
-- ---------------------------------------------------------------------------
revoke insert, update, delete on public.campaign_events from anon, authenticated;
drop policy if exists "Events are private to their owner" on public.campaign_events;
create policy "Owners can view campaign events" on public.campaign_events
  for select using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- 4. Sender domain grants
-- ---------------------------------------------------------------------------
-- All workspaces share one Resend account, so each user may only send from
-- domains an administrator has granted (plus DEFAULT_SENDER_DOMAINS).
create table if not exists public.sender_domain_grants (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  domain text not null check (domain = lower(domain) and domain ~ '^[a-z0-9.-]+\.[a-z]{2,63}$'),
  granted_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (user_id, domain)
);
alter table public.sender_domain_grants enable row level security;
create policy "Users can view their sender domains" on public.sender_domain_grants
  for select using (auth.uid() = user_id or public.is_platform_admin());
grant select on public.sender_domain_grants to authenticated;
grant all on public.sender_domain_grants to service_role;

-- ---------------------------------------------------------------------------
-- 5. Rate limiting (fixed window, server-only)
-- ---------------------------------------------------------------------------
create table if not exists public.rate_limit_buckets (
  key text primary key,
  window_start timestamptz not null,
  hits integer not null
);
alter table public.rate_limit_buckets enable row level security;
revoke all on public.rate_limit_buckets from anon, authenticated;

create or replace function public.consume_rate_limit(
  p_key text,
  p_limit integer,
  p_window_seconds integer
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_hits integer;
begin
  if p_key is null or length(p_key) > 300 or p_limit < 1 or p_window_seconds < 1 then
    raise exception 'Invalid rate limit request.';
  end if;
  insert into public.rate_limit_buckets as b (key, window_start, hits)
    values (p_key, now(), 1)
  on conflict (key) do update set
    hits = case when b.window_start <= now() - make_interval(secs => p_window_seconds) then 1 else b.hits + 1 end,
    window_start = case when b.window_start <= now() - make_interval(secs => p_window_seconds) then now() else b.window_start end
  returning hits into v_hits;

  if random() < 0.01 then
    delete from public.rate_limit_buckets where window_start < now() - interval '1 day';
  end if;
  return v_hits <= p_limit;
end;
$$;

revoke all on function public.consume_rate_limit(text, integer, integer) from public, anon, authenticated;
grant execute on function public.consume_rate_limit(text, integer, integer) to service_role;
