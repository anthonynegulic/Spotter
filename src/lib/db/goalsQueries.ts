import { addDays } from "@/lib/goals/goals";
import { db } from "./local";
import type { DailyEntryRow, DailyGoalRow, HealthSampleRow } from "./types";

export interface GoalsData {
  goals: DailyGoalRow[];
  entries: DailyEntryRow[];
  samples: HealthSampleRow[];
}

/** Goals plus entries and health samples for the last ~6 weeks (enough for streaks and history). */
export async function loadGoals(today: string): Promise<GoalsData> {
  const from = addDays(today, -60);
  const [goals, entries, samples] = await Promise.all([
    db.daily_goals.toArray(),
    db.daily_entries.where("date").aboveOrEqual(from).toArray(),
    db.health_samples.toArray(),
  ]);
  return {
    goals: goals.filter((g) => !g.deleted_at).sort((a, b) => a.sort - b.sort),
    entries: entries.filter((e) => !e.deleted_at),
    samples: samples.filter((s) => !s.deleted_at),
  };
}
