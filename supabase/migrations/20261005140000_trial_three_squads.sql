-- M6-01J / RESOLVED-95: a trial may start with three saved squads and one ally per squad.
--
-- start_battle gains `p_reserves jsonb` (default '[]'): up to two `{ "slot": 0-9, "ally": text|null }`
-- objects naming the second and third squads, in entry order. Only trial stages accept reserves;
-- story and dungeon stages keep exactly one squad and one ally. No ally serves two squads: each
-- owned copy (by row id) or guest is chosen for at most one squad. The existing four-argument
-- function (stage, unlock, first squad, first ally, item debit) is kept as an internal helper, and
-- the reserves are frozen into `battle_sessions.squad.reserves` as
-- `[{ leader_index, units, ally }]` with the same unit, imp, and sphere snapshot as the first squad,
-- so the battle page and the finish route's replay build one engine setup (M6-01I reserveSquads).

alter function public.start_battle(text, smallint, text, jsonb) rename to start_battle_one_squad;
revoke execute on function public.start_battle_one_squad(text, smallint, text, jsonb)
  from public, anon, authenticated, service_role;

-- The per-run ally snapshot, as start_battle_without_items builds it (M3-04H, M3-04I): a
-- canonical owned UUID, or a guest scaled to the caller's collection. Null means no ally.
create function public.start_battle_ally_snapshot(p_user_id uuid, p_ally text)
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_ally jsonb;
  v_guest jsonb;
  v_guest_unit text;
  v_guest_form jsonb;
  v_highest_rarity integer;
  v_highest_level integer;
  v_cap integer;
begin
  if p_ally is null then
    return null;
  end if;
  if p_ally ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    select jsonb_build_object('owned_unit_id', o.id, 'unit_id', o.unit_id, 'form_id', o.form_id,
      'level', o.level, 'unit_type', o.unit_type, 'bb_level', o.bb_level, 'sbb_level', o.sbb_level)
    into v_ally from public.owned_units o
    where o.id = p_ally::uuid and o.user_id = p_user_id;
    if v_ally is null then
      raise exception 'start_battle: the ally must be one of your own units' using errcode = '22023';
    end if;
    return v_ally;
  end if;
  select c.data into v_guest from public.content_items c
  where c.kind = 'guest' and c.id = p_ally;
  if v_guest is null then
    raise exception 'start_battle: unknown guest' using errcode = '22023';
  end if;
  v_guest_unit := v_guest ->> 'unit';
  select max(case when f ->> 'rarity' = 'omni' then 8 else (f ->> 'rarity')::integer end),
    max(o.level), greatest((v_guest ->> 'rarityCap')::integer,
      coalesce(max(case when o.unit_id = v_guest_unit then
        case when f ->> 'rarity' = 'omni' then 8 else (f ->> 'rarity')::integer end
      end), 0))
  into v_highest_rarity, v_highest_level, v_cap
  from public.owned_units o
  join public.content_items c on c.kind = 'unit' and c.id = o.unit_id
  cross join lateral jsonb_array_elements(c.data -> 'forms') f
  where o.user_id = p_user_id and f ->> 'id' = o.form_id;
  select f into v_guest_form from public.content_items c
  cross join lateral jsonb_array_elements(c.data -> 'forms') f
  where c.kind = 'unit' and c.id = v_guest_unit
    and (case when f ->> 'rarity' = 'omni' then 8 else (f ->> 'rarity')::integer end)
      <= least(v_highest_rarity, v_cap)
  order by (case when f ->> 'rarity' = 'omni' then 8 else (f ->> 'rarity')::integer end) desc
  limit 1;
  if v_guest_form is null then
    raise exception 'start_battle: no guest form matches your collection' using errcode = '22023';
  end if;
  return jsonb_build_object('owned_unit_id', null, 'unit_id', v_guest_unit,
    'form_id', v_guest_form ->> 'id',
    'level', least(v_highest_level, (v_guest_form ->> 'maxLevel')::integer),
    'unit_type', null, 'kind', 'guest');
end;
$$;
revoke execute on function public.start_battle_ally_snapshot(uuid, text)
  from public, anon, authenticated, service_role;

-- One frozen unit, enriched exactly as the session insert triggers enrich the first squad.
create function public.start_battle_enrich_unit(p_unit jsonb, p_user_id uuid)
returns jsonb
language sql stable security definer set search_path = '' as $$
  select public.snapshot_unit_spheres(public.snapshot_unit_imps(p_unit, p_user_id), p_user_id);
$$;
revoke execute on function public.start_battle_enrich_unit(jsonb, uuid)
  from public, anon, authenticated, service_role;

