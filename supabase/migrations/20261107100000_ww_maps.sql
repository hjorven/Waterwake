-- Waterwake: geteilte Karten aus dem Editor. Jede Karte bekommt einen Code
-- aus sechs Zeichen. Lesen darf jeder, eintragen nur mit (anonymem) Konto,
-- löschen nur der Urheber. Der Zähler der Spiele wird über eine Funktion erhöht.

create table if not exists public.ww_maps (
  code text primary key check (code ~ '^[A-HJ-NP-Z2-9]{6}$'),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 40),
  author text not null default '' check (char_length(author) <= 20),
  w integer not null check (w between 32 and 128),
  h integer not null check (h between 32 and 128),
  ground text not null check (char_length(ground) <= 24000),
  sources jsonb not null default '[]'::jsonb,
  sinks jsonb not null default '[]'::jsonb,
  start integer not null default -1,
  goal jsonb,
  plays integer not null default 0,
  created_at timestamptz not null default now()
);

alter table public.ww_maps enable row level security;

create policy "ww maps lesen" on public.ww_maps
  for select to anon, authenticated
  using (true);

create policy "ww maps eintragen" on public.ww_maps
  for insert to authenticated
  with check (user_id = auth.uid());

create policy "ww maps loeschen" on public.ww_maps
  for delete to authenticated
  using (user_id = auth.uid());

create index if not exists ww_maps_created_idx on public.ww_maps (created_at desc);

create or replace function public.ww_map_played(p_code text)
returns void
language sql
security definer
set search_path = public
as $$
  update public.ww_maps set plays = plays + 1 where code = p_code;
$$;

revoke all on function public.ww_map_played(text) from public;
grant execute on function public.ww_map_played(text) to anon, authenticated;
