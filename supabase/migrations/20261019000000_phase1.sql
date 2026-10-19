-- Spotter, Phase 1 schema: profiles, programs, exercises and workout logging.
--
-- Conventions (see DECISIONS.md):
-- * Row ids are UUIDs generated on the device, so offline rows sync without conflicts.
-- * Every table carries user_id, and RLS checks it directly.
-- * Child rows reference their parent by (id, user_id), so a row can never point
--   at another user's parent even with a guessed id.
-- * updated_at is set by the server on every write; the client pulls changes by it.
-- * Workout data is soft-deleted (deleted_at) so deletes sync across devices.

create extension if not exists pgcrypto;

-- updated_at --------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- profiles ----------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  timezone text not null default 'UTC',
  goals_text text,
  target_weight_kg numeric(5, 1),
  target_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1)))
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- programs ----------------------------------------------------------------

create table public.programs (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null,
  is_active boolean not null default false,
  activated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (id, user_id)
);

create table public.program_versions (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  program_id uuid not null,
  version integer not null,
  schema_version integer not null,
  author text,
  weeks integer,
  progression_notes text,
  raw_json jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  unique (program_id, version),
  foreign key (program_id, user_id) references public.programs (id, user_id) on delete cascade
);

create table public.program_days (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  program_version_id uuid not null,
  day_key text not null,
  name text not null,
  day_of_week smallint check (day_of_week between 1 and 7), -- 1 = Monday
  sort integer not null,
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  foreign key (program_version_id, user_id) references public.program_versions (id, user_id) on delete cascade
);

-- exercises ---------------------------------------------------------------

create table public.exercises (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null,
  equipment text not null default 'other'
    check (equipment in ('barbell', 'dumbbell', 'machine', 'cable', 'kettlebell', 'bodyweight', 'other')),
  increment_kg numeric(4, 2) not null default 2.5 check (increment_kg > 0),
  library_ref text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (id, user_id)
);

create table public.exercise_aliases (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  exercise_id uuid not null,
  alias text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (exercise_id, alias),
  foreign key (exercise_id, user_id) references public.exercises (id, user_id) on delete cascade
);

create table public.program_items (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  program_day_id uuid not null,
  exercise_id uuid,
  type text not null check (type in ('strength', 'cardio')),
  name text not null,
  sort integer not null,
  equipment text,
  sets integer,
  reps_min integer,
  reps_max integer,
  rest_seconds integer,
  superset_group text,
  duration_minutes numeric(6, 1),
  notes text,
  updated_at timestamptz not null default now(),
  foreign key (program_day_id, user_id) references public.program_days (id, user_id) on delete cascade,
  foreign key (exercise_id, user_id) references public.exercises (id, user_id)
);

-- sessions and logging ------------------------------------------------------

create table public.sessions (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  program_id uuid,
  program_day_id uuid,
  day_key text,
  name text not null,
  plan jsonb not null default '[]'::jsonb, -- today's exercise list incl. swaps, skips and order
  started_at timestamptz not null,
  finished_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (id, user_id),
  foreign key (program_id, user_id) references public.programs (id, user_id),
  foreign key (program_day_id, user_id) references public.program_days (id, user_id)
);

create table public.sets (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  session_id uuid not null,
  exercise_id uuid not null,
  item_key text, -- which plan item this set belongs to
  set_number integer not null check (set_number > 0),
  weight_kg numeric(6, 2) not null check (weight_kg >= 0), -- per dumbbell; added weight for bodyweight
  reps integer not null check (reps >= 0),
  note text,
  logged_at timestamptz not null,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  foreign key (session_id, user_id) references public.sessions (id, user_id) on delete cascade,
  foreign key (exercise_id, user_id) references public.exercises (id, user_id)
);

create table public.cardio_entries (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  session_id uuid not null,
  item_key text, -- which plan item this logs
  name text not null,
  duration_min numeric(6, 1) not null check (duration_min >= 0),
  incline numeric(4, 1),
  speed_kmh numeric(4, 1),
  distance_km numeric(6, 2),
  logged_at timestamptz not null,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  foreign key (session_id, user_id) references public.sessions (id, user_id) on delete cascade
);

-- indexes, triggers, RLS ------------------------------------------------------

do $$
declare
  t text;
begin
  foreach t in array array[
    'profiles', 'programs', 'program_versions', 'program_days', 'program_items',
    'exercises', 'exercise_aliases', 'sessions', 'sets', 'cardio_entries'
  ] loop
    execute format(
      'create trigger set_updated_at before insert or update on public.%I
         for each row execute function public.set_updated_at()', t);
    execute format('alter table public.%I enable row level security', t);
    if t = 'profiles' then
      execute 'create index profiles_updated_at_idx on public.profiles (updated_at)';
      execute $p$create policy "Own profile" on public.profiles for all to authenticated
                 using (id = (select auth.uid())) with check (id = (select auth.uid()))$p$;
    else
      execute format('create index %I on public.%I (user_id, updated_at)', t || '_user_updated_idx', t);
      execute format(
        'create policy "Own rows" on public.%I for all to authenticated
           using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))', t);
    end if;
  end loop;
end;
$$;

create index sets_exercise_idx on public.sets (exercise_id, logged_at);
create index sets_session_idx on public.sets (session_id);

-- Only signed-in users reach these tables, and only through RLS.
revoke all on all tables in schema public from anon;
grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
