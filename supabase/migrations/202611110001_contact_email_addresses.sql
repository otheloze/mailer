create table public.contact_emails (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null references public.contacts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  email text not null,
  status public.contact_status not null default 'pending_consent',
  consent_at timestamptz,
  consent_source text,
  resend_contact_id text,
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, email)
);

create unique index contact_emails_one_primary_per_contact
  on public.contact_emails(contact_id)
  where is_primary;
create index contact_emails_user_contact_idx
  on public.contact_emails(user_id, contact_id);
create index contact_emails_user_status_idx
  on public.contact_emails(user_id, status);

alter table public.contact_emails enable row level security;
create policy "Contact email addresses are private to their owner"
  on public.contact_emails for all
  using (auth.uid() = user_id)
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.contacts c
      where c.id = contact_id and c.user_id = auth.uid()
    )
  );

insert into public.contact_emails (
  contact_id,
  user_id,
  email,
  status,
  consent_at,
  consent_source,
  resend_contact_id,
  is_primary,
  created_at,
  updated_at
)
select
  id,
  user_id,
  lower(email),
  status,
  consent_at,
  consent_source,
  resend_contact_id,
  true,
  created_at,
  updated_at
from public.contacts
on conflict (user_id, email) do nothing;

alter table public.campaign_recipients
  add column contact_email_id uuid references public.contact_emails(id) on delete set null;

update public.campaign_recipients r
set contact_email_id = e.id
from public.contacts c
join public.contact_emails e
  on e.contact_id = c.id and e.is_primary
where r.contact_id = c.id
  and r.contact_email_id is null;

alter table public.campaign_recipients
  drop constraint if exists campaign_recipients_campaign_id_contact_id_key;

create unique index campaign_recipients_campaign_email_key
  on public.campaign_recipients(campaign_id, contact_email_id)
  where contact_email_id is not null;
