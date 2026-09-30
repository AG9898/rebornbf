-- M4-05A: stack untouched fodder and material units as counts (RESOLVED-75; GAME_DESIGN §6 →
-- Growth fodder → Stacking).
--
-- A unit whose content carries `stackable: true` (every single-form fodder and material unit) is
-- granted into owned_unit_stacks as one count per (user, unit, form), logged per change in
-- unit_stack_log, instead of one owned_units row per copy. Routing:
--   - acquire_unit(user, unit, form, reason, ref) is the one acquisition entry point: a stackable
--     unit adds 1 to its stack (unit_stack_log row); any other unit gets an owned_units row through
--     grant_unit (type roll) and a unit_log row. Summons and battle captures call it.
--   - grant_unit now rejects stackable units, so a new grant path cannot bypass the stack.
--     pick_starter and the story starter rewards keep calling grant_unit (starters are multi-form).
--   - change_unit_stack(user, unit, form, delta, reason, ref) is the internal counter primitive
--     (positive adds, negative spends and rejects going below zero); M4-05B's fuse/evolve spend
--     stacks through it.
--   - split_unit_stack(stack_id) is the player RPC that moves one copy out of a stack into an
--     ordinary owned_units row (logged in both logs); a split copy never rejoins a stack.
-- Existing untouched copies are folded into counts once by fold_untouched_unit_stacks().

-- ---------------------------------------------------------------------------------------------
-- owned_unit_stacks: one count per (user, unit, form). A stack spent to 0 keeps its row.
-- ---------------------------------------------------------------------------------------------
create table public.owned_unit_stacks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  unit_id text not null check (unit_id ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  form_id text not null check (form_id ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  count integer not null default 0 check (count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, unit_id, form_id)
);

alter table public.owned_unit_stacks enable row level security;
create policy "owned_unit_stacks: read own" on public.owned_unit_stacks
  for select to authenticated using (user_id = (select auth.uid()));
revoke all on table public.owned_unit_stacks from anon, authenticated;
grant select on table public.owned_unit_stacks to authenticated;

-- ---------------------------------------------------------------------------------------------
-- unit_stack_log: append-only record of every stack change, with the count after it.
-- ---------------------------------------------------------------------------------------------
create table public.unit_stack_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  stack_id uuid not null,
  unit_id text not null,
  form_id text not null,
  delta integer not null check (delta <> 0),
  count_after integer not null check (count_after >= 0),
  reason text not null check (char_length(reason) between 1 and 64),
  ref_id uuid,
  created_at timestamptz not null default now()
);

create index unit_stack_log_user_id_created_at_idx
  on public.unit_stack_log (user_id, created_at desc);

alter table public.unit_stack_log enable row level security;
create policy "unit_stack_log: read own" on public.unit_stack_log
  for select to authenticated using (user_id = (select auth.uid()));
revoke all on table public.unit_stack_log from anon, authenticated;
grant select on table public.unit_stack_log to authenticated;

create function public.reject_unit_stack_log_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' and not exists (select 1 from auth.users u where u.id = old.user_id) then
    return old;
  end if;
  raise exception 'unit_stack_log is append-only' using errcode = 'P0001';
end;
$$;

revoke execute on function public.reject_unit_stack_log_change() from public, anon, authenticated;

create trigger unit_stack_log_append_only
  before update or delete on public.unit_stack_log
  for each row execute function public.reject_unit_stack_log_change();

-- ---------------------------------------------------------------------------------------------
-- unit_is_stackable: whether seeded content marks p_unit_id `stackable`. Internal.
-- ---------------------------------------------------------------------------------------------
create function public.unit_is_stackable(p_unit_id text)
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce((
    select c.data -> 'stackable' = 'true'::jsonb
    from public.content_items c
    where c.kind = 'unit' and c.id = p_unit_id
  ), false);
$$;

