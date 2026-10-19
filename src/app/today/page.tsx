"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { CloudOff, Moon } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { AppShell } from "@/components/AppShell";
import { RestBar } from "@/components/RestBar";
import { btn, Card, Chip } from "@/components/ui";
import { DayPicker } from "@/components/workout/DayPicker";
import { Summary } from "@/components/workout/Summary";
import { WorkoutView } from "@/components/workout/WorkoutView";
import { useUserId } from "@/lib/auth";
import { db } from "@/lib/db/local";
import { activeProgramId, liveSessions, loadProgramTree, type ProgramTree } from "@/lib/db/queries";
import { discardSession, finishSession } from "@/lib/db/repo";
import type { SessionRow } from "@/lib/db/types";
import { useOnline } from "@/lib/hooks/useOnline";
import { useSyncState } from "@/lib/hooks/useSyncState";
import { isSameLocalDay, missedThisWeek, planToday, programWeek } from "@/lib/workout/schedule";

export default function TodayPage() {
  return (
    <AppShell>
      <RestBar />
      <Today />
    </AppShell>
  );
}

async function loadToday() {
  const programId = await activeProgramId();
  const tree = programId ? await loadProgramTree(programId) : null;
  const sessions = await liveSessions();
  const open = sessions.filter((s) => !s.finished_at).sort((a, b) => b.started_at.localeCompare(a.started_at))[0] ?? null;
  return { tree, sessions, open };
}

function Today() {
  const userId = useUserId();
  const [chosenDayId, setChosenDayId] = useState<string | null>(null);
  const [summaryId, setSummaryId] = useState<string | null>(null);
  const [picker, setPicker] = useState(false);
  const data = useLiveQuery(loadToday, []);

  if (!data) return null;
  const { tree, sessions, open } = data;
  const now = new Date();

  if (summaryId) {
    return (
      <div className="pb-6">
        <Summary sessionId={summaryId} onClose={() => { setSummaryId(null); setChosenDayId(null); }} />
      </div>
    );
  }

  if (open && !isSameLocalDay(new Date(open.started_at), now)) {
    return <StaleSession session={open} />;
  }

  const eyebrow = (dayName?: string) => {
    const weekday = now.toLocaleDateString("en-AU", { weekday: "long" });
    if (!tree) return weekday;
    const week = programWeek(tree.program.activated_at, now);
    const weeks = tree.version.weeks;
    return [weekday, weeks ? `Week ${Math.min(week, weeks)} of ${weeks}` : `Week ${week}`, dayName].filter(Boolean).join(" · ");
  };

  if (open) {
    const day = tree?.days.find((d) => d.id === open.program_day_id) ?? null;
    return (
      <>
        <OfflineNote />
        <WorkoutView key={open.id} userId={userId} programId={open.program_id} day={day} session={open} eyebrow={eyebrow()} onFinished={setSummaryId} />
      </>
    );
  }

  if (!tree) return <NoProgram />;

  const programSessions = sessions.filter((s) => s.program_id === tree.program.id && s.finished_at);
  const plan = planToday(tree.days, programSessions, now);
  const missed = missedThisWeek(tree.days, programSessions, now);
  const todayDayId = plan.kind === "workout" ? plan.dayId : null;
  const finishedToday = sessions
    .filter((s) => s.finished_at && isSameLocalDay(new Date(s.started_at), now))
    .sort((a, b) => b.started_at.localeCompare(a.started_at));

  const dayPicker = (
    <DayPicker
      open={picker}
      onClose={() => setPicker(false)}
      days={tree.days}
      missed={missed}
      todayId={todayDayId}
      onPick={(id) => {
        setChosenDayId(id);
        setPicker(false);
      }}
    />
  );

  const dayId = chosenDayId ?? (finishedToday.length === 0 ? todayDayId : null);
  const day = dayId ? tree.days.find((d) => d.id === dayId) : null;

  if (day) {
    return (
      <>
        <OfflineNote />
        <WorkoutView
          key={day.id}
          userId={userId}
          programId={tree.program.id}
          day={day}
          session={null}
          eyebrow={eyebrow()}
          onChooseDay={() => setPicker(true)}
          onFinished={setSummaryId}
        />
        {dayPicker}
      </>
    );
  }

  if (finishedToday.length > 0) {
    return (
      <div className="pt-safe flex flex-col gap-4 px-[var(--spacing-gutter)]">
        <Heading eyebrow={eyebrow()} title="Done for today" />
        <Card className="p-5">
          <p className="text-lg">
            <span className="font-bold">{finishedToday[0].name}</span> is in the books. Nice work.
          </p>
          <div className="mt-4 flex flex-col gap-2">
            <button onClick={() => setSummaryId(finishedToday[0].id)} className={btn.tinted}>
              View summary
            </button>
            <button onClick={() => setPicker(true)} className={btn.quiet}>
              Train again
            </button>
          </div>
        </Card>
        {dayPicker}
      </div>
    );
  }

  return <RestDay eyebrow={eyebrow()} tree={tree} missed={missed} onTrain={() => setPicker(true)} picker={dayPicker} />;
}

