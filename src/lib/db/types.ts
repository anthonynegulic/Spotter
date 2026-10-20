import type { Equipment } from "@/lib/program/schema";

/**
 * Row shapes shared by the local cache (Dexie) and Supabase. Field names match
 * the Postgres columns exactly so rows move between the two without mapping.
 */

export interface ProgramRow {
  id: string;
  user_id: string;
  name: string;
  is_active: boolean;
  activated_at: string | null;
  created_at: string;
  updated_at?: string;
  deleted_at: string | null;
}

export interface ProgramVersionRow {
  id: string;
  user_id: string;
  program_id: string;
  version: number;
  schema_version: number;
  author: string | null;
  weeks: number | null;
  progression_notes: string | null;
  raw_json: unknown;
  created_at: string;
  updated_at?: string;
}

export interface ProgramDayRow {
  id: string;
  user_id: string;
  program_version_id: string;
  day_key: string;
  name: string;
  /** 1 = Monday … 7 = Sunday, or null for a rotation. */
  day_of_week: number | null;
  sort: number;
  updated_at?: string;
}

export interface ProgramItemRow {
  id: string;
  user_id: string;
  program_day_id: string;
  exercise_id: string | null;
  type: "strength" | "cardio";
  name: string;
  sort: number;
  equipment: Equipment | null;
  sets: number | null;
  reps_min: number | null;
  reps_max: number | null;
  rest_seconds: number | null;
  superset_group: string | null;
  duration_minutes: number | null;
  notes: string | null;
  updated_at?: string;
}

export interface ExerciseRow {
  id: string;
  user_id: string;
  name: string;
  equipment: Equipment;
  increment_kg: number;
  library_ref: string | null;
  /** Set when this exercise was merged into another; its history now lives there. */
  merged_into?: string | null;
  created_at: string;
  updated_at?: string;
  deleted_at: string | null;
}

export interface ExerciseAliasRow {
  id: string;
  user_id: string;
  exercise_id: string;
  alias: string;
  created_at: string;
  updated_at?: string;
}

/** One entry in a session's plan: today's list, after swaps, skips and reordering. */
export interface PlanItem {
  key: string;
  type: "strength" | "cardio";
  exercise_id: string | null;
  name: string;
  equipment: Equipment | null;
  sets: number;
  reps_min: number | null;
  reps_max: number | null;
  rest_seconds: number | null;
  superset_group: string | null;
  duration_minutes: number | null;
  notes: string | null;
  skipped: boolean;
  /** Set when swapped in for today; holds the program's original name. */
  swapped_from?: string | null;
}

export interface SessionRow {
  id: string;
  user_id: string;
  program_id: string | null;
  program_day_id: string | null;
  day_key: string | null;
  name: string;
  plan: PlanItem[];
  started_at: string;
  finished_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at?: string;
  deleted_at: string | null;
}

export interface SetRow {
  id: string;
  user_id: string;
  session_id: string;
  exercise_id: string;
  /** The plan item this set was logged against (PlanItem.key). */
  item_key: string | null;
  set_number: number;
  /** Per dumbbell for dumbbell exercises; added weight for bodyweight. */
  weight_kg: number;
  reps: number;
  note: string | null;
  logged_at: string;
  updated_at?: string;
  deleted_at: string | null;
}

export interface CardioRow {
  id: string;
  user_id: string;
  session_id: string;
  item_key: string | null;
  name: string;
  duration_min: number;
  incline: number | null;
  speed_kmh: number | null;
  distance_km: number | null;
  logged_at: string;
  updated_at?: string;
  deleted_at: string | null;
}

export interface ProfileRow {
  id: string;
  display_name?: string | null;
  timezone: string;
  updated_at?: string;
}

export type GoalType = "steps" | "active_energy" | "exercise_minutes" | "protein" | "water" | "custom";

export interface DailyGoalRow {
  id: string;
  user_id: string;
  type: GoalType;
  label: string;
  /** Fixed target; null when derived (protein per kg of body weight). */
  target: number | null;
  target_per_kg: number | null;
  unit: string;
  /** "auto" goals take their value from Apple Health when it's there. */
  source: "auto" | "manual";
  sort: number;
  hidden: boolean;
  created_at: string;
  updated_at?: string;
  deleted_at: string | null;
}

export interface DailyEntryRow {
  id: string;
  user_id: string;
  goal_id: string;
  /** Local calendar day, YYYY-MM-DD. */
  date: string;
  value: number;
  created_at: string;
  updated_at?: string;
  deleted_at: string | null;
}

export interface HealthSampleRow {
  id: string;
  user_id: string;
  metric: string;
  value: number;
  unit: string;
  recorded_at: string;
  local_date: string | null;
  source: string | null;
  created_at: string;
  updated_at?: string;
  deleted_at: string | null;
}

export interface IngestTokenRow {
  id: string;
  user_id: string;
  /** SHA-256 of the token; the token itself is shown once and never stored. */
  token_hash: string;
  label: string | null;
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
  updated_at?: string;
}

export interface HealthWorkoutRow {
  id: string;
  user_id: string;
  external_id: string;
  name: string;
  started_at: string;
  ended_at: string;
  duration_s: number | null;
  active_kcal: number | null;
  avg_hr: number | null;
  max_hr: number | null;
  source: string | null;
  created_at: string;
  updated_at?: string;
  deleted_at: string | null;
}

export const SYNCED_TABLES = [
  "profiles",
  "programs",
  "program_versions",
  "program_days",
  "exercises",
  "exercise_aliases",
  "program_items",
  "sessions",
  "sets",
  "cardio_entries",
  "daily_goals",
  "daily_entries",
  "health_samples",
  "ingest_tokens",
  "health_workouts",
] as const;
export type SyncedTable = (typeof SYNCED_TABLES)[number];

export interface RowMap {
  profiles: ProfileRow;
  programs: ProgramRow;
  program_versions: ProgramVersionRow;
  program_days: ProgramDayRow;
  program_items: ProgramItemRow;
  exercises: ExerciseRow;
  exercise_aliases: ExerciseAliasRow;
  sessions: SessionRow;
  sets: SetRow;
  cardio_entries: CardioRow;
  daily_goals: DailyGoalRow;
  daily_entries: DailyEntryRow;
  health_samples: HealthSampleRow;
  ingest_tokens: IngestTokenRow;
  health_workouts: HealthWorkoutRow;
}

/** A row paired with its table, for writing several tables in one go. */
export type TableRow = { [T in SyncedTable]: [T, RowMap[T]] }[SyncedTable];
