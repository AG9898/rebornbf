-- M4-05B: fuse and evolve spend stack quantities ({stack id: count}) alongside owned-unit ids, with
-- the same results and Zel as the same copies held as rows (RESOLVED-75).
begin;
select plan(31);

-- Pin fuse's success roll (M4-06C) to Success so EXP is deterministic; rolled back with the test.
create or replace function public.fusion_roll()
returns integer language sql volatile set search_path = '' as $$ select 0 $$;

-- Privileges (5) ---------------------------------------------------------------------------------
select ok(has_function_privilege('authenticated', 'public.fuse(uuid, uuid[], jsonb)', 'execute'),
  'players may fuse with stacks');
select ok(has_function_privilege('authenticated', 'public.evolve(uuid, uuid[], jsonb)', 'execute'),
  'players may evolve with stacks');
select ok(not exists (select 1 from pg_proc where proname in ('fuse', 'evolve')
    and pronamespace = 'public'::regnamespace and pronargs = 2),
  'the two-argument versions are gone, so no call is ambiguous');
select ok(not has_function_privilege('authenticated', 'public.lock_unit_stack_spend(uuid, jsonb, text)', 'execute'),
  'the stack spend check is internal');
select ok(not has_function_privilege('service_role', 'public.lock_unit_stack_spend(uuid, jsonb, text)', 'execute'),
  'and internal to service_role');

-- Fixtures ----------------------------------------------------------------------------------------
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000b0a1', 'stacked-a@example.test'),
  ('00000000-0000-0000-0000-00000000b0a2', 'stacked-b@example.test');

insert into public.owned_units (id, user_id, unit_id, form_id, level) values
  -- Fusion targets: t1/t2 fed rows vs stacks, t3/t4 duplicates, t5 uuid-only named call
  ('00000000-0000-0000-0000-00000000b011', '00000000-0000-0000-0000-00000000b0a1', 'brand', 'brand-3', 1),
  ('00000000-0000-0000-0000-00000000b012', '00000000-0000-0000-0000-00000000b0a1', 'brand', 'brand-3', 1),
  ('00000000-0000-0000-0000-00000000b013', '00000000-0000-0000-0000-00000000b0a1', 'cinder-sprite', 'cinder-sprite-2', 1),
  ('00000000-0000-0000-0000-00000000b014', '00000000-0000-0000-0000-00000000b0a1', 'cinder-sprite', 'cinder-sprite-2', 1),
  ('00000000-0000-0000-0000-00000000b015', '00000000-0000-0000-0000-00000000b0a1', 'brand', 'brand-3', 1),
  -- Evolution units: e1/e2 rows vs stacks, e3 mixed
  ('00000000-0000-0000-0000-00000000b0e1', '00000000-0000-0000-0000-00000000b0a1', 'brand', 'brand-3', 40),
  ('00000000-0000-0000-0000-00000000b0e2', '00000000-0000-0000-0000-00000000b0a1', 'brand', 'brand-3', 40),
  ('00000000-0000-0000-0000-00000000b0e3', '00000000-0000-0000-0000-00000000b0a1', 'brand', 'brand-4', 60),
  -- Fodder and material rows (split copies)
  ('00000000-0000-0000-0000-00000000b0f1', '00000000-0000-0000-0000-00000000b0a1', 'cinder-flask', 'cinder-flask-3', 1),
  ('00000000-0000-0000-0000-00000000b0f2', '00000000-0000-0000-0000-00000000b0a1', 'cinder-flask', 'cinder-flask-3', 1),
  ('00000000-0000-0000-0000-00000000b0f3', '00000000-0000-0000-0000-00000000b0a1', 'cinder-flask', 'cinder-flask-3', 1),
  ('00000000-0000-0000-0000-00000000b0f4', '00000000-0000-0000-0000-00000000b0a1', 'rill-flask', 'rill-flask-3', 1),
  ('00000000-0000-0000-0000-00000000b0f5', '00000000-0000-0000-0000-00000000b0a1', 'rill-flask', 'rill-flask-3', 1),
  ('00000000-0000-0000-0000-00000000b0f6', '00000000-0000-0000-0000-00000000b0a1', 'cinder-flask', 'cinder-flask-3', 1),
  ('00000000-0000-0000-0000-00000000b0f7', '00000000-0000-0000-0000-00000000b0a1', 'cinder-sprite', 'cinder-sprite-2', 1),
  ('00000000-0000-0000-0000-00000000b0f8', '00000000-0000-0000-0000-00000000b0a1', 'cinder-sprite', 'cinder-sprite-2', 1),
  ('00000000-0000-0000-0000-00000000b0f9', '00000000-0000-0000-0000-00000000b0a1', 'rill-flask', 'rill-flask-3', 1),
  ('00000000-0000-0000-0000-00000000b0d1', '00000000-0000-0000-0000-00000000b0a1', 'cinder-effigy', 'cinder-effigy-3', 1),
  ('00000000-0000-0000-0000-00000000b0d2', '00000000-0000-0000-0000-00000000b0a1', 'cinder-sprite', 'cinder-sprite-2', 1),
  ('00000000-0000-0000-0000-00000000b0d3', '00000000-0000-0000-0000-00000000b0a1', 'cinder-mote', 'cinder-mote-1', 1),
  ('00000000-0000-0000-0000-00000000b0d4', '00000000-0000-0000-0000-00000000b0a1', 'cinder-sprite', 'cinder-sprite-2', 1);

