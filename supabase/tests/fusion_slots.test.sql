-- M4-01D: fuse takes 1-5 fodder slots; a slot is one owned row or one stack of 1-99 copies, and
-- every copy keeps its own EXP, effects, and Zel (RESOLVED-90 item 1).
begin;
select plan(16);

-- Pin fuse's success roll (M4-06C) to Success so EXP is deterministic; rolled back with the test.
create or replace function public.fusion_roll()
returns integer language sql volatile set search_path = '' as $$ select 0 $$;

-- Fixtures ----------------------------------------------------------------------------------------
insert into auth.users (id, email) values ('00000000-0000-0000-0000-00000000c5a1', 'slots@example.test');

insert into public.owned_units (id, user_id, unit_id, form_id, level) values
  -- Targets: t1 single copies, t2 five stacks of 99, t3 mixed row + stacks, t4 rejections
  ('00000000-0000-0000-0000-00000000c511', '00000000-0000-0000-0000-00000000c5a1', 'brand', 'brand-3', 1),
  ('00000000-0000-0000-0000-00000000c512', '00000000-0000-0000-0000-00000000c5a1', 'brand', 'brand-3', 1),
  ('00000000-0000-0000-0000-00000000c513', '00000000-0000-0000-0000-00000000c5a1', 'brand', 'brand-3', 1),
  ('00000000-0000-0000-0000-00000000c514', '00000000-0000-0000-0000-00000000c5a1', 'brand', 'brand-3', 1),
  -- Fodder rows
  ('00000000-0000-0000-0000-00000000c5f1', '00000000-0000-0000-0000-00000000c5a1', 'cinder-flask', 'cinder-flask-3', 1),
  ('00000000-0000-0000-0000-00000000c5f2', '00000000-0000-0000-0000-00000000c5a1', 'cinder-mote', 'cinder-mote-1', 1),
  ('00000000-0000-0000-0000-00000000c5f3', '00000000-0000-0000-0000-00000000c5a1', 'cinder-mote', 'cinder-mote-1', 1),
  ('00000000-0000-0000-0000-00000000c5f4', '00000000-0000-0000-0000-00000000c5a1', 'cinder-mote', 'cinder-mote-1', 1),
  ('00000000-0000-0000-0000-00000000c5f5', '00000000-0000-0000-0000-00000000c5a1', 'cinder-mote', 'cinder-mote-1', 1),
  ('00000000-0000-0000-0000-00000000c5f6', '00000000-0000-0000-0000-00000000c5a1', 'cinder-mote', 'cinder-mote-1', 1),
  ('00000000-0000-0000-0000-00000000c5f7', '00000000-0000-0000-0000-00000000c5a1', 'cinder-mote', 'cinder-mote-1', 1);

insert into public.owned_unit_stacks (id, user_id, unit_id, form_id, count) values
  ('00000000-0000-0000-0000-00000000c5c1', '00000000-0000-0000-0000-00000000c5a1', 'cinder-flask', 'cinder-flask-3', 120),
  ('00000000-0000-0000-0000-00000000c5c2', '00000000-0000-0000-0000-00000000c5a1', 'rill-flask', 'rill-flask-3', 120),
  ('00000000-0000-0000-0000-00000000c5c3', '00000000-0000-0000-0000-00000000c5a1', 'moss-flask', 'moss-flask-3', 120),
  ('00000000-0000-0000-0000-00000000c5c4', '00000000-0000-0000-0000-00000000c5a1', 'dusk-flask', 'dusk-flask-3', 120),
  ('00000000-0000-0000-0000-00000000c5c5', '00000000-0000-0000-0000-00000000c5a1', 'glint-flask', 'glint-flask-3', 120),
  ('00000000-0000-0000-0000-00000000c5c6', '00000000-0000-0000-0000-00000000c5a1', 'lantern-toad', 'lantern-toad-3', 3);
insert into public.wallets (user_id, zel) values ('00000000-0000-0000-0000-00000000c5a1', 1000000);

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000c5a1","role":"authenticated"}', true);

-- Slot and 99 limits; rejected calls consume nothing (8) ------------------------------------------
select throws_ok($$select public.fuse('00000000-0000-0000-0000-00000000c514', array[
  '00000000-0000-0000-0000-00000000c5f2', '00000000-0000-0000-0000-00000000c5f3',
  '00000000-0000-0000-0000-00000000c5f4', '00000000-0000-0000-0000-00000000c5f5',
  '00000000-0000-0000-0000-00000000c5f6', '00000000-0000-0000-0000-00000000c5f7']::uuid[])$$,
  '22023', 'fuse: feed 1-5 fodder slots', 'six rows are six slots and are rejected');
select throws_ok($$select public.fuse('00000000-0000-0000-0000-00000000c514', array[
  '00000000-0000-0000-0000-00000000c5f2', '00000000-0000-0000-0000-00000000c5f3',
  '00000000-0000-0000-0000-00000000c5f4', '00000000-0000-0000-0000-00000000c5f5']::uuid[],
  '{"00000000-0000-0000-0000-00000000c5c1": 1, "00000000-0000-0000-0000-00000000c5c2": 1}')$$,
  '22023', 'fuse: feed 1-5 fodder slots', 'four rows and two stacks are six slots and are rejected');
