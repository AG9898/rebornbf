-- M4-04F: first-clear spheres, the Trial 2 Satchel Toad, and the signature sphere claim
-- (RESOLVED-71, GAME_DESIGN §6 → Spheres). Uses the seeded content.
begin;
select plan(26);

-- Seeded content (3) -----------------------------------------------------------------------------
select is((select data -> 'firstClear' -> 'spheres' from public.content_items
  where kind = 'stage' and id = 'story-08-beacon-hollow'),
  '[{"sphere":"wayfarer-seal","count":6}]'::jsonb, 'stage 8 grants six +10% all-stat spheres');
select is((select data -> 'firstClear' -> 'spheres' from public.content_items
  where kind = 'stage' and id = 'trial-01-captain-locke'),
  '[{"sphere":"vanguard-seal","count":6}]'::jsonb, 'Trial 1 grants six +20% all-stat spheres');
select is((select data -> 'firstClear' from public.content_items
  where kind = 'stage' and id = 'trial-02-master-ozric'),
  '{"gems":0,"units":[{"unit":"satchel-toad","count":1}],"signatureClaims":1}'::jsonb,
  'Trial 2 grants one Satchel Toad and one signature claim');

-- Players: A clears everything; B has no claim.
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000004f01', 'spheres-a@example.test'),
  ('00000000-0000-0000-0000-000000004f02', 'spheres-b@example.test');
update public.profiles set onboarding_step = 'starter'
where id = '00000000-0000-0000-0000-000000004f01';
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000004f01"}', true);
select public.pick_starter('brand');

insert into public.battle_sessions (id, user_id, stage_id, seed, squad, content_version, expires_at)
select s.id::uuid, '00000000-0000-0000-0000-000000004f01', s.stage, 1, '{}',
  (select version from public.content_version), now() + interval '1 hour'
from (values
  ('00000000-0000-0000-0000-000000004f11', 'story-08-beacon-hollow'),
  ('00000000-0000-0000-0000-000000004f12', 'story-08-beacon-hollow'),
  ('00000000-0000-0000-0000-000000004f13', 'trial-01-captain-locke'),
  ('00000000-0000-0000-0000-000000004f14', 'trial-01-captain-locke'),
  ('00000000-0000-0000-0000-000000004f15', 'trial-02-master-ozric'),
  ('00000000-0000-0000-0000-000000004f16', 'trial-02-master-ozric')) s (id, stage);

create temporary table sphere_results (n integer, reward jsonb);
grant all on sphere_results to service_role;
set local role service_role;
insert into sphere_results
select n, public.grant_battle_rewards(('00000000-0000-0000-0000-000000004f1' || n)::uuid)
from generate_series(1, 6) as n order by n;
reset role;

-- Stage 8 (3) --------------------------------------------------------------------------------------
select is((select reward -> 'first_clear_spheres' from sphere_results where n = 1),
  '{"wayfarer-seal":6}'::jsonb, 'stage 8''s first clear reports six Wayfarer Seals');
select ok((select not (reward ? 'first_clear_spheres') from sphere_results where n = 2),
  'a stage 8 replay grants no spheres');
select is((select count(*)::integer from public.sphere_log
  where ref_id = '00000000-0000-0000-0000-000000004f11' and reason = 'battle_first_clear'
    and sphere_id = 'wayfarer-seal'), 6, 'six sphere log rows reference the stage 8 session');

-- Trial 1 (2) --------------------------------------------------------------------------------------
select is((select reward -> 'first_clear_spheres' from sphere_results where n = 3),
  '{"vanguard-seal":6}'::jsonb, 'Trial 1''s first clear reports six Vanguard Seals');
select ok((select not (reward ? 'first_clear_spheres') from sphere_results where n = 4),
  'a Trial 1 replay grants no spheres');

