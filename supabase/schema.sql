-- Planner – Tabellen für Supabase.
-- Im Supabase-Dashboard unter "SQL Editor" einfügen und ausführen.

create table if not exists public.users (
  id            text primary key,
  email         text not null unique,
  username      text,
  password_hash text not null,
  created_at    timestamptz default now()
);

create table if not exists public.sessions (
  id_hash    text primary key,
  user_id    text not null references public.users(id) on delete cascade,
  expires_at bigint not null
);

create table if not exists public.names (
  id         text primary key,
  user_id    text not null references public.users(id) on delete cascade,
  plan       text not null,
  name       text not null,
  labels     jsonb not null default '[]',
  absences   jsonb not null default '[]',
  created_at timestamptz default now()
);
create index if not exists names_user_plan on public.names (user_id, plan);

create table if not exists public.schedules (
  id         text primary key,
  user_id    text not null references public.users(id) on delete cascade,
  plan       text not null,
  year       int  not null,
  weeks      jsonb not null default '[]',
  updated_at timestamptz
);

create table if not exists public.minis (
  user_id    text primary key references public.users(id) on delete cascade,
  settings   jsonb not null default '{}',
  logo       text,
  termine    jsonb,
  updated_at timestamptz
);

-- Zugriff nur über den Server (Service-Role-Key). Ohne Policies kann der
-- öffentliche "anon"-Schlüssel nichts lesen oder schreiben.
alter table public.users     enable row level security;
alter table public.sessions  enable row level security;
alter table public.names     enable row level security;
alter table public.schedules enable row level security;
alter table public.minis     enable row level security;
