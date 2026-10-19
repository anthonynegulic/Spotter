"use client";

import { Target } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Card, ScreenHeader } from "@/components/ui";

export default function GoalsPage() {
  return (
    <AppShell>
      <ScreenHeader title="Goals" />
      <div className="px-[var(--spacing-gutter)]">
        <Card className="flex flex-col items-center gap-3 py-10 text-center">
          <span className="grid size-14 place-items-center rounded-full bg-warm-tint text-warm-ink">
            <Target className="size-7" />
          </span>
          <h2 className="text-heading font-extrabold">Daily goals come next</h2>
          <p className="max-w-xs text-ink-2">
            Steps, calories and exercise minutes from your Watch, plus quick protein logging, arrive in Phase 2.
          </p>
        </Card>
      </div>
    </AppShell>
  );
}
