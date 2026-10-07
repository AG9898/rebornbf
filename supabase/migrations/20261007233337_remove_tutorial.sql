-- Remove the onboarding tutorial (owner request, 2026-10-07; GAME_DESIGN §8 New player flow).
--
-- Onboarding is now name → starter → done. This migration:
--   1. moves every profile still at the `tutorial` step on to `starter`;
--   2. drops finish_tutorial();
--   3. removes the `tutorial` label from public.onboarding_step. Postgres cannot drop an enum
--      label, so the type is swapped: the old type is renamed aside, a new
--      public.onboarding_step ('name', 'starter', 'done') is created, profiles.onboarding_step
--      (the only column of the type) is converted with its default dropped and restored, and the
--      old type is dropped;
--   4. replaces set_display_name so the name step advances to `starter` (its checks, errors,
--      return row, and grants are otherwise unchanged);
--   5. recreates pick_starter from its live definition, unchanged, since its plpgsql body declares
--      a variable of the type and a cached plan in an open session would still hold the old type.
-- Profiles already at `starter` or `done` keep their step.

update public.profiles set onboarding_step = 'starter' where onboarding_step = 'tutorial';

drop function public.finish_tutorial();

alter type public.onboarding_step rename to onboarding_step_old;

create type public.onboarding_step as enum ('name', 'starter', 'done');

alter table public.profiles alter column onboarding_step drop default;
alter table public.profiles
  alter column onboarding_step type public.onboarding_step
  using onboarding_step::text::public.onboarding_step;
alter table public.profiles alter column onboarding_step set default 'name';

drop type public.onboarding_step_old;

-- ---------------------------------------------------------------------------------------------
-- set_display_name: set the caller's display name at any step, and advance name → starter.
-- The name is trimmed; it must then be 1–32 characters with no control characters (22023).
-- Returns the updated profile row.
-- ---------------------------------------------------------------------------------------------
create or replace function public.set_display_name(p_name text)
returns public.profiles
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_name text := btrim(p_name);
  v_row public.profiles;
begin
  if v_user_id is null then
    raise exception 'set_display_name: not signed in' using errcode = '42501';
  end if;

  if v_name is null or char_length(v_name) < 1 or char_length(v_name) > 32 then
    raise exception 'set_display_name: a name is 1-32 characters' using errcode = '22023';
  end if;

  if v_name ~ '[[:cntrl:]]' then
    raise exception 'set_display_name: a name may not contain control characters'
      using errcode = '22023';
  end if;

  update public.profiles p
  set display_name = v_name,
      onboarding_step = case when p.onboarding_step = 'name' then 'starter'::public.onboarding_step
                             else p.onboarding_step end
  where p.id = v_user_id
  returning p.* into v_row;

  if not found then
    raise exception 'set_display_name: no profile' using errcode = 'P0002';
  end if;

  return v_row;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- pick_starter: recreated from its live definition (20260929190000_pick_starter.sql as rewritten
-- by 20261001210000_per_quest_ally.sql), unchanged, so it is recompiled against the new type.
-- ---------------------------------------------------------------------------------------------
do $$
begin
  execute pg_get_functiondef('public.pick_starter(text)'::regprocedure);
end;
$$;

revoke execute on function public.set_display_name(text) from public, anon;
grant execute on function public.set_display_name(text) to authenticated;
revoke execute on function public.pick_starter(text) from public, anon;
grant execute on function public.pick_starter(text) to authenticated;
