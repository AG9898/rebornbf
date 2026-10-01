-- M3-04B: start_battle issues caller-owned, expiring sessions with a server-rolled seed.
begin;

select plan(36);

-- Fixture content: two story stages and one non-story stage, replacing whatever is seeded (all
-- rolled back), so the test does not depend on the live chapter content.
delete from public.content_items where kind = 'stage';
insert into public.content_items (kind, id, data) values
  ('stage', 'test-story-one', '{"id":"test-story-one","story":{"chapter":1,"number":1}}'),
  ('stage', 'test-story-two', '{"id":"test-story-two","story":{"chapter":1,"number":2}}'),
  ('stage', 'test-side-stage', '{"id":"test-side-stage"}');
insert into public.content_version (singleton, version, item_count) values (true, '0123456789abcdef', 3)
  on conflict (singleton) do update set version = excluded.version;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000006a', 'battle-a@example.test'),
  ('00000000-0000-0000-0000-00000000006b', 'battle-b@example.test');

-- Explicit type rolls (M3-01D) so the snapshot is deterministic; the Omni ally stores no roll.
insert into public.owned_units (id, user_id, unit_id, form_id, level, unit_type) values
  ('00000000-0000-0000-0000-0000000006a1', '00000000-0000-0000-0000-00000000006a', 'brand', 'brand-3', 1,
    '{"type": "lord", "gains": {"hp": 0, "atk": 0, "def": 0, "rec": 0}}'),
  ('00000000-0000-0000-0000-0000000006a2', '00000000-0000-0000-0000-00000000006a', 'maren', 'maren-3', 4,
    '{"type": "anima", "gains": {"hp": 7, "atk": 0, "def": 0, "rec": -2}}'),
  ('00000000-0000-0000-0000-0000000006a3', '00000000-0000-0000-0000-00000000006a', 'rook', 'rook-omni', 1,
    null);
insert into public.owned_units (id, user_id, unit_id, form_id, level) values
  ('00000000-0000-0000-0000-0000000006b1', '00000000-0000-0000-0000-00000000006b', 'brand', 'brand-3', 1);

insert into public.squads (user_id, slot, unit_ids, leader_index) values
  ('00000000-0000-0000-0000-00000000006a', 0,
    array['00000000-0000-0000-0000-0000000006a2', '00000000-0000-0000-0000-0000000006a1']::uuid[], 1),
  ('00000000-0000-0000-0000-00000000006a', 1, '{}'::uuid[], 0),
  ('00000000-0000-0000-0000-00000000006b', 0,
    array['00000000-0000-0000-0000-0000000006b1']::uuid[], 0);

-- Privileges (6) ---------------------------------------------------------------------------------
select ok(has_function_privilege('authenticated', 'public.start_battle(text, smallint, text, jsonb)', 'execute'),
  'authenticated may call start_battle');
select ok(not has_function_privilege('anon', 'public.start_battle(text, smallint, text, jsonb)', 'execute'),
  'anon may not call start_battle');
select ok((select prosecdef from pg_proc where oid = 'public.start_battle(text, smallint, text, jsonb)'::regprocedure),
  'start_battle is security definer');
select ok(not has_table_privilege('authenticated', 'public.battle_sessions', 'insert'),
  'authenticated may not insert sessions');
select ok(not has_table_privilege('authenticated', 'public.battle_sessions', 'update'),
  'authenticated may not update sessions');
select ok(not has_table_privilege('anon', 'public.battle_sessions', 'select'),
  'anon may not read sessions');

-- Player A ---------------------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000006a","role":"authenticated"}', true);

-- Rejections (5)
select throws_ok($$select public.start_battle('no-such-stage')$$,
  '22023', null, 'an unknown stage is rejected');
select throws_ok($$select public.start_battle('test-side-stage')$$,
  '22023', null, 'a stage outside the story is rejected');
select throws_ok($$select public.start_battle('test-story-two')$$,
  '22023', null, 'a stage whose previous story stage is not cleared is rejected');
select throws_ok($$select public.start_battle('test-story-one', 1::smallint)$$,
  '22023', null, 'an empty squad slot is rejected');
select throws_ok($$select public.start_battle('test-story-one', 5::smallint)$$,
  '22023', null, 'a squad slot with no saved squad is rejected');

-- A session for the first stage (10)
select lives_ok($$select public.start_battle('test-story-one', 0::smallint, '00000000-0000-0000-0000-0000000006a3')$$, 'the first story stage starts with a per-run ally');
select is((select count(*)::int from public.battle_sessions), 1, 'one session was recorded');
select is((select user_id from public.battle_sessions), '00000000-0000-0000-0000-00000000006a'::uuid,
  'the session belongs to the caller');
