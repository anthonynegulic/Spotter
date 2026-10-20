"use client";

import { useState } from "react";
import type { WeekBucket } from "@/lib/workout/progress";
import { cx } from "../ui";

/**
 * Columns per week: max 24px wide, 4px rounded tops, square bases. The
 * current week shows its target as a pale track behind the bar, so "2 of 4"
 * reads at a glance. Tap a column for its numbers.
 */
export function WeekBars({
  weeks,
  metric,
  target,
  format,
  unit,
}: {
  weeks: WeekBucket[];
  metric: "sessions" | "volume";
  target: number | null;
  format: (v: number) => string;
  unit: string;
}) {
  const [picked, setPicked] = useState<number | null>(null);
  const value = (w: WeekBucket) => (metric === "sessions" ? w.sessions : w.volume);
  const max = Math.max(1, ...weeks.map(value), metric === "sessions" && target ? target : 0);
  const current = weeks.length - 1;

  return (
    <div className="relative">
      <div className="flex h-[150px] items-end gap-[2px]" role="list" aria-label={`${metric === "sessions" ? "Sessions" : "Volume"} per week`}>
        {weeks.map((w, i) => {
          const v = value(w);
          const track = i === current && metric === "sessions" && target ? target : 0;
          const label = `Week of ${new Date(w.t).toLocaleDateString("en-AU", { day: "numeric", month: "short" })}: ${format(v)} ${unit}`;
          return (
            <button
              key={w.t}
              role="listitem"
              aria-label={label}
              onClick={() => setPicked(picked === i ? null : i)}
              className="relative flex h-full min-w-0 flex-1 items-end justify-center"
            >
              {track > 0 && (
                <span className="absolute bottom-0 w-full max-w-6 rounded-t-[4px] bg-accent-tint" style={{ height: `${(track / max) * 100}%` }} />
              )}
              {v > 0 && (
                <span
                  className={cx("relative w-full max-w-6 rounded-t-[4px] bg-accent transition-opacity", picked !== null && picked !== i && "opacity-40")}
                  style={{ height: `${(v / max) * 100}%` }}
                />
              )}
            </button>
          );
        })}
      </div>
      {picked !== null && weeks[picked] && (
        <div className="pointer-events-none absolute -top-2 left-1/2 -translate-x-1/2 rounded-[var(--radius-button)] bg-ink px-3 py-2 text-sm whitespace-nowrap text-white shadow-lg">
          <span className="font-semibold opacity-80">
            Week of {new Date(weeks[picked].t).toLocaleDateString("en-AU", { day: "numeric", month: "short" })}
          </span>{" "}
          <span className="font-extrabold">
            {format(value(weeks[picked]))} {unit}
          </span>
        </div>
      )}
    </div>
  );
}
