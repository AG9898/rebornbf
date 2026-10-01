-- M4-04E: the Lantern, Regent, and Matriarch Toads (rows or stacked copies) add +1 / +5 / +20 burst
-- levels by the duplicate overflow rule (BB to 10, then SBB to 10 on a form with one, excess lost),
-- consumed atomically. Their SP-when-capped branch is post-launch (RESOLVED-85), so a burst toad
-- into a target with no burst level left to gain is rejected and changes nothing.
begin;
select plan(24);

-- Fixtures ----------------------------------------------------------------------------------------
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000e0a1', 'toad-a@example.test');

-- Targets: brand-omni has an SBB, brand-3 does not.
insert into public.owned_units (id, user_id, unit_id, form_id, level, bb_level, sbb_level) values
  ('00000000-0000-0000-0000-00000000e011', '00000000-0000-0000-0000-00000000e0a1', 'brand', 'brand-omni', 1, 1, 1),
  ('00000000-0000-0000-0000-00000000e012', '00000000-0000-0000-0000-00000000e0a1', 'brand', 'brand-omni', 1, 5, 1),
  ('00000000-0000-0000-0000-00000000e013', '00000000-0000-0000-0000-00000000e0a1', 'brand', 'brand-3', 1, 8, 1),
  ('00000000-0000-0000-0000-00000000e014', '00000000-0000-0000-0000-00000000e0a1', 'brand', 'brand-omni', 1, 1, 1),
  ('00000000-0000-0000-0000-00000000e015', '00000000-0000-0000-0000-00000000e0a1', 'brand', 'brand-omni', 1, 10, 10),
  ('00000000-0000-0000-0000-00000000e016', '00000000-0000-0000-0000-00000000e0a1', 'brand', 'brand-3', 1, 10, 1),
  ('00000000-0000-0000-0000-00000000e017', '00000000-0000-0000-0000-00000000e0a1', 'brand', 'brand-omni', 1, 10, 9),
  -- Fodder rows: a Lantern Toad, a Regent Toad, a duplicate Brand, and a capped-test Lantern Toad
  ('00000000-0000-0000-0000-00000000e0f1', '00000000-0000-0000-0000-00000000e0a1', 'lantern-toad', 'lantern-toad-3', 1, 1, 1),
  ('00000000-0000-0000-0000-00000000e0f2', '00000000-0000-0000-0000-00000000e0a1', 'regent-toad', 'regent-toad-4', 1, 1, 1),
  ('00000000-0000-0000-0000-00000000e0f3', '00000000-0000-0000-0000-00000000e0a1', 'brand', 'brand-3', 1, 1, 1),
  ('00000000-0000-0000-0000-00000000e0f4', '00000000-0000-0000-0000-00000000e0a1', 'lantern-toad', 'lantern-toad-3', 1, 1, 1);

insert into public.owned_unit_stacks (id, user_id, unit_id, form_id, count) values
  ('00000000-0000-0000-0000-00000000e5c1', '00000000-0000-0000-0000-00000000e0a1', 'matriarch-toad', 'matriarch-toad-4', 2),
  ('00000000-0000-0000-0000-00000000e5c2', '00000000-0000-0000-0000-00000000e0a1', 'lantern-toad', 'lantern-toad-3', 3),
  ('00000000-0000-0000-0000-00000000e5c3', '00000000-0000-0000-0000-00000000e0a1', 'regent-toad', 'regent-toad-4', 1);
insert into public.wallets (user_id, zel) values ('00000000-0000-0000-0000-00000000e0a1', 10000);

-- Content (3) -------------------------------------------------------------------------------------
select is((select data #> '{forms,0,fusionEffect}' from public.content_items
    where kind = 'unit' and id = 'lantern-toad'), '{"burstLevels": 1}'::jsonb, 'Lantern Toad: +1');
select is((select data #> '{forms,0,fusionEffect}' from public.content_items
    where kind = 'unit' and id = 'regent-toad'), '{"burstLevels": 5}'::jsonb, 'Regent Toad: +5');
select is((select data #> '{forms,0,fusionEffect}' from public.content_items
    where kind = 'unit' and id = 'matriarch-toad'), '{"burstLevels": 20}'::jsonb,
  'Matriarch Toad: +20');

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000e0a1","role":"authenticated"}', true);

-- Lantern Toad row: BB 1 -> 2 (3)
select is(public.fuse('00000000-0000-0000-0000-00000000e011',
    array['00000000-0000-0000-0000-00000000e0f1']::uuid[]) - 'exp' - 'level' - 'target_id' - 'exp_gained',
  '{"bb_level": 2, "sbb_level": 1, "zel_spent": 100, "fodder_consumed": 1}'::jsonb,
  'a Lantern Toad adds one BB level');
select ok(not exists (select 1 from public.owned_units
    where id = '00000000-0000-0000-0000-00000000e0f1'), 'the Lantern Toad is consumed');
select is((select array[bb_level, sbb_level] from public.owned_units
    where id = '00000000-0000-0000-0000-00000000e011'), array[2, 1]::smallint[],
  'the persisted levels match the response');