-- ---------------------------------------------------------------------------------------------
-- change_unit_stack: add p_delta (non-zero) to p_user_id's stack of (p_unit_id, p_form_id) and log
-- it. A positive delta creates the stack if needed; a negative delta rejects (P0001) when the
-- stack holds fewer copies. Returns the stack row after the change. Internal: callers validate
-- content (acquire_unit) or spend what the player chose (M4-05B).
-- ---------------------------------------------------------------------------------------------
create function public.change_unit_stack(
  p_user_id uuid,
  p_unit_id text,
  p_form_id text,
  p_delta integer,
  p_reason text,
  p_ref_id uuid default null
)
returns public.owned_unit_stacks
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.owned_unit_stacks;
begin
  if p_user_id is null or p_delta is null or p_delta = 0 then
    raise exception 'change_unit_stack: a user and a non-zero delta are required'
      using errcode = '22023';
  end if;

  if p_delta > 0 then
    insert into public.owned_unit_stacks as s (user_id, unit_id, form_id, count)
    values (p_user_id, p_unit_id, p_form_id, p_delta)
    on conflict (user_id, unit_id, form_id) do update
      set count = s.count + excluded.count, updated_at = now()
    returning * into v_row;
  else
    select * into v_row from public.owned_unit_stacks s
    where s.user_id = p_user_id and s.unit_id = p_unit_id and s.form_id = p_form_id
    for update;
    if v_row.id is null or v_row.count < -p_delta then
      raise exception 'change_unit_stack: not enough copies of % in the stack', p_form_id
        using errcode = 'P0001';
    end if;
    update public.owned_unit_stacks s set count = s.count + p_delta, updated_at = now()
    where s.id = v_row.id
    returning * into v_row;
  end if;

  insert into public.unit_stack_log
    (user_id, stack_id, unit_id, form_id, delta, count_after, reason, ref_id)
  values (p_user_id, v_row.id, p_unit_id, p_form_id, p_delta, v_row.count, p_reason, p_ref_id);

  return v_row;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- grant_unit: as in M3-01D, but a stackable unit is rejected (22023): acquisitions go through
-- acquire_unit, and split_unit_stack creates a stackable unit's row itself.
-- ---------------------------------------------------------------------------------------------
create or replace function public.grant_unit(p_user_id uuid, p_unit_id text, p_form_id text default null)
returns public.owned_units
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_forms jsonb;
  v_form_id text := p_form_id;
  v_row public.owned_units;
