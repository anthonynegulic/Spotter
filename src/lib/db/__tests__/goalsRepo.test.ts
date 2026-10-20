import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { db, setMeta } from "../local";
import { addEntry, ensureDefaultGoals, setDayTotal, stableId, toggleDone } from "../goalsRepo";
import { dayValue } from "@/lib/goals/goals";

describe("goals repo", () => {
  beforeEach(async () => Promise.all(db.tables.map((t) => t.clear())));

  it("stable ids are UUID-shaped and the same for the same seed", async () => {
    const a = await stableId("u:goal:steps");
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-8[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(await stableId("u:goal:steps")).toBe(a);
    expect(await stableId("u:goal:water")).not.toBe(a);
  });

  it("waits for the first pull before seeding defaults, then seeds once", async () => {
    await ensureDefaultGoals("u", { requirePull: true });
    expect(await db.daily_goals.count()).toBe(0);
    await setMeta("pulled:daily_goals", "2026-10-21T00:00:00Z");
    await ensureDefaultGoals("u", { requirePull: true });
    await ensureDefaultGoals("u", { requirePull: true });
    expect((await db.daily_goals.toArray()).map((g) => g.type).sort()).toEqual(["active_energy", "exercise_minutes", "protein", "steps", "water"]);
  });

  it("quick-adds sum, set-total replaces, yes/no toggles", async () => {
    await ensureDefaultGoals("u", { requirePull: false });
    const goals = await db.daily_goals.toArray();
    const protein = goals.find((g) => g.type === "protein")!;
    const steps = goals.find((g) => g.type === "steps")!;
    await addEntry(protein, "2026-10-21", 30);
    await addEntry(protein, "2026-10-21", 20);
    await setDayTotal(steps, "2026-10-21", 4000);
    await setDayTotal(steps, "2026-10-21", 6500);
    const entries = await db.daily_entries.toArray();
    expect(dayValue(protein, "2026-10-21", entries, []).value).toBe(50);
    expect(dayValue(steps, "2026-10-21", entries, []).value).toBe(6500);

    const custom = { ...protein, id: "c", type: "custom" as const, target: 1, target_per_kg: null, unit: "done" };
    await toggleDone(custom, "2026-10-21", true);
    expect(dayValue(custom, "2026-10-21", await db.daily_entries.toArray(), []).value).toBe(1);
    await toggleDone(custom, "2026-10-21", false);
    expect(dayValue(custom, "2026-10-21", await db.daily_entries.toArray(), []).value).toBe(0);
  });
});
