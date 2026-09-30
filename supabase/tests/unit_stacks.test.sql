-- M4-05A: untouched fodder and material units stack as counts (RESOLVED-75).
begin;
select plan(47);

-- Privileges and RLS (9) -------------------------------------------------------------------------
select ok((select bool_and(relrowsecurity) from pg_class where oid in
  ('public.owned_unit_stacks'::regclass, 'public.unit_stack_log'::regclass)), 'RLS enabled');
select ok(has_function_privilege('authenticated', 'public.split_unit_stack(uuid)', 'execute'),
  'players can split a stack');
select ok(not has_function_privilege('anon', 'public.split_unit_stack(uuid)', 'execute'),
  'anon cannot split');
select ok((select prosecdef from pg_proc where oid = 'public.split_unit_stack(uuid)'::regprocedure),
  'split_unit_stack is security definer');
select ok(not has_function_privilege('authenticated',
  'public.acquire_unit(uuid, text, text, text, uuid)', 'execute'), 'acquire_unit is internal');
select ok(not has_function_privilege('service_role',
  'public.acquire_unit(uuid, text, text, text, uuid)', 'execute'), 'acquire_unit is internal to service_role');
select ok(not has_function_privilege('authenticated',
  'public.change_unit_stack(uuid, text, text, integer, text, uuid)', 'execute'),
  'change_unit_stack is internal');
select ok(not has_function_privilege('authenticated', 'public.fold_untouched_unit_stacks()', 'execute'),
  'the fold is internal');
select ok(not has_function_privilege('authenticated', 'public.unit_is_stackable(text)', 'execute'),
  'unit_is_stackable is internal');

-- Seeded content (3) -----------------------------------------------------------------------------
select ok(public.unit_is_stackable('moss-mote') and public.unit_is_stackable('cinder-grail')
  and public.unit_is_stackable('prism-cairn') and public.unit_is_stackable('brass-crucible'),
  'seeded fodder and material units are stackable');
select ok(not public.unit_is_stackable('brand') and not public.unit_is_stackable('placeholder-ember')
  and not public.unit_is_stackable('no-such-unit'), 'multi-form, placeholder, and unknown units are not');
select is((select count(*)::int from public.content_items
  where kind = 'unit' and data -> 'stackable' = 'true'::jsonb and jsonb_array_length(data -> 'forms') > 1),
  0, 'no seeded multi-form unit is stackable');

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000a501', 'stacks-a@example.test'),
  ('00000000-0000-0000-0000-00000000a502', 'stacks-b@example.test');

-- Grants (10) ------------------------------------------------------------------------------------
select throws_ok($$select public.grant_unit('00000000-0000-0000-0000-00000000a501', 'moss-mote')$$,
  '22023', null, 'grant_unit refuses a stackable unit');
create temporary table acquired on commit drop as
select 1 as n, public.acquire_unit('00000000-0000-0000-0000-00000000a501', 'moss-mote', null,
  'test_grant') as r;
insert into acquired
select 2, public.acquire_unit('00000000-0000-0000-0000-00000000a501', 'moss-mote', 'moss-mote-1',
  'test_grant');
insert into acquired
select 3, public.acquire_unit('00000000-0000-0000-0000-00000000a501', 'brand', 'brand-3', 'test_grant');
select is((select r -> 'stacked' from acquired where n = 1), 'true'::jsonb,
  'a stackable acquisition is stacked');
select is((select r ->> 'count_after' from acquired where n = 2), '2', 'a second copy counts 2');
select is((select count from public.owned_unit_stacks
  where user_id = '00000000-0000-0000-0000-00000000a501' and unit_id = 'moss-mote'), 2,
  'the stack holds both copies');
select is((select count(*)::int from public.owned_units
  where user_id = '00000000-0000-0000-0000-00000000a501' and unit_id = 'moss-mote'), 0,
  'no owned_units row for a stacked copy');
select results_eq($$select delta, count_after, reason from public.unit_stack_log
  where user_id = '00000000-0000-0000-0000-00000000a501' order by count_after$$,
  $$values (1, 1, 'test_grant'::text), (1, 2, 'test_grant'::text)$$, 'each stack grant is logged');
select is((select r -> 'stacked' from acquired where n = 3), 'false'::jsonb,
  'a multi-form acquisition is not stacked');
select ok(public.unit_type_roll_valid((select unit_type from public.owned_units
  where id = (select (r ->> 'owned_unit_id')::uuid from acquired where n = 3))),
  'a multi-form acquisition gets a row with its type roll');
select is((select count(*)::int from public.unit_log
  where owned_unit_id = (select (r ->> 'owned_unit_id')::uuid from acquired where n = 3)
    and reason = 'test_grant' and delta = 1), 1, 'and a unit_log row');
