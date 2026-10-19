"use client";

import type { ProgramDayRow } from "@/lib/db/types";
import { DAYS_OF_WEEK } from "@/lib/program/schema";
import { Chip, Sheet } from "../ui";

/** Choose which program day to train. Missed days this week come first. */
export function DayPicker({
  open,
  onClose,
  days,
  missed,
  todayId,
  onPick,
}: {
  open: boolean;
  onClose: () => void;
  days: (ProgramDayRow & { items: unknown[] })[];
  missed: string[];
  todayId: string | null;
  onPick: (dayId: string) => void;
}) {
  const ordered = [...days.filter((d) => missed.includes(d.id)), ...days.filter((d) => !missed.includes(d.id))];
  return (
    <Sheet open={open} onClose={onClose} title="Choose a workout">
      <ul className="flex flex-col gap-2">
        {ordered.map((d) => (
          <li key={d.id}>
            <button
              onClick={() => onPick(d.id)}
              className="flex min-h-16 w-full items-center gap-3 rounded-[var(--radius-panel)] bg-pill px-4 text-left active:brightness-95"
            >
              <span className="min-w-0 flex-1">
                <span className="block text-lg font-extrabold">{d.name}</span>
                <span className="text-sm text-ink-2">
                  {d.day_of_week ? `${DAYS_OF_WEEK[d.day_of_week - 1]} · ` : ""}
                  {d.items.length} exercises
                </span>
              </span>
              {missed.includes(d.id) && <Chip tone="orange">Missed</Chip>}
              {d.id === todayId && <Chip tone="blue">Today</Chip>}
            </button>
          </li>
        ))}
      </ul>
    </Sheet>
  );
}
