-- M3-01B: create a profile row the first time a player signs in.
--
-- Supabase Auth inserts one auth.users row on a player's first Google or Discord sign-in; this
-- trigger gives that user a public.profiles row in the same transaction. The display name is the
-- provider's name claim (`full_name`, else `name`), trimmed and cut to the 32-character column
-- limit; blank or missing names are stored as null. Email is never copied into profiles.

create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  provider_name text := nullif(
    btrim(coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name')),
    ''
  );
begin
  insert into public.profiles (id, display_name)
  values (new.id, left(provider_name, 32))
  on conflict (id) do nothing;
  return new;
end;
$$;

revoke execute on function public.handle_new_user() from public, anon, authenticated;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
