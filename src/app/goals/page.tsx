"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { ChevronLeft, ChevronRight, Scale } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { AmountSheet } from "@/components/goals/AmountSheet";
import { GoalCard } from "@/components/goals/GoalCard";
import { HistorySheet } from "@/components/goals/HistorySheet";
import { btn, Card, ScreenHeader } from "@/components/ui";
import { useUserId } from "@/lib/auth";
import { ensureDefaultGoals, setManualWeight } from "@/lib/db/goalsRepo";
import { loadGoals, type GoalsData } from "@/lib/db/goalsQueries";
import type { DailyGoalRow } from "@/lib/db/types";
import { addDays, dayKey, dayValue, goalTarget, isMet, keyToDate, lastDays, latestWeight, streak } from "@/lib/goals/goals";
import { useNow } from "@/lib/hooks/useNow";
import { useSyncState } from "@/lib/hooks/useSyncState";
import { supabaseConfigured } from "@/lib/supabase";

export default function GoalsPage() {
  return (
    <AppShell>
      <ScreenHeader
        title="Goals"
        right={
          <Link href="/goals/edit" className={btn.tinted}>
            Edit
          </Link>
        }
      />
      <Goals />
    </AppShell>
  );
}

const MAX_BACK = 30;

function Goals() {
  const userId = useUserId();
  const sync = useSyncState();
  // Re-checked every minute, so the day rolls over at local midnight with the app open.
  const now = useNow(60_000);
  const today = dayKey(new Date(now));
  const [offset, setOffset] = useState(0);
  const day = addDays(today, -offset);
  const data = useLiveQuery(() => loadGoals(today), [today]);
  const [history, setHistory] = useState<DailyGoalRow | null>(null);
  const [weightSheet, setWeightSheet] = useState(false);

  // First visit: create the default goals once this phone has the server's copy.
  useEffect(() => {
    if (data && data.goals.length === 0) void ensureDefaultGoals(userId, { requirePull: supabaseConfigured });
  }, [data, userId, sync.lastSyncedAt]);

  if (!data) return null;
  if (data.goals.length === 0) {
    return <p className="px-[var(--spacing-gutter)] text-ink-2">Setting up your goals…</p>;
  }

  const weight = latestWeight(data.samples);
  const visible = data.goals.filter((g) => !g.hidden);
  const calc = (goal: DailyGoalRow) => {
    const target = goalTarget(goal, weight?.kg ?? null);
    const startedOn = dayKey(new Date(goal.created_at));
    const info = (d: string) => {
      const v = dayValue(goal, d, data.entries, data.samples);
      return { met: isMet(v.value, target), value: v.value, before: d < startedOn };
    };
    return { target, info, streakDays: streak((d) => info(d).met, today, startedOn) };
  };
  const doneCount = visible.filter((g) => isMet(dayValue(g, day, data.entries, data.samples).value, calc(g).target)).length;
  const protein = visible.find((g) => g.type === "protein" && g.target_per_kg);

  return (
    <div className="flex flex-col gap-4 px-[var(--spacing-gutter)]">
      <div className="flex items-center gap-2">
        <button
          onClick={() => setOffset((o) => Math.min(MAX_BACK, o + 1))}
          disabled={offset >= MAX_BACK}
          aria-label="Previous day"
          className="grid size-12 place-items-center rounded-[var(--radius-panel)] bg-card disabled:opacity-40"
        >
          <ChevronLeft className="size-6" />
        </button>
        <div className="min-w-0 flex-1 text-center">
          <div className="text-lg font-extrabold">{offset === 0 ? "Today" : offset === 1 ? "Yesterday" : keyToDate(day).toLocaleDateString("en-AU", { weekday: "long" })}</div>
          <div className="text-sm text-ink-2">{keyToDate(day).toLocaleDateString("en-AU", { day: "numeric", month: "long" })}</div>
        </div>
        <button
          onClick={() => setOffset((o) => Math.max(0, o - 1))}
          disabled={offset === 0}
          aria-label="Next day"
          className="grid size-12 place-items-center rounded-[var(--radius-panel)] bg-card disabled:opacity-40"
        >
          <ChevronRight className="size-6" />
        </button>
      </div>

      <p className="px-1 text-lg">
        <span className="font-extrabold">
          {doneCount} of {visible.length}
        </span>{" "}
        <span className="text-ink-2">goals done{offset === 0 ? " so far" : ""}</span>
      </p>

      {!data.samples.some((s) => s.source !== "manual") && visible.some((g) => g.source === "auto") && offset === 0 && (
        <Link href="/settings" className="flex items-center justify-between rounded-[var(--radius-card)] bg-accent-tint px-5 py-4 font-bold text-accent-ink">
          Connect Apple Health to fill these in automatically
          <ChevronRight className="size-5" />
        </Link>
      )}

      {protein && !weight && (
        <Card className="flex items-center gap-3 p-4">
          <span className="grid size-11 shrink-0 place-items-center rounded-full bg-accent-tint text-accent-ink">
            <Scale className="size-5" />
          </span>
          <p className="min-w-0 flex-1 text-ink-2">Add your weight to set your protein target ({protein.target_per_kg} g per kg).</p>
          <button onClick={() => setWeightSheet(true)} className={btn.tinted}>
            Add
          </button>
        </Card>
      )}

      {visible.map((goal) => {
        const c = calc(goal);
        const value = dayValue(goal, day, data.entries, data.samples);
        const entries = data.entries.filter((e) => e.goal_id === goal.id && e.date === day).sort((a, b) => a.created_at.localeCompare(b.created_at));
        const week = lastDays(day, 7).map((d) => ({ day: d, ...c.info(d) }));
        const note =
          goal.target_per_kg && weight
            ? `${goal.target_per_kg} g per kg of ${weight.kg} kg`
            : goal.target_per_kg
              ? "Add your weight to personalise this target"
              : undefined;
        return (
          <GoalCard
            key={`${goal.id}:${day}`}
            goal={goal}
            day={day}
            isToday={offset === 0}
            value={value}
            target={c.target}
            targetNote={note}
            entries={goal.type === "custom" ? [] : entries}
            week={week}
            streakDays={c.streakDays}
            onHistory={() => setHistory(goal)}
          />
        );
      })}

      {history && (
        <HistorySheet
          open
          onClose={() => setHistory(null)}
          label={history.label}
          today={today}
          dayInfo={calc(history).info}
          streakDays={calc(history).streakDays}
        />
      )}
      <WeightSheet open={weightSheet} onClose={() => setWeightSheet(false)} userId={userId} />
      <HiddenNote data={data} />
    </div>
  );
}

function WeightSheet({ open, onClose, userId }: { open: boolean; onClose: () => void; userId: string }) {
  return (
    <AmountSheet
      open={open}
      onClose={onClose}
      title="Your weight"
      unit="kg"
      decimals
      hint="Used for your protein target. Once Apple Health is connected, your Renpho weigh-ins take over."
      onSave={(kg) => {
        void setManualWeight(userId, kg);
        onClose();
      }}
    />
  );
}

function HiddenNote({ data }: { data: GoalsData }) {
  const hidden = data.goals.filter((g) => g.hidden).length;
  if (!hidden) return null;
  return (
    <p className="pb-2 text-center text-sm text-ink-3">
      {hidden} hidden goal{hidden === 1 ? "" : "s"} ·{" "}
      <Link href="/goals/edit" className="font-semibold text-accent-ink">
        Show
      </Link>
    </p>
  );
}
