import { describe, expect, it } from "vitest";
import { parseProgram } from "../parse";
import { parseReps } from "../schema";

const valid = {
  schemaVersion: 1,
  name: "Pre-Penang Upper/Lower",
  author: "Claude",
  weeks: 8,
  progressionNotes: "Add 2.5 kg when all sets hit the top of the rep range.",
  days: [
    {
      id: "upper-a",
      name: "Upper A",
      dayOfWeek: "Mon",
      items: [
        { type: "strength", name: "Barbell Bench Press", equipment: "barbell", sets: 4, reps: "6-8", restSeconds: 150, supersetGroup: null, notes: "Pause first rep" },
        { type: "cardio", name: "Incline Treadmill Walk", durationMinutes: 20, notes: "Incline 10-12" },
      ],
    },
  ],
};

describe("parseProgram", () => {
  it("imports a chat reply with a sentence and code fence around the JSON", () => {
    const reply = `Here's your program in Spotter's format:\n\n\`\`\`json\n${JSON.stringify(valid, null, 2)}\n\`\`\`\n\nLet me know if you want changes!`;
    const r = parseProgram(reply);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.program.name).toBe("Pre-Penang Upper/Lower");
    const bench = r.program.days[0].items[0];
    expect(bench).toMatchObject({ type: "strength", repsMin: 6, repsMax: 8, restSeconds: 150, equipment: "barbell" });
    expect(r.program.days[0].items[1]).toMatchObject({ type: "cardio", durationMinutes: 20 });
  });

  it("imports bare JSON with no fence", () => {
    expect(parseProgram(JSON.stringify(valid)).ok).toBe(true);
  });

  it("handles text before the JSON without a fence, and braces inside strings", () => {
    const v = structuredClone(valid);
    v.days[0].items[0].notes = "Use {tempo} 3-1-1";
    const r = parseProgram(`Sure! ${JSON.stringify(v)} Enjoy.`);
    expect(r.ok).toBe(true);
  });

  it("is lenient: trims, coerces numeric strings, ignores unknown fields, accepts casing and trailing commas", () => {
    const text = `{
      "schemaVersion": "1",
      "name": "  Test  ",
      "extra": true,
      "days": [{
        "name": "Lower",
        "dayOfWeek": "tuesday",
        "items": [
          { "type": "Strength", "name": " Leg Press ", "equipment": "Machine", "sets": "3", "reps": 10, "restSeconds": "90", "rpe": 8 },
          { "name": "Bike", "durationMinutes": "15" },
        ]
      }]
    }`;
    const r = parseProgram(text);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.program.name).toBe("Test");
    const day = r.program.days[0];
    expect(day.id).toBe("lower");
    expect(day.dayOfWeek).toBe("Tue");
    expect(day.items[0]).toMatchObject({ name: "Leg Press", equipment: "machine", sets: 3, repsMin: 10, repsMax: 10, restSeconds: 90 });
    expect(day.items[0]).not.toHaveProperty("rpe");
    expect(day.items[1]).toMatchObject({ type: "cardio", durationMinutes: 15 });
  });

  it("gives readable, located errors", () => {
    const v = structuredClone(valid) as unknown as { days: { items: Record<string, unknown>[] }[] };
    v.days.push({ ...structuredClone(v.days[0]) });
    v.days[1].items[0].sets = "four";
    delete v.days[1].items[0].reps;
    const r = parseProgram(JSON.stringify(v));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errors).toContain("Day 2 (Upper A), exercise 1 (Barbell Bench Press): `sets` must be a number");
    expect(r.errors.some((e) => e.startsWith("Day 2 (Upper A), exercise 1 (Barbell Bench Press): `reps`"))).toBe(true);
  });

  it("reports a missing field as missing", () => {
    const v = structuredClone(valid) as unknown as Record<string, unknown>;
    delete v.name;
    const r = parseProgram(JSON.stringify(v));
    expect(r).toEqual({ ok: false, errors: ["`name` is missing"] });
  });

  it("explains cut-off JSON and garbage", () => {
    const cut = parseProgram(JSON.stringify(valid).slice(0, 80));
    expect(cut.ok).toBe(false);
    if (!cut.ok) expect(cut.errors[0]).toMatch(/cut off/);
    const none = parseProgram("I can't help with that");
    expect(none.ok).toBe(false);
    if (!none.ok) expect(none.errors[0]).toMatch(/Couldn't find any JSON/);
  });

  it("unknown equipment falls back to other, bad dayOfWeek is an error", () => {
    const v = structuredClone(valid) as unknown as { days: Record<string, unknown>[] };
    (v.days[0].items as Record<string, unknown>[])[0].equipment = "resistance band";
    expect(parseProgram(JSON.stringify(v)).ok).toBe(true);
    v.days[0].dayOfWeek = "Someday";
    const r = parseProgram(JSON.stringify(v));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors[0]).toBe("Day 1 (Upper A): `dayOfWeek` must be a day like Mon, Tue or Wed");
  });

  it("gives duplicate day ids unique slugs", () => {
    const v = structuredClone(valid);
    v.days.push(structuredClone(v.days[0]));
    const r = parseProgram(JSON.stringify(v));
    expect(r.ok && r.program.days.map((d) => d.id)).toEqual(["upper-a", "upper-a-2"]);
  });
});

describe("parseReps", () => {
  it.each([
    [8, { min: 8, max: 8 }],
    ["8-10", { min: 8, max: 10 }],
    ["8–10", { min: 8, max: 10 }],
    ["8 to 10", { min: 8, max: 10 }],
    ["12 each side", { min: 12, max: 12, extra: "each side" }],
    ["10 reps", { min: 10, max: 10 }],
    ["AMRAP", { min: null, max: null, extra: "AMRAP" }],
  ])("%s", (input, expected) => {
    expect(parseReps(input)).toEqual(expected);
  });
  it.each([["ten"], ["10-8"], [0], [8.5], [null]])("rejects %s", (input) => {
    expect(parseReps(input)).toBeNull();
  });
});
