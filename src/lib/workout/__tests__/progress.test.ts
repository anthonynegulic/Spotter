import { describe, expect, it } from "vitest";
import type { SessionRow, SetRow } from "@/lib/db/types";
import type { SessionSets } from "@/lib/db/repo";
import { prsForSets } from "../summary";
import { allPrs, change, exercisePoints, exerciseStats, formatSetList, inRange, relativeDay, sinceLabel, weeklyBuckets } from "../progress";

const session = (id: string, started: string, finished = true): SessionRow => ({
  id, user_id: "u", program_id: "p", program_day_id: null, day_key: "upper-a", name: "Upper A", plan: [],
  started_at: started, finished_at: finished ? started : null, notes: null, created_at: started, deleted_at: null,
});
let n = 0;
const set = (sessionId: string, w: number, r: number, at: string, ex = "bench"): SetRow => ({
  id: `s${String(++n).padStart(3, "0")}`, user_id: "u", session_id: sessionId, exercise_id: ex, item_key: "k",
  set_number: 1, weight_kg: w, reps: r, note: null, logged_at: at, deleted_at: null,
});

const now = new Date(2026, 9, 21, 12); // Wed 21 Oct 2026
const iso = (y: number, m: number, d: number) => new Date(y, m, d, 8).toISOString();

describe("exercise progress", () => {
  const s1 = session("a", iso(2026, 6, 6));
  const s2 = session("b", iso(2026, 9, 12));
  const history: SessionSets[] = [
    { session: s1, sets: [set("a", 80, 8, s1.started_at), set("a", 80, 7, s1.started_at)] },
    { session: s2, sets: [set("b", 82.5, 8, s2.started_at), set("b", 85, 5, s2.started_at)] },
  ];

  it("one point per session with best e1RM, top set and volume", () => {
    const pts = exercisePoints(history);
    expect(pts.map((p) => [p.e1rm, p.topSet, p.topSetReps, p.volume])).toEqual([
      [101.3, 80, 8, 1200],
      [104.5, 85, 5, 1085],
    ]);
  });

  it("filters by range and reports change both ways", () => {
    const pts = exercisePoints(history);
    expect(inRange(pts, "4w", now)).toHaveLength(1);
    expect(inRange(pts, "6m", now)).toHaveLength(2);
    expect(change(pts.map((p) => ({ t: p.t, value: p.e1rm })))).toMatchObject({ delta: 3.2 });
    expect(change(pts.map((p) => ({ t: p.t, value: p.volume })))).toMatchObject({ delta: -115 });
    expect(change([{ t: 1, value: 5 }])).toBeNull();
  });

  it("stat tiles", () => {
    expect(exerciseStats(history)).toEqual({
      heaviest: { weight: 85, reps: 5 },
      bestSet: { weight: 82.5, reps: 8, e1rm: 82.5 * (1 + 8 / 30) },
      sessions: 2,
    });
  });
});

describe("weekly buckets", () => {
  it("counts finished sessions and their volume per week, including empty weeks", () => {
    const a = session("a", iso(2026, 9, 5)); // Mon wk1
    const b = session("b", iso(2026, 9, 7)); // Wed wk1
    const c = session("c", iso(2026, 9, 20)); // Tue wk3
    const open = session("d", iso(2026, 9, 21), false);
    const sets = [set("a", 100, 5, a.started_at), set("c", 50, 10, c.started_at), set("d", 10, 10, open.started_at)];
    const weeks = weeklyBuckets([a, b, c, open], sets, "4w", now);
    expect(weeks.map((w) => [w.sessions, w.volume])).toEqual([
      [0, 0], // 21 Sep (range start 24 Sep falls in this week)
      [0, 0],
      [2, 500],
      [0, 0],
      [1, 500],
    ]);
  });
});

describe("allPrs", () => {
  it("matches the in-workout rules: none in the first session, records after", () => {
    const sets = [
      set("s0", 60, 8, iso(2026, 9, 5)),
      set("s0", 70, 8, new Date(2026, 9, 5, 8, 5).toISOString()),
      set("s1", 72.5, 8, iso(2026, 9, 12)),
      set("s1", 72.5, 8, new Date(2026, 9, 12, 8, 5).toISOString()),
      set("s1", 75, 3, new Date(2026, 9, 12, 8, 10).toISOString()),
    ];
    const prs = allPrs(sets, new Set(["s0", "s1"]));
    expect(prs.map((p) => [p.set.weight_kg, p.set.reps, p.kinds])).toEqual([
      [75, 3, ["weight"]],
      [72.5, 8, ["weight", "e1rm"]],
    ]);
    // Same answer as the live-workout calculation for that session.
    const live = prsForSets(sets.filter((s) => s.session_id === "s1"), new Map([["bench", sets]]));
    expect([...live.keys()].sort()).toEqual(prs.map((p) => p.set.id).sort());
  });
  it("ignores sets from deleted sessions", () => {
    const sets = [set("x", 60, 8, iso(2026, 9, 5)), set("y", 100, 8, iso(2026, 9, 12))];
    expect(allPrs(sets, new Set(["y"]))).toEqual([]);
  });
});

describe("labels", () => {
  it("formats set lists", () => {
    expect(formatSetList([{ weight_kg: 80, reps: 8 }, { weight_kg: 80, reps: 7 }])).toBe("80 × 8 · 7");
    expect(formatSetList([{ weight_kg: 80, reps: 8 }, { weight_kg: 82.5, reps: 7 }])).toBe("80 × 8 · 82.5 × 7");
  });
  it("relative days", () => {
    expect(relativeDay(new Date(2026, 9, 21, 7), now)).toBe("Today");
    expect(relativeDay(new Date(2026, 9, 20, 7), now)).toBe("Yesterday");
    expect(relativeDay(new Date(2026, 9, 15, 7), now)).toBe("Thu");
    expect(relativeDay(new Date(2026, 9, 12, 7), now)).toBe("12 Oct");
    expect(relativeDay(new Date(2026, 9, 12, 7), now, true)).toBe("Mon 12 Oct");
  });
  it("since labels", () => {
    expect(sinceLabel(new Date(2026, 6, 6).getTime(), "3m", now)).toBe("since July");
    expect(sinceLabel(new Date(2026, 8, 28).getTime(), "4w", now)).toBe("since 28 Sept");
  });
});
