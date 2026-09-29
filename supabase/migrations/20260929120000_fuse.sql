-- M4-01A: level EXP curves and the fuse RPC (GAME_DESIGN.md §6 → Level EXP and fusion, RESOLVED-57).
--
-- fuse(target, fodder[]) feeds 1-5 of the caller's own units into one target in one transaction:
-- it sums each fodder unit's EXP, raises the target's EXP and level (capped at its form's
-- maxLevel), charges 100 Zel x the target's current level per fodder unit, and deletes the fodder.
-- owned_units.exp is the cumulative EXP earned in the unit's current form (level 1 = 0 EXP).
-- The duplicate bonus (x2 EXP and +10 burst levels) is added by M4-01C; until then a duplicate is
-- ordinary fodder. Burst toads, SP, hobs, and slot fodder effects are later tasks.

-- ---------------------------------------------------------------------------------------------
-- level_exp_curves: per-curve "To Next" EXP for levels 1..149 (to_next[i] takes level i to i + 1).
-- The values mirror packages/data/src/level-exp.ts (checked by level-exp.test.ts). Curves are named
-- by the level-1 "Next Lv" value; a unit line's curve is its content `expCurve` (default 10).
-- ---------------------------------------------------------------------------------------------
create table public.level_exp_curves (
  curve smallint primary key check (curve in (10, 21)),
  to_next integer[] not null check (cardinality(to_next) = 149)
);

insert into public.level_exp_curves (curve, to_next) values
  (10, array[
    10, 48, 102, 169, 245, 331, 425, 527, 636, 751, 872, 1001,
    1133, 1272, 1417, 1565, 1718, 1877, 2041, 2206, 2380, 2556, 2737, 2921,
    3109, 3301, 3497, 3697, 3902, 4108, 4319, 4532, 4749, 4972, 5195, 5423,
    5653, 5887, 6124, 6364, 6608, 6854, 7103, 7355, 7610, 7868, 8129, 8393,
    8660, 8928, 9200, 9475, 9752, 10032, 10315, 10600, 10888, 11178, 11471, 11766,
    12064, 12364, 12667, 12972, 13280, 13590, 13902, 14217, 14534, 14854, 15175, 15499,
    15826, 16154, 16485, 16818, 17153, 17491, 17830, 18172, 18516, 18862, 19210, 19561,
    19913, 20268, 20624, 20983, 21344, 21706, 22071, 22438, 22807, 23178, 23551, 23925,
    24302, 24681, 25062, 25445, 25830, 26217, 26606, 26997, 27390, 27785, 28182, 28581,
    28973, 29375, 29805, 30210, 30617, 31026, 31437, 31850, 32265, 32682, 33101, 33522,
    33945, 34370, 34797, 35226, 35657, 36090, 36525, 36962, 37401, 37842, 38285, 38730,
    39177, 39626, 40077, 40530, 40985, 41442, 41901, 42362, 42825, 43290, 43757, 44226,
    44697, 45170, 45645, 46122, 46601
  ]),
  (21, array[
    21, 96, 204, 337, 490, 662, 850, 1054, 1271, 1503, 1745, 2001,
    2267, 2544, 2832, 3129, 3438, 3754, 4081, 4415, 4759, 5112, 5472, 5841,
    6218, 6603, 6995, 7394, 7801, 8215, 8637, 9065, 9500, 9942, 10390, 10845,
    11307, 11774, 12248, 12729, 13215, 13708, 14206, 14710, 15220, 15736, 16258, 16785,
    17318, 17856, 18400, 18950, 19504, 20064, 20629, 21200, 21775, 22356, 22941, 23532,
    24128, 24729, 25334, 25945, 26560, 27180, 27805, 28434, 29068, 29707, 30351, 30999,
    31651, 32308, 32970, 33636, 34307, 34981, 35661, 36344, 37032, 37724, 38421, 39121,
    39826, 40535, 41248, 41966, 42687, 43413, 44142, 44876, 45614, 46355, 47101, 47851,
    48604, 49362, 50126, 50888, 51715, 52542, 53370, 54197, 55024, 55852, 56679, 57506,
    58334, 59161, 59989, 60816, 61643, 62471, 63298, 64125, 64953, 65780, 66608, 67435,
    68262, 69090, 69917, 70744, 71572, 72399, 73227, 74054, 74881, 75709, 76536, 77363,
    78191, 79018, 79846, 80673, 81500, 82328, 83155, 83982, 84810, 85637, 86465, 87292,
    88119, 88947, 89774, 90601, 91456
  ]);

