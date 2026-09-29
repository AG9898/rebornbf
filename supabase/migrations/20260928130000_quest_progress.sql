-- M3-04A: quest_progress, the stages a player has cleared (the quest map's clear state).
--
-- One row per cleared stage; stage_id is a packages/data stage content ID. Players only read their
-- own rows. Rows are written by the service-role reward function after a server replay
-- (grant_battle_rewards, M3-04D); the row's existence is what makes a first clear a first clear.

create table public.quest_progress (
  user_id uuid not null references auth.users (id) on delete cascade,
  stage_id text not null check (stage_id ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  first_cleared_at timestamptz not null default now(),
  primary key (user_id, stage_id)
);

alter table public.quest_progress enable row level security;

create policy "quest_progress: read own" on public.quest_progress
  for select to authenticated using (user_id = (select auth.uid()));

-- As with the base tables: strip the default client privileges so direct writes fail with 42501.
revoke all on table public.quest_progress from anon, authenticated;
grant select on table public.quest_progress to authenticated;
