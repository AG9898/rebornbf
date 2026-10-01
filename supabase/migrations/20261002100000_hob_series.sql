-- M4-03I. Owner clarification (2026-10-01): Grand Hob is 15% per clear, replaces one
-- regular hob in a randomized wave, and is always captured. No extra enemy or per-wave roll.
-- Use the server-issued session seed, so battle builders and settlement resolve the same enemy.
-- Matches @bfr/data dungeonWaves; encounter selection does not consume the combat RNG.
create function public.dungeon_waves(p_stage jsonb, p_seed bigint)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_rare jsonb := p_stage -> 'dungeon' -> 'rareSpawn';
  v_waves jsonb := p_stage -> 'waves';
  v_wave integer;
  v_slot integer;
begin
  if p_seed is null or p_seed < 0 or p_seed > 4294967295 then
    raise exception 'dungeon_waves: seed must be unsigned 32-bit' using errcode = '22023';
  end if;
  if v_rare is null or p_seed % 10000 >= (v_rare ->> 'rateBp')::integer then
    return v_waves;
  end if;
  v_wave := (p_seed / 10000) % jsonb_array_length(v_waves);
  select (ordinality - 1)::integer into v_slot
  from jsonb_array_elements(v_waves -> v_wave -> 'enemies') with ordinality
  where value ->> 'enemy' = v_rare ->> 'replaces'
  order by ordinality limit 1;
  if v_slot is null then
    raise exception 'dungeon_waves: replacement candidate is missing' using errcode = '55000';
  end if;
  return jsonb_set(v_waves, array[v_wave::text, 'enemies', v_slot::text, 'enemy'], v_rare -> 'enemy');
end;
$$;
revoke all on function public.dungeon_waves(jsonb, bigint) from public, anon, authenticated;

-- Retain the existing atomic stack-aware reward transaction; change only its wave resolution.
create or replace function public.grant_battle_base_rewards(p_session_id uuid)
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
  v_form_id text;
  v_units jsonb := '[]'::jsonb;
  v_items jsonb := '{}'::jsonb;
  v_item_id text;
begin
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
  for v_wave in select value from jsonb_array_elements(public.dungeon_waves(v_stage, v_session.seed)) loop
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
      for v_drop in
        select value from jsonb_array_elements(coalesce(v_enemy -> 'drops' -> 'items', '[]'))
      loop
        if public.roll_percent((v_drop ->> 'rate')::numeric) then
          v_items := jsonb_set(v_items, array[v_drop ->> 'item'],
            to_jsonb(coalesce((v_items ->> (v_drop ->> 'item'))::bigint, 0) + 1));
        end if;
      end loop;
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
        v_units := v_units || jsonb_build_array(public.acquire_unit(v_session.user_id,
          v_drop ->> 'unit', v_form_id, 'battle_capture', v_session.id));
      end if;
    end loop;
  end loop;
  for v_item_id in select key from jsonb_each(v_items) loop
    perform public.grant_item(v_session.user_id, v_item_id, (v_items ->> v_item_id)::bigint,
      'battle_drop', v_session.id);
  end loop;
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