comment on table public.level_exp_curves is
  'Level EXP curves (RESOLVED-57): to_next[i] is the EXP from level i to i + 1, levels 1-149.';

-- Server-only rules data, like content_items: RLS on, no policies, no client privileges.
alter table public.level_exp_curves enable row level security;
revoke all on table public.level_exp_curves from anon, authenticated, service_role;
grant select on table public.level_exp_curves to service_role;

-- ---------------------------------------------------------------------------------------------
-- level_exp_total: cumulative EXP a unit on `p_curve` needs to reach `p_level` from level 1.
-- ---------------------------------------------------------------------------------------------
create function public.level_exp_total(p_curve smallint, p_level integer)
returns bigint
language sql
stable
set search_path = ''
as $$
  select coalesce(sum(t.step), 0)::bigint
  from public.level_exp_curves c
  cross join lateral unnest(c.to_next[1:p_level - 1]) as t(step)
  where c.curve = p_curve;
$$;

revoke execute on function public.level_exp_total(smallint, integer)
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- fodder_fusion_exp: EXP one fodder form gives a target of `p_target_element` (RESOLVED-57).
-- Fixed-EXP fodder (a form with `fusionExp`) gives that value; any other form gives ordinary EXP,
-- base x (1 + (level - 1) / (maxLevel - 1)) with base by rarity. x1.5 for a matching element, then
-- rounded down once. Returns null for a form with neither (a 1-star form without fusionExp).
-- ---------------------------------------------------------------------------------------------
create function public.fodder_fusion_exp(
  p_form jsonb,
  p_fodder_element text,
  p_level integer,
  p_target_element text
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

  return v_numerator / v_denominator;
end;
$$;

revoke execute on function public.fodder_fusion_exp(jsonb, text, integer, text)
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- fuse: feed `p_fodder` (1-5 of the caller's units) into the caller's `p_target`. Rejects (22023)
-- an empty, oversized, repeated, or null fodder list; the target among the fodder; a target or
-- fodder unit the caller does not own; and fodder that sits in one of the caller's squads or ally
-- slots. Rejects (P0001) a fusion the caller cannot afford. EXP past the form's maxLevel is lost;
-- a max-level target may still be fused. Returns
-- {target_id, exp_gained, exp, level, zel_spent, fodder_consumed}.
-- ---------------------------------------------------------------------------------------------
create function public.fuse(p_target uuid, p_fodder uuid[])
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
    select o.level, u.data ->> 'element' as element, f.value as form
    from public.owned_units o
    left join public.content_items u on u.kind = 'unit' and u.id = o.unit_id
    left join lateral (
      select e.value from jsonb_array_elements(u.data -> 'forms') e
      where e.value ->> 'id' = o.form_id
    ) f on true
    where o.id = any (p_fodder)
  loop
    v_fodder_exp := public.fodder_fusion_exp(
      v_fodder.form, v_fodder.element, v_fodder.level, v_element);
    if v_fodder_exp is null then
      raise exception 'fuse: fodder content is unavailable' using errcode = '55000';
    end if;
    v_gain := v_gain + v_fodder_exp;
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

  update public.owned_units set exp = v_new_exp, level = v_new_level where id = p_target;
  delete from public.owned_units where id = any (p_fodder);

  return jsonb_build_object(
    'target_id', p_target,
    'exp_gained', v_gain,
    'exp', v_new_exp,
    'level', v_new_level,
    'zel_spent', v_cost,
    'fodder_consumed', v_size
  );
end;
$$;

revoke execute on function public.fuse(uuid, uuid[]) from public, anon;
grant execute on function public.fuse(uuid, uuid[]) to authenticated;
