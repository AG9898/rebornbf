-- M4-04D: fusing one Satchel Toad (row or stacked copy) unlocks only that target's second sphere
-- slot, once; repeat, double, missing-fodder, and unauthorized fusions are rejected atomically.
-- Its +10 SP branch is post-launch (RESOLVED-85), so a toad into an open-slot target is rejected.
begin;
select plan(30);

-- Fixtures ----------------------------------------------------------------------------------------
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000d0a1', 'slot-a@example.test'),
  ('00000000-0000-0000-0000-00000000d0a2', 'slot-b@example.test');

insert into public.owned_units (id, user_id, unit_id, form_id, level) values
  -- A's targets: t1 row toad, t2 stacked toad, t3 rejected attempts, t4 untouched bystander
  ('00000000-0000-0000-0000-00000000d011', '00000000-0000-0000-0000-00000000d0a1', 'brand', 'brand-3', 1),
  ('00000000-0000-0000-0000-00000000d012', '00000000-0000-0000-0000-00000000d0a1', 'maren', 'maren-3', 1),
  ('00000000-0000-0000-0000-00000000d013', '00000000-0000-0000-0000-00000000d0a1', 'brand', 'brand-3', 1),
  ('00000000-0000-0000-0000-00000000d014', '00000000-0000-0000-0000-00000000d0a1', 'brand', 'brand-3', 1),
  -- A's split toad rows
  ('00000000-0000-0000-0000-00000000d0f1', '00000000-0000-0000-0000-00000000d0a1', 'satchel-toad', 'satchel-toad-3', 1),
  ('00000000-0000-0000-0000-00000000d0f2', '00000000-0000-0000-0000-00000000d0a1', 'satchel-toad', 'satchel-toad-3', 1),
  -- B's toad and target
  ('00000000-0000-0000-0000-00000000d0b1', '00000000-0000-0000-0000-00000000d0a2', 'satchel-toad', 'satchel-toad-3', 1),
  ('00000000-0000-0000-0000-00000000d0b2', '00000000-0000-0000-0000-00000000d0a2', 'brand', 'brand-3', 1);

insert into public.owned_unit_stacks (id, user_id, unit_id, form_id, count) values
  ('00000000-0000-0000-0000-00000000d5c1', '00000000-0000-0000-0000-00000000d0a1', 'satchel-toad', 'satchel-toad-3', 3),
  ('00000000-0000-0000-0000-00000000d5b1', '00000000-0000-0000-0000-00000000d0a2', 'satchel-toad', 'satchel-toad-3', 1);
insert into public.wallets (user_id, zel) values ('00000000-0000-0000-0000-00000000d0a1', 1000);

-- Content (1) -------------------------------------------------------------------------------------
select is((select data #>> '{forms,0,fusionEffect}' from public.content_items
    where kind = 'unit' and id = 'satchel-toad'), 'sphereSlot',
  'the Satchel Toad is seeded as slot-unlock fodder');

-- Unauthorized (3) --------------------------------------------------------------------------------
-- Checked by privilege, not by calling as anon: a denied-execute throws_ok can crash the local
-- Postgres (DISCOVERIES → 2026-09-29 local pgTAP crash).
select ok(not has_function_privilege('anon', 'public.fuse(uuid, uuid[], jsonb)', 'execute'),
  'anon cannot fuse');

set local role authenticated;
select set_config('request.jwt.claims', '{"role":"authenticated"}', true);
select throws_ok($$select public.fuse('00000000-0000-0000-0000-00000000d011',
    array['00000000-0000-0000-0000-00000000d0f1']::uuid[])$$,
  '42501', 'fuse: not signed in', 'a caller without a user is rejected');

-- B cannot feed A's toad into B's target.
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000d0a2","role":"authenticated"}', true);
select throws_ok($$select public.fuse('00000000-0000-0000-0000-00000000d0b2',
    array['00000000-0000-0000-0000-00000000d0f1']::uuid[])$$,
  '22023', null, 'another player''s toad cannot be fused');

-- Player A ----------------------------------------------------------------------------------------
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000d0a1","role":"authenticated"}', true);

-- Missing fodder (3)
select throws_ok($$select public.fuse('00000000-0000-0000-0000-00000000d013',
    array['00000000-0000-0000-0000-00000000d0b1']::uuid[])$$,
  '22023', null, 'a toad row of another player is missing fodder');
select throws_ok($$select public.fuse('00000000-0000-0000-0000-00000000d013', '{}'::uuid[],
    '{"00000000-0000-0000-0000-00000000d5b1": 1}'::jsonb)$$,
  '22023', null, 'a toad stack of another player is missing fodder');
select throws_ok($$select public.fuse('00000000-0000-0000-0000-00000000d013',
    array['00000000-0000-0000-0000-00000000dfff']::uuid[])$$,
  '22023', null, 'a toad that does not exist is missing fodder');

