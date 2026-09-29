-- M4-02A: the evolve RPC (GAME_DESIGN §6 → Evolution materials, RESOLVED-66, RESOLVED-67).
--
-- evolve(unit, materials[]) moves one of the caller's max-level units to the next form of its line
-- in one transaction: it checks the current form's `evolution` recipe (M4-02D) against the named
-- material units, consumes those units, the recipe's items (e.g. the Crown Shard) from owned_items,
-- and the recipe's Zel, then sets the unit to the next form at level 1 with 0 EXP.
-- Burst levels are halved on evolution (GAME_DESIGN §6 → Burst levels), but owned_units does not
-- store burst levels yet; the task that adds them (M4-01C) must halve them here too. Imps and
-- sphere slots are not stored yet either; they are kept by construction (only form, level, and exp
-- change).

-- ---------------------------------------------------------------------------------------------
-- evolve: evolve the caller's `p_unit` using `p_materials` (the caller's material units). Rejects
-- (22023) a null unit; a null, repeated, or multi-dimensional material list; the unit among its
-- own materials; a unit or material the caller does not own; a material in one of the caller's
-- squads or ally slots; a form with no recipe or no next form; a unit below its form's max level;
-- materials that do not match the recipe's unit counts exactly; and too few recipe items.
-- Rejects (P0001) an evolution the caller cannot afford. Nothing changes on any rejection.
-- Returns {unit_id, from_form_id, form_id, level, exp, zel_spent, materials_consumed, items}.
-- ---------------------------------------------------------------------------------------------
create function public.evolve(p_unit uuid, p_materials uuid[])
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
  set form_id = v_next_form ->> 'id', level = 1, exp = 0
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
