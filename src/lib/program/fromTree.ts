import type { ProgramTree } from "@/lib/db/queries";
import { DAYS_OF_WEEK, type Program, type ProgramInput } from "./schema";

/** A stored program version back in import shape, for diffs and the editor. */
export function treeToProgram(tree: ProgramTree): Program {
  return {
    schemaVersion: 1,
    name: tree.program.name,
    author: tree.version.author ?? undefined,
    weeks: tree.version.weeks ?? undefined,
    progressionNotes: tree.version.progression_notes ?? undefined,
    days: tree.days.map((d) => ({
      id: d.day_key,
      name: d.name,
      dayOfWeek: d.day_of_week ? DAYS_OF_WEEK[d.day_of_week - 1] : null,
      items: d.items.map((it) =>
        it.type === "cardio"
          ? { type: "cardio" as const, name: it.name, durationMinutes: it.duration_minutes ?? 0, notes: it.notes ?? undefined }
          : {
              type: "strength" as const,
              name: it.name,
              equipment: it.equipment ?? "other",
              sets: it.sets ?? 1,
              repsMin: it.reps_min,
              repsMax: it.reps_max,
              restSeconds: it.rest_seconds ?? undefined,
              supersetGroup: it.superset_group,
              notes: it.notes ?? undefined,
            },
      ),
    })),
  };
}

/** A program as schema-v1 JSON, e.g. to save an edited program as its raw_json. */
export function programToJson(p: Program): ProgramInput {
  return {
    schemaVersion: 1,
    name: p.name,
    ...(p.author ? { author: p.author } : {}),
    ...(p.weeks ? { weeks: p.weeks } : {}),
    ...(p.progressionNotes ? { progressionNotes: p.progressionNotes } : {}),
    days: p.days.map((d) => ({
      id: d.id,
      name: d.name,
      dayOfWeek: d.dayOfWeek,
      items: d.items.map((it) =>
        it.type === "cardio"
          ? { type: "cardio", name: it.name, durationMinutes: it.durationMinutes, ...(it.notes ? { notes: it.notes } : {}) }
          : {
              type: "strength",
              name: it.name,
              equipment: it.equipment,
              sets: it.sets,
              reps: it.repsMin === null || it.repsMax === null ? "AMRAP" : it.repsMin === it.repsMax ? it.repsMin : `${it.repsMin}-${it.repsMax}`,
              ...(it.restSeconds !== undefined ? { restSeconds: it.restSeconds } : {}),
              supersetGroup: it.supersetGroup,
              ...(it.notes ? { notes: it.notes } : {}),
            },
      ),
    })),
  };
}
