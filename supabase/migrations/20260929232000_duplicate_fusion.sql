-- M4-01C: same-unit-line duplicates give x2 EXP before rounding and +10 burst levels.
-- Burst levels start at 1; inaccessible SBB stays at 1 and overflow is discarded.
alter table public.owned_units
  add column bb_level smallint not null default 1 check (bb_level between 1 and 10),
  add column sbb_level smallint not null default 1 check (sbb_level between 1 and 10);

create or replace function public.fodder_fusion_exp(
  p_form jsonb,
  p_fodder_element text,
  p_level integer,
  p_target_element text,
  p_duplicate boolean
)
returns bigint
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_span bigint := (p_form ->> 'maxLevel')::bigint - 1;
  v_base bigint;
  v_numerator bigint;
  v_denominator bigint := 1;
begin
  if p_form ? 'fusionExp' then
    v_numerator := (p_form ->> 'fusionExp')::bigint;
  else
    v_base := case p_form ->> 'rarity'
      when '2' then 50 when '3' then 100 when '4' then 200 when '5' then 400
      when '6' then 700 when '7' then 1000 when 'omni' then 1500
    end;
    if v_base is null then
      return null;
    end if;
    if v_span = 0 then
      v_numerator := v_base;
    else
      v_numerator := v_base * (v_span + p_level - 1);
      v_denominator := v_span;
    end if;
  end if;

  if p_fodder_element = p_target_element then
    v_numerator := v_numerator * 3;
    v_denominator := v_denominator * 2;
  end if;

  if p_duplicate then v_numerator := v_numerator * 2; end if;
  return v_numerator / v_denominator;
end;
$$;

revoke execute on function public.fodder_fusion_exp(jsonb, text, integer, text, boolean)
  from public, anon, authenticated;

create or replace function public.fuse(p_target uuid, p_fodder uuid[])
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_size integer := coalesce(cardinality(p_fodder), 0);
  v_locked integer;
  v_target public.owned_units;
  v_unit jsonb;
  v_form jsonb;
  v_element text;
  v_curve smallint;
  v_max_level integer;
  v_fodder record;
  v_fodder_exp bigint;
  v_gain bigint := 0;
  v_cost bigint;
  v_balance bigint;
  v_current_exp bigint;
  v_new_exp bigint;
  v_new_level integer;
  v_burst_gain integer := 0;
  v_bb integer;
  v_sbb integer;
  v_bb_gain integer;
