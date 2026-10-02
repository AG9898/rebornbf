-- M7-01_2: battle sessions freeze the player's saved spark assist setting.
begin;

select plan(7);

delete from public.content_items where kind = 'stage';
insert into public.content_items (kind, id, data) values
  ('stage', 'test-story-one', '{"id":"test-story-one","story":{"chapter":1,"number":1}}');
insert into public.content_version (singleton, version, item_count) values (true, '0123456789abcdef', 1)
  on conflict (singleton) do update set version = excluded.version;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000007c1', 'spark-assist@example.test');
insert into public.owned_units (id, user_id, unit_id, form_id) values
  ('00000000-0000-0000-0000-000000007c11', '00000000-0000-0000-0000-0000000007c1', 'brand', 'brand-3');
insert into public.squads (user_id, slot, unit_ids, leader_index) values
  ('00000000-0000-0000-0000-0000000007c1', 0, array['00000000-0000-0000-0000-000000007c11']::uuid[], 0);

select ok(not has_function_privilege('authenticated',
    'public.battle_sessions_snapshot_settings()', 'execute'),
  'clients cannot call the snapshot trigger function');

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000007c1","role":"authenticated"}', true);

-- No settings row: the default (off) is frozen (2)
create temporary table issued (n integer, id uuid) on commit drop;
insert into issued select 1, (public.start_battle('test-story-one')).id;
select is((select count(*)::integer from public.player_settings), 0, 'the player has no settings row');
select is((select spark_assist from public.battle_sessions where id = (select id from issued where n = 1)),
  false, 'a player with no settings row starts with spark assist off');

-- Turned on: the next session freezes it (2)
select lives_ok($$select public.save_settings(p_spark_assist => true)$$, 'spark assist is saved on');
insert into issued select 2, (public.start_battle('test-story-one')).id;
select is((select spark_assist from public.battle_sessions where id = (select id from issued where n = 2)),
  true, 'the next session freezes spark assist on');

-- Turned off mid-battle: the issued session keeps its copy; a new one is off (2)
select public.save_settings(p_spark_assist => false);
select is((select spark_assist from public.battle_sessions where id = (select id from issued where n = 2)),
  true, 'changing the setting does not change an issued session');
insert into issued select 3, (public.start_battle('test-story-one')).id;
select is((select spark_assist from public.battle_sessions where id = (select id from issued where n = 3)),
  false, 'a session after turning it off is off');

select * from finish();
rollback;
