-- M4-02A: evolve checks max level, the form's recipe (material units and items), and Zel, then
-- consumes them and moves the unit to its next form at level 1 atomically. Uses the seeded Brand
-- line, its evolution materials, and the Crown Shard item.
begin;
select plan(36);

-- Privileges --------------------------------------------------------------------------------------
select ok(has_function_privilege('authenticated', 'public.evolve(uuid, uuid[], jsonb)', 'execute'),
  'authenticated may call evolve');
select ok(not has_function_privilege('anon', 'public.evolve(uuid, uuid[], jsonb)', 'execute'),
  'anon may not call evolve');
select ok((select prosecdef from pg_proc where oid = 'public.evolve(uuid, uuid[], jsonb)'::regprocedure),
  'evolve is security definer');

-- Fixtures ----------------------------------------------------------------------------------------
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000ea', 'evolve-a@example.test'),
  ('00000000-0000-0000-0000-0000000000eb', 'evolve-b@example.test');

insert into public.owned_units (id, user_id, unit_id, form_id, level) values
  ('00000000-0000-0000-0000-000000000e01', '00000000-0000-0000-0000-0000000000ea', 'brand', 'brand-3', 40),
  ('00000000-0000-0000-0000-000000000e02', '00000000-0000-0000-0000-0000000000ea', 'brand', 'brand-6', 100),
  ('00000000-0000-0000-0000-000000000e03', '00000000-0000-0000-0000-0000000000ea', 'brand', 'brand-3', 39),
  ('00000000-0000-0000-0000-000000000e04', '00000000-0000-0000-0000-0000000000ea', 'brand', 'brand-7', 120),
  ('00000000-0000-0000-0000-000000000e05', '00000000-0000-0000-0000-0000000000ea', 'brand', 'brand-omni', 150),
  ('00000000-0000-0000-0000-000000000e06', '00000000-0000-0000-0000-0000000000ea', 'brand', 'brand-3', 40),
  ('00000000-0000-0000-0000-000000000e11', '00000000-0000-0000-0000-0000000000ea', 'cinder-effigy', 'cinder-effigy-3', 1),
  ('00000000-0000-0000-0000-000000000e12', '00000000-0000-0000-0000-0000000000ea', 'cinder-sprite', 'cinder-sprite-2', 1),
  ('00000000-0000-0000-0000-000000000e21', '00000000-0000-0000-0000-0000000000ea', 'cinder-colossus', 'cinder-colossus-5', 1),
  ('00000000-0000-0000-0000-000000000e22', '00000000-0000-0000-0000-0000000000ea', 'prism-cairn', 'prism-cairn-5', 1),
  ('00000000-0000-0000-0000-000000000e23', '00000000-0000-0000-0000-0000000000ea', 'cinder-cairn', 'cinder-cairn-4', 1),
  ('00000000-0000-0000-0000-000000000e24', '00000000-0000-0000-0000-0000000000ea', 'cinder-effigy', 'cinder-effigy-3', 1),
  ('00000000-0000-0000-0000-000000000e31', '00000000-0000-0000-0000-0000000000ea', 'cinder-effigy', 'cinder-effigy-3', 1),
  ('00000000-0000-0000-0000-000000000e32', '00000000-0000-0000-0000-0000000000ea', 'cinder-sprite', 'cinder-sprite-2', 1),
  ('00000000-0000-0000-0000-000000000e61', '00000000-0000-0000-0000-0000000000ea', 'cinder-effigy', 'cinder-effigy-3', 1),
  ('00000000-0000-0000-0000-000000000e62', '00000000-0000-0000-0000-0000000000ea', 'cinder-sprite', 'cinder-sprite-2', 1),
  ('00000000-0000-0000-0000-000000000e63', '00000000-0000-0000-0000-0000000000ea', 'moss-effigy', 'moss-effigy-3', 1),
  ('00000000-0000-0000-0000-000000000e64', '00000000-0000-0000-0000-0000000000ea', 'cinder-sprite', 'cinder-sprite-2', 1),
  ('00000000-0000-0000-0000-000000000eb1', '00000000-0000-0000-0000-0000000000eb', 'cinder-sprite', 'cinder-sprite-2', 1),
  ('00000000-0000-0000-0000-000000000eb2', '00000000-0000-0000-0000-0000000000eb', 'brand', 'brand-6', 100),
  ('00000000-0000-0000-0000-000000000eb3', '00000000-0000-0000-0000-0000000000eb', 'cinder-colossus', 'cinder-colossus-5', 1),
  ('00000000-0000-0000-0000-000000000eb4', '00000000-0000-0000-0000-0000000000eb', 'prism-cairn', 'prism-cairn-5', 1),
  ('00000000-0000-0000-0000-000000000eb5', '00000000-0000-0000-0000-0000000000eb', 'cinder-cairn', 'cinder-cairn-4', 1),
  ('00000000-0000-0000-0000-000000000eb6', '00000000-0000-0000-0000-0000000000eb', 'cinder-effigy', 'cinder-effigy-3', 1);

