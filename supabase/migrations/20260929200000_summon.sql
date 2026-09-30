-- M5-01A: gem summons, per-banner pity, and append-only acquisition records.
create table public.summon_pity (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  banner_id text not null,
  pulls integer not null default 0 check (pulls >= 0),
  created_at timestamptz not null default now(),
  unique (user_id, banner_id)
);

create table public.summon_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  banner_id text not null,
  batch_id uuid not null,
  pull_index integer not null check (pull_index between 1 and 11),
  owned_unit_id uuid not null,
  unit_id text not null,
  form_id text not null,
  featured boolean not null,
  pity boolean not null,
  pity_after integer not null check (pity_after >= 0),
  created_at timestamptz not null default now(),
  unique (batch_id, pull_index)
);
create index summon_log_user_id_idx on public.summon_log (user_id, created_at desc);
alter table public.summon_pity enable row level security;
alter table public.summon_log enable row level security;
create policy "summon_pity: read own" on public.summon_pity
  for select to authenticated using (user_id = (select auth.uid()));
create policy "summon_log: read own" on public.summon_log
  for select to authenticated using (user_id = (select auth.uid()));
revoke all on public.summon_pity, public.summon_log from anon, authenticated;
grant select on public.summon_pity, public.summon_log to authenticated;

create function public.reject_summon_log_change()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'DELETE' and not exists (select 1 from auth.users where id = old.user_id) then
    return old;
  end if;
  raise exception 'summon_log is append-only' using errcode = 'P0001';
end;
$$;
revoke execute on function public.reject_summon_log_change() from public, anon, authenticated;
create trigger summon_log_append_only before update or delete on public.summon_log
  for each row execute function public.reject_summon_log_change();

-- Internal roller: base rates are integer basis points; pity chooses uniformly among featured.
-- Keep this helper shared by the RPC and statistical tests so tests exercise the real roller.
create function public.roll_summon(p_banner jsonb, p_pity boolean)
returns jsonb language plpgsql volatile set search_path = '' as $$
declare
  v_entry jsonb;
  v_draw integer;
  v_total integer := 0;
begin
  if p_pity then
    return p_banner -> 'featured' -> public.roll_int(0, jsonb_array_length(p_banner -> 'featured') - 1);
  end if;
  v_draw := public.roll_int(0, 9999);
  for v_entry in select value from jsonb_array_elements(
    (p_banner -> 'featured') || (p_banner -> 'pool')) loop
    v_total := v_total + (v_entry ->> 'rateBp')::integer;
    if v_draw < v_total then return v_entry; end if;
  end loop;
  raise exception 'summon: invalid banner rates' using errcode = '55000';
end;
$$;
revoke execute on function public.roll_summon(jsonb, boolean)
  from public, anon, authenticated, service_role;

create function public.summon(p_banner_id text, p_count integer)
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
  v_unit public.owned_units;
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
    v_unit := public.grant_unit(v_user, v_pick ->> 'unit', v_pick ->> 'form');
    insert into public.unit_log (user_id, owned_unit_id, unit_id, form_id, delta, reason, ref_id)
      values (v_user, v_unit.id, v_unit.unit_id, v_unit.form_id, 1, 'summon', v_batch);
    insert into public.summon_log
      (user_id, banner_id, batch_id, pull_index, owned_unit_id, unit_id, form_id, featured, pity, pity_after)
      values (v_user, p_banner_id, v_batch, i, v_unit.id, v_unit.unit_id, v_unit.form_id,
        v_featured, v_pity, v_pulls);
    v_results := v_results || jsonb_build_array(jsonb_build_object('unit', to_jsonb(v_unit),
      'featured', v_featured, 'pity', v_pity, 'pity_after', v_pulls));
  end loop;
  update public.summon_pity set pulls = v_pulls where user_id = v_user and banner_id = p_banner_id;
  return jsonb_build_object('batch_id', v_batch, 'gems', v_gems, 'pity_after', v_pulls,
    'results', v_results);
end;
$$;
revoke execute on function public.summon(text, integer) from public, anon;
grant execute on function public.summon(text, integer) to authenticated;
