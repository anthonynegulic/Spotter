"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { Merge, MoreHorizontal } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { DeltaChip } from "@/components/progress/DeltaChip";
import { MetricToggle, RangeTabs } from "@/components/progress/RangeTabs";
import { TrendChart } from "@/components/progress/TrendChart";
import { btn, Card, ScreenHeader, Sheet } from "@/components/ui";
import { ExercisePicker } from "@/components/workout/ExercisePicker";
import { db } from "@/lib/db/local";
import { exerciseHistory, mergeExercises } from "@/lib/db/repo";
import type { ExerciseRow } from "@/lib/db/types";
import {
  change,
  exercisePoints,
  exerciseStats,
  formatSetList,
  inRange,
  relativeDay,
  sinceLabel,
  type Range,
} from "@/lib/workout/progress";
import { formatKg } from "@/lib/workout/stats";

type Metric = "e1rm" | "top" | "volume";
const METRICS: { key: Metric; label: string; title: string }[] = [
  { key: "e1rm", label: "Est. 1RM", title: "Estimated 1RM" },
  { key: "top", label: "Top set", title: "Top set" },
  { key: "volume", label: "Volume", title: "Session volume" },
];
const HISTORY_PAGE = 8;

export default function ExercisePage() {
  return (
    <AppShell>
      <Suspense>
        <ExerciseDetail />
      </Suspense>
    </AppShell>
  );
}

