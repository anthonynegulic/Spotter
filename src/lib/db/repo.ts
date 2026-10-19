import { matchExercise, simple, type MatchCandidate } from "@/lib/exercises/match";
import { DAYS_OF_WEEK, type Equipment, type Program } from "@/lib/program/schema";
import { DEFAULT_INCREMENT } from "@/lib/workout/equipment";
import { db } from "./local";
import type {
  CardioRow,
  ExerciseAliasRow,
  ExerciseRow,
  PlanItem,
  ProgramDayRow,
  ProgramItemRow,
  ProgramRow,
  ProgramVersionRow,
  SessionRow,
  SetRow,
  TableRow,
} from "./types";
import { newId, nowIso, saveRow, saveRows } from "./write";

type Pending = TableRow[];

// Programs -------------------------------------------------------------------

/** Saves an imported program as a new program (version 1), matching exercises silently. */
export async function importProgram(opts: {
  program: Program;
  raw: unknown;
  userId: string;
  makeActive: boolean;
}): Promise<string> {
  const { program, raw, userId, makeActive } = opts;
  const now = nowIso();
  const rows: Pending = [];

  const programId = newId();
  if (makeActive) rows.push(...(await deactivateOthers(programId)));
  rows.push([
    "programs",
    { id: programId, user_id: userId, name: program.name, is_active: makeActive, activated_at: makeActive ? now : null, created_at: now, deleted_at: null } satisfies ProgramRow,
  ]);
  const versionId = newId();
  rows.push([
    "program_versions",
    {
      id: versionId, user_id: userId, program_id: programId, version: 1, schema_version: program.schemaVersion,
      author: program.author ?? null, weeks: program.weeks ?? null, progression_notes: program.progressionNotes ?? null,
      raw_json: raw, created_at: now,
    } satisfies ProgramVersionRow,
  ]);

  const candidates = await loadCandidates();
  const exerciseRows: Pending = [];
  const aliasRows: Pending = [];
  const itemRows: Pending = [];

  const resolveExercise = (name: string, equipment: Equipment): string => {
    const match = matchExercise(name, equipment, candidates);
    if (match) {
      const c = candidates.find((x) => x.id === match.id)!;
      const alias = simple(name);
      if (alias !== simple(c.name) && !c.aliases.some((a) => simple(a) === alias)) {
        c.aliases.push(alias);
        aliasRows.push(["exercise_aliases", { id: newId(), user_id: userId, exercise_id: c.id, alias, created_at: now } satisfies ExerciseAliasRow]);
      }
      return c.id;
    }
    const id = newId();
    exerciseRows.push([
      "exercises",
      { id, user_id: userId, name, equipment, increment_kg: DEFAULT_INCREMENT[equipment], library_ref: null, created_at: now, deleted_at: null } satisfies ExerciseRow,
    ]);
    candidates.push({ id, name, equipment, aliases: [] });
    return id;
  };

  program.days.forEach((day, dayIndex) => {
    const dayId = newId();
    rows.push([
      "program_days",
      {
        id: dayId, user_id: userId, program_version_id: versionId, day_key: day.id, name: day.name,
        day_of_week: day.dayOfWeek ? DAYS_OF_WEEK.indexOf(day.dayOfWeek) + 1 : null, sort: dayIndex,
      } satisfies ProgramDayRow,
    ]);
    day.items.forEach((item, itemIndex) => {
      const base = { id: newId(), user_id: userId, program_day_id: dayId, name: item.name, sort: itemIndex, notes: item.notes ?? null };
      if (item.type === "strength") {
        itemRows.push([
          "program_items",
          {
            ...base, type: "strength", exercise_id: resolveExercise(item.name, item.equipment), equipment: item.equipment,
            sets: item.sets, reps_min: item.repsMin, reps_max: item.repsMax, rest_seconds: item.restSeconds ?? null,
            superset_group: item.supersetGroup, duration_minutes: null,
          } satisfies ProgramItemRow,
        ]);
      } else {
        itemRows.push([
          "program_items",
          {
            ...base, type: "cardio", exercise_id: null, equipment: null, sets: null, reps_min: null, reps_max: null,
            rest_seconds: null, superset_group: null, duration_minutes: item.durationMinutes,
          } satisfies ProgramItemRow,
        ]);
      }
    });
  });

  await saveRows([...rows, ...exerciseRows, ...aliasRows, ...itemRows]);
  return programId;
}

