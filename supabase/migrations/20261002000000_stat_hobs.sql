-- M4-04B: stat hobs are unit fodder. Persist totals across evolution, cap at the current form,
-- and freeze them into server-issued battle snapshots. Content is reseeded after migrations.
alter table public.owned_units add column imps jsonb not null
  default '{"hp":0,"atk":0,"def":0,"rec":0}'::jsonb
  check (jsonb_typeof(imps) = 'object'
    and imps ?& array['hp','atk','def','rec']
    and imps - array['hp','atk','def','rec'] = '{}'::jsonb
    and (imps ->> 'hp') ~ '^(0|[1-9][0-9]*)$'
    and (imps ->> 'atk') ~ '^(0|[1-9][0-9]*)$'
    and (imps ->> 'def') ~ '^(0|[1-9][0-9]*)$'
    and (imps ->> 'rec') ~ '^(0|[1-9][0-9]*)$'
    and jsonb_typeof(imps -> 'hp') = 'number'
    and jsonb_typeof(imps -> 'atk') = 'number'
    and jsonb_typeof(imps -> 'def') = 'number'
    and jsonb_typeof(imps -> 'rec') = 'number');

-- Apply each copy in a deterministic order; an entirely wasted hob rejects the transaction.
create function public.hob_totals(p_totals jsonb, p_caps jsonb, p_gains jsonb, p_copies integer)
returns jsonb language plpgsql immutable set search_path = '' as $$
declare
  v_totals jsonb := p_totals;
  v_next jsonb;
  v_key text;
begin
  for i in 1..p_copies loop
    v_next := '{}'::jsonb;
    foreach v_key in array array['hp','atk','def','rec'] loop
      v_next := v_next || jsonb_build_object(v_key,
        least((v_totals ->> v_key)::integer + (p_gains ->> v_key)::integer,
          coalesce((p_caps ->> v_key)::integer, 0)));
    end loop;
    if v_next = v_totals then
      raise exception 'fuse: a stat hob would grant nothing' using errcode = 'P0001';
    end if;
    v_totals := v_next;
  end loop;
  return v_totals;
end;
$$;
revoke execute on function public.hob_totals(jsonb,jsonb,jsonb,integer)
  from public, anon, authenticated, service_role;

-- Preserve the installed fuse (including success rolls, stacks and squad safety), with guarded
-- source substitutions as in per_quest_ally. No inventory is changed by this migration.
do $$
declare
  v_definition text := pg_get_functiondef('public.fuse(uuid,uuid[],jsonb)'::regprocedure);
  v_change record;
begin
  for v_change in select * from (values
    ('  v_base_gain bigint;', '  v_base_gain bigint;
  v_imps jsonb;'),
    ('  v_element := v_unit', '  v_imps := v_target.imps;
  v_element := v_unit'),
    ('  loop
    v_fodder_exp :=', '  order by unit_id, copies
  loop
    if jsonb_typeof(v_fodder.form -> ''fusionEffect'') = ''object''
      and (v_fodder.form -> ''fusionEffect'') ? ''imps'' then
      v_imps := public.hob_totals(v_imps, v_form -> ''impCaps'',
        v_fodder.form #> ''{fusionEffect,imps}'', v_fodder.copies);
    end if;
    v_fodder_exp :='),
    ('    bb_level = v_bb, sbb_level = v_sbb,',
      '    bb_level = v_bb, sbb_level = v_sbb, imps = v_imps,')
  ) as changes(old_text, new_text)
  loop
    if strpos(v_definition, v_change.old_text) = 0 then
      raise exception 'stat_hobs: unexpected fuse definition at %', v_change.old_text;
    end if;
    v_definition := replace(v_definition, v_change.old_text, v_change.new_text);
  end loop;
  execute v_definition;
end;
$$;

create function public.snapshot_unit_imps(p_unit jsonb, p_user uuid)
returns jsonb language sql stable set search_path = '' as $$
  select coalesce((select case when o.imps = '{"hp":0,"atk":0,"def":0,"rec":0}'::jsonb
    then p_unit else p_unit || jsonb_build_object('imps', o.imps) end
    from public.owned_units o
    where o.id = (p_unit ->> 'owned_unit_id')::uuid and o.user_id = p_user), p_unit);
$$;
revoke execute on function public.snapshot_unit_imps(jsonb,uuid)
  from public, anon, authenticated, service_role;

create function public.snapshot_battle_imps()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if not (new.squad ? 'units') or jsonb_array_length(new.squad -> 'units') = 0 then
    return new;
  end if;
  new.squad := jsonb_set(new.squad, '{units}', (
    select jsonb_agg(public.snapshot_unit_imps(u, new.user_id) order by ord)
    from jsonb_array_elements(new.squad -> 'units') with ordinality as units(u, ord)
  ));
  if new.squad -> 'ally' <> 'null'::jsonb then
    new.squad := jsonb_set(new.squad, '{ally}', public.snapshot_unit_imps(new.squad -> 'ally', new.user_id));
  end if;
  return new;
end;
$$;
revoke execute on function public.snapshot_battle_imps()
  from public, anon, authenticated, service_role;
create trigger battle_imps before insert on public.battle_sessions
  for each row execute function public.snapshot_battle_imps();
