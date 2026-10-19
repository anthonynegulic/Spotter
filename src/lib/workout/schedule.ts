/**
 * Which program day "Today" opens to (BRIEF.md §5.3, decisions in DECISIONS.md).
 *
 * - Calendar programs (every day has a dayOfWeek): today's day if one is
 *   scheduled, otherwise a rest day. Missed days earlier this week are
 *   offered first when choosing a workout anyway.
 * - Rotations: the day after the last one completed, wrapping around.
 */

export interface ScheduleDay {
  id: string;
  day_key: string;
  day_of_week: number | null;
  sort: number;
}

export interface CompletedSession {
  day_key: string | null;
  started_at: string;
}

export type TodayPlan =
  | { kind: "workout"; dayId: string }
  | { kind: "rest" };

/** 1 = Monday … 7 = Sunday, in local time. */
export function isoWeekday(d: Date): number {
  return ((d.getDay() + 6) % 7) + 1;
}

export function startOfLocalDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export function startOfWeek(d: Date): Date {
  const s = startOfLocalDay(d);
  s.setDate(s.getDate() - (isoWeekday(d) - 1));
  return s;
}

export function isCalendarProgram(days: ScheduleDay[]): boolean {
  return days.length > 0 && days.every((d) => d.day_of_week !== null);
}

export function planToday(days: ScheduleDay[], completed: CompletedSession[], now: Date): TodayPlan {
  const sorted = [...days].sort((a, b) => a.sort - b.sort);
  if (sorted.length === 0) return { kind: "rest" };

  if (isCalendarProgram(sorted)) {
    const today = sorted.find((d) => d.day_of_week === isoWeekday(now));
    return today ? { kind: "workout", dayId: today.id } : { kind: "rest" };
  }

  const last = [...completed]
    .filter((s) => s.day_key && sorted.some((d) => d.day_key === s.day_key))
    .sort((a, b) => b.started_at.localeCompare(a.started_at))[0];
  if (!last) return { kind: "workout", dayId: sorted[0].id };
  const idx = sorted.findIndex((d) => d.day_key === last.day_key);
  return { kind: "workout", dayId: sorted[(idx + 1) % sorted.length].id };
}

/** Calendar days scheduled earlier this week that have no session yet. */
export function missedThisWeek(days: ScheduleDay[], completed: CompletedSession[], now: Date): string[] {
  if (!isCalendarProgram(days)) return [];
  const weekStart = startOfWeek(now).getTime();
  const todayNum = isoWeekday(now);
  const doneKeys = new Set(
    completed.filter((s) => new Date(s.started_at).getTime() >= weekStart).map((s) => s.day_key),
  );
  return [...days]
    .filter((d) => d.day_of_week !== null && d.day_of_week < todayNum && !doneKeys.has(d.day_key))
    .sort((a, b) => (a.day_of_week ?? 0) - (b.day_of_week ?? 0))
    .map((d) => d.id);
}

/** "Week 3 of 8": weeks since the program was made active, starting at 1. */
export function programWeek(activatedAt: string | null, now: Date): number {
  if (!activatedAt) return 1;
  const start = startOfWeek(new Date(activatedAt)).getTime();
  const diff = startOfWeek(now).getTime() - start;
  return Math.max(1, Math.round(diff / (7 * 24 * 3600 * 1000)) + 1);
}

export function isSameLocalDay(a: Date, b: Date): boolean {
  return startOfLocalDay(a).getTime() === startOfLocalDay(b).getTime();
}
