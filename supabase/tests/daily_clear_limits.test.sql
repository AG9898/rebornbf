-- M4-03H: daily clear limits (RESOLVED-71, GAME_DESIGN §7 → Farming dungeons). Wins per player
-- per series per UTC day; start_battle refuses a limited series once its limit is reached.
begin;
select plan(11);

-- Fixture content (rolled back): a story gate, a two-stage series limited to 2 clears a day, and
-- an unlimited series.
insert into public.content_items (kind, id, data) values
  ('stage', 'test-limit-gate', '{"id":"test-limit-gate","story":{"chapter":99,"number":997},"waves":[]}'),
  ('stage', 'test-limit-a', '{"id":"test-limit-a","dungeon":{"series":"test-limited","gate":"test-limit-gate","dailyLimit":2},"waves":[]}'),
  ('stage', 'test-limit-b', '{"id":"test-limit-b","dungeon":{"series":"test-limited","gate":"test-limit-gate","dailyLimit":2},"waves":[]}'),
  ('stage', 'test-free', '{"id":"test-free","dungeon":{"series":"test-free","gate":"test-limit-gate"},"waves":[]}');
insert into public.content_version (singleton, version, item_count)
values (true, '0123456789abcdef', 4)
on conflict (singleton) do update set version = excluded.version;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000007a1', 'limit-a@example.test'),
  ('00000000-0000-0000-0000-0000000007a2', 'limit-b@example.test');
insert into public.owned_units (id, user_id, unit_id, form_id, level) values
  ('00000000-0000-0000-0000-0000000007b1', '00000000-0000-0000-0000-0000000007a1', 'brand', 'brand-3', 1);
insert into public.squads (user_id, slot, unit_ids, leader_index) values
  ('00000000-0000-0000-0000-0000000007a1', 0, array['00000000-0000-0000-0000-0000000007b1']::uuid[], 0);
insert into public.quest_progress (user_id, stage_id)
values ('00000000-0000-0000-0000-0000000007a1', 'test-limit-gate');

-- A finished session is a verified win; an unfinished one is a loss or an abandoned battle.
create function pg_temp.add_session(p_user uuid, p_stage text, p_finished timestamptz)
returns void language sql as $$
  insert into public.battle_sessions (user_id, stage_id, seed, squad, content_version,
                                      created_at, expires_at, finished_at)
  values (p_user, p_stage, 1, '{"leader_index":0,"units":[],"ally":null}', '0123456789abcdef',
          coalesce(p_finished, now()) - interval '5 minutes',
          coalesce(p_finished, now()) + interval '55 minutes', p_finished);
$$;

-- Losses do not count (2) ---------------------------------------------------------------------------
-- One win today, plus losses and another player's wins, which do not count.
select pg_temp.add_session('00000000-0000-0000-0000-0000000007a1', 'test-limit-a', now());
select pg_temp.add_session('00000000-0000-0000-0000-0000000007a1', 'test-limit-a', null);
select pg_temp.add_session('00000000-0000-0000-0000-0000000007a1', 'test-limit-b', null);
select pg_temp.add_session('00000000-0000-0000-0000-0000000007a2', 'test-limit-a', now());
select pg_temp.add_session('00000000-0000-0000-0000-0000000007a2', 'test-limit-a', now());

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000007a1","role":"authenticated"}', true);
select is((select (public.start_battle('test-limit-b')).stage_id), 'test-limit-b',
  'one win of two allows the series (losses and other players do not count)');
select results_eq($$select series, daily_limit, clears_today, clears_left from public.dungeon_clears_today()
                    where series like 'test-%'$$,
  $$values ('test-limited', 2, 1, 1)$$,
  'dungeon_clears_today lists the limited series with one clear left (unlimited series omitted)');
reset role;

-- The limit refuses the whole series (4) ------------------------------------------------------------
-- The second win today is on the series' other stage: the limit is per series, not per stage.
select pg_temp.add_session('00000000-0000-0000-0000-0000000007a1', 'test-limit-b', now());
set local role authenticated;
select throws_ok($$select public.start_battle('test-limit-a')$$, '22023',
  'start_battle: no clears left today for this dungeon', 'a used-up series is refused');
select throws_ok($$select public.start_battle('test-limit-b')$$, '22023',
  'start_battle: no clears left today for this dungeon', 'on every stage of the series');
select is((select (public.start_battle('test-free')).stage_id), 'test-free',
  'a series without a limit is never refused');
select results_eq($$select clears_today, clears_left from public.dungeon_clears_today()
                    where series = 'test-limited'$$,
  $$values (2, 0)$$, 'no clears are left today');
reset role;

-- 00:00 UTC resets the count (3) -----------------------------------------------------------------
-- Move today's wins to one second before today's 00:00 UTC: yesterday's wins do not count.
update public.battle_sessions
set created_at = (now() at time zone 'utc')::date::timestamp at time zone 'utc' - interval '10 minutes',
    expires_at = (now() at time zone 'utc')::date::timestamp at time zone 'utc' + interval '50 minutes',
    finished_at = (now() at time zone 'utc')::date::timestamp at time zone 'utc' - interval '1 second'
where user_id = '00000000-0000-0000-0000-0000000007a1' and finished_at is not null;
set local role authenticated;
select is((select (public.start_battle('test-limit-a')).stage_id), 'test-limit-a',
  'the series opens again after 00:00 UTC');
select results_eq($$select clears_today, clears_left from public.dungeon_clears_today()
                    where series = 'test-limited'$$,
  $$values (0, 2)$$, 'the day''s clears are back');
reset role;
-- A win at exactly 00:00 UTC counts for the new day.
update public.battle_sessions
set finished_at = (now() at time zone 'utc')::date::timestamp at time zone 'utc'
where user_id = '00000000-0000-0000-0000-0000000007a1' and finished_at is not null
  and stage_id = 'test-limit-a';
set local role authenticated;
select results_eq($$select clears_today from public.dungeon_clears_today()
                    where series = 'test-limited'$$,
  $$values (1)$$, 'a win at 00:00 UTC counts for the new day');
reset role;

-- Privileges (2) ---------------------------------------------------------------------------------
select ok(not has_function_privilege('anon', 'public.dungeon_clears_today()', 'execute'),
  'anon cannot read clears left');
select ok(not has_function_privilege('authenticated', 'public.dungeon_wins_today(uuid, text)', 'execute'),
  'players cannot call the internal win count');

select * from finish();
rollback;
