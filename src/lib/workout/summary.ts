import type { CardioRow, SessionRow, SetRow } from "@/lib/db/types";
import { prKinds, setVolume, type PrKind } from "./stats";
import { startOfWeek } from "./schedule";

export interface SessionPr {
  setId: string;
  exerciseId: string;
  weightKg: number;
  reps: number;
  kinds: PrKind[];
}

/**
 * PRs for every set in `sessionSets`, judged against all earlier sets of the
 * same exercise (other sessions and earlier sets today). The first session of
 * an exercise has no PRs: working up to a weight on day one isn't a record.
 */
export function prsForSets(sessionSets: SetRow[], allSetsByExercise: Map<string, SetRow[]>): Map<string, PrKind[]> {
  const out = new Map<string, PrKind[]>();
  for (const s of sessionSets) {
    const earlier = (allSetsByExercise.get(s.exercise_id) ?? []).filter(
      (o) => o.id !== s.id && !o.deleted_at && (o.logged_at < s.logged_at || (o.logged_at === s.logged_at && o.id < s.id)),
    );
    if (!earlier.some((o) => o.session_id !== s.session_id)) continue;
    const kinds = prKinds(s, earlier);
    if (kinds.length) out.set(s.id, kinds);
  }
  return out;
}

export interface SessionSummary {
  durationMin: number;
  volumeKg: number;
  setCount: number;
  cardioMin: number;
  prs: SessionPr[];
}

export function summarise(session: SessionRow, sets: SetRow[], cardio: CardioRow[], prs: Map<string, PrKind[]>): SessionSummary {
  const live = sets.filter((s) => !s.deleted_at);
  const end = session.finished_at ? new Date(session.finished_at) : new Date();
  return {
    durationMin: Math.max(1, Math.round((end.getTime() - new Date(session.started_at).getTime()) / 60000)),
    volumeKg: Math.round(live.reduce((n, s) => n + setVolume(s.weight_kg, s.reps), 0)),
    setCount: live.length,
    cardioMin: Math.round(cardio.filter((c) => !c.deleted_at).reduce((n, c) => n + c.duration_min, 0)),
    prs: live
      .filter((s) => prs.has(s.id))
      .map((s) => ({ setId: s.id, exerciseId: s.exercise_id, weightKg: s.weight_kg, reps: s.reps, kinds: prs.get(s.id)! })),
  };
}

/**
 * An encouraging line for the finish screen. It never compares against last
 * time: a lighter day is framed around showing up.
 */
export function encouragement(opts: { prCount: number; sessionsThisWeek: number; totalSessions: number }): string {
  const { prCount, sessionsThisWeek, totalSessions } = opts;
  if (totalSessions <= 1) return "First workout in the books. Great start.";
  if (prCount > 1) return `${prCount} new PRs today. The work is paying off.`;
  if (prCount === 1) return "A new PR today. The work is paying off.";
  if (sessionsThisWeek >= 2) return `That's ${sessionsThisWeek} sessions this week. Consistency is what builds results.`;
  return "Workout done. Showing up is what builds results.";
}

export function countThisWeek(sessions: SessionRow[], now: Date): number {
  const start = startOfWeek(now).getTime();
  return sessions.filter((s) => s.finished_at && !s.deleted_at && new Date(s.started_at).getTime() >= start).length;
}
