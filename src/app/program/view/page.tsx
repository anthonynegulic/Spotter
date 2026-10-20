"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { Pencil } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { AppShell } from "@/components/AppShell";
import { ProgramDays, type DayView } from "@/components/ProgramDays";
import { btn, Card, Chip, ScreenHeader } from "@/components/ui";
import { setActiveProgram } from "@/lib/db/repo";
import { loadProgramTree } from "@/lib/db/queries";
import { DAYS_OF_WEEK } from "@/lib/program/schema";

export default function ProgramViewPage() {
  return (
    <AppShell tabs={false}>
      <Suspense>
        <ProgramView />
      </Suspense>
    </AppShell>
  );
}

function ProgramView() {
  const id = useSearchParams().get("id");
  const router = useRouter();
  const tree = useLiveQuery(() => (id ? loadProgramTree(id) : null), [id]);

  if (tree === undefined) return null;
  if (!tree) {
    return (
      <>
        <ScreenHeader title="Program" back="/program" />
        <p className="px-[var(--spacing-gutter)] text-ink-2">That program isn&apos;t on this phone yet. It&apos;ll appear once it syncs.</p>
      </>
    );
  }

  const { program, version, days } = tree;
  const calendar = days.every((d) => d.day_of_week !== null);
  const views: DayView[] = days.map((d) => ({
    key: d.id,
    name: d.name,
    dayOfWeek: d.day_of_week ? DAYS_OF_WEEK[d.day_of_week - 1] : null,
    items: d.items.map((it) => ({
      type: it.type,
      name: it.name,
      sets: it.sets,
      repsMin: it.reps_min,
      repsMax: it.reps_max,
      durationMinutes: it.duration_minutes,
      supersetGroup: it.superset_group,
    })),
  }));

  return (
    <>
      <ScreenHeader
        title={program.name}
        back="/program"
        right={
          <Link href={`/program/edit?id=${program.id}`} className={btn.tinted} aria-label="Edit program">
            <Pencil className="size-4" /> Edit
          </Link>
        }
      />
      <div className="flex flex-col gap-4 px-[var(--spacing-gutter)] pb-10">
        <Card className="p-5">
          <p className="text-ink-2">
            {[
              version.author && `By ${version.author}`,
              version.weeks && `${version.weeks} weeks`,
              version.version > 1 && `Version ${version.version}, ${new Date(version.created_at).toLocaleDateString("en-AU", { day: "numeric", month: "short" })}`,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {program.is_active && <Chip tone="blue">Active</Chip>}
            <Chip>{calendar ? `${days.length} days a week` : `${days.length}-day rotation`}</Chip>
          </div>
          {version.progression_notes && (
            <div className="mt-4 rounded-[var(--radius-panel)] bg-pill p-4">
              <h3 className="mb-1 text-sm font-bold text-ink-2">Progression</h3>
              <p>{version.progression_notes}</p>
            </div>
          )}
          {!program.is_active && (
            <button
              className={`${btn.primary} mt-4 w-full`}
              onClick={async () => {
                await setActiveProgram(program.id);
                router.push("/today");
              }}
            >
              Make this my active program
            </button>
          )}
        </Card>
        <ProgramDays days={views} />
      </div>
    </>
  );
}
