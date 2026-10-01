-- M4-01A: fuse applies the RESOLVED-57 fodder EXP table, element bonus, level caps, and Zel cost,
-- and consumes fodder atomically. Uses the seeded unit content (brand, maren, aurelle, vessels).
begin;
select plan(57);

-- fuse's success roll (M4-06C) comes from fusion_roll. Within this rolled-back test it reads a
-- test-only setting (default 0 = Success), so each case below chooses its roll.
create or replace function public.fusion_roll()
returns integer language sql volatile set search_path = '' as $$
  select coalesce(nullif(current_setting('bfr.test_fusion_roll', true), '')::integer, 0)
$$;

-- Privileges --------------------------------------------------------------------------------------
select ok(has_function_privilege('authenticated', 'public.fuse(uuid, uuid[], jsonb)', 'execute'),
  'authenticated may call fuse');
select ok(not has_function_privilege('anon', 'public.fuse(uuid, uuid[], jsonb)', 'execute'),
  'anon may not call fuse');
select ok((select prosecdef from pg_proc where oid = 'public.fuse(uuid, uuid[], jsonb)'::regprocedure),
  'fuse is security definer');
select ok(not has_table_privilege('authenticated', 'public.level_exp_curves', 'select'),
  'clients cannot read the curve table directly');

-- Curve anchors (GAME_DESIGN §6 → Level EXP and fusion) --------------------------------------------
select is(public.level_exp_total(10::smallint, 40), 97408::bigint, 'base 10 total to level 40');
select is(public.level_exp_total(10::smallint, 150), 2782165::bigint, 'base 10 total to level 150');
select is(public.level_exp_total(21::smallint, 120), 3174957::bigint, 'base 21 total to level 120');
select is(public.level_exp_total(21::smallint, 150), 5557940::bigint, 'base 21 total to level 150');

-- Fixtures ----------------------------------------------------------------------------------------
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000fa', 'fuse-a@example.test'),
  ('00000000-0000-0000-0000-0000000000fb', 'fuse-b@example.test');

insert into public.owned_units (id, user_id, unit_id, form_id, level) values
  -- Targets
  ('00000000-0000-0000-0000-000000000f01', '00000000-0000-0000-0000-0000000000fa', 'brand', 'brand-3', 1),
  ('00000000-0000-0000-0000-000000000f02', '00000000-0000-0000-0000-0000000000fa', 'brand', 'brand-3', 1),
  ('00000000-0000-0000-0000-000000000f03', '00000000-0000-0000-0000-0000000000fa', 'brand', 'brand-3', 1),
  ('00000000-0000-0000-0000-000000000f04', '00000000-0000-0000-0000-0000000000fa', 'aurelle', 'aurelle-3', 1),
  ('00000000-0000-0000-0000-000000000f05', '00000000-0000-0000-0000-0000000000fa', 'brand', 'brand-3', 1),
  ('00000000-0000-0000-0000-000000000f06', '00000000-0000-0000-0000-0000000000fa', 'brand', 'brand-omni', 1),
  ('00000000-0000-0000-0000-000000000f07', '00000000-0000-0000-0000-0000000000fa', 'brand', 'brand-2', 1),
  -- Fodder
  ('00000000-0000-0000-0000-000000000f11', '00000000-0000-0000-0000-0000000000fa', 'cinder-flask', 'cinder-flask-3', 1),
  ('00000000-0000-0000-0000-000000000f12', '00000000-0000-0000-0000-0000000000fa', 'rill-flask', 'rill-flask-3', 1),
  ('00000000-0000-0000-0000-000000000f13', '00000000-0000-0000-0000-0000000000fa', 'maren', 'maren-3', 40),
  ('00000000-0000-0000-0000-000000000f14', '00000000-0000-0000-0000-0000000000fa', 'silver-crucible', 'silver-crucible-3', 1),
  ('00000000-0000-0000-0000-000000000f21', '00000000-0000-0000-0000-0000000000fa', 'cinder-flask', 'cinder-flask-3', 1),
  ('00000000-0000-0000-0000-000000000f22', '00000000-0000-0000-0000-0000000000fa', 'cinder-flask', 'cinder-flask-3', 1),
  ('00000000-0000-0000-0000-000000000f23', '00000000-0000-0000-0000-0000000000fa', 'cinder-flask', 'cinder-flask-3', 1),
  ('00000000-0000-0000-0000-000000000f24', '00000000-0000-0000-0000-0000000000fa', 'cinder-flask', 'cinder-flask-3', 1),
  ('00000000-0000-0000-0000-000000000f25', '00000000-0000-0000-0000-0000000000fa', 'cinder-flask', 'cinder-flask-3', 1),
  ('00000000-0000-0000-0000-000000000f31', '00000000-0000-0000-0000-0000000000fa', 'cinder-alembic', 'cinder-alembic-4', 1),
  ('00000000-0000-0000-0000-000000000f32', '00000000-0000-0000-0000-0000000000fa', 'cinder-athanor', 'cinder-athanor-5', 1),
  ('00000000-0000-0000-0000-000000000f33', '00000000-0000-0000-0000-0000000000fa', 'cinder-grail', 'cinder-grail-5', 1),
  ('00000000-0000-0000-0000-000000000f34', '00000000-0000-0000-0000-0000000000fa', 'moss-grail', 'moss-grail-5', 1),
  ('00000000-0000-0000-0000-000000000f41', '00000000-0000-0000-0000-0000000000fa', 'cinder-grail', 'cinder-grail-5', 1),
  ('00000000-0000-0000-0000-000000000f42', '00000000-0000-0000-0000-0000000000fa', 'rill-flask', 'rill-flask-3', 1),
  ('00000000-0000-0000-0000-000000000f51', '00000000-0000-0000-0000-0000000000fa', 'rill-flask', 'rill-flask-3', 1),
  ('00000000-0000-0000-0000-000000000f52', '00000000-0000-0000-0000-0000000000fa', 'rill-flask', 'rill-flask-3', 1),
  -- Player B
  ('00000000-0000-0000-0000-000000000fb1', '00000000-0000-0000-0000-0000000000fb', 'cinder-flask', 'cinder-flask-3', 1);

