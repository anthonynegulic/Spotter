import { db } from "./local";
import type { ExerciseRow, SessionRow, SetRow } from "./types";
import { activeProgramId, loadProgramTree } from "./queries";
import { isCalendarProgram } from "@/lib/workout/schedule";

export interface ProgressData {
  sessions: SessionRow[];
  sets: SetRow[];
  exercises: Map<string, ExerciseRow>;
  liveSessionIds: Set<string>;
  /** Sessions a week the active program asks for, if it runs on fixed days. */
  weeklyTarget: number | null;
}

/** Everything the Progress tab needs, from the local cache. Small enough to load whole. */
export async function loadProgress(): Promise<ProgressData> {
  const sessions = (await db.sessions.toArray()).filter((s) => !s.deleted_at);
  const liveSessionIds = new Set(sessions.map((s) => s.id));
  const sets = (await db.sets.toArray()).filter((s) => !s.deleted_at && liveSessionIds.has(s.session_id));
  const exercises = new Map((await db.exercises.toArray()).filter((e) => !e.deleted_at).map((e) => [e.id, e]));
  const programId = await activeProgramId();
  const tree = programId ? await loadProgramTree(programId) : null;
  const weeklyTarget = tree && isCalendarProgram(tree.days) ? tree.days.length : null;
  return { sessions, sets, exercises, liveSessionIds, weeklyTarget };
}
