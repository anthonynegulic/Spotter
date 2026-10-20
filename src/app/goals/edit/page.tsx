"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { AppShell } from "@/components/AppShell";
import { AmountSheet } from "@/components/goals/AmountSheet";
import { Toggle } from "@/components/Toggle";
import { btn, Card, cx, ScreenHeader } from "@/components/ui";
import { useUserId } from "@/lib/auth";
import { addCustomGoal, deleteGoal, reorderGoals, setManualWeight, updateGoal } from "@/lib/db/goalsRepo";
import { loadGoals } from "@/lib/db/goalsQueries";
import type { DailyGoalRow } from "@/lib/db/types";
import { dayKey, goalTarget, latestWeight, PROTEIN_FALLBACK_G } from "@/lib/goals/goals";

export default function EditGoalsPage() {
  return (
    <AppShell tabs={false}>
      <ScreenHeader title="Edit goals" back="/goals" />
      <EditGoals />
    </AppShell>
  );
}

function EditGoals() {
  const userId = useUserId();
  const data = useLiveQuery(() => loadGoals(dayKey(new Date())), []);
  const [weightSheet, setWeightSheet] = useState(false);
  const [newGoal, setNewGoal] = useState("");
  if (!data) return null;
  const weight = latestWeight(data.samples);
  const goals = data.goals;

  function move(i: number, delta: -1 | 1) {
    const next = [...goals];
    const [g] = next.splice(i, 1);
    next.splice(i + delta, 0, g);
    void reorderGoals(next);
  }

  return (
    <div className="flex flex-col gap-4 px-[var(--spacing-gutter)] pb-10">
      <Card className="flex items-center justify-between gap-3 p-5">
        <div>
          <h2 className="font-extrabold">Body weight</h2>
          <p className="text-ink-2">
            {weight
              ? `${weight.kg} kg · ${weight.source === "manual" ? "entered" : "from Apple Health"} ${new Date(weight.at).toLocaleDateString("en-AU", { day: "numeric", month: "short" })}`
              : "Not set yet"}
          </p>
        </div>
        <button onClick={() => setWeightSheet(true)} className={btn.tinted}>
          {weight ? "Update" : "Add"}
        </button>
      </Card>

      {goals.map((g, i) => (
        <GoalEditor
          key={`${g.id}:${g.updated_at ?? ""}`}
          goal={g}
          weightKg={weight?.kg ?? null}
          first={i === 0}
          last={i === goals.length - 1}
          onMove={(d) => move(i, d)}
        />
      ))}

      <Card className="flex flex-col gap-3 p-5">
        <h2 className="font-extrabold">Add a yes/no goal</h2>
        <p className="text-sm text-ink-2">Something you tick off each day, like stretching or creatine.</p>
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!newGoal.trim()) return;
            void addCustomGoal(userId, newGoal, goals.length);
            setNewGoal("");
          }}
        >
          <input
            value={newGoal}
            onChange={(e) => setNewGoal(e.target.value)}
            placeholder="e.g. Stretch 10 minutes"
            className="min-h-12 min-w-0 flex-1 rounded-[var(--radius-control)] border-2 border-line px-3 outline-none focus:border-accent"
          />
          <button type="submit" disabled={!newGoal.trim()} className={btn.primary + " min-h-12"} aria-label="Add goal">
            <Plus className="size-5" />
          </button>
        </form>
      </Card>

      <AmountSheet
        open={weightSheet}
        onClose={() => setWeightSheet(false)}
        title="Your weight"
        unit="kg"
        decimals
        initial={weight?.kg}
        onSave={(kg) => {
          void setManualWeight(userId, kg);
          setWeightSheet(false);
        }}
      />
    </div>
  );
}

