-- Phase 2: daily goals, their manual entries, and health samples (body weight
-- now, Apple Health data from the bridge in milestone D). Same conventions as
-- Phase 1: device-generated ids, user_id on every row, RLS on user_id,
-- server-set updated_at, soft deletes.

create table public.daily_goals (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  type text not null check (type in ('steps', 'active_energy', 'exercise_minutes', 'protein', 'water', 'custom')),
  label text not null,
  target numeric(10, 2), -- fixed target; null when it's derived (protein per kg)
  target_per_kg numeric(4, 2), -- protein: grams per kg of body weight
  unit text not null,
  source text not null default 'manual' check (source in ('auto', 'manual')),
  sort integer not null default 0,
  hidden boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (id, user_id)
);

-- Many entries per goal per day: each protein quick-add is its own row, so a
-- mistaken +30 g can be removed on its own. The day's value is their sum.
create table public.daily_entries (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  goal_id uuid not null,
  date date not null, -- the user's local calendar day
  value numeric(10, 2) not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  foreign key (goal_id, user_id) references public.daily_goals (id, user_id) on delete cascade
);

create index daily_entries_goal_date_idx on public.daily_entries (goal_id, date);

-- One row per metric per moment. Daily totals from Apple Health arrive stamped
-- at local midnight, with local_date carrying the calendar day they belong to.
-- Re-sends update the same row (see DECISIONS.md: the source label isn't part
-- of the key because Apple Health changes it during the day).
create table public.health_samples (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  metric text not null,
  value numeric(12, 3) not null,
  unit text not null,
  recorded_at timestamptz not null,
  local_date date,
  source text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (user_id, metric, recorded_at)
);

create index health_samples_metric_idx on public.health_samples (user_id, metric, recorded_at desc);

do $$
declare
  t text;
begin
  foreach t in array array['daily_goals', 'daily_entries', 'health_samples'] loop
    execute format(
      'create trigger set_updated_at before insert or update on public.%I
         for each row execute function public.set_updated_at()', t);
    execute format('alter table public.%I enable row level security', t);
    execute format('create index %I on public.%I (user_id, updated_at)', t || '_user_updated_idx', t);
    execute format(
      'create policy "Own rows" on public.%I for all to authenticated
         using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))', t);
  end loop;
end;
$$;

revoke all on public.daily_goals, public.daily_entries, public.health_samples from anon;
grant select, insert, update, delete on public.daily_goals, public.daily_entries, public.health_samples to authenticated;