-- More than one toad in one fusion (2)
select throws_ok($$select public.fuse('00000000-0000-0000-0000-00000000d013', array[
    '00000000-0000-0000-0000-00000000d0f1', '00000000-0000-0000-0000-00000000d0f2']::uuid[])$$,
  '22023', 'fuse: feed one slot-unlock fodder at a time', 'two toad rows are rejected');
select throws_ok($$select public.fuse('00000000-0000-0000-0000-00000000d013', '{}'::uuid[],
    '{"00000000-0000-0000-0000-00000000d5c1": 2}'::jsonb)$$,
  '22023', 'fuse: feed one slot-unlock fodder at a time', 'two stacked toads are rejected');

-- A locked second slot refuses equipment before the fusion (1)
select throws_ok($$select public.equip_sphere('00000000-0000-0000-0000-00000000d011', 2::smallint, null)$$,
  '22023', 'equip_sphere: second slot locked', 'slot 2 starts locked');

-- One toad row unlocks t1's slot (6)
select is(public.fuse('00000000-0000-0000-0000-00000000d011',
    array['00000000-0000-0000-0000-00000000d0f1']::uuid[]) - 'exp' - 'level' - 'target_id',
  '{"exp_gained": 100, "bb_level": 1, "sbb_level": 1, "zel_spent": 100, "fodder_consumed": 1,
    "sphere_slot_unlocked": true}'::jsonb,
  'a Satchel Toad unlocks the slot and gives ordinary 3★ EXP');
select ok((select second_sphere_slot from public.owned_units
    where id = '00000000-0000-0000-0000-00000000d011'), 'the target''s second slot is unlocked');
select ok(not exists (select 1 from public.owned_units
    where id = '00000000-0000-0000-0000-00000000d0f1'), 'the toad is consumed');
select ok(not (select second_sphere_slot from public.owned_units
    where id = '00000000-0000-0000-0000-00000000d014'), 'another unit''s slot stays locked');
select lives_ok($$select public.equip_sphere('00000000-0000-0000-0000-00000000d011', 2::smallint, null)$$,
  'slot 2 now accepts equipment changes');
select is((select zel from public.wallets where user_id = '00000000-0000-0000-0000-00000000d0a1'),
  900::bigint, 'the fusion charged 100 Zel');

-- Repeat on an open slot is rejected and changes nothing (+10 SP is post-launch) (4)
select throws_ok($$select public.fuse('00000000-0000-0000-0000-00000000d011',
    array['00000000-0000-0000-0000-00000000d0f2']::uuid[])$$,
  'P0001', 'fuse: the second sphere slot is already open', 'a second toad into t1 is rejected');
select ok(exists (select 1 from public.owned_units
    where id = '00000000-0000-0000-0000-00000000d0f2'), 'the rejected toad is kept');
select is((select exp from public.owned_units where id = '00000000-0000-0000-0000-00000000d011'),
  100::bigint, 'the rejected fusion grants no EXP');
select is((select zel from public.wallets where user_id = '00000000-0000-0000-0000-00000000d0a1'),
  900::bigint, 'the rejected fusion charges no Zel');

-- One stacked toad unlocks t2's slot (3)
select is((public.fuse('00000000-0000-0000-0000-00000000d012', '{}'::uuid[],
    '{"00000000-0000-0000-0000-00000000d5c1": 1}'::jsonb) -> 'sphere_slot_unlocked'), 'true'::jsonb,
  'a stacked Satchel Toad unlocks the slot');
select ok((select second_sphere_slot from public.owned_units
    where id = '00000000-0000-0000-0000-00000000d012'), 't2''s second slot is unlocked');
select is((select count from public.owned_unit_stacks
    where id = '00000000-0000-0000-0000-00000000d5c1'), 2, 'one copy left the stack');

-- A stacked repeat is rejected too, keeping the stack (2)
select throws_ok($$select public.fuse('00000000-0000-0000-0000-00000000d012', '{}'::uuid[],
    '{"00000000-0000-0000-0000-00000000d5c1": 1}'::jsonb)$$,
  'P0001', 'fuse: the second sphere slot is already open', 'a stacked toad into t2 is rejected');
select is((select count from public.owned_unit_stacks
    where id = '00000000-0000-0000-0000-00000000d5c1'), 2, 'the stack is unchanged');

-- Rejected attempts left t3 and the others' fodder untouched (5)
reset role;
select ok(not (select second_sphere_slot from public.owned_units
    where id = '00000000-0000-0000-0000-00000000d013'), 't3 stays locked after every rejection');
select is((select exp from public.owned_units where id = '00000000-0000-0000-0000-00000000d013'),
  0::bigint, 't3 gained no EXP');
select ok(exists (select 1 from public.owned_units
    where id = '00000000-0000-0000-0000-00000000d0b1'), 'B''s toad row survives');
select is((select count from public.owned_unit_stacks
    where id = '00000000-0000-0000-0000-00000000d5b1'), 1, 'B''s toad stack survives');
select ok(not (select second_sphere_slot from public.owned_units
    where id = '00000000-0000-0000-0000-00000000d0b2'), 'B''s target stays locked');

select * from finish();
rollback;
