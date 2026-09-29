-- M4-03B: farming-dungeon stages, capture drops, item drops, and key items (RESOLVED-67,
-- RESOLVED-70; GAME_DESIGN §7 → Farming dungeons, §8).
--
-- A dungeon stage carries `dungeon: {series, gate, keyItem?}` instead of `story`. start_battle
-- opens it once the caller has cleared its gate stage (a story stage, or Trial 1). Settlement
-- rolls, per defeated enemy, its capture drop (granted as an owned unit in the unit's first form)
-- and its item drops (granted through grant_item), and the stage's key item (1 on first clear,
-- then `rate`% per clear). A slot marked `capture: "always"` (a dungeon's final-wave material
-- enemy) is captured without a roll. Every roll is a server-side pgcrypto draw, as for Zel.

-- ---------------------------------------------------------------------------------------------
-- roll_percent: true with probability p_rate% (0..100), from a 32-bit pgcrypto draw. Internal:
-- only other security definer functions (owned by postgres) may call it.
-- ---------------------------------------------------------------------------------------------
create function public.roll_percent(p_rate numeric)
returns boolean
language sql
volatile
set search_path = ''
as $$
  select p_rate is not null
    and (('x' || encode(extensions.gen_random_bytes(4), 'hex'))::bit(32)::bigint)::numeric
      < p_rate * 4294967296 / 100;
$$;

revoke execute on function public.roll_percent(numeric)
  from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------------------------
