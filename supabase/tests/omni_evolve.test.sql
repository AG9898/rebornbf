-- M4-02B: Omni evolution (RESOLVED-69) goes through the generic evolve RPC (M4-02A): a max-level
-- 7-star Brand with its full 7-star recipe (seven material units, a Crown Shard, a Zenith Core, and
-- 3,000,000 Zel) becomes a level-1 Brand Omni in one transaction. Missing any material unit, the
-- Crown Shard, the Zenith Core, or Zel rejects the call with nothing changed, and Omni cannot evolve.
-- Players: f1 has everything; f2 lacks the Zenith Core; f3 lacks the Crown Shard; f4 is 1 Zel short.
begin;
select plan(16);

-- Fixtures ----------------------------------------------------------------------------------------
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000f1', 'omni-1@example.test'),
  ('00000000-0000-0000-0000-0000000000f2', 'omni-2@example.test'),
  ('00000000-0000-0000-0000-0000000000f3', 'omni-3@example.test'),
  ('00000000-0000-0000-0000-0000000000f4', 'omni-4@example.test');

-- Per player: unit ...f<p>0 is a level-120 Brand 7-star; ...f<p>1-7 are the recipe's material units
-- (Colossus x2, Prism Cairn, Cairn, Effigy, Sprite, Mote).
insert into public.owned_units (id, user_id, unit_id, form_id, level) values
  ('00000000-0000-0000-0000-000000000f10', '00000000-0000-0000-0000-0000000000f1', 'brand', 'brand-7', 120),
  ('00000000-0000-0000-0000-000000000f11', '00000000-0000-0000-0000-0000000000f1', 'cinder-colossus', 'cinder-colossus-5', 1),
  ('00000000-0000-0000-0000-000000000f12', '00000000-0000-0000-0000-0000000000f1', 'cinder-colossus', 'cinder-colossus-5', 1),
  ('00000000-0000-0000-0000-000000000f13', '00000000-0000-0000-0000-0000000000f1', 'prism-cairn', 'prism-cairn-5', 1),
  ('00000000-0000-0000-0000-000000000f14', '00000000-0000-0000-0000-0000000000f1', 'cinder-cairn', 'cinder-cairn-4', 1),
  ('00000000-0000-0000-0000-000000000f15', '00000000-0000-0000-0000-0000000000f1', 'cinder-effigy', 'cinder-effigy-3', 1),
  ('00000000-0000-0000-0000-000000000f16', '00000000-0000-0000-0000-0000000000f1', 'cinder-sprite', 'cinder-sprite-2', 1),
  ('00000000-0000-0000-0000-000000000f17', '00000000-0000-0000-0000-0000000000f1', 'cinder-mote', 'cinder-mote-1', 1),
  ('00000000-0000-0000-0000-000000000f20', '00000000-0000-0000-0000-0000000000f2', 'brand', 'brand-7', 120),
  ('00000000-0000-0000-0000-000000000f21', '00000000-0000-0000-0000-0000000000f2', 'cinder-colossus', 'cinder-colossus-5', 1),
  ('00000000-0000-0000-0000-000000000f22', '00000000-0000-0000-0000-0000000000f2', 'cinder-colossus', 'cinder-colossus-5', 1),
  ('00000000-0000-0000-0000-000000000f23', '00000000-0000-0000-0000-0000000000f2', 'prism-cairn', 'prism-cairn-5', 1),
  ('00000000-0000-0000-0000-000000000f24', '00000000-0000-0000-0000-0000000000f2', 'cinder-cairn', 'cinder-cairn-4', 1),
  ('00000000-0000-0000-0000-000000000f25', '00000000-0000-0000-0000-0000000000f2', 'cinder-effigy', 'cinder-effigy-3', 1),
  ('00000000-0000-0000-0000-000000000f26', '00000000-0000-0000-0000-0000000000f2', 'cinder-sprite', 'cinder-sprite-2', 1),
  ('00000000-0000-0000-0000-000000000f27', '00000000-0000-0000-0000-0000000000f2', 'cinder-mote', 'cinder-mote-1', 1),
  ('00000000-0000-0000-0000-000000000f30', '00000000-0000-0000-0000-0000000000f3', 'brand', 'brand-7', 120),
  ('00000000-0000-0000-0000-000000000f31', '00000000-0000-0000-0000-0000000000f3', 'cinder-colossus', 'cinder-colossus-5', 1),
  ('00000000-0000-0000-0000-000000000f32', '00000000-0000-0000-0000-0000000000f3', 'cinder-colossus', 'cinder-colossus-5', 1),
  ('00000000-0000-0000-0000-000000000f33', '00000000-0000-0000-0000-0000000000f3', 'prism-cairn', 'prism-cairn-5', 1),
  ('00000000-0000-0000-0000-000000000f34', '00000000-0000-0000-0000-0000000000f3', 'cinder-cairn', 'cinder-cairn-4', 1),
  ('00000000-0000-0000-0000-000000000f35', '00000000-0000-0000-0000-0000000000f3', 'cinder-effigy', 'cinder-effigy-3', 1),
  ('00000000-0000-0000-0000-000000000f36', '00000000-0000-0000-0000-0000000000f3', 'cinder-sprite', 'cinder-sprite-2', 1),
  ('00000000-0000-0000-0000-000000000f37', '00000000-0000-0000-0000-0000000000f3', 'cinder-mote', 'cinder-mote-1', 1),
  ('00000000-0000-0000-0000-000000000f40', '00000000-0000-0000-0000-0000000000f4', 'brand', 'brand-7', 120),
  ('00000000-0000-0000-0000-000000000f41', '00000000-0000-0000-0000-0000000000f4', 'cinder-colossus', 'cinder-colossus-5', 1),
  ('00000000-0000-0000-0000-000000000f42', '00000000-0000-0000-0000-0000000000f4', 'cinder-colossus', 'cinder-colossus-5', 1),
  ('00000000-0000-0000-0000-000000000f43', '00000000-0000-0000-0000-0000000000f4', 'prism-cairn', 'prism-cairn-5', 1),
  ('00000000-0000-0000-0000-000000000f44', '00000000-0000-0000-0000-0000000000f4', 'cinder-cairn', 'cinder-cairn-4', 1),
  ('00000000-0000-0000-0000-000000000f45', '00000000-0000-0000-0000-0000000000f4', 'cinder-effigy', 'cinder-effigy-3', 1),
  ('00000000-0000-0000-0000-000000000f46', '00000000-0000-0000-0000-0000000000f4', 'cinder-sprite', 'cinder-sprite-2', 1),
  ('00000000-0000-0000-0000-000000000f47', '00000000-0000-0000-0000-0000000000f4', 'cinder-mote', 'cinder-mote-1', 1);

