import { describe, expect, it } from "vitest";
import { prefill } from "../prefill";
import { estimated1RM, formatKg, prKinds } from "../stats";
import { missedThisWeek, planToday, programWeek, type ScheduleDay } from "../schedule";

describe("prefill", () => {
  const lastTime = [
    { set_number: 1, weight_kg: 80, reps: 8 },
    { set_number: 2, weight_kg: 80, reps: 8 },
    { set_number: 3, weight_kg: 80, reps: 7 },
  ];
  it("uses the same set number last time", () => {
    expect(prefill({ setNumber: 1, today: [], lastTime, equipment: "barbell", repsMin: 6 })).toEqual({ weight: 80, reps: 8 });
  });
  it("carries today's weight bump, keeps last time's reps for that set", () => {
    const today = [{ set_number: 1, weight_kg: 82.5, reps: 8 }, { set_number: 2, weight_kg: 82.5, reps: 7 }];
    expect(prefill({ setNumber: 3, today, lastTime, equipment: "barbell", repsMin: 6 })).toEqual({ weight: 82.5, reps: 7 });
  });
  it("an extra set copies last time's final set", () => {
    expect(prefill({ setNumber: 4, today: [], lastTime, equipment: "barbell", repsMin: 6 })).toEqual({ weight: 80, reps: 7 });
  });
  it("defaults with no history: 20 kg bar, bottom of range", () => {
    expect(prefill({ setNumber: 1, today: [], lastTime: [], equipment: "barbell", repsMin: 6 })).toEqual({ weight: 20, reps: 6 });
    expect(prefill({ setNumber: 1, today: [], lastTime: [], equipment: "bodyweight", repsMin: null })).toEqual({ weight: 0, reps: 8 });
  });
  it("with no history, set 2 follows today's set 1", () => {
    const today = [{ set_number: 1, weight_kg: 40, reps: 10 }];
    expect(prefill({ setNumber: 2, today, lastTime: [], equipment: "dumbbell", repsMin: 8 })).toEqual({ weight: 40, reps: 10 });
  });
});

describe("PRs", () => {
  const earlier = [
    { id: "a", weight_kg: 80, reps: 8 },
    { id: "b", weight_kg: 85, reps: 5 },
  ];
  it("Epley", () => {
    expect(estimated1RM(100, 1)).toBe(100);
    expect(estimated1RM(80, 8)).toBeCloseTo(101.33, 2);
    expect(estimated1RM(0, 10)).toBe(0);
  });
  it("detects heaviest-weight and e1RM PRs", () => {
    expect(prKinds({ id: "x", weight_kg: 82.5, reps: 8 }, earlier)).toEqual(["e1rm"]);
    expect(prKinds({ id: "x", weight_kg: 87.5, reps: 2 }, earlier)).toEqual(["weight"]);
    expect(prKinds({ id: "x", weight_kg: 90, reps: 5 }, earlier)).toEqual(["weight", "e1rm"]);
    expect(prKinds({ id: "x", weight_kg: 80, reps: 8 }, earlier)).toEqual([]);
  });
  it("first-ever set is not a PR", () => {
    expect(prKinds({ id: "x", weight_kg: 100, reps: 5 }, [])).toEqual([]);
  });
  it("formats kg", () => {
    expect(formatKg(82.5)).toBe("82.5");
    expect(formatKg(80)).toBe("80");
    expect(formatKg(1.25)).toBe("1.25");
  });
});

describe("schedule", () => {
  const cal: ScheduleDay[] = [
    { id: "ua", day_key: "upper-a", day_of_week: 1, sort: 0 },
    { id: "la", day_key: "lower-a", day_of_week: 2, sort: 1 },
    { id: "ub", day_key: "upper-b", day_of_week: 4, sort: 2 },
    { id: "lb", day_key: "lower-b", day_of_week: 5, sort: 3 },
  ];
  // Mon 19 Oct 2026 … Sun 25 Oct 2026
  const wed = new Date(2026, 9, 21, 9);
  const thu = new Date(2026, 9, 22, 9);

  it("calendar: today's day, or rest", () => {
    expect(planToday(cal, [], thu)).toEqual({ kind: "workout", dayId: "ub" });
    expect(planToday(cal, [], wed)).toEqual({ kind: "rest" });
  });
  it("calendar: missed days this week, earliest first", () => {
    const done = [{ day_key: "upper-a", started_at: new Date(2026, 9, 19, 7).toISOString() }];
    expect(missedThisWeek(cal, done, wed)).toEqual(["la"]);
    expect(missedThisWeek(cal, [], wed)).toEqual(["ua", "la"]);
    // Last week's session doesn't count.
    const lastWeek = [{ day_key: "upper-a", started_at: new Date(2026, 9, 12, 7).toISOString() }];
    expect(missedThisWeek(cal, lastWeek, wed)).toEqual(["ua", "la"]);
  });
  it("rotation: next after last completed, wrapping", () => {
    const rot = cal.map((d) => ({ ...d, day_of_week: null }));
    expect(planToday(rot, [], wed)).toEqual({ kind: "workout", dayId: "ua" });
    expect(planToday(rot, [{ day_key: "upper-b", started_at: "2026-10-20T07:00:00Z" }], wed)).toEqual({ kind: "workout", dayId: "lb" });
    expect(planToday(rot, [{ day_key: "lower-b", started_at: "2026-10-20T07:00:00Z" }, { day_key: "upper-a", started_at: "2026-10-18T07:00:00Z" }], wed)).toEqual({ kind: "workout", dayId: "ua" });
  });
  it("program week", () => {
    expect(programWeek(new Date(2026, 9, 5, 12).toISOString(), wed)).toBe(3);
    expect(programWeek(new Date(2026, 9, 19, 12).toISOString(), wed)).toBe(1);
    expect(programWeek(null, wed)).toBe(1);
  });
});

describe("prsForSets", async () => {
  const { prsForSets } = await import("../summary");
  const mk = (id: string, session: string, w: number, r: number, t: string) => ({
    id, user_id: "u", session_id: session, exercise_id: "bench", item_key: "k", set_number: 1, weight_kg: w, reps: r, note: null, logged_at: t, deleted_at: null,
  });
  it("no PRs in an exercise's first session, even when sets get heavier", () => {
    const s1 = mk("a", "s1", 60, 8, "2026-10-19T08:00:00Z");
    const s2 = mk("b", "s1", 70, 8, "2026-10-19T08:05:00Z");
    expect(prsForSets([s1, s2], new Map([["bench", [s1, s2]]])).size).toBe(0);
  });
  it("PRs against previous sessions and earlier sets today", () => {
    const old = mk("o", "s0", 80, 8, "2026-10-12T08:00:00Z");
    const a = mk("a", "s1", 82.5, 8, "2026-10-19T08:00:00Z");
    const b = mk("b", "s1", 82.5, 8, "2026-10-19T08:05:00Z");
    const prs = prsForSets([a, b], new Map([["bench", [old, a, b]]]));
    expect(prs.get("a")).toEqual(["weight", "e1rm"]);
    expect(prs.has("b")).toBe(false); // equal to set a, not a new record
  });
});
