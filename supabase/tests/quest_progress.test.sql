-- M3-04A: quest_progress is readable only by its owner and never writable by clients.
begin;

select plan(8);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000004a1', 'quest-a@example.test'),
  ('00000000-0000-0000-0000-0000000004b1', 'quest-b@example.test');

insert into public.quest_progress (user_id, stage_id) values
  ('00000000-0000-0000-0000-0000000004a1', 'story-01-brightmere-outskirts'),
  ('00000000-0000-0000-0000-0000000004a1', 'story-02-mistfen-crossing'),
  ('00000000-0000-0000-0000-0000000004b1', 'story-01-brightmere-outskirts');

select ok((select relrowsecurity from pg_class where oid = 'public.quest_progress'::regclass),
  'RLS is enabled on quest_progress');
select ok(not has_table_privilege('anon', 'public.quest_progress', 'select'),
  'anon may not read quest_progress');
select throws_ok($$insert into public.quest_progress (user_id, stage_id)
    values ('00000000-0000-0000-0000-0000000004a1', 'Not A Stage')$$,
  '23514', null, 'stage_id must be a content ID');

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000004a1","role":"authenticated"}', true);

select results_eq(
  $$select stage_id from public.quest_progress order by stage_id$$,
  $$values ('story-01-brightmere-outskirts'), ('story-02-mistfen-crossing')$$,
  'a player reads only their own clears');
select throws_ok($$insert into public.quest_progress (user_id, stage_id)
    values ('00000000-0000-0000-0000-0000000004a1', 'story-03-old-kiln-road')$$,
  '42501', null, 'a player cannot record a clear');
select throws_ok($$update public.quest_progress set first_cleared_at = now()$$,
  '42501', null, 'a player cannot update a clear');
select throws_ok($$delete from public.quest_progress$$,
  '42501', null, 'a player cannot delete a clear');

reset role;
delete from auth.users where id = '00000000-0000-0000-0000-0000000004b1';
select is((select count(*)::int from public.quest_progress
    where user_id = '00000000-0000-0000-0000-0000000004b1'), 0,
  'deleting the auth user removes their clears');

select * from finish();
rollback;
