-- M4-03H: daily clear limits (RESOLVED-71, GAME_DESIGN §7 → Farming dungeons). A dungeon series
-- may carry `dungeon.dailyLimit` in content (every stage of the series the same; the hob series
-- has 5 when it lands in M4-03I). Wins count per player per series per UTC day (reset 00:00 UTC,
-- like the login calendar): a win is a battle_sessions row that grant_battle_rewards finished
-- (only verified wins are ever finished), dated by its `finished_at`. start_battle refuses a
-- limited series once the day's wins reach the limit; dungeon_clears_today() exposes the clears
-- left for the dungeon screen. Everything else in start_battle is unchanged from
-- 20261001150000_trial_unlock.sql.

-- Wins are looked up by finish time; only finished rows are indexed.
create index battle_sessions_user_finished_idx
  on public.battle_sessions (user_id, finished_at)
  where finished_at is not null;

-- ---------------------------------------------------------------------------------------------
-- dungeon_wins_today (internal): the player's wins today (UTC) on stages of dungeon `p_series`.
-- Only other security definer functions (owned by postgres) may call it.
-- ---------------------------------------------------------------------------------------------
create function public.dungeon_wins_today(p_user_id uuid, p_series text)
returns integer
language sql
stable
set search_path = ''
as $$
  select count(*)::integer
  from public.battle_sessions b
  join public.content_items c on c.kind = 'stage' and c.id = b.stage_id
  where b.user_id = p_user_id
    and b.finished_at >= (now() at time zone 'utc')::date::timestamp at time zone 'utc'
    and c.data -> 'dungeon' ->> 'series' = p_series;
$$;

revoke execute on function public.dungeon_wins_today(uuid, text)
  from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------------------------
-- dungeon_clears_today: one row per limited dungeon series with the caller's daily limit, wins
-- today (UTC), and clears left (never negative). Unlimited series are not listed.
-- ---------------------------------------------------------------------------------------------
create function public.dungeon_clears_today()
returns table (series text, daily_limit integer, clears_today integer, clears_left integer)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'dungeon_clears_today: not signed in' using errcode = '42501';
  end if;

  return query
  select l.series, l.daily_limit, w.wins, greatest(l.daily_limit - w.wins, 0)
  from (
    select distinct c.data -> 'dungeon' ->> 'series' as series,
           (c.data -> 'dungeon' ->> 'dailyLimit')::integer as daily_limit
    from public.content_items c
    where c.kind = 'stage' and c.data -> 'dungeon' ? 'dailyLimit'
  ) l
  cross join lateral (select public.dungeon_wins_today(v_user_id, l.series) as wins) w
  order by l.series;
end;
$$;

revoke execute on function public.dungeon_clears_today() from public, anon;
grant execute on function public.dungeon_clears_today() to authenticated;

create or replace function public.start_battle(p_stage_id text, p_squad_slot smallint default 0)
returns public.battle_sessions
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_stage jsonb;
  v_story_number integer;
  v_previous_stage text;
  v_squad public.squads;
  v_units jsonb;
  v_unit_count integer;
  v_ally jsonb;
  v_guest jsonb;
  v_guest_unit text;
  v_guest_form jsonb;
  v_highest_rarity integer;
  v_highest_level integer;
  v_cap integer;
  v_version text;
  v_row public.battle_sessions;
