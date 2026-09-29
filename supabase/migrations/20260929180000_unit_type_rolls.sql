-- M3-01D: unit type rolls at acquisition (RESOLVED-56; GAME_DESIGN §6 → Stat growth and unit types).
--
-- owned_units.unit_type holds the persisted roll `{type, gains: {hp, atk, def, rec}}` (the
-- engine's UnitTypeRoll), or null for a unit that never rolls (treated as Lord). A BEFORE INSERT
-- trigger rolls it on every grant path, so any insert that leaves it null gets the server's roll:
--   - a pre-Omni form of a multi-form unit line rolls Lord 23% / Anima 23% / Breaker 22% /
--     Guardian 22% / Oracle 10%, then one uniform integer gain per stat within the type's range;
--   - an Omni form, a single-form unit (growth fodder, evolution materials, summon filler), or a
--     unit/form missing from content stores null;
--   - Rex is never rolled (it stays a valid stored type with its ranges).
-- The roll never changes afterwards: an update that changes unit_type is rejected, and evolution
-- only rewrites form_id. start_battle snapshots each unit's roll so the replay uses it.

-- ---------------------------------------------------------------------------------------------
-- unit_type_gain_ranges: inclusive per-level gain ranges by type, {type: {stat: [min, max]}}.
-- Mirrors TYPE_GAIN_RANGES in packages/engine/src/state/unit-stats.ts.
-- ---------------------------------------------------------------------------------------------
create function public.unit_type_gain_ranges()
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select '{
    "lord":     {"hp": [0, 0],   "atk": [0, 0], "def": [0, 0],   "rec": [0, 0]},
    "anima":    {"hp": [5, 10],  "atk": [0, 0], "def": [0, 0],   "rec": [-3, -1]},
    "breaker":  {"hp": [0, 0],   "atk": [1, 3], "def": [-3, -1], "rec": [0, 0]},
    "guardian": {"hp": [0, 0],   "atk": [0, 0], "def": [1, 3],   "rec": [-2, 0]},
    "oracle":   {"hp": [0, 0],   "atk": [0, 0], "def": [-2, 0],  "rec": [2, 4]},
    "rex":      {"hp": [10, 15], "atk": [1, 2], "def": [1, 2],   "rec": [1, 2]}
  }'::jsonb;
$$;

