-- Two-account privacy test (BRIEF.md §9: "A second user cannot see the first
-- user's programs or sets"). Run with scripts/test-db.sh. Any failed assert
-- aborts with an error.
\set ON_ERROR_STOP on

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'ante@example.com'),
  ('00000000-0000-0000-0000-00000000000b', 'abrar@example.com');

do $$ begin
  assert (select count(*) from public.profiles) = 2, 'profiles created by trigger';
end $$;

-- User A writes a full program and a logged set ---------------------------------
set role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a"}', false);

insert into public.programs (id, user_id, name, is_active) values ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000a', 'A program', true);
insert into public.program_versions (id, user_id, program_id, version, schema_version, raw_json) values ('20000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-000000000001', 1, 1, '{}');
insert into public.program_days (id, user_id, program_version_id, day_key, name, day_of_week, sort) values ('30000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-000000000001', 'upper-a', 'Upper A', 1, 0);
insert into public.exercises (id, user_id, name, equipment, increment_kg) values ('40000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000a', 'Barbell Bench Press', 'barbell', 2.5);
insert into public.exercise_aliases (id, user_id, exercise_id, alias) values ('41000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000a', '40000000-0000-0000-0000-000000000001', 'bench');
insert into public.program_items (id, user_id, program_day_id, exercise_id, type, name, sort, sets) values ('50000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000a', '30000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001', 'strength', 'Barbell Bench Press', 0, 4);
insert into public.sessions (id, user_id, program_id, program_day_id, day_key, name, started_at) values ('60000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', 'upper-a', 'Upper A', now());
insert into public.sets (id, user_id, session_id, exercise_id, set_number, weight_kg, reps, logged_at) values ('70000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000a', '60000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001', 1, 80, 8, now());
insert into public.cardio_entries (id, user_id, session_id, name, duration_min, logged_at) values ('80000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000a', '60000000-0000-0000-0000-000000000001', 'Walk', 20, now());

insert into public.daily_goals (id, user_id, type, label, target, unit) values ('90000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000a', 'protein', 'Protein', 170, 'g');
insert into public.daily_entries (id, user_id, goal_id, date, value) values ('91000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000a', '90000000-0000-0000-0000-000000000001', current_date, 30);
insert into public.health_samples (user_id, metric, value, unit, recorded_at, source) values ('00000000-0000-0000-0000-00000000000a', 'body_mass', 85.3, 'kg', now(), 'manual');

-- Upsert (what the sync engine sends) works for the owner.
insert into public.sets (id, user_id, session_id, exercise_id, set_number, weight_kg, reps, logged_at) values ('70000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000a', '60000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001', 1, 82.5, 8, now())
  on conflict (id) do update set weight_kg = excluded.weight_kg;

do $$ begin
  assert (select count(*) from public.programs) = 1, 'A sees own program';
  assert (select count(*) from public.sets) = 1, 'A sees own set';
  assert (select weight_kg from public.sets) = 82.5, 'upsert updated the set';
  assert (select count(*) from public.profiles) = 1, 'A sees only own profile';
end $$;

-- User B sees and changes nothing of A's ---------------------------------------------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b"}', false);

do $$
declare
  t text;
  n int;
begin
  foreach t in array array['programs','program_versions','program_days','program_items','exercises','exercise_aliases','sessions','sets','cardio_entries','daily_goals','daily_entries','health_samples'] loop
    execute format('select count(*) from public.%I', t) into n;
    assert n = 0, format('B must not see rows in %s', t);
    execute format('update public.%I set user_id = user_id', t);
    get diagnostics n = row_count;
    assert n = 0, format('B must not update rows in %s', t);
    execute format('delete from public.%I', t);
    get diagnostics n = row_count;
    assert n = 0, format('B must not delete rows in %s', t);
  end loop;
  assert (select count(*) from public.profiles) = 1, 'B sees only own profile';
end $$;

-- B can't write rows owned by A ...
do $$ begin
  begin
    insert into public.programs (id, user_id, name) values (gen_random_uuid(), '00000000-0000-0000-0000-00000000000a', 'sneaky');
    raise exception 'B inserted a row owned by A';
  exception when insufficient_privilege then null;
  end;
end $$;

-- ... can't overwrite A's row through an upsert on a known id ...
do $$ begin
  begin
    insert into public.sets (id, user_id, session_id, exercise_id, set_number, weight_kg, reps, logged_at) values ('70000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000b', '60000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001', 1, 1, 1, now())
      on conflict (id) do update set weight_kg = excluded.weight_kg;
    raise exception 'B upserted over A''s set';
  exception when insufficient_privilege or foreign_key_violation then null;
  end;
end $$;

-- ... and can't attach own rows to A's parents.
do $$ begin
  begin
    insert into public.daily_entries (id, user_id, goal_id, date, value) values (gen_random_uuid(), '00000000-0000-0000-0000-00000000000b', '90000000-0000-0000-0000-000000000001', current_date, 999);
    raise exception 'B added an entry to A''s goal';
  exception when foreign_key_violation then null;
  end;
end $$;

do $$ begin
  begin
    insert into public.sets (id, user_id, session_id, exercise_id, set_number, weight_kg, reps, logged_at) values (gen_random_uuid(), '00000000-0000-0000-0000-00000000000b', '60000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001', 1, 1, 1, now());
    raise exception 'B attached a set to A''s session';
  exception when foreign_key_violation then null;
  end;
end $$;

-- Anonymous requests get nothing --------------------------------------------------
reset role;
set role anon;
do $$ begin
  begin
    perform count(*) from public.sets;
    raise exception 'anon read sets';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

do $$ begin
  assert (select weight_kg from public.sets where id = '70000000-0000-0000-0000-000000000001') = 82.5, 'A''s set untouched';
  assert (select count(*) from public.programs) = 1, 'A''s program untouched';
end $$;

\echo 'RLS tests passed'
