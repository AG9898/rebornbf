-- M3-03B: the squad editor's ally slot and the save_squad RPC.
--
-- A squad is 1–5 of the player's own units in squad order, a leader among them, and an optional
-- sixth ally slot (GAME_DESIGN.md §2, RESOLVED-05). This migration stores the ally when it is a
-- duplicate of one of the player's own units; the guest pool and guest allies are M3-03C.
-- Clients still cannot write `squads` directly: save_squad is the only write path and it derives
-- the player from auth.uid().

alter table public.squads
  add column ally_unit_id uuid references public.owned_units (id) on delete set null;

comment on column public.squads.ally_unit_id is
  'Optional ally slot: an owned unit fielded again as a duplicate (RESOLVED-05). Null = no ally.';

-- ---------------------------------------------------------------------------------------------
-- save_squad: create or replace the caller's squad in `p_slot` (0–9). Rejects (22023) a squad
-- that is empty, larger than 5, repeats a unit, contains a unit the caller does not own, has a
-- leader index outside the squad, or names an ally the caller does not own. The ally may be a
-- duplicate of a unit already in the squad. Returns the saved row.
-- ---------------------------------------------------------------------------------------------
create function public.save_squad(
  p_slot smallint,
  p_unit_ids uuid[],
  p_leader_index smallint,
  p_ally_unit_id uuid default null
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

  insert into public.squads as s (user_id, slot, unit_ids, leader_index, ally_unit_id)
  values (v_user_id, p_slot, p_unit_ids, p_leader_index, p_ally_unit_id)
  on conflict (user_id, slot) do update
    set unit_ids = excluded.unit_ids,
        leader_index = excluded.leader_index,
        ally_unit_id = excluded.ally_unit_id,
        updated_at = now()
  returning s.* into v_row;

  return v_row;
end;
$$;

revoke execute on function public.save_squad(smallint, uuid[], smallint, uuid) from public, anon;
grant execute on function public.save_squad(smallint, uuid[], smallint, uuid) to authenticated;