begin
  if v_user_id is null then
    raise exception 'fuse: not signed in' using errcode = '42501';
  end if;

  if p_target is null then
    raise exception 'fuse: a target is required' using errcode = '22023';
  end if;

  if v_size < 1 or v_size > 5 or array_ndims(p_fodder) <> 1 then
    raise exception 'fuse: feed 1-5 fodder units' using errcode = '22023';
  end if;

  if array_position(p_fodder, null) is not null then
    raise exception 'fuse: fodder ids must not be null' using errcode = '22023';
  end if;

  if (select count(distinct f) from unnest(p_fodder) f) <> v_size then
    raise exception 'fuse: a fodder unit is repeated' using errcode = '22023';
  end if;

  if p_target = any (p_fodder) then
    raise exception 'fuse: the target cannot be its own fodder' using errcode = '22023';
  end if;

  -- Lock the target and every fodder row in one id-ordered pass, so concurrent fusions over the
  -- same units serialize without deadlocking and a fodder unit can be consumed only once.
  select count(*) into v_locked from (
    select o.id from public.owned_units o
    where o.user_id = v_user_id and o.id = any (p_fodder || p_target)
    order by o.id
    for update
  ) locked;

  if v_locked <> v_size + 1 then
    raise exception 'fuse: the target or a fodder unit is not yours' using errcode = '22023';
  end if;

  if exists (
    select 1 from public.squads s
    where s.user_id = v_user_id
      and (s.unit_ids && p_fodder or s.ally_unit_id = any (p_fodder))
  ) then
    raise exception 'fuse: a fodder unit is in a squad' using errcode = '22023';
  end if;

  select * into v_target from public.owned_units o where o.id = p_target;

  select c.data into v_unit from public.content_items c
  where c.kind = 'unit' and c.id = v_target.unit_id;
  select f.value into v_form from jsonb_array_elements(v_unit -> 'forms') f
  where f.value ->> 'id' = v_target.form_id;
  if v_form is null then
    raise exception 'fuse: target content is unavailable' using errcode = '55000';
  end if;
  v_element := v_unit ->> 'element';
  v_curve := coalesce((v_unit ->> 'expCurve')::smallint, 10);
  v_max_level := (v_form ->> 'maxLevel')::integer;

  for v_fodder in
    select o.unit_id, o.level, u.data ->> 'element' as element, f.value as form
    from public.owned_units o
    left join public.content_items u on u.kind = 'unit' and u.id = o.unit_id
    left join lateral (
      select e.value from jsonb_array_elements(u.data -> 'forms') e
      where e.value ->> 'id' = o.form_id
    ) f on true
    where o.id = any (p_fodder)
  loop
    v_fodder_exp := public.fodder_fusion_exp(
      v_fodder.form, v_fodder.element, v_fodder.level, v_element,
      v_fodder.unit_id = v_target.unit_id);
    if v_fodder_exp is null then
      raise exception 'fuse: fodder content is unavailable' using errcode = '55000';
    end if;
    v_gain := v_gain + v_fodder_exp;
    if v_fodder.unit_id = v_target.unit_id then
      v_burst_gain := v_burst_gain + 10;
    end if;
  end loop;

  -- Zel: 100 x the target's current level per fodder unit, charged before anything changes.
  v_cost := 100::bigint * v_target.level * v_size;
  insert into public.wallets (user_id) values (v_user_id) on conflict (user_id) do nothing;
  update public.wallets set zel = zel - v_cost, updated_at = now()
  where user_id = v_user_id and zel >= v_cost
  returning zel into v_balance;
  if v_balance is null then
    raise exception 'fuse: not enough Zel (costs %)', v_cost using errcode = 'P0001';
  end if;
  insert into public.wallet_log (user_id, currency, delta, balance_after, reason, ref_id)
  values (v_user_id, 'zel', -v_cost, v_balance, 'fusion', p_target);

  -- A row whose exp predates its level (e.g. granted above level 1) counts from its level's floor.
  v_current_exp := greatest(v_target.exp, public.level_exp_total(v_curve, v_target.level));
  v_new_exp := least(v_current_exp + v_gain, public.level_exp_total(v_curve, v_max_level));
  select greatest(v_target.level, coalesce(max(l), 1)) into v_new_level
  from generate_series(1, v_max_level) l
  where public.level_exp_total(v_curve, l) <= v_new_exp;

  -- Fill BB first; only the target's current form can accept SBB overflow.
  v_bb_gain := least(10 - v_target.bb_level, v_burst_gain);
  v_bb := v_target.bb_level + v_bb_gain;
  v_sbb := v_target.sbb_level;
  if (v_form -> 'bursts') ? 'sbb' then
    v_sbb := least(10, v_sbb + v_burst_gain - v_bb_gain);
  end if;
  update public.owned_units set exp = v_new_exp, level = v_new_level,
    bb_level = v_bb, sbb_level = v_sbb where id = p_target;
  delete from public.owned_units where id = any (p_fodder);

  return jsonb_build_object(
    'target_id', p_target,
    'exp_gained', v_gain,
    'exp', v_new_exp,
    'level', v_new_level,
    'bb_level', v_bb,
    'sbb_level', v_sbb,
    'zel_spent', v_cost,
    'fodder_consumed', v_size
  );
end;
$$;

revoke execute on function public.fuse(uuid, uuid[]) from public, anon;
grant execute on function public.fuse(uuid, uuid[]) to authenticated;

