-- M3-02: read-only game content tables, seeded from packages/data.
--
-- packages/data/content/ is the single source of truth. `pnpm --filter @bfr/data seed` renders
-- supabase/seed.sql, which calls public.seed_content() once with every content file and the
-- content version (a hash of that content, also exported to clients as CONTENT_VERSION). Server
-- functions read these tables; clients never read or write them (they ship the JSON statically).

-- ---------------------------------------------------------------------------------------------
-- content_items: one row per content file (units/, enemies/, stages/), id = file name.
-- ---------------------------------------------------------------------------------------------
create table public.content_items (
  kind text not null check (kind in ('unit', 'enemy', 'stage')),
  id text not null check (id ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  data jsonb not null check (jsonb_typeof(data) = 'object'),
  primary key (kind, id)
);

-- ---------------------------------------------------------------------------------------------
-- content_version: a single row naming the content version the items were seeded from.
-- ---------------------------------------------------------------------------------------------
create table public.content_version (
  singleton boolean primary key default true check (singleton),
  version text not null check (version ~ '^[0-9a-f]{16}$'),
  item_count integer not null check (item_count >= 0),
  seeded_at timestamptz not null default now()
);

-- RLS on with no policies, and no client privileges: content is not queryable by players.
alter table public.content_items enable row level security;
alter table public.content_version enable row level security;

revoke all on table public.content_items, public.content_version from anon, authenticated;
-- Read-only for the service role (battle-verification route); only the seed may write.
revoke all on table public.content_items, public.content_version from service_role;
grant select on table public.content_items, public.content_version to service_role;

-- ---------------------------------------------------------------------------------------------
-- seed_content: replace the content with exactly `p_items` ([{kind, id, data}, ...]) at
-- `p_version`. Idempotent: unchanged rows are not rewritten, and seeded_at moves only when the
-- version or item count changes, so seeding the same content twice leaves identical state.
-- Callable only by the table owner (the seed runs as postgres); every API role is revoked.
-- ---------------------------------------------------------------------------------------------
create function public.seed_content(p_version text, p_items jsonb)
returns void
language plpgsql
set search_path = ''
as $$
begin
  if jsonb_typeof(p_items) is distinct from 'array' then
    raise exception 'seed_content: p_items must be a JSON array' using errcode = '22023';
  end if;

  lock table public.content_items, public.content_version in exclusive mode;

  delete from public.content_items c
  where not exists (
    select 1 from jsonb_array_elements(p_items) e
    where e ->> 'kind' = c.kind and e ->> 'id' = c.id
  );

  insert into public.content_items (kind, id, data)
  select e ->> 'kind', e ->> 'id', e -> 'data'
  from jsonb_array_elements(p_items) e
  on conflict (kind, id) do update set data = excluded.data
  where public.content_items.data is distinct from excluded.data;

  insert into public.content_version (singleton, version, item_count)
  values (true, p_version, jsonb_array_length(p_items))
  on conflict (singleton) do update
    set version = excluded.version, item_count = excluded.item_count, seeded_at = now()
  where public.content_version.version is distinct from excluded.version
     or public.content_version.item_count is distinct from excluded.item_count;
end;
$$;

revoke execute on function public.seed_content(text, jsonb)
  from public, anon, authenticated, service_role;
