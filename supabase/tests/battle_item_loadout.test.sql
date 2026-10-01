-- M3-04J: reservation/refund transactions, service-only settlement, loss without rewards.
begin;
select plan(33);
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000ba', 'loadout@example.test');
insert into public.owned_units (id, user_id, unit_id, form_id) values
  ('00000000-0000-0000-0000-000000000ba1', '00000000-0000-0000-0000-0000000000ba', 'brand', 'brand-3');
insert into public.squads (user_id, slot, unit_ids, leader_index) values
  ('00000000-0000-0000-0000-0000000000ba', 0, array['00000000-0000-0000-0000-000000000ba1']::uuid[], 0);
insert into public.content_items (kind, id, data) values
  ('stage', 'test-loadout', '{"story":{"number":1},"dungeon":{"series":"test-loadout"},"firstClear":{"gems":5},"waves":[]}');
select public.grant_item('00000000-0000-0000-0000-0000000000ba', 'dew-tonic', 10, 'test');
select public.grant_item('00000000-0000-0000-0000-0000000000ba', 'valor-draught', 2, 'test');
create temporary table loadout_sessions (name text, id uuid);
grant select, insert on loadout_sessions to authenticated, service_role;

select ok(not has_function_privilege('authenticated', 'public.settle_battle_loss(uuid,jsonb)', 'execute'), 'players cannot settle losses');
select ok(not has_function_privilege('anon', 'public.settle_battle_loss(uuid,jsonb)', 'execute'), 'anon cannot settle losses');
select ok(has_function_privilege('service_role', 'public.settle_battle_loss(uuid,jsonb)', 'execute'), 'service can settle losses');
select ok(not has_function_privilege('service_role', 'public.settle_battle_items(uuid,jsonb,text)', 'execute'), 'common helper is internal');
select ok(not has_function_privilege('authenticated', 'public.start_battle_without_items(text,smallint,text)', 'execute'), 'players cannot bypass reservation');
select ok(not has_function_privilege('service_role', 'public.grant_battle_rewards_without_refund(uuid)', 'execute'), 'service cannot bypass refunds');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000ba","role":"authenticated"}', true);
select throws_ok($$select public.start_battle('test-loadout', p_items := '[{"item":"valor-draught","count":3}]')$$,
  '22023', null, 'over-owned loadout refused');
select throws_ok($$select public.start_battle('test-loadout', p_items := '[{"item":"dew-tonic","count":1},{"item":"dew-tonic","count":1}]')$$,
  '22023', null, 'repeated item refused');
select throws_ok($$select public.start_battle('test-loadout', p_items := '[{"item":"dew-tonic","count":11}]')$$,
  '22023', null, 'over ten refused');
select throws_ok($$select public.start_battle('test-loadout', p_items := '[{"item":"dew-tonic","count":0}]')$$,
  '22023', null, 'zero refused');
select throws_ok($$select public.start_battle('test-loadout', p_items := '[{"item":"dew-tonic","count":1.5}]')$$,
  '22023', null, 'fraction refused');
select throws_ok($$select public.start_battle('test-loadout', p_items := '[{"item":"crown-shard","count":1}]')$$,
  '22023', null, 'material item refused');
select throws_ok($$select public.start_battle('test-loadout', p_items := '[{"item":"dew-tonic","count":1},{"item":"bright-tonic","count":1},{"item":"grand-tonic","count":1},{"item":"rekindle-ash","count":1},{"item":"valor-draught","count":1},{"item":"bitterleaf","count":1}]')$$,
  '22023', null, 'six slots refused');
select throws_ok($$select public.start_battle('test-loadout', p_items := '{}')$$,
  '22023', null, 'non-array refused');
select throws_ok($$select public.start_battle('test-loadout', p_items := '[{"item":"dew-tonic","count":2},{"item":"valor-draught","count":3}]')$$,
  '22023', null, 'later failed debit rolls back earlier debit');
select is((select count from public.owned_items where item_id = 'dew-tonic'), 10::bigint, 'failed starts spend nothing');
select is((select count(*)::integer from public.battle_sessions), 0, 'failed starts leave no session');

insert into loadout_sessions select 'win', (public.start_battle('test-loadout',
  p_items := '[{"item":"dew-tonic","count":4},{"item":"valor-draught","count":1}]')).id;
select is((select count from public.owned_items where item_id = 'dew-tonic'), 6::bigint, 'start reserves items');
select is((select items from public.battle_sessions where id = (select id from loadout_sessions where name = 'win')),
  '[{"item":"dew-tonic","count":4},{"item":"valor-draught","count":1}]'::jsonb, 'snapshot freezes IDs and counts');
select is((select sum(delta)::bigint from public.item_log where reason = 'battle_loadout' and ref_id = (select id from loadout_sessions where name = 'win')),
  (-5)::bigint, 'debits logged with session ref');
reset role;
set local role service_role;
select throws_ok($$select public.grant_battle_rewards((select id from loadout_sessions where name = 'win'), '{"dew-tonic":5}')$$,
  '22023', null, 'refund cannot exceed loadout');
select throws_ok($$select public.grant_battle_rewards((select id from loadout_sessions where name = 'win'), '{"bitterleaf":1}')$$,
  '22023', null, 'refund cannot introduce another item');
select lives_ok($$select public.grant_battle_rewards((select id from loadout_sessions where name = 'win'), '{"dew-tonic":3,"valor-draught":0}')$$,
  'win settles and refunds unused counts');
select throws_ok($$select public.grant_battle_rewards((select id from loadout_sessions where name = 'win'), '{"dew-tonic":3}')$$,
  'P0002', null, 'win cannot refund twice');
reset role;
select is((select count from public.owned_items where user_id = '00000000-0000-0000-0000-0000000000ba' and item_id = 'dew-tonic'),
  9::bigint, 'win refund keeps used tonic spent');
select is((select count(*)::integer from public.item_log where reason = 'battle_refund' and ref_id = (select id from loadout_sessions where name = 'win')),
  1, 'only positive leftover logged once');

set local role authenticated;
insert into loadout_sessions select 'loss', (public.start_battle('test-loadout', p_items := '[{"item":"dew-tonic","count":3}]')).id;
insert into loadout_sessions select 'abandoned', (public.start_battle('test-loadout', p_items := '[{"item":"dew-tonic","count":2}]')).id;
reset role;
set local role service_role;
select is(public.settle_battle_loss((select id from loadout_sessions where name = 'loss'), '{"dew-tonic":2}'), '{}'::jsonb,
  'loss settles without rewards');
select throws_ok($$select public.settle_battle_loss((select id from loadout_sessions where name = 'loss'), '{"dew-tonic":2}')$$,
  'P0002', null, 'loss cannot refund twice');
select throws_ok($$select public.grant_battle_rewards((select id from loadout_sessions where name = 'loss'), '{"dew-tonic":2}')$$,
  'P0002', null, 'settled loss cannot later claim win rewards');
reset role;
select is((select count from public.owned_items where user_id = '00000000-0000-0000-0000-0000000000ba' and item_id = 'dew-tonic'),
  6::bigint, 'loss spends one and abandoned loadout keeps two spent');
select is((select gems from public.wallets where user_id = '00000000-0000-0000-0000-0000000000ba'), 5::bigint, 'only win grants currency');
select is(public.dungeon_wins_today('00000000-0000-0000-0000-0000000000ba', 'test-loadout'), 1, 'settled loss is not a daily win');
select is((select count(*)::integer from public.item_log where reason = 'battle_refund' and ref_id = (select id from loadout_sessions where name = 'loss')),
  1, 'loss refund logged once with session ref');
select * from finish();
rollback;
