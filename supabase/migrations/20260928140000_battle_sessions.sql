-- M3-04B: battle_sessions and the start_battle RPC (RESOLVED-08, ARCHITECTURE.md Data Flow).
--
-- A battle starts from a server-issued session: start_battle records the stage, a server-rolled
-- seed, a snapshot of the caller's squad (with its ally), the content version, and an expiry, and
-- returns the row. The client plays the battle locally with that seed; the finish route (M3-04C)
-- replays the input log against this row, and grant_battle_rewards (M3-04D) sets finished_at.
-- Clients cannot write sessions directly, so they cannot choose their own seed.

create table public.battle_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  stage_id text not null check (stage_id ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  -- An unsigned 32-bit engine seed (createBattle takes any safe integer modulo 2^32).
  seed bigint not null check (seed between 0 and 4294967295),
  -- {"leader_index": n, "units": [unit, ...], "ally": unit | null} in squad order, where unit is
  -- {"owned_unit_id", "unit_id", "form_id", "level"} as the rows stood when the battle started.
  squad jsonb not null check (jsonb_typeof(squad) = 'object'),
  content_version text not null check (content_version ~ '^[0-9a-f]{16}$'),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  finished_at timestamptz,
  check (expires_at > created_at)
);

comment on table public.battle_sessions is
  'Server-issued battle sessions (M3-04B): seed, squad snapshot, content version, expiry.';

create index battle_sessions_user_id_idx on public.battle_sessions (user_id, created_at desc);

alter table public.battle_sessions enable row level security;

create policy "battle_sessions: read own" on public.battle_sessions
  for select to authenticated using (user_id = (select auth.uid()));

-- As with the base tables: strip the default client privileges so direct writes fail with 42501.
revoke all on table public.battle_sessions from anon, authenticated;
grant select on table public.battle_sessions to authenticated;

-- ---------------------------------------------------------------------------------------------
-- start_battle: open a session for the caller on story stage `p_stage_id` with the squad saved
-- in `p_squad_slot`. Rejects (22023) an unknown or non-story stage, a stage still locked (the
-- previous story stage is not cleared), an empty or missing squad slot, and a squad whose units
-- or ally are no longer the caller's. The seed comes from pgcrypto; sessions expire after an hour.
-- ---------------------------------------------------------------------------------------------
create function public.start_battle(p_stage_id text, p_squad_slot smallint default 0)
returns public.battle_sessions
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_story_number integer;
  v_previous_stage text;
  v_squad public.squads;
  v_units jsonb;
  v_unit_count integer;
  v_ally jsonb;
  v_version text;
  v_row public.battle_sessions;
begin
  if v_user_id is null then
    raise exception 'start_battle: not signed in' using errcode = '42501';
  end if;

  select (c.data -> 'story' ->> 'number')::integer into v_story_number
  from public.content_items c
  where c.kind = 'stage' and c.id = p_stage_id and c.data ? 'story';

  if v_story_number is null then
    raise exception 'start_battle: unknown stage' using errcode = '22023';
  end if;

  -- Story stages unlock in number order, as on the quest map: the first is always open.
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

  select * into v_squad
  from public.squads s
  where s.user_id = v_user_id and s.slot = p_squad_slot;

  if v_squad.id is null or cardinality(v_squad.unit_ids) = 0 then
    raise exception 'start_battle: save a squad before starting a battle' using errcode = '22023';
  end if;

  select jsonb_agg(
           jsonb_build_object('owned_unit_id', o.id, 'unit_id', o.unit_id, 'form_id', o.form_id,
                              'level', o.level)
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
                              'level', o.level)
      into v_ally
    from public.owned_units o
    where o.id = v_squad.ally_unit_id and o.user_id = v_user_id;

    if v_ally is null then
      raise exception 'start_battle: the ally is no longer yours' using errcode = '22023';
    end if;
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

revoke execute on function public.start_battle(text, smallint) from public, anon;
grant execute on function public.start_battle(text, smallint) to authenticated;