-- e61 sits in a squad and e62 in its ally slot. A's Zel covers exactly the two successful
-- evolutions (100,000 + 1,500,000) and A holds one Crown Shard; B has the Zel but no shard.
insert into public.squads (user_id, slot, unit_ids, leader_index, ally_unit_id) values
  ('00000000-0000-0000-0000-0000000000ea', 0, array['00000000-0000-0000-0000-000000000e61']::uuid[], 0, '00000000-0000-0000-0000-000000000e62');
insert into public.wallets (user_id, zel) values ('00000000-0000-0000-0000-0000000000ea', 1600000), ('00000000-0000-0000-0000-0000000000eb', 1500000);
select public.grant_item('00000000-0000-0000-0000-0000000000ea', 'crown-shard', 1, 'test');

update public.owned_units set bb_level = 9, sbb_level = 7
where id = '00000000-0000-0000-0000-000000000e02';

-- Player A ----------------------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000ea","role":"authenticated"}', true);

-- Invalid evolutions are rejected and change nothing (12)
select throws_ok($$select public.evolve('00000000-0000-0000-0000-000000000e03', array['00000000-0000-0000-0000-000000000e31', '00000000-0000-0000-0000-000000000e32']::uuid[])$$,
  '22023', null, 'a unit below max level is rejected');
select throws_ok($$select public.evolve('00000000-0000-0000-0000-000000000e04', array['00000000-0000-0000-0000-000000000e31', '00000000-0000-0000-0000-000000000e32']::uuid[])$$,
  '22023', null, 'a 7-star form given the wrong Omni materials is rejected');
select throws_ok($$select public.evolve('00000000-0000-0000-0000-000000000e05', array['00000000-0000-0000-0000-000000000e31', '00000000-0000-0000-0000-000000000e32']::uuid[])$$,
  '22023', null, 'an Omni form has no next form');
select throws_ok($$select public.evolve('00000000-0000-0000-0000-000000000e06', array['00000000-0000-0000-0000-000000000e31']::uuid[])$$,
  '22023', null, 'a missing material is rejected');
select throws_ok($$select public.evolve('00000000-0000-0000-0000-000000000e06', array['00000000-0000-0000-0000-000000000e63', '00000000-0000-0000-0000-000000000e32']::uuid[])$$,
  '22023', null, 'a material of the wrong element is rejected');
select throws_ok($$select public.evolve('00000000-0000-0000-0000-000000000e06', array['00000000-0000-0000-0000-000000000e31', '00000000-0000-0000-0000-000000000e32', '00000000-0000-0000-0000-000000000e64']::uuid[])$$,
  '22023', null, 'an extra material is rejected');
select throws_ok($$select public.evolve('00000000-0000-0000-0000-000000000e06', array['00000000-0000-0000-0000-000000000e61', '00000000-0000-0000-0000-000000000e32']::uuid[])$$,
  '22023', null, 'a material in a squad is rejected');
select throws_ok($$select public.evolve('00000000-0000-0000-0000-000000000e06', array['00000000-0000-0000-0000-000000000e31', '00000000-0000-0000-0000-000000000e62']::uuid[])$$,
  '22023', null, 'a material in an ally slot is rejected');
select throws_ok($$select public.evolve('00000000-0000-0000-0000-000000000e06', array['00000000-0000-0000-0000-000000000e31', '00000000-0000-0000-0000-000000000eb1']::uuid[])$$,
  '22023', null, 'another players material is rejected');
select throws_ok($$select public.evolve('00000000-0000-0000-0000-000000000e06', array['00000000-0000-0000-0000-000000000e31', '00000000-0000-0000-0000-000000000e31']::uuid[])$$,
  '22023', null, 'a repeated material is rejected');
select throws_ok($$select public.evolve('00000000-0000-0000-0000-000000000e06', array['00000000-0000-0000-0000-000000000e06', '00000000-0000-0000-0000-000000000e31']::uuid[])$$,
  '22023', null, 'the unit cannot be its own material');
select throws_ok($$select public.evolve(null, '{}'::uuid[])$$,
  '22023', null, 'a null unit is rejected');

-- Successful evolutions (2), then out of Zel
select is(public.evolve('00000000-0000-0000-0000-000000000e01', array['00000000-0000-0000-0000-000000000e11', '00000000-0000-0000-0000-000000000e12']::uuid[]),
  '{"unit_id":"00000000-0000-0000-0000-000000000e01","from_form_id":"brand-3","form_id":"brand-4","level":1,"exp":0,"zel_spent":100000,"materials_consumed":2,"items":[]}'::jsonb,
  'Brand 3-star to 4-star: Effigy and Sprite for 100,000 Zel');
select is(public.evolve('00000000-0000-0000-0000-000000000e02', array['00000000-0000-0000-0000-000000000e21', '00000000-0000-0000-0000-000000000e22', '00000000-0000-0000-0000-000000000e23', '00000000-0000-0000-0000-000000000e24']::uuid[]),
  '{"unit_id":"00000000-0000-0000-0000-000000000e02","from_form_id":"brand-6","form_id":"brand-7","level":1,"exp":0,"zel_spent":1500000,"materials_consumed":4,"items":[{"item":"crown-shard","count":1}]}'::jsonb,
  'Brand 6-star to 7-star: four units, a Crown Shard, and 1,500,000 Zel');
