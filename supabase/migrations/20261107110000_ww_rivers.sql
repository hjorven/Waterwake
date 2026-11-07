-- Waterwake: Flussketten. Mehrere Spieler bilden einen Fluss; jeder meldet
-- regelmäßig seinen Abfluss (Anteil am normalen Zufluss der eigenen Karte),
-- der Spieler darunter bekommt ihn als Quelle. Lesen darf jeder, anlegen,
-- beitreten und melden nur mit (anonymem) Konto über Funktionen, damit die
-- Position in der Kette ohne Lücken und Doppelungen vergeben wird.

create table if not exists public.ww_rivers (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[A-HJ-NP-Z2-9]{6}$'),
  name text not null check (char_length(name) between 1 and 40),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.ww_river_members (
  river_id uuid not null references public.ww_rivers(id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  position integer not null check (position >= 0),
  player text not null default '' check (char_length(player) <= 20),
  -- gemeldeter Abfluss als Anteil am normalen Zufluss der eigenen Karte (1 = alles fließt durch)
  outflow real not null default 1 check (outflow >= 0 and outflow <= 10),
  scenario_name text not null default '',
  day integer not null default 0,
  year integer not null default 0,
  population integer not null default 0,
  species text not null default 'otter',
  updated_at timestamptz not null default now(),
  primary key (river_id, user_id),
  unique (river_id, position)
);

alter table public.ww_rivers enable row level security;
alter table public.ww_river_members enable row level security;

create policy "ww rivers lesen" on public.ww_rivers
  for select to anon, authenticated
  using (true);

create policy "ww rivers loeschen" on public.ww_rivers
  for delete to authenticated
  using (user_id = auth.uid());

create policy "ww river members lesen" on public.ww_river_members
  for select to anon, authenticated
  using (true);

create policy "ww river members verlassen" on public.ww_river_members
  for delete to authenticated
  using (user_id = auth.uid());

create index if not exists ww_river_members_river_idx on public.ww_river_members (river_id, position);

-- Kette anlegen: der Urheber steht ganz oben (Position 0)
create or replace function public.ww_river_create(p_name text, p_player text, p_code text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Anmeldung nötig';
  end if;
  insert into public.ww_rivers (code, name, user_id) values (p_code, p_name, auth.uid()) returning id into v_id;
  insert into public.ww_river_members (river_id, user_id, position, player) values (v_id, auth.uid(), 0, left(coalesce(p_player, ''), 20));
  return v_id;
end;
$$;

-- Beitreten: ans untere Ende der Kette, höchstens zwölf Spieler
create or replace function public.ww_river_join(p_code text, p_player text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_pos integer;
begin
  if auth.uid() is null then
    raise exception 'Anmeldung nötig';
  end if;
  select id into v_id from public.ww_rivers where code = p_code;
  if v_id is null then
    raise exception 'Keine Kette mit dem Code %', p_code;
  end if;
  if exists (select 1 from public.ww_river_members where river_id = v_id and user_id = auth.uid()) then
    update public.ww_river_members set player = left(coalesce(p_player, player), 20) where river_id = v_id and user_id = auth.uid();
    return v_id;
  end if;
  perform pg_advisory_xact_lock(hashtext(v_id::text));
  select coalesce(max(position), -1) + 1 into v_pos from public.ww_river_members where river_id = v_id;
  if v_pos >= 12 then
    raise exception 'Die Kette ist voll (12 Spieler)';
  end if;
  insert into public.ww_river_members (river_id, user_id, position, player) values (v_id, auth.uid(), v_pos, left(coalesce(p_player, ''), 20));
  return v_id;
end;
$$;

-- Abfluss und Stand des laufenden Spiels melden
create or replace function public.ww_river_report(p_river uuid, p_outflow real, p_scenario text, p_day integer, p_year integer, p_population integer, p_species text)
returns void
language sql
security definer
set search_path = public
as $$
  update public.ww_river_members
     set outflow = greatest(0, least(10, coalesce(p_outflow, 0))),
         scenario_name = left(coalesce(p_scenario, ''), 60),
         day = coalesce(p_day, 0),
         year = coalesce(p_year, 0),
         population = coalesce(p_population, 0),
         species = left(coalesce(p_species, 'otter'), 10),
         updated_at = now()
   where river_id = p_river and user_id = auth.uid();
$$;

revoke all on function public.ww_river_create(text, text, text) from public;
revoke all on function public.ww_river_join(text, text) from public;
revoke all on function public.ww_river_report(uuid, real, text, integer, integer, integer, text) from public;
grant execute on function public.ww_river_create(text, text, text) to authenticated;
grant execute on function public.ww_river_join(text, text) to authenticated;
grant execute on function public.ww_river_report(uuid, real, text, integer, integer, integer, text) to authenticated;
