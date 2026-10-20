"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { AppShell } from "@/components/AppShell";
import { PrRow } from "@/components/progress/PrRow";
import { Card, ScreenHeader } from "@/components/ui";
import { loadProgress } from "@/lib/db/progressQueries";
import { allPrs } from "@/lib/workout/progress";

export default function PrsPage() {
  return (
    <AppShell>
      <ScreenHeader title="All PRs" back="/progress" />
      <AllPrs />
    </AppShell>
  );
}

function AllPrs() {
  const data = useLiveQuery(loadProgress, []);
  if (!data) return null;
  const prs = allPrs(data.sets, data.liveSessionIds);
  const now = new Date();
  // Group by month so a long list stays scannable.
  const groups = new Map<string, typeof prs>();
  for (const p of prs) {
    const key = new Date(p.set.logged_at).toLocaleDateString("en-AU", { month: "long", year: "numeric" });
    groups.set(key, [...(groups.get(key) ?? []), p]);
  }
  return (
    <div className="flex flex-col gap-4 px-[var(--spacing-gutter)]">
      {prs.length === 0 && <Card className="p-5 text-ink-2">No PRs yet. They appear once you beat a previous session.</Card>}
      {[...groups.entries()].map(([month, list]) => (
        <section key={month}>
          <h2 className="mb-2 px-1 text-sm font-bold tracking-wide text-ink-2 uppercase">
            {month} · {list.length} PR{list.length === 1 ? "" : "s"}
          </h2>
          <Card className="px-5 py-1">
            <ul>
              {list.map((p, i) => {
                const ex = data.exercises.get(p.set.exercise_id);
                return <PrRow key={p.set.id} pr={p} name={ex?.name ?? "Exercise"} equipment={ex?.equipment} now={now} first={i === 0} />;
              })}
            </ul>
          </Card>
        </section>
      ))}
    </div>
  );
}
