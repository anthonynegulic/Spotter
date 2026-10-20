import Dexie, { type EntityTable } from "dexie";
import type {
  CardioRow,
  DailyEntryRow,
  DailyGoalRow,
  HealthSampleRow,
  ExerciseAliasRow,
  ExerciseRow,
  ProfileRow,
  ProgramDayRow,
  ProgramItemRow,
  ProgramRow,
  ProgramVersionRow,
  SessionRow,
  SetRow,
  SyncedTable,
} from "./types";

/** A queued write waiting to reach Supabase. Applied in `seq` order. */
export interface OutboxEntry {
  seq?: number;
  table: SyncedTable;
  row_id: string;
  payload: Record<string, unknown>;
  attempts: number;
  last_error?: string;
}

export interface MetaEntry {
  key: string;
  value: unknown;
}

/**
 * Local cache and write queue. Every write lands here first, so logging works
 * with no signal; the sync engine pushes the outbox to Supabase and pulls
 * changes back. Supabase stays the source of truth.
 */
export class SpotterDB extends Dexie {
  profiles!: EntityTable<ProfileRow, "id">;
  programs!: EntityTable<ProgramRow, "id">;
  program_versions!: EntityTable<ProgramVersionRow, "id">;
  program_days!: EntityTable<ProgramDayRow, "id">;
  program_items!: EntityTable<ProgramItemRow, "id">;
  exercises!: EntityTable<ExerciseRow, "id">;
  exercise_aliases!: EntityTable<ExerciseAliasRow, "id">;
  sessions!: EntityTable<SessionRow, "id">;
  sets!: EntityTable<SetRow, "id">;
  cardio_entries!: EntityTable<CardioRow, "id">;
  daily_goals!: EntityTable<DailyGoalRow, "id">;
  daily_entries!: EntityTable<DailyEntryRow, "id">;
  health_samples!: EntityTable<HealthSampleRow, "id">;
  outbox!: EntityTable<OutboxEntry, "seq">;
  meta!: EntityTable<MetaEntry, "key">;

  constructor(name = "spotter") {
    super(name);
    this.version(1).stores({
      profiles: "id",
      programs: "id",
      program_versions: "id, program_id",
      program_days: "id, program_version_id",
      program_items: "id, program_day_id, exercise_id",
      exercises: "id",
      exercise_aliases: "id, exercise_id",
      sessions: "id, started_at, program_id",
      sets: "id, session_id, exercise_id",
      cardio_entries: "id, session_id",
      outbox: "++seq, [table+row_id]",
      meta: "key",
    });
    this.version(2).stores({
      daily_goals: "id",
      daily_entries: "id, goal_id, date",
      health_samples: "id, metric, local_date",
    });
  }
}

export const db = new SpotterDB();

export async function getMeta<T>(key: string): Promise<T | undefined> {
  return (await db.meta.get(key))?.value as T | undefined;
}

export async function setMeta(key: string, value: unknown): Promise<void> {
  await db.meta.put({ key, value });
}
