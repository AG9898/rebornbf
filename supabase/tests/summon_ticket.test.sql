begin;
select no_plan();

select ok(has_function_privilege('authenticated', 'public.summon_ticket(text)', 'execute'), 'player RPC');
select ok(not has_function_privilege('anon', 'public.summon_ticket(text)', 'execute'), 'anon denied');
select ok((select prosecdef from pg_proc where oid = 'public.summon_ticket(text)'::regprocedure), 'definer RPC');
select ok(not has_function_privilege('authenticated',
  'public.summon_pulls(uuid,text,jsonb,integer,uuid)', 'execute'), 'pull helper internal');

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000005101', 'ticket-a@example.test'),
  ('00000000-0000-0000-0000-000000005102', 'ticket-b@example.test');
insert into public.wallets (user_id, gems) values
  ('00000000-0000-0000-0000-000000005101', 7),
  ('00000000-0000-0000-0000-000000005102', 100);
insert into public.summon_tickets (user_id, count) values
  ('00000000-0000-0000-0000-000000005101', 1);
insert into public.summon_pity (user_id, banner_id, pulls) values
  ('00000000-0000-0000-0000-000000005101', 'launch-summon', 75);

set local role authenticated;

-- A player with no ticket cannot use the ticket path, and nothing changes.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000005102","role":"authenticated"}', true);
select throws_ok($$select public.summon_ticket('launch-summon')$$, 'P0001', null, 'no ticket rejected');
select is((select gems::int from public.wallets), 100, 'no gems spent without a ticket');
select is_empty($$select 1 from public.summon_log$$, 'no pulls without a ticket');
select is_empty($$select 1 from public.summon_pity$$, 'no pity row without a ticket');
select is_empty($$select 1 from public.summon_ticket_log$$, 'no ticket log without a ticket');

-- A held ticket pays for one 10-pull at no gem cost.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000005101","role":"authenticated"}', true);
select throws_ok($$select public.summon_ticket('summon-test')$$, '22023', null, 'launch banner only');
select throws_ok($$select public.summon_ticket(null)$$, '22023', null, 'null banner rejected');
select is((select count from public.summon_tickets), 1, 'refusals keep the ticket');

create temporary table ticket_result as select public.summon_ticket('launch-summon') as r;
grant select on ticket_result to authenticated;
select is((select jsonb_array_length(r->'results') from ticket_result), 10, 'ticket pulls 10');
select is((select (r->>'tickets_after')::int from ticket_result), 0, 'result reports tickets left');
select is((select (r->>'gems')::int from ticket_result), 7, 'result reports unchanged gems');
select is((select gems::int from public.wallets), 7, 'no gem cost');
select is_empty($$select 1 from public.wallet_log where reason = 'summon'$$, 'no wallet debit row');
select is((select count from public.summon_tickets), 0, 'ticket consumed');
select results_eq(
  $$select delta, count_after, reason, ref_id::text from public.summon_ticket_log$$,
  $$select -1, 0, 'summon'::text, (select r->>'batch_id' from ticket_result)$$,
  'ticket spend logged against the batch');

-- Ticket pulls are recorded in summon_log and count toward pity (75 -> pity forced by pull 5).
select is((select count(*)::int from public.summon_log
  where banner_id = 'launch-summon' and batch_id = (select (r->>'batch_id')::uuid from ticket_result)),
  10, 'every ticket pull logged');
select is((select count(*)::int from public.unit_log where reason = 'summon')
  + (select count(*)::int from public.unit_stack_log where reason = 'summon'), 10, 'every pull granted');
select ok((select bool_or(featured) from public.summon_log where pull_index <= 5),
  'pity counted ticket pulls: a featured unit by pull 5');
select is((select pulls from public.summon_pity),
  (select pity_after from public.summon_log where pull_index = 10), 'pity counter saved');
select is((select (r->>'pity_after')::int from ticket_result),
  (select pulls from public.summon_pity), 'result reports pity');

-- The ticket is gone now.
select throws_ok($$select public.summon_ticket('launch-summon')$$, 'P0001', null, 'second use rejected');
select is((select count(*)::int from public.summon_log), 10, 'no extra pulls');

select set_config('request.jwt.claims', '{}', true);
select throws_ok($$select public.summon_ticket('launch-summon')$$, '42501', null, 'missing caller rejected');

reset role;
select * from finish();
rollback;
