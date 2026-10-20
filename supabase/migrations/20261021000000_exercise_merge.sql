-- Phase 2: merging exercises. A retired exercise points at the one it was
-- merged into, so sets synced later from an offline phone can be moved across.
alter table public.exercises
  add column merged_into uuid;

alter table public.exercises
  add constraint exercises_merged_into_fkey
  foreign key (merged_into, user_id) references public.exercises (id, user_id);
