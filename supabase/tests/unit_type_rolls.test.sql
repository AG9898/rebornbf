-- M3-01D: every new owned unit gets its type roll at acquisition (GAME_DESIGN §6 → Stat growth and
-- unit types): documented type rates and uniform gains, never Rex, no roll for Omni or single-form
-- units, and the roll never changes once stored.
begin;

select plan(36);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000001d1', 'types-a@example.test');

-- Privileges (6) ---------------------------------------------------------------------------------
select ok(not has_function_privilege('authenticated', 'public.grant_unit(uuid, text, text)', 'execute'),
  'authenticated cannot execute grant_unit');
select ok(not has_function_privilege('service_role', 'public.grant_unit(uuid, text, text)', 'execute'),
  'service_role cannot execute grant_unit directly');
select ok(not has_function_privilege('anon', 'public.grant_unit(uuid, text, text)', 'execute'),
  'anon cannot execute grant_unit');
select ok(not has_function_privilege('authenticated', 'public.roll_unit_type()', 'execute'),
  'authenticated cannot roll a type');
select ok(not has_function_privilege('authenticated', 'public.unit_type_for_grant(text, text)', 'execute'),
  'authenticated cannot call unit_type_for_grant');
select ok((select prosecdef from pg_proc where oid = 'public.grant_unit(uuid, text, text)'::regprocedure),
  'grant_unit is security definer');

-- Type-roll distribution (15) -------------------------------------------------------------------
-- 20,000 rolls: a type rate is within 1.5 points of its documented rate (about 5 sigma), and each
-- gain value of a type's range is within 4 points of uniform.
create temporary table rolls as
  select public.roll_unit_type() as r from generate_series(1, 20000);

select ok((select bool_and(public.unit_type_roll_valid(r)) from rolls),
  'every roll is a valid roll');
select is((select count(*)::int from rolls where r ->> 'type' = 'rex'), 0, 'no roll is Rex');
select ok(abs((select count(*) from rolls where r ->> 'type' = 'lord') / 20000.0 - 0.23) < 0.015,
  'Lord is rolled about 23% of the time');
select ok(abs((select count(*) from rolls where r ->> 'type' = 'anima') / 20000.0 - 0.23) < 0.015,
  'Anima is rolled about 23% of the time');
select ok(abs((select count(*) from rolls where r ->> 'type' = 'breaker') / 20000.0 - 0.22) < 0.015,
  'Breaker is rolled about 22% of the time');
select ok(abs((select count(*) from rolls where r ->> 'type' = 'guardian') / 20000.0 - 0.22) < 0.015,
  'Guardian is rolled about 22% of the time');
select ok(abs((select count(*) from rolls where r ->> 'type' = 'oracle') / 20000.0 - 0.10) < 0.015,
  'Oracle is rolled about 10% of the time');
select ok((select bool_and(r -> 'gains' = '{"hp": 0, "atk": 0, "def": 0, "rec": 0}')
           from rolls where r ->> 'type' = 'lord'),
  'Lord rolls have no gains');

-- For each (type, stat) with a non-empty range: every value in the range appears, none outside it,
-- and each value's share is within 4 points of 1 / (range size).
create temporary table gain_checks as
  select t.type, s.stat,
         (ranges -> t.type -> s.stat ->> 0)::int as lo,
         (ranges -> t.type -> s.stat ->> 1)::int as hi
  from (select public.unit_type_gain_ranges() as ranges) g,
       unnest(array['anima', 'breaker', 'guardian', 'oracle']) as t (type),
       unnest(array['hp', 'atk', 'def', 'rec']) as s (stat);

select is(
  (select count(*)::int from gain_checks c
   where (select count(distinct (r -> 'gains' ->> c.stat)::int) from rolls where r ->> 'type' = c.type)
     <> c.hi - c.lo + 1),
  0, 'every gain value in each type''s range is rolled');
select is(
  (select count(*)::int from gain_checks c
   join rolls on r ->> 'type' = c.type
   where (r -> 'gains' ->> c.stat)::int not between c.lo and c.hi),
  0, 'no gain falls outside its type''s range');
select is(
  (select count(*)::int from gain_checks c
   cross join lateral generate_series(c.lo, c.hi) as v (value)
   where c.hi > c.lo
     and abs(
       (select count(*) from rolls where r ->> 'type' = c.type and (r -> 'gains' ->> c.stat)::int = v.value)::numeric
         / (select count(*) from rolls where r ->> 'type' = c.type)
       - 1.0 / (c.hi - c.lo + 1)) >= 0.04),
  0, 'gains are uniform within each range');
select is((select count(*)::int from rolls where r ->> 'type' = 'anima'
           and ((r -> 'gains' ->> 'atk')::int <> 0 or (r -> 'gains' ->> 'def')::int <> 0)),
  0, 'a type leaves the stats it does not change at 0');
select ok(public.unit_type_roll_valid('{"type": "rex", "gains": {"hp": 12, "atk": 1, "def": 2, "rec": 1}}'),
  'Rex stays a valid stored type');
