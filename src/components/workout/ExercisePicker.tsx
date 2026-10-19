"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { Plus, Search } from "lucide-react";
import { useState } from "react";
import { db } from "@/lib/db/local";
import type { ExerciseRow } from "@/lib/db/types";
import { EQUIPMENT, type Equipment } from "@/lib/program/schema";
import { cx, Sheet } from "../ui";

/** Pick one of your exercises or type a new one. Used for swaps and adding an exercise. */
export function ExercisePicker({
  open,
  onClose,
  title,
  defaultEquipment,
  onPick,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  defaultEquipment: Equipment;
  onPick: (choice: { existing: ExerciseRow } | { name: string; equipment: Equipment }) => void;
}) {
  return (
    <Sheet open={open} onClose={onClose} title={title}>
      {open && <PickerBody defaultEquipment={defaultEquipment} onPick={onPick} />}
    </Sheet>
  );
}

function PickerBody({ defaultEquipment, onPick }: { defaultEquipment: Equipment; onPick: Parameters<typeof ExercisePicker>[0]["onPick"] }) {
  const [query, setQuery] = useState("");
  const [equipment, setEquipment] = useState<Equipment>(defaultEquipment);
  const exercises = useLiveQuery(async () => (await db.exercises.toArray()).filter((e) => !e.deleted_at), []);
  const q = query.trim().toLowerCase();
  const matches = (exercises ?? [])
    .filter((e) => !q || e.name.toLowerCase().includes(q))
    .sort((a, b) => a.name.localeCompare(b.name))
    .slice(0, 30);
  const exact = matches.some((e) => e.name.toLowerCase() === q);

  return (
    <div className="flex flex-col gap-3">
      <label className="flex min-h-12 items-center gap-2 rounded-[var(--radius-control)] border-2 border-line px-3 focus-within:border-accent">
        <Search className="size-5 text-ink-3" />
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search or type a new exercise"
          className="min-w-0 flex-1 bg-transparent outline-none"
        />
      </label>

      {q && !exact && (
        <div className="rounded-[var(--radius-panel)] bg-accent-tint/50 p-3">
          <div className="mb-2 flex flex-wrap gap-1.5">
            {EQUIPMENT.map((eq) => (
              <button
                key={eq}
                onClick={() => setEquipment(eq)}
                className={cx("min-h-8 rounded-full px-3 text-sm font-bold capitalize", eq === equipment ? "bg-accent text-white" : "bg-card text-ink-2")}
              >
                {eq}
              </button>
            ))}
          </div>
          <button onClick={() => onPick({ name: query.trim(), equipment })} className="flex min-h-12 w-full items-center gap-2 font-bold text-accent-ink">
            <Plus className="size-5" /> Use &ldquo;{query.trim()}&rdquo;
          </button>
        </div>
      )}

      <ul className="flex max-h-[45dvh] flex-col overflow-y-auto">
        {matches.map((e) => (
          <li key={e.id}>
            <button onClick={() => onPick({ existing: e })} className="flex min-h-12 w-full items-center justify-between border-b border-line text-left">
              <span className="font-semibold">{e.name}</span>
              <span className="text-sm text-ink-3 capitalize">{e.equipment}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