-- f52 sits in a squad; the Zel budget covers exactly the successful fusions below (2,600).
insert into public.squads (user_id, slot, unit_ids, leader_index) values
  ('00000000-0000-0000-0000-0000000000fa', 0, array['00000000-0000-0000-0000-000000000f52']::uuid[], 0);
insert into public.wallets (user_id, zel) values ('00000000-0000-0000-0000-0000000000fa', 2600);

-- Player A ----------------------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000fa","role":"authenticated"}', true);

-- Invalid fusions are rejected and change nothing (7)
select throws_ok($$select public.fuse('00000000-0000-0000-0000-000000000f01', '{}'::uuid[])$$,
  '22023', null, 'no fodder is rejected');
select throws_ok($$select public.fuse('00000000-0000-0000-0000-000000000f01', array[
    '00000000-0000-0000-0000-000000000f11', '00000000-0000-0000-0000-000000000f21',
    '00000000-0000-0000-0000-000000000f22', '00000000-0000-0000-0000-000000000f23',
    '00000000-0000-0000-0000-000000000f24', '00000000-0000-0000-0000-000000000f25']::uuid[])$$,
  '22023', null, 'six fodder units are rejected');
select throws_ok($$select public.fuse('00000000-0000-0000-0000-000000000f01', array[
    '00000000-0000-0000-0000-000000000f11', '00000000-0000-0000-0000-000000000f11']::uuid[])$$,
  '22023', null, 'a repeated fodder unit is rejected');
select throws_ok($$select public.fuse('00000000-0000-0000-0000-000000000f01', array[
    '00000000-0000-0000-0000-000000000f11', null]::uuid[])$$,
  '22023', null, 'a null fodder id is rejected');
select throws_ok($$select public.fuse('00000000-0000-0000-0000-000000000f01', array[
    '00000000-0000-0000-0000-000000000f01']::uuid[])$$,
  '22023', null, 'the target cannot be its own fodder');
select throws_ok($$select public.fuse('00000000-0000-0000-0000-000000000f01', array[
    '00000000-0000-0000-0000-000000000fb1']::uuid[])$$,
  '22023', null, 'another player''s fodder is rejected');
select throws_ok($$select public.fuse('00000000-0000-0000-0000-000000000f01', array[
    '00000000-0000-0000-0000-000000000f52']::uuid[])$$,
  '22023', null, 'fodder in a squad is rejected');

