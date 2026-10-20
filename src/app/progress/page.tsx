"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { ChevronRight, Dumbbell } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { ActivityCard, BodyCard } from "@/components/progress/HealthCards";
import { MetricToggle, RangeTabs } from "@/components/progress/RangeTabs";
import { compact } from "@/components/progress/TrendChart";
import { WeekBars } from "@/components/progress/WeekBars";
import { PrRow } from "@/components/progress/PrRow";
import { btn, Card, Chip, ScreenHeader } from "@/components/ui";
import { loadProgress, type ProgressData } from "@/lib/db/progressQueries";
import { allPrs, exercisePoints, weeklyBuckets, type Range } from "@/lib/workout/progress";
import { formatKg } from "@/lib/workout/stats";

export default function ProgressPage() {
  return (
    <AppShell>
      <ScreenHeader title="Progress" />
      <Progress />
    </AppShell>
  );
}

function Progress() {
  const [range, setRange] = useState<Range>("3m");
  const data = useLiveQuery(loadProgress, []);
  if (!data) return null;

  if (!data.sessions.some((s) => s.finished_at)) {
    return (
      <div className="px-[var(--spacing-gutter)]">
        <Card className="flex flex-col items-center gap-3 py-10 text-center">
          <span className="grid size-14 place-items-center rounded-full bg-accent-tint text-accent-ink">
            <Dumbbell className="size-7" />
          </span>
          <h2 className="text-heading font-extrabold">Your progress starts here</h2>
          <p className="max-w-xs text-ink-2">Finish your first workout and your sessions, PRs and lifts will show up on this screen.</p>
          <Link href="/today" className={btn.tinted}>Go to today&apos;s workout</Link>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 px-[var(--spacing-gutter)]">
      <RangeTabs value={range} onChange={setRange} />
      <Consistency data={data} range={range} />
      <RecentPrs data={data} />
      <BodyCard range={range} />
      <ActivityCard range={range} />
      <Lifts data={data} />
    </div>
  );
}

function Consistency({ data, range }: { data: ProgressData; range: Range }) {
  const [metric, setMetric] = useState<"sessions" | "volume">("sessions");
  const now = new Date();
  const weeks = weeklyBuckets(data.sessions, data.sets, range, now);
  const thisWeek = weeks.at(-1)?.sessions ?? 0;
  // Average over full weeks; the current week isn't over yet.
  const full = weeks.length > 1 ? weeks.slice(0, -1) : weeks;
  const avgSessions = full.reduce((n, w) => n + w.sessions, 0) / full.length;
  const avgVolume = full.reduce((n, w) => n + w.volume, 0) / full.length;

  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-3">
        <h2 className="text-heading font-extrabold">{metric === "sessions" ? "Sessions per week" : "Volume per week"}</h2>
        <Chip tone="blue">
          This week {thisWeek}
          {data.weeklyTarget ? ` of ${data.weeklyTarget}` : ""}
        </Chip>
      </div>
      <p className="mt-2 mb-4 flex items-baseline gap-2">
        <span className="text-[2.5rem] leading-none font-extrabold">
          {metric === "sessions" ? (Math.round(avgSessions * 10) / 10).toString() : compact(Math.round(avgVolume))}
        </span>
        <span className="text-lg text-ink-2">{metric === "sessions" ? "a week on average" : "kg a week on average"}</span>
      </p>
      <WeekBars
        weeks={weeks}
        metric={metric}
        target={data.weeklyTarget}
        unit={metric === "sessions" ? "sessions" : "kg"}
        format={(v) => (metric === "sessions" ? String(v) : v.toLocaleString("en-AU"))}
      />
      <div className="mt-1 flex justify-between text-sm font-semibold text-ink-2">
        <span>{new Date(weeks[0].t).toLocaleDateString("en-AU", { day: "numeric", month: "short" })}</span>
        <span>Now</span>
      </div>
      <div className="mt-4">
        <MetricToggle
          options={[
            { key: "sessions", label: "Sessions" },
            { key: "volume", label: "Volume" },
          ]}
          value={metric}
          onChange={setMetric}
        />
      </div>
    </Card>
  );
}

function RecentPrs({ data }: { data: ProgressData }) {
  const prs = useMemo(() => allPrs(data.sets, data.liveSessionIds), [data]);
  const now = new Date();
  return (
    <Card className="p-5">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-heading font-extrabold">Recent PRs</h2>
        {prs.length > 3 && (
          <Link href="/progress/prs" className="font-bold text-accent-ink">
            See all
          </Link>
        )}
      </div>
      {prs.length === 0 ? (
        <p className="text-ink-2">PRs show up here once you beat a previous session. Keep showing up.</p>
      ) : (
        <ul>
          {prs.slice(0, 3).map((p, i) => (
            <PrRow key={p.set.id} pr={p} name={data.exercises.get(p.set.exercise_id)?.name ?? "Exercise"} equipment={data.exercises.get(p.set.exercise_id)?.equipment} now={now} first={i === 0} />
          ))}
        </ul>
      )}
    </Card>
  );
}

function Lifts({ data }: { data: ProgressData }) {
  const lifts = useMemo(() => {
    const byExercise = new Map<string, typeof data.sets>();
    for (const s of data.sets) byExercise.set(s.exercise_id, [...(byExercise.get(s.exercise_id) ?? []), s]);
    const sessionsById = new Map(data.sessions.map((s) => [s.id, s]));
    return [...byExercise.entries()]
      .map(([id, sets]) => {
        const grouped = new Map<string, typeof sets>();
        for (const s of sets) grouped.set(s.session_id, [...(grouped.get(s.session_id) ?? []), s]);
        const history = [...grouped.entries()]
          .map(([sid, ss]) => ({ session: sessionsById.get(sid)!, sets: ss }))
          .filter((h) => h.session)
          .sort((a, b) => a.session.started_at.localeCompare(b.session.started_at));
        const pts = exercisePoints(history);
        const ex = data.exercises.get(id);
        return { id, name: ex?.name ?? "Exercise", bodyweight: ex?.equipment === "bodyweight", sessions: history.length, last: pts.at(-1) };
      })
      .filter((l) => l.last)
      .sort((a, b) => b.last!.t - a.last!.t);
  }, [data]);

  if (lifts.length === 0) return null;
  return (
    <section>
      <h2 className="mb-2 px-1 text-sm font-bold tracking-wide text-ink-2 uppercase">Your lifts</h2>
      <ul className="flex flex-col gap-2">
        {lifts.map((l) => (
          <li key={l.id}>
            <Link href={`/progress/exercise?id=${l.id}`} className="flex min-h-16 items-center gap-3 rounded-[var(--radius-card)] bg-card px-5 py-3 active:brightness-95">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-lg font-bold">{l.name}</span>
                <span className="text-sm text-ink-2">
                  {l.sessions} session{l.sessions === 1 ? "" : "s"}
                  {l.bodyweight
                    ? ` · Top set BW + ${formatKg(l.last!.topSet)} kg × ${l.last!.topSetReps}`
                    : l.last!.e1rm > 0
                      ? ` · Est. 1RM ${formatKg(l.last!.e1rm)} kg`
                      : ""}
                </span>
              </span>
              <ChevronRight className="size-5 text-ink-3" />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
