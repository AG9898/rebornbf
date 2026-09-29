-- M3-02: read-only content tables seeded from packages/data (supabase/seed.sql).
-- The seed ran during `supabase db reset`; seeding again must leave identical state.
begin;

select plan(17);

-- The seed loaded the generated content.
select ok((select version ~ '^[0-9a-f]{16}$' from public.content_version),
  'a content version is recorded');
select results_eq(
  $$select item_count from public.content_version$$,
  $$select count(*)::int from public.content_items$$, 'item_count matches the seeded rows');
select ok(exists (select 1 from public.content_items where kind = 'unit' and id = 'brand'
  and data ->> 'id' = 'brand'), 'unit kits are seeded by file id');
select ok(exists (select 1 from public.content_items where kind = 'stage' and id = 'demo-stage'),
  'stages are seeded');
select ok(exists (select 1 from public.content_items where kind = 'banner' and id = 'launch-summon'
  and data ->> 'id' = 'launch-summon' and jsonb_array_length(data -> 'featured') = 2),
  'launch summon banner and its featured rates are seeded');
select ok(exists (select 1 from public.content_items where kind = 'item' and id = 'crown-shard'
  and data ->> 'kind' = 'material'), 'the Crown Shard material item is seeded');
select throws_ok(
  $$insert into public.content_items (kind, id, data) values ('unknown', 'bad', '{}'::jsonb)$$,
  '23514', null, 'unknown content kind is rejected');

-- Seeding the same content twice produces the same state (including seeded_at).
create temp table snap_items as select kind, id, data from public.content_items;
create temp table snap_version as select * from public.content_version;
select public.seed_content(
  (select version from snap_version),
  (select jsonb_agg(jsonb_build_object('kind', kind, 'id', id, 'data', data)) from snap_items));
select public.seed_content(
  (select version from snap_version),
  (select jsonb_agg(jsonb_build_object('kind', kind, 'id', id, 'data', data)) from snap_items));
select set_eq($$select kind, id, data from public.content_items$$,
  $$select kind, id, data from snap_items$$, 'reseeding keeps the items identical');
select results_eq($$select version, item_count, seeded_at from public.content_version$$,
  $$select version, item_count, seeded_at from snap_version$$,
  'reseeding keeps the version row identical');

-- New content replaces the old set exactly, then reseeding it is again a no-op.
select public.seed_content('00000000000000aa',
  '[{"kind":"unit","id":"test-unit","data":{"id":"test-unit"}}]'::jsonb);
select results_eq($$select kind, id from public.content_items$$,
  $$values ('unit'::text, 'test-unit'::text)$$, 'removed content files are deleted');
select results_eq($$select version, item_count from public.content_version$$,
  $$values ('00000000000000aa'::text, 1)$$, 'the version follows the new content');
select throws_ok(
  $$select public.seed_content('00000000000000aa', '{"not":"an array"}'::jsonb)$$,
  '22023', null, 'a non-array payload is rejected');

-- Clients cannot read or write content; the service role reads only; only the owner seeds.
set local role authenticated;
select throws_ok($$select * from public.content_items$$, '42501', null,
  'authenticated cannot read content_items');
select throws_ok($$select public.seed_content('00000000000000bb', '[]'::jsonb)$$, '42501', null,
  'authenticated cannot call seed_content');
reset role;

set local role anon;
select throws_ok($$select * from public.content_version$$, '42501', null,
  'anon cannot read content_version');
reset role;

set local role service_role;
select results_eq($$select count(*)::int from public.content_items$$, $$values (1)$$,
  'service_role reads content');
select throws_ok($$delete from public.content_items$$, '42501', null,
  'service_role cannot write content');
reset role;

select * from finish();
rollback;
