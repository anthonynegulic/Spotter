"use client";

import { RANGES, type Range } from "@/lib/workout/progress";
import { cx } from "../ui";

/** The 4W / 3M / 6M / All segmented control. */
export function RangeTabs({ value, onChange, className }: { value: Range; onChange: (r: Range) => void; className?: string }) {
  return (
    <div role="tablist" aria-label="Time range" className={cx("grid grid-cols-4 gap-1 rounded-[var(--radius-panel)] bg-pill p-1", className)}>
      {RANGES.map((r) => (
        <button
          key={r.key}
          role="tab"
          aria-selected={r.key === value}
          onClick={() => onChange(r.key)}
          className={cx(
            "min-h-11 rounded-[var(--radius-button)] text-lg font-bold",
            r.key === value ? "bg-card text-ink shadow-sm" : "text-ink-2",
          )}
        >
          {r.label}
        </button>
      ))}
    </div>
  );
}

/** Small pill toggles, e.g. Est. 1RM / Top set / Volume. */
export function MetricToggle<T extends string>({ options, value, onChange }: { options: { key: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="flex flex-wrap gap-2" role="tablist">
      {options.map((o) => (
        <button
          key={o.key}
          role="tab"
          aria-selected={o.key === value}
          onClick={() => onChange(o.key)}
          className={cx("min-h-11 rounded-full px-5 text-lg font-bold", o.key === value ? "bg-accent text-white" : "bg-pill text-ink-2")}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
