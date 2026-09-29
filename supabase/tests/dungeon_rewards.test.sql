-- M4-03B: dungeon gates in start_battle, and captures, item drops, and key items at settlement.
begin;
select plan(21);

-- Fixture content (rolled back): a story gate, a three-wave dungeon, and capture enemies whose
-- rates are 0 or 100 so every roll is certain.
insert into public.content_items (kind, id, data) values
  ('stage', 'test-gate', '{"id":"test-gate","story":{"chapter":99,"number":999},"waves":[]}'),
  ('stage', 'test-dungeon', '{"id":"test-dungeon","dungeon":{"series":"test","gate":"test-gate","keyItem":{"item":"test-key","rate":0}},"waves":[
     {"enemies":[{"enemy":"test-mote-sure"},{"enemy":"test-mote-never"}]},
     {"enemies":[{"enemy":"test-mote-never"}]},
     {"enemies":[{"enemy":"test-mote-never","capture":"always"}]}]}'),
  ('enemy', 'test-mote-sure', '{"drops":{"capture":{"unit":"test-unit-a","rate":100},"items":[{"item":"test-potion","rate":100}]}}'),
  ('enemy', 'test-mote-never', '{"drops":{"capture":{"unit":"test-unit-b","rate":0},"items":[{"item":"test-potion","rate":0}]}}'),
  ('unit', 'test-unit-a', '{"id":"test-unit-a","forms":[{"id":"test-unit-a-1"}]}'),
  ('unit', 'test-unit-b', '{"id":"test-unit-b","forms":[{"id":"test-unit-b-1"}]}'),
  ('item', 'test-key', '{"id":"test-key","kind":"material"}'),
  ('item', 'test-potion', '{"id":"test-potion"}');
insert into public.content_version (singleton, version, item_count)
values (true, '0123456789abcdef', 8)
on conflict (singleton) do update set version = excluded.version;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000009a', 'dungeon-a@example.test');
insert into public.owned_units (id, user_id, unit_id, form_id, level) values
  ('00000000-0000-0000-0000-0000000009a1', '00000000-0000-0000-0000-00000000009a', 'brand', 'brand-3', 1);
insert into public.squads (user_id, slot, unit_ids, leader_index) values
  ('00000000-0000-0000-0000-00000000009a', 0, array['00000000-0000-0000-0000-0000000009a1']::uuid[], 0);

-- start_battle gates (3) -------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000009a","role":"authenticated"}', true);
select throws_ok($$select public.start_battle('test-dungeon')$$,
  '22023', 'start_battle: this dungeon is still locked', 'a dungeon whose gate is not cleared is refused');
reset role;
insert into public.quest_progress (user_id, stage_id)
values ('00000000-0000-0000-0000-00000000009a', 'test-gate');
set local role authenticated;
select is((select (public.start_battle('test-dungeon')).stage_id), 'test-dungeon',
  'the dungeon starts once its gate is cleared');
reset role;
select ok(not has_function_privilege('service_role', 'public.roll_percent(numeric)', 'execute'),
  'the roll helper is internal');

insert into public.battle_sessions (id, user_id, stage_id, seed, squad, content_version, expires_at)
select ('00000000-0000-0000-0000-0000000009b' || n)::uuid, '00000000-0000-0000-0000-00000000009a',
  'test-dungeon', n, '{}', '0123456789abcdef', now() + interval '1 hour'
from generate_series(1, 4) as n;

-- First clear (7) --------------------------------------------------------------------------------
create temporary table first_clear on commit drop as
select public.grant_battle_rewards('00000000-0000-0000-0000-0000000009b1') as r;
select is((select r ->> 'first_clear' from first_clear), 'true', 'the first clear is reported');
select is((select r -> 'items' from first_clear), '{"test-key":1,"test-potion":1}'::jsonb,
  'the first clear grants the key item and the certain item drop');
select is((select jsonb_array_length(r -> 'units') from first_clear), 2,
  'two captures: the certain roll and the always-captured final slot');
select is((select count(*)::int from public.owned_units
  where user_id = '00000000-0000-0000-0000-00000000009a' and unit_id = 'test-unit-a'), 1,
  'the 100% capture is granted');
select is((select count(*)::int from public.owned_units
  where user_id = '00000000-0000-0000-0000-00000000009a' and unit_id = 'test-unit-b'), 1,
  'the 0% enemies in waves 1-2 are not captured, the final-wave one always is');
select is((select form_id || ':' || level from public.owned_units
  where user_id = '00000000-0000-0000-0000-00000000009a' and unit_id = 'test-unit-b'), 'test-unit-b-1:1',
  'a captured unit arrives in its first form at level 1');
select ok((select (r -> 'units' -> 0 ->> 'owned_unit_id')::uuid in (select id from public.owned_units)
  from first_clear), 'the result names the new owned unit rows');

-- Repeat clear with a 0% key item (4) ------------------------------------------------------------
set local role service_role;
select is(public.grant_battle_rewards('00000000-0000-0000-0000-0000000009b2') - 'units',
  '{"first_clear":false,"gems":0,"zel":0,"items":{"test-potion":1}}'::jsonb,
  'a repeat clear rolls the key item (0% here) and still drops items');
reset role;
select is((select count(*)::int from public.owned_units
  where user_id = '00000000-0000-0000-0000-00000000009a' and unit_id like 'test-unit-%'), 4,
  'the repeat clear captures again');
select is((select count from public.owned_items
  where user_id = '00000000-0000-0000-0000-00000000009a' and item_id = 'test-key'), 1::bigint,
  'the key item was granted once');
select is((select count from public.owned_items
  where user_id = '00000000-0000-0000-0000-00000000009a' and item_id = 'test-potion'), 2::bigint,
  'item drops stack across clears');

-- Repeat clear with a 100% key item (2) ----------------------------------------------------------
update public.content_items
set data = jsonb_set(data, '{dungeon,keyItem,rate}', '100')
where kind = 'stage' and id = 'test-dungeon';
set local role service_role;
select is(public.grant_battle_rewards('00000000-0000-0000-0000-0000000009b3') -> 'items',
  '{"test-key":1,"test-potion":1}'::jsonb, 'a successful key-item roll grants one');
reset role;
select is((select array_agg(reason order by count_after) from public.item_log
  where user_id = '00000000-0000-0000-0000-00000000009a' and item_id = 'test-key'),
  array['battle_first_clear', 'battle_drop'], 'key items are logged as first clear, then drop');

-- Missing capture content rolls everything back (5) ----------------------------------------------
delete from public.content_items where kind = 'unit' and id = 'test-unit-b';
set local role service_role;
select throws_ok($$select public.grant_battle_rewards('00000000-0000-0000-0000-0000000009b4')$$,
  '55000', null, 'a capture of unknown unit content fails');
reset role;
select ok((select finished_at is null from public.battle_sessions
  where id = '00000000-0000-0000-0000-0000000009b4'), 'the failed session stays claimable');
select is((select count(*)::int from public.owned_units
  where user_id = '00000000-0000-0000-0000-00000000009a' and unit_id like 'test-unit-%'), 6,
  'no captures from the failed grant');
select is((select count from public.owned_items
  where user_id = '00000000-0000-0000-0000-00000000009a' and item_id = 'test-potion'), 3::bigint,
  'no item drops from the failed grant');
select is((select count(*)::int from public.item_log
  where user_id = '00000000-0000-0000-0000-00000000009a'), 5, 'one log row per item grant');

select * from finish();
rollback;
