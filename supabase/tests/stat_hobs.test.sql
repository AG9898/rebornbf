begin;
select no_plan();
create or replace function public.fusion_roll()
returns integer language sql volatile set search_path = '' as $$ select 9999; $$;

insert into auth.users(id,email) values
  ('00000000-0000-0000-0000-00000000b0a1','hobs-a@example.test'),
  ('00000000-0000-0000-0000-00000000b0a2','hobs-b@example.test');
insert into public.wallets(user_id,zel) values ('00000000-0000-0000-0000-00000000b0a1',1000000);
insert into public.owned_units(id,user_id,unit_id,form_id,level,unit_type) values
  ('00000000-0000-0000-0000-00000000b011','00000000-0000-0000-0000-00000000b0a1','brand','brand-3',1,'{"type":"lord","gains":{"hp":0,"atk":0,"def":0,"rec":0}}'),
  ('00000000-0000-0000-0000-00000000b012','00000000-0000-0000-0000-00000000b0a1','brand','brand-omni',1,null),
  ('00000000-0000-0000-0000-00000000b013','00000000-0000-0000-0000-00000000b0a1','vital-hob','vital-hob-3',1,null),
  ('00000000-0000-0000-0000-00000000b021','00000000-0000-0000-0000-00000000b0a2','brand','brand-omni',1,null);
insert into public.owned_unit_stacks(id,user_id,unit_id,form_id,count) values
  ('00000000-0000-0000-0000-00000000b101','00000000-0000-0000-0000-00000000b0a1','vital-hob','vital-hob-3',5),
  ('00000000-0000-0000-0000-00000000b102','00000000-0000-0000-0000-00000000b0a1','might-hob','might-hob-3',5),
  ('00000000-0000-0000-0000-00000000b103','00000000-0000-0000-0000-00000000b0a1','ward-hob','ward-hob-3',5),
  ('00000000-0000-0000-0000-00000000b104','00000000-0000-0000-0000-00000000b0a1','mend-hob','mend-hob-3',5),
  ('00000000-0000-0000-0000-00000000b105','00000000-0000-0000-0000-00000000b0a1','grand-hob','grand-hob-3',20);
select ok(not has_column_privilege('authenticated','public.owned_units','imps','update'),'clients cannot write imp totals');
select ok(not has_function_privilege('authenticated','public.hob_totals(jsonb,jsonb,jsonb,integer)','execute'),'hob helper is internal');

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-00000000b0a1","role":"authenticated"}',true);
-- One each of the four single-stat hobs. A Super Success only multiplies EXP, not imp totals.
select lives_ok($$select public.fuse('00000000-0000-0000-0000-00000000b011','{}',
  '{"00000000-0000-0000-0000-00000000b101":1,"00000000-0000-0000-0000-00000000b102":1,"00000000-0000-0000-0000-00000000b103":1,"00000000-0000-0000-0000-00000000b104":1}')$$,'all four single-stat hobs fuse');
select is((select imps from public.owned_units where id='00000000-0000-0000-0000-00000000b011'),'{"hp":50,"atk":20,"def":20,"rec":20}'::jsonb,'each documented single-stat gain is applied once');
select is((select sum(count)::integer from public.owned_unit_stacks where unit_id in ('vital-hob','might-hob','ward-hob','mend-hob') and user_id=auth.uid()),16,'four copies consumed atomically');
select lives_ok($$select public.fuse('00000000-0000-0000-0000-00000000b011',array['00000000-0000-0000-0000-00000000b013']::uuid[])$$,'row hob fuses too');
select ok(not exists(select 1 from public.owned_units where id='00000000-0000-0000-0000-00000000b013'),'row hob consumed');
select is((select imps -> 'hp' from public.owned_units where id='00000000-0000-0000-0000-00000000b011'),'100'::jsonb,'row hob adds 50 HP');

-- Fifteen Grand Hobs cap Brand Omni independently in each stat (worked example).
select lives_ok($$select public.fuse('00000000-0000-0000-0000-00000000b012','{}','{"00000000-0000-0000-0000-00000000b105":5}')$$,'Grand batch 1');
select lives_ok($$select public.fuse('00000000-0000-0000-0000-00000000b012','{}','{"00000000-0000-0000-0000-00000000b105":5}')$$,'Grand batch 2');
select lives_ok($$select public.fuse('00000000-0000-0000-0000-00000000b012','{}','{"00000000-0000-0000-0000-00000000b105":5}')$$,'Grand batch 3 loses only cap excess');
select is((select imps from public.owned_units where id='00000000-0000-0000-0000-00000000b012'),'{"hp":2200,"atk":880,"def":460,"rec":460}'::jsonb,'all four Omni caps reached exactly');
create temporary table before_hob as select imps,exp,level from public.owned_units where id='00000000-0000-0000-0000-00000000b012';
create temporary table before_wallet as select zel from public.wallets where user_id=auth.uid();
select throws_ok($$select public.fuse('00000000-0000-0000-0000-00000000b012','{}','{"00000000-0000-0000-0000-00000000b105":1}')$$,'P0001','fuse: a stat hob would grant nothing','sixteenth Grand rejected');
select is((select count from public.owned_unit_stacks where id='00000000-0000-0000-0000-00000000b105'),5,'rejected copy preserved');
select is((select zel from public.wallets where user_id=auth.uid()),(select zel from before_wallet),'rejection keeps Zel');
select results_eq('select imps,exp,level from public.owned_units where id=''00000000-0000-0000-0000-00000000b012''','select * from before_hob','rejection keeps totals, EXP and level');
select throws_ok($$select public.fuse('00000000-0000-0000-0000-00000000b021','{}','{"00000000-0000-0000-0000-00000000b105":1}')$$,'22023',null,'foreign target refused');
select throws_ok($$select public.fuse('00000000-0000-0000-0000-00000000b012','{}','{"00000000-0000-0000-0000-00000000b105":1}')$$,'P0001',null,'retry still cannot consume capped hob');

