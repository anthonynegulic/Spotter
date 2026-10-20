"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { DiffList } from "@/components/DiffList";
import { ProgramDays, type DayView } from "@/components/ProgramDays";
import { Toggle } from "@/components/Toggle";
import { btn, Card, Chip, cx, ScreenHeader } from "@/components/ui";
import { useUserId } from "@/lib/auth";
import { db } from "@/lib/db/local";
import { loadProgramTree } from "@/lib/db/queries";
import { addProgramVersion, importProgram } from "@/lib/db/repo";
import { diffPrograms } from "@/lib/program/diff";
import { treeToProgram } from "@/lib/program/fromTree";
import { PENDING_IMPORT_KEY } from "@/lib/program/pending";
import type { Program } from "@/lib/program/schema";

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
  const [mode, setMode] = useState<"update" | "new">("update");
  const [restartWeek, setRestartWeek] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!pending) router.replace("/program/import");
  }, [pending, router]);

  // A program with the same name is most likely an update of it.
  const existing = useLiveQuery(async () => {
    if (!pending) return null;
    const name = pending.program.name.trim().toLowerCase();
    const match = (await db.programs.toArray())
      .filter((p) => !p.deleted_at && p.name.trim().toLowerCase() === name)
      .sort((a, b) => Number(b.is_active) - Number(a.is_active) || b.created_at.localeCompare(a.created_at))[0];
    return match ? loadProgramTree(match.id) : null;
  }, [pending?.program.name]);

  if (!pending || existing === undefined) return null;
  const { program } = pending;
  const updating = existing !== null && mode === "update";
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
    if (updating && existing) {
      await addProgramVersion({ programId: existing.program.id, program, raw, userId, makeActive, restartWeek });
    } else {
      await importProgram({ program, raw, userId, makeActive });
    }
    sessionStorage.removeItem(PENDING_IMPORT_KEY);
    router.replace(makeActive || (updating && existing?.program.is_active) ? "/today" : "/program");
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

        {existing && (
          <Card className="flex flex-col gap-3 p-5">
            <h3 className="text-heading font-extrabold">You already have &ldquo;{existing.program.name}&rdquo;</h3>
            <Choice
              selected={mode === "update"}
              onSelect={() => setMode("update")}
              title={`Update it (version ${existing.version.version + 1})`}
              detail="Your logged history carries over."
            />
            <Choice selected={mode === "new"} onSelect={() => setMode("new")} title="Save as a new program" detail="Keeps the current one as it is." />
            {updating && (
              <>
                <div className="mt-2 rounded-[var(--radius-panel)] bg-pill p-4">
                  <h4 className="mb-2 text-sm font-bold tracking-wide text-ink-2 uppercase">What&apos;s changed</h4>
                  <DiffList diff={diffPrograms(treeToProgram(existing), program)} />
                </div>
                <label className="flex min-h-14 items-center justify-between gap-3 font-bold">
                  <span>
                    Restart at week 1
                    <span className="block text-sm font-normal text-ink-2">Otherwise the week count carries on.</span>
                  </span>
                  <Toggle checked={restartWeek} onChange={setRestartWeek} label="Restart at week 1" />
                </label>
              </>
            )}
          </Card>
        )}

        <ProgramDays days={days} />
      </div>
      <div className="pb-safe fixed inset-x-0 bottom-0 bg-gradient-to-t from-bg via-bg to-transparent px-[var(--spacing-gutter)] pt-6">
        <div className="mx-auto flex max-w-xl flex-col gap-3 pb-4">
          {!(updating && existing?.program.is_active) && (
            <label className="flex min-h-16 items-center justify-between rounded-[var(--radius-panel)] bg-card px-5 font-bold">
              Make this my active program
              <Toggle checked={makeActive} onChange={setMakeActive} label="Make this my active program" />
            </label>
          )}
          <button onClick={save} disabled={saving} className={`${btn.primary} w-full`}>
            {saving ? "Saving…" : updating ? "Save new version" : "Save program"}
          </button>
        </div>
      </div>
    </>
  );
}

function Choice({ selected, onSelect, title, detail }: { selected: boolean; onSelect: () => void; title: string; detail: string }) {
  return (
    <button
      onClick={onSelect}
      role="radio"
      aria-checked={selected}
      className={cx(
        "flex items-center gap-3 rounded-[var(--radius-panel)] border-2 p-4 text-left",
        selected ? "border-accent bg-accent-tint/40" : "border-line",
      )}
    >
      <span className={cx("grid size-6 shrink-0 place-items-center rounded-full border-2", selected ? "border-accent" : "border-ink-3")}>
        {selected && <span className="size-3 rounded-full bg-accent" />}
      </span>
      <span>
        <span className="block font-bold">{title}</span>
        <span className="text-sm text-ink-2">{detail}</span>
      </span>
    </button>
  );
}
