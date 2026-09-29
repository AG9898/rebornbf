-- M3-06A: onboarding steps advance in order only through set_display_name and finish_tutorial.
begin;

select plan(29);

-- Schema and privileges ---------------------------------------------------------------------------
select col_not_null('public', 'profiles', 'onboarding_step', 'onboarding_step is not null');
select col_default_is('public', 'profiles', 'onboarding_step', 'name',
  'new profiles start at the name step (existing ones owning units were backfilled as done)');
select enum_has_labels('public', 'onboarding_step', array['name', 'tutorial', 'starter', 'done'],
  'the steps are name, tutorial, starter, done in order');
select ok(has_function_privilege('authenticated', 'public.set_display_name(text)', 'execute'),
  'authenticated may call set_display_name');
select ok(has_function_privilege('authenticated', 'public.finish_tutorial()', 'execute'),
  'authenticated may call finish_tutorial');
select ok(not has_function_privilege('anon', 'public.set_display_name(text)', 'execute'),
  'anon may not call set_display_name');
select ok(not has_function_privilege('anon', 'public.finish_tutorial()', 'execute'),
  'anon may not call finish_tutorial');
select ok((select prosecdef from pg_proc where oid = 'public.set_display_name(text)'::regprocedure)
  and (select prosecdef from pg_proc where oid = 'public.finish_tutorial()'::regprocedure),
  'both RPCs are security definer');

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000006a1', 'onboard-a@example.test', '{"full_name":"OAuth A"}'::jsonb),
  ('00000000-0000-0000-0000-0000000006b1', 'onboard-b@example.test', '{}'::jsonb);

select results_eq(
  $$select onboarding_step::text from public.profiles where id = '00000000-0000-0000-0000-0000000006a1'$$,
  $$values ('name')$$, 'a new sign-in starts at the name step');

-- Player A ---------------------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000006a1","role":"authenticated"}', true);

-- The client cannot write the step directly.
select throws_ok(
  $$update public.profiles set onboarding_step = 'done' where id = '00000000-0000-0000-0000-0000000006a1'$$,
  '42501', null, 'a direct step update is denied');
select throws_ok(
  $$update public.profiles set display_name = 'Direct' where id = '00000000-0000-0000-0000-0000000006a1'$$,
  '42501', null, 'a direct name update is denied');

-- The tutorial cannot be finished before the name step.
select throws_ok($$select public.finish_tutorial()$$, '55000', null,
  'finish_tutorial at the name step is rejected');
select results_eq(
  $$select onboarding_step::text from public.profiles where id = '00000000-0000-0000-0000-0000000006a1'$$,
  $$values ('name')$$, 'a skip attempt leaves the step at name');

-- Invalid names are rejected and change nothing.
select throws_ok($$select public.set_display_name(null)$$, '22023', null, 'a null name is rejected');
select throws_ok($$select public.set_display_name('   ')$$, '22023', null, 'a blank name is rejected');
select throws_ok($$select public.set_display_name(repeat('x', 33))$$, '22023', null,
  'a 33-character name is rejected');
select throws_ok($$select public.set_display_name(E'bad\nname')$$, '22023', null,
  'a name with a control character is rejected');
select results_eq(
  $$select display_name, onboarding_step::text from public.profiles
    where id = '00000000-0000-0000-0000-0000000006a1'$$,
  $$values ('OAuth A'::text, 'name'::text)$$, 'rejected names leave the profile unchanged');

-- Setting a name advances name → tutorial.
select results_eq(
  $$select display_name, onboarding_step::text from public.set_display_name('  Hero A  ')$$,
  $$values ('Hero A'::text, 'tutorial'::text)$$, 'set_display_name trims and advances to tutorial');

-- A rename at the tutorial step does not advance.
select results_eq(
  $$select display_name, onboarding_step::text from public.set_display_name(repeat('y', 32))$$,
  $$values (repeat('y', 32), 'tutorial'::text)$$, 'a rename at tutorial keeps the step');

-- finish_tutorial advances tutorial → starter and is idempotent.
select results_eq($$select onboarding_step::text from public.finish_tutorial()$$,
  $$values ('starter')$$, 'finish_tutorial advances to starter');
select results_eq($$select onboarding_step::text from public.finish_tutorial()$$,
  $$values ('starter')$$, 'a second finish_tutorial changes nothing');

-- A later rename works and keeps the step.
select results_eq(
  $$select display_name, onboarding_step::text from public.set_display_name('Renamed')$$,
  $$values ('Renamed'::text, 'starter'::text)$$, 'a rename at starter keeps the step');

-- Player B cannot see or change player A.
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000006b1","role":"authenticated"}', true);
select is_empty(
  $$select 1 from public.profiles where id = '00000000-0000-0000-0000-0000000006a1'$$,
  'player B cannot read player A''s profile');
select results_eq($$select id from public.set_display_name('Hero B')$$,
  $$values ('00000000-0000-0000-0000-0000000006b1'::uuid)$$, 'set_display_name acts on the caller only');

-- Anonymous and signed-out callers ---------------------------------------------------------------
set local role anon;
select throws_ok($$select public.finish_tutorial()$$, '42501', null, 'anon cannot call finish_tutorial');

set local role authenticated;
select set_config('request.jwt.claims', '{"role":"authenticated"}', true);
select throws_ok($$select public.set_display_name('Nobody')$$, '42501', null,
  'a call without a user is rejected');

reset role;
select results_eq(
  $$select display_name, onboarding_step::text from public.profiles
    where id in ('00000000-0000-0000-0000-0000000006a1', '00000000-0000-0000-0000-0000000006b1')
    order by id$$,
  $$values ('Renamed'::text, 'starter'::text), ('Hero B'::text, 'tutorial'::text)$$,
  'each player''s progress is their own');

-- A done profile stays done through a rename and a repeat finish_tutorial.
update public.profiles set onboarding_step = 'done' where id = '00000000-0000-0000-0000-0000000006a1';
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000006a1","role":"authenticated"}', true);
select results_eq($$select onboarding_step::text from public.finish_tutorial()$$,
  $$values ('done')$$, 'finish_tutorial never moves a done profile back');

select * from finish();
rollback;