export async function setActiveProgram(programId: string): Promise<void> {
  const program = await db.programs.get(programId);
  if (!program) return;
  await saveRows([
    ...(await deactivateOthers(programId)),
    ["programs", { ...program, is_active: true, activated_at: nowIso() }],
  ]);
}

async function deactivateOthers(keepId: string): Promise<Pending> {
  const active = await db.programs.filter((p) => p.is_active && p.id !== keepId).toArray();
  return active.map((p) => ["programs", { ...p, is_active: false }] as TableRow);
}

async function loadCandidates(): Promise<MatchCandidate[]> {
  const [exercises, aliases] = await Promise.all([
    db.exercises.filter((e) => !e.deleted_at).toArray(),
    db.exercise_aliases.toArray(),
  ]);
  return exercises.map((e) => ({
    id: e.id,
    name: e.name,
    equipment: e.equipment,
    aliases: aliases.filter((a) => a.exercise_id === e.id).map((a) => a.alias),
  }));
}

/** Finds an exercise by name (same silent matching as import) or creates it. Used by swaps. */
export async function findOrCreateExercise(name: string, equipment: Equipment, userId: string): Promise<ExerciseRow> {
  const match = matchExercise(name, equipment, await loadCandidates());
  if (match) return (await db.exercises.get(match.id))!;
  const row: ExerciseRow = {
    id: newId(), user_id: userId, name: name.trim(), equipment, increment_kg: DEFAULT_INCREMENT[equipment],
    library_ref: null, created_at: nowIso(), deleted_at: null,
  };
  await saveRow("exercises", row);
  return row;
}

export async function setExerciseIncrement(exerciseId: string, incrementKg: number): Promise<void> {
  const ex = await db.exercises.get(exerciseId);
  if (ex && ex.increment_kg !== incrementKg) await saveRow("exercises", { ...ex, increment_kg: incrementKg });
}

// Sessions ---------------------------------------------------------------------

export function planFromItems(items: ProgramItemRow[]): PlanItem[] {
  return [...items]
    .sort((a, b) => a.sort - b.sort)
    .map((it) => ({
      key: it.id,
      type: it.type,
      exercise_id: it.exercise_id,
      name: it.name,
      equipment: it.equipment,
      sets: it.sets ?? 1,
      reps_min: it.reps_min,
      reps_max: it.reps_max,
      rest_seconds: it.rest_seconds,
      superset_group: it.superset_group,
      duration_minutes: it.duration_minutes,
      notes: it.notes,
      skipped: false,
    }));
}

export async function createSession(opts: {
  userId: string;
  programId: string | null;
  day: ProgramDayRow | null;
  name: string;
  plan: PlanItem[];
}): Promise<SessionRow> {
  const now = nowIso();
  const row: SessionRow = {
    id: newId(), user_id: opts.userId, program_id: opts.programId, program_day_id: opts.day?.id ?? null,
    day_key: opts.day?.day_key ?? null, name: opts.name, plan: opts.plan, started_at: now, finished_at: null,
    notes: null, created_at: now, deleted_at: null,
  };
  await saveRow("sessions", row);
  return row;
}

export async function updateSession(session: SessionRow, patch: Partial<SessionRow>): Promise<SessionRow> {
  const fresh = (await db.sessions.get(session.id)) ?? session;
  const row = { ...fresh, ...patch };
  await saveRow("sessions", row);
  return row;
}

export async function finishSession(session: SessionRow, at?: string): Promise<void> {
  await updateSession(session, { finished_at: at ?? nowIso() });
}

