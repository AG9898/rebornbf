-- M4-06H: sell_units sells 1-10 copies of sale units (forms with sellZel) for Zel (RESOLVED-79).
-- Launch content has no sale units, so the test inserts its own inside this transaction.
begin;
select plan(30);

-- Privileges and content (4) ---------------------------------------------------------------------
select ok(has_function_privilege('authenticated', 'public.sell_units(uuid[], jsonb)', 'execute'),
  'players may sell units');
select ok(not has_function_privilege('anon', 'public.sell_units(uuid[], jsonb)', 'execute'),
  'signed-out callers may not');
select is((select count(*)::integer from public.content_items c,
    jsonb_array_elements(c.data -> 'forms') f
  where c.kind = 'unit' and f.value ? 'sellZel'), 0,
  'no launch unit form is a sale unit');
select throws_ok($$select public.sell_units(array['00000000-0000-0000-0000-00000000c011']::uuid[])$$,
  '42501', null, 'selling needs a signed-in player');

-- Fixtures ----------------------------------------------------------------------------------------
insert into public.content_items (kind, id, data) values
  ('unit', 'sale-relic', '{"id":"sale-relic","forms":[{"id":"sale-relic-4","rarity":4,"sellZel":20000}]}'),
  ('unit', 'sale-gem', '{"id":"sale-gem","stackable":true,"forms":[{"id":"sale-gem-3","rarity":3,"sellZel":5000}]}');

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000c0a1', 'sell-a@example.test'),
  ('00000000-0000-0000-0000-00000000c0a2', 'sell-b@example.test');

insert into public.owned_units (id, user_id, unit_id, form_id) values
  ('00000000-0000-0000-0000-00000000c011', '00000000-0000-0000-0000-00000000c0a1', 'sale-relic', 'sale-relic-4'),
  ('00000000-0000-0000-0000-00000000c012', '00000000-0000-0000-0000-00000000c0a1', 'sale-relic', 'sale-relic-4'),
  ('00000000-0000-0000-0000-00000000c013', '00000000-0000-0000-0000-00000000c0a1', 'brand', 'brand-3'),
  ('00000000-0000-0000-0000-00000000c014', '00000000-0000-0000-0000-00000000c0a1', 'sale-relic', 'sale-relic-4'),
  ('00000000-0000-0000-0000-00000000c015', '00000000-0000-0000-0000-00000000c0a1', 'sale-relic', 'sale-relic-4'),
  ('00000000-0000-0000-0000-00000000c021', '00000000-0000-0000-0000-00000000c0a2', 'sale-relic', 'sale-relic-4');

insert into public.owned_unit_stacks (id, user_id, unit_id, form_id, count) values
  ('00000000-0000-0000-0000-00000000c5c1', '00000000-0000-0000-0000-00000000c0a1', 'sale-gem', 'sale-gem-3', 12),
  ('00000000-0000-0000-0000-00000000c5c2', '00000000-0000-0000-0000-00000000c0a1', 'cinder-sprite', 'cinder-sprite-2', 2);

-- c012 is in a saved squad; c014 wears a sphere.
insert into public.squads (user_id, slot, unit_ids, leader_index) values
  ('00000000-0000-0000-0000-00000000c0a1', 0, array['00000000-0000-0000-0000-00000000c012']::uuid[], 0);
insert into public.owned_spheres (id, user_id, sphere_id) values
  ('00000000-0000-0000-0000-00000000c5f1', '00000000-0000-0000-0000-00000000c0a1', 'emberheart');
insert into public.unit_spheres (user_id, owned_unit_id, slot, owned_sphere_id) values
  ('00000000-0000-0000-0000-00000000c0a1', '00000000-0000-0000-0000-00000000c014', 1,
   '00000000-0000-0000-0000-00000000c5f1');
insert into public.wallets (user_id, zel) values ('00000000-0000-0000-0000-00000000c0a1', 100);

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000c0a1","role":"authenticated"}', true);

-- Refused sales change nothing (11) ---------------------------------------------------------------
select throws_ok($$select public.sell_units(array['00000000-0000-0000-0000-00000000c013']::uuid[])$$,
  '22023', null, 'a form without sellZel is refused');
select throws_ok($$select public.sell_units(array['00000000-0000-0000-0000-00000000c011',
  '00000000-0000-0000-0000-00000000c013']::uuid[])$$,
  '22023', null, 'one unsellable unit refuses the whole sale');
select throws_ok($$select public.sell_units('{}', '{"00000000-0000-0000-0000-00000000c5c2": 1}')$$,
  '22023', null, 'a stack of a non-sale unit is refused');
select throws_ok($$select public.sell_units(array['00000000-0000-0000-0000-00000000c021']::uuid[])$$,
  '22023', null, 'another player''s unit is refused');
