
-- 1. Users Table & Extensions
create table if not exists public.users (
  id text primary key,
  name text,
  email text,
  phone text,
  department text,
  role text,
  avatar_url text,
  custom_fields jsonb default '[]'::jsonb,
  created_at timestamp with time zone default timezone('utc'::text, now())
);
-- Migrations for Users
alter table public.users add column if not exists phone text;
alter table public.users add column if not exists department text;
alter table public.users add column if not exists role text;
alter table public.users add column if not exists avatar_url text;
alter table public.users add column if not exists custom_fields jsonb default '[]'::jsonb;

-- 2. Clients Table
create table if not exists public.clients (
  id text primary key,
  user_id text, -- Owner ID
  name text,
  company text,
  email text,
  phone text,
  address text,
  avatar_url text,
  industry text,
  status text,
  custom_fields jsonb default '[]'::jsonb,
  created_at timestamp with time zone default timezone('utc'::text, now())
);
-- Migrations for Clients
alter table public.clients add column if not exists user_id text;
alter table public.clients add column if not exists industry text;
alter table public.clients add column if not exists status text;
alter table public.clients add column if not exists avatar_url text;
alter table public.clients add column if not exists custom_fields jsonb default '[]'::jsonb;
create index if not exists idx_clients_user_id on public.clients(user_id);

-- 3. Visits Table
create table if not exists public.visits (
  id text primary key,
  client_id text references public.clients(id),
  client_name text,
  user_id text,
  date timestamp with time zone,
  category text,
  summary text,
  raw_notes text,
  participants text,
  outcome text,
  action_items jsonb default '[]'::jsonb,
  sentiment_score numeric,
  follow_up_email_draft text,
  custom_fields jsonb default '[]'::jsonb,
  attachments jsonb default '[]'::jsonb,
  created_at timestamp with time zone default timezone('utc'::text, now())
);
-- Migrations for Visits
alter table public.visits add column if not exists client_name text;
alter table public.visits add column if not exists user_id text;
alter table public.visits add column if not exists category text;
alter table public.visits add column if not exists attachments jsonb default '[]'::jsonb;
alter table public.visits add column if not exists custom_fields jsonb default '[]'::jsonb;
create index if not exists idx_visits_client_id on public.visits(client_id);
create index if not exists idx_visits_user_id on public.visits(user_id);

-- 4. Field Definitions Table (Global Config)
create table if not exists public.field_definitions (
  id text primary key,
  target text, -- 'Client', 'Visit', 'User'
  label text,
  type text, -- 'text', 'number', 'date'
  created_at timestamp with time zone default timezone('utc'::text, now())
);

-- 5. Departments Table (Organizational Structure)
create table if not exists public.departments (
  id text primary key,
  name text not null,
  parent_id text references public.departments(id),
  manager_id text,
  description text,
  created_at timestamp with time zone default timezone('utc'::text, now())
);
create index if not exists idx_departments_parent_id on public.departments(parent_id);

-- IMPORTANT: Force PostgREST schema cache reload to recognize new columns immediately
NOTIFY pgrst, 'reload config';
