import { db } from "@/lib/db/local";
import type { HealthSampleRow, HealthWorkoutRow } from "@/lib/db/types";

/**
 * Where the app reads Apple Health data from (BRIEF.md §5.6). Today that's the
 * local copy of what the Health Auto Export bridge sent. If real-time HealthKit
 * ever matters, a Capacitor build can provide another implementation of this
 * interface and nothing else in the app needs to change.
 */
export interface HealthSource {
  /** Samples for the given metrics (all time; small enough to load whole). */
  samples(metrics: string[]): Promise<HealthSampleRow[]>;
  /** Every sample, for screens that need several metrics at once. */
  allSamples(): Promise<HealthSampleRow[]>;
  /** Workouts that started within the window. */
  workoutsBetween(from: Date, to: Date): Promise<HealthWorkoutRow[]>;
}

export const bridgeSource: HealthSource = {
  async samples(metrics) {
    return (await db.health_samples.where("metric").anyOf(metrics).toArray()).filter((s) => !s.deleted_at);
  },
  async allSamples() {
    return (await db.health_samples.toArray()).filter((s) => !s.deleted_at);
  },
  async workoutsBetween(from, to) {
    return (await db.health_workouts.where("started_at").between(from.toISOString(), to.toISOString()).toArray()).filter((w) => !w.deleted_at);
  },
};

export const healthSource: HealthSource = bridgeSource;
