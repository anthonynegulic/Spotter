"use client";

import { Check, Minus, MoreHorizontal, Plus } from "lucide-react";
import { useState } from "react";
import type { ExerciseRow, PlanItem, SetRow } from "@/lib/db/types";
import type { SessionSets } from "@/lib/db/repo";
import { DEFAULT_INCREMENT, MAX_REPS, MAX_WEIGHT_KG } from "@/lib/workout/equipment";
import { prefill } from "@/lib/workout/prefill";
import { formatKg, formatReps, type PrKind } from "@/lib/workout/stats";
import { btn, cx, PrBadge } from "../ui";
import { SetSheet } from "./SetSheet";

export interface StrengthCardProps {
  item: PlanItem;
  exercise: ExerciseRow | undefined;
  logged: SetRow[];
  lastTime: SessionSets | null;
  prs: Map<string, PrKind[]>;
  focused: boolean;
  onFocus: () => void;
  onLog: (weight: number, reps: number) => void;
  onEditSet: (set: SetRow, patch: { weight_kg: number; reps: number; note: string | null }) => void;
  onDeleteSet: (set: SetRow) => void;
  onAddSet: () => void;
  onIncrementChange: (step: number) => void;
  onMenu: () => void;
}

export function weightText(kg: number, equipment: string | null): string {
  if (equipment === "bodyweight") return kg > 0 ? `BW + ${formatKg(kg)} kg` : "BW";
  return `${formatKg(kg)} kg`;
}

function lastTimeLine(last: SessionSets | null): string | null {
  if (!last || last.sets.length === 0) return null;
  const weights = new Set(last.sets.map((s) => s.weight_kg));
  if (weights.size === 1) return `${formatKg(last.sets[0].weight_kg)} kg × ${last.sets.map((s) => s.reps).join(", ")}`;
  return last.sets.map((s) => `${formatKg(s.weight_kg)} × ${s.reps}`).join(" · ");
}

export function StrengthCard(props: StrengthCardProps) {
  const { item, logged, focused, onFocus, onMenu } = props;
  const done = logged.length >= item.sets;
  const target = `${item.sets} × ${formatReps(item.reps_min, item.reps_max)}`;

  if (!focused) {
    return (
      <div className="flex items-center gap-1 rounded-[var(--radius-card)] bg-card">
        <button onClick={onFocus} className="flex min-h-16 min-w-0 flex-1 items-center gap-3 py-3 pl-5 text-left">
          <span className={cx("min-w-0 flex-1 truncate text-lg font-bold", item.skipped && "text-ink-3 line-through")}>{item.name}</span>
          {item.skipped ? (
            <span className="text-sm font-semibold text-ink-3">Skipped</span>
          ) : done ? (
            <span className="flex items-center gap-1 font-semibold text-accent-ink">
              <Check className="size-5" strokeWidth={3} /> {logged.length} sets
            </span>
          ) : (
            <span className="text-ink-2">{logged.length > 0 ? `${logged.length} of ${item.sets}` : target}</span>
          )}
        </button>
        <button onClick={onMenu} aria-label={`Options for ${item.name}`} className="grid min-h-16 w-12 place-items-center text-ink-3">
          <MoreHorizontal className="size-5" />
        </button>
      </div>
    );
  }
  return <FocusedStrengthCard {...props} target={target} done={done} />;
}

function FocusedStrengthCard({
  item,
  exercise,
  logged,
  lastTime,
  prs,
  onLog,
  onEditSet,
  onDeleteSet,
  onAddSet,
  onIncrementChange,
  onMenu,
  target,
  done,
}: StrengthCardProps & { target: string; done: boolean }) {
  const [editing, setEditing] = useState<SetRow | null>(null);
  const equipment = exercise?.equipment ?? item.equipment;
  const increment = exercise?.increment_kg ?? DEFAULT_INCREMENT[equipment ?? "other"];
  const nextNumber = logged.length + 1;
  const last = lastTimeLine(lastTime);

  return (
    <div className="rounded-[var(--radius-card)] bg-card p-4">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <h3 className="text-xl leading-tight font-extrabold">{item.name}</h3>
          {item.swapped_from && <p className="text-sm text-ink-3">Swapped from {item.swapped_from}</p>}
        </div>
        <span className="pt-0.5 font-bold text-ink-2">{target}</span>
        <button onClick={onMenu} aria-label={`Options for ${item.name}`} className="-mt-1 -mr-1 grid size-10 place-items-center text-ink-3">
          <MoreHorizontal className="size-5" />
        </button>
      </div>
      {item.notes && <p className="mt-1 text-sm text-ink-2">{item.notes}</p>}
      {last && <p className="mt-1 text-sm text-ink-2">Last time: {last}</p>}

      {logged.length > 0 && (
        <ul className="mt-3 flex flex-col gap-2">
          {logged.map((s) => (
            <li key={s.id}>
              <button
                onClick={() => setEditing(s)}
                className="animate-check-in flex min-h-12 w-full items-center gap-3 rounded-[var(--radius-button)] bg-pill px-4 text-left"
              >
                <Check className="size-5 text-accent" strokeWidth={3} />
                <span className="text-ink-2">Set {s.set_number}</span>
                <span className="font-bold">
                  {weightText(s.weight_kg, equipment)} × {s.reps}
                </span>
                {s.note && <span className="min-w-0 flex-1 truncate text-sm text-ink-3">{s.note}</span>}
                {prs.has(s.id) && <PrBadge className="ml-auto" />}
              </button>
            </li>
          ))}
        </ul>
      )}

      {!done ? (
        <CurrentSet
          key={`${item.key}:${nextNumber}:${logged.at(-1)?.id ?? ""}`}
          item={item}
          equipment={equipment}
          increment={increment}
          setNumber={nextNumber}
          logged={logged}
          lastTime={lastTime}
          onLog={onLog}
          onIncrementChange={onIncrementChange}
        />
      ) : (
        <div className="mt-3 flex items-center justify-between rounded-[var(--radius-panel)] bg-accent-tint/60 px-4 py-3">
          <span className="font-bold text-accent-ink">All sets done</span>
          <button onClick={onAddSet} className={`${btn.white} text-accent-ink`}>
            <Plus className="size-4" /> Add set
          </button>
        </div>
      )}

      <SetSheet
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing ? `Edit set ${editing.set_number}` : ""}
        equipment={equipment}
        weight={editing?.weight_kg ?? 0}
        reps={editing?.reps ?? 0}
        increment={increment}
        note={editing?.note ?? null}
        doneLabel="Save"
        onDone={(w, r, note) => {
          if (editing) onEditSet(editing, { weight_kg: w, reps: r, note });
          setEditing(null);
        }}
        onDelete={() => {
          if (editing) onDeleteSet(editing);
          setEditing(null);
        }}
      />
    </div>
  );
}

