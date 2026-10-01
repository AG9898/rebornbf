-- M5-01D (RESOLVED-68): spend the free 10-pull ticket on the launch banner.
--
-- summon_ticket(p_banner_id) consumes one summon_tickets count (logged in summon_ticket_log with
-- reason 'summon', ref: the batch) and pulls 10 on the launch banner at no gem cost, in one
-- transaction. Ticket pulls count toward that banner's pity and are recorded in summon_log like gem
-- pulls. The pull loop moves into the internal summon_pulls helper, shared with the gem summon.

-- ---------------------------------------------------------------------------------------------
-- summon_pulls: internal. Rolls p_count pulls on p_banner for p_user, granting each through
-- acquire_unit and recording it in summon_log under p_batch; updates the banner's pity counter.
-- The caller must hold the player's wallet lock (or otherwise serialize the player's summons).
-- Returns {pity_after, results}.
-- ---------------------------------------------------------------------------------------------
create function public.summon_pulls(
  p_user uuid, p_banner_id text, p_banner jsonb, p_count integer, p_batch uuid
)
returns jsonb language plpgsql volatile set search_path = '' as $$
declare
  v_limit integer := (p_banner ->> 'pityPulls')::integer;
  v_pulls integer;
  v_pick jsonb;
  v_unit jsonb;
  v_featured boolean;
  v_pity boolean;
  v_results jsonb := '[]';
begin
  if v_limit is null or v_limit < 1 or jsonb_array_length(p_banner -> 'featured') < 1 then
    raise exception 'summon: invalid pity configuration' using errcode = '55000';
  end if;
  insert into public.summon_pity (user_id, banner_id) values (p_user, p_banner_id)
    on conflict (user_id, banner_id) do nothing;
  select pulls into v_pulls from public.summon_pity
    where user_id = p_user and banner_id = p_banner_id for update;
  for i in 1..p_count loop
    v_pity := v_pulls + 1 >= v_limit;
    v_pick := public.roll_summon(p_banner, v_pity);
    v_featured := exists (select 1 from jsonb_array_elements(p_banner -> 'featured') f
      where f ->> 'unit' = v_pick ->> 'unit' and f ->> 'form' = v_pick ->> 'form');
    v_pulls := case when v_featured then 0 else v_pulls + 1 end;
    v_unit := public.acquire_unit(p_user, v_pick ->> 'unit', v_pick ->> 'form', 'summon', p_batch);
    insert into public.summon_log
      (user_id, banner_id, batch_id, pull_index, owned_unit_id, unit_id, form_id, featured, pity, pity_after)
      values (p_user, p_banner_id, p_batch, i, (v_unit ->> 'owned_unit_id')::uuid,
        v_unit ->> 'unit_id', v_unit ->> 'form_id', v_featured, v_pity, v_pulls);
    v_results := v_results || jsonb_build_array(jsonb_build_object('unit', v_unit,
      'featured', v_featured, 'pity', v_pity, 'pity_after', v_pulls));
  end loop;
  update public.summon_pity set pulls = v_pulls where user_id = p_user and banner_id = p_banner_id;
  return jsonb_build_object('pity_after', v_pulls, 'results', v_results);
end;
$$;
revoke execute on function public.summon_pulls(uuid, text, jsonb, integer, uuid)
  from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------------------------
-- summon: unchanged behaviour (M5-01A, M4-05A), now rolling through summon_pulls.
-- ---------------------------------------------------------------------------------------------
create or replace function public.summon(p_banner_id text, p_count integer)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_banner jsonb;
  v_cost integer;
  v_gems bigint;
  v_batch uuid := gen_random_uuid();
  v_roll jsonb;
begin
  if v_user is null then
    raise exception 'summon: not signed in' using errcode = '42501';
  end if;
  if p_count is null or p_count not in (1, 11) then
    raise exception 'summon: count must be 1 or 11' using errcode = '22023';
  end if;
  select data into v_banner from public.content_items where kind = 'banner' and id = p_banner_id;
  if v_banner is null then
    raise exception 'summon: unknown banner' using errcode = '22023';
  end if;
  v_cost := case p_count when 1 then 5 else 50 end;
  -- Serialize all banners for this player, including the pity upsert, behind the wallet lock.
  select gems into v_gems from public.wallets where user_id = v_user for update;
  if not found then raise exception 'summon: no wallet' using errcode = 'P0002'; end if;
  if v_gems < v_cost then raise exception 'summon: insufficient gems' using errcode = 'P0001'; end if;
  v_roll := public.summon_pulls(v_user, p_banner_id, v_banner, p_count, v_batch);
  v_gems := v_gems - v_cost;
  update public.wallets set gems = v_gems, updated_at = now() where user_id = v_user;
  insert into public.wallet_log (user_id, currency, delta, balance_after, reason, ref_id)
    values (v_user, 'gems', -v_cost, v_gems, 'summon', v_batch);
  return jsonb_build_object('batch_id', v_batch, 'gems', v_gems,
    'pity_after', v_roll -> 'pity_after', 'results', v_roll -> 'results');
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- summon_ticket(p_banner_id): spend one free 10-pull ticket on the launch banner.
-- Returns the summon payload plus tickets_after:
--   {batch_id, gems, tickets_after, pity_after, results}; gems is the unchanged gem balance.
-- Errors: 42501 not signed in; 22023 not the launch banner; P0001 no ticket held.
-- ---------------------------------------------------------------------------------------------
create function public.summon_ticket(p_banner_id text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_banner jsonb;
  v_gems bigint;
  v_tickets integer;
  v_batch uuid := gen_random_uuid();
  v_roll jsonb;
begin
  if v_user is null then
    raise exception 'summon_ticket: not signed in' using errcode = '42501';
  end if;
  if p_banner_id is distinct from 'launch-summon' then
    raise exception 'summon_ticket: tickets pull on the launch banner only' using errcode = '22023';
  end if;
  select data into v_banner from public.content_items where kind = 'banner' and id = p_banner_id;
  if v_banner is null then
    raise exception 'summon_ticket: unknown banner' using errcode = '22023';
  end if;
  -- Same wallet lock as the gem summon, so the two paths never race on pity.
  insert into public.wallets (user_id) values (v_user) on conflict (user_id) do nothing;
  select gems into v_gems from public.wallets where user_id = v_user for update;
  -- The conditional decrement is the ticket check: no row or a zero count spends nothing.
  update public.summon_tickets set count = count - 1, updated_at = now()
    where user_id = v_user and count > 0
    returning count into v_tickets;
  if v_tickets is null then
    raise exception 'summon_ticket: no ticket' using errcode = 'P0001';
  end if;
  insert into public.summon_ticket_log (user_id, delta, count_after, reason, ref_id)
    values (v_user, -1, v_tickets, 'summon', v_batch);
  v_roll := public.summon_pulls(v_user, p_banner_id, v_banner, 10, v_batch);
  return jsonb_build_object('batch_id', v_batch, 'gems', v_gems, 'tickets_after', v_tickets,
    'pity_after', v_roll -> 'pity_after', 'results', v_roll -> 'results');
end;
$$;
revoke execute on function public.summon_ticket(text) from public, anon;
grant execute on function public.summon_ticket(text) to authenticated;