-- Reference cases (GAME_DESIGN §6 → Level EXP and fusion, worked examples)
select is(public.fuse('00000000-0000-0000-0000-000000000f01', array['00000000-0000-0000-0000-000000000f11']::uuid[]),
  '{"outcome":"success","target_id":"00000000-0000-0000-0000-000000000f01","exp_gained":2259,"exp":2259,"level":9,"zel_spent":100,"bb_level":1,"sbb_level":1,"fodder_consumed":1}'::jsonb,
  'matching Flask: 2,259 EXP reaches level 9 for 100 Zel');
select is(public.fuse('00000000-0000-0000-0000-000000000f02', array['00000000-0000-0000-0000-000000000f12']::uuid[]) -> 'exp_gained',
  '1506'::jsonb, 'non-matching Flask: 1,506 EXP');
select is(public.fuse('00000000-0000-0000-0000-000000000f03', array['00000000-0000-0000-0000-000000000f13']::uuid[]) -> 'exp_gained',
  '200'::jsonb, 'ordinary Maren 3-star at level 40: 200 EXP');
select is(public.fuse('00000000-0000-0000-0000-000000000f04', array['00000000-0000-0000-0000-000000000f14']::uuid[]),
  '{"outcome":"success","target_id":"00000000-0000-0000-0000-000000000f04","exp_gained":1500,"exp":1500,"level":6,"zel_spent":100,"bb_level":1,"sbb_level":1,"fodder_consumed":1}'::jsonb,
  'matching Silver Crucible into Aurelle: 1,500 EXP on the base-21 curve');
select is(public.fuse('00000000-0000-0000-0000-000000000f05', array[
    '00000000-0000-0000-0000-000000000f21', '00000000-0000-0000-0000-000000000f22',
    '00000000-0000-0000-0000-000000000f23', '00000000-0000-0000-0000-000000000f24',
    '00000000-0000-0000-0000-000000000f25']::uuid[]),
  '{"outcome":"success","target_id":"00000000-0000-0000-0000-000000000f05","exp_gained":11295,"exp":11295,"level":17,"zel_spent":500,"bb_level":1,"sbb_level":1,"fodder_consumed":5}'::jsonb,
  'five matching Flasks: 11,295 EXP, level 17, 500 Zel');
select is(public.fuse('00000000-0000-0000-0000-000000000f06', array[
    '00000000-0000-0000-0000-000000000f31', '00000000-0000-0000-0000-000000000f32',
    '00000000-0000-0000-0000-000000000f33', '00000000-0000-0000-0000-000000000f34']::uuid[]),
  '{"outcome":"success","target_id":"00000000-0000-0000-0000-000000000f06","exp_gained":472605,"exp":472605,"level":74,"zel_spent":400,"bb_level":1,"sbb_level":1,"fodder_consumed":4}'::jsonb,
  'matching Alembic 16,518 + Athanor 77,277 + Grail 227,286 and non-matching Grail 151,524');

-- Level cap: EXP past maxLevel is lost, and a max-level target can still be fused
select is(public.fuse('00000000-0000-0000-0000-000000000f07', array['00000000-0000-0000-0000-000000000f41']::uuid[]),
  '{"outcome":"success","target_id":"00000000-0000-0000-0000-000000000f07","exp_gained":227286,"exp":4116,"level":12,"zel_spent":100,"bb_level":1,"sbb_level":1,"fodder_consumed":1}'::jsonb,
  'a Grail caps Brand 2-star at level 12 (4,116 EXP)');
select is(public.fuse('00000000-0000-0000-0000-000000000f07', array['00000000-0000-0000-0000-000000000f42']::uuid[]),
  '{"outcome":"success","target_id":"00000000-0000-0000-0000-000000000f07","exp_gained":1506,"exp":4116,"level":12,"zel_spent":1200,"bb_level":1,"sbb_level":1,"fodder_consumed":1}'::jsonb,
  'a max-level target still fuses, discarding the EXP, at 100 Zel x level 12');

-- Out of Zel: rejected atomically
select throws_ok($$select public.fuse('00000000-0000-0000-0000-000000000f01', array[
    '00000000-0000-0000-0000-000000000f51']::uuid[])$$,
  'P0001', null, 'a fusion the player cannot afford is rejected');
reset role;

-- State after the calls ------------------------------------------------------------------------------
select is((select zel from public.wallets where user_id = '00000000-0000-0000-0000-0000000000fa'),
  0::bigint, 'Zel spent exactly');
