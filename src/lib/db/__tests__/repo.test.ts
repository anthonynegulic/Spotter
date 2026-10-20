import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "../local";
import { addProgramVersion, createSession, importProgram, logSet, mergeExercises, planFromItems, repairMergedExercises } from "../repo";
import { loadProgramTree } from "../queries";
import { parseProgram } from "@/lib/program/parse";
import type { Program } from "@/lib/program/schema";

const U = "user-1";
const program = (overrides: (p: Record<string, unknown>) => void = () => {}): Program => {
  const raw: Record<string, unknown> = {
    schemaVersion: 1,
    name: "Block",
    weeks: 8,
    days: [
      { id: "upper", name: "Upper", dayOfWeek: "Mon", items: [
        { type: "strength", name: "Barbell Bench Press", equipment: "barbell", sets: 4, reps: "6-8" },
        { type: "strength", name: "DB RDL", equipment: "dumbbell", sets: 3, reps: 10 },
      ] },
    ],
  };
  overrides(raw);
  const r = parseProgram(JSON.stringify(raw));
  if (!r.ok) throw new Error(r.errors.join("; "));
  return r.program;
};

describe("program versions", () => {
  beforeEach(async () => Promise.all(db.tables.map((t) => t.clear())));

  it("adds a version, keeps the week count, reuses exercises", async () => {
    const id = await importProgram({ program: program(), raw: {}, userId: U, makeActive: true });
    const before = await db.programs.get(id);
    const v2 = program((p) => {
      (p.days as { items: { sets: number }[] }[])[0].items[0].sets = 5;
    });
    await addProgramVersion({ programId: id, program: v2, raw: {}, userId: U, makeActive: false, restartWeek: false });
    const tree = (await loadProgramTree(id))!;
    expect(tree.version.version).toBe(2);
    expect(tree.days[0].items[0].sets).toBe(5);
    expect((await db.programs.get(id))!.activated_at).toBe(before!.activated_at);
    expect((await db.programs.get(id))!.is_active).toBe(true);
    expect(await db.exercises.count()).toBe(2);
  });

  it("restart at week 1 resets the activation date", async () => {
    const id = await importProgram({ program: program(), raw: {}, userId: U, makeActive: true });
    await db.programs.update(id, { activated_at: "2026-01-01T00:00:00.000Z" });
    await addProgramVersion({ programId: id, program: program(), raw: {}, userId: U, makeActive: false, restartWeek: true });
    expect((await db.programs.get(id))!.activated_at).not.toBe("2026-01-01T00:00:00.000Z");
  });
});

describe("mergeExercises", () => {
  beforeEach(async () => Promise.all(db.tables.map((t) => t.clear())));

  it("moves history, plans, program items and names; retires the old exercise", async () => {
    // Two programs that each created their own version of the same lift.
    const a = await importProgram({ program: program(), raw: {}, userId: U, makeActive: true });
    await importProgram({
      program: program((p) => {
        p.name = "Other";
        (p.days as { items: { name: string }[] }[])[0].items[1].name = "Stiff Leg Deadlift";
      }),
      raw: {},
      userId: U,
      makeActive: false,
    });
    const rdl = (await db.exercises.toArray()).find((e) => e.name === "DB RDL")!;
    const sldl = (await db.exercises.toArray()).find((e) => e.name === "Stiff Leg Deadlift")!;
    const tree = (await loadProgramTree(a))!;
    const session = await createSession({ userId: U, programId: a, day: tree.days[0], name: "Upper", plan: planFromItems(tree.days[0].items) });
    await logSet({ userId: U, sessionId: session.id, exerciseId: rdl.id, itemKey: "k", setNumber: 1, weightKg: 30, reps: 10 });

    await mergeExercises(rdl.id, sldl.id);

    expect((await db.sets.toArray()).every((s) => s.exercise_id === sldl.id)).toBe(true);
    expect((await db.program_items.where("exercise_id").equals(rdl.id).count())).toBe(0);
    expect((await db.sessions.get(session.id))!.plan.some((p) => p.exercise_id === rdl.id)).toBe(false);
    const aliases = (await db.exercise_aliases.where("exercise_id").equals(sldl.id).toArray()).map((x) => x.alias);
    expect(aliases).toContain("db rdl");
    const retired = (await db.exercises.get(rdl.id))!;
    expect(retired.deleted_at).not.toBeNull();
    expect(retired.merged_into).toBe(sldl.id);
    // Everything went through the outbox for sync.
    expect(await db.outbox.where("table").equals("exercises").count()).toBeGreaterThan(0);
  });

  it("repairs sets that arrive later for a merged exercise", async () => {
    await importProgram({ program: program(), raw: {}, userId: U, makeActive: true });
    const [bench, rdl] = await db.exercises.toArray();
    await mergeExercises(rdl.id, bench.id);
    // A set from a phone that was offline during the merge.
    await db.sets.put({ id: "late", user_id: U, session_id: "s", exercise_id: rdl.id, item_key: null, set_number: 1, weight_kg: 20, reps: 10, note: null, logged_at: "2026-10-20T08:00:00Z", deleted_at: null });
    await repairMergedExercises();
    expect((await db.sets.get("late"))!.exercise_id).toBe(bench.id);
  });
});
