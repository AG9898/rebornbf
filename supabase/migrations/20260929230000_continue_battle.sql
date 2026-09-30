-- M3-04E: only the replay server can authorize a paid continue after proving a wipe.
alter table public.battle_sessions add column continued_turn integer
  check (continued_turn between 1 and 200);

create function public.continue_battle(p_session_id uuid, p_user_id uuid, p_turn integer)
returns public.battle_sessions
language plpgsql security definer set search_path = ''
as $$
declare
  v_session public.battle_sessions;
  v_stage jsonb;
  v_balance bigint;
begin
  select * into v_session from public.battle_sessions
  where id = p_session_id and user_id = p_user_id for update;
  if v_session.id is null or v_session.finished_at is not null
      or v_session.expires_at <= now() then
    raise exception 'continue_battle: session missing, expired, finished, or already continued'
      using errcode = 'P0002';
  end if;
  select data into v_stage from public.content_items
  where kind = 'stage' and id = v_session.stage_id;
  -- Only supported story/dungeon stages may continue; trials always refuse.
  if v_stage is null or v_stage ? 'trial'
      or not (v_stage ? 'story' or v_stage ? 'dungeon')
      or v_session.content_version is distinct from (select version from public.content_version)
      or p_turn is null or p_turn not between 1 and 200 then
    raise exception 'continue_battle: stage or continue turn unavailable' using errcode = '22023';
  end if;
  if v_session.continued_turn is not null then
    if v_session.continued_turn = p_turn then return v_session; end if;
    raise exception 'continue_battle: already continued' using errcode = 'P0002';
  end if;
  update public.wallets set gems = gems - 5, updated_at = now()
  where user_id = p_user_id and gems >= 5 returning gems into v_balance;
  if not found then
    raise exception 'continue_battle: requires 5 gems' using errcode = '22023';
  end if;
  insert into public.wallet_log (user_id, currency, delta, balance_after, reason, ref_id)
  values (p_user_id, 'gems', -5, v_balance, 'battle_continue', p_session_id);
  update public.battle_sessions set continued_turn = p_turn where id = p_session_id
  returning * into v_session;
  return v_session;
end;
$$;
revoke execute on function public.continue_battle(uuid, uuid, integer) from public, anon, authenticated;
grant execute on function public.continue_battle(uuid, uuid, integer) to service_role;
