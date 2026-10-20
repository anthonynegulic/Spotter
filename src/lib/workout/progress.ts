import type { SessionSets } from "@/lib/db/repo";
import type { SessionRow, SetRow } from "@/lib/db/types";
import { startOfLocalDay, startOfWeek } from "./schedule";
import { estimated1RM, formatKg, prKinds, setVolume, type PrKind } from "./stats";

/** Progress maths for charts, stat tiles and PR lists (BRIEF.md §5.8). Pure functions. */

export type Range = "4w" | "3m" | "6m" | "all";
export const RANGES: { key: Range; label: string }[] = [
  { key: "4w", label: "4W" },
  { key: "3m", label: "3M" },
  { key: "6m", label: "6M" },
  { key: "all", label: "All" },
];

export function rangeStart(range: Range, now: Date): Date | null {
  const d = startOfLocalDay(now);
  if (range === "4w") d.setDate(d.getDate() - 27);
  else if (range === "3m") d.setMonth(d.getMonth() - 3);
  else if (range === "6m") d.setMonth(d.getMonth() - 6);
  else return null;
  return d;
}

export interface ExercisePoint {
  sessionId: string;
  /** Epoch ms of the session start. */
  t: number;
  /** Best estimated 1RM of the session (Epley, best set). */
  e1rm: number;
  /** Heaviest weight lifted that session, and its reps. */
  topSet: number;
  topSetReps: number;
  volume: number;
}

/** One point per session that has sets, oldest first. */
export function exercisePoints(history: SessionSets[]): ExercisePoint[] {
  return history
    .filter((h) => h.sets.length > 0)
    .map((h) => {
      let e1rm = 0;
      let top = h.sets[0];
      let volume = 0;
      for (const s of h.sets) {
        e1rm = Math.max(e1rm, estimated1RM(s.weight_kg, s.reps));
        if (s.weight_kg > top.weight_kg || (s.weight_kg === top.weight_kg && s.reps > top.reps)) top = s;
        volume += setVolume(s.weight_kg, s.reps);
      }
      return {
        sessionId: h.session.id,
        t: new Date(h.session.started_at).getTime(),
        e1rm: Math.round(e1rm * 10) / 10,
        topSet: top.weight_kg,
        topSetReps: top.reps,
        volume: Math.round(volume),
      };
    })
    .sort((a, b) => a.t - b.t);
}

export function inRange<T extends { t: number }>(points: T[], range: Range, now: Date): T[] {
  const start = rangeStart(range, now);
  return start ? points.filter((p) => p.t >= start.getTime()) : points;
}

/**
 * Change across the range: last value minus first. Shown whichever way it
 * goes (a drop is worth seeing too). Null with fewer than two points.
 */
export function change(points: { t: number; value: number }[]): { delta: number; since: number } | null {
  if (points.length < 2) return null;
  const first = points[0];
  const last = points[points.length - 1];
  return { delta: Math.round((last.value - first.value) * 10) / 10, since: first.t };
}

export interface ExerciseStats {
  heaviest: { weight: number; reps: number } | null;
  bestSet: { weight: number; reps: number; e1rm: number } | null;
  sessions: number;
}

export function exerciseStats(history: SessionSets[]): ExerciseStats {
  let heaviest: ExerciseStats["heaviest"] = null;
  let bestSet: ExerciseStats["bestSet"] = null;
  let sessions = 0;
  for (const h of history) {
    if (h.sets.length === 0) continue;
    sessions++;
    for (const s of h.sets) {
      if (s.reps <= 0) continue;
      if (!heaviest || s.weight_kg > heaviest.weight || (s.weight_kg === heaviest.weight && s.reps > heaviest.reps)) {
        heaviest = { weight: s.weight_kg, reps: s.reps };
      }
      const e = estimated1RM(s.weight_kg, s.reps);
      if (!bestSet || e > bestSet.e1rm) bestSet = { weight: s.weight_kg, reps: s.reps, e1rm: e };
    }
  }
  return { heaviest, bestSet, sessions };
}

export interface WeekBucket {
  /** Epoch ms of the Monday the week starts on. */
  t: number;
  sessions: number;
  volume: number;
}