begin
  if p_user_id is null then
    raise exception 'grant_unit: a user is required' using errcode = '22023';
  end if;

  select c.data -> 'forms' into v_forms
  from public.content_items c
  where c.kind = 'unit' and c.id = p_unit_id;
  if v_forms is null then
    raise exception 'grant_unit: unknown unit %', p_unit_id using errcode = '22023';
  end if;
  if public.unit_is_stackable(p_unit_id) then
    raise exception 'grant_unit: unit % is stackable; grant it with acquire_unit', p_unit_id
      using errcode = '22023';
  end if;

  v_form_id := coalesce(v_form_id, v_forms -> 0 ->> 'id');
  if not exists (select 1 from jsonb_array_elements(v_forms) f where f ->> 'id' = v_form_id) then
    raise exception 'grant_unit: unit % has no form %', p_unit_id, v_form_id
      using errcode = '22023';
  end if;

  insert into public.owned_units (user_id, unit_id, form_id)
  values (p_user_id, p_unit_id, v_form_id)
  returning * into v_row;

  return v_row;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- acquire_unit: the stack-aware acquisition of one copy of p_unit_id in p_form_id (default: its
-- first form). A stackable unit adds 1 to the player's stack (unit_stack_log, p_reason/p_ref_id);
-- any other unit gets an owned_units row with its type roll and a unit_log row (same reason/ref).
-- Returns {stacked, owned_unit_id, stack_id, unit_id, form_id, count_after}: owned_unit_id is
-- null when stacked, stack_id and count_after are null otherwise. Rejects (22023) unknown content.
-- Internal: for summons, battle captures, and later rewards.
-- ---------------------------------------------------------------------------------------------
create function public.acquire_unit(
  p_user_id uuid,
  p_unit_id text,
  p_form_id text,
  p_reason text,
  p_ref_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_forms jsonb;
  v_form_id text := p_form_id;
  v_unit public.owned_units;
  v_stack public.owned_unit_stacks;
begin
  if p_user_id is null then
    raise exception 'acquire_unit: a user is required' using errcode = '22023';
  end if;

  if not public.unit_is_stackable(p_unit_id) then
    v_unit := public.grant_unit(p_user_id, p_unit_id, p_form_id);
    insert into public.unit_log (user_id, owned_unit_id, unit_id, form_id, delta, reason, ref_id)
    values (p_user_id, v_unit.id, v_unit.unit_id, v_unit.form_id, 1, p_reason, p_ref_id);
    return jsonb_build_object('stacked', false, 'owned_unit_id', v_unit.id, 'stack_id', null,
      'unit_id', v_unit.unit_id, 'form_id', v_unit.form_id, 'count_after', null);
  end if;

  select c.data -> 'forms' into v_forms
  from public.content_items c
  where c.kind = 'unit' and c.id = p_unit_id;
  v_form_id := coalesce(v_form_id, v_forms -> 0 ->> 'id');
  if not exists (select 1 from jsonb_array_elements(v_forms) f where f ->> 'id' = v_form_id) then
    raise exception 'acquire_unit: unit % has no form %', p_unit_id, v_form_id
      using errcode = '22023';
  end if;

  v_stack := public.change_unit_stack(p_user_id, p_unit_id, v_form_id, 1, p_reason, p_ref_id);
  return jsonb_build_object('stacked', true, 'owned_unit_id', null, 'stack_id', v_stack.id,
    'unit_id', p_unit_id, 'form_id', v_form_id, 'count_after', v_stack.count);
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- split_unit_stack: move one copy out of the caller's stack p_stack_id into a new owned_units row
-- (level 1, no roll), so it can be levelled, equipped, or fielded. Logs -1 'split' in
-- unit_stack_log (ref: the new unit) and +1 'stack_split' in unit_log (ref: the stack). Rejects
-- (22023) a missing or another player's stack and (P0001) an empty one.
-- ---------------------------------------------------------------------------------------------
create function public.split_unit_stack(p_stack_id uuid)
returns public.owned_units
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_stack public.owned_unit_stacks;
  v_unit public.owned_units;
begin
  if v_user_id is null then
    raise exception 'split_unit_stack: not signed in' using errcode = '42501';
  end if;

  select * into v_stack from public.owned_unit_stacks s
  where s.id = p_stack_id and s.user_id = v_user_id
  for update;
  if v_stack.id is null then
    raise exception 'split_unit_stack: unknown stack' using errcode = '22023';
  end if;
  if v_stack.count < 1 then
    raise exception 'split_unit_stack: the stack is empty' using errcode = 'P0001';
  end if;

  insert into public.owned_units (user_id, unit_id, form_id)
  values (v_user_id, v_stack.unit_id, v_stack.form_id)
  returning * into v_unit;

  perform public.change_unit_stack(v_user_id, v_stack.unit_id, v_stack.form_id, -1, 'split',
    v_unit.id);
  insert into public.unit_log (user_id, owned_unit_id, unit_id, form_id, delta, reason, ref_id)
  values (v_user_id, v_unit.id, v_unit.unit_id, v_unit.form_id, 1, 'stack_split', v_stack.id);

  return v_unit;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- fold_untouched_unit_stacks: fold every untouched owned_units row of a stackable unit (level 1,
-- 0 EXP, burst levels 1, no type roll, no sphere or unlocked second slot, in no squad or ally slot)
-- into its stack, never a copy split out of one: -1 'stack_fold' in unit_log per row (its history
-- stays), +N 'stack_fold' in unit_stack_log per stack. Returns the number of rows folded. Stackable here also covers a
-- single-form non-placeholder unit whose content predates the flag, because the hosted project
-- runs migrations before it reseeds content. Internal; run once below.
-- ---------------------------------------------------------------------------------------------
create function public.fold_untouched_unit_stacks()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_group record;
  v_total integer := 0;
begin
  for v_group in
    select o.user_id, o.unit_id, o.form_id, array_agg(o.id) as ids
    from public.owned_units o
    join public.content_items c on c.kind = 'unit' and c.id = o.unit_id
    where (c.data -> 'stackable' = 'true'::jsonb
        or (jsonb_array_length(c.data -> 'forms') = 1 and c.id not like 'placeholder-%'))
      and o.level = 1 and o.exp = 0 and o.bb_level = 1 and o.sbb_level = 1
      and o.unit_type is null and not o.second_sphere_slot
      and not exists (select 1 from public.unit_spheres us where us.owned_unit_id = o.id)
      and not exists (select 1 from public.unit_log l
        where l.owned_unit_id = o.id and l.reason = 'stack_split')
      and not exists (
        select 1 from public.squads s
        where s.user_id = o.user_id and (o.id = any (s.unit_ids) or s.ally_unit_id = o.id))
    group by o.user_id, o.unit_id, o.form_id
  loop
    delete from public.owned_units o where o.id = any (v_group.ids);
    insert into public.unit_log (user_id, owned_unit_id, unit_id, form_id, delta, reason)
    select v_group.user_id, u.id, v_group.unit_id, v_group.form_id, -1, 'stack_fold'
    from unnest(v_group.ids) as u (id);
    perform public.change_unit_stack(v_group.user_id, v_group.unit_id, v_group.form_id,
      cardinality(v_group.ids), 'stack_fold');
    v_total := v_total + cardinality(v_group.ids);
  end loop;
  return v_total;
end;
$$;

revoke execute on function public.unit_is_stackable(text)
  from public, anon, authenticated, service_role;
revoke execute on function public.change_unit_stack(uuid, text, text, integer, text, uuid)
  from public, anon, authenticated, service_role;
revoke execute on function public.acquire_unit(uuid, text, text, text, uuid)
  from public, anon, authenticated, service_role;
revoke execute on function public.fold_untouched_unit_stacks()
  from public, anon, authenticated, service_role;
revoke execute on function public.split_unit_stack(uuid) from public, anon;
grant execute on function public.split_unit_stack(uuid) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- summon: as in M5-01A, but each pull goes through acquire_unit. A stacked pull logs to
-- unit_stack_log and its summon_log row has a null owned_unit_id. Each result's `unit` is
-- acquire_unit's {stacked, owned_unit_id, stack_id, unit_id, form_id, count_after}.
-- ---------------------------------------------------------------------------------------------
alter table public.summon_log alter column owned_unit_id drop not null;

create or replace function public.summon(p_banner_id text, p_count integer)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_banner jsonb;
  v_cost integer;
  v_gems bigint;
  v_pulls integer;
  v_limit integer;
  v_batch uuid := gen_random_uuid();
  v_pick jsonb;
  v_unit jsonb;
  v_featured boolean;
  v_pity boolean;
  v_results jsonb := '[]';
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
  v_limit := (v_banner ->> 'pityPulls')::integer;
  if v_limit is null or v_limit < 1 or jsonb_array_length(v_banner -> 'featured') < 1 then
    raise exception 'summon: invalid pity configuration' using errcode = '55000';
  end if;
  v_cost := case p_count when 1 then 5 else 50 end;
  -- Serialize all banners for this player, including the pity upsert, behind the wallet lock.
  select gems into v_gems from public.wallets where user_id = v_user for update;
  if not found then raise exception 'summon: no wallet' using errcode = 'P0002'; end if;
  if v_gems < v_cost then raise exception 'summon: insufficient gems' using errcode = 'P0001'; end if;
  insert into public.summon_pity (user_id, banner_id) values (v_user, p_banner_id)
    on conflict (user_id, banner_id) do nothing;
  select pulls into v_pulls from public.summon_pity
    where user_id = v_user and banner_id = p_banner_id for update;
  v_gems := v_gems - v_cost;
  update public.wallets set gems = v_gems, updated_at = now() where user_id = v_user;
  insert into public.wallet_log (user_id, currency, delta, balance_after, reason, ref_id)
    values (v_user, 'gems', -v_cost, v_gems, 'summon', v_batch);
  for i in 1..p_count loop
    v_pity := v_pulls + 1 >= v_limit;
    v_pick := public.roll_summon(v_banner, v_pity);
    v_featured := exists (select 1 from jsonb_array_elements(v_banner -> 'featured') f
      where f ->> 'unit' = v_pick ->> 'unit' and f ->> 'form' = v_pick ->> 'form');
    v_pulls := case when v_featured then 0 else v_pulls + 1 end;
    v_unit := public.acquire_unit(v_user, v_pick ->> 'unit', v_pick ->> 'form', 'summon', v_batch);
    insert into public.summon_log
      (user_id, banner_id, batch_id, pull_index, owned_unit_id, unit_id, form_id, featured, pity, pity_after)
      values (v_user, p_banner_id, v_batch, i, (v_unit ->> 'owned_unit_id')::uuid,
        v_unit ->> 'unit_id', v_unit ->> 'form_id', v_featured, v_pity, v_pulls);
    v_results := v_results || jsonb_build_array(jsonb_build_object('unit', v_unit,
      'featured', v_featured, 'pity', v_pity, 'pity_after', v_pulls));
  end loop;
  update public.summon_pity set pulls = v_pulls where user_id = v_user and banner_id = p_banner_id;
  return jsonb_build_object('batch_id', v_batch, 'gems', v_gems, 'pity_after', v_pulls,
    'results', v_results);
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- grant_battle_base_rewards: as in M4-03B (renamed by M3-05B), but each capture goes through
-- acquire_unit ('battle_capture', ref: the session), so a stackable capture adds to its stack and
-- any other capture gets a row plus a unit_log row. Each `units` entry is acquire_unit's result.
-- ---------------------------------------------------------------------------------------------
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
        v_units := v_units || jsonb_build_array(public.acquire_unit(v_session.user_id,
          v_drop ->> 'unit', v_form_id, 'battle_capture', v_session.id));
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

select public.fold_untouched_unit_stacks();