-- Freeze persisted burst levels for both playback and server replay.
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
  v_guest jsonb;
  v_guest_unit text;
  v_guest_form jsonb;
  v_highest_rarity integer;
  v_highest_level integer;
  v_cap integer;
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
                              'level', o.level, 'unit_type', o.unit_type,
                              'bb_level', o.bb_level, 'sbb_level', o.sbb_level)
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
                              'level', o.level, 'unit_type', o.unit_type,
                              'bb_level', o.bb_level, 'sbb_level', o.sbb_level)
      into v_ally
    from public.owned_units o
    where o.id = v_squad.ally_unit_id and o.user_id = v_user_id;

    if v_ally is null then
      raise exception 'start_battle: the ally is no longer yours' using errcode = '22023';
    end if;
  end if;

  if v_squad.guest_id is not null then
    select c.data into v_guest from public.content_items c
    where c.kind = 'guest' and c.id = v_squad.guest_id;
    if v_guest is null then
      raise exception 'start_battle: unknown guest' using errcode = '22023';
    end if;
    v_guest_unit := v_guest ->> 'unit';
    -- Highest rarity and level are independent, over the entire owned collection.
    select max(case when f ->> 'rarity' = 'omni' then 8 else (f ->> 'rarity')::integer end),
           max(o.level),
           greatest((v_guest ->> 'rarityCap')::integer,
             coalesce(max(case when o.unit_id = v_guest_unit then
               case when f ->> 'rarity' = 'omni' then 8 else (f ->> 'rarity')::integer end
             end), 0))
      into v_highest_rarity, v_highest_level, v_cap
    from public.owned_units o
    join public.content_items c on c.kind = 'unit' and c.id = o.unit_id
    cross join lateral jsonb_array_elements(c.data -> 'forms') f
    where o.user_id = v_user_id and f ->> 'id' = o.form_id;

    select f into v_guest_form
    from public.content_items c
    cross join lateral jsonb_array_elements(c.data -> 'forms') f
    where c.kind = 'unit' and c.id = v_guest_unit
      and (case when f ->> 'rarity' = 'omni' then 8 else (f ->> 'rarity')::integer end)
        <= least(v_highest_rarity, v_cap)
    order by (case when f ->> 'rarity' = 'omni' then 8 else (f ->> 'rarity')::integer end) desc
    limit 1;
    if v_guest_form is null then
      raise exception 'start_battle: no guest form matches your collection' using errcode = '22023';
    end if;
    v_ally := jsonb_build_object('owned_unit_id', null, 'unit_id', v_guest_unit,
      'form_id', v_guest_form ->> 'id',
      'level', least(v_highest_level, (v_guest_form ->> 'maxLevel')::integer),
      'unit_type', null, 'kind', 'guest');
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

-- Preserve the documented evolution penalty now that burst levels persist.
create or replace function public.evolve(p_unit uuid, p_materials uuid[])
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_size integer := coalesce(cardinality(p_materials), 0);
  v_locked integer;
  v_target public.owned_units;
  v_forms jsonb;
  v_index integer;
  v_form jsonb;
  v_next_form jsonb;
  v_recipe jsonb;
  v_required jsonb;
  v_given jsonb;
  v_item record;
  v_items jsonb := '[]'::jsonb;
  v_cost bigint;
  v_balance bigint;