function Heading({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <header className="pt-2">
      <p className="font-semibold text-ink-2">{eyebrow}</p>
      <h1 className="text-display font-extrabold tracking-tight">{title}</h1>
    </header>
  );
}

function RestDay({ eyebrow, tree, missed, onTrain, picker }: { eyebrow: string; tree: ProgramTree; missed: string[]; onTrain: () => void; picker: React.ReactNode }) {
  const missedNames = tree.days.filter((d) => missed.includes(d.id)).map((d) => d.name);
  const next = tree.days.find((d) => d.day_of_week !== null && d.day_of_week > ((new Date().getDay() + 6) % 7) + 1);
  return (
    <div className="pt-safe flex flex-col gap-4 px-[var(--spacing-gutter)]">
      <Heading eyebrow={eyebrow} title="Rest day" />
      <Card className="flex flex-col gap-4 p-5">
        <div className="flex items-start gap-3">
          <span className="grid size-12 shrink-0 place-items-center rounded-full bg-accent-tint text-accent-ink">
            <Moon className="size-6" />
          </span>
          <p className="text-lg">
            Recovery is part of the program.
            {next && (
              <>
                {" "}Next up: <span className="font-bold">{next.name}</span>.
              </>
            )}
          </p>
        </div>
        {missedNames.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-ink-2">Still to do this week:</span>
            {missedNames.map((n) => (
              <Chip key={n} tone="orange">{n}</Chip>
            ))}
          </div>
        )}
        <button onClick={onTrain} className={btn.tinted}>
          Train anyway
        </button>
      </Card>
      {picker}
    </div>
  );
}

function NoProgram() {
  return (
    <div className="pt-safe flex flex-col gap-4 px-[var(--spacing-gutter)]">
      <Heading eyebrow={new Date().toLocaleDateString("en-AU", { weekday: "long" })} title="Welcome" />
      <Card className="flex flex-col items-start gap-3 p-5">
        <h2 className="text-heading font-extrabold">Add your program</h2>
        <p className="text-ink-2">Paste the program Claude or ChatGPT wrote for you. It takes under a minute.</p>
        <Link href="/program/import" className={`${btn.primary} w-full`}>
          Import a program
        </Link>
      </Card>
    </div>
  );
}

function StaleSession({ session }: { session: SessionRow }) {
  const counts = useLiveQuery(async () => {
    const sets = (await db.sets.where("session_id").equals(session.id).toArray()).filter((s) => !s.deleted_at);
    const cardio = (await db.cardio_entries.where("session_id").equals(session.id).toArray()).filter((c) => !c.deleted_at);
    const lastAt = [...sets.map((s) => s.logged_at), ...cardio.map((c) => c.logged_at)].sort().at(-1) ?? session.started_at;
    return { logged: sets.length + cardio.length, lastAt };
  }, [session.id]);
  if (!counts) return null;
  const when = new Date(session.started_at).toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short" });
  return (
    <div className="pt-safe flex flex-col gap-4 px-[var(--spacing-gutter)]">
      <Heading eyebrow="Before today's workout" title="Unfinished workout" />
      <Card className="flex flex-col gap-4 p-5">
        <p className="text-lg">
          <span className="font-bold">{session.name}</span> from {when} is still open
          {counts.logged > 0 ? ` with ${counts.logged} ${counts.logged === 1 ? "entry" : "entries"} logged.` : ", with nothing logged."}
        </p>
        <button onClick={() => void finishSession(session, counts.lastAt)} className={btn.primary}>
          Finish it
        </button>
        <button onClick={() => void discardSession(session)} className={btn.quiet}>
          Discard it
        </button>
      </Card>
    </div>
  );
}

function OfflineNote() {
  const sync = useSyncState();
  const online = useOnline();
  if (online || sync.pending === 0) return <div className="pt-safe" />;
  return (
    <div className="pt-safe px-[var(--spacing-gutter)]">
      <p className="flex items-center gap-2 rounded-[var(--radius-button)] bg-pill px-3 py-2 text-sm font-semibold text-ink-2">
        <CloudOff className="size-4" /> Offline. {sync.pending} change{sync.pending === 1 ? "" : "s"} saved on your phone, syncing when you&apos;re back online.
      </p>
    </div>
  );
}
