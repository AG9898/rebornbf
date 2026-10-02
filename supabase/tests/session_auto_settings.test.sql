-- M7-01_3: battle sessions freeze the player's saved Auto Battle Advance Settings.
begin;

select plan(5);

delete from public.content_items where kind = 'stage';
insert into public.content_items (kind, id, data) values
  ('stage', 'test-story-one', '{"id":"test-story-one","story":{"chapter":1,"number":1}}');
insert into public.content_version (singleton, version, item_count) values (true, '0123456789abcdef', 1)
  on conflict (singleton) do update set version = excluded.version;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000007d1', 'auto-settings@example.test');
insert into public.owned_units (id, user_id, unit_id, form_id) values
  ('00000000-0000-0000-0000-000000007d11', '00000000-0000-0000-0000-0000000007d1', 'brand', 'brand-3');
insert into public.squads (user_id, slot, unit_ids, leader_index) values
  ('00000000-0000-0000-0000-0000000007d1', 0, array['00000000-0000-0000-0000-000000007d11']::uuid[], 0);

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000007d1","role":"authenticated"}', true);

create temporary table issued (n integer, id uuid) on commit drop;

-- No settings row: the defaults ('{}') are frozen (1)
insert into issued select 1, (public.start_battle('test-story-one')).id;
select is((select auto_settings from public.battle_sessions where id = (select id from issued where n = 1)),
  '{}'::jsonb, 'a player with no settings row starts with the default auto settings');

-- Saved: the next session freezes the modes and toggles (2)
select lives_ok($$select public.save_settings(
    p_unit_auto_modes => '{"00000000-0000-0000-0000-000000007d11":"guard"}'::jsonb,
    p_sbb_priority => true, p_od_ubb_priority => true)$$, 'auto settings are saved');
insert into issued select 2, (public.start_battle('test-story-one')).id;
select is((select auto_settings from public.battle_sessions where id = (select id from issued where n = 2)),
  '{"unit_auto_modes":{"00000000-0000-0000-0000-000000007d11":"guard"},"sbb_priority":true,
    "forced_bb_priority":false,"od_ubb_priority":true}'::jsonb,
  'the next session freezes the per-unit modes and the toggles');

-- Changed mid-battle: the issued session keeps its copy; a new one has the new values (2)
select public.save_settings(p_unit_auto_modes => '{}'::jsonb, p_sbb_priority => false);
select is((select auto_settings -> 'unit_auto_modes' from public.battle_sessions
    where id = (select id from issued where n = 2)),
  '{"00000000-0000-0000-0000-000000007d11":"guard"}'::jsonb,
  'changing the settings does not change an issued session');
insert into issued select 3, (public.start_battle('test-story-one')).id;
select is((select auto_settings from public.battle_sessions where id = (select id from issued where n = 3)),
  '{"unit_auto_modes":{},"sbb_priority":false,"forced_bb_priority":false,"od_ubb_priority":true}'::jsonb,
  'a session after the change freezes the new values');

select * from finish();
rollback;
