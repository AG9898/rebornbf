-- M4-03K: the toad series' rare final-wave spawns (RESOLVED-71: Matriarch Toad 10%, Regent Toad
-- 20%). A stage's dungeon.finalSpawns lists replacements in band order; the same low base-10000
-- digit of the server-issued session seed that rareSpawn uses walks consecutive basis-point bands,
-- and the first matching slot of the final wave is replaced. Matches @bfr/data dungeonWaves, so
-- battle builders and grant_battle_base_rewards (which already resolves waves through this
-- function) settle the same enemies. Stages with rareSpawn (the hob series) are unchanged.
create or replace function public.dungeon_waves(p_stage jsonb, p_seed bigint)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_rare jsonb := p_stage -> 'dungeon' -> 'rareSpawn';
  v_finals jsonb := p_stage -> 'dungeon' -> 'finalSpawns';
  v_waves jsonb := p_stage -> 'waves';
  v_entry jsonb;
  v_band integer := 0;
  v_wave integer;
  v_slot integer;
begin
  if p_seed is null or p_seed < 0 or p_seed > 4294967295 then
    raise exception 'dungeon_waves: seed must be unsigned 32-bit' using errcode = '22023';
  end if;
  if v_finals is not null then
    v_rare := null;
    for v_entry in select value from jsonb_array_elements(v_finals) with ordinality order by ordinality loop
      v_band := v_band + (v_entry ->> 'rateBp')::integer;
      if p_seed % 10000 < v_band then
        v_rare := v_entry;
        exit;
      end if;
    end loop;
    if v_rare is null then
      return v_waves;
    end if;
    v_wave := jsonb_array_length(v_waves) - 1;
  elsif v_rare is null or p_seed % 10000 >= (v_rare ->> 'rateBp')::integer then
    return v_waves;
  else
    v_wave := (p_seed / 10000) % jsonb_array_length(v_waves);
  end if;
  select (ordinality - 1)::integer into v_slot
  from jsonb_array_elements(v_waves -> v_wave -> 'enemies') with ordinality
  where value ->> 'enemy' = v_rare ->> 'replaces'
  order by ordinality limit 1;
  if v_slot is null then
    raise exception 'dungeon_waves: replacement candidate is missing' using errcode = '55000';
  end if;
  return jsonb_set(v_waves, array[v_wave::text, 'enemies', v_slot::text, 'enemy'], v_rare -> 'enemy');
end;
$$;
revoke all on function public.dungeon_waves(jsonb, bigint) from public, anon, authenticated;
