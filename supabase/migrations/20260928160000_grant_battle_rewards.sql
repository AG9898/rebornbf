-- M3-04D: finish and reward a server-verified battle in one transaction. Only the server's
-- service-role client may call this RPC; clients cannot choose a seed or claim a reward directly.
create function public.grant_battle_rewards(p_session_id uuid)
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
  v_gems bigint := 0;
  v_zel bigint := 0;
  v_first_clear boolean := false;
  v_balance bigint;
  v_rate numeric;
  v_amount bigint;
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

  -- Each enemy instance in each wave has one independent server-side Zel roll. Currency amounts
  -- and rates come only from seeded content, never the submitted input log.
  for v_wave in select value from jsonb_array_elements(v_stage -> 'waves') loop
    for v_slot in select value from jsonb_array_elements(v_wave -> 'enemies') loop
      select c.data into v_enemy from public.content_items c
      where c.kind = 'enemy' and c.id = v_slot ->> 'enemy';
      if v_enemy is null then
        raise exception 'grant_battle_rewards: enemy content is unavailable'
          using errcode = '55000';
      end if;
      v_rate := (v_enemy -> 'drops' -> 'zel' ->> 'rate')::numeric;
      v_amount := (v_enemy -> 'drops' -> 'zel' ->> 'amount')::bigint;
      if v_rate is not null and v_amount is not null
          and (('x' || encode(extensions.gen_random_bytes(4), 'hex'))::bit(32)::bigint)::numeric
            < v_rate * 4294967296 / 100 then
        v_zel := v_zel + v_amount;
      end if;
    end loop;
  end loop;

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

  return jsonb_build_object('first_clear', v_first_clear, 'gems', v_gems, 'zel', v_zel);
end;
$$;

revoke execute on function public.grant_battle_rewards(uuid) from public, anon, authenticated;
grant execute on function public.grant_battle_rewards(uuid) to service_role;