reset role;
-- A nearly full 3★ form takes the remaining gains, not Omni caps.
update public.owned_units set imps='{"hp":490,"atk":195,"def":115,"rec":115}' where id='00000000-0000-0000-0000-00000000b011';
set local role authenticated;
select lives_ok($$select public.fuse('00000000-0000-0000-0000-00000000b011','{}','{"00000000-0000-0000-0000-00000000b105":1}')$$,'partial-cap Grand accepted');
select is((select imps from public.owned_units where id='00000000-0000-0000-0000-00000000b011'),'{"hp":500,"atk":200,"def":120,"rec":120}'::jsonb,'3-star caps used independently');

reset role;
-- Evolution preserves the column; use a tiny content recipe so this tests evolve itself.
update public.content_items set data=jsonb_set(data,'{forms,1,evolution}','{"units":[{"unit":"vital-hob","count":1}],"zel":0}') where kind='unit' and id='brand';
update public.owned_units set level=40 where id='00000000-0000-0000-0000-00000000b011';
set local role authenticated;
select lives_ok($$select public.evolve('00000000-0000-0000-0000-00000000b011','{}','{"00000000-0000-0000-0000-00000000b101":1}')$$,'evolution succeeds');
select is((select imps from public.owned_units where id='00000000-0000-0000-0000-00000000b011'),'{"hp":500,"atk":200,"def":120,"rec":120}'::jsonb,'evolution preserves imp totals');
select is((select form_id from public.owned_units where id='00000000-0000-0000-0000-00000000b011'),'brand-4','target reached next form');

-- Freeze both member and duplicate ally. Later fusion cannot rewrite the old session.
select public.save_squad(0::smallint,array['00000000-0000-0000-0000-00000000b011']::uuid[],0::smallint);
create temporary table hob_session as select (public.start_battle('story-01-brightmere-outskirts',0::smallint,'00000000-0000-0000-0000-00000000b011')).*;
select is((select squad #> '{units,0,imps}' from hob_session),'{"hp":500,"atk":200,"def":120,"rec":120}'::jsonb,'member totals frozen');
select is((select squad #> '{ally,imps}' from hob_session),'{"hp":500,"atk":200,"def":120,"rec":120}'::jsonb,'duplicate ally totals frozen');
select lives_ok($$select public.fuse('00000000-0000-0000-0000-00000000b011','{}','{"00000000-0000-0000-0000-00000000b101":1}')$$,'evolved target can gain more HP');
select is((select b.squad #> '{units,0,imps}' from public.battle_sessions b join hob_session s using(id)),'{"hp":500,"atk":200,"def":120,"rec":120}'::jsonb,'old snapshot unchanged after fusion');
select is((select imps -> 'hp' from public.owned_units where id='00000000-0000-0000-0000-00000000b011'),'550'::jsonb,'live unit gained HP under new cap');

reset role;
insert into public.owned_units(id,user_id,unit_id,form_id,level) values
 ('00000000-0000-0000-0000-00000000b014','00000000-0000-0000-0000-00000000b0a1','vital-hob','vital-hob-3',1);
update public.wallets set zel=0 where user_id='00000000-0000-0000-0000-00000000b0a1';
set local role authenticated;
select throws_ok($$select public.fuse('00000000-0000-0000-0000-00000000b014','{}','{"00000000-0000-0000-0000-00000000b101":1}')$$,'P0001','fuse: a stat hob would grant nothing','zero-cap fodder cannot receive hobs');
select throws_ok($$select public.fuse('00000000-0000-0000-0000-00000000b011','{}','{"00000000-0000-0000-0000-00000000b101":1}')$$,'P0001',null,'insufficient Zel refuses fusion');
select is((select imps -> 'hp' from public.owned_units where id='00000000-0000-0000-0000-00000000b011'),'550'::jsonb,'payment failure keeps totals');
select is((select count from public.owned_unit_stacks where id='00000000-0000-0000-0000-00000000b101'),2,'payment failure keeps stack');
select * from finish();
rollback;
