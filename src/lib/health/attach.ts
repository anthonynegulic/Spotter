import type { HealthWorkoutRow, SessionRow } from "@/lib/db/types";

/**
 * The Watch workout recorded during a logged session, if any: the one that
 * overlaps it most, as long as the overlap is at least 5 minutes or half the
 * Watch workout (BRIEF.md §5.6, "attach by time overlap").
 */
export function matchWorkout(session: Pick<SessionRow, "started_at" | "finished_at">, workouts: HealthWorkoutRow[], now = Date.now()): HealthWorkoutRow | null {
  const s0 = new Date(session.started_at).getTime();
  const s1 = session.finished_at ? new Date(session.finished_at).getTime() : now;
  // Sessions start on the first logged set; the Watch is usually started a little before.
  const from = s0 - 15 * 60_000;
  let best: { w: HealthWorkoutRow; overlap: number } | null = null;
  for (const w of workouts) {
    if (w.deleted_at) continue;
    const w0 = new Date(w.started_at).getTime();
    const w1 = new Date(w.ended_at).getTime();
    const overlap = Math.min(s1, w1) - Math.max(from, w0);
    if (overlap <= 0) continue;
    const enough = overlap >= 5 * 60_000 || overlap >= (w1 - w0) / 2;
    if (enough && (!best || overlap > best.overlap)) best = { w, overlap };
  }
  return best?.w ?? null;
}