select throws_ok($$select public.sell_units(array['00000000-0000-0000-0000-00000000c012']::uuid[])$$,
  '22023', null, 'a unit in a saved squad is refused');
select throws_ok($$select public.sell_units('{}', '{"00000000-0000-0000-0000-00000000c5c1": 11}')$$,
  '22023', null, 'more than 10 copies from a stack are refused');
select throws_ok($$select public.sell_units(array['00000000-0000-0000-0000-00000000c011',
  '00000000-0000-0000-0000-00000000c014']::uuid[], '{"00000000-0000-0000-0000-00000000c5c1": 9}')$$,
  '22023', null, 'more than 10 copies across rows and stacks are refused');
select throws_ok($$select public.sell_units('{}', '{}')$$,
  '22023', null, 'an empty sale is refused');
select throws_ok($$select public.sell_units(array['00000000-0000-0000-0000-00000000c011',
  '00000000-0000-0000-0000-00000000c011']::uuid[])$$,
  '22023', null, 'a repeated unit is refused');
select is((select zel from public.wallets where user_id = auth.uid()), 100::bigint,
  'refused sales credit no Zel');
select is((select count(*)::integer from public.owned_units where user_id = auth.uid()), 5,
  'refused sales keep every unit');

-- A sale of rows and stack copies (12) ------------------------------------------------------------
select is(public.sell_units(array['00000000-0000-0000-0000-00000000c011',
    '00000000-0000-0000-0000-00000000c014']::uuid[], '{"00000000-0000-0000-0000-00000000c5c1": 3}'),
  '{"zel_earned": 55000, "zel": 55100, "units_sold": 5, "spheres_returned": 1}'::jsonb,
  'two relics and three gems sell for sellZel per copy');
select is((select zel from public.wallets where user_id = auth.uid()), 55100::bigint,
  'the Zel is credited');
select is((select count(*)::integer from public.owned_units
  where id in ('00000000-0000-0000-0000-00000000c011', '00000000-0000-0000-0000-00000000c014')), 0,
  'sold rows are deleted');
select is((select count from public.owned_unit_stacks where id = '00000000-0000-0000-0000-00000000c5c1'),
  9, 'the stack is decremented');
select ok(exists (select 1 from public.owned_spheres where id = '00000000-0000-0000-0000-00000000c5f1'),
  'the equipped sphere stays in the inventory');
select is((select count(*)::integer from public.unit_spheres
  where owned_unit_id = '00000000-0000-0000-0000-00000000c014'), 0, 'and is no longer equipped');
select is((select owned_sphere_id from public.sphere_equip_log
  where owned_unit_id = '00000000-0000-0000-0000-00000000c014'), null::uuid,
  'the unequip is logged');
select results_eq($$select delta, balance_after, reason from public.wallet_log
  where user_id = auth.uid()$$,
  $$values (55000::bigint, 55100::bigint, 'sell_units'::text)$$,
  'one wallet_log row records the sale');
select results_eq($$select owned_unit_id, delta::integer, reason from public.unit_log
  where user_id = auth.uid() order by owned_unit_id$$,
  $$values ('00000000-0000-0000-0000-00000000c011'::uuid, -1, 'sell_units'::text),
           ('00000000-0000-0000-0000-00000000c014'::uuid, -1, 'sell_units'::text)$$,
  'each sold row is logged in unit_log');
select results_eq($$select delta, count_after, reason from public.unit_stack_log
  where user_id = auth.uid()$$,
  $$values (-3, 9, 'sell_units'::text)$$,
  'the stack decrement is logged in unit_stack_log');
select is((select count(distinct ref_id)::integer from (
    select ref_id from public.wallet_log where user_id = auth.uid()
    union all select ref_id from public.unit_log where user_id = auth.uid()
    union all select ref_id from public.unit_stack_log where user_id = auth.uid()) r), 1,
  'every log row of the sale shares one ref_id');
select is((select count(*)::integer from public.owned_units
  where id in ('00000000-0000-0000-0000-00000000c012', '00000000-0000-0000-0000-00000000c013')), 2,
  'unsold units are untouched');

-- Exactly 10 copies is allowed (3) -----------------------------------------------------------------
select is(public.sell_units(array['00000000-0000-0000-0000-00000000c015']::uuid[],
    '{"00000000-0000-0000-0000-00000000c5c1": 9}') ->> 'zel_earned', '65000',
  'a 10-copy sale goes through');
select is((select count from public.owned_unit_stacks where id = '00000000-0000-0000-0000-00000000c5c1'),
  0, 'the stack is emptied');
select is((select zel from public.wallets where user_id = auth.uid()), 120100::bigint,
  'and its Zel is credited');

select * from finish();
rollback;