/** One goal's settings. Text and number fields save when you leave them. */
function GoalEditor({ goal, weightKg, first, last, onMove }: { goal: DailyGoalRow; weightKg: number | null; first: boolean; last: boolean; onMove: (d: -1 | 1) => void }) {
  const custom = goal.type === "custom";
  const perKg = goal.target_per_kg !== null;
  return (
    <Card className={cx("flex flex-col gap-3 p-5", goal.hidden && "opacity-70")}>
      <div className="flex items-center gap-3">
        <input
          defaultValue={goal.label}
          aria-label="Goal name"
          onBlur={(e) => {
            const label = e.target.value.trim();
            if (label && label !== goal.label) void updateGoal(goal, { label });
          }}
          className="min-h-11 min-w-0 flex-1 rounded-[var(--radius-button)] border-2 border-transparent px-2 text-lg font-extrabold outline-none focus:border-accent"
        />
        <span className="text-sm font-semibold text-ink-2">{goal.hidden ? "Hidden" : "Shown"}</span>
        <Toggle checked={!goal.hidden} onChange={(v) => void updateGoal(goal, { hidden: !v })} label={`Show ${goal.label}`} />
      </div>

      {goal.type === "protein" && (
        <div className="grid grid-cols-2 gap-1 rounded-[var(--radius-panel)] bg-pill p-1" role="radiogroup" aria-label="Protein target">
          {[
            { key: true, label: "Per kg" },
            { key: false, label: "Fixed" },
          ].map((o) => (
            <button
              key={o.label}
              role="radio"
              aria-checked={perKg === o.key}
              onClick={() =>
                void updateGoal(
                  goal,
                  o.key
                    ? { target_per_kg: goal.target_per_kg ?? 2, target: null }
                    : { target_per_kg: null, target: goalTarget(goal, weightKg) || PROTEIN_FALLBACK_G },
                )
              }
              className={cx("min-h-11 rounded-[var(--radius-button)] font-bold", perKg === o.key ? "bg-card shadow-sm" : "text-ink-2")}
            >
              {o.label}
            </button>
          ))}
        </div>
      )}

      {!custom &&
        (perKg ? (
          <NumberRow
            label="Grams per kg of body weight"
            value={goal.target_per_kg!}
            decimals
            suffix={weightKg ? `= ${goalTarget(goal, weightKg)} g a day` : "g/kg"}
            onSave={(v) => void updateGoal(goal, { target_per_kg: v })}
          />
        ) : (
          <NumberRow label="Daily target" value={goal.target ?? 0} suffix={goal.unit} onSave={(v) => void updateGoal(goal, { target: v })} />
        ))}

      <div className="flex gap-2">
        <IconBtn label="Move up" disabled={first} onClick={() => onMove(-1)} icon={ArrowUp} />
        <IconBtn label="Move down" disabled={last} onClick={() => onMove(1)} icon={ArrowDown} />
        {custom && (
          <IconBtn
            label="Delete goal"
            danger
            onClick={() => {
              if (window.confirm(`Delete “${goal.label}”? Its history goes too.`)) void deleteGoal(goal);
            }}
            icon={Trash2}
          />
        )}
      </div>
    </Card>
  );
}

function NumberRow({ label, value, suffix, decimals, onSave }: { label: string; value: number; suffix: string; decimals?: boolean; onSave: (v: number) => void }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-sm font-bold text-ink-2">{label}</span>
      <span className="flex items-center gap-3">
        <input
          defaultValue={value}
          inputMode={decimals ? "decimal" : "numeric"}
          onBlur={(e) => {
            const n = Number(e.target.value.replace(",", "."));
            if (Number.isFinite(n) && n > 0 && n !== value) onSave(decimals ? Math.round(n * 100) / 100 : Math.round(n));
            else e.target.value = String(value);
          }}
          className="min-h-12 w-32 rounded-[var(--radius-control)] border-2 border-line px-3 text-lg font-bold outline-none focus:border-accent"
        />
        <span className="text-ink-2">{suffix}</span>
      </span>
    </label>
  );
}

function IconBtn({
  label,
  onClick,
  icon: Icon,
  disabled,
  danger,
}: {
  label: string;
  onClick: () => void;
  icon: React.ComponentType<{ className?: string }>;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className={cx("grid size-11 place-items-center rounded-[var(--radius-button)] bg-pill disabled:opacity-30", danger && "text-danger")}
    >
      <Icon className="size-5" />
    </button>
  );
}
