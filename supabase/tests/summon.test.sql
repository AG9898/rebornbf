begin;
select no_plan();

select ok(has_function_privilege('authenticated', 'public.summon(text,integer)', 'execute'), 'player RPC');
select ok(not has_function_privilege('anon', 'public.summon(text,integer)', 'execute'), 'anon denied');
select ok(not has_function_privilege('authenticated', 'public.roll_summon(jsonb,boolean)', 'execute'), 'roller internal');
select ok((select prosecdef from pg_proc where oid = 'public.summon(text,integer)'::regprocedure), 'definer RPC');
select ok((select bool_and(relrowsecurity) from pg_class where oid in
  ('public.summon_pity'::regclass, 'public.summon_log'::regclass)), 'RLS enabled');

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000005001', 'summon-a@example.test'),
  ('00000000-0000-0000-0000-000000005002', 'summon-b@example.test');
insert into public.wallets(user_id, gems) values
  ('00000000-0000-0000-0000-000000005001', 1000),
  ('00000000-0000-0000-0000-000000005002', 4);
-- Fixtures are independent of the shared local seed. One zero-rate featured unit forces pity.
insert into public.content_items (kind, id, data) values
  ('unit', 'summon-feature', '{"forms":[{"id":"summon-feature-5","rarity":5}]}'),
  ('unit', 'summon-filler', '{"forms":[{"id":"summon-filler-2","rarity":2}]}'),
  ('banner', 'summon-test', '{"pityPulls":80,"featured":[{"unit":"summon-feature","form":"summon-feature-5","rateBp":0}],"pool":[{"unit":"summon-filler","form":"summon-filler-2","rateBp":10000}]}'),
  ('banner', 'summon-other', '{"pityPulls":80,"featured":[{"unit":"summon-feature","form":"summon-feature-5","rateBp":10000}],"pool":[]}');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000005002","role":"authenticated"}', true);
select throws_ok($$select public.summon('summon-test',1)$$, 'P0001', null, 'insufficient gems');
select is((select gems::int from public.wallets), 4, 'no debit on refusal');
select is_empty($$select 1 from public.summon_pity$$, 'no pity row on refusal');
select is_empty($$select 1 from public.summon_log$$, 'no summon log on refusal');
select is_empty($$select 1 from public.owned_units$$, 'no unit on refusal');
select is_empty($$select 1 from public.wallet_log where reason = 'summon'$$, 'no wallet log on refusal');

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000005001","role":"authenticated"}', true);
select throws_ok($$select public.summon('missing',1)$$, '22023', null, 'unknown banner');
select throws_ok($$select public.summon('summon-test',10)$$, '22023', null, 'reject 10 gem pulls');
select throws_ok($$select public.summon('summon-test',null)$$, '22023', null, 'null count');
select is(jsonb_array_length(public.summon('summon-test',1)->'results'), 1, 'single result');
select is((select gems::int from public.wallets), 995, 'single costs 5');
select is((select pulls from public.summon_pity), 1, 'normal filler increments pity');
select is(jsonb_array_length(public.summon('summon-test',11)->'results'), 11, 'multi has 11 results');
select is((select gems::int from public.wallets), 945, 'multi costs 50');
select is((select pulls from public.summon_pity), 12, 'each multi pull counts');
select is((select count(*)::int from public.unit_log where reason='summon'), 12, 'each acquisition logged');
select is((select count(*)::int from public.summon_log), 12, 'each pull logged');
select throws_ok($$update public.summon_pity set pulls=79$$, '42501', null, 'client cannot alter pity');
select throws_ok($$delete from public.summon_log$$, '42501', null, 'client cannot delete log');

reset role;
update public.summon_pity set pulls = 78 where user_id = '00000000-0000-0000-0000-000000005001';
set local role authenticated;
select is((public.summon('summon-test',1)->>'pity_after')::int, 79, '79th is ordinary');
select is((public.summon('summon-test',11)->'results'->0->>'pity')::boolean, true, '80th is forced even inside multi');
select is((select pulls from public.summon_pity), 10, 'pity resets then counts remaining multi pulls');
select is((select count(*)::int from public.summon_log where pity and featured and pity_after=0), 1, 'forced featured reset is recorded');
reset role;
insert into public.summon_pity (user_id, banner_id, pulls)
  values ('00000000-0000-0000-0000-000000005001', 'summon-other', 35);
set local role authenticated;
select is((public.summon('summon-other',1)->>'pity_after')::int, 0, 'natural featured resets counter');
select is((select pulls from public.summon_pity where banner_id='summon-test'), 10, 'banner counters independent');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000005002","role":"authenticated"}', true);
select is_empty($$select 1 from public.summon_log$$, 'other player cannot read logs');
select is_empty($$select 1 from public.summon_pity$$, 'other player cannot read pity');
select set_config('request.jwt.claims', '{}', true);
select throws_ok($$select public.summon('summon-test',1)$$, '42501', null, 'missing caller rejected');
reset role;
select throws_ok($$update public.summon_log set pity=false$$, 'P0001', null, 'owner cannot change log');
select throws_ok($$delete from public.summon_log$$, 'P0001', null, 'owner cannot delete log');

-- 100,000 calls to the production roller, without pity, checked against every configured rate.
-- A 0.5 percentage-point tolerance is >4 sigma at the largest configured rate.
create temporary table summon_rates as
select value as entry from jsonb_array_elements(
  (select (data->'featured') || (data->'pool') from public.content_items where kind='banner' and id='launch-summon'));
create temporary table summon_rolls as
select public.roll_summon((select data from public.content_items where kind='banner' and id='launch-summon'),false) as entry
from generate_series(1,100000);
select is((select count(*)::int from summon_rates), 10, 'launch rate test covers all entries');
select ok(abs((select count(*) from summon_rolls r where r.entry = rates.entry)/100000.0
  - (rates.entry->>'rateBp')::numeric/10000) < 0.005,
  '100k base rolls match rate for ' || (rates.entry->>'unit')) from summon_rates rates;
-- The pity helper uniformly chooses the two featured units, independent of their base rates.
create temporary table pity_rolls as
select public.roll_summon((select data from public.content_items where kind='banner' and id='launch-summon'),true) as entry
from generate_series(1,10000);
select ok((select bool_and(entry->>'unit' in ('aurelle','vespera')) from pity_rolls), 'pity only features');
select ok(abs((select count(*) from pity_rolls where entry->>'unit'='aurelle')/10000.0-0.5)<0.03, 'uniform pity');

-- Missing unit content must roll back a purchase, its pity change and all its logs.
update public.content_items set data = '{"pityPulls":80,"featured":[{"unit":"missing","form":"missing-5","rateBp":10000}],"pool":[]}'
where kind='banner' and id='summon-other';
create temporary table before_failure as select gems from public.wallets where user_id='00000000-0000-0000-0000-000000005001';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000005001","role":"authenticated"}', true);
select throws_ok($$select public.summon('summon-other',1)$$, '22023', null, 'bad content aborts transaction');
reset role;
select is((select gems from public.wallets where user_id='00000000-0000-0000-0000-000000005001'),
  (select gems from before_failure), 'failed grant refunded debit');
select is((select count(*)::int from public.summon_log where banner_id='summon-other'), 1, 'failed grant adds no log');
delete from auth.users where id='00000000-0000-0000-0000-000000005001';
select is_empty($$select 1 from public.summon_log$$, 'account cascade allowed');
select * from finish();
rollback;