-- ---------------------------------------------------------------------------------------------
-- unit_type_roll_valid: whether p_roll is a well-formed roll (known type, exactly the four stat
-- keys, each an integer within the type's range). Used by the owned_units check constraint.
-- ---------------------------------------------------------------------------------------------
create function public.unit_type_roll_valid(p_roll jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce((
    select jsonb_typeof(p_roll) = 'object'
      and (select count(*) from jsonb_object_keys(p_roll)) = 2
      and jsonb_typeof(p_roll -> 'gains') = 'object'
      and (select count(*) from jsonb_object_keys(p_roll -> 'gains')) = 4
      and (
        select bool_and(
          jsonb_typeof(p_roll -> 'gains' -> s.stat) = 'number'
          and (p_roll -> 'gains' ->> s.stat)::numeric
            = trunc((p_roll -> 'gains' ->> s.stat)::numeric)
          and (p_roll -> 'gains' ->> s.stat)::numeric
            between (r.ranges -> s.stat ->> 0)::numeric and (r.ranges -> s.stat ->> 1)::numeric)
        from unnest(array['hp', 'atk', 'def', 'rec']) as s (stat)
      )
    from (select public.unit_type_gain_ranges() -> (p_roll ->> 'type') as ranges) r
    where r.ranges is not null
  ), false);
$$;

alter table public.owned_units
  add column unit_type jsonb
    constraint owned_units_unit_type_valid
      check (unit_type is null or public.unit_type_roll_valid(unit_type));

comment on column public.owned_units.unit_type is
  'Persisted type roll {type, gains: {hp, atk, def, rec}} (GAME_DESIGN §6); null = Lord, no roll.';

-- ---------------------------------------------------------------------------------------------
-- roll_int: a uniform integer in [p_min, p_max] from a 32-bit pgcrypto draw. Internal.
-- ---------------------------------------------------------------------------------------------
create function public.roll_int(p_min integer, p_max integer)
returns integer
language sql
volatile
set search_path = ''
as $$
  select p_min + floor(
    (('x' || encode(extensions.gen_random_bytes(4), 'hex'))::bit(32)::bigint)::numeric
      * (p_max - p_min + 1) / 4294967296
  )::integer;
$$;

-- ---------------------------------------------------------------------------------------------
-- roll_unit_type: one fresh acquisition roll (never Rex). Internal.
-- ---------------------------------------------------------------------------------------------
create function public.roll_unit_type()
returns jsonb
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_draw integer := public.roll_int(0, 99);
  v_type text;
  v_ranges jsonb;
begin
  v_type := case
    when v_draw < 23 then 'lord'
    when v_draw < 46 then 'anima'
    when v_draw < 68 then 'breaker'
    when v_draw < 90 then 'guardian'
    else 'oracle'
  end;
  v_ranges := public.unit_type_gain_ranges() -> v_type;
  return jsonb_build_object('type', v_type, 'gains', jsonb_build_object(
    'hp', public.roll_int((v_ranges -> 'hp' ->> 0)::integer, (v_ranges -> 'hp' ->> 1)::integer),
    'atk', public.roll_int((v_ranges -> 'atk' ->> 0)::integer, (v_ranges -> 'atk' ->> 1)::integer),
    'def', public.roll_int((v_ranges -> 'def' ->> 0)::integer, (v_ranges -> 'def' ->> 1)::integer),
    'rec', public.roll_int((v_ranges -> 'rec' ->> 0)::integer, (v_ranges -> 'rec' ->> 1)::integer)));
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- unit_type_for_grant: the roll a new owned unit of (p_unit_id, p_form_id) gets: a fresh roll for
-- a pre-Omni form of a multi-form unit, else null (Omni, single-form fodder/material/filler, or
-- content that is not seeded). Internal.
-- ---------------------------------------------------------------------------------------------
create function public.unit_type_for_grant(p_unit_id text, p_form_id text)
returns jsonb
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_forms jsonb;
  v_rarity text;
begin
  select c.data -> 'forms' into v_forms
  from public.content_items c
  where c.kind = 'unit' and c.id = p_unit_id;

  if v_forms is null or jsonb_array_length(v_forms) < 2 then
    return null;
  end if;

  select f ->> 'rarity' into v_rarity
  from jsonb_array_elements(v_forms) f
  where f ->> 'id' = p_form_id;

  if v_rarity is null or v_rarity = 'omni' then
    return null;
  end if;

  return public.roll_unit_type();
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Triggers: roll on insert when no roll is given; reject any later change of the roll.
-- ---------------------------------------------------------------------------------------------
create function public.owned_units_roll_type()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.unit_type is null then
      new.unit_type := public.unit_type_for_grant(new.unit_id, new.form_id);
    end if;
  elsif new.unit_type is distinct from old.unit_type then
    raise exception 'owned_units: a unit''s type roll never changes' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger owned_units_roll_type
  before insert or update of unit_type on public.owned_units
  for each row execute function public.owned_units_roll_type();

-- ---------------------------------------------------------------------------------------------
-- grant_unit: give p_user_id a new owned unit of p_unit_id in p_form_id (default: the unit's first
-- form), at level 1 with its acquisition roll. Returns the new row. Rejects (22023) a null user and
-- a unit or form that is not seeded content. Internal: for other security definer grant paths
-- (starter pick, summons, rewards).
-- ---------------------------------------------------------------------------------------------
create function public.grant_unit(p_user_id uuid, p_unit_id text, p_form_id text default null)
returns public.owned_units
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_forms jsonb;
  v_form_id text := p_form_id;
  v_row public.owned_units;
begin
  if p_user_id is null then
    raise exception 'grant_unit: a user is required' using errcode = '22023';
  end if;

  select c.data -> 'forms' into v_forms
  from public.content_items c
  where c.kind = 'unit' and c.id = p_unit_id;
  if v_forms is null then
    raise exception 'grant_unit: unknown unit %', p_unit_id using errcode = '22023';
  end if;

  v_form_id := coalesce(v_form_id, v_forms -> 0 ->> 'id');
  if not exists (select 1 from jsonb_array_elements(v_forms) f where f ->> 'id' = v_form_id) then
    raise exception 'grant_unit: unit % has no form %', p_unit_id, v_form_id
      using errcode = '22023';
  end if;

  insert into public.owned_units (user_id, unit_id, form_id)
  values (p_user_id, p_unit_id, v_form_id)
  returning * into v_row;

  return v_row;
end;
$$;

revoke execute on function public.roll_int(integer, integer)
  from public, anon, authenticated, service_role;
revoke execute on function public.roll_unit_type()
  from public, anon, authenticated, service_role;
revoke execute on function public.unit_type_for_grant(text, text)
  from public, anon, authenticated, service_role;
revoke execute on function public.owned_units_roll_type()
  from public, anon, authenticated, service_role;
revoke execute on function public.grant_unit(uuid, text, text)
  from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------------------------
-- start_battle: as in M4-03B, but each unit and ally snapshot carries its `unit_type` roll (null
-- for no roll), so the session setup and the server replay use the persisted type gains.
-- ---------------------------------------------------------------------------------------------
create or replace function public.start_battle(p_stage_id text, p_squad_slot smallint default 0)
returns public.battle_sessions
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_stage jsonb;
  v_story_number integer;
  v_previous_stage text;
  v_squad public.squads;
  v_units jsonb;
  v_unit_count integer;
  v_ally jsonb;
  v_version text;
  v_row public.battle_sessions;
begin
  if v_user_id is null then
    raise exception 'start_battle: not signed in' using errcode = '42501';
  end if;

  select c.data into v_stage
  from public.content_items c
  where c.kind = 'stage' and c.id = p_stage_id;

  if v_stage is null or not (v_stage ? 'story' or v_stage ? 'dungeon') then
    raise exception 'start_battle: unknown stage' using errcode = '22023';
  end if;

  if v_stage ? 'story' then
    -- Story stages unlock in number order, as on the quest map: the first is always open.
    v_story_number := (v_stage -> 'story' ->> 'number')::integer;
    if v_story_number > 1 then
      select c.id into v_previous_stage
      from public.content_items c
      where c.kind = 'stage' and (c.data -> 'story' ->> 'number')::integer = v_story_number - 1;

      if v_previous_stage is null or not exists (
        select 1 from public.quest_progress q
        where q.user_id = v_user_id and q.stage_id = v_previous_stage
      ) then
        raise exception 'start_battle: this stage is still locked' using errcode = '22023';
      end if;
    end if;
  elsif not exists (
    -- A dungeon opens on its gate stage's first clear (GAME_DESIGN §7 → Farming dungeons).
    select 1 from public.quest_progress q
    where q.user_id = v_user_id and q.stage_id = v_stage -> 'dungeon' ->> 'gate'
  ) then
    raise exception 'start_battle: this dungeon is still locked' using errcode = '22023';
  end if;

  select * into v_squad
  from public.squads s
  where s.user_id = v_user_id and s.slot = p_squad_slot;

  if v_squad.id is null or cardinality(v_squad.unit_ids) = 0 then
    raise exception 'start_battle: save a squad before starting a battle' using errcode = '22023';
  end if;

  select jsonb_agg(
           jsonb_build_object('owned_unit_id', o.id, 'unit_id', o.unit_id, 'form_id', o.form_id,
                              'level', o.level, 'unit_type', o.unit_type)
           order by u.ord),
         count(o.id)
    into v_units, v_unit_count
  from unnest(v_squad.unit_ids) with ordinality as u (owned_unit_id, ord)
  join public.owned_units o on o.id = u.owned_unit_id and o.user_id = v_user_id;

  if v_unit_count <> cardinality(v_squad.unit_ids) then
    raise exception 'start_battle: the squad holds a unit you no longer own' using errcode = '22023';
  end if;

  if v_squad.ally_unit_id is not null then
    select jsonb_build_object('owned_unit_id', o.id, 'unit_id', o.unit_id, 'form_id', o.form_id,
                              'level', o.level, 'unit_type', o.unit_type)
      into v_ally
    from public.owned_units o
    where o.id = v_squad.ally_unit_id and o.user_id = v_user_id;

    if v_ally is null then
      raise exception 'start_battle: the ally is no longer yours' using errcode = '22023';
    end if;
  end if;

  select v.version into v_version from public.content_version v;
  if v_version is null then
    raise exception 'start_battle: game content is not seeded' using errcode = '55000';
  end if;

  insert into public.battle_sessions (user_id, stage_id, seed, squad, content_version, expires_at)
  values (
    v_user_id,
    p_stage_id,
    ('x' || encode(extensions.gen_random_bytes(4), 'hex'))::bit(32)::bigint,
    jsonb_build_object('leader_index', v_squad.leader_index, 'units', v_units, 'ally', v_ally),
    v_version,
    now() + interval '1 hour'
  )
  returning * into v_row;

  return v_row;
end;
$$;
