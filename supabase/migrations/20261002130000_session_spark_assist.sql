-- M7-01_2: battle sessions snapshot the player's spark assist setting.
--
-- Spark assist (RESOLVED-17, GAME_DESIGN §2) is part of the battle setup, so the battle page and the
-- finish route's server replay must use the same value. Every session-issuing path (start_battle and
-- its later revisions) inserts into battle_sessions, so a before-insert trigger copies the caller's
-- saved `player_settings.spark_assist` (default off with no row) into the new session. Changing the
-- setting mid-battle cannot desync a replay: the finish route reads the session's frozen copy.

alter table public.battle_sessions
  add column spark_assist boolean not null default false;

comment on column public.battle_sessions.spark_assist is
  'Spark assist frozen from player_settings when the session was issued (M7-01_2); the battle page '
  'and the server replay both build BattleSetup.sparkAssist from it.';

create function public.battle_sessions_snapshot_settings()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.spark_assist := coalesce(
    (select s.spark_assist from public.player_settings s where s.user_id = new.user_id),
    false
  );
  return new;
end;
$$;

revoke execute on function public.battle_sessions_snapshot_settings() from public, anon, authenticated;

create trigger battle_sessions_snapshot_settings
  before insert on public.battle_sessions
  for each row execute function public.battle_sessions_snapshot_settings();