-- A's stacks: s-brand is a stack of a non-stackable unit (content changed under it). B has one.
insert into public.owned_unit_stacks (id, user_id, unit_id, form_id, count) values
  ('00000000-0000-0000-0000-00000000b5c1', '00000000-0000-0000-0000-00000000b0a1', 'cinder-flask', 'cinder-flask-3', 5),
  ('00000000-0000-0000-0000-00000000b5c2', '00000000-0000-0000-0000-00000000b0a1', 'rill-flask', 'rill-flask-3', 2),
  ('00000000-0000-0000-0000-00000000b5c3', '00000000-0000-0000-0000-00000000b0a1', 'cinder-sprite', 'cinder-sprite-2', 3),
  ('00000000-0000-0000-0000-00000000b5c4', '00000000-0000-0000-0000-00000000b0a1', 'cinder-effigy', 'cinder-effigy-3', 2),
  ('00000000-0000-0000-0000-00000000b5c5', '00000000-0000-0000-0000-00000000b0a1', 'cinder-mote', 'cinder-mote-1', 1),
  ('00000000-0000-0000-0000-00000000b5c6', '00000000-0000-0000-0000-00000000b0a1', 'cinder-cairn', 'cinder-cairn-4', 1),
  ('00000000-0000-0000-0000-00000000b5c7', '00000000-0000-0000-0000-00000000b0a1', 'brand', 'brand-3', 1),
  ('00000000-0000-0000-0000-00000000b5b1', '00000000-0000-0000-0000-00000000b0a2', 'cinder-flask', 'cinder-flask-3', 2);
insert into public.wallets (user_id, zel) values ('00000000-0000-0000-0000-00000000b0a1', 1000000);

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000b0a1","role":"authenticated"}', true);

-- Rejected stack entries consume nothing (15) -----------------------------------------------------
select throws_ok($$select public.fuse('00000000-0000-0000-0000-00000000b011', '{}',
  '{"00000000-0000-0000-0000-00000000b5c2": 3}')$$, 'P0001', null, 'an overdrawn stack is rejected');
select throws_ok($$select public.fuse('00000000-0000-0000-0000-00000000b011', '{}',
  '{"00000000-0000-0000-0000-00000000b5b1": 1}')$$, '22023', null, 'another player''s stack is rejected');
select throws_ok($$select public.fuse('00000000-0000-0000-0000-00000000b011', '{}',
  '{"00000000-0000-0000-0000-00000000b5c7": 1}')$$, '22023', null, 'a non-stackable unit''s stack is rejected');
select throws_ok($$select public.fuse('00000000-0000-0000-0000-00000000b011', '{}',
  '{"00000000-0000-0000-0000-00000000b5ff": 1}')$$, '22023', null, 'a missing stack is rejected');
select throws_ok($$select public.fuse('00000000-0000-0000-0000-00000000b011',
  array['00000000-0000-0000-0000-00000000b0f1']::uuid[], '{"00000000-0000-0000-0000-00000000b5c1": 5}')$$,
  '22023', null, 'rows plus stacked copies above five are rejected');
select throws_ok($$select public.fuse('00000000-0000-0000-0000-00000000b011')$$,
  '22023', null, 'no fodder at all is rejected');