insert into public.wallets (user_id, zel) values
  ('00000000-0000-0000-0000-0000000000f1', 3000000), ('00000000-0000-0000-0000-0000000000f2', 3000000), ('00000000-0000-0000-0000-0000000000f3', 3000000), ('00000000-0000-0000-0000-0000000000f4', 2999999);
select public.grant_item('00000000-0000-0000-0000-0000000000f1', 'crown-shard', 1, 'test');
select public.grant_item('00000000-0000-0000-0000-0000000000f1', 'zenith-core', 1, 'test');
select public.grant_item('00000000-0000-0000-0000-0000000000f2', 'crown-shard', 1, 'test');
select public.grant_item('00000000-0000-0000-0000-0000000000f3', 'zenith-core', 1, 'test');
select public.grant_item('00000000-0000-0000-0000-0000000000f4', 'crown-shard', 1, 'test');
select public.grant_item('00000000-0000-0000-0000-0000000000f4', 'zenith-core', 1, 'test');

-- Rejections (4) ----------------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000f1","role":"authenticated"}', true);
select throws_ok($$select public.evolve('00000000-0000-0000-0000-000000000f10', array['00000000-0000-0000-0000-000000000f11', '00000000-0000-0000-0000-000000000f12', '00000000-0000-0000-0000-000000000f13', '00000000-0000-0000-0000-000000000f14', '00000000-0000-0000-0000-000000000f15', '00000000-0000-0000-0000-000000000f16']::uuid[])$$,
  '22023', null, 'a 7-star Omni evolution missing a material unit (the Mote) is rejected');
reset role;

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000f2","role":"authenticated"}', true);
select throws_ok($$select public.evolve('00000000-0000-0000-0000-000000000f20', array['00000000-0000-0000-0000-000000000f21', '00000000-0000-0000-0000-000000000f22', '00000000-0000-0000-0000-000000000f23', '00000000-0000-0000-0000-000000000f24', '00000000-0000-0000-0000-000000000f25', '00000000-0000-0000-0000-000000000f26', '00000000-0000-0000-0000-000000000f27']::uuid[])$$,
  '22023', null, 'a 7-star Omni evolution without a Zenith Core is rejected');
reset role;

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000f3","role":"authenticated"}', true);
select throws_ok($$select public.evolve('00000000-0000-0000-0000-000000000f30', array['00000000-0000-0000-0000-000000000f31', '00000000-0000-0000-0000-000000000f32', '00000000-0000-0000-0000-000000000f33', '00000000-0000-0000-0000-000000000f34', '00000000-0000-0000-0000-000000000f35', '00000000-0000-0000-0000-000000000f36', '00000000-0000-0000-0000-000000000f37']::uuid[])$$,
  '22023', null, 'a 7-star Omni evolution without a Crown Shard is rejected');
reset role;

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000f4","role":"authenticated"}', true);
select throws_ok($$select public.evolve('00000000-0000-0000-0000-000000000f40', array['00000000-0000-0000-0000-000000000f41', '00000000-0000-0000-0000-000000000f42', '00000000-0000-0000-0000-000000000f43', '00000000-0000-0000-0000-000000000f44', '00000000-0000-0000-0000-000000000f45', '00000000-0000-0000-0000-000000000f46', '00000000-0000-0000-0000-000000000f47']::uuid[])$$,
  'P0001', null, 'a 7-star Omni evolution 1 Zel short is rejected');
reset role;

