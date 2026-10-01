-- M4-04G: story first clears grant Lantern Toads (RESOLVED-71, GAME_DESIGN §8 → Starters). A
-- stage's `firstClear.units` ([{unit, count}], stackable single-form units only) adds `count`
-- copies to the player's stack through change_unit_stack (reason 'battle_first_clear', ref the
-- session), in the same claim transaction as the stage's gems, items, and starter. The result
-- gains `first_clear_units` ({unit id: count}) when the stage grants any; replays grant
-- nothing. Everything else is unchanged from 20261001170000_first_clear_items.sql.
create or replace function public.grant_battle_rewards(p_session_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rewards jsonb;
  v_session public.battle_sessions;
  v_first_clear jsonb;
  v_rule jsonb;
  v_entry jsonb;
  v_items jsonb;
  v_units jsonb;
  v_form_id text;
  v_picked text;
  v_unit_id text;
  v_unit public.owned_units;
begin
  v_rewards := public.grant_battle_base_rewards(p_session_id);
  if not (v_rewards ->> 'first_clear')::boolean then
    return v_rewards;
  end if;

  select * into v_session from public.battle_sessions where id = p_session_id;
  select c.data -> 'firstClear' into v_first_clear
  from public.content_items c
  where c.kind = 'stage' and c.id = v_session.stage_id;

  -- First-clear items: one grant (and item_log row) per entry.
  v_items := coalesce(v_rewards -> 'items', '{}'::jsonb);
  for v_entry in
    select value from jsonb_array_elements(coalesce(v_first_clear -> 'items', '[]'::jsonb))
  loop
    perform public.grant_item(v_session.user_id, v_entry ->> 'item',
      (v_entry ->> 'count')::bigint, 'battle_first_clear', v_session.id);
    v_items := jsonb_set(v_items, array[v_entry ->> 'item'],
      to_jsonb(coalesce((v_items ->> (v_entry ->> 'item'))::bigint, 0)
        + (v_entry ->> 'count')::bigint));
  end loop;
  v_rewards := v_rewards || jsonb_build_object('items', v_items);

  -- First-clear units: stackable fodder (the Lantern Toads), one stack change per entry.
  v_units := '{}'::jsonb;
  for v_entry in
    select value from jsonb_array_elements(coalesce(v_first_clear -> 'units', '[]'::jsonb))
  loop
    if not public.unit_is_stackable(v_entry ->> 'unit') then
      raise exception 'grant_battle_rewards: first-clear unit % is not stackable',
        v_entry ->> 'unit' using errcode = '55000';
    end if;
    select c.data -> 'forms' -> 0 ->> 'id' into v_form_id
    from public.content_items c
    where c.kind = 'unit' and c.id = v_entry ->> 'unit';
    perform public.change_unit_stack(v_session.user_id, v_entry ->> 'unit', v_form_id,
      (v_entry ->> 'count')::integer, 'battle_first_clear', v_session.id);
    v_units := jsonb_set(v_units, array[v_entry ->> 'unit'],
      to_jsonb(coalesce((v_units ->> (v_entry ->> 'unit'))::integer, 0)
        + (v_entry ->> 'count')::integer));
  end loop;
  if v_units <> '{}'::jsonb then
    v_rewards := v_rewards || jsonb_build_object('first_clear_units', v_units);
  end if;

  select c.data -> 'firstClear' -> 'starter' into v_rule
  from public.content_items c
  where c.kind = 'stage' and c.id = v_session.stage_id and c.data ? 'story';
  if v_rule is null then
    return v_rewards;
  end if;

  -- Use the permanent acquisition log, not the mutable inventory or current squad. The
  -- selected starter may have evolved or been consumed without changing the reward order.
  select l.unit_id into v_picked from public.unit_log l
  where l.user_id = v_session.user_id and l.reason = 'starter_pick' and l.delta = 1;
  if v_picked is null or not (v_picked = any(public.starter_unit_ids())) then
    raise exception 'grant_battle_rewards: starter pick is unavailable' using errcode = '55000';
  end if;

  select s.unit_id into v_unit_id
  from unnest(public.starter_unit_ids()) with ordinality as s(unit_id, ord)
  where s.unit_id <> v_picked order by s.ord
  offset ((v_rule ->> 'ordinal')::integer - 1) limit 1;
  if v_unit_id is null then
    raise exception 'grant_battle_rewards: invalid starter reward' using errcode = '55000';
  end if;

  v_unit := public.grant_unit(v_session.user_id, v_unit_id,
    v_unit_id || '-' || (v_rule ->> 'rarity'));
  insert into public.unit_log (user_id, owned_unit_id, unit_id, form_id, delta, reason, ref_id)
  values (v_session.user_id, v_unit.id, v_unit.unit_id, v_unit.form_id, 1,
    'story_starter', v_session.id);

  return v_rewards || jsonb_build_object('starter', jsonb_build_object(
    'owned_unit_id', v_unit.id, 'unit_id', v_unit.unit_id, 'form_id', v_unit.form_id));
end;
$$;

revoke execute on function public.grant_battle_rewards(uuid) from public, anon, authenticated;
grant execute on function public.grant_battle_rewards(uuid) to service_role;
