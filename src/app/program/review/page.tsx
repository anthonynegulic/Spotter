"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { ProgramDays, type DayView } from "@/components/ProgramDays";
import { btn, Card, Chip, ScreenHeader } from "@/components/ui";
import { useUserId } from "@/lib/auth";
import { importProgram } from "@/lib/db/repo";
import type { Program } from "@/lib/program/schema";
import { PENDING_IMPORT_KEY } from "@/lib/program/pending";

export default function ReviewPage() {
  return (
    <AppShell tabs={false}>
      <Review />
    </AppShell>
  );
}

function Review() {
  const router = useRouter();
  const userId = useUserId();
  // Only rendered after sign-in has resolved on the client, so sessionStorage is available.
  const [pending] = useState<{ program: Program; raw: string } | null>(() => {
    const stored = sessionStorage.getItem(PENDING_IMPORT_KEY);
    return stored ? JSON.parse(stored) : null;
  });
  const [makeActive, setMakeActive] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!pending) router.replace("/program/import");
  }, [pending, router]);

  if (!pending) return null;
  const { program } = pending;
  const exerciseCount = program.days.reduce((n, d) => n + d.items.length, 0);
  const calendar = program.days.every((d) => d.dayOfWeek);

  const days: DayView[] = program.days.map((d) => ({
    key: d.id,
    name: d.name,
    dayOfWeek: d.dayOfWeek,
    items: d.items.map((it) =>
      it.type === "strength"
        ? { type: "strength", name: it.name, sets: it.sets, repsMin: it.repsMin, repsMax: it.repsMax, durationMinutes: null, supersetGroup: it.supersetGroup }
        : { type: "cardio", name: it.name, sets: null, repsMin: null, repsMax: null, durationMinutes: it.durationMinutes, supersetGroup: null },
    ),
  }));

  async function save() {
    setSaving(true);
    let raw: unknown = pending!.raw;
    try {
      raw = JSON.parse(pending!.raw);
    } catch {
      // Keep the pasted text as-is; it may have chat text around the JSON.
    }
    await importProgram({ program, raw, userId, makeActive });
    sessionStorage.removeItem(PENDING_IMPORT_KEY);
    router.replace(makeActive ? "/today" : "/program");
  }

  return (
    <>
      <ScreenHeader title="Review program" back="/program/import" />
      <div className="flex flex-col gap-4 px-[var(--spacing-gutter)] pb-48">
        <Card className="p-5">
          <h2 className="text-2xl font-extrabold tracking-tight">{program.name}</h2>
          <p className="mt-1 text-ink-2">
            {[program.author && `By ${program.author}`, program.weeks && `${program.weeks} weeks`].filter(Boolean).join(" · ")}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Chip tone="blue">{calendar ? `${program.days.length} days a week` : `${program.days.length}-day rotation`}</Chip>
            <Chip>{exerciseCount} exercises</Chip>
          </div>
          {program.progressionNotes && <p className="mt-3 text-ink-2">{program.progressionNotes}</p>}
        </Card>
        <ProgramDays days={days} />
      </div>
      <div className="pb-safe fixed inset-x-0 bottom-0 bg-gradient-to-t from-bg via-bg to-transparent px-[var(--spacing-gutter)] pt-6">
        <div className="mx-auto flex max-w-xl flex-col gap-3 pb-4">
          <label className="flex min-h-16 items-center justify-between rounded-[var(--radius-panel)] bg-card px-5 font-bold">
            Make this my active program
            <Toggle checked={makeActive} onChange={setMakeActive} />
          </label>
          <button onClick={save} disabled={saving} className={`${btn.primary} w-full`}>
            {saving ? "Saving…" : "Save program"}
          </button>
        </div>
      </div>
    </>
  );
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative h-9 w-16 rounded-full transition-colors ${checked ? "bg-accent" : "bg-line"}`}
    >
      <span className={`absolute top-1 size-7 rounded-full bg-white shadow transition-all ${checked ? "left-8" : "left-1"}`} />
    </button>
  );
}
