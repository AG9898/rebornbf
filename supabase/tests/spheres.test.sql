-- Equipment instances, access, second-slot gating and frozen battle snapshots.
begin;
select plan(22);
insert into public.content_items(kind,id,data) values
  ('stage','sphere-test-stage','{"id":"sphere-test-stage","story":{"number":1}}');
insert into auth.users(id, email) values
  ('00000000-0000-0000-0000-0000000000d1','spheres-a@example.test'),
  ('00000000-0000-0000-0000-0000000000d2','spheres-b@example.test');
insert into public.owned_units(id,user_id,unit_id,form_id,level) values
  ('00000000-0000-0000-0000-00000000d101','00000000-0000-0000-0000-0000000000d1','brand','brand-omni',150),
  ('00000000-0000-0000-0000-00000000d102','00000000-0000-0000-0000-0000000000d1','maren','maren-omni',150),
  ('00000000-0000-0000-0000-00000000d201','00000000-0000-0000-0000-0000000000d2','brand','brand-omni',150);
insert into public.owned_spheres(id,user_id,sphere_id) values
  ('00000000-0000-0000-0000-00000000d111','00000000-0000-0000-0000-0000000000d1','wayfarer-seal'),
  ('00000000-0000-0000-0000-00000000d112','00000000-0000-0000-0000-0000000000d1','vanguard-seal'),
  ('00000000-0000-0000-0000-00000000d113','00000000-0000-0000-0000-0000000000d1','emberheart'),
  ('00000000-0000-0000-0000-00000000d211','00000000-0000-0000-0000-0000000000d2','wayfarer-seal');
select ok(not has_function_privilege('anon','public.equip_sphere(uuid,smallint,uuid)','execute'),'anon cannot equip');
select ok(not has_column_privilege('authenticated','public.owned_units','second_sphere_slot','update'),'client cannot unlock slot');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-0000000000d1","role":"authenticated"}',true);
select is((select count(*)::integer from public.owned_spheres),3,'RLS hides other inventory');
select throws_ok($$insert into public.owned_spheres(user_id,sphere_id) values(auth.uid(),'emberheart')$$,'42501',null,'cannot grant equipment');
select throws_ok($$select public.equip_sphere('00000000-0000-0000-0000-00000000d201',1::smallint,'00000000-0000-0000-0000-00000000d111')$$,'22023',null,'cannot equip foreign unit');
select throws_ok($$select public.equip_sphere('00000000-0000-0000-0000-00000000d101',1::smallint,'00000000-0000-0000-0000-00000000d211')$$,'22023',null,'cannot equip foreign sphere');
select throws_ok($$select public.equip_sphere('00000000-0000-0000-0000-00000000d101',2::smallint,'00000000-0000-0000-0000-00000000d111')$$,'22023',null,'Omni rarity does not unlock slot');
select throws_ok($$select public.equip_sphere('00000000-0000-0000-0000-00000000d101',null::smallint,null)$$,'22023',null,'null slot refused');
select lives_ok($$select public.equip_sphere('00000000-0000-0000-0000-00000000d101',1::smallint,'00000000-0000-0000-0000-00000000d111')$$,'equips first slot');
select lives_ok($$select public.equip_sphere('00000000-0000-0000-0000-00000000d101',1::smallint,'00000000-0000-0000-0000-00000000d111')$$,'repeated equip is idempotent');
select is((select count(*)::integer from public.sphere_equip_log),1,'repeat does not duplicate log');
select throws_ok($$select public.equip_sphere('00000000-0000-0000-0000-00000000d102',1::smallint,'00000000-0000-0000-0000-00000000d111')$$,'22023',null,'instance cannot be used twice');
reset role;
update public.owned_units set second_sphere_slot = true where id='00000000-0000-0000-0000-00000000d101';
set local role authenticated;
select throws_ok($$select public.equip_sphere('00000000-0000-0000-0000-00000000d101',2::smallint,'00000000-0000-0000-0000-00000000d112')$$,'22023',null,'two all-stat spheres refused after unlock');
select lives_ok($$select public.equip_sphere('00000000-0000-0000-0000-00000000d101',2::smallint,'00000000-0000-0000-0000-00000000d113')$$,'signature in unlocked slot');
select throws_ok($$select public.equip_sphere('00000000-0000-0000-0000-00000000d102',2::smallint,null)$$,'22023',null,'unlock is unit-specific');
select public.save_squad(0::smallint,array['00000000-0000-0000-0000-00000000d101']::uuid[],0::smallint);
create temporary table sphere_session as select (public.start_battle('sphere-test-stage',0::smallint,'00000000-0000-0000-0000-00000000d101')).*;
select is((select squad -> 'units' -> 0 -> 'spheres' from sphere_session),'["wayfarer-seal","emberheart"]'::jsonb,'snapshot carries content IDs in slot order');
select is((select squad -> 'ally' -> 'spheres' from sphere_session),'["wayfarer-seal","emberheart"]'::jsonb,'duplicate ally carries equipment');
select is((select squad -> 'units' -> 0 ->> 'second_sphere_slot' from sphere_session),'true','snapshot carries persisted unlock');
select lives_ok($$select public.equip_sphere('00000000-0000-0000-0000-00000000d101',1::smallint,null)$$,'unequip returns instance to inventory');
select is((select b.squad -> 'units' -> 0 -> 'spheres' from public.battle_sessions b join sphere_session s on b.id=s.id),'["wayfarer-seal","emberheart"]'::jsonb,'old session is frozen after gear change');
select lives_ok($$select public.equip_sphere('00000000-0000-0000-0000-00000000d102',1::smallint,'00000000-0000-0000-0000-00000000d111')$$,'freed instance can equip elsewhere');
select set_config('request.jwt.claims','{"role":"authenticated"}',true);
select throws_ok($$select public.equip_sphere('00000000-0000-0000-0000-00000000d101',1::smallint,null)$$,'42501',null,'signed out refused');
select * from finish();
rollback;