select is((select count(*)::int from public.wallet_log
    where user_id = '00000000-0000-0000-0000-0000000000fa' and reason = 'fusion' and delta < 0),
  8, 'each fusion logged one Zel debit');
select is((select sum(delta) from public.wallet_log where user_id = '00000000-0000-0000-0000-0000000000fa'),
  -2600::numeric, 'logged debits total the Zel spent');
select is((select count(*)::int from public.owned_units where id in (
    '00000000-0000-0000-0000-000000000f11', '00000000-0000-0000-0000-000000000f12',
    '00000000-0000-0000-0000-000000000f13', '00000000-0000-0000-0000-000000000f14',
    '00000000-0000-0000-0000-000000000f21', '00000000-0000-0000-0000-000000000f22',
    '00000000-0000-0000-0000-000000000f23', '00000000-0000-0000-0000-000000000f24',
    '00000000-0000-0000-0000-000000000f25', '00000000-0000-0000-0000-000000000f31',
    '00000000-0000-0000-0000-000000000f32', '00000000-0000-0000-0000-000000000f33',
    '00000000-0000-0000-0000-000000000f34', '00000000-0000-0000-0000-000000000f41',
    '00000000-0000-0000-0000-000000000f42')),
  0, 'every fodder unit of a successful fusion is consumed');
select ok(exists (select 1 from public.owned_units where id = '00000000-0000-0000-0000-000000000f51'),
  'fodder of the unaffordable fusion survives');
select ok(exists (select 1 from public.owned_units where id = '00000000-0000-0000-0000-000000000f52'),
  'fodder in a squad survives');
select ok(exists (select 1 from public.owned_units where id = '00000000-0000-0000-0000-000000000fb1'),
  'the other player''s unit survives');
select is((select level || '/' || exp from public.owned_units where id = '00000000-0000-0000-0000-000000000f01'),
  '9/2259', 'the unaffordable fusion left the target unchanged');
select is((select level || '/' || exp from public.owned_units where id = '00000000-0000-0000-0000-000000000f03'),
  '4/200', 'ordinary fodder levels the target');
select is((select level || '/' || exp from public.owned_units where id = '00000000-0000-0000-0000-000000000f06'),
  '74/472605', 'Omni target persisted');

-- A row granted above level 1 with no EXP counts from its level's floor
insert into public.wallets (user_id, zel) values ('00000000-0000-0000-0000-0000000000fb', 1000);
insert into public.owned_units (id, user_id, unit_id, form_id, level) values
  ('00000000-0000-0000-0000-000000000fb2', '00000000-0000-0000-0000-0000000000fb', 'brand', 'brand-3', 9);
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000fb","role":"authenticated"}', true);
select is(public.fuse('00000000-0000-0000-0000-000000000fb2', array['00000000-0000-0000-0000-000000000fb1']::uuid[]),
  '{"outcome":"success","target_id":"00000000-0000-0000-0000-000000000fb2","exp_gained":2259,"exp":4116,"level":12,"zel_spent":900,"bb_level":1,"sbb_level":1,"fodder_consumed":1}'::jsonb,
  'a level-9 row with 0 EXP starts from 1,857 EXP');
select throws_ok($$select public.fuse('00000000-0000-0000-0000-000000000fb2', array[
    '00000000-0000-0000-0000-000000000f51']::uuid[])$$,
  '22023', null, 'player B cannot consume player A''s unit');
reset role;

-- Success rolls (M4-06C, RESOLVED-78) ----------------------------------------------------------------
select is(public.fusion_outcome(0), 'success', 'roll 0 is Success');
select is(public.fusion_outcome(8499), 'success', 'roll 8,499 is Success (85%)');
select is(public.fusion_outcome(8500), 'great', 'roll 8,500 is Great Success');
select is(public.fusion_outcome(9499), 'great', 'roll 9,499 is Great Success (10%)');
select is(public.fusion_outcome(9500), 'super', 'roll 9,500 is Super Success');
select is(public.fusion_outcome(9999), 'super', 'roll 9,999 is Super Success (5%)');
select throws_ok($$select public.fusion_outcome(10000)$$, '22023', null, 'a roll above 9,999 is rejected');
select is(public.fusion_outcome_exp(11295, 'great'), 16942::bigint, 'Great: floor(11,295 x 1.5) = 16,942');
select is(public.fusion_outcome_exp(11295, 'super'), 22590::bigint, 'Super: 11,295 x 2');
select ok(not has_function_privilege('authenticated', 'public.fusion_roll()', 'execute')
    and not has_function_privilege('authenticated', 'public.fusion_outcome(integer)', 'execute')
    and not has_function_privilege('authenticated', 'public.fusion_outcome_exp(bigint, text)', 'execute'),
  'clients cannot call the roll helpers');
