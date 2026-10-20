"use client";

import { addDays, keyToDate } from "@/lib/goals/goals";
import { cx, Sheet } from "../ui";

/** Five weeks of one goal, Monday to Sunday rows, plus how often it was met. */
export function HistorySheet({
  open,
  onClose,
  label,
  today,
  dayInfo,
  streakDays,
}: {
  open: boolean;
  onClose: () => void;
  label: string;
  today: string;
  dayInfo: (day: string) => { met: boolean; value: number; before: boolean };
  streakDays: number;
}) {
  const todayDate = keyToDate(today);
  const mondayOffset = (todayDate.getDay() + 6) % 7;
  const start = addDays(today, -mondayOffset - 28);
  const days = Array.from({ length: 35 }, (_, i) => addDays(start, i));
  const last30 = Array.from({ length: 30 }, (_, i) => addDays(today, -i)).map(dayInfo).filter((d) => !d.before);
  const metCount = last30.filter((d) => d.met).length;

  return (
    <Sheet open={open} onClose={onClose} title={label}>
      <div className="mb-4 grid grid-cols-2 gap-3">
        <div className="rounded-[var(--radius-panel)] bg-pill p-4">
          <div className="text-sm font-semibold text-ink-2">Current streak</div>
          <div className="text-2xl font-extrabold">
            {streakDays} day{streakDays === 1 ? "" : "s"}
          </div>
        </div>
        <div className="rounded-[var(--radius-panel)] bg-pill p-4">
          <div className="text-sm font-semibold text-ink-2">Last 30 days</div>
          <div className="text-2xl font-extrabold">
            {metCount} of {last30.length}
          </div>
        </div>
      </div>
      <div className="grid grid-cols-7 gap-2 text-center">
        {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => (
          <span key={i} className="text-xs font-bold text-ink-3">
            {d}
          </span>
        ))}
        {days.map((d) => {
          const info = d > today ? null : dayInfo(d);
          return (
            <span
              key={d}
              title={keyToDate(d).toLocaleDateString("en-AU", { day: "numeric", month: "short" })}
              className={cx(
                "grid aspect-square place-items-center rounded-[10px] text-sm font-semibold",
                !info || info.before ? "bg-transparent text-ink-3" : info.met ? "bg-accent text-white" : info.value > 0 ? "bg-accent-tint text-accent-ink" : "bg-pill text-ink-2",
                d === today && "ring-2 ring-accent ring-offset-2 ring-offset-card",
              )}
            >
              {keyToDate(d).getDate()}
            </span>
          );
        })}
      </div>
      <p className="mt-4 text-sm text-ink-2">Filled days hit the target; pale days had some progress.</p>
    </Sheet>
  );
}
