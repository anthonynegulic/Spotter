"use client";

import { ChevronDown, ChevronUp } from "lucide-react";
import { useState } from "react";
import { formatReps } from "@/lib/workout/stats";
import { cx } from "./ui";

export interface DayView {
  key: string;
  name: string;
  dayOfWeek: string | null;
  items: ItemView[];
}

export interface ItemView {
  type: "strength" | "cardio";
  name: string;
  sets: number | null;
  repsMin: number | null;
  repsMax: number | null;
  durationMinutes: number | null;
  supersetGroup: string | null;
}

/** Collapses consecutive items sharing a superset letter into one row. */
function rows(items: ItemView[]) {
  const out: { group: string | null; items: ItemView[] }[] = [];
  for (const it of items) {
    const last = out.at(-1);
    if (it.supersetGroup && last?.group === it.supersetGroup) last.items.push(it);
    else out.push({ group: it.supersetGroup, items: [it] });
  }
  return out;
}

function target(it: ItemView): string {
  if (it.type === "cardio") return `${it.durationMinutes} min`;
  return `${it.sets} × ${formatReps(it.repsMin, it.repsMax)}`;
}

/** The accordion of days used on the review and program screens. */
export function ProgramDays({ days }: { days: DayView[] }) {
  const [open, setOpen] = useState<string | null>(days[0]?.key ?? null);
  return (
    <div className="rounded-[var(--radius-card)] bg-card px-4">
      {days.map((day, i) => {
        const isOpen = open === day.key;
        return (
          <section key={day.key} className={cx(i > 0 && "border-t border-line")}>
            <button
              onClick={() => setOpen(isOpen ? null : day.key)}
              className="flex w-full items-center gap-3 py-4 text-left"
              aria-expanded={isOpen}
            >
              <span className="min-w-0 flex-1 truncate text-heading font-extrabold">
                {day.dayOfWeek ? `${day.dayOfWeek} · ` : ""}
                {day.name}
              </span>
              <span className="text-ink-2">{day.items.length} exercises</span>
              {isOpen ? <ChevronUp className="size-5 text-ink-2" /> : <ChevronDown className="size-5 text-ink-2" />}
            </button>
            {isOpen && (
              <ul className="flex flex-col gap-3 pb-4">
                {rows(day.items).map((row, j) => (
                  <li key={j} className="flex items-center gap-3">
                    {row.group && (
                      <span className="grid size-7 shrink-0 place-items-center rounded-full bg-accent-tint text-sm font-extrabold text-accent-ink">
                        {row.group}
                      </span>
                    )}
                    <span className="min-w-0 flex-1 font-medium">{row.items.map((it) => it.name).join(" + ")}</span>
                    <span className="shrink-0 text-ink-2">{target(row.items[0])}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}
