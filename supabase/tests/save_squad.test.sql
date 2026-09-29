-- M3-03B: save_squad validates size, ownership, leader, and ally, and a saved squad reloads.
begin;

select plan(21);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000005a', 'squad-a@example.test'),
  ('00000000-0000-0000-0000-00000000005b', 'squad-b@example.test');

insert into public.owned_units (id, user_id, unit_id, form_id) values
  ('00000000-0000-0000-0000-0000000005a1', '00000000-0000-0000-0000-00000000005a', 'brand', 'brand-1'),
  ('00000000-0000-0000-0000-0000000005a2', '00000000-0000-0000-0000-00000000005a', 'maren', 'maren-1'),
  ('00000000-0000-0000-0000-0000000005a3', '00000000-0000-0000-0000-00000000005a', 'rook', 'rook-1'),
  ('00000000-0000-0000-0000-0000000005a4', '00000000-0000-0000-0000-00000000005a', 'garrick', 'garrick-1'),
  ('00000000-0000-0000-0000-0000000005a5', '00000000-0000-0000-0000-00000000005a', 'solen', 'solen-1'),
  ('00000000-0000-0000-0000-0000000005a6', '00000000-0000-0000-0000-00000000005a', 'morrick', 'morrick-1'),
  ('00000000-0000-0000-0000-0000000005b1', '00000000-0000-0000-0000-00000000005b', 'brand', 'brand-1');

-- Privileges -------------------------------------------------------------------------------------
select ok(has_function_privilege('authenticated', 'public.save_squad(smallint, uuid[], smallint, uuid)', 'execute'),
  'authenticated may call save_squad');
select ok(not has_function_privilege('anon', 'public.save_squad(smallint, uuid[], smallint, uuid)', 'execute'),
  'anon may not call save_squad');
select ok((select prosecdef from pg_proc where oid = 'public.save_squad(smallint, uuid[], smallint, uuid)'::regprocedure),
  'save_squad is security definer');

-- Player A ---------------------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000005a","role":"authenticated"}', true);

-- Invalid squads are rejected (12)
select throws_ok($$select public.save_squad(0::smallint, '{}'::uuid[], 0::smallint)$$,
  '22023', null, 'an empty squad is rejected');
select throws_ok($$select public.save_squad(0::smallint, null, 0::smallint)$$,
  '22023', null, 'a null squad is rejected');
select throws_ok($$select public.save_squad(0::smallint, array[
    '00000000-0000-0000-0000-0000000005a1', '00000000-0000-0000-0000-0000000005a2',
    '00000000-0000-0000-0000-0000000005a3', '00000000-0000-0000-0000-0000000005a4',
    '00000000-0000-0000-0000-0000000005a5', '00000000-0000-0000-0000-0000000005a6']::uuid[], 0::smallint)$$,
  '22023', null, 'a squad of six is rejected');
select throws_ok($$select public.save_squad(0::smallint, array[
    '00000000-0000-0000-0000-0000000005a1', '00000000-0000-0000-0000-0000000005a1']::uuid[], 0::smallint)$$,
  '22023', null, 'a repeated unit is rejected');
select throws_ok($$select public.save_squad(0::smallint, array[
    '00000000-0000-0000-0000-0000000005a1', '00000000-0000-0000-0000-0000000005b1']::uuid[], 0::smallint)$$,
  '22023', null, 'another player''s unit is rejected');
select throws_ok($$select public.save_squad(0::smallint, array[
    '00000000-0000-0000-0000-0000000005a1', '00000000-0000-0000-0000-000000000fff']::uuid[], 0::smallint)$$,
  '22023', null, 'an unknown unit is rejected');
select throws_ok($$select public.save_squad(0::smallint, array[
    '00000000-0000-0000-0000-0000000005a1', null]::uuid[], 0::smallint)$$,
  '22023', null, 'a null unit id is rejected');
select throws_ok($$select public.save_squad(0::smallint, array['00000000-0000-0000-0000-0000000005a1']::uuid[], 1::smallint)$$,
  '22023', null, 'a leader index past the squad is rejected');
select throws_ok($$select public.save_squad(0::smallint, array['00000000-0000-0000-0000-0000000005a1']::uuid[], (-1)::smallint)$$,
  '22023', null, 'a negative leader index is rejected');
select throws_ok($$select public.save_squad(10::smallint, array['00000000-0000-0000-0000-0000000005a1']::uuid[], 0::smallint)$$,
  '22023', null, 'a slot past 9 is rejected');
select throws_ok($$select public.save_squad(0::smallint, array['00000000-0000-0000-0000-0000000005a1']::uuid[], 0::smallint,
    '00000000-0000-0000-0000-0000000005b1'::uuid)$$,
  '22023', null, 'another player''s unit as ally is rejected');
select is((select count(*)::int from public.squads), 0, 'no squad was written by rejected calls');

-- A valid squad saves and reloads (5)
select lives_ok($$select public.save_squad(0::smallint, array[
    '00000000-0000-0000-0000-0000000005a3', '00000000-0000-0000-0000-0000000005a1',
    '00000000-0000-0000-0000-0000000005a2']::uuid[], 1::smallint,
    '00000000-0000-0000-0000-0000000005a1'::uuid)$$,
  'a valid squad with a duplicate ally saves');
select results_eq($$select unit_ids, leader_index::int, ally_unit_id from public.squads where slot = 0$$,
  $$values (array['00000000-0000-0000-0000-0000000005a3', '00000000-0000-0000-0000-0000000005a1',
    '00000000-0000-0000-0000-0000000005a2']::uuid[], 1, '00000000-0000-0000-0000-0000000005a1'::uuid)$$,
  'the saved squad reloads in order with its leader and ally');

select lives_ok($$select public.save_squad(0::smallint, array[
    '00000000-0000-0000-0000-0000000005a6']::uuid[], 0::smallint)$$,
  'saving the same slot again replaces it');
select results_eq($$select count(*)::int, max(cardinality(unit_ids)), bool_and(ally_unit_id is null) from public.squads$$,
  $$values (1, 1, true)$$, 'the slot holds only the latest squad, without an ally');

select is((select user_id from public.squads where slot = 0), '00000000-0000-0000-0000-00000000005a'::uuid,
  'the squad belongs to the caller');

-- Signed out -------------------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"role":"authenticated"}', true);
select throws_ok($$select public.save_squad(1::smallint, array['00000000-0000-0000-0000-0000000005a1']::uuid[], 0::smallint)$$,
  '42501', null, 'a caller with no user id is rejected');

select * from finish();

rollback;