/** Sessions and volume per week across the range, including empty weeks, oldest first. */
export function weeklyBuckets(sessions: SessionRow[], sets: SetRow[], range: Range, now: Date): WeekBucket[] {
  const done = sessions.filter((s) => s.finished_at && !s.deleted_at);
  const start = rangeStart(range, now) ?? (done.length ? new Date(Math.min(...done.map((s) => new Date(s.started_at).getTime()))) : now);
  const buckets = new Map<number, WeekBucket>();
  for (let w = startOfWeek(start); w.getTime() <= now.getTime(); w.setDate(w.getDate() + 7)) {
    buckets.set(w.getTime(), { t: w.getTime(), sessions: 0, volume: 0 });
  }
  const weekOf = (iso: string) => startOfWeek(new Date(iso)).getTime();
  const doneIds = new Set<string>();
  for (const s of done) {
    const b = buckets.get(weekOf(s.started_at));
    if (b) {
      b.sessions++;
      doneIds.add(s.id);
    }
  }
  const sessionWeek = new Map(done.map((s) => [s.id, weekOf(s.started_at)]));
  for (const set of sets) {
    if (set.deleted_at || !doneIds.has(set.session_id)) continue;
    const b = buckets.get(sessionWeek.get(set.session_id)!);
    if (b) b.volume += setVolume(set.weight_kg, set.reps);
  }
  return [...buckets.values()].map((b) => ({ ...b, volume: Math.round(b.volume) }));
}

export interface PrEvent {
  set: SetRow;
  kinds: PrKind[];
  e1rm: number;
}

/**
 * Every PR ever set, newest first. Same rules as during a workout: beats all
 * earlier sets of the exercise, and never in the exercise's first session.
 */
export function allPrs(sets: SetRow[], liveSessionIds: Set<string>): PrEvent[] {
  const byExercise = new Map<string, SetRow[]>();
  for (const s of sets) {
    if (s.deleted_at || !liveSessionIds.has(s.session_id)) continue;
    const list = byExercise.get(s.exercise_id) ?? [];
    list.push(s);
    byExercise.set(s.exercise_id, list);
  }
  const out: PrEvent[] = [];
  for (const list of byExercise.values()) {
    list.sort((a, b) => a.logged_at.localeCompare(b.logged_at) || a.id.localeCompare(b.id));
    const earlier: SetRow[] = [];
    for (const s of list) {
      if (earlier.some((e) => e.session_id !== s.session_id)) {
        const kinds = prKinds(s, earlier);
        if (kinds.length) out.push({ set: s, kinds, e1rm: Math.round(estimated1RM(s.weight_kg, s.reps) * 10) / 10 });
      }
      earlier.push(s);
    }
  }
  return out.sort((a, b) => b.set.logged_at.localeCompare(a.set.logged_at));
}

/** "80 × 8 · 8 · 7" when the weight is the same throughout, otherwise "80 × 8 · 82.5 × 7". */
export function formatSetList(sets: Pick<SetRow, "weight_kg" | "reps">[]): string {
  if (sets.length === 0) return "";
  if (new Set(sets.map((s) => s.weight_kg)).size === 1) {
    return `${formatKg(sets[0].weight_kg)} × ${sets.map((s) => s.reps).join(" · ")}`;
  }
  return sets.map((s) => `${formatKg(s.weight_kg)} × ${s.reps}`).join(" · ");
}

/** "Today", "Yesterday", "Thu" within the last week, else "12 Oct" (with the year if it's not this year). */
export function relativeDay(when: Date, now: Date, withWeekday = false): string {
  const days = Math.round((startOfLocalDay(now).getTime() - startOfLocalDay(when).getTime()) / 86_400_000);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days > 1 && days < 7 && !withWeekday) return when.toLocaleDateString("en-AU", { weekday: "short" });
  return when.toLocaleDateString("en-AU", {
    ...(withWeekday ? { weekday: "short" } : {}),
    day: "numeric",
    month: "short",
    ...(when.getFullYear() !== now.getFullYear() ? { year: "numeric" } : {}),
  }).replace(",", "");
}

/** "since July", or "since 5 Oct" when the range is short or starts this month. */
export function sinceLabel(since: number, range: Range, now: Date): string {
  const d = new Date(since);
  if (range === "4w" || (d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear())) {
    return `since ${d.toLocaleDateString("en-AU", { day: "numeric", month: "short" })}`;
  }
  return `since ${d.toLocaleDateString("en-AU", { month: "long", ...(d.getFullYear() !== now.getFullYear() ? { year: "numeric" } : {}) })}`;
}
