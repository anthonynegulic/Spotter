"use client";

import { Check, Minus, MoreHorizontal, Plus } from "lucide-react";
import { useState } from "react";
import type { CardioRow, PlanItem } from "@/lib/db/types";
import { btn, cx, Sheet } from "../ui";

export interface CardioValues {
  duration_min: number;
  incline: number | null;
  speed_kmh: number | null;
  distance_km: number | null;
}

function describe(e: CardioValues): string {
  return [
    `${trim(e.duration_min)} min`,
    e.incline !== null && `Incline ${trim(e.incline)}`,
    e.speed_kmh !== null && `${trim(e.speed_kmh)} km/h`,
    e.distance_km !== null && `${trim(e.distance_km)} km`,
  ]
    .filter(Boolean)
    .join(" · ");
}

function trim(n: number): string {
  return String(Math.round(n * 100) / 100);
}

/** Cardio: duration pre-filled from the program, so logging it as planned is one tap. */
export function CardioCard({
  item,
  entry,
  focused,
  onFocus,
  onLog,
  onDelete,
  onMenu,
}: {
  item: PlanItem;
  entry: CardioRow | undefined;
  focused: boolean;
  onFocus: () => void;
  onLog: (values: CardioValues) => void;
  onDelete: () => void;
  onMenu: () => void;
}) {
  const [editing, setEditing] = useState(false);

  if (!focused) {
    return (
      <div className="flex items-center gap-1 rounded-[var(--radius-card)] bg-card">
        <button onClick={onFocus} className="flex min-h-16 min-w-0 flex-1 items-center gap-3 py-3 pl-5 text-left">
          <span className={cx("min-w-0 flex-1 truncate text-lg font-bold", item.skipped && "text-ink-3 line-through")}>{item.name}</span>
          {item.skipped ? (
            <span className="text-sm font-semibold text-ink-3">Skipped</span>
          ) : entry ? (
            <span className="flex items-center gap-1 font-semibold text-accent-ink">
              <Check className="size-5" strokeWidth={3} /> {trim(entry.duration_min)} min
            </span>
          ) : (
            <span className="text-ink-2">{item.duration_minutes} min</span>
          )}
        </button>
        <button onClick={onMenu} aria-label={`Options for ${item.name}`} className="grid min-h-16 w-12 place-items-center text-ink-3">
          <MoreHorizontal className="size-5" />
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-[var(--radius-card)] bg-card p-4">
      <div className="flex items-start gap-2">
        <h3 className="min-w-0 flex-1 text-xl leading-tight font-extrabold">{item.name}</h3>
        <span className="pt-0.5 font-bold text-ink-2">{item.duration_minutes} min</span>
        <button onClick={onMenu} aria-label={`Options for ${item.name}`} className="-mt-1 -mr-1 grid size-10 place-items-center text-ink-3">
          <MoreHorizontal className="size-5" />
        </button>
      </div>
      {item.notes && <p className="mt-1 text-sm text-ink-2">{item.notes}</p>}

      {entry ? (
        <button
          onClick={() => setEditing(true)}
          className="animate-check-in mt-3 flex min-h-12 w-full items-center gap-3 rounded-[var(--radius-button)] bg-pill px-4 text-left"
        >
          <Check className="size-5 text-accent" strokeWidth={3} />
          <span className="font-bold">{describe(entry)}</span>
        </button>
      ) : (
        <CardioForm
          initial={{ duration_min: item.duration_minutes ?? 20, incline: null, speed_kmh: null, distance_km: null }}
          submitLabel="Log cardio"
          onSubmit={onLog}
        />
      )}

      <Sheet open={editing} onClose={() => setEditing(false)} title={`Edit ${item.name}`}>
        {editing && entry && (
          <CardioForm
            initial={entry}
            expanded
            submitLabel="Save"
            onSubmit={(v) => {
              onLog(v);
              setEditing(false);
            }}
            onDelete={() => {
              onDelete();
              setEditing(false);
            }}
          />
        )}
      </Sheet>
    </div>
  );
}

function CardioForm({
  initial,
  submitLabel,
  onSubmit,
  onDelete,
  expanded = false,
}: {
  initial: CardioValues;
  submitLabel: string;
  onSubmit: (v: CardioValues) => void;
  onDelete?: () => void;
  expanded?: boolean;
}) {
  const [duration, setDuration] = useState(initial.duration_min);
  const [details, setDetails] = useState(expanded);
  const [incline, setIncline] = useState(initial.incline?.toString() ?? "");
  const [speed, setSpeed] = useState(initial.speed_kmh?.toString() ?? "");
  const [distance, setDistance] = useState(initial.distance_km?.toString() ?? "");

  const num = (s: string) => {
    const n = Number(s.replace(",", "."));
    return s.trim() === "" || Number.isNaN(n) ? null : n;
  };

  return (
    <div className="mt-3 rounded-[var(--radius-panel)] bg-accent-tint/50 p-3">
      <div className="flex items-center rounded-[var(--radius-control)] bg-card p-1.5">
        <button onClick={() => setDuration((d) => Math.max(1, d - 1))} aria-label="One minute less" className="grid size-11 place-items-center rounded-[var(--radius-button)] bg-pill">
          <Minus className="size-5" />
        </button>
        <div className="flex flex-1 flex-col items-center leading-none">
          <span className="text-3xl font-extrabold">{trim(duration)}</span>
          <span className="mt-1 text-xs font-semibold text-ink-2">minutes</span>
        </div>
        <button onClick={() => setDuration((d) => d + 1)} aria-label="One minute more" className="grid size-11 place-items-center rounded-[var(--radius-button)] bg-pill">
          <Plus className="size-5" />
        </button>
      </div>

      {details ? (
        <div className="mt-3 grid grid-cols-3 gap-2">
          <Field label="Incline" value={incline} onChange={setIncline} />
          <Field label="km/h" value={speed} onChange={setSpeed} />
          <Field label="km" value={distance} onChange={setDistance} />
        </div>
      ) : (
        <button onClick={() => setDetails(true)} className={`${btn.link} mt-1 px-1 text-sm`}>
          <Plus className="size-4" /> Add incline, speed or distance
        </button>
      )}

      <div className="mt-3 flex gap-3">
        {onDelete && (
          <button onClick={onDelete} className={`${btn.quiet} min-h-14 text-danger`}>
            Delete
          </button>
        )}
        <button
          onClick={() => onSubmit({ duration_min: duration, incline: num(incline), speed_kmh: num(speed), distance_km: num(distance) })}
          className={`${btn.primary} flex-1`}
        >
          {submitLabel}
        </button>
      </div>
    </div>
  );
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="flex flex-col items-center rounded-[var(--radius-control)] bg-card p-2">
      <input
        inputMode="decimal"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="–"
        className="w-full bg-transparent text-center text-2xl font-extrabold outline-none"
      />
      <span className="text-xs font-semibold text-ink-2">{label}</span>
    </label>
  );
}
