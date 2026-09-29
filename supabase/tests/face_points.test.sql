-- M2-06C: face_points is readable and writable only by accounts on the art_owners allow-list,
-- and the allow-list itself has no client write path.
begin;

select plan(15);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000006c1', 'face-owner@example.test'),
  ('00000000-0000-0000-0000-0000000006c2', 'face-player@example.test');

insert into public.art_owners (user_id) values ('00000000-0000-0000-0000-0000000006c1');

insert into public.face_points
  (unit_id, form, left_eye_x, left_eye_y, right_eye_x, right_eye_y, chin_x, chin_y) values
  ('brand', '6star', 480, 300, 540, 302, 510, 380);

select ok((select relrowsecurity from pg_class where oid = 'public.face_points'::regclass),
  'RLS is enabled on face_points');
select ok((select relrowsecurity from pg_class where oid = 'public.art_owners'::regclass),
  'RLS is enabled on art_owners');
select ok(not has_table_privilege('anon', 'public.face_points', 'select'),
  'anon may not read face_points');
select throws_ok($$insert into public.face_points
    (unit_id, form, left_eye_x, left_eye_y, right_eye_x, right_eye_y, chin_x, chin_y)
    values ('brand', '8star', 1, 1, 2, 2, 3, 3)$$,
  '23514', null, 'form must be a known tier');

-- A signed-in player who is not on the allow-list.
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000006c2","role":"authenticated"}', true);

select is((select count(*)::int from public.face_points), 0,
  'a non-owner reads no face points');
select is((select count(*)::int from public.art_owners), 0,
  'a non-owner sees no allow-list rows');
select throws_ok($$insert into public.face_points
    (unit_id, form, left_eye_x, left_eye_y, right_eye_x, right_eye_y, chin_x, chin_y, updated_by)
    values ('maren', '6star', 1, 1, 2, 2, 3, 3, '00000000-0000-0000-0000-0000000006c2')$$,
  '42501', null, 'a non-owner cannot save face points');
select throws_ok($$insert into public.art_owners (user_id)
    values ('00000000-0000-0000-0000-0000000006c2')$$,
  '42501', null, 'a non-owner cannot add themselves to the allow-list');
update public.face_points set chin_y = 1;
delete from public.face_points;

-- The owner.
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000006c1","role":"authenticated"}', true);

select results_eq(
  $$select unit_id, form, chin_y from public.face_points$$,
  $$values ('brand'::text, '6star'::text, 380::real)$$,
  'the non-owner update and delete touched nothing, and the owner reads the points');
select lives_ok($$insert into public.face_points
    (unit_id, form, left_eye_x, left_eye_y, right_eye_x, right_eye_y, chin_x, chin_y, updated_by)
    values ('maren', '6star', 400, 280, 460, 281, 430, 360, '00000000-0000-0000-0000-0000000006c1')
    on conflict (unit_id, form) do update set chin_y = excluded.chin_y$$,
  'the owner can save face points');
select lives_ok($$insert into public.face_points
    (unit_id, form, left_eye_x, left_eye_y, right_eye_x, right_eye_y, chin_x, chin_y, updated_by)
    values ('brand', '6star', 480, 300, 540, 302, 510, 390, '00000000-0000-0000-0000-0000000006c1')
    on conflict (unit_id, form) do update set chin_y = excluded.chin_y,
      updated_by = excluded.updated_by$$,
  'the owner can overwrite a form''s points');
select throws_ok($$insert into public.face_points
    (unit_id, form, left_eye_x, left_eye_y, right_eye_x, right_eye_y, chin_x, chin_y, updated_by)
    values ('rook', '6star', 1, 1, 2, 2, 3, 3, '00000000-0000-0000-0000-0000000006c2')$$,
  '42501', null, 'the owner cannot stamp another user as the editor');
select throws_ok($$insert into public.art_owners (user_id)
    values ('00000000-0000-0000-0000-0000000006c2')$$,
  '42501', null, 'the owner cannot grow the allow-list from the client either');
select results_eq(
  $$select unit_id, chin_y from public.face_points order by unit_id$$,
  $$values ('brand'::text, 390::real), ('maren'::text, 360::real)$$,
  'saved points read back');

reset role;
delete from auth.users where id = '00000000-0000-0000-0000-0000000006c1';
select is((select count(*)::int from public.art_owners), 0,
  'deleting the owner''s auth user removes them from the allow-list');

select * from finish();
rollback;
