begin;
select no_plan();

-- Privileges and RLS.
select ok(has_function_privilege('authenticated', 'public.claim_login_reward()', 'execute'), 'player RPC');
select ok(not has_function_privilege('anon', 'public.claim_login_reward()', 'execute'), 'anon denied');
select ok((select prosecdef from pg_proc where oid = 'public.claim_login_reward()'::regprocedure), 'definer RPC');
select ok((select bool_and(relrowsecurity) from pg_class where oid in
  ('public.login_calendar'::regclass, 'public.summon_tickets'::regclass,
   'public.summon_ticket_log'::regclass)), 'RLS enabled');
select ok(not has_table_privilege('anon', 'public.login_calendar', 'select'), 'anon cannot read calendar');
select ok(not has_table_privilege('anon', 'public.summon_tickets', 'select'), 'anon cannot read tickets');

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000006001', 'login-a@example.test'),
  ('00000000-0000-0000-0000-000000006002', 'login-b@example.test');

set local role authenticated;
select set_config('request.jwt.claims', '{}', true);
select throws_ok($$select public.claim_login_reward()$$, '42501', null, 'missing caller rejected');

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000006001","role":"authenticated"}', true);

-- Day 1: 30 gems and one ticket, with log rows; no wallet row existed beforehand.
select is(public.claim_login_reward(),
  '{"claimed":true,"day":1,"gems":30,"tickets":1,"gems_after":30,"tickets_after":1}'::jsonb,
  'day 1 grants 30 gems and a ticket');
select is((select gems::int from public.wallets), 30, 'wallet credited');
select is((select count from public.summon_tickets), 1, 'ticket held');
select is((select count(*)::int from public.wallet_log where reason = 'login_reward' and delta = 30
  and balance_after = 30), 1, 'day 1 wallet_log row');
select is((select count(*)::int from public.summon_ticket_log where reason = 'login_reward'
  and delta = 1 and count_after = 1), 1, 'day 1 ticket log row');
select is((select ref_id from public.wallet_log), (select ref_id from public.summon_ticket_log),
  'gem and ticket logs share the claim ref');

-- Same UTC day: nothing.
select is(public.claim_login_reward(),
  '{"claimed":false,"day":1,"gems":0,"tickets":0,"gems_after":30,"tickets_after":1}'::jsonb,
  'same-day repeat grants nothing');
select is((select count(*)::int from public.wallet_log), 1, 'no extra wallet_log row');
select is((select count(*)::int from public.summon_ticket_log), 1, 'no extra ticket log row');

-- The client cannot write the calendar or the ticket balance.
select throws_ok($$update public.login_calendar set last_claim_on = null$$, '42501', null,
  'client cannot rewind the calendar');
select throws_ok($$insert into public.login_calendar (user_id) values
  ('00000000-0000-0000-0000-000000006002')$$, '42501', null, 'client cannot insert a calendar');
select throws_ok($$update public.summon_tickets set count = 5$$, '42501', null,
  'client cannot change tickets');
select throws_ok($$insert into public.summon_ticket_log (user_id, delta, count_after, reason)
  values ('00000000-0000-0000-0000-000000006001', 1, 2, 'x')$$, '42501', null,
  'client cannot write the ticket log');
select throws_ok($$delete from public.summon_tickets$$, '42501', null, 'client cannot delete tickets');

-- Next UTC day (simulated by moving the last claim back): day 2 is 5 gems, no ticket.
reset role;
update public.login_calendar set last_claim_on = last_claim_on - 1
  where user_id = '00000000-0000-0000-0000-000000006001';
set local role authenticated;
select is(public.claim_login_reward(),
  '{"claimed":true,"day":2,"gems":5,"tickets":0,"gems_after":35,"tickets_after":1}'::jsonb,
  'next day advances to day 2');
select is((select count(*)::int from public.summon_ticket_log), 1, 'day 2 grants no ticket');

-- Missed days: a gap of a week still advances exactly one step.
reset role;
update public.login_calendar set last_claim_on = last_claim_on - 7
  where user_id = '00000000-0000-0000-0000-000000006001';
set local role authenticated;
select is(public.claim_login_reward() ->> 'day', '3', 'missed days do not reset or skip');

-- End of calendar: claim day 30, then nothing on later days.
reset role;
update public.login_calendar set days_claimed = 29, last_claim_on = last_claim_on - 1
  where user_id = '00000000-0000-0000-0000-000000006001';
set local role authenticated;
select is(public.claim_login_reward(),
  '{"claimed":true,"day":30,"gems":5,"tickets":0,"gems_after":45,"tickets_after":1}'::jsonb,
  'day 30 grants 5 gems');
reset role;
update public.login_calendar set last_claim_on = last_claim_on - 1
  where user_id = '00000000-0000-0000-0000-000000006001';
set local role authenticated;
select is(public.claim_login_reward(),
  '{"claimed":false,"day":30,"gems":0,"tickets":0,"gems_after":45,"tickets_after":1}'::jsonb,
  'claims after day 30 grant nothing');
select is((select count(*)::int from public.wallet_log), 4, 'one wallet_log row per claimed day');

-- Players are isolated.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000006002","role":"authenticated"}', true);
select is_empty($$select 1 from public.login_calendar$$, 'other player cannot read calendar');
select is_empty($$select 1 from public.summon_tickets$$, 'other player cannot read tickets');
select is_empty($$select 1 from public.summon_ticket_log$$, 'other player cannot read ticket log');
select is(public.claim_login_reward() ->> 'day', '1', 'second player starts at day 1');

-- The ticket log is append-only even for the owner role; account deletion cascades.
reset role;
select throws_ok($$update public.summon_ticket_log set delta = 5$$, 'P0001', null,
  'owner cannot change ticket log');
select throws_ok($$delete from public.summon_ticket_log$$, 'P0001', null,
  'owner cannot delete ticket log');
select throws_ok($$update public.login_calendar set days_claimed = 31$$, '23514', null,
  'calendar cannot pass day 30');
delete from auth.users where id = '00000000-0000-0000-0000-000000006002';
select is((select count(*)::int from public.summon_ticket_log
  where user_id = '00000000-0000-0000-0000-000000006002'), 0, 'ticket log cascades on account delete');

select * from finish();
rollback;
