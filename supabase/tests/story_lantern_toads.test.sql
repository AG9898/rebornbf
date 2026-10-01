-- M4-04G: story first clears grant Lantern Toads into the player's stack (RESOLVED-71,
-- GAME_DESIGN §8 → Starters). Uses the seeded content: sessions carry the seeded content version.
begin;
select plan(13);

-- Seeded content (2) -----------------------------------------------------------------------------
select is((select sum((u ->> 'count')::integer)::integer
  from public.content_items c
  cross join lateral jsonb_array_elements(c.data -> 'firstClear' -> 'units') u
  where c.kind = 'stage' and c.data ? 'story' and u ->> 'unit' = 'lantern-toad'),
  108, 'story first clears grant 108 Lantern Toads in all');
select is((select jsonb_object_agg(c.data -> 'story' ->> 'number', u -> 'count')
  from public.content_items c
  cross join lateral jsonb_array_elements(c.data -> 'firstClear' -> 'units') u
  where c.kind = 'stage'),
  '{"2":18,"4":9,"6":9,"8":9,"10":18,"12":15,"14":15,"16":15}'::jsonb,
  'the toads follow the RESOLVED-71 schedule');

-- A player who picked Brand -----------------------------------------------------------------------
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000004a01', 'toads@example.test');
update public.profiles set onboarding_step = 'starter'
where id = '00000000-0000-0000-0000-000000004a01';
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000004a01"}', true);
select public.pick_starter('brand');

insert into public.battle_sessions (id, user_id, stage_id, seed, squad, content_version, expires_at)
select s.id::uuid, '00000000-0000-0000-0000-000000004a01', s.stage, 1, '{}',
  (select version from public.content_version), now() + interval '1 hour'
from (values
  ('00000000-0000-0000-0000-000000004a11', 'story-02-mistfen-crossing'),
  ('00000000-0000-0000-0000-000000004a12', 'story-02-mistfen-crossing'),
  ('00000000-0000-0000-0000-000000004a13', 'story-12-mirror-dunes'),
  ('00000000-0000-0000-0000-000000004a14', 'story-01-brightmere-outskirts')) s (id, stage);

create temporary table toad_results (n integer, reward jsonb);
grant all on toad_results to service_role;
set local role service_role;
insert into toad_results
values (1, public.grant_battle_rewards('00000000-0000-0000-0000-000000004a11'));
insert into toad_results
values (2, public.grant_battle_rewards('00000000-0000-0000-0000-000000004a12'));
insert into toad_results
values (3, public.grant_battle_rewards('00000000-0000-0000-0000-000000004a13'));
insert into toad_results
values (4, public.grant_battle_rewards('00000000-0000-0000-0000-000000004a14'));
reset role;

-- Stage 2's first clear: 18 toads with its starter (4) --------------------------------------------
select is((select reward -> 'first_clear_units' from toad_results where n = 1),
  '{"lantern-toad":18}'::jsonb, 'stage 2''s first clear reports 18 Lantern Toads');
select ok((select reward ? 'starter' from toad_results where n = 1),
  'the toads come with the stage''s starter');
select is((select delta from public.unit_stack_log
  where ref_id = '00000000-0000-0000-0000-000000004a11' and reason = 'battle_first_clear'),
  18, 'one stack log row adds the 18 toads, referencing the session');
select is((select form_id from public.unit_stack_log
  where ref_id = '00000000-0000-0000-0000-000000004a11' and reason = 'battle_first_clear'),
  'lantern-toad-3', 'the toads stack on the Lantern Toad form');

-- Replays grant nothing (2) -------------------------------------------------------------------------
select ok((select not (reward ? 'first_clear_units') and reward ->> 'first_clear' = 'false'
  from toad_results where n = 2), 'a stage 2 replay grants no toads');
select is((select count(*)::integer from public.unit_stack_log
  where ref_id = '00000000-0000-0000-0000-000000004a12' and reason = 'battle_first_clear'),
  0, 'a replay logs no first-clear stack change');

-- Chapter 2 and stages without toads (3) ------------------------------------------------------------
select is((select reward -> 'first_clear_units' from toad_results where n = 3),
  '{"lantern-toad":15}'::jsonb, 'stage 12''s first clear reports 15 Lantern Toads');
select ok((select reward ->> 'first_clear' = 'true' and not (reward ? 'first_clear_units')
  from toad_results where n = 4), 'stage 1''s first clear grants no toads');
select is((select sum(delta)::integer from public.unit_stack_log
  where user_id = '00000000-0000-0000-0000-000000004a01' and reason = 'battle_first_clear'),
  33, 'stages 2 and 12 add 33 toads to the stack');

-- A non-stackable first-clear unit rolls the claim back (2) -------------------------------------------
update public.content_items
set data = jsonb_set(data, '{firstClear,units}', '[{"unit":"brand","count":1}]')
where kind = 'stage' and id = 'story-04-rustwood-hollow';
insert into public.battle_sessions (id, user_id, stage_id, seed, squad, content_version, expires_at)
values ('00000000-0000-0000-0000-000000004a15', '00000000-0000-0000-0000-000000004a01',
  'story-04-rustwood-hollow', 1, '{}', (select version from public.content_version),
  now() + interval '1 hour');
set local role service_role;
select throws_ok($$select public.grant_battle_rewards('00000000-0000-0000-0000-000000004a15')$$,
  '55000', null, 'a non-stackable first-clear unit rejects the grant');
reset role;
select ok((select finished_at is null from public.battle_sessions
  where id = '00000000-0000-0000-0000-000000004a15'),
  'the failed grant rolls back the session claim');

select * from finish();
rollback;
