-- M3-04H: per-run guests with server-derived rarity/level, never saved on squads.
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

select ok(not has_function_privilege('anon', 'public.start_battle(text,smallint,text,jsonb,jsonb)', 'execute'), 'anon cannot start with guests');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000c1","role":"authenticated"}', true);
select lives_ok($$select public.save_squad(0::smallint,array['00000000-0000-0000-0000-00000000c101']::uuid[],0::smallint)$$, 'saves the squad without an ally');
select lives_ok($$select public.start_battle('guest-test-stage',0::smallint,'aurelle')$$, 'uses a guest without owning it');
select throws_ok($$select public.start_battle('guest-test-stage',0::smallint,'brand')$$, '22023', null, 'rejects a unit outside the guest pool');
select is((public.start_battle('guest-test-stage')).squad -> 'ally', 'null'::jsonb, 'guest choice is not persisted');
select throws_ok($$select public.save_squad(0::smallint,array['00000000-0000-0000-0000-00000000c201']::uuid[],0::smallint)$$, '22023', null, 'cannot use another player squad unit');
select is((public.start_battle('guest-test-stage',0::smallint,'aurelle')).squad -> 'ally' ->> 'form_id', 'aurelle-6', 'unowned guest caps at six despite another player Omni');
select is(((public.start_battle('guest-test-stage',0::smallint,'aurelle')).squad -> 'ally' ->> 'level')::integer, 100, 'level caps at the guest form maximum');
select is((public.start_battle('guest-test-stage',0::smallint,'aurelle')).squad -> 'ally' ->> 'kind', 'guest', 'snapshot identifies the guest');
reset role;
insert into public.owned_units(id,user_id,unit_id,form_id,level) values
  ('00000000-0000-0000-0000-00000000c102','00000000-0000-0000-0000-0000000000c1','aurelle','aurelle-7',1);
set local role authenticated;
select is((public.start_battle('guest-test-stage',0::smallint,'aurelle')).squad -> 'ally' ->> 'form_id', 'aurelle-7', 'same unit ownership lifts cap');
reset role;
update public.owned_units set form_id='aurelle-omni' where id='00000000-0000-0000-0000-00000000c102';
set local role authenticated;
select is((public.start_battle('guest-test-stage',0::smallint,'aurelle')).squad -> 'ally' ->> 'form_id', 'aurelle-omni', 'own Omni unlocks guest Omni');
select lives_ok($$select public.start_battle('guest-test-stage',0::smallint,'vespera')$$, 'can switch guests per run');
select is((public.start_battle('guest-test-stage',0::smallint,'vespera')).squad -> 'ally' ->> 'form_id', 'vespera-6', 'cap lift is per guest unit');
select set_config('request.jwt.claims','{"role":"authenticated"}',true);
select throws_ok($$select public.start_battle('guest-test-stage',0::smallint,'aurelle')$$, '42501', null, 'signed out cannot start with a guest');
select * from finish();
rollback;
