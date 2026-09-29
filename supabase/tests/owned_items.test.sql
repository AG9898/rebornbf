-- M3-01E: owned_items is readable only by its owner and never client-writable; grant_item and
-- consume_item change counts atomically, refuse to go below zero, and log every change.
begin;

select plan(29);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000001e1', 'items-a@example.test'),
  ('00000000-0000-0000-0000-0000000001e2', 'items-b@example.test');

-- Schema and privileges.
select ok((select relrowsecurity from pg_class where oid = 'public.owned_items'::regclass),
  'RLS is enabled on owned_items');
select ok((select relrowsecurity from pg_class where oid = 'public.item_log'::regclass),
  'RLS is enabled on item_log');
select ok(not has_table_privilege('anon', 'public.owned_items', 'select'),
  'anon may not read owned_items');
select ok(not has_function_privilege('authenticated',
    'public.grant_item(uuid, text, bigint, text, uuid)', 'execute'),
  'authenticated cannot execute grant_item');
select ok(not has_function_privilege('authenticated',
    'public.consume_item(uuid, text, bigint, text, uuid)', 'execute'),
  'authenticated cannot execute consume_item');
select ok(not has_function_privilege('service_role',
    'public.grant_item(uuid, text, bigint, text, uuid)', 'execute'),
  'service_role cannot execute grant_item directly');
select ok(not has_function_privilege('anon',
    'public.consume_item(uuid, text, bigint, text, uuid)', 'execute'),
  'anon cannot execute consume_item');
select ok((select prosecdef from pg_proc where oid =
    'public.grant_item(uuid, text, bigint, text, uuid)'::regprocedure),
  'grant_item is security definer');

-- Grants.
select is(public.grant_item('00000000-0000-0000-0000-0000000001e1', 'crown-shard', 2, 'test_grant'),
  2::bigint, 'a first grant creates the row with its count');
select is(public.grant_item('00000000-0000-0000-0000-0000000001e1', 'crown-shard', 3, 'test_grant',
    '00000000-0000-0000-0000-00000000aaaa'),
  5::bigint, 'a second grant stacks onto the same row');
select is(public.grant_item('00000000-0000-0000-0000-0000000001e2', 'crown-shard', 1, 'test_grant'),
  1::bigint, 'another player''s grant is separate');
select throws_ok($$select public.grant_item('00000000-0000-0000-0000-0000000001e1',
    'no-such-item', 1, 'test_grant')$$,
  '22023', null, 'grant rejects an item that is not seeded content');
select throws_ok($$select public.grant_item('00000000-0000-0000-0000-0000000001e1',
    'brand', 1, 'test_grant')$$,
  '22023', null, 'grant rejects a content id of another kind');
select throws_ok($$select public.grant_item('00000000-0000-0000-0000-0000000001e1',
    'crown-shard', 0, 'test_grant')$$,
  '22023', null, 'grant rejects a zero count');
select throws_ok($$select public.grant_item('00000000-0000-0000-0000-0000000001e1',
    'crown-shard', -1, 'test_grant')$$,
  '22023', null, 'grant rejects a negative count');

-- Consumes.
select is(public.consume_item('00000000-0000-0000-0000-0000000001e1', 'crown-shard', 4, 'test_use'),
  1::bigint, 'consume lowers the count');
select throws_ok($$select public.consume_item('00000000-0000-0000-0000-0000000001e1',
    'crown-shard', 2, 'test_use')$$,
  '22023', null, 'consume refuses to go below zero');
select throws_ok($$select public.consume_item('00000000-0000-0000-0000-0000000001e1',
    'no-such-item', 1, 'test_use')$$,
  '22023', null, 'consume refuses an item the player does not hold');
select throws_ok($$select public.consume_item('00000000-0000-0000-0000-0000000001e1',
    'crown-shard', 0, 'test_use')$$,
  '22023', null, 'consume rejects a zero count');
select is(public.consume_item('00000000-0000-0000-0000-0000000001e1', 'crown-shard', 1, 'test_use'),
  0::bigint, 'consume may spend the last item');
select throws_ok($$insert into public.owned_items (user_id, item_id, count)
    values ('00000000-0000-0000-0000-0000000001e2', 'crown-shard', -1)
    on conflict (user_id, item_id) do update set count = -1$$,
  '23514', null, 'counts can never be negative, even for the table owner');

select set_eq(
  $$select item_id, delta, count_after, reason from public.item_log
    where user_id = '00000000-0000-0000-0000-0000000001e1'$$,
  $$values ('crown-shard'::text, 2::bigint, 2::bigint, 'test_grant'::text),
           ('crown-shard', 3, 5, 'test_grant'),
           ('crown-shard', -4, 1, 'test_use'),
           ('crown-shard', -1, 0, 'test_use')$$,
  'every successful change is logged and refused changes log nothing');
select throws_ok($$update public.item_log set delta = 9$$,
  'P0001', 'item_log is append-only', 'item_log rejects updates even from the table owner');

-- Player B as a client.
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000001e2","role":"authenticated"}', true);

select results_eq($$select user_id::text, count from public.owned_items$$,
  $$values ('00000000-0000-0000-0000-0000000001e2'::text, 1::bigint)$$,
  'a player reads only their own item rows');
select is((select count(*)::int from public.item_log), 1, 'a player reads only their own item log');
select throws_ok($$insert into public.owned_items (user_id, item_id, count)
    values ('00000000-0000-0000-0000-0000000001e2', 'crown-shard', 99)$$,
  '42501', null, 'a player cannot insert item rows');
select throws_ok($$update public.owned_items set count = 99$$,
  '42501', null, 'a player cannot update item rows');
select throws_ok($$delete from public.owned_items$$,
  '42501', null, 'a player cannot delete item rows');

reset role;

delete from auth.users where id = '00000000-0000-0000-0000-0000000001e1';
select is((select count(*)::int from public.item_log
    where user_id = '00000000-0000-0000-0000-0000000001e1'), 0,
  'deleting the auth user cascades through the append-only log');

select * from finish();
rollback;
