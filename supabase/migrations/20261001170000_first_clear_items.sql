-- M4-02N: first-clear reward items (RESOLVED-69). A stage's `firstClear.items` ([{item, count}])
-- are granted through grant_item on the stage's first clear, in the same claim transaction, and
-- merged into the returned `items` map. Trial 1 grants 1 Zenith Core this way; repeat clears
-- grant nothing from it. The Zenith Core stage itself (the `zenith-core` series, gated on the
-- Trial 1 first clear) needs no change here: start_battle's dungeon gate check and
-- grant_battle_base_rewards' key-item rule already cover it. Story starter rewards are unchanged
-- from 20260929231000_story_starters.sql.
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
