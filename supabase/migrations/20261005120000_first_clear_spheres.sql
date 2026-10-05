-- M4-04F: first-clear spheres and the signature sphere claim (RESOLVED-71, GAME_DESIGN §6 →
-- Spheres). A stage's `firstClear.spheres` ([{sphere, count}]) grants `count` sphere instances
-- (owned_spheres rows, one sphere_log row each) and `firstClear.signatureClaims` (n) grants n
-- unredeemed signature_sphere_claims rows, both in the same claim transaction as the stage's
-- gems, items, units, and starter. Story stage 8 grants six Wayfarer Seals, Trial 1 six Vanguard
-- Seals, and Trial 2 its Satchel Toad (through the existing `firstClear.units` path) plus one
-- claim. choose_signature_sphere redeems one claim for one signature sphere of the player's
-- choice. The result gains `first_clear_spheres` ({sphere id: count}) and `signature_claims` (n)
-- when the stage grants any; replays grant nothing. Everything else in the reward function is
-- unchanged from 20261001190000_first_clear_toads.sql (renamed by 20261001230000).

-- Append-only acquisition log for sphere instances.
create table public.sphere_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  owned_sphere_id uuid not null,
  sphere_id text not null,
  reason text not null check (reason in ('battle_first_clear', 'signature_claim')),
  ref_id uuid,
  created_at timestamptz not null default now()
);
create index sphere_log_user_idx on public.sphere_log(user_id);

-- One row per signature claim earned; redeeming sets the chosen instance once.
create table public.signature_sphere_claims (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  ref_id uuid not null,
  owned_sphere_id uuid unique references public.owned_spheres(id) on delete set null,
  redeemed_at timestamptz,
  created_at timestamptz not null default now()
);
create index signature_sphere_claims_user_idx on public.signature_sphere_claims(user_id);

alter table public.sphere_log enable row level security;
alter table public.signature_sphere_claims enable row level security;
create policy "sphere_log: read own" on public.sphere_log for select to authenticated
  using (user_id = (select auth.uid()));
create policy "signature_sphere_claims: read own" on public.signature_sphere_claims
  for select to authenticated using (user_id = (select auth.uid()));
revoke all on public.sphere_log, public.signature_sphere_claims from anon, authenticated;
grant select on public.sphere_log, public.signature_sphere_claims to authenticated;
create trigger sphere_log_append_only before update or delete on public.sphere_log
  for each row execute function public.reject_wallet_log_change();

