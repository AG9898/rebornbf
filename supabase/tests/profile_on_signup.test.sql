-- M3-01B: a profile row is created when Supabase Auth inserts a new user (first sign-in).
begin;

select plan(7);

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000000c1', 'google@example.test',
    '{"full_name":"  Google Player  ","name":"Ignored"}'::jsonb),
  ('00000000-0000-0000-0000-0000000000c2', 'discord@example.test',
    '{"name":"discord_player"}'::jsonb),
  ('00000000-0000-0000-0000-0000000000c3', 'long@example.test',
    jsonb_build_object('full_name', repeat('x', 40))),
  ('00000000-0000-0000-0000-0000000000c4', 'blank@example.test', '{"full_name":"   "}'::jsonb),
  ('00000000-0000-0000-0000-0000000000c5', 'none@example.test', '{}'::jsonb);

select results_eq(
  $$select count(*)::int from public.profiles where id::text like '00000000-0000-0000-0000-0000000000c%'$$,
  $$values (5)$$, 'every new auth user gets a profile');

select results_eq(
  $$select display_name from public.profiles where id = '00000000-0000-0000-0000-0000000000c1'$$,
  $$values ('Google Player'::text)$$, 'full_name is preferred and trimmed');

select results_eq(
  $$select display_name from public.profiles where id = '00000000-0000-0000-0000-0000000000c2'$$,
  $$values ('discord_player'::text)$$, 'name is the fallback claim');

select results_eq(
  $$select char_length(display_name) from public.profiles where id = '00000000-0000-0000-0000-0000000000c3'$$,
  $$values (32)$$, 'long names are cut to 32 characters');

select results_eq(
  $$select display_name is null from public.profiles
    where id in ('00000000-0000-0000-0000-0000000000c4', '00000000-0000-0000-0000-0000000000c5')$$,
  $$values (true), (true)$$, 'blank or missing names are stored as null');

-- Signing in again updates auth.users but never creates a second profile.
update auth.users set last_sign_in_at = now() where id = '00000000-0000-0000-0000-0000000000c1';
select results_eq(
  $$select count(*)::int from public.profiles where id = '00000000-0000-0000-0000-0000000000c1'$$,
  $$values (1)$$, 'a returning sign-in keeps one profile');

-- Client roles cannot call the trigger function directly.
select ok(
  not has_function_privilege('authenticated', 'public.handle_new_user()', 'execute'),
  'authenticated cannot execute handle_new_user');

select * from finish();
rollback;