function ExerciseDetail() {
  const id = useSearchParams().get("id");
  const [range, setRange] = useState<Range>("3m");
  const [chosen, setChosen] = useState<Metric | null>(null);
  const [shown, setShown] = useState(HISTORY_PAGE);
  const [menu, setMenu] = useState(false);
  const [picking, setPicking] = useState(false);
  const [mergeInto, setMergeInto] = useState<ExerciseRow | null>(null);
  const router = useRouter();
  const data = useLiveQuery(async () => {
    if (!id) return null;
    const exercise = await db.exercises.get(id);
    if (!exercise) return null;
    // A merged exercise forwards to the one it became.
    if (exercise.merged_into) return { forward: exercise.merged_into } as const;
    return { exercise, history: await exerciseHistory(id) };
  }, [id]);
  const forward = data && "forward" in data ? data.forward : null;
  useEffect(() => {
    if (forward) router.replace(`/progress/exercise?id=${forward}`);
  }, [forward, router]);

  if (data === undefined) return null;
  if (!data) {
    return (
      <>
        <ScreenHeader title="Exercise" back="/progress" />
        <p className="px-[var(--spacing-gutter)] text-ink-2">That exercise isn&apos;t on this phone yet.</p>
      </>
    );
  }

  if ("forward" in data) return null;
  const { exercise, history } = data;
  const bw = exercise.equipment === "bodyweight";
  // An estimated 1RM from added weight alone means nothing, so bodyweight lifts start on top set.
  const metrics = bw ? METRICS.filter((m) => m.key !== "e1rm") : METRICS;
  const metric: Metric = chosen && metrics.some((m) => m.key === chosen) ? chosen : metrics[0].key;
  const setMetric = setChosen;
  const now = new Date();
  const all = exercisePoints(history);
  const pts = inRange(all, range, now);
  const valueOf = (p: (typeof all)[number]) => (metric === "e1rm" ? p.e1rm : metric === "top" ? p.topSet : p.volume);
  const series = pts.map((p) => ({ t: p.t, value: valueOf(p) }));
  const latest = series.at(-1);
  const delta = change(series);
  const stats = exerciseStats(history);
  const fmt = (v: number) => (metric === "volume" ? Math.round(v).toLocaleString("en-AU") : formatKg(Math.round(v * 10) / 10));
  const recent = [...history].filter((h) => h.sets.length).reverse();
  const title = METRICS.find((m) => m.key === metric)!.title;

  return (
    <>
      <ScreenHeader
        title={exercise.name}
        back="/progress"
        right={
          <button onClick={() => setMenu(true)} aria-label="Exercise options" className="grid size-12 shrink-0 place-items-center rounded-[var(--radius-panel)] bg-card">
            <MoreHorizontal className="size-6" />
          </button>
        }
      />
      <Sheet open={menu} onClose={() => setMenu(false)} title={exercise.name}>
        <button
          onClick={() => {
            setMenu(false);
            setPicking(true);
          }}
          className="flex min-h-14 w-full items-center gap-3 rounded-[var(--radius-panel)] bg-pill px-4 text-left text-lg font-bold"
        >
          <Merge className="size-5" /> Merge with…
        </button>
        <p className="mt-3 text-sm text-ink-2">Use this when two exercises are really the same one, e.g. an import created a duplicate.</p>
      </Sheet>
      <ExercisePicker
        open={picking}
        onClose={() => setPicking(false)}
        title={`Merge ${exercise.name} with…`}
        defaultEquipment={exercise.equipment}
        excludeId={exercise.id}
        existingOnly
        onPick={(choice) => {
          setPicking(false);
          if ("existing" in choice) setMergeInto(choice.existing);
        }}
      />
      <Sheet open={mergeInto !== null} onClose={() => setMergeInto(null)} title="Merge exercises?">
        {mergeInto && (
          <div className="flex flex-col gap-4">
            <p>
              <span className="font-bold">{exercise.name}</span> will be combined into <span className="font-bold">{mergeInto.name}</span>. Its history, PRs and
              names move across, and future imports of either name land on {mergeInto.name}.
            </p>
            <p className="text-sm text-ink-2">This can&apos;t be undone.</p>
            <div className="flex gap-3">
              <button onClick={() => setMergeInto(null)} className={`${btn.quiet} min-h-14 flex-1`}>
                Cancel
              </button>
              <button
                onClick={async () => {
                  const target = mergeInto;
                  setMergeInto(null);
                  await mergeExercises(exercise.id, target.id);
                  router.replace(`/progress/exercise?id=${target.id}`);
                }}
                className={`${btn.primary} flex-1`}
              >
                Merge
              </button>
            </div>
          </div>
        )}
      </Sheet>
      <div className="flex flex-col gap-4 px-[var(--spacing-gutter)]">
        <Card className="p-5">
          <RangeTabs value={range} onChange={setRange} />
          <p className="mt-5 text-lg font-semibold text-ink-2">{bw && metric !== "volume" ? `${title} (added weight)` : title}</p>
          {latest ? (
            <>
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-2">
                <span className="text-[3.25rem] leading-none font-extrabold tracking-tight">{fmt(latest.value)}</span>
                <span className="text-xl text-ink-2">kg</span>
                {delta && <DeltaChip delta={delta.delta} unit="kg" since={sinceLabel(delta.since, range, now)} format={fmt} />}
              </div>
              {series.length > 1 ? (
                <div className="mt-4">
                  <TrendChart points={series} range={range} format={fmt} unit="kg" label={`${title} over time`} />
                </div>
              ) : (
                <p className="mt-4 rounded-[var(--radius-panel)] bg-pill p-4 text-ink-2">One session in this range. The chart draws itself after your next one.</p>
              )}
            </>
          ) : (
            <p className="mt-3 rounded-[var(--radius-panel)] bg-pill p-4 text-ink-2">No sessions in this range. Try a longer one.</p>
          )}
          <div className="mt-4">
            <MetricToggle options={metrics} value={metric} onChange={setMetric} />
          </div>
        </Card>

        <div className="grid grid-cols-3 gap-3">
          <Tile label="Heaviest" value={stats.heaviest ? `${formatKg(stats.heaviest.weight)} × ${stats.heaviest.reps}` : "–"} />
          <Tile label="Best set" value={stats.bestSet ? `${formatKg(stats.bestSet.weight)} × ${stats.bestSet.reps}` : "–"} />
          <Tile label="Sessions" value={String(stats.sessions)} />
        </div>

        {recent.length > 0 && (
          <Card className="px-5 py-1">
            <ul>
              {recent.slice(0, shown).map((h, i) => (
                <li key={h.session.id} className={`flex items-center justify-between gap-3 py-4 ${i > 0 ? "border-t border-line" : ""}`}>
                  <span className="shrink-0 text-lg font-bold">{relativeDay(new Date(h.session.started_at), now, true)}</span>
                  <span className="min-w-0 text-right text-ink-2">
                    {formatSetList(h.sets)}
                    {!h.session.finished_at ? " · in progress" : ""}
                  </span>
                </li>
              ))}
            </ul>
            {recent.length > shown && (
              <button onClick={() => setShown((n) => n + HISTORY_PAGE)} className="w-full border-t border-line py-4 font-bold text-accent-ink">
                Show more
              </button>
            )}
          </Card>
        )}
      </div>
    </>
  );
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <Card className="p-4">
      <div className="text-sm font-semibold text-ink-2">{label}</div>
      <div className="mt-1 text-xl font-extrabold">{value}</div>
    </Card>
  );
}
