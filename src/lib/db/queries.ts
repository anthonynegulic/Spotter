import { db } from "./local";
import type { ProgramDayRow, ProgramItemRow, ProgramRow, ProgramVersionRow, SessionRow } from "./types";

export interface ProgramTree {
  program: ProgramRow;
  version: ProgramVersionRow;
  days: (ProgramDayRow & { items: ProgramItemRow[] })[];
}

export async function loadProgramTree(programId: string): Promise<ProgramTree | null> {
  const program = await db.programs.get(programId);
  if (!program || program.deleted_at) return null;
  const versions = await db.program_versions.where("program_id").equals(programId).toArray();
  const version = versions.sort((a, b) => b.version - a.version)[0];
  if (!version) return null;
  const days = (await db.program_days.where("program_version_id").equals(version.id).toArray()).sort((a, b) => a.sort - b.sort);
  const items = await db.program_items.where("program_day_id").anyOf(days.map((d) => d.id)).toArray();
  return {
    program,
    version,
    days: days.map((d) => ({ ...d, items: items.filter((i) => i.program_day_id === d.id).sort((a, b) => a.sort - b.sort) })),
  };
}

/** The active program; if two devices both activated one offline, the latest wins. */
export async function activeProgramId(): Promise<string | null> {
  const active = await db.programs.filter((p) => p.is_active && !p.deleted_at).toArray();
  active.sort((a, b) => (b.activated_at ?? "").localeCompare(a.activated_at ?? ""));
  return active[0]?.id ?? null;
}

export async function liveSessions(): Promise<SessionRow[]> {
  return (await db.sessions.toArray()).filter((s) => !s.deleted_at);
}
