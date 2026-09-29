-- M3-01E: the per-player stackable item inventory (RESOLVED-67 Crown Shard, RESOLVED-17 battle
-- items). Players read their own rows only; every change goes through the internal
-- grant_item/consume_item helpers, which other security definer RPCs (reward grants, evolve) call
-- inside their own transaction. Each change appends an item_log row, like wallet_log.

-- ---------------------------------------------------------------------------------------------
-- owned_items: one row per (player, item); item_id is a packages/data item content ID.
-- ---------------------------------------------------------------------------------------------
create table public.owned_items (
  user_id uuid not null references auth.users (id) on delete cascade,
  item_id text not null check (item_id ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  count bigint not null default 0 check (count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, item_id)
);

-- ---------------------------------------------------------------------------------------------
-- item_log: append-only record of every item count change.
-- ---------------------------------------------------------------------------------------------
create table public.item_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  item_id text not null check (item_id ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  delta bigint not null check (delta <> 0),
  count_after bigint not null check (count_after >= 0),
  reason text not null check (char_length(reason) between 1 and 64),
  ref_id uuid,
  created_at timestamptz not null default now()
);

create index item_log_user_id_created_at_idx on public.item_log (user_id, created_at desc);

alter table public.owned_items enable row level security;
alter table public.item_log enable row level security;

create policy "owned_items: read own" on public.owned_items
  for select to authenticated using (user_id = (select auth.uid()));

create policy "item_log: read own" on public.item_log
  for select to authenticated using (user_id = (select auth.uid()));

revoke all on table public.owned_items, public.item_log from anon, authenticated;
grant select on table public.owned_items, public.item_log to authenticated;

-- item_log is append-only for every role; the one exception is the cascade from deleting the
-- owning auth user (same rule as wallet_log).
create function public.reject_item_log_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' and not exists (select 1 from auth.users u where u.id = old.user_id) then
    return old;
  end if;
  raise exception 'item_log is append-only' using errcode = 'P0001';
end;
$$;

revoke execute on function public.reject_item_log_change() from public, anon, authenticated;

create trigger item_log_append_only
  before update or delete on public.item_log
  for each row execute function public.reject_item_log_change();

-- ---------------------------------------------------------------------------------------------
-- grant_item: add p_count (> 0) of a seeded item to a player and log it. Returns the new count.
-- Rejects (22023) a non-positive count, a null user or reason, and an item that is not seeded
-- item content.
-- ---------------------------------------------------------------------------------------------
create function public.grant_item(
  p_user_id uuid, p_item_id text, p_count bigint, p_reason text, p_ref_id uuid default null
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count bigint;
begin
  if p_user_id is null or p_reason is null or p_count is null or p_count <= 0 then
    raise exception 'grant_item: user, reason, and a positive count are required'
      using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.content_items c where c.kind = 'item' and c.id = p_item_id
  ) then
    raise exception 'grant_item: unknown item %', p_item_id using errcode = '22023';
  end if;

  insert into public.owned_items as o (user_id, item_id, count)
  values (p_user_id, p_item_id, p_count)
  on conflict (user_id, item_id) do update
    set count = o.count + excluded.count, updated_at = now()
  returning o.count into v_count;

  insert into public.item_log (user_id, item_id, delta, count_after, reason, ref_id)
  values (p_user_id, p_item_id, p_count, v_count, p_reason, p_ref_id);

  return v_count;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- consume_item: remove p_count (> 0) of an item from a player and log it. Returns the new count.
-- Rejects (22023) a non-positive count or null user/reason, and refuses (22023) when the player
-- holds fewer than p_count, changing nothing. The conditional update is the check, so two
-- concurrent consumes cannot both spend the last item.
-- ---------------------------------------------------------------------------------------------
create function public.consume_item(
  p_user_id uuid, p_item_id text, p_count bigint, p_reason text, p_ref_id uuid default null
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count bigint;
begin
  if p_user_id is null or p_reason is null or p_count is null or p_count <= 0 then
    raise exception 'consume_item: user, reason, and a positive count are required'
      using errcode = '22023';
  end if;

  update public.owned_items
  set count = count - p_count, updated_at = now()
  where user_id = p_user_id and item_id = p_item_id and count >= p_count
  returning count into v_count;

  if v_count is null then
    raise exception 'consume_item: not enough %', p_item_id using errcode = '22023';
  end if;

  insert into public.item_log (user_id, item_id, delta, count_after, reason, ref_id)
  values (p_user_id, p_item_id, -p_count, v_count, p_reason, p_ref_id);

  return v_count;
end;
$$;

-- Internal helpers: only other security definer functions (owned by postgres) may call them.
revoke execute on function public.grant_item(uuid, text, bigint, text, uuid)
  from public, anon, authenticated, service_role;
revoke execute on function public.consume_item(uuid, text, bigint, text, uuid)
  from public, anon, authenticated, service_role;
