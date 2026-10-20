import { DEFAULT_GOALS, dayKey } from "@/lib/goals/goals";
import { db, getMeta } from "./local";
import type { DailyEntryRow, DailyGoalRow, HealthSampleRow, TableRow } from "./types";
import { newId, nowIso, saveRow, saveRows } from "./write";

/**
 * A UUID derived from a seed, so every phone creates the same id for the same
 * default goal and the rows merge on sync instead of duplicating.
 */
export async function stableId(seed: string): Promise<string> {
  const bytes = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(seed))).slice(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x80; // version 8: custom
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // RFC 4122 variant
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/**
 * Creates the default goals the first time. Waits until goals have been pulled
 * from the server at least once (when signed in), so a second phone doesn't
 * push fresh defaults over targets edited on the first.
 */
export async function ensureDefaultGoals(userId: string, opts: { requirePull: boolean }): Promise<void> {
  if (opts.requirePull && !(await getMeta<string>("pulled:daily_goals"))) return;
  const existing = await db.daily_goals.toArray();
  const now = nowIso();
  const rows: TableRow[] = [];
  for (const [i, d] of DEFAULT_GOALS.entries()) {
    if (existing.some((g) => g.type === d.type)) continue;
    rows.push([
      "daily_goals",
      {
        id: await stableId(`${userId}:goal:${d.type}`),
        user_id: userId,
        type: d.type,
        label: d.label,
        target: d.target,
        target_per_kg: d.targetPerKg,
        unit: d.unit,
        source: d.source,
        sort: i,
        hidden: false,
        created_at: now,
        deleted_at: null,
      } satisfies DailyGoalRow,
    ]);
  }
  if (rows.length) await saveRows(rows);
}

export async function addEntry(goal: DailyGoalRow, date: string, value: number): Promise<void> {
  const row: DailyEntryRow = { id: newId(), user_id: goal.user_id, goal_id: goal.id, date, value, created_at: nowIso(), deleted_at: null };
  await saveRow("daily_entries", row);
}

export async function removeEntry(entry: DailyEntryRow): Promise<void> {
  await saveRow("daily_entries", { ...entry, deleted_at: nowIso() });
}

/** Replaces the day's manual entries with a single total (steps, calories, minutes typed in by hand). */
export async function setDayTotal(goal: DailyGoalRow, date: string, value: number | null): Promise<void> {
  const now = nowIso();
  const current = (await db.daily_entries.where("goal_id").equals(goal.id).toArray()).filter((e) => e.date === date && !e.deleted_at);
  const rows: TableRow[] = current.map((e) => ["daily_entries", { ...e, deleted_at: now }] as TableRow);
  if (value !== null && value > 0) {
    rows.push(["daily_entries", { id: newId(), user_id: goal.user_id, goal_id: goal.id, date, value, created_at: now, deleted_at: null }]);
  }
  if (rows.length) await saveRows(rows);
}

/** Yes/no goals: done is one entry of 1. */
export async function toggleDone(goal: DailyGoalRow, date: string, done: boolean): Promise<void> {
  await setDayTotal(goal, date, done ? 1 : null);
}

export async function updateGoal(goal: DailyGoalRow, patch: Partial<DailyGoalRow>): Promise<void> {
  const fresh = (await db.daily_goals.get(goal.id)) ?? goal;
  await saveRow("daily_goals", { ...fresh, ...patch });
}

export async function addCustomGoal(userId: string, label: string, sort: number): Promise<void> {
  await saveRow("daily_goals", {
    id: newId(), user_id: userId, type: "custom", label: label.trim(), target: 1, target_per_kg: null, unit: "done",
    source: "manual", sort, hidden: false, created_at: nowIso(), deleted_at: null,
  });
}

export async function deleteGoal(goal: DailyGoalRow): Promise<void> {
  await saveRow("daily_goals", { ...goal, deleted_at: nowIso() });
}

export async function reorderGoals(goals: DailyGoalRow[]): Promise<void> {
  await saveRows(goals.map((g, i) => ["daily_goals", { ...g, sort: i }] as TableRow));
}

/** A body weight typed in by hand, until Apple Health is connected. */
export async function setManualWeight(userId: string, kg: number): Promise<void> {
  const now = new Date();
  const row: HealthSampleRow = {
    id: newId(), user_id: userId, metric: "body_mass", value: kg, unit: "kg", recorded_at: now.toISOString(),
    local_date: dayKey(now), source: "manual", created_at: now.toISOString(), deleted_at: null,
  };
  await saveRow("health_samples", row);
}
