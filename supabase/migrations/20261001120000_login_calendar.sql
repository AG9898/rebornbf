-- M5-03A (RESOLVED-68): the 30-day login calendar and the free 10-pull ticket balance.
--
-- claim_login_reward() advances the caller's calendar one step on the first call of each UTC day
-- (cumulative: missed days never reset it; it ends after day 30). Day 1 grants 30 gems and one
-- free 10-pull ticket, days 2-30 grant 5 gems. Gems go through wallets + wallet_log; tickets go
-- through summon_tickets + summon_ticket_log. The summon ticket path (M5-01D) consumes a ticket by
-- decrementing summon_tickets and appending a negative summon_ticket_log row in its own
-- transaction. Clients only read their own rows.

-- ---------------------------------------------------------------------------------------------
-- login_calendar: one row per player; days_claimed is the last calendar day claimed (0-30).
-- ---------------------------------------------------------------------------------------------
create table public.login_calendar (
  user_id uuid primary key references auth.users (id) on delete cascade,
  days_claimed smallint not null default 0 check (days_claimed between 0 and 30),
  last_claim_on date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((days_claimed = 0) = (last_claim_on is null))
);

-- ---------------------------------------------------------------------------------------------
-- summon_tickets: free 10-pull tickets held per player (RESOLVED-68 day-1 gift).
-- ---------------------------------------------------------------------------------------------
create table public.summon_tickets (
  user_id uuid primary key references auth.users (id) on delete cascade,
  count integer not null default 0 check (count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- summon_ticket_log: append-only record of every ticket count change, like wallet_log.
create table public.summon_ticket_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  delta integer not null check (delta <> 0),
  count_after integer not null check (count_after >= 0),
  reason text not null check (char_length(reason) between 1 and 64),
  ref_id uuid,
  created_at timestamptz not null default now()
);

create index summon_ticket_log_user_id_created_at_idx
  on public.summon_ticket_log (user_id, created_at desc);

alter table public.login_calendar enable row level security;
alter table public.summon_tickets enable row level security;
alter table public.summon_ticket_log enable row level security;

create policy "login_calendar: read own" on public.login_calendar
  for select to authenticated using (user_id = (select auth.uid()));
create policy "summon_tickets: read own" on public.summon_tickets
  for select to authenticated using (user_id = (select auth.uid()));
create policy "summon_ticket_log: read own" on public.summon_ticket_log
  for select to authenticated using (user_id = (select auth.uid()));

revoke all on table public.login_calendar, public.summon_tickets, public.summon_ticket_log
  from anon, authenticated;
grant select on table public.login_calendar, public.summon_tickets, public.summon_ticket_log
  to authenticated;

-- summon_ticket_log is append-only for every role except the cascade from deleting the auth user.
create function public.reject_summon_ticket_log_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' and not exists (select 1 from auth.users u where u.id = old.user_id) then
    return old;
  end if;
  raise exception 'summon_ticket_log is append-only' using errcode = 'P0001';
end;
$$;

revoke execute on function public.reject_summon_ticket_log_change()
  from public, anon, authenticated;

create trigger summon_ticket_log_append_only
  before update or delete on public.summon_ticket_log
  for each row execute function public.reject_summon_ticket_log_change();

-- ---------------------------------------------------------------------------------------------
-- claim_login_reward(): claim today's calendar step for auth.uid().
-- Returns {claimed, day, gems, tickets, gems_after, tickets_after}:
--   claimed = true  -> day is the step just claimed (1-30), gems/tickets what it granted;
--   claimed = false -> nothing granted (already claimed this UTC day, or the calendar ended);
--                      day is the last step claimed (0 if never), gems = tickets = 0.
-- gems_after / tickets_after are the caller's balances after the call.
-- ---------------------------------------------------------------------------------------------
create function public.claim_login_reward()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_today date := (now() at time zone 'utc')::date;
  v_day smallint;
  v_gems integer;
  v_tickets integer;
  v_claim uuid := gen_random_uuid();
  v_gems_after bigint;
  v_tickets_after integer;
begin
  if v_user is null then
    raise exception 'claim_login_reward: not signed in' using errcode = '42501';
  end if;

  insert into public.login_calendar (user_id) values (v_user) on conflict (user_id) do nothing;

  -- The conditional update is the once-per-UTC-day check, so concurrent calls claim at most once.
  update public.login_calendar
  set days_claimed = days_claimed + 1, last_claim_on = v_today, updated_at = now()
  where user_id = v_user
    and days_claimed < 30
    and (last_claim_on is null or last_claim_on < v_today)
  returning days_claimed into v_day;

  if v_day is null then
    select c.days_claimed into v_day from public.login_calendar c where c.user_id = v_user;
    select coalesce((select w.gems from public.wallets w where w.user_id = v_user), 0)
      into v_gems_after;
    select coalesce((select t.count from public.summon_tickets t where t.user_id = v_user), 0)
      into v_tickets_after;
    return jsonb_build_object('claimed', false, 'day', v_day, 'gems', 0, 'tickets', 0,
      'gems_after', v_gems_after, 'tickets_after', v_tickets_after);
  end if;

  v_gems := case when v_day = 1 then 30 else 5 end;
  v_tickets := case when v_day = 1 then 1 else 0 end;

  insert into public.wallets (user_id) values (v_user) on conflict (user_id) do nothing;
  update public.wallets set gems = gems + v_gems, updated_at = now()
  where user_id = v_user
  returning gems into v_gems_after;
  insert into public.wallet_log (user_id, currency, delta, balance_after, reason, ref_id)
  values (v_user, 'gems', v_gems, v_gems_after, 'login_reward', v_claim);

  if v_tickets > 0 then
    insert into public.summon_tickets as t (user_id, count) values (v_user, v_tickets)
    on conflict (user_id) do update set count = t.count + excluded.count, updated_at = now()
    returning t.count into v_tickets_after;
    insert into public.summon_ticket_log (user_id, delta, count_after, reason, ref_id)
    values (v_user, v_tickets, v_tickets_after, 'login_reward', v_claim);
  else
    select coalesce((select t.count from public.summon_tickets t where t.user_id = v_user), 0)
      into v_tickets_after;
  end if;

  return jsonb_build_object('claimed', true, 'day', v_day, 'gems', v_gems, 'tickets', v_tickets,
    'gems_after', v_gems_after, 'tickets_after', v_tickets_after);
end;
$$;

revoke execute on function public.claim_login_reward() from public, anon;
grant execute on function public.claim_login_reward() to authenticated;
