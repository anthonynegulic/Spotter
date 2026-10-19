import { z } from "zod";

/**
 * Program JSON schema, version 1. See BRIEF.md §5.1.
 *
 * Lenient where it's safe: strings are trimmed, numeric strings are accepted
 * for numbers, `reps` may be a number or a range like "8-10", casing of enums
 * is ignored and unknown fields are dropped. Everything else is strict so a
 * bad import fails loudly with a readable message instead of saving junk.
 */

export const EQUIPMENT = [
  "barbell",
  "dumbbell",
  "machine",
  "cable",
  "kettlebell",
  "bodyweight",
  "other",
] as const;
export type Equipment = (typeof EQUIPMENT)[number];

const EQUIPMENT_SYNONYMS: Record<string, Equipment> = {
  bb: "barbell",
  "ez bar": "barbell",
  "ez-bar": "barbell",
  "trap bar": "barbell",
  "hex bar": "barbell",
  db: "dumbbell",
  dumbbells: "dumbbell",
  "smith machine": "machine",
  smith: "machine",
  kb: "kettlebell",
  bw: "bodyweight",
  "body weight": "bodyweight",
  cables: "cable",
};

export const DAYS_OF_WEEK = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

const trimmed = z.preprocess(
  (v) => (typeof v === "string" ? v.trim() : v),
  z.string({ error: "must be text" }).min(1, { error: "can't be empty" }),
);

const optionalText = z.preprocess(
  (v) => (typeof v === "string" ? v.trim() || undefined : v === null ? undefined : v),
  z.string({ error: "must be text" }).optional(),
);

/** A number, or a string that is plainly a number ("4", " 90 "). */
function numeric(label: "whole" | "decimal") {
  return z.preprocess(
    (v) => {
      if (typeof v === "string" && /^\s*\d+(\.\d+)?\s*$/.test(v)) return Number(v);
      return v;
    },
    label === "whole"
      ? z.number({ error: "must be a number" }).int({ error: "must be a whole number" })
      : z.number({ error: "must be a number" }),
  );
}

export interface RepsTarget {
  min: number | null;
  max: number | null;
  /** Text left over after the numbers, e.g. "each side". Appended to notes. */
  extra?: string;
}

/** Parses 8, "8", "8-10", "8–10", "8 to 10", "10 each side", "AMRAP". */
export function parseReps(value: unknown): RepsTarget | null {
  if (typeof value === "number" && Number.isInteger(value) && value > 0) {
    return { min: value, max: value };
  }
  if (typeof value !== "string") return null;
  const s = value.trim();
  if (/^(amrap|max|max reps|as many as possible)$/i.test(s)) {
    return { min: null, max: null, extra: "AMRAP" };
  }
  const m = s.match(/^(\d+)\s*(?:(?:-|–|—|to)\s*(\d+))?\s*(.*)$/i);
  if (!m) return null;
  const a = Number(m[1]);
  const b = m[2] ? Number(m[2]) : a;
  if (a <= 0 || b < a) return null;
  const extra = m[3]?.replace(/^reps?\b\s*/i, "").trim();
  return { min: a, max: b, ...(extra ? { extra } : {}) };
}

const reps = z.unknown().transform((v, ctx) => {
  const parsed = parseReps(v);
  if (!parsed) {
    ctx.addIssue({ code: "custom", message: 'must be a number or a range like "8-10"' });
    return z.NEVER;
  }
  return parsed;
});

const equipment = z.preprocess((v) => {
  if (v === undefined || v === null || v === "") return "other";
  if (typeof v !== "string") return v;
  const key = v.trim().toLowerCase();
  if ((EQUIPMENT as readonly string[]).includes(key)) return key;
  return EQUIPMENT_SYNONYMS[key] ?? "other";
}, z.enum(EQUIPMENT, { error: `must be one of ${EQUIPMENT.join(", ")}` }));

const dayOfWeek = z.preprocess(
  (v) => {
    if (v === undefined || v === null || v === "") return null;
    if (typeof v !== "string") return v;
    const key = v.trim().slice(0, 3).toLowerCase();
    const idx = DAYS_OF_WEEK.findIndex((d) => d.toLowerCase() === key);
    return idx === -1 ? v : DAYS_OF_WEEK[idx];
  },
  z.enum(DAYS_OF_WEEK, { error: "must be a day like Mon, Tue or Wed" }).nullable(),
);

const supersetGroup = z.preprocess(
  (v) => (typeof v === "string" ? v.trim().toUpperCase() || null : v ?? null),
  z.string({ error: "must be a letter like A" }).nullable(),
);

const strengthItem = z.object({
  type: z.literal("strength"),
  name: trimmed,
  equipment,
  sets: numeric("whole").pipe(z.number().min(1, { error: "must be at least 1" }).max(20, { error: "looks too high (max 20)" })),
  reps,
  restSeconds: z.preprocess((v) => v ?? undefined, numeric("whole").pipe(z.number().min(0).max(900, { error: "looks too long (max 900)" })).optional()),
  supersetGroup,
  notes: optionalText,
});

const cardioItem = z.object({
  type: z.literal("cardio"),
  name: trimmed,
  durationMinutes: numeric("decimal").pipe(z.number().positive({ error: "must be more than 0" }).max(600)),
  notes: optionalText,
});

/** Lowercase `type`, and infer it when missing (duration and no sets = cardio). */
const item = z.preprocess((v) => {
  if (!v || typeof v !== "object" || Array.isArray(v)) return v;
  const o = v as Record<string, unknown>;
  let type = typeof o.type === "string" ? o.type.trim().toLowerCase() : o.type;
  if (type === undefined || type === null || type === "") {
    type = o.durationMinutes !== undefined && o.sets === undefined ? "cardio" : "strength";
  }
  return { ...o, type };
}, z.discriminatedUnion("type", [strengthItem, cardioItem], { error: 'type must be "strength" or "cardio"' }));

const day = z.object({
  id: optionalText,
  name: trimmed,
  dayOfWeek: dayOfWeek.optional().transform((v) => v ?? null),
  items: z.array(item, { error: "must be a list of exercises" }).min(1, { error: "needs at least one exercise" }),
});

export const programSchemaV1 = z.object({
  schemaVersion: z.preprocess(
    (v) => (typeof v === "string" ? Number(v) : v),
    z.literal(1, { error: "must be 1" }),
  ),
  name: trimmed,
  author: optionalText,
  weeks: z.preprocess((v) => v ?? undefined, numeric("whole").pipe(z.number().min(1).max(104)).optional()),
  progressionNotes: optionalText,
  days: z.array(day, { error: "must be a list of days" }).min(1, { error: "needs at least one day" }),
});

export type ProgramInput = z.input<typeof programSchemaV1>;
type Parsed = z.output<typeof programSchemaV1>;
export type StrengthItem = Extract<Parsed["days"][number]["items"][number], { type: "strength" }>;
export type CardioItem = Extract<Parsed["days"][number]["items"][number], { type: "cardio" }>;

/** The parsed program after post-processing (day ids filled in, reps notes merged). */
export interface Program extends Omit<Parsed, "days"> {
  days: ProgramDay[];
}
export interface ProgramDay {
  id: string;
  name: string;
  dayOfWeek: (typeof DAYS_OF_WEEK)[number] | null;
  items: ProgramItem[];
}
export type ProgramItem =
  | (Omit<StrengthItem, "reps"> & { repsMin: number | null; repsMax: number | null })
  | CardioItem;
