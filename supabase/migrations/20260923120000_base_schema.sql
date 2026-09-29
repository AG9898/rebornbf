-- M3-01A: base player schema with Row Level Security.
--
-- Clients (anon/authenticated) may only SELECT their own rows. Every write goes through
-- `security definer` RPC functions added by later tasks, so no insert/update/delete privileges or
-- policies are granted to client roles here. RLS is enabled in this same migration for every table.

-- ---------------------------------------------------------------------------------------------
-- profiles: one row per auth user (id = auth.users.id).
-- ---------------------------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text check (display_name is null or char_length(display_name) between 1 and 32),
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------------------------
-- wallets: one row per user holding the earned-only currencies (GAME_DESIGN.md: gems, zel).
-- ---------------------------------------------------------------------------------------------
create table public.wallets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users (id) on delete cascade,
  gems bigint not null default 0 check (gems >= 0),
  zel bigint not null default 0 check (zel >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------------------------
-- wallet_log: append-only record of every currency change.
-- ---------------------------------------------------------------------------------------------
create table public.wallet_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  currency text not null check (currency in ('gems', 'zel')),
  delta bigint not null check (delta <> 0),
  balance_after bigint not null check (balance_after >= 0),
  reason text not null check (char_length(reason) between 1 and 64),
  ref_id uuid,
  created_at timestamptz not null default now()
);

create index wallet_log_user_id_created_at_idx on public.wallet_log (user_id, created_at desc);

-- ---------------------------------------------------------------------------------------------
-- owned_units: unit instances a player owns. unit_id/form_id are packages/data content IDs.
-- ---------------------------------------------------------------------------------------------
create table public.owned_units (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  unit_id text not null check (unit_id ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  form_id text not null check (form_id ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  level integer not null default 1 check (level >= 1),
  exp bigint not null default 0 check (exp >= 0),
  created_at timestamptz not null default now()
);

create index owned_units_user_id_idx on public.owned_units (user_id);

-- ---------------------------------------------------------------------------------------------
-- squads: numbered squads of up to 5 owned units (GAME_DESIGN.md: squad of 1–5 + ally slot;
-- the ally is chosen per battle, not stored here). Ownership of unit_ids is checked by the
-- squad RPC, since array elements cannot carry foreign keys.
-- ---------------------------------------------------------------------------------------------
create table public.squads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  slot smallint not null check (slot between 0 and 9),
  name text check (name is null or char_length(name) between 1 and 32),
  unit_ids uuid[] not null default '{}' check (cardinality(unit_ids) <= 5),
  leader_index smallint not null default 0
    check (leader_index >= 0 and (cardinality(unit_ids) = 0 or leader_index < cardinality(unit_ids))),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, slot)
);

-- ---------------------------------------------------------------------------------------------
-- Row Level Security: own-row reads only; no client write policies.
-- ---------------------------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.wallets enable row level security;
alter table public.wallet_log enable row level security;
alter table public.owned_units enable row level security;
alter table public.squads enable row level security;

create policy "profiles: read own" on public.profiles
  for select to authenticated using (id = (select auth.uid()));

create policy "wallets: read own" on public.wallets
  for select to authenticated using (user_id = (select auth.uid()));

create policy "wallet_log: read own" on public.wallet_log
  for select to authenticated using (user_id = (select auth.uid()));

create policy "owned_units: read own" on public.owned_units
  for select to authenticated using (user_id = (select auth.uid()));

create policy "squads: read own" on public.squads
  for select to authenticated using (user_id = (select auth.uid()));

-- Defense in depth: Supabase grants all table privileges to client roles by default. Strip them so
-- direct writes fail with a permission error even if a permissive policy is ever added by mistake.
revoke all on table
  public.profiles, public.wallets, public.wallet_log, public.owned_units, public.squads
  from anon, authenticated;

grant select on table
  public.profiles, public.wallets, public.wallet_log, public.owned_units, public.squads
  to authenticated;

-- ---------------------------------------------------------------------------------------------
-- wallet_log is append-only for every role, including the service role and definer functions.
-- The one exception is the cascade from deleting the owning auth user (account deletion): the
-- cascade runs after the auth.users row is gone, so a delete whose user no longer exists passes.
-- ---------------------------------------------------------------------------------------------
create function public.reject_wallet_log_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' and not exists (select 1 from auth.users u where u.id = old.user_id) then
    return old;
  end if;
  raise exception 'wallet_log is append-only' using errcode = 'P0001';
end;
$$;

revoke execute on function public.reject_wallet_log_change() from public, anon, authenticated;

create trigger wallet_log_append_only
  before update or delete on public.wallet_log
  for each row execute function public.reject_wallet_log_change();
