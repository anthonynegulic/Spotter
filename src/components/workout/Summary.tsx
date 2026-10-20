"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { HeartPulse, Trophy } from "lucide-react";
import { db } from "@/lib/db/local";
import { exerciseHistory } from "@/lib/db/repo";
import { matchWorkout } from "@/lib/health/attach";
import { healthSource } from "@/lib/health/source";
import type { SetRow } from "@/lib/db/types";
import { countThisWeek, encouragement, prsForSets, summarise } from "@/lib/workout/summary";
import { formatKg } from "@/lib/workout/stats";
import { btn, Card, PrBadge } from "../ui";

/** The "Finish workout" summary. Encouraging whatever the numbers. */
export function Summary({ sessionId, onClose }: { sessionId: string; onClose: () => void }) {
  const data = useLiveQuery(async () => {
    const session = await db.sessions.get(sessionId);
    if (!session) return null;
    const sets = (await db.sets.where("session_id").equals(sessionId).toArray()).filter((s) => !s.deleted_at);
    const cardio = (await db.cardio_entries.where("session_id").equals(sessionId).toArray()).filter((c) => !c.deleted_at);
    const exerciseIds = [...new Set(sets.map((s) => s.exercise_id))];
    const all = new Map<string, SetRow[]>();
    for (const id of exerciseIds) all.set(id, (await exerciseHistory(id)).flatMap((h) => h.sets));
    const exercises = new Map((await db.exercises.bulkGet(exerciseIds)).filter(Boolean).map((e) => [e!.id, e!]));
    const sessions = (await db.sessions.toArray()).filter((s) => !s.deleted_at && s.finished_at);
    const summary = summarise(session, sets, cardio, prsForSets(sets, all));
    const day = new Date(session.started_at).getTime();
    const nearby = await healthSource.workoutsBetween(new Date(day - 86_400_000), new Date(day + 86_400_000));
    const watch = matchWorkout(session, nearby);
    return { session, summary, exercises, sessions, watch };
  }, [sessionId]);

  if (!data) return null;
  const { session, summary, exercises, sessions, watch } = data;
  const message = encouragement({
    prCount: summary.prs.length,
    sessionsThisWeek: countThisWeek(sessions, new Date(session.started_at)),
    totalSessions: sessions.length,
  });

  // One line per exercise: its best PR set.
  const prLines = [...new Map(summary.prs.map((p) => [p.exerciseId, p])).values()];

  return (
    <div className="flex flex-col gap-4 px-[var(--spacing-gutter)]">
      <div className="pt-safe pb-2">
        <p className="font-semibold text-ink-2">{session.name}</p>
        <h1 className="text-title font-extrabold tracking-tight">Workout complete</h1>
        <p className="mt-2 text-lg text-ink-2">{message}</p>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Stat label="Duration" value={`${summary.durationMin}`} unit="min" />
        <Stat label="Sets" value={`${summary.setCount}`} />
        <Stat label="Volume" value={summary.volumeKg.toLocaleString("en-AU")} unit="kg" />
      </div>
      {summary.cardioMin > 0 && <Stat label="Cardio" value={`${summary.cardioMin}`} unit="min" />}

      {watch && (
        <Card className="p-5">
          <h2 className="mb-3 flex items-center gap-2 text-heading font-extrabold">
            <HeartPulse className="size-5 text-warm" /> From your Watch
          </h2>
          <div className="grid grid-cols-3 gap-3">
            <WatchStat label="Calories" value={watch.active_kcal} unit="kcal" />
            <WatchStat label="Avg HR" value={watch.avg_hr} unit="bpm" />
            <WatchStat label="Max HR" value={watch.max_hr} unit="bpm" />
          </div>
          <p className="mt-3 text-sm text-ink-2">{watch.name}, matched by time.</p>
        </Card>
      )}

      {prLines.length > 0 && (
        <Card className="p-5">
          <h2 className="mb-3 flex items-center gap-2 text-heading font-extrabold">
            <Trophy className="size-5 text-warm" /> New PRs
          </h2>
          <ul className="flex flex-col gap-3">
            {prLines.map((p) => (
              <li key={p.setId} className="flex items-center gap-3">
                <PrBadge />
                <span className="min-w-0 flex-1">
                  <span className="block font-bold">{exercises.get(p.exerciseId)?.name}</span>
                  <span className="text-sm text-ink-2">
                    {formatKg(p.weightKg)} kg × {p.reps}
                    {p.kinds.includes("weight") ? " · heaviest yet" : " · best estimated 1RM"}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {session.notes && (
        <Card className="p-5">
          <h2 className="mb-1 text-sm font-bold text-ink-2">Notes</h2>
          <p>{session.notes}</p>
        </Card>
      )}

      <button onClick={onClose} className={`${btn.primary} mt-2 w-full`}>
        Done
      </button>
    </div>
  );
}

function WatchStat({ label, value, unit }: { label: string; value: number | null; unit: string }) {
  return (
    <div>
      <div className="text-sm font-semibold text-ink-2">{label}</div>
      <div className="text-xl font-extrabold">
        {value === null ? "–" : Math.round(value)}
        {value !== null && <span className="ml-1 text-sm font-semibold text-ink-2">{unit}</span>}
      </div>
    </div>
  );
}

function Stat({ label, value, unit }: { label: string; value: string; unit?: string }) {
  return (
    <Card className="p-4">
      <div className="text-sm font-semibold text-ink-2">{label}</div>
      <div className="mt-1 text-2xl font-extrabold">
        {value}
        {unit && <span className="ml-1 text-base font-semibold text-ink-2">{unit}</span>}
      </div>
    </Card>
  );
}