select throws_ok($$select public.fuse('00000000-0000-0000-0000-00000000c514',
  array['00000000-0000-0000-0000-00000000c5f2']::uuid[],
  '{"00000000-0000-0000-0000-00000000c5c1": 1, "00000000-0000-0000-0000-00000000c5c2": 1,
    "00000000-0000-0000-0000-00000000c5c3": 1, "00000000-0000-0000-0000-00000000c5c4": 1,
    "00000000-0000-0000-0000-00000000c5c5": 1}')$$,
  '22023', 'fuse: feed 1-5 fodder slots', 'five stacks and a row are six slots and are rejected');
select throws_ok($$select public.fuse('00000000-0000-0000-0000-00000000c514', '{}',
  '{"00000000-0000-0000-0000-00000000c5c1": 100}')$$,
  '22023', 'fuse: a stack slot holds 1-99 copies', 'a stack slot of 100 held copies is rejected');
select throws_ok($$select public.fuse('00000000-0000-0000-0000-00000000c514', '{}',
  '{"00000000-0000-0000-0000-00000000c5c6": 100}')$$,
  '22023', 'fuse: a stack slot holds 1-99 copies', 'a stack slot above 99 is rejected even when not held');
select throws_ok($$select public.fuse('00000000-0000-0000-0000-00000000c514', '{}',
  '{"00000000-0000-0000-0000-00000000c5c1": 0}')$$,
  '22023', null, 'a stack slot of 0 is rejected');
select throws_ok($$select public.fuse('00000000-0000-0000-0000-00000000c514', '{}',
  '{"00000000-0000-0000-0000-00000000c5c6": 4}')$$,
  'P0001', 'fuse: not enough copies of lantern-toad in the stack', 'a stack slot above the held count is rejected');
reset role;
select ok((select count(*) = 0 from public.unit_stack_log where user_id = '00000000-0000-0000-0000-00000000c5a1')
  and (select count(*) = 0 from public.fusion_log where user_id = '00000000-0000-0000-0000-00000000c5a1')
  and (select zel from public.wallets where user_id = '00000000-0000-0000-0000-00000000c5a1') = 1000000
  and (select sum(count) from public.owned_unit_stacks where user_id = '00000000-0000-0000-0000-00000000c5a1') = 603
  and (select count(*) from public.owned_units where user_id = '00000000-0000-0000-0000-00000000c5a1') = 11,
  'rejected calls changed no row, stack, log, or Zel');

-- Five stacks of 99 copies each (5) ---------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000c5a1","role":"authenticated"}', true);
create temporary table outcome (name text primary key, r jsonb) on commit drop;
insert into outcome select 'single', public.fuse('00000000-0000-0000-0000-00000000c511', '{}',
  '{"00000000-0000-0000-0000-00000000c5c1": 1, "00000000-0000-0000-0000-00000000c5c2": 1,
    "00000000-0000-0000-0000-00000000c5c3": 1, "00000000-0000-0000-0000-00000000c5c4": 1,
    "00000000-0000-0000-0000-00000000c5c5": 1}');
insert into outcome select 'batch', public.fuse('00000000-0000-0000-0000-00000000c512', '{}',
  '{"00000000-0000-0000-0000-00000000c5c1": 99, "00000000-0000-0000-0000-00000000c5c2": 99,
    "00000000-0000-0000-0000-00000000c5c3": 99, "00000000-0000-0000-0000-00000000c5c4": 99,
    "00000000-0000-0000-0000-00000000c5c5": 99}');
select is((select (r ->> 'exp_gained')::bigint from outcome where name = 'batch'),
  99 * (select (r ->> 'exp_gained')::bigint from outcome where name = 'single'),
  'five stacks of 99 give 99 times the EXP of one copy of each');
select is((select r ->> 'zel_spent' || '/' || (r ->> 'fodder_consumed') from outcome where name = 'batch'),
  '49500/495', 'every one of the 495 copies costs 100 Zel x level');
reset role;
select is((select fodder_consumed || '/' || zel_spent from public.fusion_log
    where target_id = '00000000-0000-0000-0000-00000000c512'),
  '495/49500', 'the fusion log records all 495 copies');
select results_eq($$select count from public.owned_unit_stacks
    where user_id = '00000000-0000-0000-0000-00000000c5a1' and unit_id like '%-flask' order by id$$,
  $$values (20), (20), (20), (20), (20)$$, 'each stack lost exactly 1 + 99 copies');
select is((select level from public.owned_units where id = '00000000-0000-0000-0000-00000000c512'),
  (select (r ->> 'level')::int from outcome where name = 'batch'), 'the target took the batch EXP');

-- A row and a stack of the same unit sit in separate slots; toad copies each add a level (3) -----
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000c5a1","role":"authenticated"}', true);
insert into outcome select 'mixed', public.fuse('00000000-0000-0000-0000-00000000c513',
  array['00000000-0000-0000-0000-00000000c5f1']::uuid[],
  '{"00000000-0000-0000-0000-00000000c5c1": 5, "00000000-0000-0000-0000-00000000c5c6": 3}');
select is((select r ->> 'zel_spent' || '/' || (r ->> 'fodder_consumed') from outcome where name = 'mixed'),
  '900/9', 'three slots carrying nine copies cost nine copies of Zel');
select is((select (r ->> 'bb_level')::int from outcome where name = 'mixed'), 4,
  'each of three stacked Lantern Toads adds one burst level');
reset role;
select is((select zel from public.wallets where user_id = '00000000-0000-0000-0000-00000000c5a1'),
  (1000000 - 500 - 49500 - 900)::bigint, 'Zel matches the per-copy cost of every fusion');

select * from finish();
rollback;
