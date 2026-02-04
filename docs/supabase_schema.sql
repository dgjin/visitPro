
-- Enable Row Level Security (RLS) is recommended, but for this demo we will keep it simple.
-- You can enable RLS and add policies later based on 'users' table or auth.users.

-- 1. Users Table
create table if not exists public.users (
  id text primary key,
  name text,
  email text,
  phone text,
  department text,
  -- team_name removed in V1.2
  role text,
  avatar_url text,
  custom_fields jsonb default '[]'::jsonb,
  created_at timestamp with time zone default timezone('utc'::text, now())
);

-- 2. Clients Table
create table if not exists public.clients (
  id text primary key,
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

-- Indexes for performance
create index if not exists idx_visits_client_id on public.visits(client_id);
create index if not exists idx_visits_user_id on public.visits(user_id);
create index if not exists idx_departments_parent_id on public.departments(parent_id);
