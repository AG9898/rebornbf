-- M3-03C: server-derived guest rarity/level and exclusive ally choices.
begin;
select plan(14);

insert into auth.users(id, email) values
  ('00000000-0000-0000-0000-0000000000c1', 'guests-a@example.test'),
  ('00000000-0000-0000-0000-0000000000c2', 'guests-b@example.test');
insert into public.owned_units(id, user_id, unit_id, form_id, level) values
  ('00000000-0000-0000-0000-00000000c101', '00000000-0000-0000-0000-0000000000c1', 'brand', 'brand-omni', 150),
  ('00000000-0000-0000-0000-00000000c201', '00000000-0000-0000-0000-0000000000c2', 'aurelle', 'aurelle-omni', 150);
insert into public.content_items(kind,id,data) values
  ('stage','guest-test-stage','{"id":"guest-test-stage","story":{"number":1}}');

select ok(not has_function_privilege('anon', 'public.save_squad(smallint,uuid[],smallint,uuid,text)', 'execute'), 'anon cannot save guests');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000c1","role":"authenticated"}', true);
select lives_ok($$select public.save_squad(0::smallint,array['00000000-0000-0000-0000-00000000c101']::uuid[],0::smallint,null,'aurelle')$$, 'saves a guest without owning it');
select is((select guest_id from public.squads where slot=0), 'aurelle', 'persists the guest ID');
select throws_ok($$select public.save_squad(0::smallint,array['00000000-0000-0000-0000-00000000c101']::uuid[],0::smallint,null,'brand')$$, '22023', null, 'rejects a unit outside the guest pool');
select throws_ok($$select public.save_squad(0::smallint,array['00000000-0000-0000-0000-00000000c101']::uuid[],0::smallint,'00000000-0000-0000-0000-00000000c101','aurelle')$$, '22023', null, 'rejects both ally choices');
select throws_ok($$select public.save_squad(0::smallint,array['00000000-0000-0000-0000-00000000c201']::uuid[],0::smallint,null,'aurelle')$$, '22023', null, 'cannot use another player squad unit');
select is((public.start_battle('guest-test-stage')).squad -> 'ally' ->> 'form_id', 'aurelle-6', 'unowned guest caps at six despite another player Omni');
select is(((public.start_battle('guest-test-stage')).squad -> 'ally' ->> 'level')::integer, 100, 'level caps at the guest form maximum');
select is((public.start_battle('guest-test-stage')).squad -> 'ally' ->> 'kind', 'guest', 'snapshot identifies the guest');
reset role;
insert into public.owned_units(id,user_id,unit_id,form_id,level) values
  ('00000000-0000-0000-0000-00000000c102','00000000-0000-0000-0000-0000000000c1','aurelle','aurelle-7',1);
set local role authenticated;
select is((public.start_battle('guest-test-stage')).squad -> 'ally' ->> 'form_id', 'aurelle-7', 'same unit ownership lifts cap');
reset role;
update public.owned_units set form_id='aurelle-omni' where id='00000000-0000-0000-0000-00000000c102';
set local role authenticated;
select is((public.start_battle('guest-test-stage')).squad -> 'ally' ->> 'form_id', 'aurelle-omni', 'own Omni unlocks guest Omni');
select lives_ok($$select public.save_squad(0::smallint,array['00000000-0000-0000-0000-00000000c101']::uuid[],0::smallint,null,'vespera')$$, 'can switch guests');
select is((public.start_battle('guest-test-stage')).squad -> 'ally' ->> 'form_id', 'vespera-6', 'cap lift is per guest unit');
select set_config('request.jwt.claims','{"role":"authenticated"}',true);
select throws_ok($$select public.save_squad(0::smallint,array['00000000-0000-0000-0000-00000000c101']::uuid[],0::smallint,null,'aurelle')$$, '42501', null, 'signed out cannot save guest');
select * from finish();
rollback;
