-- Waterwake (Flussreich 2): Cloud-Spielstände. Präfix ww_, damit nichts mit
-- dem Handelsspiel im selben Projekt kollidiert. Spieler melden sich anonym an.

create table if not exists public.ww_saves (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  slot smallint not null check (slot between 1 and 5),
  name text not null check (char_length(name) between 1 and 40),
  scenario text not null default 'frei',
  scenario_name text not null default '',
  day integer not null default 1 check (day >= 1),
  year integer not null default 1 check (year >= 1),
  population integer not null default 0 check (population >= 0),
  data jsonb not null check (pg_column_size(data) < 3000000),
  updated_at timestamptz not null default now(),
  unique (user_id, slot)
);

alter table public.ww_saves enable row level security;

create policy "ww eigene spielstaende" on public.ww_saves
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create index if not exists ww_saves_user_idx on public.ww_saves (user_id);
