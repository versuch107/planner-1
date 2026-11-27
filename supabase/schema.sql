-- Planner – Datenbank für Supabase.
-- Im Supabase-Dashboard unter "SQL Editor" komplett einfügen und "Run" klicken.
--
-- Anmeldung läuft über Supabase Auth (auth.users). Jede Zeile gehört einem Benutzer
-- (user_id); Row Level Security sorgt dafür, dass jeder nur seine eigenen Daten
-- sieht und ändern kann – auch wenn jemand den öffentlichen Schlüssel aus der Webseite kennt.
--
-- Falls du schon die ALTE schema.sql (mit eigener users-Tabelle) ausgeführt hast,
-- zuerst diese Zeile ausführen (löscht die alten Planner-Tabellen samt Inhalt):
--   drop table if exists public.minis, public.schedules, public.names, public.sessions, public.users cascade;

create table if not exists public.names (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  plan       text not null check (plan in ('bardienst', 'mini')),
  name       text not null check (char_length(name) between 1 and 100),
  labels     jsonb not null default '[]',
  absences   jsonb not null default '[]',
  created_at timestamptz not null default now()
);
create unique index if not exists names_unique_per_plan on public.names (user_id, plan, lower(name));

create table if not exists public.schedules (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  plan       text not null,
  year       int  not null check (year between 2000 and 2100),
  weeks      jsonb not null default '[]',
  updated_at timestamptz,
  unique (user_id, plan, year)
);

create table if not exists public.minis (
  user_id    uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  settings   jsonb not null default '{}',
  logo       text check (logo is null or char_length(logo) < 1500000),
  termine    jsonb,
  updated_at timestamptz
);

-- Nur angemeldete Benutzer dürfen überhaupt auf die Tabellen zugreifen
-- (welche Zeilen, regeln die Policies unten). Nicht angemeldete ("anon") bekommen nichts.
grant select, insert, update, delete on public.names, public.schedules, public.minis to authenticated;
revoke all on public.names, public.schedules, public.minis from anon;

alter table public.names     enable row level security;
alter table public.schedules enable row level security;
alter table public.minis     enable row level security;

drop policy if exists "eigene Namen" on public.names;
create policy "eigene Namen" on public.names
  for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "eigene Pläne" on public.schedules;
create policy "eigene Pläne" on public.schedules
  for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "eigener Miniplan" on public.minis;
create policy "eigener Miniplan" on public.minis
  for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
