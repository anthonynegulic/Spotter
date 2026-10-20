import type { DailyEntryRow, DailyGoalRow, GoalType, HealthSampleRow } from "@/lib/db/types";

/** Daily goals maths (BRIEF.md §5.7). Pure functions; days are local YYYY-MM-DD keys. */

export interface GoalDefault {
  type: GoalType;
  label: string;
  target: number | null;
  targetPerKg: number | null;
  unit: string;
  source: "auto" | "manual";
  quickAdds: number[];
}

/** The starting set. Every target is editable; protein follows body weight. */
export const DEFAULT_GOALS: GoalDefault[] = [
  { type: "steps", label: "Steps", target: 10_000, targetPerKg: null, unit: "steps", source: "auto", quickAdds: [] },
  { type: "active_energy", label: "Active calories", target: 500, targetPerKg: null, unit: "kcal", source: "auto", quickAdds: [] },
  { type: "exercise_minutes", label: "Exercise minutes", target: 30, targetPerKg: null, unit: "min", source: "auto", quickAdds: [] },
  { type: "protein", label: "Protein", target: null, targetPerKg: 2, unit: "g", source: "manual", quickAdds: [20, 30] },
  { type: "water", label: "Water", target: 2500, targetPerKg: null, unit: "ml", source: "manual", quickAdds: [250, 500] },
];

/** Protein target when there's no weight yet to work it out from. */
export const PROTEIN_FALLBACK_G = 150;

/** The Apple Health metric that feeds each automatic goal (milestone D). */
export const AUTO_METRIC: Partial<Record<GoalType, string>> = {
  steps: "step_count",
  active_energy: "active_energy",
  exercise_minutes: "apple_exercise_time",
};

export function quickAddsFor(goal: Pick<DailyGoalRow, "type">): number[] {
  return DEFAULT_GOALS.find((d) => d.type === goal.type)?.quickAdds ?? [];
}

/** Local calendar day of `d` as YYYY-MM-DD. */
export function dayKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function addDays(key: string, n: number): string {
  const [y, m, d] = key.split("-").map(Number);
  return dayKey(new Date(y, m - 1, d + n));
}

export function keyToDate(key: string): Date {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
}

/** Most recent body weight in kg, from Apple Health or entered by hand. */
export function latestWeight(samples: HealthSampleRow[]): { kg: number; at: string; source: string | null } | null {
  const w = samples
    .filter((s) => s.metric === "body_mass" && !s.deleted_at)
    .sort((a, b) => b.recorded_at.localeCompare(a.recorded_at))[0];
  return w ? { kg: w.value, at: w.recorded_at, source: w.source } : null;
}

/** Target for a goal: fixed, or grams per kg (rounded to 5 g) for protein. */
export function goalTarget(goal: DailyGoalRow, weightKg: number | null): number {
  if (goal.target_per_kg) {
    if (weightKg) return Math.round((goal.target_per_kg * weightKg) / 5) * 5;
    return goal.target ?? PROTEIN_FALLBACK_G;
  }
  return goal.target ?? 1;
}

export interface DayValue {
  value: number;
  /** Where today's number came from. */
  from: "health" | "manual" | "none";
}

/**
 * A goal's value for a day. Automatic goals use Apple Health's daily total
 * when there is one, otherwise what was entered by hand; manual goals sum
 * their entries.
 */
export function dayValue(goal: DailyGoalRow, day: string, entries: DailyEntryRow[], samples: HealthSampleRow[]): DayValue {
  const metric = goal.source === "auto" ? AUTO_METRIC[goal.type] : undefined;
  if (metric) {
    const sample = samples.find((s) => s.metric === metric && s.local_date === day && !s.deleted_at);
    if (sample) return { value: sample.value, from: "health" };
  }
  const own = entries.filter((e) => e.goal_id === goal.id && e.date === day && !e.deleted_at);
  if (own.length === 0) return { value: 0, from: "none" };
  return { value: Math.round(own.reduce((n, e) => n + e.value, 0) * 100) / 100, from: "manual" };
}

export function isMet(value: number, target: number): boolean {
  return target > 0 && value >= target;
}

/**
 * Consecutive days the goal was met, ending today, or yesterday if today
 * isn't done yet (a day still in progress doesn't break a streak).
 */
export function streak(metOn: (day: string) => boolean, today: string, startedOn: string): number {
  let day = metOn(today) ? today : addDays(today, -1);
  let n = 0;
  while (day >= startedOn && metOn(day)) {
    n++;
    day = addDays(day, -1);
  }
  return n;
}

/** The last `n` days, oldest first, ending today. */
export function lastDays(today: string, n: number): string[] {
  return Array.from({ length: n }, (_, i) => addDays(today, i - n + 1));
}

export function formatAmount(v: number, unit: string): string {
  const n = Math.round(v);
  const text = n.toLocaleString("en-AU");
  if (unit === "steps") return text;
  if (unit === "ml" && n >= 1000) return `${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1)} L`;
  return `${text} ${unit}`;
}
