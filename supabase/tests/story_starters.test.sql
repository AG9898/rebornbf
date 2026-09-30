-- M3-05B: every onboarding choice, scheduled rarities, permanent pick identity, replays,
-- privilege boundaries, and transactional rollback. Local pgTAP skipped for this owner run.
begin;
select plan(54);
select ok(has_function_privilege('service_role', 'public.grant_battle_rewards(uuid)', 'execute'),
  'service role can settle verified wins');
select ok(not has_function_privilege('authenticated', 'public.grant_battle_rewards(uuid)', 'execute'),
  'players cannot grant starters for any user');
select ok(not has_function_privilege('service_role', 'public.grant_battle_base_rewards(uuid)', 'execute'),
  'API roles cannot bypass starter settlement');

insert into public.content_items(kind, id, data)
select 'stage', 'test-starter-' || n, jsonb_build_object(
  'story', jsonb_build_object('number', n * 2), 'waves', '[]'::jsonb,
  'firstClear', jsonb_build_object('gems', 0, 'starter', jsonb_build_object('ordinal', n, 'rarity', n + 2)))
from generate_series(1, 5) n;
create temporary table starter_results(picked text, ordinal integer, user_id uuid, reward jsonb);

do $$
declare
  picked text;
  uid uuid;
  sid uuid;
  n integer;
begin
  foreach picked in array public.starter_unit_ids() loop
    uid := gen_random_uuid();
    insert into auth.users(id, email) values(uid, picked || '-story@example.test');
    update public.profiles set onboarding_step = 'starter' where id = uid;
    perform set_config('request.jwt.claims', jsonb_build_object('sub', uid)::text, true);
    perform public.pick_starter(picked);
    -- The original unit is gone: the log must still identify the pick.
    delete from public.owned_units where user_id = uid;
    for n in 1..5 loop
      sid := gen_random_uuid();
      insert into public.battle_sessions(id, user_id, stage_id, seed, squad, content_version, expires_at)
      values(sid, uid, 'test-starter-' || n, 1, '{}', (select version from public.content_version), now() + interval '1 hour');
      insert into starter_results values(picked, n, uid, public.grant_battle_rewards(sid));
    end loop;
    sid := gen_random_uuid();
    insert into public.battle_sessions(id, user_id, stage_id, seed, squad, content_version, expires_at)
    values(sid, uid, 'test-starter-1', 1, '{}', (select version from public.content_version), now() + interval '1 hour');
    insert into starter_results values(picked, 0, uid, public.grant_battle_rewards(sid));
  end loop;
end;
$$;

select is(r.reward -> 'starter' ->> 'form_id', expected.unit_id || '-' || (r.ordinal + 2),
  r.picked || ' pick: reward ' || r.ordinal || ' grants the scheduled form')
from starter_results r
cross join lateral (
  select unit_id from unnest(public.starter_unit_ids()) with ordinality s(unit_id, ord)
  where unit_id <> r.picked order by ord offset greatest(0, r.ordinal - 1) limit 1
) expected
where r.ordinal > 0;
select is((select count(*)::int from public.unit_log l where l.user_id = r.user_id and l.reason = 'story_starter'),
  5, r.picked || ' pick: five permanent grant logs') from starter_results r where ordinal = 0;
select is((select count(*)::int from public.owned_units u where u.user_id = r.user_id and u.unit_id = r.picked),
  0, r.picked || ' pick: chosen starter never granted again') from starter_results r where ordinal = 0;
select ok(not (reward ? 'starter') and reward ->> 'first_clear' = 'false',
  picked || ' pick: stage replay grants no starter') from starter_results where ordinal = 0;

insert into auth.users(id, email) values('00000000-0000-0000-0000-0000000005b2', 'no-pick-story@example.test');
insert into public.battle_sessions(id, user_id, stage_id, seed, squad, content_version, expires_at)
values('00000000-0000-0000-0000-000000005b21', '00000000-0000-0000-0000-0000000005b2',
  'test-starter-1', 1, '{}', (select version from public.content_version), now() + interval '1 hour');
set local role service_role;
select throws_ok($$select public.grant_battle_rewards('00000000-0000-0000-0000-000000005b21')$$,
  '55000', null, 'missing starter pick rejects the grant');
reset role;
select ok((select finished_at is null from public.battle_sessions where id = '00000000-0000-0000-0000-000000005b21'),
  'failed starter grant rolls back the session claim');
select is((select count(*)::int from public.quest_progress where user_id = '00000000-0000-0000-0000-0000000005b2'),
  0, 'failed starter grant rolls back first-clear progress');
select * from finish();
rollback;