select throws_ok($$select public.acquire_unit('00000000-0000-0000-0000-00000000a501', 'moss-mote',
  'moss-sprite-2', 'test_grant')$$, '22023', null, 'a form of another unit is rejected');

-- Summons and captures stack (6) -----------------------------------------------------------------
insert into public.content_items (kind, id, data) values
  ('unit', 'stack-filler', '{"id":"stack-filler","stackable":true,"forms":[{"id":"stack-filler-2","rarity":2}]}'),
  ('unit', 'stack-feature', '{"id":"stack-feature","forms":[{"id":"stack-feature-5","rarity":5},{"id":"stack-feature-6","rarity":6}]}'),
  ('banner', 'stack-banner', '{"pityPulls":80,"featured":[{"unit":"stack-feature","form":"stack-feature-5","rateBp":0}],"pool":[{"unit":"stack-filler","form":"stack-filler-2","rateBp":10000}]}'),
  ('stage', 'stack-stage', '{"id":"stack-stage","waves":[{"enemies":[{"enemy":"stack-enemy","capture":"always"},{"enemy":"row-enemy","capture":"always"}]}]}'),
  ('enemy', 'stack-enemy', '{"drops":{"capture":{"unit":"stack-filler","rate":0}}}'),
  ('enemy', 'row-enemy', '{"drops":{"capture":{"unit":"stack-feature","rate":0}}}');
insert into public.wallets (user_id, gems) values ('00000000-0000-0000-0000-00000000a502', 100);

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000a502","role":"authenticated"}', true);
select is((public.summon('stack-banner', 11) -> 'results' -> 0 -> 'unit' ->> 'stacked'), 'true',
  'a stackable summon result is stacked');
reset role;
select is((select count from public.owned_unit_stacks
  where user_id = '00000000-0000-0000-0000-00000000a502' and unit_id = 'stack-filler'), 11,
  'eleven filler pulls make one stack of 11');
select is((select count(*)::int from public.summon_log
  where user_id = '00000000-0000-0000-0000-00000000a502' and owned_unit_id is null), 11,
  'stacked pulls log no owned unit in summon_log');

update public.content_version set version = 'aaaaaaaaaaaaaaaa';
insert into public.battle_sessions (id, user_id, stage_id, seed, squad, content_version, expires_at)
values ('00000000-0000-0000-0000-00000000a5b1', '00000000-0000-0000-0000-00000000a502',
  'stack-stage', 1, '{}', 'aaaaaaaaaaaaaaaa', now() + interval '1 hour');
create temporary table captured on commit drop as
select public.grant_battle_base_rewards('00000000-0000-0000-0000-00000000a5b1') as r;
select is((select count from public.owned_unit_stacks
  where user_id = '00000000-0000-0000-0000-00000000a502' and unit_id = 'stack-filler'), 12,
  'a stackable capture adds to the stack');
select is((select count(*)::int from public.unit_stack_log
  where user_id = '00000000-0000-0000-0000-00000000a502' and reason = 'battle_capture'
    and ref_id = '00000000-0000-0000-0000-00000000a5b1'), 1, 'the capture is stack-logged');
select is((select count(*)::int from public.owned_units o
  join public.unit_log l on l.owned_unit_id = o.id and l.reason = 'battle_capture'
  where o.user_id = '00000000-0000-0000-0000-00000000a502' and o.unit_id = 'stack-feature'), 1,
  'a non-stackable capture still gets a logged row');

-- Split (11) -------------------------------------------------------------------------------------
create temporary table stack_ids on commit drop as
select unit_id, id from public.owned_unit_stacks;
insert into public.owned_unit_stacks (user_id, unit_id, form_id, count) values
  ('00000000-0000-0000-0000-00000000a501', 'moss-sprite', 'moss-sprite-2', 0);
grant select on stack_ids to authenticated;

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000a501","role":"authenticated"}', true);
select is((select count(*)::int from public.owned_unit_stacks), 2, 'players read their own stacks');
select is((select count(*)::int from public.unit_stack_log), 2, 'and their own stack log');
select throws_ok($$update public.owned_unit_stacks set count = 99$$, '42501', null,
  'players cannot write stacks');
select throws_ok($$select public.split_unit_stack((select id from stack_ids where unit_id = 'stack-filler'))$$,
  '22023', null, 'another player''s stack is rejected');
select throws_ok($$select public.split_unit_stack((select id from public.owned_unit_stacks where unit_id = 'moss-sprite'))$$,
  'P0001', null, 'an empty stack is rejected');
select throws_ok($$select public.split_unit_stack(gen_random_uuid())$$, '22023', null,
  'a missing stack is rejected');
create temporary table split on commit drop as
select public.split_unit_stack((select id from stack_ids where unit_id = 'moss-mote')) as u;
select is((select (u).form_id || ':' || (u).level || ':' || coalesce((u).unit_type::text, 'none') from split),
  'moss-mote-1:1:none', 'the split copy is a level-1 row with no roll');
