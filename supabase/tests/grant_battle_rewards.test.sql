-- M3-04D: session claim, first-clear gems, server-rolled Zel, and transactional rollback.
begin;
select plan(19);

select ok(has_function_privilege('service_role', 'public.grant_battle_rewards(uuid, jsonb)', 'execute'),
  'the service role may grant rewards');
select ok(not has_function_privilege('anon', 'public.grant_battle_rewards(uuid, jsonb)', 'execute'),
  'anon cannot execute the reward function');
select ok(not has_function_privilege('authenticated', 'public.grant_battle_rewards(uuid, jsonb)', 'execute'),
  'authenticated cannot execute the reward function');
select ok((select prosecdef from pg_proc where oid = 'public.grant_battle_rewards(uuid, jsonb)'::regprocedure),
  'the reward function runs as its definer');

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000007a', 'reward-a@example.test');
insert into public.content_items (kind, id, data) values
  ('stage', 'test-reward-stage', '{"firstClear":{"gems":25},"waves":[{"enemies":[{"enemy":"test-reward-enemy"},{"enemy":"test-reward-enemy"}]}]}'),
  ('enemy', 'test-reward-enemy', '{"drops":{"zel":{"rate":100,"amount":30}}}');
insert into public.content_version (singleton, version, item_count)
values (true, '0123456789abcdef', 2)
on conflict (singleton) do update set version = excluded.version;
insert into public.battle_sessions (id, user_id, stage_id, seed, squad, content_version, expires_at) values
  ('00000000-0000-0000-0000-0000000007a1', '00000000-0000-0000-0000-00000000007a', 'test-reward-stage', 1, '{}', '0123456789abcdef', now() + interval '1 hour'),
  ('00000000-0000-0000-0000-0000000007a2', '00000000-0000-0000-0000-00000000007a', 'test-reward-stage', 2, '{}', '0123456789abcdef', now() + interval '1 hour'),
  ('00000000-0000-0000-0000-0000000007a3', '00000000-0000-0000-0000-00000000007a', 'test-reward-stage', 3, '{}', '0123456789abcdef', now() + interval '1 hour'),
  ('00000000-0000-0000-0000-0000000007a4', '00000000-0000-0000-0000-00000000007a', 'test-reward-stage', 4, '{}', '0123456789abcdef', now() + interval '1 hour');
update public.battle_sessions set created_at = now() - interval '2 hours', expires_at = now() - interval '1 hour'
where id = '00000000-0000-0000-0000-0000000007a3';

set local role authenticated;
select throws_ok($$select public.grant_battle_rewards('00000000-0000-0000-0000-0000000007a1')$$,
  '42501', null, 'players cannot claim rewards');
reset role;

set local role service_role;
select is(public.grant_battle_rewards('00000000-0000-0000-0000-0000000007a1'),
  '{"first_clear":true,"gems":25,"zel":60,"units":[],"items":{}}'::jsonb, 'first clear grants gems and two Zel drops');
select throws_ok($$select public.grant_battle_rewards('00000000-0000-0000-0000-0000000007a1')$$,
  'P0002', null, 'a session cannot pay twice');
select is(public.grant_battle_rewards('00000000-0000-0000-0000-0000000007a2'),
  '{"first_clear":false,"gems":0,"zel":60,"units":[],"items":{}}'::jsonb, 'repeat clear grants drops but not first-clear gems');
select throws_ok($$select public.grant_battle_rewards('00000000-0000-0000-0000-0000000007a3')$$,
  'P0002', null, 'expired sessions cannot pay');
reset role;

select is((select gems from public.wallets where user_id = '00000000-0000-0000-0000-00000000007a'),
  25::bigint, 'first-clear gems credited once');
select is((select zel from public.wallets where user_id = '00000000-0000-0000-0000-00000000007a'),
  120::bigint, 'Zel credited for both sessions');
select is((select count(*)::int from public.quest_progress where user_id = '00000000-0000-0000-0000-00000000007a'),
  1, 'one first-clear row');
select is((select count(*)::int from public.wallet_log where user_id = '00000000-0000-0000-0000-00000000007a'),
  3, 'all currency credits logged with no duplicate payment');
select results_eq(
  $$select currency, delta, balance_after, reason, ref_id from public.wallet_log
    where user_id = '00000000-0000-0000-0000-00000000007a' and currency = 'gems'$$,
  $$values ('gems'::text, 25::bigint, 25::bigint, 'battle_first_clear'::text,
    '00000000-0000-0000-0000-0000000007a1'::uuid)$$,
  'the first-clear gem grant writes one wallet_log row for its session (M5-02)');
select ok((select finished_at is not null from public.battle_sessions where id = '00000000-0000-0000-0000-0000000007a1'),
  'successful session is finished');
select ok((select finished_at is null from public.battle_sessions where id = '00000000-0000-0000-0000-0000000007a3'),
  'expired session is not finished');

-- A missing enemy raises after the claim and first-clear insert: the entire call must roll back.
delete from public.content_items where kind = 'enemy' and id = 'test-reward-enemy';
set local role service_role;
select throws_ok($$select public.grant_battle_rewards('00000000-0000-0000-0000-0000000007a4')$$,
  '55000', null, 'missing content rolls back the claim and reward writes');
reset role;
select ok((select finished_at is null from public.battle_sessions where id = '00000000-0000-0000-0000-0000000007a4'),
  'failed grant leaves session available for retry');
select is((select zel from public.wallets where user_id = '00000000-0000-0000-0000-00000000007a'),
  120::bigint, 'failed grant does not alter the wallet');

select * from finish();
rollback;