-- Owned totals after both replays (1) ---------------------------------------------------------------
select is((select jsonb_object_agg(sphere_id, n) from (select sphere_id, count(*) as n
  from public.owned_spheres where user_id = '00000000-0000-0000-0000-000000004f01'
  group by sphere_id) t), '{"wayfarer-seal":6,"vanguard-seal":6}'::jsonb,
  'exactly six of each all-stat sphere are owned');

-- Trial 2 (5) --------------------------------------------------------------------------------------
select is((select reward -> 'first_clear_units' from sphere_results where n = 5),
  '{"satchel-toad":1}'::jsonb, 'Trial 2''s first clear reports one Satchel Toad');
select is((select reward -> 'signature_claims' from sphere_results where n = 5),
  '1'::jsonb, 'Trial 2''s first clear reports one signature claim');
select ok((select not (reward ? 'first_clear_units') and not (reward ? 'signature_claims')
  from sphere_results where n = 6), 'a Trial 2 replay grants no toad or claim');
select is((select sum(delta)::integer from public.unit_stack_log
  where user_id = '00000000-0000-0000-0000-000000004f01' and unit_id = 'satchel-toad'),
  1, 'exactly one Satchel Toad joins the stack');
select is((select count(*)::integer from public.signature_sphere_claims
  where user_id = '00000000-0000-0000-0000-000000004f01' and redeemed_at is null),
  1, 'exactly one open signature claim exists');

-- Clients read their own claims and cannot write them (3) -------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000004f02","role":"authenticated"}', true);
select is((select count(*)::integer from public.signature_sphere_claims), 0,
  'another player cannot read the claim');
select throws_ok($$insert into public.signature_sphere_claims(user_id, ref_id) values
  ('00000000-0000-0000-0000-000000004f02', '00000000-0000-0000-0000-000000004f02')$$,
  '42501', null, 'clients cannot grant themselves a claim');
select throws_ok($$select public.choose_signature_sphere('emberheart')$$,
  'P0002', 'choose_signature_sphere: no signature sphere claim',
  'a player without a claim cannot redeem one');

-- Redeeming the claim (8) ----------------------------------------------------------------------------
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000004f01","role":"authenticated"}', true);
select is((select count(*)::integer from public.signature_sphere_claims), 1,
  'the player reads their own claim');
select throws_ok($$select public.choose_signature_sphere('wayfarer-seal')$$,
  '22023', 'choose_signature_sphere: not a signature sphere',
  'an all-stat sphere cannot be chosen');
select throws_ok($$select public.choose_signature_sphere('no-such-sphere')$$,
  '22023', 'choose_signature_sphere: not a signature sphere', 'an unknown sphere is refused');
select is(public.choose_signature_sphere('emberheart') ->> 'sphere_id', 'emberheart',
  'the claim grants the chosen signature sphere');
select throws_ok($$select public.choose_signature_sphere('tideglass')$$,
  'P0002', 'choose_signature_sphere: no signature sphere claim',
  'the claim cannot be redeemed twice');
reset role;
select is((select array_agg(s.sphere_id) from public.owned_spheres s
  join public.content_items c on c.kind = 'sphere' and c.id = s.sphere_id
  where s.user_id = '00000000-0000-0000-0000-000000004f01' and c.data ->> 'kind' = 'signature'),
  array['emberheart'], 'exactly one signature sphere is owned');
select ok((select redeemed_at is not null and owned_sphere_id is not null
  from public.signature_sphere_claims where user_id = '00000000-0000-0000-0000-000000004f01'),
  'the claim records its redemption and instance');
select is((select reason from public.sphere_log
  where user_id = '00000000-0000-0000-0000-000000004f01' and sphere_id = 'emberheart'),
  'signature_claim', 'the signature sphere is logged as a claim redemption');

-- Anonymous callers (1) ------------------------------------------------------------------------------
set local role anon;
select throws_ok($$select public.choose_signature_sphere('emberheart')$$,
  '42501', null, 'anon cannot call choose_signature_sphere');
reset role;

select * from finish();
rollback;
