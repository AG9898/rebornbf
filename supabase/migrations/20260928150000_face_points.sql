-- M2-06C: the owner face picker's storage.
--
-- art_owners is the allow-list of accounts that may use the owner-only art tools. It has no
-- client write path: the site owner adds their own auth user id once, from the Supabase SQL editor
-- (which runs as postgres), e.g.
--   insert into public.art_owners (user_id) values ('<auth user id>');
-- Signed-in users may read only their own row, so a page can ask "am I an owner?".
--
-- face_points holds one row per unit form: the left eye, right eye, and chin the owner clicked on
-- that form's web splash (apps/web/public/assets/units/<unit>/illustration-<form>.png, 1024x1024
-- pixels; "left" is the eye on the image's left). Only allow-listed owners may read or write it.

create table public.art_owners (
  user_id uuid primary key references auth.users (id) on delete cascade,
  added_at timestamptz not null default now()
);

alter table public.art_owners enable row level security;

create policy "art_owners: read own" on public.art_owners
  for select to authenticated using (user_id = (select auth.uid()));

revoke all on table public.art_owners from anon, authenticated;
grant select on table public.art_owners to authenticated;

create table public.face_points (
  unit_id text not null check (unit_id ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  form text not null check (form in ('3star', '4star', '5star', '6star', '7star', 'omni')),
  left_eye_x real not null check (left_eye_x between 0 and 1024),
  left_eye_y real not null check (left_eye_y between 0 and 1024),
  right_eye_x real not null check (right_eye_x between 0 and 1024),
  right_eye_y real not null check (right_eye_y between 0 and 1024),
  chin_x real not null check (chin_x between 0 and 1024),
  chin_y real not null check (chin_y between 0 and 1024),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null,
  primary key (unit_id, form)
);

alter table public.face_points enable row level security;

-- Every policy asks the allow-list; art_owners' own policy lets a user see only their row, so the
-- subquery is true exactly when the caller is listed.
create policy "face_points: owners read" on public.face_points
  for select to authenticated
  using (exists (select 1 from public.art_owners o where o.user_id = (select auth.uid())));

create policy "face_points: owners insert" on public.face_points
  for insert to authenticated
  with check (
    exists (select 1 from public.art_owners o where o.user_id = (select auth.uid()))
    and updated_by = (select auth.uid())
  );

create policy "face_points: owners update" on public.face_points
  for update to authenticated
  using (exists (select 1 from public.art_owners o where o.user_id = (select auth.uid())))
  with check (
    exists (select 1 from public.art_owners o where o.user_id = (select auth.uid()))
    and updated_by = (select auth.uid())
  );

create policy "face_points: owners delete" on public.face_points
  for delete to authenticated
  using (exists (select 1 from public.art_owners o where o.user_id = (select auth.uid())));

revoke all on table public.face_points from anon, authenticated;
grant select, insert, update, delete on table public.face_points to authenticated;
