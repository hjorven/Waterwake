-- Waterwake: Bestenliste der Tageskarte. Eine Zeile je Spieler und Tag.
-- Lesen darf jeder, auch ohne Konto; schreiben nur die eigene Zeile.

create table if not exists public.ww_daily (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  day_key text not null check (day_key ~ '^20[0-9]{6}$'),
  name text not null check (char_length(name) between 1 and 20),
  score integer not null check (score >= 0),
  days integer not null check (days between 0 and 100000),
  population integer not null check (population between 0 and 100000),
  updated_at timestamptz not null default now(),
  primary key (user_id, day_key),
  check (score = days * 10 + population * 5)
);

alter table public.ww_daily enable row level security;

create policy "ww daily lesen" on public.ww_daily
  for select to anon, authenticated
  using (true);

create policy "ww daily eintragen" on public.ww_daily
  for insert to authenticated
  with check (user_id = auth.uid());

create policy "ww daily aendern" on public.ww_daily
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create index if not exists ww_daily_day_idx on public.ww_daily (day_key, score desc);