-- start_battle: as in M3-04B, plus dungeon stages. Rejects (22023) an unknown stage or one that
-- is neither a story nor a dungeon stage, a locked story stage (previous story stage not
-- cleared), a locked dungeon stage (its gate stage not cleared), and the squad problems as before.
-- ---------------------------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------------------------
-- grant_battle_rewards: as in M3-04D, plus captures, item drops, and key items. Returns
-- {first_clear, gems, zel, units: [{owned_unit_id, unit_id, form_id}], items: {item_id: count}}.
-- Missing enemy, unit, or item content raises and rolls the whole grant back.
-- ---------------------------------------------------------------------------------------------
create or replace function public.grant_battle_rewards(p_session_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session public.battle_sessions;
  v_stage jsonb;
  v_enemy jsonb;
  v_slot jsonb;
  v_wave jsonb;
  v_drop jsonb;
  v_unit jsonb;
  v_key_item jsonb;
  v_gems bigint := 0;
  v_zel bigint := 0;
  v_first_clear boolean := false;
  v_balance bigint;
  v_owned_unit_id uuid;
  v_form_id text;
  v_units jsonb := '[]'::jsonb;
  v_items jsonb := '{}'::jsonb;
  v_item_id text;
begin
  -- The conditional update is the claim. A concurrent call waits for it and then sees no row.
  update public.battle_sessions
  set finished_at = now()
  where id = p_session_id and finished_at is null and expires_at > now()
  returning * into v_session;

  if v_session.id is null then
    raise exception 'grant_battle_rewards: session already claimed, expired, or missing'
      using errcode = 'P0002';
  end if;

  select c.data into v_stage from public.content_items c
  where c.kind = 'stage' and c.id = v_session.stage_id;
  if v_stage is null or v_session.content_version is distinct from
      (select version from public.content_version) then
    raise exception 'grant_battle_rewards: session content is unavailable'
      using errcode = '55000';
  end if;

  insert into public.quest_progress (user_id, stage_id)
  values (v_session.user_id, v_session.stage_id)
  on conflict (user_id, stage_id) do nothing;
  v_first_clear := found;
  if v_first_clear then
    v_gems := coalesce((v_stage -> 'firstClear' ->> 'gems')::bigint, 0);
  end if;

  -- Each enemy instance in each wave has independent server-side rolls. Rates, amounts, and
  -- units come only from seeded content, never the submitted input log.
  for v_wave in select value from jsonb_array_elements(v_stage -> 'waves') loop
    for v_slot in select value from jsonb_array_elements(v_wave -> 'enemies') loop
      select c.data into v_enemy from public.content_items c
      where c.kind = 'enemy' and c.id = v_slot ->> 'enemy';
      if v_enemy is null then
        raise exception 'grant_battle_rewards: enemy content is unavailable'
          using errcode = '55000';
      end if;

      if v_enemy -> 'drops' -> 'zel' ->> 'amount' is not null
          and public.roll_percent((v_enemy -> 'drops' -> 'zel' ->> 'rate')::numeric) then
        v_zel := v_zel + (v_enemy -> 'drops' -> 'zel' ->> 'amount')::bigint;
      end if;

      -- Items: one roll per entry, one item per success.
      for v_drop in
        select value from jsonb_array_elements(coalesce(v_enemy -> 'drops' -> 'items', '[]'))
      loop
        if public.roll_percent((v_drop ->> 'rate')::numeric) then
          v_items := jsonb_set(v_items, array[v_drop ->> 'item'],
            to_jsonb(coalesce((v_items ->> (v_drop ->> 'item'))::bigint, 0) + 1));
        end if;
      end loop;

      -- Capture: the final-wave "always" slot skips the roll (GAME_DESIGN §7 → Farming dungeons).
      v_drop := v_enemy -> 'drops' -> 'capture';
      if v_drop is not null and (v_slot ->> 'capture' = 'always'
          or public.roll_percent((v_drop ->> 'rate')::numeric)) then
        select c.data into v_unit from public.content_items c
        where c.kind = 'unit' and c.id = v_drop ->> 'unit';
        v_form_id := v_unit -> 'forms' -> 0 ->> 'id';
        if v_form_id is null then
          raise exception 'grant_battle_rewards: captured unit content is unavailable'
            using errcode = '55000';
        end if;
        insert into public.owned_units (user_id, unit_id, form_id)
        values (v_session.user_id, v_drop ->> 'unit', v_form_id)
        returning id into v_owned_unit_id;
        v_units := v_units || jsonb_build_array(jsonb_build_object(
          'owned_unit_id', v_owned_unit_id, 'unit_id', v_drop ->> 'unit', 'form_id', v_form_id));
      end if;
    end loop;
  end loop;

  -- Enemy item drops: one grant (and item_log row) per item.
  for v_item_id in select key from jsonb_each(v_items) loop
    perform public.grant_item(v_session.user_id, v_item_id, (v_items ->> v_item_id)::bigint,
      'battle_drop', v_session.id);
  end loop;

  -- Key item: 1 on the stage's first clear, then `rate`% per clear.
  v_key_item := v_stage -> 'dungeon' -> 'keyItem';
  if v_key_item is not null
      and (v_first_clear or public.roll_percent((v_key_item ->> 'rate')::numeric)) then
    perform public.grant_item(v_session.user_id, v_key_item ->> 'item', 1,
      case when v_first_clear then 'battle_first_clear' else 'battle_drop' end, v_session.id);
    v_items := jsonb_set(v_items, array[v_key_item ->> 'item'],
      to_jsonb(coalesce((v_items ->> (v_key_item ->> 'item'))::bigint, 0) + 1));
  end if;

  insert into public.wallets (user_id) values (v_session.user_id)
  on conflict (user_id) do nothing;

  if v_gems > 0 then
    update public.wallets set gems = gems + v_gems, updated_at = now()
    where user_id = v_session.user_id returning gems into v_balance;
    insert into public.wallet_log (user_id, currency, delta, balance_after, reason, ref_id)
    values (v_session.user_id, 'gems', v_gems, v_balance, 'battle_first_clear', v_session.id);
  end if;
  if v_zel > 0 then
    update public.wallets set zel = zel + v_zel, updated_at = now()
    where user_id = v_session.user_id returning zel into v_balance;
    insert into public.wallet_log (user_id, currency, delta, balance_after, reason, ref_id)
    values (v_session.user_id, 'zel', v_zel, v_balance, 'battle_drop', v_session.id);
  end if;

  return jsonb_build_object('first_clear', v_first_clear, 'gems', v_gems, 'zel', v_zel,
    'units', v_units, 'items', v_items);
end;
$$;
