import { describe, expect, it } from "vitest";
import type { DailyEntryRow, DailyGoalRow, HealthSampleRow } from "@/lib/db/types";
import { addDays, dayKey, dayValue, formatAmount, goalTarget, isMet, lastDays, latestWeight, streak } from "../goals";

const goal = (over: Partial<DailyGoalRow>): DailyGoalRow => ({
  id: "g", user_id: "u", type: "protein", label: "Protein", target: null, target_per_kg: 2, unit: "g", source: "manual",
  sort: 0, hidden: false, created_at: "2026-10-01T00:00:00Z", deleted_at: null, ...over,
});
const entry = (date: string, value: number, over: Partial<DailyEntryRow> = {}): DailyEntryRow => ({
  id: `${date}-${value}-${Math.random()}`, user_id: "u", goal_id: "g", date, value, created_at: "", deleted_at: null, ...over,
});
const sample = (metric: string, value: number, at: string, local_date: string | null = null): HealthSampleRow => ({
  id: `${metric}-${at}`, user_id: "u", metric, value, unit: "", recorded_at: at, local_date, source: "x", created_at: "", deleted_at: null,
});

describe("dates", () => {
  it("local day keys and arithmetic across month ends", () => {
    expect(dayKey(new Date(2026, 9, 5, 23, 59))).toBe("2026-10-05");
    expect(addDays("2026-10-31", 1)).toBe("2026-11-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
    expect(lastDays("2026-10-21", 3)).toEqual(["2026-10-19", "2026-10-20", "2026-10-21"]);
  });
});

describe("targets", () => {
  it("protein is 2 g per kg, rounded to 5 g, from the latest weight", () => {
    const w = latestWeight([sample("body_mass", 90, "2026-09-01T07:00:00Z"), sample("body_mass", 85.3, "2026-10-19T07:00:00Z")]);
    expect(w?.kg).toBe(85.3);
    expect(goalTarget(goal({}), w!.kg)).toBe(170);
    expect(goalTarget(goal({}), null)).toBe(150);
    expect(goalTarget(goal({ target: 180 }), null)).toBe(180);
    expect(goalTarget(goal({ type: "steps", target: 10000, target_per_kg: null }), 85)).toBe(10000);
  });
});

describe("dayValue", () => {
  it("manual goals sum the day's entries, ignoring deleted ones and other days", () => {
    const entries = [entry("2026-10-21", 30), entry("2026-10-21", 20), entry("2026-10-21", 40, { deleted_at: "x" }), entry("2026-10-20", 99)];
    expect(dayValue(goal({}), "2026-10-21", entries, [])).toEqual({ value: 50, from: "manual" });
    expect(dayValue(goal({}), "2026-10-22", entries, [])).toEqual({ value: 0, from: "none" });
  });
  it("automatic goals prefer Apple Health's daily total, else manual", () => {
    const steps = goal({ type: "steps", target: 10000, target_per_kg: null, source: "auto" });
    const samples = [sample("step_count", 9932, "2026-10-18T13:00:00Z", "2026-10-19")];
    expect(dayValue(steps, "2026-10-19", [entry("2026-10-19", 5000)], samples)).toEqual({ value: 9932, from: "health" });
    expect(dayValue(steps, "2026-10-20", [entry("2026-10-20", 5000)], samples)).toEqual({ value: 5000, from: "manual" });
  });
});

describe("streaks", () => {
  const met = new Set(["2026-10-17", "2026-10-18", "2026-10-19", "2026-10-20"]);
  it("counts back from today, or from yesterday while today is still in progress", () => {
    expect(streak((d) => met.has(d), "2026-10-20", "2026-01-01")).toBe(4);
    expect(streak((d) => met.has(d), "2026-10-21", "2026-01-01")).toBe(4);
    expect(streak((d) => met.has(d), "2026-10-22", "2026-01-01")).toBe(0);
  });
  it("doesn't count days before the goal existed", () => {
    expect(streak(() => true, "2026-10-20", "2026-10-19")).toBe(2);
  });
  it("met means reaching the target", () => {
    expect(isMet(170, 170)).toBe(true);
    expect(isMet(169, 170)).toBe(false);
  });
});

describe("formatAmount", () => {
  it("formats per unit", () => {
    expect(formatAmount(9932, "steps")).toBe("9,932");
    expect(formatAmount(2500, "ml")).toBe("2.5 L");
    expect(formatAmount(750, "ml")).toBe("750 ml");
    expect(formatAmount(170, "g")).toBe("170 g");
  });
});