select throws_ok($$select public.fuse('00000000-0000-0000-0000-00000000b011', '{}',
  '{"00000000-0000-0000-0000-00000000b5c1": 0}')$$, '22023', null, 'a zero count is rejected');
select throws_ok($$select public.fuse('00000000-0000-0000-0000-00000000b011', '{}',
  '{"00000000-0000-0000-0000-00000000b5c1": 1.5}')$$, '22023', null, 'a fractional count is rejected');
select throws_ok($$select public.fuse('00000000-0000-0000-0000-00000000b011', '{}',
  '{"00000000-0000-0000-0000-00000000b5c1": "2"}')$$, '22023', null, 'a string count is rejected');
select throws_ok($$select public.fuse('00000000-0000-0000-0000-00000000b011', '{}', '{"cinder-flask": 1}')$$,
  '22023', null, 'a key that is not a stack id is rejected');
select throws_ok($$select public.fuse('00000000-0000-0000-0000-00000000b011', '{}', '[1]')$$,
  '22023', null, 'a non-object is rejected');
select throws_ok($$select public.fuse('00000000-0000-0000-0000-00000000b011', '{}',
  '{"00000000-0000-0000-0000-00000000b5c1": 1, "00000000-0000-0000-0000-00000000B5C1": 1}')$$,
  '22023', null, 'the same stack named twice is rejected');
select throws_ok($$select public.evolve('00000000-0000-0000-0000-00000000b0e1', '{}',
  '{"00000000-0000-0000-0000-00000000b5c4": 2, "00000000-0000-0000-0000-00000000b5c3": 1}')$$,
  '22023', null, 'an extra stacked material fails the recipe');
select throws_ok($$select public.evolve('00000000-0000-0000-0000-00000000b0e1', '{}',
  '{"00000000-0000-0000-0000-00000000b5c4": 1, "00000000-0000-0000-0000-00000000b5c3": 4}')$$,
  'P0001', null, 'an overdrawn material stack is rejected');
reset role;
select ok((select count(*) = 0 from public.unit_stack_log where user_id = '00000000-0000-0000-0000-00000000b0a1')
  and (select zel from public.wallets where user_id = '00000000-0000-0000-0000-00000000b0a1') = 1000000
  and (select sum(count) from public.owned_unit_stacks where user_id = '00000000-0000-0000-0000-00000000b0a1') = 15,
  'rejected calls changed no stack, log, or Zel');

-- Stacked copies match rows (11) ------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000b0a1","role":"authenticated"}', true);
create temporary table outcome (name text primary key, r jsonb) on commit drop;
insert into outcome select 'rows', public.fuse('00000000-0000-0000-0000-00000000b011', array[
  '00000000-0000-0000-0000-00000000b0f1', '00000000-0000-0000-0000-00000000b0f2',
  '00000000-0000-0000-0000-00000000b0f3', '00000000-0000-0000-0000-00000000b0f4',
  '00000000-0000-0000-0000-00000000b0f5']::uuid[]);
insert into outcome select 'stacks', public.fuse('00000000-0000-0000-0000-00000000b012',
  array['00000000-0000-0000-0000-00000000b0f6']::uuid[],
  '{"00000000-0000-0000-0000-00000000b5c1": 2, "00000000-0000-0000-0000-00000000b5c2": 2}');
select is((select r - 'target_id' from outcome where name = 'stacks'),
  (select r - 'target_id' from outcome where name = 'rows'),
  'three matching and two non-matching Flasks give the same fusion as rows or stacks');
select is((select r ->> 'zel_spent' || '/' || (r ->> 'fodder_consumed') from outcome where name = 'stacks'),
  '500/5', 'stacked copies each cost 100 Zel x level and count toward the five');

insert into outcome select 'dup-rows', public.fuse('00000000-0000-0000-0000-00000000b013', array[
  '00000000-0000-0000-0000-00000000b0f7', '00000000-0000-0000-0000-00000000b0f8']::uuid[]);
insert into outcome select 'dup-stacks', public.fuse('00000000-0000-0000-0000-00000000b014', '{}',
  '{"00000000-0000-0000-0000-00000000b5c3": 2}');
select is((select r - 'target_id' from outcome where name = 'dup-stacks'),
  (select r - 'target_id' from outcome where name = 'dup-rows'),
  'stacked copies of the target''s own unit count as duplicates, like rows');
