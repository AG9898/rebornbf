-- M3-06A: onboarding steps advance in order only through set_display_name (and pick_starter, in
-- pick_starter.test.sql). The tutorial step was removed on 2026-10-07: name → starter → done.
begin;

select plan(26);

-- Schema and privileges ---------------------------------------------------------------------------
select col_not_null('public', 'profiles', 'onboarding_step', 'onboarding_step is not null');
select col_default_is('public', 'profiles', 'onboarding_step', 'name',
  'new profiles start at the name step (existing ones owning units were backfilled as done)');
select enum_has_labels('public', 'onboarding_step', array['name', 'starter', 'done'],
  'the steps are name, starter, done in order');
select hasnt_function('public', 'finish_tutorial', 'the tutorial RPC is gone');
select ok(has_function_privilege('authenticated', 'public.set_display_name(text)', 'execute'),
  'authenticated may call set_display_name');
select ok(not has_function_privilege('anon', 'public.set_display_name(text)', 'execute'),
  'anon may not call set_display_name');
select ok((select prosecdef from pg_proc where oid = 'public.set_display_name(text)'::regprocedure),
  'set_display_name is security definer');

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

-- The starter pick cannot skip the name step.
select throws_ok($$select public.pick_starter('brand')$$, '55000', null,
  'pick_starter at the name step is rejected');
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

-- Setting a name advances name → starter.
select results_eq(
  $$select display_name, onboarding_step::text from public.set_display_name('  Hero A  ')$$,
  $$values ('Hero A'::text, 'starter'::text)$$, 'set_display_name trims and advances to starter');

-- A rename at the starter step does not advance.
select results_eq(
  $$select display_name, onboarding_step::text from public.set_display_name(repeat('y', 32))$$,
  $$values (repeat('y', 32), 'starter'::text)$$, 'a rename at starter keeps the step');

-- A later rename works and keeps the step.
select results_eq(
  $$select display_name, onboarding_step::text from public.set_display_name('Renamed')$$,
  $$values ('Renamed'::text, 'starter'::text)$$, 'a second rename keeps the step');

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
select throws_ok($$select public.set_display_name('Anon')$$, '42501', null,
  'anon cannot call set_display_name');

set local role authenticated;
select set_config('request.jwt.claims', '{"role":"authenticated"}', true);
select throws_ok($$select public.set_display_name('Nobody')$$, '42501', null,
  'a call without a user is rejected');

reset role;
select results_eq(
  $$select display_name, onboarding_step::text from public.profiles
    where id in ('00000000-0000-0000-0000-0000000006a1', '00000000-0000-0000-0000-0000000006b1')
    order by id$$,
  $$values ('Renamed'::text, 'starter'::text), ('Hero B'::text, 'starter'::text)$$,
  'each player''s progress is their own');

-- A done profile stays done through a rename.
update public.profiles set onboarding_step = 'done' where id = '00000000-0000-0000-0000-0000000006a1';
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000006a1","role":"authenticated"}', true);
select results_eq($$select onboarding_step::text from public.set_display_name('Done A')$$,
  $$values ('done')$$, 'a rename never moves a done profile back');

select * from finish();
rollback;
