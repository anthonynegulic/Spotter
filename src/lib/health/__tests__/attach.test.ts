import { describe, expect, it } from "vitest";
import type { HealthWorkoutRow } from "@/lib/db/types";
import { matchWorkout } from "../attach";

const w = (id: string, start: string, end: string): HealthWorkoutRow => ({
  id, user_id: "u", external_id: id, name: id, started_at: start, ended_at: end, duration_s: null,
  active_kcal: 250, avg_hr: 120, max_hr: 160, source: "Watch", created_at: "", deleted_at: null,
});

describe("matchWorkout", () => {
  const session = { started_at: "2026-10-19T18:50:00Z", finished_at: "2026-10-19T19:30:00Z" };
  it("picks the strength workout that overlaps the session, not the walk after it", () => {
    const strength = w("strength", "2026-10-19T18:43:00Z", "2026-10-19T19:18:00Z");
    const walk = w("walk", "2026-10-19T19:18:30Z", "2026-10-19T19:40:00Z");
    expect(matchWorkout(session, [walk, strength])?.id).toBe("strength");
  });
  it("ignores workouts on other days or barely touching", () => {
    expect(matchWorkout(session, [w("yesterday", "2026-10-18T18:43:00Z", "2026-10-18T19:18:00Z")])).toBeNull();
    expect(matchWorkout(session, [w("long", "2026-10-19T19:28:00Z", "2026-10-19T21:00:00Z")])).toBeNull();
  });
  it("counts a Watch started up to 15 minutes before the first set", () => {
    expect(matchWorkout(session, [w("early", "2026-10-19T18:36:00Z", "2026-10-19T18:52:00Z")])?.id).toBe("early");
  });
});
