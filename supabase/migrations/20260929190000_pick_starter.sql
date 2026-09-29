-- M3-05A: the starter pick (RESOLVED-68, RESOLVED-13; GAME_DESIGN §8 → Starters, New player flow).
--
-- At the `starter` onboarding step the player picks one of the six B0 starters. pick_starter grants
-- it at 3★ through grant_unit (with its type roll), appends a unit_log row, saves squad slot 0 with
-- only that unit as leader (RESOLVED-68 item 8), and advances the step to `done`, all in one
-- transaction. Because it only succeeds at `starter` and leaves the step at `done`, a player picks
-- exactly once.

-- ---------------------------------------------------------------------------------------------
-- unit_log: append-only record of unit grants and removals (CONVENTIONS: inventory changes log).
-- owned_unit_id has no foreign key so the row outlives a unit later fused away.
-- ---------------------------------------------------------------------------------------------
create table public.unit_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  owned_unit_id uuid not null,
  unit_id text not null check (unit_id ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  form_id text not null check (form_id ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  delta smallint not null check (delta in (-1, 1)),
  reason text not null check (char_length(reason) between 1 and 64),
  ref_id uuid,
  created_at timestamptz not null default now()
);

create index unit_log_user_id_created_at_idx on public.unit_log (user_id, created_at desc);

alter table public.unit_log enable row level security;

create policy "unit_log: read own" on public.unit_log
  for select to authenticated using (user_id = (select auth.uid()));

revoke all on table public.unit_log from anon, authenticated;
grant select on table public.unit_log to authenticated;

-- unit_log is append-only for every role; the one exception is the cascade from deleting the
-- owning auth user (same rule as wallet_log and item_log).
create function public.reject_unit_log_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' and not exists (select 1 from auth.users u where u.id = old.user_id) then
    return old;
  end if;
  raise exception 'unit_log is append-only' using errcode = 'P0001';
end;
$$;

revoke execute on function public.reject_unit_log_change() from public, anon, authenticated;

create trigger unit_log_append_only
  before update or delete on public.unit_log
  for each row execute function public.reject_unit_log_change();

-- ---------------------------------------------------------------------------------------------
-- starter_unit_ids: the six B0 starters (ROSTER → B0), in pick-screen order.
-- ---------------------------------------------------------------------------------------------
create function public.starter_unit_ids()
returns text[]
language sql
immutable
set search_path = ''
as $$
  select array['brand', 'maren', 'rook', 'garrick', 'solen', 'morrick'];
$$;

-- ---------------------------------------------------------------------------------------------
-- pick_starter: grant the caller the B0 starter p_unit_id at 3★ (form `<unit>-3`), log it, save it
-- alone as squad slot 0's leader, and advance starter → done. Rejects 42501 when signed out,
-- P0002 without a profile, 55000 at any step but `starter` (so a second pick fails), and 22023 for
-- a unit that is not a starter. Returns the new owned unit.
-- ---------------------------------------------------------------------------------------------
create function public.pick_starter(p_unit_id text)
returns public.owned_units
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_step public.onboarding_step;
  v_unit public.owned_units;
begin
  if v_user_id is null then
    raise exception 'pick_starter: not signed in' using errcode = '42501';
  end if;

  -- Lock the profile so two concurrent picks cannot both pass the step check.
  select p.onboarding_step into v_step from public.profiles p where p.id = v_user_id for update;

  if not found then
    raise exception 'pick_starter: no profile' using errcode = 'P0002';
  end if;

  if v_step <> 'starter' then
    raise exception 'pick_starter: the starter pick is not open' using errcode = '55000';
  end if;

  if p_unit_id is null or not (p_unit_id = any (public.starter_unit_ids())) then
    raise exception 'pick_starter: not a starter unit' using errcode = '22023';
  end if;

  v_unit := public.grant_unit(v_user_id, p_unit_id, p_unit_id || '-3');

  insert into public.unit_log (user_id, owned_unit_id, unit_id, form_id, delta, reason)
  values (v_user_id, v_unit.id, v_unit.unit_id, v_unit.form_id, 1, 'starter_pick');

  insert into public.squads as s (user_id, slot, unit_ids, leader_index, ally_unit_id)
  values (v_user_id, 0, array[v_unit.id], 0, null)
  on conflict (user_id, slot) do update
    set unit_ids = excluded.unit_ids,
        leader_index = excluded.leader_index,
        ally_unit_id = excluded.ally_unit_id,
        updated_at = now();

  update public.profiles p set onboarding_step = 'done' where p.id = v_user_id;

  return v_unit;
end;
$$;

revoke execute on function public.pick_starter(text) from public, anon;
grant execute on function public.pick_starter(text) to authenticated;
