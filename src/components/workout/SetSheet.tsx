"use client";

import { Trash2 } from "lucide-react";
import { useState } from "react";
import type { Equipment } from "@/lib/program/schema";
import { MAX_REPS, MAX_WEIGHT_KG } from "@/lib/workout/equipment";
import { formatKg } from "@/lib/workout/stats";
import { btn, cx, Sheet } from "../ui";
import { Wheel, weightValues } from "../WheelPicker";

const STEPS = [1, 1.25, 2, 2.5, 4, 5];
const REPS = Array.from({ length: MAX_REPS + 1 }, (_, i) => i);

/**
 * Bottom sheet with weight and reps wheels side by side. Used to pick values
 * for the next set, and to edit or delete a logged one.
 */
export function SetSheet({
  open,
  onClose,
  title,
  equipment,
  weight,
  reps,
  increment,
  note,
  onDone,
  onIncrementChange,
  onDelete,
  doneLabel = "Done",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  equipment: Equipment | null;
  weight: number;
  reps: number;
  increment: number;
  note?: string | null;
  onDone: (weight: number, reps: number, note: string | null) => void;
  onIncrementChange?: (step: number) => void;
  onDelete?: () => void;
  doneLabel?: string;
}) {
  return (
    <Sheet open={open} onClose={onClose} title={title}>
      {open && (
        <SetSheetBody
          equipment={equipment}
          weight={weight}
          reps={reps}
          increment={increment}
          note={note}
          onDone={onDone}
          onIncrementChange={onIncrementChange}
          onDelete={onDelete}
          doneLabel={doneLabel}
        />
      )}
    </Sheet>
  );
}

function SetSheetBody({
  equipment,
  weight: initialWeight,
  reps: initialReps,
  increment,
  note: initialNote,
  onDone,
  onIncrementChange,
  onDelete,
  doneLabel,
}: Omit<Parameters<typeof SetSheet>[0], "open" | "onClose" | "title">) {
  const [weight, setWeight] = useState(initialWeight);
  const [reps, setReps] = useState(initialReps);
  const [step, setStep] = useState(increment);
  const [note, setNote] = useState(initialNote ?? "");
  const values = weightValues(step, MAX_WEIGHT_KG, weight);
  const weightLabel = equipment === "bodyweight" ? "Added (kg)" : equipment === "dumbbell" ? "Each (kg)" : "Weight (kg)";

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-3">
        <div className="flex flex-1 flex-col items-center">
          <span className="mb-1 text-sm font-bold text-ink-2">{weightLabel}</span>
          <Wheel label="Weight" values={values} value={weight} onChange={setWeight} format={formatKg} />
        </div>
        <div className="flex flex-1 flex-col items-center">
          <span className="mb-1 text-sm font-bold text-ink-2">Reps</span>
          <Wheel label="Reps" values={REPS} value={reps} onChange={setReps} />
        </div>
      </div>

      {onIncrementChange && (
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
          <span className="shrink-0 text-sm font-bold text-ink-2">Step</span>
          {STEPS.map((s) => (
            <button
              key={s}
              onClick={() => {
                setStep(s);
                onIncrementChange(s);
              }}
              className={cx(
                "min-h-9 shrink-0 rounded-full px-3 text-sm font-bold",
                s === step ? "bg-accent text-white" : "bg-pill text-ink-2",
              )}
            >
              {formatKg(s)} kg
            </button>
          ))}
        </div>
      )}

      {initialNote !== undefined && (
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Note (optional)"
          className="min-h-12 rounded-[var(--radius-control)] border-2 border-line px-4 outline-none focus:border-accent"
        />
      )}

      <div className="flex gap-3">
        {onDelete && (
          <button onClick={onDelete} className={`${btn.quiet} min-h-14 px-5 text-danger`} aria-label="Delete set">
            <Trash2 className="size-5" />
          </button>
        )}
        <button onClick={() => onDone(weight, reps, note.trim() || null)} className={`${btn.primary} flex-1`}>
          {doneLabel}
        </button>
      </div>
    </div>
  );
}
