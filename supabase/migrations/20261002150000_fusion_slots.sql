-- M4-01D: fuse takes 1-5 fodder slots instead of 1-5 copies (RESOLVED-90 item 1, amending
-- RESOLVED-75; GAME_DESIGN §6 -> Growth fodder, Level EXP and fusion).
--
-- A slot is one owned row (x1) or one stack quantity of 1-99 copies (never above the held count).
-- Everything per copy is unchanged from the installed fuse (20261001200000_fusion_success_rolls,
-- patched by per_quest_ally and stat_hobs): each copy's EXP, duplicate and burst-toad levels, stat
-- hob gains (a copy granting nothing still rejects the fusion), the one-Satchel-Toad rule, the
-- capped-burst rejection, the one success roll on the summed EXP, and 100 Zel x level per copy.
-- The server does not enforce the client's max-level pick cutoff (RESOLVED-90 item 3).
-- fusion_log.fodder_consumed keeps counting copies, so its ceiling rises to 5 x 99.

alter table public.fusion_log drop constraint fusion_log_fodder_consumed_check;
alter table public.fusion_log add constraint fusion_log_fodder_consumed_check
  check (fodder_consumed between 1 and 495);

create or replace function public.fuse(
  p_target uuid,
  p_fodder uuid[] default '{}',
  p_fodder_stacks jsonb default '{}'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_rows uuid[] := coalesce(p_fodder, '{}');
  v_row_count integer := coalesce(cardinality(p_fodder), 0);
  v_stacks jsonb;
  v_stack jsonb;
  v_size integer;
  v_slots integer;
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
  v_slot_copies integer := 0;
  v_toad_copies integer := 0;
  v_outcome text;
  v_base_gain bigint;
  v_imps jsonb;
begin
  if v_user_id is null then
    raise exception 'fuse: not signed in' using errcode = '42501';
  end if;

  if p_target is null then
    raise exception 'fuse: a target is required' using errcode = '22023';
  end if;

  if v_row_count > 0 and array_ndims(v_rows) <> 1 then
    raise exception 'fuse: feed 1-5 fodder slots' using errcode = '22023';
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

  -- A stack slot carries at most 99 copies (RESOLVED-90). Checked before the stack lock so an
  -- oversized count is refused the same way whether or not the player holds that many; the lock
  -- still rejects zero, fractional, non-number, and over-held counts.
  if jsonb_typeof(p_fodder_stacks) = 'object' and exists (
    select 1 from jsonb_each(p_fodder_stacks) e
    where jsonb_typeof(e.value) = 'number' and (e.value::text)::numeric > 99
  ) then
    raise exception 'fuse: a stack slot holds 1-99 copies' using errcode = '22023';
  end if;

  -- Then the stacks (always after the rows, as in evolve).
  v_stacks := public.lock_unit_stack_spend(v_user_id, p_fodder_stacks, 'fuse');

  -- Five slots: each owned row is one slot and each stack is one slot whatever its count.
  v_slots := v_row_count + jsonb_array_length(v_stacks);
  if v_slots < 1 or v_slots > 5 then
    raise exception 'fuse: feed 1-5 fodder slots' using errcode = '22023';
  end if;

  -- Every copy still gives its own EXP and effects and costs its own Zel.
  v_size := v_row_count + coalesce((select sum((s ->> 'count')::integer)
    from jsonb_array_elements(v_stacks) s), 0)::integer;

  if exists (
    select 1 from public.squads s
    where s.user_id = v_user_id
      and s.unit_ids && v_rows
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
  v_imps := v_target.imps;
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
  order by unit_id, copies
  loop
    if jsonb_typeof(v_fodder.form -> 'fusionEffect') = 'object'
      and (v_fodder.form -> 'fusionEffect') ? 'imps' then
      v_imps := public.hob_totals(v_imps, v_form -> 'impCaps',
        v_fodder.form #> '{fusionEffect,imps}', v_fodder.copies);
    end if;
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
    if v_fodder.form ->> 'fusionEffect' = 'sphereSlot' then
      v_slot_copies := v_slot_copies + v_fodder.copies;
    end if;
    -- Burst toads add their levels to the duplicate pool (jsonb_typeof guards the string effect).
    if jsonb_typeof(v_fodder.form -> 'fusionEffect') = 'object'
      and (v_fodder.form -> 'fusionEffect') ? 'burstLevels' then
      v_burst_gain := v_burst_gain
        + (v_fodder.form #>> '{fusionEffect,burstLevels}')::integer * v_fodder.copies;
      v_toad_copies := v_toad_copies + v_fodder.copies;
    end if;
  end loop;

  -- Slot-unlock fodder (the Satchel Toad): one per fusion, and only while the second slot is shut.
  if v_slot_copies > 1 then
    raise exception 'fuse: feed one slot-unlock fodder at a time' using errcode = '22023';
  end if;
  if v_slot_copies = 1 and v_target.second_sphere_slot then
    raise exception 'fuse: the second sphere slot is already open' using errcode = 'P0001';
  end if;

  -- Burst toads into a capped target: their +SP branch is post-launch, so nothing to grant.
  if v_toad_copies > 0 and v_target.bb_level >= 10
    and (not ((v_form -> 'bursts') ? 'sbb') or v_target.sbb_level >= 10) then
    raise exception 'fuse: burst levels are already capped' using errcode = 'P0001';
  end if;

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

  -- One success roll per fusion (RESOLVED-78), drawn on the server and applied to the summed EXP.
  v_outcome := public.fusion_outcome(public.fusion_roll());
  v_base_gain := v_gain;
  v_gain := public.fusion_outcome_exp(v_base_gain, v_outcome);

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
    bb_level = v_bb, sbb_level = v_sbb, imps = v_imps,
    second_sphere_slot = v_target.second_sphere_slot or v_slot_copies = 1
  where id = p_target;
  delete from public.owned_units where id = any (v_rows);
  for v_stack in select value from jsonb_array_elements(v_stacks) loop
    perform public.change_unit_stack(v_user_id, v_stack ->> 'unit_id', v_stack ->> 'form_id',
      -(v_stack ->> 'count')::integer, 'fusion', p_target);
  end loop;

  insert into public.fusion_log (user_id, target_id, outcome, base_exp, exp_gained, zel_spent,
    fodder_consumed)
  values (v_user_id, p_target, v_outcome, v_base_gain, v_gain, v_cost, v_size);

  return jsonb_build_object(
    'target_id', p_target,
    'outcome', v_outcome,
    'exp_gained', v_gain,
    'exp', v_new_exp,
    'level', v_new_level,
    'bb_level', v_bb,
    'sbb_level', v_sbb,
    'zel_spent', v_cost,
    'fodder_consumed', v_size
  ) || case when v_slot_copies = 1
    then jsonb_build_object('sphere_slot_unlocked', true) else '{}'::jsonb end;
end;
$function$;

revoke execute on function public.fuse(uuid, uuid[], jsonb) from public, anon;
grant execute on function public.fuse(uuid, uuid[], jsonb) to authenticated;
