-- M4-03K: seeded-content gate on the Trial 2 first clear, final-wave rare toad parity with
-- @bfr/data dungeonWaves, and guaranteed rare-toad captures at settlement.
begin;
select plan(12);
select is((select count(*)::int from public.content_items where kind = 'stage'
  and data -> 'dungeon' ->> 'series' = 'toads'
  and data -> 'dungeon' ->> 'gate' = 'trial-02-master-ozric'
  and data -> 'dungeon' -> 'dailyLimit' is null), 1, 'one toad stage on the Trial 2 gate, no daily limit');
select is((select data -> 'dungeon' -> 'finalSpawns' from public.content_items
  where kind = 'stage' and id = 'dungeon-lantern-toad'),
  '[{"enemy":"dg-matriarch-toad","replaces":"dg-lantern-toad","rateBp":1000},
    {"enemy":"dg-regent-toad","replaces":"dg-lantern-toad","rateBp":2000}]'::jsonb,
  'Matriarch 10% then Regent 20% bands');

create temporary table toad_stage as select data from public.content_items
where kind = 'stage' and id = 'dungeon-lantern-toad';
select is((select array_agg(public.dungeon_waves(data, seed) -> 2 -> 'enemies' -> 1 ->> 'enemy'
  order by seed) from toad_stage, unnest(array[0,999,1000,2999,3000,20999]::bigint[]) seed),
  array['dg-matriarch-toad','dg-matriarch-toad','dg-regent-toad','dg-regent-toad',
    'dg-lantern-toad','dg-matriarch-toad'],
  'band edges match TypeScript and only the final-wave Lantern is replaced');
select is((select public.dungeon_waves(data, 1000) -> 0 from toad_stage),
  (select data -> 'waves' -> 0 from toad_stage), 'earlier waves are untouched');
select is(public.dungeon_waves((select data from toad_stage), 3000),
  (select data -> 'waves' from toad_stage), '30% boundary spawns nothing');

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000ac01', 'toad@example.test');
insert into public.owned_units (id, user_id, unit_id, form_id) values
  ('00000000-0000-0000-0000-00000000ac02', '00000000-0000-0000-0000-00000000ac01', 'brand', 'brand-3');
insert into public.squads (user_id, slot, unit_ids, leader_index) values
  ('00000000-0000-0000-0000-00000000ac01', 0, array['00000000-0000-0000-0000-00000000ac02']::uuid[], 0);
insert into public.quest_progress (user_id, stage_id) values
  ('00000000-0000-0000-0000-00000000ac01', 'trial-01-captain-locke');
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000ac01","role":"authenticated"}', true);
select throws_ok($$select public.start_battle('dungeon-lantern-toad')$$,
  '22023', 'start_battle: this dungeon is still locked', 'Trial 1 alone does not open the toads');
reset role;
insert into public.quest_progress (user_id, stage_id) values
  ('00000000-0000-0000-0000-00000000ac01', 'trial-02-master-ozric');
set local role authenticated;
select is((public.start_battle('dungeon-lantern-toad')).stage_id, 'dungeon-lantern-toad',
  'the Trial 2 first clear opens the series');
reset role;

-- Refuse probabilistic Lantern captures: only the final-wave slot can grant a toad.
update public.content_items set data = jsonb_set(data, '{drops,capture,rate}', '0')
where kind = 'enemy' and id = 'dg-lantern-toad';
insert into public.battle_sessions (id, user_id, stage_id, seed, squad, content_version, expires_at)
select ('00000000-0000-0000-0000-00000000ac1' || n)::uuid,
  '00000000-0000-0000-0000-00000000ac01', 'dungeon-lantern-toad',
  case n when 1 then 0 when 2 then 1000 else 3000 end,
  '{}', (select version from public.content_version), now() + interval '1 hour'
from generate_series(1,3) n;
set local role service_role;
select is((select array_agg(u ->> 'unit_id') from jsonb_array_elements(public.grant_battle_rewards(
  '00000000-0000-0000-0000-00000000ac11') -> 'units') u), array['matriarch-toad'],
  'a Matriarch seed captures one Matriarch Toad instead of the final Lantern');
select is((select array_agg(u ->> 'unit_id') from jsonb_array_elements(public.grant_battle_rewards(
  '00000000-0000-0000-0000-00000000ac12') -> 'units') u), array['regent-toad'],
  'a Regent seed captures one Regent Toad');
select is((select array_agg(u ->> 'unit_id') from jsonb_array_elements(public.grant_battle_rewards(
  '00000000-0000-0000-0000-00000000ac13') -> 'units') u), array['lantern-toad'],
  'otherwise the final Lantern Toad is always captured');
reset role;
select is((select count(*)::int from public.owned_unit_stacks
  where user_id = '00000000-0000-0000-0000-00000000ac01'
  and unit_id in ('lantern-toad', 'regent-toad', 'matriarch-toad') and count = 1), 3,
  'each toad lands in its stack');
select ok(not exists (select 1 from public.owned_unit_stacks
  where user_id = '00000000-0000-0000-0000-00000000ac01' and count > 1), 'no extra captures');
select * from finish();
rollback;
