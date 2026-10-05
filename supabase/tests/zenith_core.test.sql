-- M4-02N: Trial 1's first-clear Zenith Core, and the Zenith Core series it opens (RESOLVED-69/70).
-- Uses the seeded content: sessions carry the seeded content version.
begin;
select plan(14);

-- Seeded content (2) -----------------------------------------------------------------------------
select is((select data -> 'firstClear' -> 'items' from public.content_items
  where kind = 'stage' and id = 'trial-01-captain-locke'),
  '[{"item":"zenith-core","count":1}]'::jsonb,
  'Trial 1''s first clear grants 1 Zenith Core');
select is((select data -> 'dungeon' from public.content_items
  where kind = 'stage' and id = 'dungeon-zenith-core'),
  '{"series":"zenith-core","gate":"trial-01-captain-locke","keyItem":{"item":"zenith-core","rate":20},"ramp":65}'::jsonb,
  'the Zenith Core stage is its own series, gated on Trial 1, 1 then 20%, +65% ramp');

-- A player who has cleared chapter 1 (Trial 1 is open) but not Trial 1.
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000000e2a', 'zenith-a@example.test');
insert into public.owned_units (id, user_id, unit_id, form_id, level) values
  ('00000000-0000-0000-0000-000000000e2b', '00000000-0000-0000-0000-000000000e2a', 'brand', 'brand-3', 1);
insert into public.squads (user_id, slot, unit_ids, leader_index) values
  ('00000000-0000-0000-0000-000000000e2a', 0, array['00000000-0000-0000-0000-000000000e2b']::uuid[], 0);
insert into public.quest_progress (user_id, stage_id)
values ('00000000-0000-0000-0000-000000000e2a', 'story-08-beacon-hollow');

-- The series stays locked until the Trial 1 first clear (1) --------------------------------------
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000e2a","role":"authenticated"}', true);
select throws_ok($$select public.start_battle('dungeon-zenith-core')$$,
  '22023', 'start_battle: this dungeon is still locked',
  'the Zenith Core stage is refused before the Trial 1 first clear');
reset role;

-- Sessions 1-2: Trial 1; 3-5: the Zenith Core stage.
insert into public.battle_sessions (id, user_id, stage_id, seed, squad, content_version, expires_at)
select ('00000000-0000-0000-0000-000000000ec' || n)::uuid, '00000000-0000-0000-0000-000000000e2a',
  case when n <= 2 then 'trial-01-captain-locke' else 'dungeon-zenith-core' end,
  n, '{}', (select version from public.content_version), now() + interval '1 hour'
from generate_series(1, 5) as n;

-- Trial 1 first clear, then a repeat (5) ---------------------------------------------------------
set local role service_role;
select is((public.grant_battle_rewards('00000000-0000-0000-0000-000000000ec1') -> 'items' ->> 'zenith-core'),
  '1', 'the Trial 1 first clear reports 1 Zenith Core');
select is((public.grant_battle_rewards('00000000-0000-0000-0000-000000000ec2') -> 'items' ? 'zenith-core'),
  false, 'a repeat Trial 1 clear grants no Zenith Core');
reset role;
select is((select count from public.owned_items
  where user_id = '00000000-0000-0000-0000-000000000e2a' and item_id = 'zenith-core'), 1::bigint,
  'exactly 1 Zenith Core is owned after two Trial 1 clears');
select is((select array_agg(reason) from public.item_log
  where user_id = '00000000-0000-0000-0000-000000000e2a' and item_id = 'zenith-core'),
  array['battle_first_clear'], 'the Zenith Core is logged as a first-clear grant');
select is((select count(*)::int from public.quest_progress
  where user_id = '00000000-0000-0000-0000-000000000e2a' and stage_id = 'trial-01-captain-locke'), 1,
  'the Trial 1 clear is recorded');

-- The series opens (1) ---------------------------------------------------------------------------
set local role authenticated;
select is((select (public.start_battle('dungeon-zenith-core')).stage_id), 'dungeon-zenith-core',
  'the Zenith Core stage starts after the Trial 1 first clear');
reset role;

-- Zenith Core stage: 1 on first clear, then the 20% roll (forced to 0 and 100 here) (5) ----------
set local role service_role;
select is((public.grant_battle_rewards('00000000-0000-0000-0000-000000000ec3') -> 'items' ->> 'zenith-core'),
  '1', 'the Zenith Core stage''s first clear grants one');
reset role;
update public.content_items set data = jsonb_set(data, '{dungeon,keyItem,rate}', '0')
where kind = 'stage' and id = 'dungeon-zenith-core';
set local role service_role;
select is((public.grant_battle_rewards('00000000-0000-0000-0000-000000000ec4') -> 'items' ? 'zenith-core'),
  false, 'a failed repeat-clear roll grants none');
reset role;
update public.content_items set data = jsonb_set(data, '{dungeon,keyItem,rate}', '100')
where kind = 'stage' and id = 'dungeon-zenith-core';
set local role service_role;
select is((public.grant_battle_rewards('00000000-0000-0000-0000-000000000ec5') -> 'items' ->> 'zenith-core'),
  '1', 'a successful repeat-clear roll grants one');
reset role;
select is((select count from public.owned_items
  where user_id = '00000000-0000-0000-0000-000000000e2a' and item_id = 'zenith-core'), 3::bigint,
  'Zenith Cores stack: Trial 1, the stage''s first clear, and one roll');
select is((select array_agg(reason order by count_after) from public.item_log
  where user_id = '00000000-0000-0000-0000-000000000e2a' and item_id = 'zenith-core'),
  array['battle_first_clear', 'battle_first_clear', 'battle_drop'],
  'stage key items are logged as first clear, then drop');

select * from finish();
rollback;
