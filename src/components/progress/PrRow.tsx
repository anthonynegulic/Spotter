"use client";

import Link from "next/link";
import { relativeDay, type PrEvent } from "@/lib/workout/progress";
import { formatKg } from "@/lib/workout/stats";
import { PrBadge } from "../ui";

export function PrRow({ pr, name, equipment, now, first }: { pr: PrEvent; name: string; equipment?: string; now: Date; first: boolean }) {
  const weight = equipment === "bodyweight" ? `BW + ${formatKg(pr.set.weight_kg)} kg` : `${formatKg(pr.set.weight_kg)} kg`;
  return (
    <li className={first ? "" : "border-t border-line"}>
      <Link href={`/progress/exercise?id=${pr.set.exercise_id}`} className="flex items-center gap-3 py-3">
        <PrBadge />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-lg font-bold">{name}</span>
          <span className="text-ink-2">
            {weight} × {pr.set.reps}
            {pr.kinds.includes("e1rm") && equipment !== "bodyweight" ? ` · Est. 1RM ${formatKg(pr.e1rm)} kg` : ""}
          </span>
        </span>
        <span className="shrink-0 text-ink-2">{relativeDay(new Date(pr.set.logged_at), now)}</span>
      </Link>
    </li>
  );
}