select is((select count from public.owned_unit_stacks where unit_id = 'moss-mote'), 1,
  'the stack loses one copy');
select results_eq($$select delta, count_after, reason, ref_id from public.unit_stack_log
  where unit_id = 'moss-mote' and reason = 'split'$$,
  $$select -1, 1, 'split'::text, (u).id from split$$, 'the split is stack-logged');
select results_eq($$select delta::int, reason, ref_id from public.unit_log where owned_unit_id = (select (u).id from split)$$,
  $$select 1, 'stack_split'::text, (select id from stack_ids where unit_id = 'moss-mote')$$,
  'and unit-logged');
select set_config('request.jwt.claims', '{}', true);
select throws_ok($$select public.split_unit_stack(gen_random_uuid())$$, '42501', null,
  'a signed-out caller is rejected');
reset role;

-- One-time fold of untouched rows (8) ------------------------------------------------------------
insert into auth.users (id, email) values ('00000000-0000-0000-0000-00000000a503', 'stacks-c@example.test');
insert into public.owned_units (id, user_id, unit_id, form_id, level, exp) values
  ('00000000-0000-0000-0000-00000000a5c1', '00000000-0000-0000-0000-00000000a503', 'rill-mote', 'rill-mote-1', 1, 0),
  ('00000000-0000-0000-0000-00000000a5c2', '00000000-0000-0000-0000-00000000a503', 'rill-mote', 'rill-mote-1', 1, 0),
  ('00000000-0000-0000-0000-00000000a5c3', '00000000-0000-0000-0000-00000000a503', 'rill-mote', 'rill-mote-1', 1, 0),
  ('00000000-0000-0000-0000-00000000a5c4', '00000000-0000-0000-0000-00000000a503', 'rill-mote', 'rill-mote-1', 1, 0),
  ('00000000-0000-0000-0000-00000000a5c5', '00000000-0000-0000-0000-00000000a503', 'rill-sprite', 'rill-sprite-2', 2, 10),
  ('00000000-0000-0000-0000-00000000a5c6', '00000000-0000-0000-0000-00000000a503', 'brand', 'brand-3', 1, 0);
insert into public.unit_log (user_id, owned_unit_id, unit_id, form_id, delta, reason) values
  ('00000000-0000-0000-0000-00000000a503', '00000000-0000-0000-0000-00000000a5c1', 'rill-mote', 'rill-mote-1', 1, 'summon');
update public.owned_units set bb_level = 2 where id = '00000000-0000-0000-0000-00000000a5c3';
insert into public.squads (user_id, slot, unit_ids, leader_index, ally_unit_id) values
  ('00000000-0000-0000-0000-00000000a503', 0, array['00000000-0000-0000-0000-00000000a5c2']::uuid[], 0,
   '00000000-0000-0000-0000-00000000a5c4');
select is(public.fold_untouched_unit_stacks(), 1,
  'only the one untouched, unsquadded copy folds (a split copy never rejoins)');
select is((select count from public.owned_unit_stacks
  where user_id = '00000000-0000-0000-0000-00000000a503' and unit_id = 'rill-mote'), 1,
  'it becomes a count');
select set_eq($$select id from public.owned_units where user_id = '00000000-0000-0000-0000-00000000a503'$$,
  $$values ('00000000-0000-0000-0000-00000000a5c2'::uuid), ('00000000-0000-0000-0000-00000000a5c3'::uuid),
    ('00000000-0000-0000-0000-00000000a5c4'::uuid), ('00000000-0000-0000-0000-00000000a5c5'::uuid),
    ('00000000-0000-0000-0000-00000000a5c6'::uuid)$$,
  'squad, ally, touched, levelled, and multi-form copies stay rows');
select results_eq($$select delta::int, reason from public.unit_log
  where owned_unit_id = '00000000-0000-0000-0000-00000000a5c1' order by created_at, delta desc$$,
  $$values (1, 'summon'::text), (-1, 'stack_fold'::text)$$, 'the folded row keeps its history');
select results_eq($$select delta, count_after, reason from public.unit_stack_log
  where user_id = '00000000-0000-0000-0000-00000000a503'$$,
  $$values (1, 1, 'stack_fold'::text)$$, 'the fold is stack-logged');
select is(public.fold_untouched_unit_stacks(), 0, 'folding again is a no-op');
select throws_ok($$update public.unit_stack_log set delta = 5$$, 'P0001', null,
  'the stack log is append-only');
delete from auth.users where id = '00000000-0000-0000-0000-00000000a503';
select is_empty($$select 1 from public.unit_stack_log
  where user_id = '00000000-0000-0000-0000-00000000a503'$$, 'account deletion cascades');

select * from finish();
rollback;
