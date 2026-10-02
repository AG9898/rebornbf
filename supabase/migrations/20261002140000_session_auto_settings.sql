-- M7-01_3: battle sessions snapshot the player's Auto Battle Advance Settings.
--
-- The auto-battle settings (GAME_DESIGN §2 → Auto-battle advanced settings, M1-08E) are part of the
-- engine's battle setup (`BattleSetup.autoSettings`), so the battle page and the finish route's
-- server replay must build them from one frozen copy. The M7-01_2 before-insert trigger now also
-- copies the caller's saved per-unit modes (keyed by owned unit id) and the three priority toggles
-- into the new session; the web app maps owned unit ids to party slots from the squad snapshot.
-- Changing the settings mid-battle cannot desync a replay.

alter table public.battle_sessions
  add column auto_settings jsonb not null default '{}'::jsonb
    check (jsonb_typeof(auto_settings) = 'object');

comment on column public.battle_sessions.auto_settings is
  'Auto Battle Advance Settings frozen from player_settings when the session was issued (M7-01_3): '
  '{unit_auto_modes: {owned_unit_id: mode}, sbb_priority, forced_bb_priority, od_ubb_priority}. '
  '''{}'' = the defaults. The battle page and the server replay both build BattleSetup.autoSettings from it.';

create or replace function public.battle_sessions_snapshot_settings()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_settings public.player_settings;
begin
  select * into v_settings from public.player_settings s where s.user_id = new.user_id;
  if found then
    new.spark_assist := v_settings.spark_assist;
    new.auto_settings := jsonb_build_object(
      'unit_auto_modes', v_settings.unit_auto_modes,
      'sbb_priority', v_settings.sbb_priority,
      'forced_bb_priority', v_settings.forced_bb_priority,
      'od_ubb_priority', v_settings.od_ubb_priority
    );
  else
    new.spark_assist := false;
    new.auto_settings := '{}'::jsonb;
  end if;
  return new;
end;
$$;

revoke execute on function public.battle_sessions_snapshot_settings() from public, anon, authenticated;
