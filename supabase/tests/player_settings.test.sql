-- M7-01_1: player_settings RLS, save_settings validation, and get_settings defaults.
begin;

select plan(30);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000007a1', 'settings-a@example.test'),
  ('00000000-0000-0000-0000-0000000007b1', 'settings-b@example.test');

insert into public.owned_units (id, user_id, unit_id, form_id) values
  ('00000000-0000-0000-0000-000000007a11', '00000000-0000-0000-0000-0000000007a1', 'brand', 'brand-1'),
  ('00000000-0000-0000-0000-000000007a12', '00000000-0000-0000-0000-0000000007a1', 'maren', 'maren-1'),
  ('00000000-0000-0000-0000-000000007b11', '00000000-0000-0000-0000-0000000007b1', 'rook', 'rook-1');

-- Privileges (5) -----------------------------------------------------------------------------------
select ok(has_function_privilege('authenticated',
    'public.save_settings(boolean, smallint, smallint, smallint, boolean, jsonb, boolean, boolean, boolean)',
    'execute'), 'authenticated may call save_settings');
select ok(not has_function_privilege('anon',
    'public.save_settings(boolean, smallint, smallint, smallint, boolean, jsonb, boolean, boolean, boolean)',
    'execute'), 'anon may not call save_settings');
select ok((select prosecdef from pg_proc where oid =
    'public.save_settings(boolean, smallint, smallint, smallint, boolean, jsonb, boolean, boolean, boolean)'::regprocedure),
  'save_settings is security definer');
select ok(not has_function_privilege('anon', 'public.get_settings()', 'execute'),
  'anon may not call get_settings');
select ok(not (select prosecdef from pg_proc where oid = 'public.get_settings()'::regprocedure),
  'get_settings runs as the caller (reads through RLS)');

-- Player A: defaults with no row (2) -------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000007a1","role":"authenticated"}', true);

select is(
  (select row(spark_assist, battle_speed, music_volume, sfx_volume, reduced_motion, unit_auto_modes,
      sbb_priority, forced_bb_priority, od_ubb_priority)::text from public.get_settings()),
  row(false, 1::smallint, 50::smallint, 70::smallint, false, '{}'::jsonb, false, false, false)::text,
  'a player with no row gets the documented defaults');
select is((select count(*)::integer from public.player_settings), 0, 'get_settings does not create a row');

-- Direct writes are refused (2)
select throws_ok($$insert into public.player_settings (user_id) values ('00000000-0000-0000-0000-0000000007a1')$$,
  '42501', null, 'a client cannot insert settings directly');
select throws_ok($$update public.player_settings set battle_speed = 2$$,
  '42501', null, 'a client cannot update settings directly');

-- Invalid values are refused (10)
select throws_ok($$select public.save_settings(p_battle_speed => 3::smallint)$$,
  '22023', null, 'a battle speed of 3 is refused');
select throws_ok($$select public.save_settings(p_battle_speed => 0::smallint)$$,
  '22023', null, 'a battle speed of 0 is refused');
select throws_ok($$select public.save_settings(p_music_volume => 101::smallint)$$,
  '22023', null, 'a music volume above 100 is refused');
select throws_ok($$select public.save_settings(p_sfx_volume => (-1)::smallint)$$,
  '22023', null, 'a negative SFX volume is refused');
select throws_ok($$select public.save_settings(p_unit_auto_modes => '[]'::jsonb)$$,
  '22023', null, 'a mode map that is not an object is refused');
select throws_ok($$select public.save_settings(p_unit_auto_modes =>
    '{"00000000-0000-0000-0000-000000007a11": "heal"}'::jsonb)$$,
  '22023', null, 'an unknown mode is refused');
select throws_ok($$select public.save_settings(p_unit_auto_modes =>
    '{"00000000-0000-0000-0000-000000007a11": 1}'::jsonb)$$,
  '22023', null, 'a non-string mode is refused');
select throws_ok($$select public.save_settings(p_unit_auto_modes => '{"p0": "bb"}'::jsonb)$$,
  '22023', null, 'a key that is not a unit id is refused');
select throws_ok($$select public.save_settings(p_unit_auto_modes =>
    '{"00000000-0000-0000-0000-000000007b11": "bb"}'::jsonb)$$,
  '22023', null, 'another player''s unit is refused');
select is((select count(*)::integer from public.player_settings), 0, 'refused saves write nothing');

-- Saving (7)
select is(
  (select row(spark_assist, battle_speed, music_volume, sfx_volume, reduced_motion, unit_auto_modes,
      sbb_priority, forced_bb_priority, od_ubb_priority)::text from public.save_settings()),
  (select row(spark_assist, battle_speed, music_volume, sfx_volume, reduced_motion, unit_auto_modes,
      sbb_priority, forced_bb_priority, od_ubb_priority)::text from public.get_settings()),
  'a new row takes the same defaults get_settings documents');
select lives_ok($$select public.save_settings(p_spark_assist => true, p_battle_speed => 2::smallint,
    p_music_volume => 0::smallint, p_sfx_volume => 100::smallint, p_reduced_motion => true,
    p_unit_auto_modes => '{"00000000-0000-0000-0000-000000007a11": "ubb", "00000000-0000-0000-0000-000000007a12": "guard"}'::jsonb,
    p_sbb_priority => true, p_forced_bb_priority => true, p_od_ubb_priority => true)$$,
  'valid settings save');
select is(
  (select row(spark_assist, battle_speed, music_volume, sfx_volume, reduced_motion,
      sbb_priority, forced_bb_priority, od_ubb_priority)::text from public.get_settings()),
  row(true, 2::smallint, 0::smallint, 100::smallint, true, true, true, true)::text,
  'saved settings persist');
select is((select unit_auto_modes from public.player_settings),
  '{"00000000-0000-0000-0000-000000007a11": "ubb", "00000000-0000-0000-0000-000000007a12": "guard"}'::jsonb,
  'per-unit modes persist');
select lives_ok($$select public.save_settings(p_music_volume => 40::smallint)$$, 'a partial save succeeds');
select is((select row(music_volume, sfx_volume, spark_assist)::text from public.player_settings),
  row(40::smallint, 100::smallint, true)::text, 'a partial save keeps the other fields');
select is((select unit_auto_modes from public.save_settings(p_unit_auto_modes => '{}'::jsonb)),
  '{}'::jsonb, 'an empty map clears the per-unit modes');

-- Player B: RLS (3) -----------------------------------------------------------------------------------
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000007b1","role":"authenticated"}', true);

select is((select count(*)::integer from public.player_settings), 0, 'player B cannot read player A''s row');
select is((select music_volume from public.get_settings()), 50::smallint,
  'player B still gets the defaults');
select is((select user_id from public.save_settings(p_battle_speed => 2::smallint)),
  '00000000-0000-0000-0000-0000000007b1'::uuid, 'save_settings writes only the caller''s row');

reset role;
select is((select music_volume from public.player_settings
    where user_id = '00000000-0000-0000-0000-0000000007a1'), 40::smallint,
  'player B''s save left player A''s row untouched');

select * from finish();
rollback;
