"use client";

import { ChartLine } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Card, ScreenHeader } from "@/components/ui";

export default function ProgressPage() {
  return (
    <AppShell>
      <ScreenHeader title="Progress" />
      <div className="px-[var(--spacing-gutter)]">
        <Card className="flex flex-col items-center gap-3 py-10 text-center">
          <span className="grid size-14 place-items-center rounded-full bg-accent-tint text-accent-ink">
            <ChartLine className="size-7" />
          </span>
          <h2 className="text-heading font-extrabold">Charts are on the way</h2>
          <p className="max-w-xs text-ink-2">
            Every set you log is already saved. Estimated 1RM, PRs and weekly consistency arrive in Phase 2, built from this history.
          </p>
        </Card>
      </div>
    </AppShell>
  );
}
