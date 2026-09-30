-- M3-03C: launch guest pool, saved guest choice, and server-scaled battle snapshot.
alter table public.content_items drop constraint content_items_kind_check;
alter table public.content_items add constraint content_items_kind_check
  check (kind in ('unit', 'item', 'enemy', 'stage', 'banner', 'guest'));

alter table public.squads add column guest_id text;
alter table public.squads add constraint squads_one_ally_check
  check (ally_unit_id is null or guest_id is null);
comment on column public.squads.guest_id is
  'Guest content ID; start_battle derives form and level from the caller collection.';

create function public.save_squad(
  p_slot smallint,
  p_unit_ids uuid[],
  p_leader_index smallint,
  p_ally_unit_id uuid,
  p_guest_id text
)
returns public.squads
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_size integer := coalesce(cardinality(p_unit_ids), 0);
  v_owned integer;
  v_row public.squads;
begin
  if v_user_id is null then
    raise exception 'save_squad: not signed in' using errcode = '42501';
  end if;

  if p_slot is null or p_slot < 0 or p_slot > 9 then
    raise exception 'save_squad: slot must be 0-9' using errcode = '22023';
  end if;

  if v_size < 1 or v_size > 5 or array_ndims(p_unit_ids) <> 1 then
    raise exception 'save_squad: a squad holds 1-5 units' using errcode = '22023';
  end if;

  if array_position(p_unit_ids, null) is not null then
    raise exception 'save_squad: unit ids must not be null' using errcode = '22023';
  end if;

  if (select count(distinct u) from unnest(p_unit_ids) as u) <> v_size then
    raise exception 'save_squad: a unit may appear only once in a squad' using errcode = '22023';
  end if;

  select count(*) into v_owned
  from public.owned_units o
  where o.user_id = v_user_id and o.id = any (p_unit_ids);

  if v_owned <> v_size then
    raise exception 'save_squad: every squad unit must be your own' using errcode = '22023';
  end if;

  if p_leader_index is null or p_leader_index < 0 or p_leader_index >= v_size then
    raise exception 'save_squad: the leader must be one of the squad units' using errcode = '22023';
  end if;

  if p_ally_unit_id is not null and not exists (
    select 1 from public.owned_units o where o.user_id = v_user_id and o.id = p_ally_unit_id
  ) then
    raise exception 'save_squad: the ally must be one of your own units' using errcode = '22023';
  end if;

  if p_ally_unit_id is not null and p_guest_id is not null then
    raise exception 'save_squad: choose one ally' using errcode = '22023';
  end if;
  if p_guest_id is not null and not exists (
    select 1 from public.content_items c where c.kind = 'guest' and c.id = p_guest_id
  ) then
    raise exception 'save_squad: unknown guest' using errcode = '22023';
  end if;

  insert into public.squads as s (user_id, slot, unit_ids, leader_index, ally_unit_id, guest_id)
  values (v_user_id, p_slot, p_unit_ids, p_leader_index, p_ally_unit_id, p_guest_id)
  on conflict (user_id, slot) do update
    set unit_ids = excluded.unit_ids,
        leader_index = excluded.leader_index,
        ally_unit_id = excluded.ally_unit_id,
        guest_id = excluded.guest_id,
        updated_at = now()
  returning s.* into v_row;

  return v_row;
end;
$$;

revoke execute on function public.save_squad(smallint, uuid[], smallint, uuid, text) from public, anon;
grant execute on function public.save_squad(smallint, uuid[], smallint, uuid, text) to authenticated;

-- Preserve the original four-argument RPC for existing callers; saving a duplicate clears a guest.
create or replace function public.save_squad(
  p_slot smallint, p_unit_ids uuid[], p_leader_index smallint, p_ally_unit_id uuid default null
)
returns public.squads language sql security definer set search_path = '' as $$
  select public.save_squad(p_slot, p_unit_ids, p_leader_index, p_ally_unit_id, null);
$$;

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

  if v_stage is null or not (v_stage ? 'story' or v_stage ? 'dungeon') then
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
  elsif not exists (
    -- A dungeon opens on its gate stage's first clear (GAME_DESIGN §7 → Farming dungeons).
    select 1 from public.quest_progress q
    where q.user_id = v_user_id and q.stage_id = v_stage -> 'dungeon' ->> 'gate'
  ) then
    raise exception 'start_battle: this dungeon is still locked' using errcode = '22023';
  end if;

  select * into v_squad
  from public.squads s
  where s.user_id = v_user_id and s.slot = p_squad_slot;

  if v_squad.id is null or cardinality(v_squad.unit_ids) = 0 then
    raise exception 'start_battle: save a squad before starting a battle' using errcode = '22023';
  end if;

  select jsonb_agg(
           jsonb_build_object('owned_unit_id', o.id, 'unit_id', o.unit_id, 'form_id', o.form_id,
                              'level', o.level, 'unit_type', o.unit_type)
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
                              'level', o.level, 'unit_type', o.unit_type)
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
