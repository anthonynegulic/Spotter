import { describe, expect, it } from "vitest";
import fixture from "./fixture-v2.json";
import { convert, parseHaeDate, parseHealthExport } from "../healthExport.ts";
import { handleIngest, sha256Hex, TOKEN_HEADER, type IngestStore } from "../ingest.ts";

describe("parseHaeDate", () => {
  it("keeps the instant and the local calendar day", () => {
    expect(parseHaeDate("2026-10-19 00:00:00 +1100")).toEqual({ iso: "2026-10-18T13:00:00.000Z", localDate: "2026-10-19" });
    expect(parseHaeDate("2026-10-19 13:23:03 -0700")?.iso).toBe("2026-10-19T20:23:03.000Z");
    expect(parseHaeDate("nope")).toBeNull();
  });
});

describe("parseHealthExport", () => {
  const parsed = parseHealthExport(fixture);
  const by = (m: string) => parsed.samples.find((s) => s.metric === m);

  it("keeps the metrics Spotter uses, converting kJ to kcal, and drops raw heart rate", () => {
    expect(parsed.samples.map((s) => s.metric).sort()).toEqual([
      "active_energy", "apple_exercise_time", "body_fat_percentage", "body_mass", "body_mass_index", "resting_heart_rate", "step_count",
    ]);
    expect(by("active_energy")).toMatchObject({ value: 500, unit: "kcal", local_date: "2026-10-19" });
    expect(by("body_mass")).toMatchObject({ value: 80.4, unit: "kg", source: "RENPHO Health" });
    expect(by("step_count")).toMatchObject({ value: 8000, recorded_at: "2026-10-18T13:00:00.000Z" });
  });

  it("summarises workouts in v2 and v1 shapes", () => {
    expect(parsed.workouts).toEqual([
      {
        external_id: "11111111-2222-3333-4444-555555555555", name: "Traditional Strength Training",
        started_at: "2026-10-18T18:45:00.000Z", ended_at: "2026-10-18T19:30:00.000Z", duration_s: 2700,
        active_kcal: 250, avg_hr: 120.4, max_hr: 160, source: "Test Watch",
      },
      {
        external_id: "66666666-7777-8888-9999-000000000000", name: "Outdoor Walk",
        started_at: "2026-10-19T02:00:00.000Z", ended_at: "2026-10-19T02:20:00.000Z", duration_s: 1200,
        active_kcal: 100, avg_hr: 105, max_hr: 130, source: "Test Watch",
      },
    ]);
  });

  it("converts pounds and hours; rejects units it doesn't know", () => {
    expect(convert(176.37, "lb", "kg")).toBeCloseTo(80, 1);
    expect(convert(1.5, "hr", "min")).toBe(90);
    expect(convert(5, "furlongs", "kg")).toBeNull();
  });

  it("refuses a body that isn't a Health Auto Export payload", () => {
    expect(() => parseHealthExport({ hello: 1 })).toThrow(/data/);
  });
});

describe("handleIngest", () => {
  const TOKEN = "spt_test_token";
  function memoryStore(): IngestStore & { samples: Map<string, unknown>; workouts: Map<string, unknown>; used: number } {
    const s = {
      samples: new Map<string, unknown>(),
      workouts: new Map<string, unknown>(),
      used: 0,
      async userForTokenHash(hash: string) {
        return hash === (await sha256Hex(TOKEN)) ? "user-1" : null;
      },
      async upsertSamples(u: string, rows: { metric: string; recorded_at: string }[]) {
        for (const r of rows) s.samples.set(`${u}|${r.metric}|${r.recorded_at}`, r);
      },
      async upsertWorkouts(u: string, rows: { external_id: string }[]) {
        for (const r of rows) s.workouts.set(`${u}|${r.external_id}`, r);
      },
      async markTokenUsed() {
        s.used++;
      },
    };
    return s as never;
  }
  const post = (body: unknown, token?: string) =>
    new Request("https://x/functions/v1/health-ingest", {
      method: "POST",
      headers: { "content-type": "application/json", ...(token ? { [TOKEN_HEADER]: token } : {}) },
      body: typeof body === "string" ? body : JSON.stringify(body),
    });

  it("rejects missing and unknown tokens", async () => {
    const store = memoryStore();
    expect((await handleIngest(post(fixture), store)).status).toBe(401);
    expect((await handleIngest(post(fixture, "wrong"), store)).status).toBe(401);
    expect(store.samples.size).toBe(0);
  });

  it("stores samples and workouts; re-sending doesn't duplicate", async () => {
    const store = memoryStore();
    const first = await handleIngest(post(fixture, TOKEN), store);
    expect(first.status).toBe(200);
    expect(await first.json()).toEqual({ samples: 7, workouts: 2, skipped: 0 });
    await handleIngest(post(fixture, TOKEN), store);
    expect(store.samples.size).toBe(7);
    expect(store.workouts.size).toBe(2);
    expect(store.used).toBe(2);
  });

  it("accepts the token as a Bearer header too, and explains bad bodies", async () => {
    const store = memoryStore();
    const bearer = new Request("https://x", { method: "POST", headers: { authorization: `Bearer ${TOKEN}` }, body: JSON.stringify(fixture) });
    expect((await handleIngest(bearer, store)).status).toBe(200);
    const bad = await handleIngest(post("not json", TOKEN), store);
    expect(bad.status).toBe(400);
    expect((await bad.json()).error).toMatch(/JSON/);
  });
});
