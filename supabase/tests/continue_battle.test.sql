-- M3-04E: replay-server authorization, atomic gem debit, idempotent retries, and restrictions.
begin;
select plan(19);
insert into auth.users (id, email) values
 ('00000000-0000-0000-0000-0000000000c1', 'continue-a@example.test'),
 ('00000000-0000-0000-0000-0000000000c2', 'continue-b@example.test');
insert into public.wallets (user_id, gems) values ('00000000-0000-0000-0000-0000000000c1', 10)
 on conflict (user_id) do update set gems = excluded.gems;
insert into public.content_items (kind, id, data) values
 ('stage', 'continue-story', '{"story":{"number":1}}'),
 ('stage', 'continue-trial', '{"trial":true}');
insert into public.battle_sessions (id, user_id, stage_id, seed, squad, content_version, expires_at)
select ('00000000-0000-0000-0000-000000000c0' || n)::uuid,
 '00000000-0000-0000-0000-0000000000c1',
 case when n = 2 then 'continue-trial' else 'continue-story' end,
 1, '{}', (select version from public.content_version), now() + interval '1 hour'
from generate_series(1, 5) n;
update public.battle_sessions set finished_at = now() where id = '00000000-0000-0000-0000-000000000c04';
update public.battle_sessions set created_at = now() - interval '2 hours', expires_at = now() - interval '1 hour'
 where id = '00000000-0000-0000-0000-000000000c05';
select ok(has_function_privilege('service_role', 'public.continue_battle(uuid,uuid,integer)', 'execute'), 'server may authorize');
select ok(not has_function_privilege('authenticated', 'public.continue_battle(uuid,uuid,integer)', 'execute'), 'client cannot authorize its own wipe');
select ok(not has_function_privilege('anon', 'public.continue_battle(uuid,uuid,integer)', 'execute'), 'anon cannot authorize');
select throws_ok($$select public.continue_battle('00000000-0000-0000-0000-000000000c01','00000000-0000-0000-0000-0000000000c2',1)$$, 'P0002', null, 'wrong owner refused');
select throws_ok($$select public.continue_battle('00000000-0000-0000-0000-000000000c02','00000000-0000-0000-0000-0000000000c1',1)$$, '22023', null, 'trial refused');
select throws_ok($$select public.continue_battle('00000000-0000-0000-0000-000000000c04','00000000-0000-0000-0000-0000000000c1',1)$$, 'P0002', null, 'finished refused');
select throws_ok($$select public.continue_battle('00000000-0000-0000-0000-000000000c05','00000000-0000-0000-0000-0000000000c1',1)$$, 'P0002', null, 'expired refused');
select throws_ok($$select public.continue_battle('00000000-0000-0000-0000-000000000c01','00000000-0000-0000-0000-0000000000c1',0)$$, '22023', null, 'invalid turn refused');
select lives_ok($$select public.continue_battle('00000000-0000-0000-0000-000000000c01','00000000-0000-0000-0000-0000000000c1',2)$$, 'eligible continue succeeds');
select is((select gems from public.wallets where user_id = '00000000-0000-0000-0000-0000000000c1'), 5::bigint, 'costs 5 gems');
select is((select continued_turn from public.battle_sessions where id = '00000000-0000-0000-0000-000000000c01'), 2, 'paid turn persisted');
select is((select delta from public.wallet_log where ref_id = '00000000-0000-0000-0000-000000000c01'), -5::bigint, 'debit logged');
select is((select reason from public.wallet_log where ref_id = '00000000-0000-0000-0000-000000000c01'), 'battle_continue', 'reason logged');
select lives_ok($$select public.continue_battle('00000000-0000-0000-0000-000000000c01','00000000-0000-0000-0000-0000000000c1',2)$$, 'lost-response retry succeeds');
select is((select count(*)::integer from public.wallet_log where ref_id = '00000000-0000-0000-0000-000000000c01'), 1, 'retry never charges twice');
select throws_ok($$select public.continue_battle('00000000-0000-0000-0000-000000000c01','00000000-0000-0000-0000-0000000000c1',3)$$, 'P0002', null, 'second wipe refused');
update public.wallets set gems = 4 where user_id = '00000000-0000-0000-0000-0000000000c1';
select throws_ok($$select public.continue_battle('00000000-0000-0000-0000-000000000c03','00000000-0000-0000-0000-0000000000c1',1)$$, '22023', null, 'insufficient gems refused');
select is((select continued_turn from public.battle_sessions where id = '00000000-0000-0000-0000-000000000c03'), null::integer, 'failed payment leaves session untouched');
select is((select gems from public.wallets where user_id = '00000000-0000-0000-0000-0000000000c1'), 4::bigint, 'failed payment leaves wallet untouched');
select * from finish();
rollback;
