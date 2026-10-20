import { describe, expect, it } from "vitest";
import { diffPrograms, isEmptyDiff } from "../diff";
import type { Program } from "../schema";

const base: Program = {
  schemaVersion: 1,
  name: "Pre-Penang",
  weeks: 8,
  days: [
    {
      id: "upper-a",
      name: "Upper A",
      dayOfWeek: "Mon",
      items: [
        { type: "strength", name: "Barbell Bench Press", equipment: "barbell", sets: 4, repsMin: 6, repsMax: 8, restSeconds: 150, supersetGroup: null },
        { type: "strength", name: "Dumbbell Lateral Raise", equipment: "dumbbell", sets: 3, repsMin: 12, repsMax: 15, restSeconds: 60, supersetGroup: null },
        { type: "cardio", name: "Incline Walk", durationMinutes: 20 },
      ],
    },
    { id: "lower-a", name: "Lower A", dayOfWeek: "Tue", items: [{ type: "strength", name: "Back Squat", equipment: "barbell", sets: 3, repsMin: 5, repsMax: 5, supersetGroup: null }] },
  ],
};

describe("diffPrograms", () => {
  it("no changes", () => {
    expect(isEmptyDiff(diffPrograms(base, structuredClone(base)))).toBe(true);
  });

  it("describes the brief's example and friends", () => {
    const next = structuredClone(base);
    const upper = next.days[0];
    upper.items[0] = { ...upper.items[0], sets: 5, repsMin: 5, repsMax: 5 } as Program["days"][number]["items"][number];
    upper.items.splice(1, 1, { type: "strength", name: "Cable Fly", equipment: "cable", sets: 3, repsMin: 12, repsMax: 15, supersetGroup: null });
    upper.items[2] = { type: "cardio", name: "Incline Walk", durationMinutes: 25 };
    next.days[1].dayOfWeek = "Thu";
    next.days.push({ id: "full", name: "Full Body", dayOfWeek: "Sat", items: [{ type: "cardio", name: "Bike", durationMinutes: 30 }] });
    next.weeks = 10;

    const d = diffPrograms(base, next);
    expect(d.program).toEqual(["Length: 8 weeks → 10 weeks"]);
    expect(d.days).toEqual([
      {
        day: "Upper A",
        kind: "changed",
        lines: ["Barbell Bench Press: 4×6–8 → 5×5", "Cable Fly added", "Incline Walk: 20 min → 25 min", "Dumbbell Lateral Raise removed"],
      },
      { day: "Lower A", kind: "changed", lines: ["Day: Tue → Thu"] },
      { day: "Full Body", kind: "added", lines: ["Bike 30 min"] },
    ]);
  });

  it("matches exercises loosely and spots reordering, removed days and rest changes", () => {
    const next = structuredClone(base);
    next.days[0].items = [
      { type: "strength", name: "Dumbbell Lateral Raises", equipment: "dumbbell", sets: 3, repsMin: 12, repsMax: 15, restSeconds: 90, supersetGroup: "A" },
      base.days[0].items[0],
      base.days[0].items[2],
    ];
    next.days.pop();
    const d = diffPrograms(base, next);
    expect(d.days).toEqual([
      { day: "Upper A", kind: "changed", lines: ["Dumbbell Lateral Raises: rest 1 min → 90s, now in superset A", "Exercise order changed"] },
      { day: "Lower A", kind: "removed", lines: [] },
    ]);
  });

  it("matches a renamed day by its id", () => {
    const next = structuredClone(base);
    next.days[0].name = "Push";
    expect(diffPrograms(base, next).days).toEqual([{ day: "Push", kind: "changed", lines: ["Renamed from Upper A"] }]);
  });
});

describe("progression notes", () => {
  it("says whether notes were added, removed or changed", () => {
    const withNotes = { ...base, progressionNotes: "Add 2.5 kg" };
    expect(diffPrograms(withNotes, base).program).toEqual(["Progression notes removed"]);
    expect(diffPrograms(base, withNotes).program).toEqual(["Progression notes added"]);
    expect(diffPrograms(withNotes, { ...base, progressionNotes: "Add 5 kg" }).program).toEqual(["Progression notes updated"]);
  });
});
