import type { z } from "zod";
import { extractJson } from "./extract";
import { programSchemaV1, type Program, type ProgramDay } from "./schema";

export type ParseResult =
  | { ok: true; program: Program }
  | { ok: false; errors: string[] };

const MAX_ERRORS = 8;

/** Text pasted from a chat reply (or a file) → validated program, or readable errors. */
export function parseProgram(text: string): ParseResult {
  if (!text.trim()) return { ok: false, errors: ["Paste your program first."] };
  const extracted = extractJson(text);
  if (!extracted.ok) return { ok: false, errors: [extracted.error] };
  return validateProgram(extracted.value);
}

export function validateProgram(raw: unknown): ParseResult {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, errors: ["The JSON should be a single program object, starting with {."] };
  }
  const result = programSchemaV1.safeParse(raw, { reportInput: true });
  if (!result.success) {
    const errors = result.error.issues.map((issue) => describeIssue(issue, raw));
    const unique = [...new Set(errors)];
    if (unique.length > MAX_ERRORS) {
      const extra = unique.length - MAX_ERRORS;
      return { ok: false, errors: [...unique.slice(0, MAX_ERRORS), `…and ${extra} more.`] };
    }
    return { ok: false, errors: unique };
  }

  const usedIds = new Set<string>();
  const days: ProgramDay[] = result.data.days.map((d, i) => {
    const id = uniqueId(slugify(d.id ?? d.name) || `day-${i + 1}`, usedIds);
    return {
      id,
      name: d.name,
      dayOfWeek: d.dayOfWeek,
      items: d.items.map((it) => {
        if (it.type === "cardio") return it;
        const { reps, ...rest } = it;
        const notes = [reps.extra, rest.notes].filter(Boolean).join(" · ") || undefined;
        return { ...rest, notes, repsMin: reps.min, repsMax: reps.max };
      }),
    };
  });
  return { ok: true, program: { ...result.data, days } };
}

const FIELD_LABELS: Record<string, string> = {
  schemaVersion: "schemaVersion",
  name: "name",
  days: "days",
  items: "items",
};

function describeIssue(issue: z.core.$ZodIssue, raw: unknown): string {
  const path = issue.path;
  const parts: string[] = [];
  let field: string | undefined;
  let node: unknown = raw;

  for (let i = 0; i < path.length; i++) {
    const key = path[i];
    const next = (node as Record<PropertyKey, unknown> | undefined)?.[key as PropertyKey];
    if (key === "days" && typeof path[i + 1] === "number") {
      const index = path[i + 1] as number;
      const dayNode = (next as unknown[] | undefined)?.[index] as Record<string, unknown> | undefined;
      parts.push(`Day ${index + 1}${nameOf(dayNode)}`);
      node = dayNode;
      i++;
      continue;
    }
    if (key === "items" && typeof path[i + 1] === "number") {
      const index = path[i + 1] as number;
      const itemNode = (next as unknown[] | undefined)?.[index] as Record<string, unknown> | undefined;
      parts.push(`exercise ${index + 1}${nameOf(itemNode)}`);
      node = itemNode;
      i++;
      continue;
    }
    field = String(key);
    node = next;
  }

  const where = parts.length ? `${capitalise(parts.join(", "))}: ` : "";
  const label = field ? `\`${FIELD_LABELS[field] ?? field}\` ` : "";
  return `${where}${label}${messageFor(issue, field)}`;
}

function messageFor(issue: z.core.$ZodIssue, field: string | undefined): string {
  if (issue.code === "invalid_type" && issue.input === undefined) {
    return field ? "is missing" : "is missing something it needs";
  }
  return issue.message;
}

function nameOf(node: Record<string, unknown> | undefined): string {
  const name = node?.name;
  return typeof name === "string" && name.trim() ? ` (${name.trim()})` : "";
}

function capitalise(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function uniqueId(base: string, used: Set<string>): string {
  let id = base;
  for (let n = 2; used.has(id); n++) id = `${base}-${n}`;
  used.add(id);
  return id;
}
