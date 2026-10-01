-- M3-04J / RESOLVED-82: reserve the loadout at start, refund only replay-proven leftovers.
-- Preserve existing stage/ally validation and all reward grants behind internal helpers.
alter table public.battle_sessions
  add column items jsonb not null default '[]'::jsonb,
  add column settlement_result text check (settlement_result in ('win', 'lose'));
update public.battle_sessions set settlement_result = 'win' where finished_at is not null;

alter function public.start_battle(text, smallint, text) rename to start_battle_without_items;
revoke execute on function public.start_battle_without_items(text, smallint, text)
  from public, anon, authenticated, service_role;

create function public.start_battle(
  p_stage_id text, p_squad_slot smallint default 0, p_ally text default null,
  p_items jsonb default '[]'::jsonb
)
returns public.battle_sessions
language plpgsql security definer set search_path = '' as $$
declare
  v_row public.battle_sessions;
  v_item jsonb;
  v_seen text[] := '{}';
  v_id text;
begin
  if auth.uid() is null then
    raise exception 'start_battle: not signed in' using errcode = '42501';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'start_battle: items must be an array' using errcode = '22023';
  end if;
  if jsonb_array_length(p_items) > 5 then
    raise exception 'start_battle: at most five distinct items' using errcode = '22023';
  end if;
  for v_item in select value from jsonb_array_elements(p_items) loop
    v_id := v_item ->> 'item';
    if jsonb_typeof(v_item) <> 'object' or jsonb_typeof(v_item -> 'item') <> 'string'
       or v_id is null or v_id = any(v_seen)
       or jsonb_typeof(v_item -> 'count') is distinct from 'number'
       or coalesce(v_item ->> 'count', '') !~ '^([1-9]|10)$' then
      raise exception 'start_battle: distinct items with counts 1-10 required' using errcode = '22023';
    end if;
    if not exists (select 1 from public.content_items c
      where c.kind = 'item' and c.id = v_id and c.data ? 'effects' and c.data ? 'target') then
      raise exception 'start_battle: unknown battle item' using errcode = '22023';
    end if;
    v_seen := array_append(v_seen, v_id);
  end loop;
  v_row := public.start_battle_without_items(p_stage_id, p_squad_slot, p_ally);
  -- Stable item order avoids deadlocks between concurrent loadouts; a failed debit rolls back
  -- the session and every earlier debit. Only IDs/counts, never client effects, are frozen.
  for v_item in select value from jsonb_array_elements(p_items) order by value ->> 'item' loop
    perform public.consume_item(v_row.user_id, v_item ->> 'item',
      (v_item ->> 'count')::bigint, 'battle_loadout', v_row.id);
  end loop;
  update public.battle_sessions set items = (
    select coalesce(jsonb_agg(jsonb_build_object('item', value ->> 'item',
      'count', (value ->> 'count')::integer) order by ord), '[]'::jsonb)
    from jsonb_array_elements(p_items) with ordinality as e(value, ord)
  ) where id = v_row.id returning * into v_row;
  return v_row;
end;
$$;
revoke execute on function public.start_battle(text, smallint, text, jsonb) from public, anon;
grant execute on function public.start_battle(text, smallint, text, jsonb) to authenticated;

alter function public.grant_battle_rewards(uuid) rename to grant_battle_rewards_without_refund;
revoke execute on function public.grant_battle_rewards_without_refund(uuid)
  from public, anon, authenticated, service_role;

-- Internal common claim. Only the trusted replay route may supply remaining counts through
-- the service-only wrappers. Never accept these counts directly from the player's request.
create function public.settle_battle_items(p_session_id uuid, p_remaining jsonb, p_result text)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_row public.battle_sessions;
  v_entry record;
  v_count integer;
  v_rewards jsonb := '{}'::jsonb;
begin
  select * into v_row from public.battle_sessions where id = p_session_id for update;
  if v_row.id is null or v_row.finished_at is not null or v_row.expires_at <= now() then
    raise exception 'settle_battle_items: session unavailable' using errcode = 'P0002';
  end if;
  if p_remaining is null or jsonb_typeof(p_remaining) <> 'object'
     or p_result is null or p_result not in ('win', 'lose') then
    raise exception 'settle_battle_items: invalid settlement' using errcode = '22023';
  end if;
  for v_entry in select key, value from jsonb_each(p_remaining) loop
    if jsonb_typeof(v_entry.value) <> 'number' or v_entry.value::text !~ '^([0-9]|10)$' then
      raise exception 'settle_battle_items: invalid remaining count' using errcode = '22023';
    end if;
    select (value ->> 'count')::integer into v_count
    from jsonb_array_elements(v_row.items) where value ->> 'item' = v_entry.key;
    if v_count is null or v_entry.value::text::integer > v_count then
      raise exception 'settle_battle_items: remaining exceeds loadout' using errcode = '22023';
    end if;
  end loop;
  if p_result = 'win' then
    v_rewards := public.grant_battle_rewards_without_refund(p_session_id);
  else
    update public.battle_sessions set finished_at = now() where id = p_session_id;
  end if;
  update public.battle_sessions set settlement_result = p_result where id = p_session_id;
  for v_entry in select key, value from jsonb_each(p_remaining) order by key loop
    if v_entry.value::text::integer > 0 then
      perform public.grant_item(v_row.user_id, v_entry.key, v_entry.value::text::bigint,
        'battle_refund', v_row.id);
    end if;
  end loop;
  return v_rewards;
end;
$$;
revoke execute on function public.settle_battle_items(uuid, jsonb, text)
  from public, anon, authenticated, service_role;

create function public.grant_battle_rewards(p_session_id uuid, p_remaining jsonb default '{}'::jsonb)
returns jsonb
language sql security definer set search_path = '' as $$
  select public.settle_battle_items(p_session_id, p_remaining, 'win');
$$;
create function public.settle_battle_loss(p_session_id uuid, p_remaining jsonb)
returns jsonb
language sql security definer set search_path = '' as $$
  select public.settle_battle_items(p_session_id, p_remaining, 'lose');
$$;
revoke execute on function public.grant_battle_rewards(uuid, jsonb) from public, anon, authenticated;
revoke execute on function public.settle_battle_loss(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.grant_battle_rewards(uuid, jsonb) to service_role;
grant execute on function public.settle_battle_loss(uuid, jsonb) to service_role;

-- A settled loss must not count as a dungeon clear. Null preserves legacy/test win rows.
create or replace function public.dungeon_wins_today(p_user_id uuid, p_series text)
returns integer language sql stable set search_path = '' as $$
  select count(*)::integer from public.battle_sessions b
  join public.content_items c on c.kind = 'stage' and c.id = b.stage_id
  where b.user_id = p_user_id
    and b.finished_at >= (now() at time zone 'utc')::date::timestamp at time zone 'utc'
    and b.settlement_result is distinct from 'lose'
    and c.data -> 'dungeon' ->> 'series' = p_series;
$$;