create function public.start_battle(
  p_stage_id text, p_squad_slot smallint default 0, p_ally text default null,
  p_items jsonb default '[]'::jsonb, p_reserves jsonb default '[]'::jsonb
)
returns public.battle_sessions
language plpgsql security definer set search_path = '' as $$
declare
  v_user_id uuid := auth.uid();
  v_row public.battle_sessions;
  v_reserve jsonb;
  v_slot smallint;
  v_slots smallint[] := array[p_squad_slot];
  v_squad public.squads;
  v_all_units uuid[];
  v_units jsonb;
  v_unit_count integer;
  v_ally jsonb;
  v_allies text[] := array_remove(array[lower(p_ally)], null);
  v_reserves jsonb := '[]'::jsonb;
begin
  if v_user_id is null then
    raise exception 'start_battle: not signed in' using errcode = '42501';
  end if;
  if p_reserves is null or jsonb_typeof(p_reserves) <> 'array' then
    raise exception 'start_battle: reserve squads must be an array' using errcode = '22023';
  end if;
  if jsonb_array_length(p_reserves) > 0 and not exists (
    select 1 from public.content_items c
    where c.kind = 'stage' and c.id = p_stage_id and c.data ? 'trial'
  ) then
    raise exception 'start_battle: only trials take more than one squad' using errcode = '22023';
  end if;
  if jsonb_array_length(p_reserves) > 2 then
    raise exception 'start_battle: a trial takes at most three squads' using errcode = '22023';
  end if;

  -- Stage, unlock, first squad, first ally, and item debit (one transaction with the reserves).
  v_row := public.start_battle_one_squad(p_stage_id, p_squad_slot, p_ally, p_items);
  if jsonb_array_length(p_reserves) = 0 then
    return v_row;
  end if;

  select s.unit_ids into v_all_units from public.squads s
  where s.user_id = v_user_id and s.slot = p_squad_slot;
  for v_reserve in select value from jsonb_array_elements(p_reserves) loop
    if jsonb_typeof(v_reserve) <> 'object'
       or jsonb_typeof(v_reserve -> 'slot') is distinct from 'number'
       or coalesce(v_reserve ->> 'slot', '') !~ '^[0-9]$'
       or jsonb_typeof(coalesce(v_reserve -> 'ally', 'null'::jsonb)) not in ('string', 'null') then
      raise exception 'start_battle: each reserve squad needs a slot 0-9 and an optional ally'
        using errcode = '22023';
    end if;
    v_slot := (v_reserve ->> 'slot')::smallint;
    if v_slot = any (v_slots) then
      raise exception 'start_battle: each squad must be a different saved squad' using errcode = '22023';
    end if;
    v_slots := array_append(v_slots, v_slot);
    select * into v_squad from public.squads s where s.user_id = v_user_id and s.slot = v_slot;
    if v_squad.id is null or cardinality(v_squad.unit_ids) = 0 then
      raise exception 'start_battle: save every squad before starting a trial' using errcode = '22023';
    end if;
    if v_squad.unit_ids && v_all_units then
      raise exception 'start_battle: no unit may fight in two squads' using errcode = '22023';
    end if;
    v_all_units := v_all_units || v_squad.unit_ids;
    select jsonb_agg(public.start_battle_enrich_unit(
             jsonb_build_object('owned_unit_id', o.id, 'unit_id', o.unit_id, 'form_id', o.form_id,
               'level', o.level, 'unit_type', o.unit_type,
               'bb_level', o.bb_level, 'sbb_level', o.sbb_level), v_user_id) order by u.ord),
           count(o.id)
    into v_units, v_unit_count
    from unnest(v_squad.unit_ids) with ordinality as u (owned_unit_id, ord)
    join public.owned_units o on o.id = u.owned_unit_id and o.user_id = v_user_id;
    if v_unit_count <> cardinality(v_squad.unit_ids) then
      raise exception 'start_battle: the squad holds a unit you no longer own' using errcode = '22023';
    end if;
    -- No ally serves two parties: one owned copy (by row id) or one guest per trial.
    if v_reserve ->> 'ally' is not null then
      if lower(v_reserve ->> 'ally') = any (v_allies) then
        raise exception 'start_battle: no ally may serve two squads' using errcode = '22023';
      end if;
      v_allies := array_append(v_allies, lower(v_reserve ->> 'ally'));
    end if;
    v_ally := public.start_battle_ally_snapshot(v_user_id, v_reserve ->> 'ally');
    if v_ally is not null then
      v_ally := public.start_battle_enrich_unit(v_ally, v_user_id);
    end if;
    v_reserves := v_reserves || jsonb_build_array(jsonb_build_object(
      'leader_index', v_squad.leader_index, 'units', v_units, 'ally', coalesce(v_ally, 'null'::jsonb)));
  end loop;
  if cardinality(v_all_units) > 15 then
    raise exception 'start_battle: a trial takes at most fifteen units' using errcode = '22023';
  end if;

  update public.battle_sessions set squad = squad || jsonb_build_object('reserves', v_reserves)
  where id = v_row.id returning * into v_row;
  return v_row;
end;
$$;
revoke execute on function public.start_battle(text, smallint, text, jsonb, jsonb) from public, anon;
grant execute on function public.start_battle(text, smallint, text, jsonb, jsonb) to authenticated;
