-- M4-05B: fuse and evolve spend stacked copies (RESOLVED-75; GAME_DESIGN §6 → Growth fodder →
-- Stacking).
--
-- Both RPCs gain a trailing stack-quantity argument next to their owned-unit ids:
--   fuse(p_target uuid, p_fodder uuid[] default '{}', p_fodder_stacks jsonb default '{}')
--   evolve(p_unit uuid, p_materials uuid[] default '{}', p_material_stacks jsonb default '{}')
-- The stack argument is a JSON object mapping an owned_unit_stacks.id to the number of copies to
-- spend from it, e.g. {"<stack uuid>": 3}. Each stacked copy counts exactly like an owned_units row
-- of the same unit and form at level 1: same fusion EXP (element match, fixed fusionExp, duplicate
-- x2 and +10 burst levels when the stack is the target's own unit), the same 1-5 fodder limit and
-- 100 x target level Zel per copy, and the same recipe matching by unit id. Stacks are spent through
-- change_unit_stack (reason 'fusion' ref the target, or 'evolution' ref the unit) after every check
-- and the Zel charge, in the same transaction. Return shapes are unchanged: fodder_consumed and
-- materials_consumed count rows plus stacked copies.
-- The old two-argument functions are dropped (not overloaded), so named-argument callers such as
-- supabase.rpc('fuse', {p_target, p_fodder}) resolve to the new functions unchanged.

-- ---------------------------------------------------------------------------------------------
-- lock_unit_stack_spend: validate and lock p_user_id's stack quantities p_stacks ({stack id:
-- positive integer}) in stack-id order, returning [{stack_id, unit_id, form_id, count}] ordered by
-- stack id. Null means none. Rejects (22023) a non-object, a key that is not a uuid, a repeated
-- stack, a count that is not a positive integer, a missing or another player's stack, or a stack of
-- a unit content no longer marks stackable; rejects (P0001) a count above the stack's copies.
-- p_caller prefixes the messages. Internal.
-- ---------------------------------------------------------------------------------------------
create function public.lock_unit_stack_spend(p_user_id uuid, p_stacks jsonb, p_caller text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_stacks jsonb := coalesce(p_stacks, '{}'::jsonb);
  v_keys integer;
  v_result jsonb;
  v_row record;
begin
  if jsonb_typeof(v_stacks) <> 'object' then
    raise exception '%: stack quantities must be an object of stack id to count', p_caller
      using errcode = '22023';
  end if;
  v_keys := (select count(*) from jsonb_object_keys(v_stacks));
  if v_keys = 0 then
    return '[]'::jsonb;
  end if;

  if exists (
    select 1 from jsonb_each(v_stacks) e
    where e.key !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      or case when jsonb_typeof(e.value) = 'number' then
        (e.value::text)::numeric <> trunc((e.value::text)::numeric)
          or (e.value::text)::numeric not between 1 and 2147483647
        else true end
  ) then
    raise exception '%: each stack quantity must be a stack id and a positive whole count', p_caller
      using errcode = '22023';
  end if;

  if (select count(distinct e.key::uuid) from jsonb_each(v_stacks) e) <> v_keys then
    raise exception '%: a stack is repeated', p_caller using errcode = '22023';
  end if;

  -- Lock in stack-id order so concurrent spends of the same stacks serialize without deadlocking.
  select coalesce(jsonb_agg(jsonb_build_object('stack_id', l.id, 'unit_id', l.unit_id,
      'form_id', l.form_id, 'count', l.spend, 'held', l.count) order by l.id), '[]'::jsonb)
  into v_result
  from (
    select s.id, s.unit_id, s.form_id, s.count, (e.value::text)::numeric::integer as spend
    from public.owned_unit_stacks s
    join jsonb_each(v_stacks) e on e.key::uuid = s.id
    where s.user_id = p_user_id
    order by s.id
    for update of s
  ) l;

  if jsonb_array_length(v_result) <> v_keys then
    raise exception '%: a stack is not yours', p_caller using errcode = '22023';
  end if;

  for v_row in
    select r ->> 'unit_id' as unit_id, (r ->> 'count')::integer as spend,
      (r ->> 'held')::integer as held
    from jsonb_array_elements(v_result) r
  loop
    if not public.unit_is_stackable(v_row.unit_id) then
      raise exception '%: % is not a stackable unit', p_caller, v_row.unit_id
        using errcode = '22023';
    end if;
    if v_row.held < v_row.spend then
      raise exception '%: not enough copies of % in the stack', p_caller, v_row.unit_id
        using errcode = 'P0001';
    end if;
  end loop;

  return v_result;
end;
$$;

revoke execute on function public.lock_unit_stack_spend(uuid, jsonb, text)
  from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------------------------
-- fuse: as in M4-01C, plus p_fodder_stacks.
-- ---------------------------------------------------------------------------------------------
drop function public.fuse(uuid, uuid[]);

create function public.fuse(
  p_target uuid,
  p_fodder uuid[] default '{}',
  p_fodder_stacks jsonb default '{}'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_rows uuid[] := coalesce(p_fodder, '{}');
  v_row_count integer := coalesce(cardinality(p_fodder), 0);
  v_stacks jsonb;
  v_stack jsonb;
  v_size integer;
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

  if v_row_count > 0 and array_ndims(v_rows) <> 1 then
    raise exception 'fuse: feed 1-5 fodder units' using errcode = '22023';
  end if;

  if array_position(v_rows, null) is not null then
    raise exception 'fuse: fodder ids must not be null' using errcode = '22023';
  end if;

  if (select count(distinct f) from unnest(v_rows) f) <> v_row_count then
    raise exception 'fuse: a fodder unit is repeated' using errcode = '22023';
  end if;

  if p_target = any (v_rows) then
    raise exception 'fuse: the target cannot be its own fodder' using errcode = '22023';
  end if;

  -- Lock the target and every fodder row in one id-ordered pass, so concurrent fusions over the
  -- same units serialize without deadlocking and a fodder unit can be consumed only once.
  select count(*) into v_locked from (
    select o.id from public.owned_units o
    where o.user_id = v_user_id and o.id = any (v_rows || p_target)
    order by o.id
    for update
  ) locked;

  if v_locked <> v_row_count + 1 then
    raise exception 'fuse: the target or a fodder unit is not yours' using errcode = '22023';
  end if;

  -- Then the stacks (always after the rows, as in evolve).
  v_stacks := public.lock_unit_stack_spend(v_user_id, p_fodder_stacks, 'fuse');
  v_size := v_row_count + coalesce((select sum((s ->> 'count')::integer)
    from jsonb_array_elements(v_stacks) s), 0)::integer;

  if v_size < 1 or v_size > 5 then
    raise exception 'fuse: feed 1-5 fodder units' using errcode = '22023';
  end if;

  if exists (
    select 1 from public.squads s
    where s.user_id = v_user_id
      and (s.unit_ids && v_rows or s.ally_unit_id = any (v_rows))
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

  -- Rows count once each; a stack counts `copies` times as a level-1 row of its unit and form.
  for v_fodder in
    select o.unit_id, o.level, 1 as copies, u.data ->> 'element' as element, f.value as form
    from public.owned_units o
    left join public.content_items u on u.kind = 'unit' and u.id = o.unit_id
    left join lateral (
      select e.value from jsonb_array_elements(u.data -> 'forms') e
      where e.value ->> 'id' = o.form_id
    ) f on true
    where o.id = any (v_rows)
    union all
    select s ->> 'unit_id', 1, (s ->> 'count')::integer, u.data ->> 'element', f.value
    from jsonb_array_elements(v_stacks) s
    left join public.content_items u on u.kind = 'unit' and u.id = s ->> 'unit_id'
    left join lateral (
      select e.value from jsonb_array_elements(u.data -> 'forms') e
      where e.value ->> 'id' = s ->> 'form_id'
    ) f on true
  loop
    v_fodder_exp := public.fodder_fusion_exp(
      v_fodder.form, v_fodder.element, v_fodder.level, v_element,
      v_fodder.unit_id = v_target.unit_id);
    if v_fodder_exp is null then
      raise exception 'fuse: fodder content is unavailable' using errcode = '55000';
    end if;
    v_gain := v_gain + v_fodder_exp * v_fodder.copies;
    if v_fodder.unit_id = v_target.unit_id then
      v_burst_gain := v_burst_gain + 10 * v_fodder.copies;
    end if;
  end loop;

  -- Zel: 100 x the target's current level per fodder copy, charged before anything changes.
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
  delete from public.owned_units where id = any (v_rows);
  for v_stack in select value from jsonb_array_elements(v_stacks) loop
    perform public.change_unit_stack(v_user_id, v_stack ->> 'unit_id', v_stack ->> 'form_id',
      -(v_stack ->> 'count')::integer, 'fusion', p_target);
  end loop;

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

revoke execute on function public.fuse(uuid, uuid[], jsonb) from public, anon;
grant execute on function public.fuse(uuid, uuid[], jsonb) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- evolve: as in M4-01C, plus p_material_stacks.
-- ---------------------------------------------------------------------------------------------
drop function public.evolve(uuid, uuid[]);

create function public.evolve(
  p_unit uuid,
  p_materials uuid[] default '{}',
  p_material_stacks jsonb default '{}'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_row_count integer := coalesce(cardinality(p_materials), 0);
  v_size integer;
  v_stacks jsonb;
  v_stack jsonb;
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

  if p_materials is null or (v_row_count > 0 and array_ndims(p_materials) <> 1) then
    raise exception 'evolve: materials must be a list of unit ids' using errcode = '22023';
  end if;

  if array_position(p_materials, null) is not null then
    raise exception 'evolve: material ids must not be null' using errcode = '22023';
  end if;

  if (select count(distinct m) from unnest(p_materials) m) <> v_row_count then
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

  if v_locked <> v_row_count + 1 then
    raise exception 'evolve: the unit or a material is not yours' using errcode = '22023';
  end if;

  v_stacks := public.lock_unit_stack_spend(v_user_id, p_material_stacks, 'evolve');
  v_size := v_row_count + coalesce((select sum((s ->> 'count')::integer)
    from jsonb_array_elements(v_stacks) s), 0)::integer;

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

  -- Rows and stacked copies together must match the recipe's unit counts exactly, as {unit: count}.
  select coalesce(jsonb_object_agg(r.value ->> 'unit', (r.value ->> 'count')::integer), '{}'::jsonb)
  into v_required
  from jsonb_array_elements(coalesce(v_recipe -> 'units', '[]'::jsonb)) r;
  select coalesce(jsonb_object_agg(g.unit_id, g.n), '{}'::jsonb) into v_given
  from (
    select m.unit_id, sum(m.n)::integer as n from (
      select o.unit_id, 1 as n from public.owned_units o where o.id = any (p_materials)
      union all
      select s ->> 'unit_id', (s ->> 'count')::integer from jsonb_array_elements(v_stacks) s
    ) m
    group by m.unit_id
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
  for v_stack in select value from jsonb_array_elements(v_stacks) loop
    perform public.change_unit_stack(v_user_id, v_stack ->> 'unit_id', v_stack ->> 'form_id',
      -(v_stack ->> 'count')::integer, 'evolution', p_unit);
  end loop;

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

revoke execute on function public.evolve(uuid, uuid[], jsonb) from public, anon;
grant execute on function public.evolve(uuid, uuid[], jsonb) to authenticated;
