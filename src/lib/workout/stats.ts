
/** Epley estimated one-rep max. Zero when there's nothing to estimate from. */
export function estimated1RM(weightKg: number, reps: number): number {
  if (weightKg <= 0 || reps <= 0) return 0;
  if (reps === 1) return weightKg;
  return weightKg * (1 + reps / 30);
}

/**
 * Volume of one set. Dumbbell weights are per dumbbell and not doubled;
 * bodyweight counts only the added weight. See DECISIONS.md.
 */
export function setVolume(weightKg: number, reps: number): number {
  return weightKg * reps;
}

export interface SetLike {
  id: string;
  weight_kg: number;
  reps: number;
}

export type PrKind = "weight" | "e1rm";

/**
 * PRs for `set` given every earlier set of the same exercise (any session,
 * including earlier sets today). Heaviest weight and best estimated 1RM, per
 * the progress-charts definitions. A first-ever set isn't a PR: there's
 * nothing to beat yet.
 */
export function prKinds(set: SetLike, earlier: SetLike[]): PrKind[] {
  if (earlier.length === 0 || set.reps <= 0) return [];
  let maxWeight = 0;
  let maxE1rm = 0;
  for (const s of earlier) {
    if (s.reps <= 0) continue;
    maxWeight = Math.max(maxWeight, s.weight_kg);
    maxE1rm = Math.max(maxE1rm, estimated1RM(s.weight_kg, s.reps));
  }
  const kinds: PrKind[] = [];
  if (set.weight_kg > maxWeight) kinds.push("weight");
  const e = estimated1RM(set.weight_kg, set.reps);
  if (e > 0 && e > maxE1rm + 1e-9) kinds.push("e1rm");
  return kinds;
}

export function formatKg(kg: number): string {
  return Number.isInteger(kg) ? String(kg) : kg.toFixed(2).replace(/0$/, "");
}

export function formatReps(min: number | null, max: number | null): string {
  if (min === null || max === null) return "AMRAP";
  return min === max ? String(min) : `${min}–${max}`;
}
