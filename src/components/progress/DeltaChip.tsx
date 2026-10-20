"use client";

import { TrendingDown, TrendingUp } from "lucide-react";
import { cx } from "../ui";

/**
 * Change over the range, shown whichever way it goes. Gains use the blue
 * tint; drops use the warm tint and an arrow so they're noticed, not hidden
 * (Ante's call, see DECISIONS.md).
 */
export function DeltaChip({ delta, unit, since, format = (n: number) => String(n) }: { delta: number; unit: string; since: string; format?: (n: number) => string }) {
  const up = delta > 0;
  const down = delta < 0;
  const Icon = down ? TrendingDown : TrendingUp;
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-bold whitespace-nowrap",
        up && "bg-accent-tint text-accent-ink",
        down && "bg-warm-tint text-warm-ink",
        !up && !down && "bg-pill text-ink-2",
      )}
    >
      {(up || down) && <Icon className="size-4" aria-hidden />}
      {up ? "+" : down ? "−" : "±"}
      {format(Math.abs(delta))} {unit} {since}
    </span>
  );
}
