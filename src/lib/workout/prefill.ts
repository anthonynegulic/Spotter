import type { Equipment } from "@/lib/program/schema";
import { DEFAULT_START_WEIGHT } from "./equipment";

export interface LoggedSet {
  set_number: number;
  weight_kg: number;
  reps: number;
}

/**
 * Values the weight and reps start at for the next set (BRIEF.md §5.4).
 *
 * - Weight: today's previous set if there is one (so a weight bump on set 1
 *   carries through), else the same set number last time, else a sensible
 *   default for the equipment.
 * - Reps: the same set number last time, else today's previous set, else the
 *   bottom of the target range.
 *
 * If last time had fewer sets, the extra set copies last time's final set.
 */
export function prefill(opts: {
  setNumber: number;
  today: LoggedSet[];
  lastTime: LoggedSet[];
  equipment: Equipment | null;
  repsMin: number | null;
}): { weight: number; reps: number } {
  const { setNumber, today, lastTime, equipment, repsMin } = opts;
  const prevToday = [...today].filter((s) => s.set_number < setNumber).sort((a, b) => b.set_number - a.set_number)[0];
  const sortedLast = [...lastTime].sort((a, b) => a.set_number - b.set_number);
  const lastSame = sortedLast.find((s) => s.set_number === setNumber) ?? sortedLast.at(-1);

  const weight = prevToday?.weight_kg ?? lastSame?.weight_kg ?? DEFAULT_START_WEIGHT[equipment ?? "other"];
  const reps = lastSame?.reps ?? prevToday?.reps ?? repsMin ?? 8;
  return { weight, reps };
}
