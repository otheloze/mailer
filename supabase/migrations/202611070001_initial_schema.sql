create extension if not exists pgcrypto;

create type public.contact_status as enum ('subscribed', 'unsubscribed', 'bounced', 'complained');
create type public.campaign_status as enum ('draft', 'scheduled', 'sending', 'sent', 'failed', 'canceled');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  company_name text,
  timezone text not null default 'UTC',
  default_from_name text,
  default_from_email text,
  default_reply_to text,
  brand_color text not null default '#6857e8',
  email_footer text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.audiences (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  resend_segment_id text,
  created_at timestamptz not null default now(),
  unique(user_id, name)
);

create table public.contacts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  audience_id uuid references public.audiences(id) on delete set null,
  email text not null,
  first_name text,
  last_name text,
  status public.contact_status not null default 'subscribed',
  consent_at timestamptz,
  consent_source text,
  tags text[] not null default '{}',
  resend_contact_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, email)
);

create table public.campaigns (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  audience_id uuid references public.audiences(id) on delete set null,
  name text not null,
  subject text not null default '',
  preview_text text not null default '',
  from_name text not null default '',
  from_email text not null default '',
  reply_to text,
  html text not null default '',
  text_content text not null default '',
  status public.campaign_status not null default 'draft',
  resend_broadcast_id text,
  scheduled_at timestamptz,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.campaign_recipients (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  status text not null default 'pending',
  resend_email_id text,
  created_at timestamptz not null default now(),
  unique(campaign_id, contact_id)
);

create table public.campaign_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  campaign_id uuid references public.campaigns(id) on delete set null,
  contact_id uuid references public.contacts(id) on delete set null,
  resend_event_id text not null unique,
  event_type text not null,
  occurred_at timestamptz not null,
  payload jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create table public.email_templates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  subject text not null default '',
  html text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.scheduled_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  campaign_id uuid not null unique references public.campaigns(id) on delete cascade,
  run_at timestamptz not null,
  status text not null default 'pending' check (status in ('pending', 'processing', 'done', 'failed', 'canceled')),
  attempts integer not null default 0,
  last_error text,
  created_at timestamptz not null default now()
);

create table public.activity_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  action text not null,
  entity_type text,
  entity_id uuid,
  details jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create index contacts_user_audience_idx on public.contacts(user_id, audience_id);
create index contacts_user_status_idx on public.contacts(user_id, status);
create index campaign_events_campaign_time_idx on public.campaign_events(campaign_id, occurred_at);
create index scheduled_jobs_due_idx on public.scheduled_jobs(run_at) where status = 'pending';

alter table public.profiles enable row level security;
alter table public.audiences enable row level security;
alter table public.contacts enable row level security;
alter table public.campaigns enable row level security;
alter table public.campaign_recipients enable row level security;
alter table public.campaign_events enable row level security;
alter table public.email_templates enable row level security;
alter table public.scheduled_jobs enable row level security;
alter table public.activity_logs enable row level security;

create policy "Profiles are private to their owner" on public.profiles for all using (auth.uid() = id) with check (auth.uid() = id);
create policy "Audiences are private to their owner" on public.audiences for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Contacts are private to their owner" on public.contacts for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Campaigns are private to their owner" on public.campaigns for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Recipients are private to campaign owner" on public.campaign_recipients for all using (exists (select 1 from public.campaigns c where c.id = campaign_id and c.user_id = auth.uid())) with check (exists (select 1 from public.campaigns c where c.id = campaign_id and c.user_id = auth.uid()));
create policy "Events are private to their owner" on public.campaign_events for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Templates are private to their owner" on public.email_templates for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Scheduled jobs are private to their owner" on public.scheduled_jobs for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Activity is private to its owner" on public.activity_logs for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', ''));
  return new;
end;
$$;

create trigger on_auth_user_created after insert on auth.users
for each row execute procedure public.handle_new_user();
