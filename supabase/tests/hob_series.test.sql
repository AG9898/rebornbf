-- M4-03I: seeded-content gate, shared daily limit, encounter parity and atomic captures.
begin;
select plan(17);
select is((select count(*)::int from public.content_items where kind = 'stage'
  and data -> 'dungeon' ->> 'series' = 'hobs'
  and data -> 'dungeon' ->> 'gate' = 'trial-01-captain-locke'
  and data -> 'dungeon' ->> 'dailyLimit' = '5'), 4, 'four hob stages share the Trial 1 gate and five clears');
select is((select data -> 'dungeon' -> 'rareSpawn' from public.content_items
  where kind = 'stage' and id = 'dungeon-vital-hob'),
  '{"enemy":"dg-grand-hob","replaces":"dg-vital-hob","rateBp":1500}'::jsonb,
  'one Grand replacement at 15% per entry');
select ok(not has_function_privilege('authenticated', 'public.dungeon_waves(jsonb,bigint)', 'execute'),
  'encounter helper is internal');

create temporary table hob_stage as select data from public.content_items
where kind = 'stage' and id = 'dungeon-vital-hob';
select is(public.dungeon_waves((select data from hob_stage), 1500),
  (select data -> 'waves' from hob_stage), '15% boundary does not spawn');
select is((select array_agg(w::int - 1 order by seed) from hob_stage,
  unnest(array[0,10000,20000]::bigint[]) seed,
  jsonb_array_elements(public.dungeon_waves(data, seed)) with ordinality as wave(value,w),
  lateral jsonb_array_elements(wave.value -> 'enemies') slot
  where slot ->> 'enemy' = 'dg-grand-hob'), array[0,1,2],
  'same known seeds as TypeScript replace in waves 1, 2 and 3');
select is((select count(*)::int from hob_stage,
  jsonb_array_elements(public.dungeon_waves(data, 10000)) wave,
  lateral jsonb_array_elements(wave -> 'enemies') slot), 8, 'replacement adds no extra enemy');

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000ab01', 'hob@example.test');
insert into public.owned_units (id, user_id, unit_id, form_id) values
  ('00000000-0000-0000-0000-00000000ab02', '00000000-0000-0000-0000-00000000ab01', 'brand', 'brand-3');
insert into public.squads (user_id, slot, unit_ids, leader_index) values
  ('00000000-0000-0000-0000-00000000ab01', 0, array['00000000-0000-0000-0000-00000000ab02']::uuid[], 0);
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000ab01","role":"authenticated"}', true);
select throws_ok($$select public.start_battle('dungeon-vital-hob')$$,
  '22023', 'start_battle: this dungeon is still locked', 'Trial 1 first clear is required');
reset role;
insert into public.quest_progress (user_id, stage_id) values
  ('00000000-0000-0000-0000-00000000ab01', 'trial-01-captain-locke');
set local role authenticated;
select is((public.start_battle('dungeon-might-hob')).stage_id, 'dungeon-might-hob', 'Trial 1 opens the series');
reset role;

-- Refuse probabilistic regular captures here: the final-wave marker must still grant one,
-- unless Grand replaced it. Grand's real 100% rate is left unchanged.
update public.content_items set data = jsonb_set(data, '{drops,capture,rate}', '0')
where kind = 'enemy' and id = 'dg-vital-hob';
insert into public.battle_sessions (id, user_id, stage_id, seed, squad, content_version, expires_at)
select ('00000000-0000-0000-0000-00000000ab1' || n)::uuid,
  '00000000-0000-0000-0000-00000000ab01', 'dungeon-vital-hob',
  case n when 1 then 0 when 2 then 10000 when 3 then 20000 else 1500 end,
  '{}', (select version from public.content_version), now() + interval '1 hour'
from generate_series(1,5) n;
set local role service_role;
select is((select count(*)::int from jsonb_array_elements(public.grant_battle_rewards(
  '00000000-0000-0000-0000-00000000ab11') -> 'units') u where u ->> 'unit_id' = 'grand-hob'),
  1, 'wave 1 Grand is guaranteed');
select is((select count(*)::int from jsonb_array_elements(public.grant_battle_rewards(
  '00000000-0000-0000-0000-00000000ab12') -> 'units') u where u ->> 'unit_id' = 'grand-hob'),
  1, 'wave 2 Grand is guaranteed');
select is((select count(*)::int from jsonb_array_elements(public.grant_battle_rewards(
  '00000000-0000-0000-0000-00000000ab13') -> 'units') u where u ->> 'unit_id' = 'grand-hob'),
  1, 'wave 3 Grand is guaranteed');
select throws_ok($$select public.grant_battle_rewards('00000000-0000-0000-0000-00000000ab11')$$,
  'P0002', 'settle_battle_items: session unavailable', 'capture cannot replay');
reset role;
select is((select count from public.owned_unit_stacks where user_id = '00000000-0000-0000-0000-00000000ab01'
  and unit_id = 'grand-hob'), 3, 'all three Grand Hobs stack');
select is((select count from public.owned_unit_stacks where user_id = '00000000-0000-0000-0000-00000000ab01'
  and unit_id = 'vital-hob'), 2, 'Grand replacing the final hob removes that regular capture');
set local role service_role;
select public.grant_battle_rewards('00000000-0000-0000-0000-00000000ab14');
reset role;
set local role authenticated;
select is((public.start_battle('dungeon-ward-hob')).stage_id, 'dungeon-ward-hob', 'other stages still open after four series wins');
reset role;
set local role service_role;
select public.grant_battle_rewards('00000000-0000-0000-0000-00000000ab15');
reset role;
set local role authenticated;
select throws_ok($$select public.start_battle('dungeon-mend-hob')$$,
  '22023', 'start_battle: no clears left today for this dungeon', 'five wins exhaust the entire series');
reset role;
select is((select count from public.owned_unit_stacks where user_id = '00000000-0000-0000-0000-00000000ab01'
  and unit_id = 'vital-hob'), 4, 'no-Grand seeds grant final-wave regular hobs');
select * from finish();
rollback;
