-- M3-05A: pick_starter grants one B0 starter at 3★ exactly once, logs it, saves squad slot 0, and
-- ends onboarding.
begin;

select plan(24);

-- Schema and privileges ---------------------------------------------------------------------------
select has_table('public', 'unit_log', 'unit_log exists');
select ok((select relrowsecurity from pg_class where oid = 'public.unit_log'::regclass),
  'unit_log has RLS enabled');
select ok(has_function_privilege('authenticated', 'public.pick_starter(text)', 'execute'),
  'authenticated may call pick_starter');
select ok(not has_function_privilege('anon', 'public.pick_starter(text)', 'execute'),
  'anon may not call pick_starter');
select ok((select prosecdef from pg_proc where oid = 'public.pick_starter(text)'::regprocedure),
  'pick_starter is security definer');

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000005a1', 'starter-a@example.test'),
  ('00000000-0000-0000-0000-0000000005b1', 'starter-b@example.test');

-- A is at the starter step; B is still at the tutorial step.
update public.profiles set onboarding_step = 'starter'
where id = '00000000-0000-0000-0000-0000000005a1';
update public.profiles set onboarding_step = 'tutorial'
where id = '00000000-0000-0000-0000-0000000005b1';

-- Player B: not at the starter step ------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000005b1","role":"authenticated"}', true);
select throws_ok($$select public.pick_starter('brand')$$, '55000', null,
  'pick_starter before the starter step is rejected');
select is_empty($$select 1 from public.owned_units$$, 'the early pick granted nothing');

-- Player A ---------------------------------------------------------------------------------------
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000005a1","role":"authenticated"}', true);

select throws_ok($$select public.pick_starter('aurelle')$$, '22023', null,
  'a non-starter unit is rejected');
select throws_ok($$select public.pick_starter('nope')$$, '22023', null, 'an unknown unit is rejected');
select throws_ok($$select public.pick_starter(null)$$, '22023', null, 'a null unit is rejected');
select results_eq(
  $$select onboarding_step::text from public.profiles where id = '00000000-0000-0000-0000-0000000005a1'$$,
  $$values ('starter')$$, 'rejected picks leave the step at starter');

select results_eq($$select unit_id, form_id, level from public.pick_starter('maren')$$,
  $$values ('maren'::text, 'maren-3'::text, 1)$$, 'the pick grants the starter at 3★, level 1');

select results_eq($$select count(*)::int from public.owned_units$$, $$values (1)$$,
  'exactly one unit was granted');
select isnt((select unit_type from public.owned_units where unit_id = 'maren'), null,
  'the 3★ starter got its type roll');
select results_eq(
  $$select l.owned_unit_id, l.unit_id, l.form_id, l.delta, l.reason
    from public.unit_log l$$,
  $$select o.id, 'maren'::text, 'maren-3'::text, 1::smallint, 'starter_pick'::text
    from public.owned_units o$$,
  'the grant wrote one unit_log row');
select results_eq(
  $$select s.unit_ids, s.leader_index, s.ally_unit_id from public.squads s where s.slot = 0$$,
  $$select array[o.id], 0::smallint, null::uuid from public.owned_units o$$,
  'squad slot 0 holds only the picked unit, as leader');
select results_eq(
  $$select onboarding_step::text from public.profiles where id = '00000000-0000-0000-0000-0000000005a1'$$,
  $$values ('done')$$, 'the pick ends onboarding');

-- A second pick fails and changes nothing.
select throws_ok($$select public.pick_starter('brand')$$, '55000', null, 'a second pick is rejected');
select results_eq($$select count(*)::int from public.owned_units$$, $$values (1)$$,
  'the second pick granted nothing');

-- The log is read-only to the client and append-only for everyone.
select throws_ok($$delete from public.unit_log$$, '42501', null, 'a client cannot delete unit_log');

-- Player B still sees nothing of A.
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000005b1","role":"authenticated"}', true);
select is_empty($$select 1 from public.unit_log$$, 'player B cannot read player A''s unit_log');

-- Anonymous callers ------------------------------------------------------------------------------
set local role anon;
select throws_ok($$select public.pick_starter('brand')$$, '42501', null, 'anon cannot call pick_starter');

reset role;
select throws_ok(
  $$update public.unit_log set reason = 'edited'$$, 'P0001', null, 'unit_log rows cannot be updated');

-- Deleting the account cascades through the append-only log.
delete from auth.users where id = '00000000-0000-0000-0000-0000000005a1';
select is_empty(
  $$select 1 from public.unit_log where user_id = '00000000-0000-0000-0000-0000000005a1'$$,
  'account deletion removes the account''s unit_log rows');

select * from finish();
rollback;