function CurrentSet({
  item,
  equipment,
  increment,
  setNumber,
  logged,
  lastTime,
  onLog,
  onIncrementChange,
}: {
  item: PlanItem;
  equipment: PlanItem["equipment"];
  increment: number;
  setNumber: number;
  logged: SetRow[];
  lastTime: SessionSets | null;
  onLog: (weight: number, reps: number) => void;
  onIncrementChange: (step: number) => void;
}) {
  const initial = prefill({ setNumber, today: logged, lastTime: lastTime?.sets ?? [], equipment, repsMin: item.reps_min });
  const [weight, setWeight] = useState(initial.weight);
  const [reps, setReps] = useState(initial.reps);
  const [sheet, setSheet] = useState(false);

  const lastSame = lastTime?.sets.find((s) => s.set_number === setNumber);
  const following = setNumber < item.sets ? setNumber + 1 : null;

  return (
    <>
      <div className="mt-3 rounded-[var(--radius-panel)] bg-accent-tint/50 p-3">
        <div className="mb-2 flex items-center justify-between px-1">
          <span className="font-extrabold">Set {setNumber}</span>
          <span className="text-sm font-bold text-accent-ink">
            {lastSame ? `Last time ${formatKg(lastSame.weight_kg)} × ${lastSame.reps}` : lastTime ? "" : "First time"}
          </span>
        </div>
        <div className="flex gap-2">
          <Stepper
            value={weight}
            display={formatKg(weight)}
            unit={equipment === "bodyweight" ? "kg added" : equipment === "dumbbell" ? "kg each" : "kg"}
            onMinus={() => setWeight((w) => Math.max(0, round2(w - increment)))}
            onPlus={() => setWeight((w) => Math.min(MAX_WEIGHT_KG, round2(w + increment)))}
            onOpen={() => setSheet(true)}
            label="weight"
          />
          <Stepper
            value={reps}
            display={String(reps)}
            unit="reps"
            onMinus={() => setReps((r) => Math.max(0, r - 1))}
            onPlus={() => setReps((r) => Math.min(MAX_REPS, r + 1))}
            onOpen={() => setSheet(true)}
            label="reps"
          />
        </div>
        <button onClick={() => onLog(weight, reps)} className={`${btn.primary} mt-3 w-full`}>
          Log set
        </button>
      </div>
      {following && (
        <p className="mt-2 px-1 text-sm text-ink-3">
          Set {following} · {weightText(weight, equipment)} × {lastTime?.sets.find((s) => s.set_number === following)?.reps ?? reps}
        </p>
      )}
      <SetSheet
        open={sheet}
        onClose={() => setSheet(false)}
        title={`Set ${setNumber}`}
        equipment={equipment}
        weight={weight}
        reps={reps}
        increment={increment}
        onIncrementChange={onIncrementChange}
        onDone={(w, r) => {
          setWeight(w);
          setReps(r);
          setSheet(false);
        }}
      />
    </>
  );
}

function Stepper({
  display,
  unit,
  onMinus,
  onPlus,
  onOpen,
  label,
}: {
  value: number;
  display: string;
  unit: string;
  onMinus: () => void;
  onPlus: () => void;
  onOpen: () => void;
  label: string;
}) {
  return (
    <div className="flex flex-1 items-center rounded-[var(--radius-control)] bg-card p-1.5">
      <button onClick={onMinus} aria-label={`Less ${label}`} className="grid size-11 shrink-0 place-items-center rounded-[var(--radius-button)] bg-pill">
        <Minus className="size-5" />
      </button>
      <button onClick={onOpen} aria-label={`Choose ${label}`} className="flex min-w-0 flex-1 flex-col items-center leading-none">
        <span className="text-3xl font-extrabold">{display}</span>
        <span className="mt-1 text-xs font-semibold text-ink-2">{unit}</span>
      </button>
      <button onClick={onPlus} aria-label={`More ${label}`} className="grid size-11 shrink-0 place-items-center rounded-[var(--radius-button)] bg-pill">
        <Plus className="size-5" />
      </button>
    </div>
  );
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