/** Discarding soft-deletes the session and everything logged in it. */
export async function discardSession(session: SessionRow): Promise<void> {
  const now = nowIso();
  const [sets, cardio] = await Promise.all([
    db.sets.where("session_id").equals(session.id).toArray(),
    db.cardio_entries.where("session_id").equals(session.id).toArray(),
  ]);
  await saveRows([
    ["sessions", { ...session, deleted_at: now }],
    ...sets.map((s) => ["sets", { ...s, deleted_at: now }] as TableRow),
    ...cardio.map((c) => ["cardio_entries", { ...c, deleted_at: now }] as TableRow),
  ]);
}

export async function logSet(opts: {
  userId: string;
  sessionId: string;
  exerciseId: string;
  itemKey: string;
  setNumber: number;
  weightKg: number;
  reps: number;
}): Promise<SetRow> {
  const row: SetRow = {
    id: newId(), user_id: opts.userId, session_id: opts.sessionId, exercise_id: opts.exerciseId, item_key: opts.itemKey,
    set_number: opts.setNumber, weight_kg: opts.weightKg, reps: opts.reps, note: null, logged_at: nowIso(), deleted_at: null,
  };
  await saveRow("sets", row);
  return row;
}

export async function updateSet(set: SetRow, patch: Partial<Pick<SetRow, "weight_kg" | "reps" | "note">>): Promise<void> {
  await saveRow("sets", { ...set, ...patch });
}

/** Deletes a set and renumbers the later ones so set numbers stay 1..n. */
export async function deleteSet(set: SetRow): Promise<void> {
  const now = nowIso();
  const later = (await db.sets.where("session_id").equals(set.session_id).toArray()).filter(
    (s) => !s.deleted_at && s.exercise_id === set.exercise_id && s.item_key === set.item_key && s.set_number > set.set_number,
  );
  await saveRows([
    ["sets", { ...set, deleted_at: now }],
    ...later.map((s) => ["sets", { ...s, set_number: s.set_number - 1 }] as TableRow),
  ]);
}

export async function saveCardio(row: Omit<CardioRow, "id" | "logged_at" | "deleted_at"> & { id?: string; logged_at?: string }): Promise<void> {
  await saveRow("cardio_entries", { ...row, id: row.id ?? newId(), logged_at: row.logged_at ?? nowIso(), deleted_at: null });
}

export async function deleteCardio(row: CardioRow): Promise<void> {
  await saveRow("cardio_entries", { ...row, deleted_at: nowIso() });
}

// History -------------------------------------------------------------------------

export interface SessionSets {
  session: SessionRow;
  sets: SetRow[];
}

/** Sets of an exercise from live (not deleted) sessions, oldest first. */
export async function exerciseHistory(exerciseId: string): Promise<SessionSets[]> {
  const sets = (await db.sets.where("exercise_id").equals(exerciseId).toArray()).filter((s) => !s.deleted_at);
  const sessionIds = [...new Set(sets.map((s) => s.session_id))];
  const sessions = (await db.sessions.bulkGet(sessionIds)).filter((s): s is SessionRow => !!s && !s.deleted_at);
  return sessions
    .map((session) => ({
      session,
      sets: sets.filter((s) => s.session_id === session.id).sort((a, b) => a.set_number - b.set_number),
    }))
    .sort((a, b) => a.session.started_at.localeCompare(b.session.started_at));
}

/**
 * "Last time": the most recent other session of this exercise on the same
 * program day, falling back to the most recent session anywhere.
 */
export function lastTimeFrom(history: SessionSets[], currentSessionId: string | null, dayKey: string | null, programId: string | null): SessionSets | null {
  const others = history.filter((h) => h.session.id !== currentSessionId && h.sets.length > 0);
  const sameDay = dayKey
    ? others.filter((h) => h.session.day_key === dayKey && h.session.program_id === programId)
    : [];
  return sameDay.at(-1) ?? others.at(-1) ?? null;
}
