-- Waterwake: Flussketten, Nachbesserung. Beim Beitreten zählt die Zahl der
-- Mitglieder, nicht die höchste Position, sonst wäre eine Kette nach ein paar
-- Austritten voll, obwohl Plätze frei sind.

create or replace function public.ww_river_join(p_code text, p_player text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_pos integer;
  v_count integer;
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
  select count(*), coalesce(max(position), -1) + 1 into v_count, v_pos from public.ww_river_members where river_id = v_id;
  if v_count >= 12 then
    raise exception 'Die Kette ist voll (12 Spieler)';
  end if;
  insert into public.ww_river_members (river_id, user_id, position, player) values (v_id, auth.uid(), v_pos, left(coalesce(p_player, ''), 20));
  return v_id;
end;
$$;
