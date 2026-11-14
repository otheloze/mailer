create table public.prospect_leads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  email text not null,
  first_name text,
  last_name text,
  job_title text,
  seniority text,
  department text,
  company_name text,
  company_domain text not null,
  company_size text,
  industry text,
  country text,
  email_type text,
  email_confidence integer not null default 0 check (email_confidence between 0 and 100),
  email_status text not null default 'unverified' check (email_status in ('unverified', 'valid', 'risky', 'invalid', 'unknown')),
  lead_score integer not null default 0 check (lead_score between 0 and 100),
  sources jsonb not null default '[]'::jsonb,
  provider text not null default 'hunter',
  discovered_at timestamptz not null default now(),
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, email)
);

create index prospect_leads_user_created_idx on public.prospect_leads(user_id, created_at desc);
create index prospect_leads_user_domain_idx on public.prospect_leads(user_id, company_domain);
create index prospect_leads_user_filters_idx on public.prospect_leads(user_id, industry, country, email_status);

alter table public.prospect_leads enable row level security;

create policy "Prospect leads are private to their owner"
  on public.prospect_leads for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