select throws_ok($$select public.evolve('00000000-0000-0000-0000-000000000e06', array['00000000-0000-0000-0000-000000000e31', '00000000-0000-0000-0000-000000000e32']::uuid[])$$,
  'P0001', null, 'an evolution the player cannot afford is rejected');
reset role;

-- Player B: every unit and the Zel, but no Crown Shard ---------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000eb","role":"authenticated"}', true);
select throws_ok($$select public.evolve('00000000-0000-0000-0000-000000000eb2', array['00000000-0000-0000-0000-000000000eb3', '00000000-0000-0000-0000-000000000eb4', '00000000-0000-0000-0000-000000000eb5', '00000000-0000-0000-0000-000000000eb6']::uuid[])$$,
  '22023', null, 'a 6-star evolution without a Crown Shard is rejected');
select throws_ok($$select public.evolve('00000000-0000-0000-0000-000000000eb2', array['00000000-0000-0000-0000-000000000e31', '00000000-0000-0000-0000-000000000e32']::uuid[])$$,
  '22023', null, 'player B cannot consume player As units');
reset role;

-- State after the calls ------------------------------------------------------------------------------
select is((select zel from public.wallets where user_id = '00000000-0000-0000-0000-0000000000ea'),
  0::bigint, 'A''s Zel spent exactly');
select is((select count(*)::int from public.wallet_log
    where user_id = '00000000-0000-0000-0000-0000000000ea' and reason = 'evolution' and delta < 0),
  2, 'each evolution logged one Zel debit');
select is((select sum(delta) from public.wallet_log where user_id = '00000000-0000-0000-0000-0000000000ea' and reason = 'evolution'),
  -1600000::numeric, 'logged debits total the Zel spent');
select is((select count from public.owned_items where user_id = '00000000-0000-0000-0000-0000000000ea' and item_id = 'crown-shard'),
  0::bigint, 'the Crown Shard was consumed');
select is((select delta || '/' || count_after || '/' || ref_id from public.item_log
    where user_id = '00000000-0000-0000-0000-0000000000ea' and reason = 'evolution'),
  '-1/0/00000000-0000-0000-0000-000000000e02', 'the Crown Shard use was logged against the unit');
select is((select form_id || '/' || level || '/' || exp from public.owned_units where id = '00000000-0000-0000-0000-000000000e01'),
  'brand-4/1/0', 'the 3-star unit is now a level-1 4-star');
select is((select form_id || '/' || level || '/' || exp from public.owned_units where id = '00000000-0000-0000-0000-000000000e02'),
  'brand-7/1/0', 'the 6-star unit is now a level-1 7-star');
select is((select count(*)::int from public.owned_units where id in (
    '00000000-0000-0000-0000-000000000e11', '00000000-0000-0000-0000-000000000e12', '00000000-0000-0000-0000-000000000e21', '00000000-0000-0000-0000-000000000e22', '00000000-0000-0000-0000-000000000e23', '00000000-0000-0000-0000-000000000e24')),
  0, 'every material of a successful evolution is consumed');
select is((select count(*)::int from public.owned_units where id in (
    '00000000-0000-0000-0000-000000000e31', '00000000-0000-0000-0000-000000000e32', '00000000-0000-0000-0000-000000000e61', '00000000-0000-0000-0000-000000000e62', '00000000-0000-0000-0000-000000000e63', '00000000-0000-0000-0000-000000000e64')),
  6, 'materials of rejected evolutions survive');
select is((select form_id || '/' || level from public.owned_units where id = '00000000-0000-0000-0000-000000000e03'),
  'brand-3/39', 'the below-max unit is unchanged');
select is((select form_id || '/' || level from public.owned_units where id = '00000000-0000-0000-0000-000000000e06'),
  'brand-3/40', 'the unaffordable evolution left the unit unchanged');
select is((select zel from public.wallets where user_id = '00000000-0000-0000-0000-0000000000eb'),
  1500000::bigint, 'the refused Crown Shard evolution charged no Zel');
select is((select count(*)::int from public.owned_units where user_id = '00000000-0000-0000-0000-0000000000eb' and form_id <> 'brand-7'),
  6, 'B''s units are unchanged');

-- Anonymous callers cannot evolve
set local role anon;
select throws_ok($$select public.evolve('00000000-0000-0000-0000-000000000e06', array['00000000-0000-0000-0000-000000000e31', '00000000-0000-0000-0000-000000000e32']::uuid[])$$,
  '42501', null, 'anon cannot execute evolve');
reset role;

select is((select bb_level::integer from public.owned_units where id='00000000-0000-0000-0000-000000000e02'), 4, 'evolution halves BB with floor');
select is((select sbb_level::integer from public.owned_units where id='00000000-0000-0000-0000-000000000e02'), 3, 'evolution halves SBB with floor');
select * from finish();
rollback;