-- Matriarch Toad stack: BB 5 -> 10, SBB 1 -> 10, 6 lost (3)
select is((public.fuse('00000000-0000-0000-0000-00000000e012', '{}'::uuid[],
    '{"00000000-0000-0000-0000-00000000e5c1": 1}'::jsonb) - 'exp' - 'level' - 'target_id' - 'exp_gained'),
  '{"bb_level": 10, "sbb_level": 10, "zel_spent": 100, "fodder_consumed": 1}'::jsonb,
  'a stacked Matriarch Toad fills BB, carries into SBB, and loses the excess');
select is((select count from public.owned_unit_stacks
    where id = '00000000-0000-0000-0000-00000000e5c1'), 1, 'one Matriarch copy left the stack');
select is((select array[bb_level, sbb_level] from public.owned_units
    where id = '00000000-0000-0000-0000-00000000e012'), array[10, 10]::smallint[],
  'BB and SBB are both 10');

-- Regent Toad row into a form without an SBB: BB 8 -> 10, the rest lost (2)
select is((public.fuse('00000000-0000-0000-0000-00000000e013',
    array['00000000-0000-0000-0000-00000000e0f2']::uuid[]) -> 'bb_level'), '10'::jsonb,
  'a Regent Toad caps BB on a form without an SBB');
select is((select sbb_level from public.owned_units
    where id = '00000000-0000-0000-0000-00000000e013'), 1::smallint,
  'no SBB overflow without an SBB');

-- Duplicate and toads share one pool: 10 + 1 + 1 from BB 1 -> BB 10, SBB 4 (2)
select is((public.fuse('00000000-0000-0000-0000-00000000e014',
    array['00000000-0000-0000-0000-00000000e0f3']::uuid[],
    '{"00000000-0000-0000-0000-00000000e5c2": 2}'::jsonb) - 'exp' - 'level' - 'target_id' - 'exp_gained'),
  '{"bb_level": 10, "sbb_level": 4, "zel_spent": 300, "fodder_consumed": 3}'::jsonb,
  'a duplicate and two Lantern Toads add 12 levels in one pool');
select is((select count from public.owned_unit_stacks
    where id = '00000000-0000-0000-0000-00000000e5c2'), 1, 'two Lantern copies left the stack');

-- A target one SBB level short still accepts a toad (1)
select is((public.fuse('00000000-0000-0000-0000-00000000e017', '{}'::uuid[],
    '{"00000000-0000-0000-0000-00000000e5c3": 1}'::jsonb) -> 'sbb_level'), '10'::jsonb,
  'a Regent Toad tops up SBB 9 -> 10 and loses 4');

-- Capped targets reject burst toads (SP is post-launch) and change nothing (8)
select is((select zel from public.wallets where user_id = '00000000-0000-0000-0000-00000000e0a1'),
  9300::bigint, 'Zel before the rejected fusions');
select throws_ok($$select public.fuse('00000000-0000-0000-0000-00000000e015',
    array['00000000-0000-0000-0000-00000000e0f4']::uuid[])$$,
  'P0001', 'fuse: burst levels are already capped', 'a toad row into BB/SBB 10 is rejected');
select throws_ok($$select public.fuse('00000000-0000-0000-0000-00000000e015', '{}'::uuid[],
    '{"00000000-0000-0000-0000-00000000e5c1": 1}'::jsonb)$$,
  'P0001', 'fuse: burst levels are already capped', 'a stacked toad into BB/SBB 10 is rejected');
select throws_ok($$select public.fuse('00000000-0000-0000-0000-00000000e016',
    array['00000000-0000-0000-0000-00000000e0f4']::uuid[])$$,
  'P0001', 'fuse: burst levels are already capped', 'a toad into BB 10 without an SBB is rejected');
select ok(exists (select 1 from public.owned_units
    where id = '00000000-0000-0000-0000-00000000e0f4'), 'the rejected toad row is kept');
select is((select count from public.owned_unit_stacks
    where id = '00000000-0000-0000-0000-00000000e5c1'), 1, 'the rejected toad stack is kept');
select is((select zel from public.wallets where user_id = '00000000-0000-0000-0000-00000000e0a1'),
  9300::bigint, 'the rejected fusions charged no Zel');
select is((select exp from public.owned_units where id = '00000000-0000-0000-0000-00000000e015'),
  0::bigint, 'the capped target gained no EXP');

-- A capped target still takes ordinary fodder (1)
reset role;
insert into public.owned_units (id, user_id, unit_id, form_id, level) values
  ('00000000-0000-0000-0000-00000000e0f5', '00000000-0000-0000-0000-00000000e0a1', 'cinder-flask', 'cinder-flask-3', 1);
set local role authenticated;
select is((public.fuse('00000000-0000-0000-0000-00000000e015',
    array['00000000-0000-0000-0000-00000000e0f5']::uuid[]) -> 'bb_level'), '10'::jsonb,
  'ordinary fodder into a capped target is still allowed');

-- The capped target kept its levels (1)
reset role;
select is((select array[bb_level, sbb_level] from public.owned_units
    where id = '00000000-0000-0000-0000-00000000e015'), array[10, 10]::smallint[],
  'the capped target stays at 10/10');

select * from finish();
rollback;
