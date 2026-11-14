-- Verified email lead data: packages for sale and customer orders.
-- Orders are created and paid through the server only (PayPal / Paystack),
-- then fulfilled by an administrator.

create table if not exists public.lead_data_packages (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9-]{2,40}$'),
  name text not null,
  lead_count integer not null check (lead_count > 0),
  price_cents integer not null check (price_cents >= 0),          -- PayPal, USD cents
  paystack_price_kobo integer not null check (paystack_price_kobo >= 0), -- Paystack, NGN kobo
  enabled boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.lead_data_packages (slug, name, lead_count, price_cents, paystack_price_kobo, sort_order) values
  ('leads-10k', '10,000 leads', 10000, 500, 600000, 1),
  ('leads-30k', '30,000 leads', 30000, 1000, 1200000, 2),
  ('leads-50k', '50,000 leads', 50000, 2000, 2500000, 3),
  ('leads-100k', '100,000 leads', 100000, 5000, 6000000, 4)
on conflict (slug) do nothing;

alter table public.lead_data_packages enable row level security;
create policy "Enabled lead packages are public" on public.lead_data_packages
  for select using (enabled or public.is_platform_admin());
grant select on public.lead_data_packages to anon, authenticated;
grant all on public.lead_data_packages to service_role;

create table if not exists public.lead_data_orders (
  id uuid primary key default gen_random_uuid(),
  package_id uuid not null references public.lead_data_packages(id),
  user_id uuid references auth.users(id) on delete set null,
  email text not null,
  targeting text check (targeting is null or length(targeting) <= 500),
  lead_count integer not null check (lead_count > 0),
  amount_minor integer not null check (amount_minor > 0),
  currency text not null check (currency in ('USD', 'NGN')),
  payment_provider text not null check (payment_provider in ('paypal', 'paystack')),
  provider_reference text not null unique,
  status text not null default 'pending' check (status in ('pending', 'paid', 'failed', 'fulfilled', 'refunded')),
  paid_at timestamptz,
  fulfilled_at timestamptz,
  admin_note text check (admin_note is null or length(admin_note) <= 1000),
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists lead_data_orders_status_idx on public.lead_data_orders (status, created_at desc);
create index if not exists lead_data_orders_email_idx on public.lead_data_orders (lower(email), created_at desc);

-- Server-only: no client policies. Administrators read and update through the service role.
alter table public.lead_data_orders enable row level security;
revoke all on public.lead_data_orders from anon, authenticated;
grant all on public.lead_data_orders to service_role;
