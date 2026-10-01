-- M4-01C: duplicate EXP rounding and BB-first overflow, using seeded Brand forms.
begin;
select plan(11);

-- Pin fuse's success roll (M4-06C) to Success so EXP is deterministic; rolled back with the test.
create or replace function public.fusion_roll()
returns integer language sql volatile set search_path = '' as $$ select 0 $$;
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000dc', 'duplicates@example.test');
insert into public.wallets (user_id, zel) values
  ('00000000-0000-0000-0000-0000000000dc', 100000)
  on conflict (user_id) do update set zel = excluded.zel;
create temporary table cases (n integer, form text, lv integer, bb integer, sbb integer,
  fodder_form text, fodder_level integer, copies integer, gain bigint, after_bb integer, after_sbb integer);
insert into cases values
  (1, 'brand-3', 1, 1, 1, 'brand-3', 1, 1, 300, 10, 1),
  (2, 'brand-3', 1, 1, 1, 'brand-3', 2, 1, 307, 10, 1),
  (3, 'brand-omni', 1, 1, 1, 'brand-4', 1, 1, 600, 10, 2),
  (4, 'brand-omni', 1, 5, 3, 'brand-3', 1, 1, 300, 10, 8),
  (5, 'brand-omni', 1, 10, 1, 'brand-3', 1, 1, 300, 10, 10),
  (6, 'brand-omni', 1, 10, 10, 'brand-3', 1, 1, 300, 10, 10),
  (7, 'brand-omni', 150, 1, 1, 'brand-3', 1, 2, 600, 10, 10);
insert into public.owned_units (id, user_id, unit_id, form_id, level, bb_level, sbb_level)
select ('00000000-0000-0000-0000-' || lpad(n::text,12,'0'))::uuid,
  '00000000-0000-0000-0000-0000000000dc', 'brand', form, lv, bb, sbb from cases;
insert into public.owned_units (id, user_id, unit_id, form_id, level)
select ('00000000-0000-0000-0000-' || lpad((100 + n*10 + i)::text,12,'0'))::uuid,
  '00000000-0000-0000-0000-0000000000dc', 'brand', fodder_form, fodder_level
from cases cross join lateral generate_series(1,copies) i;
create temporary table results (n integer, result jsonb);
grant select on cases to authenticated;
grant insert, select on results to authenticated;
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000dc","role":"authenticated"}', true);
insert into results select n, public.fuse(
  ('00000000-0000-0000-0000-' || lpad(n::text,12,'0'))::uuid,
  array(select ('00000000-0000-0000-0000-' || lpad((100 + n*10 + i)::text,12,'0'))::uuid
    from generate_series(1,copies) i)) from cases;
select is(r.result -> 'exp_gained', to_jsonb(c.gain), 'duplicate EXP case ' || c.n)
from cases c join results r using(n) order by n;
select ok(not exists(select 1 from cases c join results r using(n)
  where (r.result ->> 'bb_level')::integer <> c.after_bb
     or (r.result ->> 'sbb_level')::integer <> c.after_sbb), 'all burst boundary results match');
select ok(not exists(select 1 from public.owned_units o join cases c
  on o.id = ('00000000-0000-0000-0000-' || lpad(c.n::text,12,'0'))::uuid
  where o.bb_level <> c.after_bb or o.sbb_level <> c.after_sbb), 'burst results persist');
select is((select result -> 'exp' from results where n=7), '2782165'::jsonb,
  'maximum-level target discards EXP but gains burst levels');
select is((select count(*)::integer from public.owned_units
  where user_id='00000000-0000-0000-0000-0000000000dc'), 7, 'all duplicate fodder consumed');
select * from finish();
rollback;
