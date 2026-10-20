"use client";

import { Check, Flame, Plus, X } from "lucide-react";
import { useState } from "react";
import type { DailyEntryRow, DailyGoalRow } from "@/lib/db/types";
import { addEntry, removeEntry, setDayTotal, toggleDone } from "@/lib/db/goalsRepo";
import { formatAmount, keyToDate, quickAddsFor, type DayValue } from "@/lib/goals/goals";
import { btn, Card, Chip, cx } from "../ui";
import { AmountSheet } from "./AmountSheet";

export interface GoalDay {
  day: string;
  met: boolean;
  value: number;
}

/**
 * One goal for one day: progress, quick actions, and the last seven days.
 * Tapping the dots opens the longer history.
 */
export function GoalCard({
  goal,
  day,
  isToday,
  value,
  target,
  targetNote,
  entries,
  week,
  streakDays,
  onHistory,
}: {
  goal: DailyGoalRow;
  day: string;
  isToday: boolean;
  value: DayValue;
  target: number;
  targetNote?: string;
  entries: DailyEntryRow[];
  week: GoalDay[];
  streakDays: number;
  onHistory: () => void;
}) {
  const [sheet, setSheet] = useState<"custom" | "total" | null>(null);
  const met = value.value >= target && target > 0;
  const pct = Math.min(100, target > 0 ? (value.value / target) * 100 : 0);
  const custom = goal.type === "custom";
  const quickAdds = quickAddsFor(goal);
  const additive = quickAdds.length > 0;

  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-3">
        <h2 className="min-w-0 truncate text-heading font-extrabold">{goal.label}</h2>
        {streakDays >= 2 && (
          <Chip tone="orange" className="shrink-0 gap-1">
            <Flame className="size-4" aria-hidden /> {streakDays}-day streak
          </Chip>
        )}
      </div>

      {custom ? (
        <button
          onClick={() => void toggleDone(goal, day, !met)}
          className={cx(
            "mt-3 flex min-h-14 w-full items-center justify-center gap-2 rounded-[var(--radius-control)] text-lg font-bold",
            met ? "animate-pop bg-accent text-white" : "bg-accent-tint text-accent-ink",
          )}
          aria-pressed={met}
        >
          {met ? (
            <>
              <Check className="size-5" strokeWidth={3} /> Done
            </>
          ) : (
            "Mark as done"
          )}
        </button>
      ) : (
        <>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-[2.25rem] leading-none font-extrabold">{Math.round(value.value).toLocaleString("en-AU")}</span>
            <span className="text-lg text-ink-2">
              / {Math.round(target).toLocaleString("en-AU")}
              {goal.unit === "steps" ? "" : ` ${goal.unit}`}
            </span>
            {met && (
              <span className="ml-auto flex items-center gap-1 font-bold text-accent-ink">
                <Check className="size-5" strokeWidth={3} /> Done
              </span>
            )}
          </div>
          <div className="mt-3 h-3 overflow-hidden rounded-full bg-accent-tint" role="progressbar" aria-valuemin={0} aria-valuemax={target} aria-valuenow={value.value} aria-label={`${goal.label} progress`}>
            <div className="h-full rounded-full bg-accent transition-[width] duration-300" style={{ width: `${pct}%` }} />
          </div>
          <p className="mt-2 text-sm text-ink-2">
            {value.from === "health" ? "From Apple Health" : targetNote ?? (goal.source === "auto" ? "Entered by hand until Apple Health is connected" : "")}
          </p>

          {additive ? (
            <>
              <div className="mt-3 grid grid-cols-3 gap-2">
                {quickAdds.map((n) => (
                  <button key={n} onClick={() => void addEntry(goal, day, n)} className={`${btn.tinted} min-h-12`}>
                    +{formatAmount(n, goal.unit)}
                  </button>
                ))}
                <button onClick={() => setSheet("custom")} className={`${btn.quiet} min-h-12`}>
                  <Plus className="size-4" /> Other
                </button>
              </div>
              {entries.length > 0 && (
                <ul className="mt-3 flex flex-wrap gap-2" aria-label="Added today">
                  {entries.map((e) => (
                    <li key={e.id}>
                      <button
                        onClick={() => void removeEntry(e)}
                        className="animate-check-in inline-flex min-h-9 items-center gap-1.5 rounded-full bg-pill pr-2 pl-3 text-sm font-semibold"
                        aria-label={`Remove ${formatAmount(e.value, goal.unit)}`}
                      >
                        +{formatAmount(e.value, goal.unit)} <X className="size-4 text-ink-3" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </>
          ) : (
            value.from !== "health" && (
              <button onClick={() => setSheet("total")} className={`${btn.quiet} mt-3 w-full`}>
                {value.from === "manual" ? "Change total" : `Enter ${isToday ? "today's" : "the day's"} total`}
              </button>
            )
          )}
        </>
      )}

      <button onClick={onHistory} className="mt-4 flex w-full items-end justify-between gap-1" aria-label={`${goal.label} history`}>
        {week.map((d) => (
          <span key={d.day} className="flex flex-1 flex-col items-center gap-1">
            <span
              className={cx(
                "size-6 rounded-full",
                d.met ? "bg-accent" : d.value > 0 ? "bg-accent-tint" : "bg-pill",
                d.day === day && "ring-2 ring-accent ring-offset-2 ring-offset-card",
              )}
            />
            <span className="text-xs font-semibold text-ink-3">{keyToDate(d.day).toLocaleDateString("en-AU", { weekday: "narrow" })}</span>
          </span>
        ))}
      </button>

      <AmountSheet
        open={sheet !== null}
        onClose={() => setSheet(null)}
        title={sheet === "custom" ? `Add ${goal.label.toLowerCase()}` : `${goal.label} total`}
        unit={goal.unit}
        initial={sheet === "total" && value.from === "manual" ? value.value : null}
        saveLabel={sheet === "custom" ? "Add" : "Save"}
        onSave={(v) => {
          if (sheet === "custom") void addEntry(goal, day, v);
          else void setDayTotal(goal, day, v);
          setSheet(null);
        }}
      />
    </Card>
  );
}