begin
  if v_user_id is null then
    raise exception 'start_battle: not signed in' using errcode = '42501';
  end if;

  select c.data into v_stage
  from public.content_items c
  where c.kind = 'stage' and c.id = p_stage_id;

  if v_stage is null or not (v_stage ? 'story' or v_stage ? 'dungeon' or v_stage ? 'trial') then
    raise exception 'start_battle: unknown stage' using errcode = '22023';
  end if;

  if v_stage ? 'story' then
    -- Story stages unlock in number order, as on the quest map: the first is always open.
    v_story_number := (v_stage -> 'story' ->> 'number')::integer;
    if v_story_number > 1 then
      select c.id into v_previous_stage
      from public.content_items c
      where c.kind = 'stage' and (c.data -> 'story' ->> 'number')::integer = v_story_number - 1;

      if v_previous_stage is null or not exists (
        select 1 from public.quest_progress q
        where q.user_id = v_user_id and q.stage_id = v_previous_stage
      ) then
        raise exception 'start_battle: this stage is still locked' using errcode = '22023';
      end if;
    end if;
  elsif v_stage ? 'trial' then
    -- A trial opens on its gate story stage's first clear (GAME_DESIGN §5, §7 → Trials).
    if not exists (
      select 1 from public.quest_progress q
      where q.user_id = v_user_id and q.stage_id = v_stage -> 'trial' ->> 'gate'
    ) then
      raise exception 'start_battle: this trial is still locked' using errcode = '22023';
    end if;
  elsif not exists (
    -- A dungeon opens on its gate stage's first clear (GAME_DESIGN §7 → Farming dungeons).
    select 1 from public.quest_progress q
    where q.user_id = v_user_id and q.stage_id = v_stage -> 'dungeon' ->> 'gate'
  ) then
    raise exception 'start_battle: this dungeon is still locked' using errcode = '22023';
  end if;

  if v_stage -> 'dungeon' ? 'dailyLimit'
     and public.dungeon_wins_today(v_user_id, v_stage -> 'dungeon' ->> 'series')
       >= (v_stage -> 'dungeon' ->> 'dailyLimit')::integer then
    -- A limited series refuses once the day's wins are used (GAME_DESIGN §7, RESOLVED-71).
    raise exception 'start_battle: no clears left today for this dungeon' using errcode = '22023';
  end if;

  select * into v_squad
  from public.squads s
  where s.user_id = v_user_id and s.slot = p_squad_slot;

  if v_squad.id is null or cardinality(v_squad.unit_ids) = 0 then
    raise exception 'start_battle: save a squad before starting a battle' using errcode = '22023';
  end if;

  select jsonb_agg(
           jsonb_build_object('owned_unit_id', o.id, 'unit_id', o.unit_id, 'form_id', o.form_id,
                              'level', o.level, 'unit_type', o.unit_type,
                              'bb_level', o.bb_level, 'sbb_level', o.sbb_level)
           order by u.ord),
         count(o.id)
    into v_units, v_unit_count
  from unnest(v_squad.unit_ids) with ordinality as u (owned_unit_id, ord)
  join public.owned_units o on o.id = u.owned_unit_id and o.user_id = v_user_id;

  if v_unit_count <> cardinality(v_squad.unit_ids) then
    raise exception 'start_battle: the squad holds a unit you no longer own' using errcode = '22023';
  end if;

  if v_squad.ally_unit_id is not null then
    select jsonb_build_object('owned_unit_id', o.id, 'unit_id', o.unit_id, 'form_id', o.form_id,
                              'level', o.level, 'unit_type', o.unit_type,
                              'bb_level', o.bb_level, 'sbb_level', o.sbb_level)
      into v_ally
    from public.owned_units o
    where o.id = v_squad.ally_unit_id and o.user_id = v_user_id;

    if v_ally is null then
      raise exception 'start_battle: the ally is no longer yours' using errcode = '22023';
    end if;
  end if;

  if v_squad.guest_id is not null then
    select c.data into v_guest from public.content_items c
    where c.kind = 'guest' and c.id = v_squad.guest_id;
    if v_guest is null then
      raise exception 'start_battle: unknown guest' using errcode = '22023';
    end if;
    v_guest_unit := v_guest ->> 'unit';
    -- Highest rarity and level are independent, over the entire owned collection.
    select max(case when f ->> 'rarity' = 'omni' then 8 else (f ->> 'rarity')::integer end),
           max(o.level),
           greatest((v_guest ->> 'rarityCap')::integer,
             coalesce(max(case when o.unit_id = v_guest_unit then
               case when f ->> 'rarity' = 'omni' then 8 else (f ->> 'rarity')::integer end
             end), 0))
      into v_highest_rarity, v_highest_level, v_cap
    from public.owned_units o
    join public.content_items c on c.kind = 'unit' and c.id = o.unit_id
    cross join lateral jsonb_array_elements(c.data -> 'forms') f
    where o.user_id = v_user_id and f ->> 'id' = o.form_id;

    select f into v_guest_form
    from public.content_items c
    cross join lateral jsonb_array_elements(c.data -> 'forms') f
    where c.kind = 'unit' and c.id = v_guest_unit
      and (case when f ->> 'rarity' = 'omni' then 8 else (f ->> 'rarity')::integer end)
        <= least(v_highest_rarity, v_cap)
    order by (case when f ->> 'rarity' = 'omni' then 8 else (f ->> 'rarity')::integer end) desc
    limit 1;
    if v_guest_form is null then
      raise exception 'start_battle: no guest form matches your collection' using errcode = '22023';
    end if;
    v_ally := jsonb_build_object('owned_unit_id', null, 'unit_id', v_guest_unit,
      'form_id', v_guest_form ->> 'id',
      'level', least(v_highest_level, (v_guest_form ->> 'maxLevel')::integer),
      'unit_type', null, 'kind', 'guest');
  end if;

  select v.version into v_version from public.content_version v;
  if v_version is null then
    raise exception 'start_battle: game content is not seeded' using errcode = '55000';
  end if;

  insert into public.battle_sessions (user_id, stage_id, seed, squad, content_version, expires_at)
  values (
    v_user_id,
    p_stage_id,
    ('x' || encode(extensions.gen_random_bytes(4), 'hex'))::bit(32)::bigint,
    jsonb_build_object('leader_index', v_squad.leader_index, 'units', v_units, 'ally', v_ally),
    v_version,
    now() + interval '1 hour'
  )
  returning * into v_row;

  return v_row;
end;
$$;
