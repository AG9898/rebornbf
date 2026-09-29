-- M3-06A: server-owned onboarding progress (RESOLVED-68, GAME_DESIGN §8 New player flow).
--
-- Each profile records the next unfinished onboarding step: name → tutorial → starter → done.
-- Clients cannot write `profiles` (M3-01A revokes every write privilege), so the step only moves
-- forward through the security definer RPCs below: set_display_name (name → tutorial) and
-- finish_tutorial (tutorial → starter). The starter-pick RPC (starter → done) is a later task.

create type public.onboarding_step as enum ('name', 'tutorial', 'starter', 'done');

-- Every profile starts at the name step, including ones created before onboarding existed, so an
-- existing account with no units still goes through onboarding and gets its starter. Only existing
-- profiles that already own a unit are backfilled as done (they have progress to keep).
alter table public.profiles
  add column onboarding_step public.onboarding_step not null default 'name';

update public.profiles p
set onboarding_step = 'done'
where exists (select 1 from public.owned_units o where o.user_id = p.id);

comment on column public.profiles.onboarding_step is
  'Next unfinished onboarding step (RESOLVED-68); advanced only by onboarding RPCs.';

-- ---------------------------------------------------------------------------------------------
-- set_display_name: set the caller's display name at any step, and advance name → tutorial.
-- The name is trimmed; it must then be 1–32 characters with no control characters (22023).
-- Returns the updated profile row.
-- ---------------------------------------------------------------------------------------------
create function public.set_display_name(p_name text)
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
      onboarding_step = case when p.onboarding_step = 'name' then 'tutorial'::public.onboarding_step
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
-- finish_tutorial: mark the tutorial done (finished or skipped), advancing tutorial → starter.
-- Idempotent: at starter or done it changes nothing. At the name step it rejects (55000), so the
-- name step cannot be skipped. Returns the profile row.
-- ---------------------------------------------------------------------------------------------
create function public.finish_tutorial()
returns public.profiles
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_row public.profiles;
begin
  if v_user_id is null then
    raise exception 'finish_tutorial: not signed in' using errcode = '42501';
  end if;

  select p.* into v_row from public.profiles p where p.id = v_user_id for update;

  if not found then
    raise exception 'finish_tutorial: no profile' using errcode = 'P0002';
  end if;

  if v_row.onboarding_step = 'name' then
    raise exception 'finish_tutorial: set a display name first' using errcode = '55000';
  end if;

  if v_row.onboarding_step = 'tutorial' then
    update public.profiles p
    set onboarding_step = 'starter'
    where p.id = v_user_id
    returning p.* into v_row;
  end if;

  return v_row;
end;
$$;

revoke execute on function public.set_display_name(text) from public, anon;
revoke execute on function public.finish_tutorial() from public, anon;
grant execute on function public.set_display_name(text) to authenticated;
grant execute on function public.finish_tutorial() to authenticated;
