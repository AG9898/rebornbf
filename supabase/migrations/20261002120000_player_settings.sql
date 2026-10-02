-- M7-01_1: per-player settings, the save_settings RPC, and get_settings with documented defaults.
--
-- One row per player holds the presentation settings (spark assist, default battle speed, music and
-- SFX volume, reduced motion) and the Auto Battle Advance Settings (GAME_DESIGN §2, M1-08E): a
-- per-unit auto mode keyed by owned unit id, and the SBB Priority, Forced BB Priority, and OD & UBB
-- Priority toggles. Clients read only their own row (RLS) and write only through save_settings,
-- which derives the player from auth.uid() and validates every value. A player with no row has the
-- documented defaults, which get_settings returns; the column defaults below are the same values.

create table public.player_settings (
  user_id uuid primary key references auth.users (id) on delete cascade,
  spark_assist boolean not null default false,
  battle_speed smallint not null default 1 check (battle_speed in (1, 2)),
  music_volume smallint not null default 50 check (music_volume between 0 and 100),
  sfx_volume smallint not null default 70 check (sfx_volume between 0 and 100),
  reduced_motion boolean not null default false,
  unit_auto_modes jsonb not null default '{}'::jsonb check (jsonb_typeof(unit_auto_modes) = 'object'),
  sbb_priority boolean not null default false,
  forced_bb_priority boolean not null default false,
  od_ubb_priority boolean not null default false,
  updated_at timestamptz not null default now()
);

comment on table public.player_settings is
  'Per-player settings (M7-01_1). Absent row = defaults (get_settings). Written only by save_settings.';
comment on column public.player_settings.battle_speed is 'Default battle playback speed: 1 or 2 (x1 / x2).';
comment on column public.player_settings.music_volume is 'Music volume, 0-100 percent (audio level = value / 100).';
comment on column public.player_settings.sfx_volume is 'SFX volume, 0-100 percent (audio level = value / 100).';
comment on column public.player_settings.unit_auto_modes is
  'Auto Battle Advance Settings per-unit modes: {owned_unit_id: auto|bb|sbb|ubb|guard|attack}. Unset = auto. '
  'Keys of units later sold or fused away are ignored by readers.';

alter table public.player_settings enable row level security;

create policy "player_settings: read own" on public.player_settings
  for select to authenticated using (user_id = (select auth.uid()));

revoke all on table public.player_settings from anon, authenticated;
grant select on table public.player_settings to authenticated;

-- ---------------------------------------------------------------------------------------------
-- get_settings: the caller's settings row, or the documented defaults when no row exists.
-- Security invoker: it reads through the own-row RLS policy.
-- ---------------------------------------------------------------------------------------------
create function public.get_settings()
returns public.player_settings
language plpgsql
stable
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_row public.player_settings;
begin
  if v_user_id is null then
    raise exception 'get_settings: not signed in' using errcode = '42501';
  end if;

  select * into v_row from public.player_settings s where s.user_id = v_user_id;
  if found then
    return v_row;
  end if;

  v_row.user_id := v_user_id;
  v_row.spark_assist := false;
  v_row.battle_speed := 1;
  v_row.music_volume := 50;
  v_row.sfx_volume := 70;
  v_row.reduced_motion := false;
  v_row.unit_auto_modes := '{}'::jsonb;
  v_row.sbb_priority := false;
  v_row.forced_bb_priority := false;
  v_row.od_ubb_priority := false;
  v_row.updated_at := null;
  return v_row;
end;
$$;

revoke execute on function public.get_settings() from public, anon;
grant execute on function public.get_settings() to authenticated;

-- ---------------------------------------------------------------------------------------------
-- save_settings: create or update the caller's settings. Every argument is optional; null keeps
-- the current value (or the default for a new row), so each settings screen saves only its own
-- fields. p_unit_auto_modes replaces the whole per-unit map ('{}' clears it). Rejects (22023) a
-- speed other than 1/2, a volume outside 0-100, a mode map that is not an object, a mode outside
-- auto/bb/sbb/ubb/guard/attack, or a key that is not one of the caller's owned units.
-- Returns the saved row.
-- ---------------------------------------------------------------------------------------------
create function public.save_settings(
  p_spark_assist boolean default null,
  p_battle_speed smallint default null,
  p_music_volume smallint default null,
  p_sfx_volume smallint default null,
  p_reduced_motion boolean default null,
  p_unit_auto_modes jsonb default null,
  p_sbb_priority boolean default null,
  p_forced_bb_priority boolean default null,
  p_od_ubb_priority boolean default null
)
returns public.player_settings
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_key text;
  v_value jsonb;
  v_unit_id uuid;
  v_row public.player_settings;
begin
  if v_user_id is null then
    raise exception 'save_settings: not signed in' using errcode = '42501';
  end if;

  if p_battle_speed is not null and p_battle_speed not in (1, 2) then
    raise exception 'save_settings: battle speed must be 1 or 2' using errcode = '22023';
  end if;

  if p_music_volume is not null and (p_music_volume < 0 or p_music_volume > 100) then
    raise exception 'save_settings: music volume must be 0-100' using errcode = '22023';
  end if;

  if p_sfx_volume is not null and (p_sfx_volume < 0 or p_sfx_volume > 100) then
    raise exception 'save_settings: SFX volume must be 0-100' using errcode = '22023';
  end if;

  if p_unit_auto_modes is not null then
    if jsonb_typeof(p_unit_auto_modes) <> 'object' then
      raise exception 'save_settings: unit auto modes must be an object' using errcode = '22023';
    end if;

    for v_key, v_value in select e.key, e.value from jsonb_each(p_unit_auto_modes) as e loop
      if jsonb_typeof(v_value) <> 'string'
        or v_value #>> '{}' not in ('auto', 'bb', 'sbb', 'ubb', 'guard', 'attack') then
        raise exception 'save_settings: unknown auto mode for unit %', v_key using errcode = '22023';
      end if;

      if v_key !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
        raise exception 'save_settings: auto modes must be keyed by your own units' using errcode = '22023';
      end if;
      v_unit_id := v_key::uuid;

      if not exists (
        select 1 from public.owned_units o where o.user_id = v_user_id and o.id = v_unit_id
      ) then
        raise exception 'save_settings: auto modes must be keyed by your own units' using errcode = '22023';
      end if;
    end loop;
  end if;

  insert into public.player_settings as s (user_id) values (v_user_id)
  on conflict (user_id) do nothing;

  update public.player_settings as s
  set spark_assist = coalesce(p_spark_assist, s.spark_assist),
      battle_speed = coalesce(p_battle_speed, s.battle_speed),
      music_volume = coalesce(p_music_volume, s.music_volume),
      sfx_volume = coalesce(p_sfx_volume, s.sfx_volume),
      reduced_motion = coalesce(p_reduced_motion, s.reduced_motion),
      unit_auto_modes = coalesce(p_unit_auto_modes, s.unit_auto_modes),
      sbb_priority = coalesce(p_sbb_priority, s.sbb_priority),
      forced_bb_priority = coalesce(p_forced_bb_priority, s.forced_bb_priority),
      od_ubb_priority = coalesce(p_od_ubb_priority, s.od_ubb_priority),
      updated_at = now()
  where s.user_id = v_user_id
  returning s.* into v_row;

  return v_row;
end;
$$;

revoke execute on function public.save_settings(
  boolean, smallint, smallint, smallint, boolean, jsonb, boolean, boolean, boolean
) from public, anon;
grant execute on function public.save_settings(
  boolean, smallint, smallint, smallint, boolean, jsonb, boolean, boolean, boolean
) to authenticated;