-- Success, then Omni cannot evolve further (2) ------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000f1","role":"authenticated"}', true);
select is(public.evolve('00000000-0000-0000-0000-000000000f10', array['00000000-0000-0000-0000-000000000f11', '00000000-0000-0000-0000-000000000f12', '00000000-0000-0000-0000-000000000f13', '00000000-0000-0000-0000-000000000f14', '00000000-0000-0000-0000-000000000f15', '00000000-0000-0000-0000-000000000f16', '00000000-0000-0000-0000-000000000f17']::uuid[]),
  '{"unit_id":"00000000-0000-0000-0000-000000000f10","from_form_id":"brand-7","form_id":"brand-omni","level":1,"exp":0,"zel_spent":3000000,"materials_consumed":7,"items":[{"item":"crown-shard","count":1},{"item":"zenith-core","count":1}]}'::jsonb,
  'Brand 7-star to Omni: seven units, a Crown Shard, a Zenith Core, and 3,000,000 Zel');
select throws_ok($$select public.evolve('00000000-0000-0000-0000-000000000f10', '{}'::uuid[])$$,
  '22023', null, 'the new Omni form cannot evolve further');
reset role;

-- State after the calls (10) ----------------------------------------------------------------------
select is((select form_id || '/' || level || '/' || exp from public.owned_units where id = '00000000-0000-0000-0000-000000000f10'),
  'brand-omni/1/0', 'the 7-star unit is now a level-1 Omni with 0 EXP');
select is((select count(*)::int from public.owned_units where user_id = '00000000-0000-0000-0000-0000000000f1'),
  1, 'every material unit of the Omni evolution is consumed');
select is((select zel from public.wallets where user_id = '00000000-0000-0000-0000-0000000000f1'),
  0::bigint, 'the Omni evolution charged 3,000,000 Zel');
select is((select sum(delta) from public.wallet_log where user_id = '00000000-0000-0000-0000-0000000000f1' and reason = 'evolution'),
  -3000000::numeric, 'the Zel debit was logged');
select is((select string_agg(item_id || ':' || count, ',' order by item_id) from public.owned_items where user_id = '00000000-0000-0000-0000-0000000000f1'),
  'crown-shard:0,zenith-core:0', 'the Crown Shard and Zenith Core were consumed');
select is((select string_agg(item_id || ':' || delta || ':' || ref_id, ',' order by item_id) from public.item_log
    where user_id = '00000000-0000-0000-0000-0000000000f1' and reason = 'evolution'),
  'crown-shard:-1:00000000-0000-0000-0000-000000000f10,zenith-core:-1:00000000-0000-0000-0000-000000000f10', 'both item uses were logged against the unit');
select is((select count(*)::int from public.owned_units
    where user_id in ('00000000-0000-0000-0000-0000000000f2', '00000000-0000-0000-0000-0000000000f3', '00000000-0000-0000-0000-0000000000f4') and form_id = 'brand-7' and level = 120),
  3, 'the rejected 7-star units are unchanged');
select is((select count(*)::int from public.owned_units where id in ('00000000-0000-0000-0000-000000000f21', '00000000-0000-0000-0000-000000000f22', '00000000-0000-0000-0000-000000000f23', '00000000-0000-0000-0000-000000000f24', '00000000-0000-0000-0000-000000000f25', '00000000-0000-0000-0000-000000000f26', '00000000-0000-0000-0000-000000000f27', '00000000-0000-0000-0000-000000000f31', '00000000-0000-0000-0000-000000000f32', '00000000-0000-0000-0000-000000000f33', '00000000-0000-0000-0000-000000000f34', '00000000-0000-0000-0000-000000000f35', '00000000-0000-0000-0000-000000000f36', '00000000-0000-0000-0000-000000000f37', '00000000-0000-0000-0000-000000000f41', '00000000-0000-0000-0000-000000000f42', '00000000-0000-0000-0000-000000000f43', '00000000-0000-0000-0000-000000000f44', '00000000-0000-0000-0000-000000000f45', '00000000-0000-0000-0000-000000000f46', '00000000-0000-0000-0000-000000000f47')),
  21, 'materials of rejected evolutions survive');
select is((select string_agg(zel::text, ',' order by user_id) from public.wallets
    where user_id in ('00000000-0000-0000-0000-0000000000f2', '00000000-0000-0000-0000-0000000000f3', '00000000-0000-0000-0000-0000000000f4')),
  '3000000,3000000,2999999', 'rejected evolutions charged no Zel');
select is((select string_agg(user_id::text || ':' || item_id || ':' || count, ',' order by user_id, item_id) from public.owned_items
    where user_id in ('00000000-0000-0000-0000-0000000000f2', '00000000-0000-0000-0000-0000000000f3', '00000000-0000-0000-0000-0000000000f4')),
  '00000000-0000-0000-0000-0000000000f2:crown-shard:1,00000000-0000-0000-0000-0000000000f3:zenith-core:1,00000000-0000-0000-0000-0000000000f4:crown-shard:1,00000000-0000-0000-0000-0000000000f4:zenith-core:1',
  'rejected evolutions consumed no items');

select * from finish();
rollback;
