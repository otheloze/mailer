-- Free trial for new accounts: one test email (sent over SMTP) and one discovery
-- (capped at a few results). After both are used, the user must subscribe.
--
-- Only accounts that have never held a subscription are eligible. Admins and
-- demo accounts already have access and are never gated.

create table public.trial_usage (
  user_id uuid primary key references auth.users(id) on delete cascade,
  test_email_used_at timestamptz,
  discovery_used_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.trial_usage enable row level security;
create policy "Users can view their own trial usage"
  on public.trial_usage for select to authenticated
  using (auth.uid() = user_id);

-- True when the user can use the product normally (active subscription, admin or demo).
create or replace function public.user_has_full_access(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.client_subscriptions
    where user_id = p_user_id and status = 'active' and expires_at > now()
  ) or exists (
    select 1 from auth.users
    where id = p_user_id and raw_app_meta_data->>'role' in ('admin', 'demo')
  );
$$;
revoke all on function public.user_has_full_access(uuid) from public, anon, authenticated;

-- Atomically consumes one trial action for the signed-in user.
-- Returns true when the trial action was granted, false when it is unavailable.
create or replace function public.claim_trial_action(p_action text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_updated integer;
begin
  if v_user_id is null then raise exception 'Authentication required.'; end if;
  if p_action not in ('test_email', 'discovery') then raise exception 'Unknown trial action.'; end if;
  -- Subscribers, admins and demo accounts never use the trial.
  if public.user_has_full_access(v_user_id) then return false; end if;
  -- Only accounts that never held a subscription are eligible.
  if exists (select 1 from public.client_subscriptions where user_id = v_user_id) then return false; end if;

  insert into public.trial_usage (user_id) values (v_user_id) on conflict (user_id) do nothing;
  if p_action = 'test_email' then
    update public.trial_usage set test_email_used_at = now()
      where user_id = v_user_id and test_email_used_at is null;
  else
    update public.trial_usage set discovery_used_at = now()
      where user_id = v_user_id and discovery_used_at is null;
  end if;
  get diagnostics v_updated = row_count;
  return v_updated = 1;
end;
$$;
revoke all on function public.claim_trial_action(text) from public, anon;
grant execute on function public.claim_trial_action(text) to authenticated;

-- Gives a trial action back after a failed send or provider call. Server only.
create or replace function public.release_trial_action(p_user_id uuid, p_action text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_action = 'test_email' then
    update public.trial_usage set test_email_used_at = null where user_id = p_user_id;
  elsif p_action = 'discovery' then
    update public.trial_usage set discovery_used_at = null where user_id = p_user_id;
  else
    raise exception 'Unknown trial action.';
  end if;
end;
$$;
revoke all on function public.release_trial_action(uuid, text) from public, anon, authenticated;
grant execute on function public.release_trial_action(uuid, text) to service_role;

-- Current trial state for the signed-in user, used by the app shell and middleware.
create or replace function public.get_trial_status()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_usage public.trial_usage%rowtype;
  v_full boolean;
  v_eligible boolean;
begin
  if v_user_id is null then raise exception 'Authentication required.'; end if;
  v_full := public.user_has_full_access(v_user_id);
  v_eligible := not v_full and not exists (select 1 from public.client_subscriptions where user_id = v_user_id);
  select * into v_usage from public.trial_usage where user_id = v_user_id;
  return jsonb_build_object(
    'has_full_access', v_full,
    'trial_eligible', v_eligible,
    'test_email_available', v_eligible and v_usage.test_email_used_at is null,
    'discovery_available', v_eligible and v_usage.discovery_used_at is null
  );
end;
$$;
revoke all on function public.get_trial_status() from public, anon;
grant execute on function public.get_trial_status() to authenticated;