select is((select (r ->> 'bb_level')::int from outcome where name = 'dup-stacks'), 10,
  'two stacked duplicates give +20 burst levels, BB first');

insert into outcome select 'uuid-only', public.fuse(p_target => '00000000-0000-0000-0000-00000000b015',
  p_fodder => array['00000000-0000-0000-0000-00000000b0f9']::uuid[]);
select is((select r ->> 'exp_gained' from outcome where name = 'uuid-only'), '1506',
  'a named uuid[]-only call still fuses');

insert into outcome select 'evo-rows', public.evolve('00000000-0000-0000-0000-00000000b0e1', array[
  '00000000-0000-0000-0000-00000000b0d1', '00000000-0000-0000-0000-00000000b0d2']::uuid[]);
insert into outcome select 'evo-stacks', public.evolve('00000000-0000-0000-0000-00000000b0e2', '{}',
  '{"00000000-0000-0000-0000-00000000b5c4": 1, "00000000-0000-0000-0000-00000000b5c3": 1}');
select is((select r - 'unit_id' from outcome where name = 'evo-stacks'),
  (select r - 'unit_id' from outcome where name = 'evo-rows'),
  'an evolution from stacked materials matches one from rows');
insert into outcome select 'evo-mixed', public.evolve('00000000-0000-0000-0000-00000000b0e3', array[
  '00000000-0000-0000-0000-00000000b0d3', '00000000-0000-0000-0000-00000000b0d4']::uuid[],
  '{"00000000-0000-0000-0000-00000000b5c5": 1, "00000000-0000-0000-0000-00000000b5c6": 1, "00000000-0000-0000-0000-00000000b5c4": 1}');
select is((select r from outcome where name = 'evo-mixed'),
  '{"unit_id":"00000000-0000-0000-0000-00000000b0e3","from_form_id":"brand-4","form_id":"brand-5","level":1,"exp":0,"zel_spent":200000,"materials_consumed":5,"items":[]}'::jsonb,
  'a row and a stacked copy together fill a recipe count of two');
reset role;

select results_eq($$select unit_id, count from public.owned_unit_stacks
    where user_id = '00000000-0000-0000-0000-00000000b0a1' order by id$$,
  $$values ('cinder-flask'::text, 3), ('rill-flask'::text, 0), ('cinder-sprite'::text, 0),
    ('cinder-effigy'::text, 0), ('cinder-mote'::text, 0), ('cinder-cairn'::text, 0), ('brand'::text, 1)$$,
  'each spend left the stack short by exactly its count');
select set_eq($$select unit_id, delta, count_after, reason, ref_id from public.unit_stack_log
    where user_id = '00000000-0000-0000-0000-00000000b0a1' $$,
  $$values
    ('cinder-flask'::text, -2, 3, 'fusion'::text, '00000000-0000-0000-0000-00000000b012'::uuid),
    ('rill-flask'::text, -2, 0, 'fusion'::text, '00000000-0000-0000-0000-00000000b012'::uuid),
    ('cinder-sprite'::text, -2, 1, 'fusion'::text, '00000000-0000-0000-0000-00000000b014'::uuid),
    ('cinder-effigy'::text, -1, 1, 'evolution'::text, '00000000-0000-0000-0000-00000000b0e2'::uuid),
    ('cinder-sprite'::text, -1, 0, 'evolution'::text, '00000000-0000-0000-0000-00000000b0e2'::uuid),
    ('cinder-cairn'::text, -1, 0, 'evolution'::text, '00000000-0000-0000-0000-00000000b0e3'::uuid),
    ('cinder-effigy'::text, -1, 0, 'evolution'::text, '00000000-0000-0000-0000-00000000b0e3'::uuid),
    ('cinder-mote'::text, -1, 0, 'evolution'::text, '00000000-0000-0000-0000-00000000b0e3'::uuid)$$,
  'every stack spend is logged against the fused or evolved unit');
select is((select zel from public.wallets where user_id = '00000000-0000-0000-0000-00000000b0a1'),
  (1000000 - 500 - 500 - 200 - 200 - 100 - 100000 - 100000 - 200000)::bigint,
  'Zel matches rows for every fusion and evolution');
select is((select count(*)::int from public.owned_units where user_id = '00000000-0000-0000-0000-00000000b0a1'),
  8, 'every fodder and material row was consumed; the targets remain');

select * from finish();
rollback;