select is((select stage_id from public.battle_sessions), 'test-story-one', 'the session names the stage');
select ok((select seed between 0 and 4294967295 from public.battle_sessions), 'the seed is a 32-bit value');
select is((select content_version from public.battle_sessions), '0123456789abcdef',
  'the session records the content version');
select is((select expires_at - created_at from public.battle_sessions), interval '1 hour',
  'the session expires an hour after it starts');
select ok((select finished_at is null from public.battle_sessions), 'the session is not finished');
select is((select squad from public.battle_sessions),
  '{"leader_index": 1, "units": [
     {"owned_unit_id": "00000000-0000-0000-0000-0000000006a2", "unit_id": "maren", "form_id": "maren-3", "level": 4,
      "bb_level": 1, "sbb_level": 1, "unit_type": {"type": "anima", "gains": {"hp": 7, "atk": 0, "def": 0, "rec": -2}}},
     {"owned_unit_id": "00000000-0000-0000-0000-0000000006a1", "unit_id": "brand", "form_id": "brand-3", "level": 1,
      "bb_level": 1, "sbb_level": 1, "unit_type": {"type": "lord", "gains": {"hp": 0, "atk": 0, "def": 0, "rec": 0}}}],
    "ally": {"owned_unit_id": "00000000-0000-0000-0000-0000000006a3", "unit_id": "rook", "form_id": "rook-omni", "level": 1,
      "bb_level": 1, "sbb_level": 1, "unit_type": null}}'::jsonb,
  'the squad snapshot keeps squad order, leader, levels, type rolls, and the ally');
select is((select (public.start_battle('test-story-one')).stage_id), 'test-story-one',
  'start_battle returns the new session row');

-- Per-quest allies: none, any owned unit (including a squad member), or a pool guest.
select is((public.start_battle('test-story-one', 0::smallint, null)).squad -> 'ally',
  'null'::jsonb, 'explicit null starts without an ally');
select is((public.start_battle('test-story-one')).squad -> 'ally',
  'null'::jsonb, 'an omitted ally does not reuse the previous run choice');
select is((public.start_battle('test-story-one', 0::smallint, '00000000-0000-0000-0000-0000000006a1')).squad -> 'ally' ->> 'owned_unit_id',
  '00000000-0000-0000-0000-0000000006a1', 'a squad member can also be the duplicate ally');
select throws_ok($$select public.start_battle('test-story-one', 0::smallint, '00000000-0000-0000-0000-0000000006b1')$$,
  '22023', null, 'a foreign ally is refused');
select throws_ok($$select public.start_battle('test-story-one', 0::smallint, '00000000-0000-0000-0000-000000000fff')$$,
  '22023', null, 'an unknown owned ally is refused');
select throws_ok($$select public.start_battle('test-story-one', 0::smallint, 'brand')$$,
  '22023', null, 'a content unit outside the guest pool is refused');
select throws_ok($$select public.start_battle('test-story-one', 0::smallint, '')$$,
  '22023', null, 'empty text is not a no-ally choice');
select throws_ok($$select public.start_battle('test-story-one', 0::smallint, 'not-a-uuid')$$,
  '22023', null, 'malformed ally input is refused with a player validation error');

-- The client cannot write or re-seed a session (2)
select throws_ok($$insert into public.battle_sessions (user_id, stage_id, seed, squad, content_version, expires_at)
    values ('00000000-0000-0000-0000-00000000006a', 'test-story-one', 7, '{}', '0123456789abcdef', now() + interval '1 hour')$$,
  '42501', null, 'a direct insert with a chosen seed is rejected');
select throws_ok($$update public.battle_sessions set seed = 7$$,
  '42501', null, 'a direct seed update is rejected');

-- Clearing the first stage opens the second (1)
reset role;
insert into public.quest_progress (user_id, stage_id) values ('00000000-0000-0000-0000-00000000006a', 'test-story-one');
set local role authenticated;
select lives_ok($$select public.start_battle('test-story-two')$$, 'the next stage starts once the previous is cleared');

-- Player B sees only their own sessions (2) ------------------------------------------------------
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000006b","role":"authenticated"}', true);
select is((select count(*)::int from public.battle_sessions), 0, 'another player''s sessions are invisible');
select throws_ok($$select public.start_battle('test-story-two')$$,
  '22023', null, 'another player''s clears do not unlock stages');

-- Signed out (1) ---------------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"role":"authenticated"}', true);
select throws_ok($$select public.start_battle('test-story-one')$$,
  '42501', null, 'a caller with no user id is rejected');

-- Unseeded content (1) ---------------------------------------------------------------------------
reset role;
delete from public.content_version;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000006b","role":"authenticated"}', true);
set local role authenticated;
select throws_ok($$select public.start_battle('test-story-one')$$,
  '55000', null, 'a battle cannot start before content is seeded');

select * from finish();

rollback;
