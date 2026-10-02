-- M4-06H: sell sale units for Zel (RESOLVED-79; GAME_DESIGN §8 -> Selling units).
--
-- A unit form is sellable only when its content sets `sellZel` (the Zel per copy). No launch
-- content does, so this RPC refuses every launch unit until sale units are added. Content needs no
-- schema change: `sellZel` is seeded inside the form JSON in public.content_items.

-- ---------------------------------------------------------------------------------------------
-- sell_units: sell 1-10 copies in one transaction, from owned-unit rows (`p_units`) and stack
-- quantities (`p_stacks`, {stack id: count}). Refuses forms without `sellZel`, units not owned by
-- the caller, and rows in a saved squad (allies are per quest, so no saved ally slot exists).
-- Equipped spheres return to the sphere inventory (unequip logged in sphere_equip_log). Rows are
-- deleted with unit_log entries, stacks decremented with unit_stack_log entries, and the Zel is
-- credited with a wallet_log row (reason `sell_units`). Every log row of one sale shares a ref_id.
-- Returns {zel_earned, zel, units_sold, spheres_returned}.
-- ---------------------------------------------------------------------------------------------
create function public.sell_units(
  p_units uuid[] default '{}'::uuid[], p_stacks jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_rows uuid[] := coalesce(p_units, '{}');
  v_row_count integer := coalesce(cardinality(p_units), 0);
  v_sale_id uuid := gen_random_uuid();
  v_locked integer;
  v_stacks jsonb;
  v_stack jsonb;
  v_size integer;
  v_unsellable text;
  v_total bigint;
  v_balance bigint;
  v_spheres integer;
begin
  if v_user_id is null then
    raise exception 'sell_units: not signed in' using errcode = '42501';
  end if;

  if v_row_count > 0 and array_ndims(v_rows) <> 1 then
    raise exception 'sell_units: sell 1-10 units' using errcode = '22023';
  end if;

  if array_position(v_rows, null) is not null then
    raise exception 'sell_units: unit ids must not be null' using errcode = '22023';
  end if;

  if (select count(distinct u) from unnest(v_rows) u) <> v_row_count then
    raise exception 'sell_units: a unit is repeated' using errcode = '22023';
  end if;

  -- The wallet row first: equip_sphere serializes on it before touching a unit, so taking it
  -- before the unit rows keeps the lock order the same and a sale cannot deadlock an equip.
  insert into public.wallets (user_id) values (v_user_id) on conflict (user_id) do nothing;
  perform 1 from public.wallets where user_id = v_user_id for update;

  select count(*) into v_locked from (
    select o.id from public.owned_units o
    where o.user_id = v_user_id and o.id = any (v_rows)
    order by o.id
    for update
  ) locked;

  if v_locked <> v_row_count then
    raise exception 'sell_units: a unit is not yours' using errcode = '22023';
  end if;

  v_stacks := public.lock_unit_stack_spend(v_user_id, p_stacks, 'sell_units');
  v_size := v_row_count + coalesce((select sum((s ->> 'count')::integer)
    from jsonb_array_elements(v_stacks) s), 0)::integer;

  if v_size < 1 or v_size > 10 then
    raise exception 'sell_units: sell 1-10 units' using errcode = '22023';
  end if;

  if exists (
    select 1 from public.squads s
    where s.user_id = v_user_id and s.unit_ids && v_rows
  ) then
    raise exception 'sell_units: a unit is in a squad' using errcode = '22023';
  end if;

  -- Price every copy: rows once each, a stack `count` times. A form without sellZel is refused.
  with sold as (
    select o.unit_id, o.form_id, 1 as copies from public.owned_units o
    where o.id = any (v_rows)
    union all
    select s ->> 'unit_id', s ->> 'form_id', (s ->> 'count')::integer
    from jsonb_array_elements(v_stacks) s
  ), priced as (
    select sold.form_id, sold.copies, (f.value ->> 'sellZel')::bigint as price
    from sold
    left join public.content_items u on u.kind = 'unit' and u.id = sold.unit_id
    left join lateral (
      select e.value from jsonb_array_elements(u.data -> 'forms') e
      where e.value ->> 'id' = sold.form_id
    ) f on true
  )
  select min(form_id) filter (where price is null), sum(price * copies)
  into v_unsellable, v_total
  from priced;

  if v_unsellable is not null then
    raise exception 'sell_units: % cannot be sold', v_unsellable using errcode = '22023';
  end if;

  -- Equipped spheres go back to the inventory: unequip each slot (logged as an empty equip).
  insert into public.sphere_equip_log (user_id, owned_unit_id, slot, owned_sphere_id)
  select v_user_id, e.owned_unit_id, e.slot, null
  from public.unit_spheres e
  where e.owned_unit_id = any (v_rows)
  order by e.owned_unit_id, e.slot;
  get diagnostics v_spheres = row_count;
  delete from public.unit_spheres e where e.owned_unit_id = any (v_rows);

  insert into public.unit_log (user_id, owned_unit_id, unit_id, form_id, delta, reason, ref_id)
  select v_user_id, o.id, o.unit_id, o.form_id, -1, 'sell_units', v_sale_id
  from public.owned_units o
  where o.id = any (v_rows)
  order by o.id;
  delete from public.owned_units o where o.id = any (v_rows);

  for v_stack in select value from jsonb_array_elements(v_stacks) loop
    perform public.change_unit_stack(v_user_id, v_stack ->> 'unit_id', v_stack ->> 'form_id',
      -(v_stack ->> 'count')::integer, 'sell_units', v_sale_id);
  end loop;

  update public.wallets set zel = zel + v_total, updated_at = now()
  where user_id = v_user_id
  returning zel into v_balance;
  insert into public.wallet_log (user_id, currency, delta, balance_after, reason, ref_id)
  values (v_user_id, 'zel', v_total, v_balance, 'sell_units', v_sale_id);

  return jsonb_build_object(
    'zel_earned', v_total,
    'zel', v_balance,
    'units_sold', v_size,
    'spheres_returned', v_spheres
  );
end;
$$;

revoke execute on function public.sell_units(uuid[], jsonb) from public, anon;
grant execute on function public.sell_units(uuid[], jsonb) to authenticated;
