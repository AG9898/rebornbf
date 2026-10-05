-- M6-01A: trial gates in start_battle (GAME_DESIGN §5, §7 → Trials) and the seeded Trial 1.
begin;
select plan(6);

-- The seeded Trial 1 stage: two waves of Locke, gated on the chapter 1 clear (2).
select is((select data -> 'trial' from public.content_items
  where kind = 'stage' and id = 'trial-01-captain-locke'),
  '{"number":1,"gate":"story-08-beacon-hollow"}'::jsonb,
  'Trial 1 is seeded and opens on the chapter 1 clear');
select is((select jsonb_path_query_array(data, '$.waves[*].enemies[*].enemy')
  from public.content_items where kind = 'stage' and id = 'trial-01-captain-locke'),
  '["trial1-locke","trial1-locke-p2"]'::jsonb,
  'Locke is fought in two waves: Captain Locke, then his frost-berserk form');

-- Fixture content (rolled back): a story gate and a trial behind it.
insert into public.content_items (kind, id, data) values
  ('stage', 'test-trial-gate', '{"id":"test-trial-gate","story":{"chapter":99,"number":998},"waves":[]}'),
  ('stage', 'test-trial', '{"id":"test-trial","trial":{"number":99,"gate":"test-trial-gate"},"waves":[]}');
insert into public.content_version (singleton, version, item_count)
values (true, '0123456789abcdef', 2)
on conflict (singleton) do update set version = excluded.version;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000006a1', 'trial-a@example.test');
insert into public.owned_units (id, user_id, unit_id, form_id, level) values
  ('00000000-0000-0000-0000-0000000006b1', '00000000-0000-0000-0000-0000000006a1', 'brand', 'brand-3', 1);
insert into public.squads (user_id, slot, unit_ids, leader_index) values
  ('00000000-0000-0000-0000-0000000006a1', 0, array['00000000-0000-0000-0000-0000000006b1']::uuid[], 0);

-- start_battle gates (3) -------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000006a1","role":"authenticated"}', true);
select throws_ok($$select public.start_battle('test-trial')$$,
  '22023', 'start_battle: this trial is still locked', 'a trial whose gate is not cleared is refused');
select throws_ok($$select public.start_battle('trial-01-captain-locke')$$,
  '22023', 'start_battle: this trial is still locked', 'Trial 1 is locked before the chapter 1 clear');
reset role;
insert into public.quest_progress (user_id, stage_id)
values ('00000000-0000-0000-0000-0000000006a1', 'test-trial-gate');
set local role authenticated;
select is((select (public.start_battle('test-trial')).stage_id), 'test-trial',
  'the trial starts once its gate is cleared');
reset role;

-- Privileges (1) ---------------------------------------------------------------------------------
select ok(not has_function_privilege('anon', 'public.start_battle(text, smallint, text, jsonb, jsonb)', 'execute'),
  'anon cannot start battles');

select * from finish();
rollback;