begin
  if v_user_id is null then
    raise exception 'evolve: not signed in' using errcode = '42501';
  end if;

  if p_unit is null then
    raise exception 'evolve: a unit is required' using errcode = '22023';
  end if;

  if p_materials is null or (v_size > 0 and array_ndims(p_materials) <> 1) then
    raise exception 'evolve: materials must be a list of unit ids' using errcode = '22023';
  end if;

  if array_position(p_materials, null) is not null then
    raise exception 'evolve: material ids must not be null' using errcode = '22023';
  end if;

  if (select count(distinct m) from unnest(p_materials) m) <> v_size then
    raise exception 'evolve: a material unit is repeated' using errcode = '22023';
  end if;

  if p_unit = any (p_materials) then
    raise exception 'evolve: the unit cannot be its own material' using errcode = '22023';
  end if;

  -- Lock the unit and every material row in one id-ordered pass (same rule as fuse), so
  -- concurrent evolutions and fusions over the same units serialize without deadlocking.
  select count(*) into v_locked from (
    select o.id from public.owned_units o
    where o.user_id = v_user_id and o.id = any (p_materials || p_unit)
    order by o.id
    for update
  ) locked;

  if v_locked <> v_size + 1 then
    raise exception 'evolve: the unit or a material is not yours' using errcode = '22023';
  end if;

  if exists (
    select 1 from public.squads s
    where s.user_id = v_user_id
      and (s.unit_ids && p_materials or s.ally_unit_id = any (p_materials))
  ) then
    raise exception 'evolve: a material unit is in a squad' using errcode = '22023';
  end if;

  select * into v_target from public.owned_units o where o.id = p_unit;

  select c.data -> 'forms' into v_forms from public.content_items c
  where c.kind = 'unit' and c.id = v_target.unit_id;
  select f.ordinality::integer - 1, f.value into v_index, v_form
  from jsonb_array_elements(v_forms) with ordinality f
  where f.value ->> 'id' = v_target.form_id;
  if v_form is null then
    raise exception 'evolve: unit content is unavailable' using errcode = '55000';
  end if;

  v_recipe := v_form -> 'evolution';
  v_next_form := v_forms -> (v_index + 1);
  if v_recipe is null or jsonb_typeof(v_recipe) <> 'object' or v_next_form is null then
    raise exception 'evolve: % has no next form to evolve into', v_target.form_id
      using errcode = '22023';
  end if;

  if v_target.level < (v_form ->> 'maxLevel')::integer then
    raise exception 'evolve: the unit must be at max level (%)', v_form ->> 'maxLevel'
      using errcode = '22023';
  end if;

  -- The material units must match the recipe's unit counts exactly, compared as {unit: count}.
  select coalesce(jsonb_object_agg(r.value ->> 'unit', (r.value ->> 'count')::integer), '{}'::jsonb)
  into v_required
  from jsonb_array_elements(coalesce(v_recipe -> 'units', '[]'::jsonb)) r;
  select coalesce(jsonb_object_agg(g.unit_id, g.n), '{}'::jsonb) into v_given
  from (
    select o.unit_id, count(*)::integer as n from public.owned_units o
    where o.id = any (p_materials)
    group by o.unit_id
  ) g;
  if v_given <> v_required then
    raise exception 'evolve: the materials do not match the recipe for %', v_target.form_id
      using errcode = '22023';
  end if;

  -- Zel, charged before anything else changes.
  v_cost := coalesce((v_recipe ->> 'zel')::bigint, 0);
  if v_cost > 0 then
    insert into public.wallets (user_id) values (v_user_id) on conflict (user_id) do nothing;
    update public.wallets set zel = zel - v_cost, updated_at = now()
    where user_id = v_user_id and zel >= v_cost
    returning zel into v_balance;
    if v_balance is null then
      raise exception 'evolve: not enough Zel (costs %)', v_cost using errcode = 'P0001';
    end if;
    insert into public.wallet_log (user_id, currency, delta, balance_after, reason, ref_id)
    values (v_user_id, 'zel', -v_cost, v_balance, 'evolution', p_unit);
  end if;

  -- Recipe items (the Crown Shard); consume_item refuses (22023) a short stack, rolling back.
  for v_item in
    select r.value ->> 'item' as item_id, (r.value ->> 'count')::bigint as n
    from jsonb_array_elements(coalesce(v_recipe -> 'items', '[]'::jsonb)) r
  loop
    perform public.consume_item(v_user_id, v_item.item_id, v_item.n, 'evolution', p_unit);
    v_items := v_items || jsonb_build_object('item', v_item.item_id, 'count', v_item.n);
  end loop;

  update public.owned_units
  set form_id = v_next_form ->> 'id', level = 1, exp = 0,
    bb_level = greatest(1, v_target.bb_level / 2),
    sbb_level = greatest(1, v_target.sbb_level / 2)
  where id = p_unit;
  delete from public.owned_units where id = any (p_materials);

  return jsonb_build_object(
    'unit_id', p_unit,
    'from_form_id', v_target.form_id,
    'form_id', v_next_form ->> 'id',
    'level', 1,
    'exp', 0,
    'zel_spent', v_cost,
    'materials_consumed', v_size,
    'items', v_items
  );
end;
$$;

revoke execute on function public.evolve(uuid, uuid[]) from public, anon;
grant execute on function public.evolve(uuid, uuid[]) to authenticated;

drop function public.fodder_fusion_exp(jsonb, text, integer, text);