-- Internal: one sphere instance plus its log row.
create function public.grant_sphere(p_user uuid, p_sphere text, p_reason text, p_ref uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
begin
  if not exists (select 1 from public.content_items where kind = 'sphere' and id = p_sphere) then
    raise exception 'grant_sphere: unknown sphere %', p_sphere using errcode = '55000';
  end if;
  insert into public.owned_spheres(user_id, sphere_id) values (p_user, p_sphere)
  returning id into v_id;
  insert into public.sphere_log(user_id, owned_sphere_id, sphere_id, reason, ref_id)
  values (p_user, v_id, p_sphere, p_reason, p_ref);
  return v_id;
end;
$$;
revoke execute on function public.grant_sphere(uuid, text, text, uuid)
  from public, anon, authenticated, service_role;

-- Redeems the player's oldest open claim for one signature sphere.
create function public.choose_signature_sphere(p_sphere text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_claim uuid;
  v_owned uuid;
begin
  if v_user is null then
    raise exception 'choose_signature_sphere: not signed in' using errcode = '42501';
  end if;
  if not exists (select 1 from public.content_items
    where kind = 'sphere' and id = p_sphere and data ->> 'kind' = 'signature') then
    raise exception 'choose_signature_sphere: not a signature sphere' using errcode = '22023';
  end if;
  perform 1 from public.wallets where user_id = v_user for update;
  select id into v_claim from public.signature_sphere_claims
  where user_id = v_user and redeemed_at is null
  order by created_at, id limit 1 for update;
  if v_claim is null then
    raise exception 'choose_signature_sphere: no signature sphere claim' using errcode = 'P0002';
  end if;
  v_owned := public.grant_sphere(v_user, p_sphere, 'signature_claim', v_claim);
  update public.signature_sphere_claims
  set owned_sphere_id = v_owned, redeemed_at = now() where id = v_claim;
  return jsonb_build_object('owned_sphere_id', v_owned, 'sphere_id', p_sphere);
end;
$$;
revoke execute on function public.choose_signature_sphere(text) from public, anon;
grant execute on function public.choose_signature_sphere(text) to authenticated;

create or replace function public.grant_battle_rewards_without_refund(p_session_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rewards jsonb;
  v_session public.battle_sessions;
  v_first_clear jsonb;
  v_rule jsonb;
  v_entry jsonb;
  v_items jsonb;
  v_units jsonb;
  v_spheres jsonb;
  v_claims integer;
  v_form_id text;
  v_picked text;
  v_unit_id text;
  v_unit public.owned_units;
begin
  v_rewards := public.grant_battle_base_rewards(p_session_id);
  if not (v_rewards ->> 'first_clear')::boolean then
    return v_rewards;
  end if;

  select * into v_session from public.battle_sessions where id = p_session_id;
  select c.data -> 'firstClear' into v_first_clear
  from public.content_items c
  where c.kind = 'stage' and c.id = v_session.stage_id;

  -- First-clear items: one grant (and item_log row) per entry.
  v_items := coalesce(v_rewards -> 'items', '{}'::jsonb);
  for v_entry in
    select value from jsonb_array_elements(coalesce(v_first_clear -> 'items', '[]'::jsonb))
  loop
    perform public.grant_item(v_session.user_id, v_entry ->> 'item',
      (v_entry ->> 'count')::bigint, 'battle_first_clear', v_session.id);
    v_items := jsonb_set(v_items, array[v_entry ->> 'item'],
      to_jsonb(coalesce((v_items ->> (v_entry ->> 'item'))::bigint, 0)
        + (v_entry ->> 'count')::bigint));
  end loop;
  v_rewards := v_rewards || jsonb_build_object('items', v_items);

  -- First-clear units: stackable fodder (Lantern and Satchel Toads), one stack change per entry.
  v_units := '{}'::jsonb;
  for v_entry in
    select value from jsonb_array_elements(coalesce(v_first_clear -> 'units', '[]'::jsonb))
  loop
    if not public.unit_is_stackable(v_entry ->> 'unit') then
      raise exception 'grant_battle_rewards: first-clear unit % is not stackable',
        v_entry ->> 'unit' using errcode = '55000';
    end if;
    select c.data -> 'forms' -> 0 ->> 'id' into v_form_id
    from public.content_items c
    where c.kind = 'unit' and c.id = v_entry ->> 'unit';
    perform public.change_unit_stack(v_session.user_id, v_entry ->> 'unit', v_form_id,
      (v_entry ->> 'count')::integer, 'battle_first_clear', v_session.id);
    v_units := jsonb_set(v_units, array[v_entry ->> 'unit'],
      to_jsonb(coalesce((v_units ->> (v_entry ->> 'unit'))::integer, 0)
        + (v_entry ->> 'count')::integer));
  end loop;
  if v_units <> '{}'::jsonb then
    v_rewards := v_rewards || jsonb_build_object('first_clear_units', v_units);
  end if;

  -- First-clear spheres: one owned_spheres row (and sphere_log row) per copy.
  v_spheres := '{}'::jsonb;
  for v_entry in
    select value from jsonb_array_elements(coalesce(v_first_clear -> 'spheres', '[]'::jsonb))
  loop
    perform public.grant_sphere(v_session.user_id, v_entry ->> 'sphere',
      'battle_first_clear', v_session.id)
    from generate_series(1, (v_entry ->> 'count')::integer);
    v_spheres := jsonb_set(v_spheres, array[v_entry ->> 'sphere'],
      to_jsonb(coalesce((v_spheres ->> (v_entry ->> 'sphere'))::integer, 0)
        + (v_entry ->> 'count')::integer));
  end loop;
  if v_spheres <> '{}'::jsonb then
    v_rewards := v_rewards || jsonb_build_object('first_clear_spheres', v_spheres);
  end if;

  -- Signature sphere claims, redeemed later through choose_signature_sphere.
  v_claims := coalesce((v_first_clear ->> 'signatureClaims')::integer, 0);
  if v_claims > 0 then
    insert into public.signature_sphere_claims(user_id, ref_id)
    select v_session.user_id, v_session.id from generate_series(1, v_claims);
    v_rewards := v_rewards || jsonb_build_object('signature_claims', v_claims);
  end if;

  select c.data -> 'firstClear' -> 'starter' into v_rule
  from public.content_items c
  where c.kind = 'stage' and c.id = v_session.stage_id and c.data ? 'story';
  if v_rule is null then
    return v_rewards;
  end if;

  -- Use the permanent acquisition log, not the mutable inventory or current squad. The
  -- selected starter may have evolved or been consumed without changing the reward order.
  select l.unit_id into v_picked from public.unit_log l
  where l.user_id = v_session.user_id and l.reason = 'starter_pick' and l.delta = 1;
  if v_picked is null or not (v_picked = any(public.starter_unit_ids())) then
    raise exception 'grant_battle_rewards: starter pick is unavailable' using errcode = '55000';
  end if;

  select s.unit_id into v_unit_id
  from unnest(public.starter_unit_ids()) with ordinality as s(unit_id, ord)
  where s.unit_id <> v_picked order by s.ord
  offset ((v_rule ->> 'ordinal')::integer - 1) limit 1;
  if v_unit_id is null then
    raise exception 'grant_battle_rewards: invalid starter reward' using errcode = '55000';
  end if;

  v_unit := public.grant_unit(v_session.user_id, v_unit_id,
    v_unit_id || '-' || (v_rule ->> 'rarity'));
  insert into public.unit_log (user_id, owned_unit_id, unit_id, form_id, delta, reason, ref_id)
  values (v_session.user_id, v_unit.id, v_unit.unit_id, v_unit.form_id, 1,
    'story_starter', v_session.id);

  return v_rewards || jsonb_build_object('starter', jsonb_build_object(
    'owned_unit_id', v_unit.id, 'unit_id', v_unit.unit_id, 'form_id', v_unit.form_id));
end;
$$;
revoke execute on function public.grant_battle_rewards_without_refund(uuid)
  from public, anon, authenticated, service_role;
