"use client";

import type { ProgramDiff } from "@/lib/program/diff";
import { Chip } from "./ui";

/** "What's changed" for a new program version. */
export function DiffList({ diff }: { diff: ProgramDiff }) {
  if (diff.program.length === 0 && diff.days.length === 0) {
    return <p className="text-ink-2">No changes from the current version.</p>;
  }
  return (
    <div className="flex flex-col gap-4">
      {diff.program.length > 0 && (
        <ul className="flex flex-col gap-1">
          {diff.program.map((l) => (
            <li key={l}>{l}</li>
          ))}
        </ul>
      )}
      {diff.days.map((d) => (
        <section key={d.day + d.kind}>
          <h4 className="mb-1 flex items-center gap-2 font-extrabold">
            {d.day}
            {d.kind === "added" && <Chip tone="blue" className="py-0.5 text-xs">New day</Chip>}
            {d.kind === "removed" && <Chip tone="orange" className="py-0.5 text-xs">Removed</Chip>}
          </h4>
          {d.lines.length > 0 && (
            <ul className="flex flex-col gap-1 text-ink-2">
              {d.lines.map((l) => (
                <li key={l} className="flex gap-2">
                  <span aria-hidden>•</span>
                  <span>{l}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      ))}
    </div>
  );
}
