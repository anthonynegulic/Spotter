import { canonicalTokens } from "@/lib/exercises/match";
import { formatReps } from "@/lib/workout/stats";
import type { Program, ProgramDay, ProgramItem } from "./schema";

/**
 * What changed between two versions of a program, in plain words, grouped by
 * day: "Bench Press: 4×6–8 → 5×5", "Cable Fly added". Days are matched by id,
 * then by name; exercises by name (ignoring case, word order and plurals).
 */

export interface DayChanges {
  day: string;
  kind: "added" | "removed" | "changed";
  lines: string[];
}

export interface ProgramDiff {
  program: string[];
  days: DayChanges[];
}

export function diffPrograms(before: Program, after: Program): ProgramDiff {
  const program: string[] = [];
  if (before.name !== after.name) program.push(`Renamed: ${before.name} → ${after.name}`);
  if ((before.weeks ?? null) !== (after.weeks ?? null)) program.push(`Length: ${weeksText(before.weeks)} → ${weeksText(after.weeks)}`);
  const notesBefore = before.progressionNotes ?? "";
  const notesAfter = after.progressionNotes ?? "";
  if (notesBefore !== notesAfter) {
    program.push(!notesAfter ? "Progression notes removed" : !notesBefore ? "Progression notes added" : "Progression notes updated");
  }

  const days: DayChanges[] = [];
  const unmatchedBefore = [...before.days];
  for (const newDay of after.days) {
    const i = findDay(unmatchedBefore, newDay);
    if (i === -1) {
      days.push({ day: newDay.name, kind: "added", lines: newDay.items.map((it) => `${it.name} ${target(it)}`) });
      continue;
    }
    const [oldDay] = unmatchedBefore.splice(i, 1);
    const lines = diffDay(oldDay, newDay);
    if (lines.length) days.push({ day: newDay.name, kind: "changed", lines });
  }
  for (const gone of unmatchedBefore) days.push({ day: gone.name, kind: "removed", lines: [] });
  return { program, days };
}

export function isEmptyDiff(d: ProgramDiff): boolean {
  return d.program.length === 0 && d.days.length === 0;
}

function findDay(days: ProgramDay[], day: ProgramDay): number {
  const byId = days.findIndex((d) => d.id === day.id);
  return byId !== -1 ? byId : days.findIndex((d) => d.name.trim().toLowerCase() === day.name.trim().toLowerCase());
}

function diffDay(a: ProgramDay, b: ProgramDay): string[] {
  const lines: string[] = [];
  if (a.name !== b.name) lines.push(`Renamed from ${a.name}`);
  if (a.dayOfWeek !== b.dayOfWeek) lines.push(`Day: ${a.dayOfWeek ?? "rotation"} → ${b.dayOfWeek ?? "rotation"}`);

  const remaining = [...a.items];
  const matchedOrder: number[] = [];
  for (const it of b.items) {
    const i = remaining.findIndex((o) => sameExercise(o, it));
    if (i === -1) {
      lines.push(`${it.name} added`);
      continue;
    }
    const [old] = remaining.splice(i, 1);
    matchedOrder.push(a.items.indexOf(old));
    const changes = itemChanges(old, it);
    if (changes) lines.push(`${it.name}: ${changes}`);
  }
  for (const gone of remaining) lines.push(`${gone.name} removed`);
  if (matchedOrder.some((v, i) => i > 0 && v < matchedOrder[i - 1])) lines.push("Exercise order changed");
  return lines;
}

function sameExercise(a: ProgramItem, b: ProgramItem): boolean {
  if (a.type !== b.type) return false;
  return canonicalTokens(a.name).join(" ") === canonicalTokens(b.name).join(" ");
}

function itemChanges(a: ProgramItem, b: ProgramItem): string | null {
  const parts: string[] = [];
  if (target(a) !== target(b)) parts.push(`${target(a)} → ${target(b)}`);
  if (a.type === "strength" && b.type === "strength") {
    if ((a.restSeconds ?? null) !== (b.restSeconds ?? null)) parts.push(`rest ${restText(a.restSeconds)} → ${restText(b.restSeconds)}`);
    if ((a.supersetGroup ?? null) !== (b.supersetGroup ?? null)) {
      parts.push(b.supersetGroup ? `now in superset ${b.supersetGroup}` : "no longer a superset");
    }
    if (a.equipment !== b.equipment) parts.push(`${a.equipment} → ${b.equipment}`);
  }
  if ((a.notes ?? "") !== (b.notes ?? "")) parts.push("notes updated");
  return parts.length ? parts.join(", ") : null;
}

function target(it: ProgramItem): string {
  return it.type === "cardio" ? `${it.durationMinutes} min` : `${it.sets}×${formatReps(it.repsMin, it.repsMax)}`;
}

function restText(s: number | undefined): string {
  if (s === undefined) return "default";
  return s % 60 === 0 && s >= 60 ? `${s / 60} min` : `${s}s`;
}

function weeksText(w: number | undefined): string {
  return w ? `${w} weeks` : "open-ended";
}