select ok(not public.unit_type_roll_valid('{"type": "anima", "gains": {"hp": 11, "atk": 0, "def": 0, "rec": -1}}'),
  'a gain outside its range is invalid');
select ok(not public.unit_type_roll_valid('{"type": "lord", "gains": {"hp": 0, "atk": 0, "def": 0}}'),
  'a roll missing a stat is invalid');

-- Grants (10) -----------------------------------------------------------------------------------
select is((public.grant_unit('00000000-0000-0000-0000-0000000001d1', 'brand')).form_id, 'brand-2',
  'grant_unit defaults to the unit''s first form');
select ok(public.unit_type_roll_valid(
    (select unit_type from public.owned_units where form_id = 'brand-2')),
  'a pre-Omni grant stores a roll');
select is((public.grant_unit('00000000-0000-0000-0000-0000000001d1', 'brand', 'brand-omni')).unit_type,
  null, 'an Omni grant stores no pre-Omni roll');
select is(public.unit_type_for_grant('cinder-flask', 'cinder-flask-3'),
  null, 'a single-form fodder unit gets no roll (it is stacked, M4-05A)');
select throws_ok($$select public.grant_unit('00000000-0000-0000-0000-0000000001d1', 'no-such-unit')$$,
  '22023', null, 'an unknown unit is rejected');
select throws_ok($$select public.grant_unit('00000000-0000-0000-0000-0000000001d1', 'brand', 'maren-3')$$,
  '22023', null, 'a form of another unit is rejected');

do $$
begin
  perform public.grant_unit('00000000-0000-0000-0000-0000000001d1', 'maren', 'maren-3')
  from generate_series(1, 300);
end;
$$;
select is((select count(*)::int from public.owned_units
           where form_id = 'maren-3' and public.unit_type_roll_valid(unit_type)
             and unit_type ->> 'type' <> 'rex'), 300,
  'ordinary grants all roll a valid non-Rex type');

-- A plain insert (as the capture reward path does) is rolled by the trigger; an explicit roll is kept.
insert into public.owned_units (id, user_id, unit_id, form_id) values
  ('00000000-0000-0000-0000-0000000d1001', '00000000-0000-0000-0000-0000000001d1', 'rook', 'rook-3');
select ok(public.unit_type_roll_valid(
    (select unit_type from public.owned_units where id = '00000000-0000-0000-0000-0000000d1001')),
  'a direct insert gets a roll from the trigger');
insert into public.owned_units (id, user_id, unit_id, form_id, unit_type) values
  ('00000000-0000-0000-0000-0000000d1002', '00000000-0000-0000-0000-0000000001d1', 'rook', 'rook-3',
   '{"type": "anima", "gains": {"hp": 7, "atk": 0, "def": 0, "rec": -2}}');
select is((select unit_type from public.owned_units where id = '00000000-0000-0000-0000-0000000d1002'),
  '{"type": "anima", "gains": {"hp": 7, "atk": 0, "def": 0, "rec": -2}}'::jsonb,
  'an explicit roll is stored as given');
select throws_ok($$insert into public.owned_units (user_id, unit_id, form_id, unit_type) values
  ('00000000-0000-0000-0000-0000000001d1', 'rook', 'rook-3',
   '{"type": "breaker", "gains": {"hp": 0, "atk": 4, "def": -1, "rec": 0}}')$$,
  '23514', null, 'an out-of-range roll is rejected by the check constraint');

-- Persistence (5) -------------------------------------------------------------------------------
create temporary table before_roll as
  select unit_type from public.owned_units where id = '00000000-0000-0000-0000-0000000d1001';
update public.owned_units set level = 30, exp = 5000, form_id = 'rook-4'
where id = '00000000-0000-0000-0000-0000000d1001';
select is((select unit_type from public.owned_units where id = '00000000-0000-0000-0000-0000000d1001'),
  (select unit_type from before_roll), 'levelling and evolving keep the roll');
select is((select unit_type from public.owned_units where id = '00000000-0000-0000-0000-0000000d1001'),
  (select unit_type from public.owned_units where id = '00000000-0000-0000-0000-0000000d1001'),
  'repeated reads return the same roll');
select throws_ok($$update public.owned_units set unit_type = null
  where id = '00000000-0000-0000-0000-0000000d1002'$$,
  '42501', null, 'the roll cannot be cleared');
select throws_ok($$update public.owned_units
  set unit_type = '{"type": "lord", "gains": {"hp": 0, "atk": 0, "def": 0, "rec": 0}}'
  where id = '00000000-0000-0000-0000-0000000d1002'$$,
  '42501', null, 'the roll cannot be re-rolled');

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000001d1","role":"authenticated"}', true);
select is((select unit_type from public.owned_units where id = '00000000-0000-0000-0000-0000000d1002'),
  '{"type": "anima", "gains": {"hp": 7, "atk": 0, "def": 0, "rec": -2}}'::jsonb,
  'the owner reads their unit''s roll under RLS');
reset role;

select * from finish();
rollback;
