-- M4-04A: equipment instances and unit-specific slots. Grants/unlocks land separately.
alter table public.content_items drop constraint content_items_kind_check;
alter table public.content_items add constraint content_items_kind_check
  check (kind in ('unit', 'item', 'enemy', 'stage', 'banner', 'guest', 'sphere'));

alter table public.owned_units add column second_sphere_slot boolean not null default false;

create table public.owned_spheres (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  sphere_id text not null check (sphere_id ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  created_at timestamptz not null default now()
);
create index owned_spheres_user_idx on public.owned_spheres(user_id);
create table public.unit_spheres (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  owned_unit_id uuid not null references public.owned_units(id) on delete cascade,
  slot smallint not null check (slot in (1, 2)),
  owned_sphere_id uuid not null unique references public.owned_spheres(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (owned_unit_id, slot)
);
create table public.sphere_equip_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  owned_unit_id uuid not null,
  slot smallint not null,
  owned_sphere_id uuid,
  created_at timestamptz not null default now()
);
alter table public.owned_spheres enable row level security;
alter table public.unit_spheres enable row level security;
alter table public.sphere_equip_log enable row level security;
create policy "owned_spheres: read own" on public.owned_spheres for select to authenticated
  using (user_id = (select auth.uid()));
create policy "unit_spheres: read own" on public.unit_spheres for select to authenticated
  using (user_id = (select auth.uid()));
create policy "sphere_equip_log: read own" on public.sphere_equip_log for select to authenticated
  using (user_id = (select auth.uid()));
revoke all on public.owned_spheres, public.unit_spheres, public.sphere_equip_log from anon, authenticated;
grant select on public.owned_spheres, public.unit_spheres, public.sphere_equip_log to authenticated;
create trigger sphere_equip_log_append_only before update or delete on public.sphere_equip_log
  for each row execute function public.reject_wallet_log_change();

-- Null sphere means unequip. An already-equipped instance is refused, not silently moved.
create function public.equip_sphere(p_unit uuid, p_slot smallint, p_sphere uuid default null)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_unit public.owned_units;
  v_kind text;
  v_current uuid;
begin
  if v_user is null then raise exception 'equip_sphere: not signed in' using errcode = '42501'; end if;
  if p_slot is null or p_slot not in (1, 2) then
    raise exception 'equip_sphere: invalid slot' using errcode = '22023';
  end if;
  -- Serialize equipment changes for this player (including different units).
  perform 1 from public.wallets where user_id = v_user for update;
  select * into v_unit from public.owned_units where id = p_unit and user_id = v_user for update;
  if v_unit.id is null then raise exception 'equip_sphere: unit not owned' using errcode = '22023'; end if;
  if p_slot = 2 and not v_unit.second_sphere_slot then
    raise exception 'equip_sphere: second slot locked' using errcode = '22023';
  end if;
  select owned_sphere_id into v_current from public.unit_spheres
    where owned_unit_id = p_unit and slot = p_slot;
  if p_sphere is not null then
    select c.data ->> 'kind' into v_kind from public.owned_spheres s
      join public.content_items c on c.kind = 'sphere' and c.id = s.sphere_id
      where s.id = p_sphere and s.user_id = v_user;
    if v_kind is null then raise exception 'equip_sphere: sphere not owned or unknown' using errcode = '22023'; end if;
    if exists (select 1 from public.unit_spheres where owned_sphere_id = p_sphere
      and (owned_unit_id <> p_unit or slot <> p_slot)) then
      raise exception 'equip_sphere: sphere already equipped' using errcode = '22023';
    end if;
    if v_kind = 'all-stat' and exists (
      select 1 from public.unit_spheres e join public.owned_spheres s on s.id = e.owned_sphere_id
      join public.content_items c on c.kind = 'sphere' and c.id = s.sphere_id
      where e.owned_unit_id = p_unit and e.slot <> p_slot and c.data ->> 'kind' = 'all-stat'
    ) then raise exception 'equip_sphere: two all-stat spheres refused' using errcode = '22023'; end if;
  end if;
  if v_current is not distinct from p_sphere then return; end if;
  delete from public.unit_spheres where owned_unit_id = p_unit and slot = p_slot;
  if p_sphere is not null then
    insert into public.unit_spheres(user_id, owned_unit_id, slot, owned_sphere_id)
      values(v_user, p_unit, p_slot, p_sphere);
  end if;
  insert into public.sphere_equip_log(user_id, owned_unit_id, slot, owned_sphere_id)
    values(v_user, p_unit, p_slot, p_sphere);
end;
$$;
revoke execute on function public.equip_sphere(uuid, smallint, uuid) from public, anon;
grant execute on function public.equip_sphere(uuid, smallint, uuid) to authenticated;

-- Enrich the existing server-issued snapshot, including duplicate allies, once at insert.
-- Guests and unequipped units retain their existing JSON shape. Replays never read live gear.
create function public.snapshot_unit_spheres(p_unit jsonb, p_user uuid)
returns jsonb language sql stable set search_path = '' as $$
  select case when count(e.id) = 0 then p_unit else p_unit || jsonb_build_object(
    'spheres', jsonb_agg(s.sphere_id order by e.slot),
    'second_sphere_slot', bool_or(o.second_sphere_slot)) end
  from public.owned_units o
  join public.unit_spheres e on e.owned_unit_id = o.id and e.user_id = p_user
  join public.owned_spheres s on s.id = e.owned_sphere_id and s.user_id = p_user
  where o.id = (p_unit ->> 'owned_unit_id')::uuid and o.user_id = p_user;
$$;
revoke execute on function public.snapshot_unit_spheres(jsonb, uuid) from public, anon, authenticated, service_role;
create function public.snapshot_battle_spheres()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if not (new.squad ? 'units') or jsonb_array_length(new.squad -> 'units') = 0 then
    return new;
  end if;
  new.squad := jsonb_set(new.squad, '{units}', (
    select jsonb_agg(public.snapshot_unit_spheres(u, new.user_id) order by ord)
    from jsonb_array_elements(new.squad -> 'units') with ordinality as units(u, ord)
  ));
  if new.squad -> 'ally' <> 'null'::jsonb then
    new.squad := jsonb_set(new.squad, '{ally}', public.snapshot_unit_spheres(new.squad -> 'ally', new.user_id));
  end if;
  return new;
end;
$$;
revoke execute on function public.snapshot_battle_spheres() from public, anon, authenticated, service_role;
create trigger battle_spheres before insert on public.battle_sessions
  for each row execute function public.snapshot_battle_spheres();
