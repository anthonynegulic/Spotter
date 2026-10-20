-- Phase 2, milestone D: the Apple Health bridge (Health Auto Export → the
-- health-ingest Edge Function). Tokens are created on the phone; only their
-- SHA-256 hash is stored. The function writes with the service role.

create table public.ingest_tokens (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  token_hash text not null unique,
  label text,
  created_at timestamptz not null default now(),
  last_used_at timestamptz, -- "last received" on the settings screen
  revoked_at timestamptz,
  updated_at timestamptz not null default now()
);

-- Watch workouts: a summary only (no per-minute data). Matched to logged
-- sessions by time overlap on the phone.
create table public.health_workouts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  external_id text not null, -- Apple Health's workout id, so re-sends update the same row
  name text not null,
  started_at timestamptz not null,
  ended_at timestamptz not null,
  duration_s numeric(10, 1),
  active_kcal numeric(10, 1),
  avg_hr numeric(5, 1),
  max_hr numeric(5, 1),
  source text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (user_id, external_id)
);

create index health_workouts_time_idx on public.health_workouts (user_id, started_at);

do $$
declare
  t text;
begin
  foreach t in array array['ingest_tokens', 'health_workouts'] loop
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

revoke all on public.ingest_tokens, public.health_workouts from anon;
grant select, insert, update, delete on public.ingest_tokens, public.health_workouts to authenticated;
-- The Edge Function's service role (bypasses RLS; never shipped to phones).
grant select, insert, update on public.ingest_tokens, public.health_samples, public.health_workouts to service_role;
