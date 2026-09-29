-- M3-01A: RLS on the base player tables.
-- Players read only their own rows; anon reads nothing; no client role can insert, update, or
-- delete directly; wallet_log is append-only.
begin;

select plan(35);

-- Two players, seeded as the migration owner (bypasses RLS like a definer RPC would).
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'player-a@example.test'),
  ('00000000-0000-0000-0000-00000000000b', 'player-b@example.test');

insert into public.profiles (id, display_name) values
  ('00000000-0000-0000-0000-00000000000a', 'Player A'),
  ('00000000-0000-0000-0000-00000000000b', 'Player B')
-- M3-01B's sign-up trigger already created both profiles; set their names.
on conflict (id) do update set display_name = excluded.display_name;

insert into public.wallets (user_id, gems, zel) values
  ('00000000-0000-0000-0000-00000000000a', 50, 1000),
  ('00000000-0000-0000-0000-00000000000b', 5, 10);

insert into public.wallet_log (user_id, currency, delta, balance_after, reason) values
  ('00000000-0000-0000-0000-00000000000a', 'gems', 50, 50, 'test_grant'),
  ('00000000-0000-0000-0000-00000000000a', 'zel', 1000, 1000, 'test_grant'),
  ('00000000-0000-0000-0000-00000000000b', 'gems', 5, 5, 'test_grant');

insert into public.owned_units (id, user_id, unit_id, form_id) values
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000000a', 'brand', 'brand-1'),
  ('00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-00000000000a', 'maren', 'maren-1'),
  ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-00000000000b', 'brand', 'brand-1');

insert into public.squads (user_id, slot, unit_ids) values
  ('00000000-0000-0000-0000-00000000000a', 0,
    array['00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000a2']::uuid[]),
  ('00000000-0000-0000-0000-00000000000b', 0,
    array['00000000-0000-0000-0000-0000000000b1']::uuid[]);

-- RLS is enabled on every table ------------------------------------------------------------------
select ok((select relrowsecurity from pg_class where oid = 'public.profiles'::regclass), 'profiles has RLS');
select ok((select relrowsecurity from pg_class where oid = 'public.wallets'::regclass), 'wallets has RLS');
select ok((select relrowsecurity from pg_class where oid = 'public.wallet_log'::regclass), 'wallet_log has RLS');
select ok((select relrowsecurity from pg_class where oid = 'public.owned_units'::regclass), 'owned_units has RLS');
select ok((select relrowsecurity from pg_class where oid = 'public.squads'::regclass), 'squads has RLS');

-- Player A reads only their own rows -------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);

select results_eq('select id from public.profiles',
  $$values ('00000000-0000-0000-0000-00000000000a'::uuid)$$, 'A reads only own profile');
select results_eq('select gems, zel from public.wallets',
  $$values (50::bigint, 1000::bigint)$$, 'A reads only own wallet');
select results_eq('select count(*)::int from public.wallet_log where user_id <> auth.uid()',
  $$values (0)$$, 'A reads no other wallet_log rows');
select results_eq('select id from public.owned_units order by id',
  $$values ('00000000-0000-0000-0000-0000000000a1'::uuid), ('00000000-0000-0000-0000-0000000000a2'::uuid)$$,
  'A reads only own units');
select results_eq('select cardinality(unit_ids) from public.squads',
  $$values (2)$$, 'A reads only own squad');

-- Player A cannot write directly (15) ------------------------------------------------------------
select throws_ok($$insert into public.profiles (id) values ('00000000-0000-0000-0000-00000000000a')$$,
  '42501', null, 'A cannot insert profiles');
select throws_ok($$update public.profiles set display_name = 'Hacked'$$,
  '42501', null, 'A cannot update profiles');
select throws_ok($$delete from public.profiles$$, '42501', null, 'A cannot delete profiles');

select throws_ok($$insert into public.wallets (user_id, gems) values ('00000000-0000-0000-0000-00000000000a', 9999)$$,
  '42501', null, 'A cannot insert wallets');
select throws_ok($$update public.wallets set gems = 9999$$, '42501', null, 'A cannot update wallets');
select throws_ok($$delete from public.wallets$$, '42501', null, 'A cannot delete wallets');

select throws_ok($$insert into public.wallet_log (user_id, currency, delta, balance_after, reason)
    values ('00000000-0000-0000-0000-00000000000a', 'gems', 9999, 9999, 'cheat')$$,
  '42501', null, 'A cannot insert wallet_log');
select throws_ok($$update public.wallet_log set delta = 9999$$, '42501', null, 'A cannot update wallet_log');
select throws_ok($$delete from public.wallet_log$$, '42501', null, 'A cannot delete wallet_log');

select throws_ok($$insert into public.owned_units (user_id, unit_id, form_id)
    values ('00000000-0000-0000-0000-00000000000a', 'brand', 'brand-1')$$,
  '42501', null, 'A cannot insert owned_units');
select throws_ok($$update public.owned_units set level = 999$$, '42501', null, 'A cannot update owned_units');
select throws_ok($$delete from public.owned_units$$, '42501', null, 'A cannot delete owned_units');

select throws_ok($$insert into public.squads (user_id, slot) values ('00000000-0000-0000-0000-00000000000a', 1)$$,
  '42501', null, 'A cannot insert squads');
select throws_ok($$update public.squads set unit_ids = '{}'$$, '42501', null, 'A cannot update squads');
select throws_ok($$delete from public.squads$$, '42501', null, 'A cannot delete squads');

-- Player B sees their own rows, not A's -----------------------------------------------------------
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}', true);

select results_eq('select id from public.owned_units',
  $$values ('00000000-0000-0000-0000-0000000000b1'::uuid)$$, 'B reads only own units');

-- anon has no access at all ----------------------------------------------------------------------
reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);

select throws_ok('select * from public.profiles', '42501', null, 'anon cannot read profiles');
select throws_ok('select * from public.wallets', '42501', null, 'anon cannot read wallets');
select throws_ok('select * from public.wallet_log', '42501', null, 'anon cannot read wallet_log');
select throws_ok('select * from public.owned_units', '42501', null, 'anon cannot read owned_units');
select throws_ok('select * from public.squads', '42501', null, 'anon cannot read squads');

-- Writes were not applied; wallet_log is append-only even for privileged roles -------------------
reset role;

select results_eq($$select gems from public.wallets where user_id = '00000000-0000-0000-0000-00000000000a'$$,
  $$values (50::bigint)$$, 'A wallet unchanged after rejected writes');
select throws_ok($$update public.wallet_log set delta = 1$$, 'P0001', 'wallet_log is append-only',
  'wallet_log rejects updates from the owner role');
select throws_ok($$delete from public.wallet_log$$, 'P0001', 'wallet_log is append-only',
  'wallet_log rejects deletes from the owner role');

-- Account deletion still cascades through wallet_log ---------------------------------------------
delete from auth.users where id = '00000000-0000-0000-0000-00000000000b';
select results_eq($$select count(*)::int from public.wallet_log where user_id = '00000000-0000-0000-0000-00000000000b'$$,
  $$values (0)$$, 'deleting the auth user cascades its wallet_log rows');

select * from finish();

rollback;