select is((select count(*)::int from pg_proc where proname = 'fuse' and pronamespace = 'public'::regnamespace),
  1, 'fuse has one signature (no roll parameter)');
select ok(not has_table_privilege('authenticated', 'public.fusion_log', 'insert'),
  'clients cannot write fusion_log');

insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000fc', 'fuse-c@example.test');
insert into public.wallets (user_id, zel) values ('00000000-0000-0000-0000-0000000000fc', 200);
insert into public.owned_units (id, user_id, unit_id, form_id, level) values
  ('00000000-0000-0000-0000-000000000c01', '00000000-0000-0000-0000-0000000000fc', 'brand', 'brand-3', 1),
  ('00000000-0000-0000-0000-000000000c02', '00000000-0000-0000-0000-0000000000fc', 'brand', 'brand-3', 1),
  ('00000000-0000-0000-0000-000000000c11', '00000000-0000-0000-0000-0000000000fc', 'cinder-flask', 'cinder-flask-3', 1),
  ('00000000-0000-0000-0000-000000000c12', '00000000-0000-0000-0000-0000000000fc', 'brand', 'brand-3', 1);
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000fc","role":"authenticated"}', true);
select set_config('bfr.test_fusion_roll', '8500', true);
select is(public.fuse('00000000-0000-0000-0000-000000000c01', array['00000000-0000-0000-0000-000000000c11']::uuid[]),
  '{"outcome":"great","target_id":"00000000-0000-0000-0000-000000000c01","exp_gained":3388,"exp":3388,"level":11,"zel_spent":100,"bb_level":1,"sbb_level":1,"fodder_consumed":1}'::jsonb,
  'Great Success: a matching Flask gives floor(2,259 x 1.5) = 3,388 EXP for the same 100 Zel');
select set_config('bfr.test_fusion_roll', '9500', true);
select is(public.fuse('00000000-0000-0000-0000-000000000c02', array['00000000-0000-0000-0000-000000000c12']::uuid[])
    - 'target_id' - 'exp' - 'level',
  '{"outcome":"super","exp_gained":600,"zel_spent":100,"bb_level":10,"sbb_level":1,"fodder_consumed":1}'::jsonb,
  'Super Success doubles duplicate EXP (300 -> 600) but not its +10 burst levels');
reset role;
select set_config('bfr.test_fusion_roll', '', true);
select is((select level || '/' || exp || '/' || bb_level || '/' || sbb_level from public.owned_units
    where id = '00000000-0000-0000-0000-000000000c02'),
  '6/600/10/1', 'the Super Success target persisted with unchanged burst gains');
select is((select zel from public.wallets where user_id = '00000000-0000-0000-0000-0000000000fc'),
  0::bigint, 'rolled fusions cost the usual Zel');
select is((select array_agg(outcome || ':' || base_exp || ':' || exp_gained || ':' || zel_spent order by outcome)
    from public.fusion_log where user_id = '00000000-0000-0000-0000-0000000000fc'),
  array['great:2259:3388:100', 'super:300:600:100'], 'each fusion logs its outcome and EXP');
select is((select count(*)::int from public.fusion_log
    where user_id = '00000000-0000-0000-0000-0000000000fa' and outcome = 'success'),
  8, 'player A''s fusions each logged a Success row');
set local role authenticated;
select is((select count(*)::int from public.fusion_log), 2, 'a player reads only their own fusion_log rows');
reset role;
select throws_ok($$update public.fusion_log set outcome = 'super'$$, 'P0001', null, 'fusion_log is append-only');

-- Anonymous callers cannot fuse
set local role anon;
select throws_ok($$select public.fuse('00000000-0000-0000-0000-000000000f01', array[
    '00000000-0000-0000-0000-000000000f51']::uuid[])$$,
  '42501', null, 'anon cannot execute fuse');
reset role;

select * from finish();
rollback;
