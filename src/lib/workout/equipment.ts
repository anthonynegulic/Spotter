import type { Equipment } from "@/lib/program/schema";

/** Default weight-wheel step per equipment (BRIEF.md §5.4). Editable per exercise. */
export const DEFAULT_INCREMENT: Record<Equipment, number> = {
  barbell: 2.5,
  dumbbell: 2,
  machine: 5,
  cable: 5,
  kettlebell: 4,
  bodyweight: 2.5,
  other: 2.5,
};

/** Where the weight starts when there's no history: an empty bar, a light pair, etc. */
export const DEFAULT_START_WEIGHT: Record<Equipment, number> = {
  barbell: 20,
  dumbbell: 10,
  machine: 20,
  cable: 15,
  kettlebell: 12,
  bodyweight: 0,
  other: 10,
};

export const MAX_WEIGHT_KG = 300;
export const MAX_REPS = 50;
