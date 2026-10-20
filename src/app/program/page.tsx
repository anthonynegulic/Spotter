"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { ChevronRight, CloudOff, Plus, RefreshCw } from "lucide-react";
import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { btn, Card, Chip, ScreenHeader } from "@/components/ui";
import { useAuth } from "@/lib/auth";
import { db } from "@/lib/db/local";
import { useSyncState } from "@/lib/hooks/useSyncState";
import { syncNow } from "@/lib/db/sync";

export default function ProgramPage() {
  return (
    <AppShell>
      <ScreenHeader
        title="Program"
        right={
          <Link href="/program/import" className={btn.tinted}>
            <Plus className="size-5" /> Import
          </Link>
        }
      />
      <Programs />
      <Account />
    </AppShell>
  );
}

function Programs() {
  const programs = useLiveQuery(async () => {
    const all = (await db.programs.toArray()).filter((p) => !p.deleted_at);
    return all.sort((a, b) => Number(b.is_active) - Number(a.is_active) || b.created_at.localeCompare(a.created_at));
  });
  if (!programs) return null;
  if (programs.length === 0) {
    return (
      <div className="px-[var(--spacing-gutter)]">
        <Card className="flex flex-col items-start gap-3 p-5">
          <h2 className="text-heading font-extrabold">No programs yet</h2>
          <p className="text-ink-2">Paste a program from Claude or ChatGPT and it&apos;s ready to log in under a minute.</p>
          <Link href="/program/import" className={btn.primary}>
            Import a program
          </Link>
        </Card>
      </div>
    );
  }
  return (
    <ul className="flex flex-col gap-3 px-[var(--spacing-gutter)]">
      {programs.map((p) => (
        <li key={p.id}>
          <Link href={`/program/view?id=${p.id}`} className="flex items-center gap-3 rounded-[var(--radius-card)] bg-card p-5 active:brightness-95">
            <div className="min-w-0 flex-1">
              <h2 className="truncate text-heading font-extrabold">{p.name}</h2>
              <p className="text-sm text-ink-2">Imported {new Date(p.created_at).toLocaleDateString("en-AU", { day: "numeric", month: "short" })}</p>
            </div>
            {p.is_active && <Chip tone="blue">Active</Chip>}
            <ChevronRight className="size-5 text-ink-3" />
          </Link>
        </li>
      ))}
    </ul>
  );
}

function Account() {
  const { state, signOut } = useAuth();
  const sync = useSyncState();
  const email = state.status === "signedIn" ? state.email : null;
  const status = sync.stuck
    ? `${sync.stuck} change${sync.stuck === 1 ? "" : "s"} couldn't sync`
    : sync.pending
      ? `${sync.pending} change${sync.pending === 1 ? "" : "s"} waiting to sync`
      : sync.lastSyncedAt
        ? "Everything's synced"
        : "Saved on this phone";
  return (
    <div className="mt-8 px-[var(--spacing-gutter)]">
      <h2 className="mb-2 px-1 text-sm font-bold tracking-wide text-ink-2 uppercase">Account</h2>
      <Card className="flex flex-col gap-3 p-5">
        <p className="text-ink-2">Signed in as <span className="font-semibold text-ink">{email ?? "you"}</span></p>
        <div className="flex items-center gap-2 text-ink-2">
          {sync.pending || sync.stuck ? <CloudOff className="size-5" /> : <RefreshCw className="size-5" />}
          <span className="flex-1">{status}</span>
          <button onClick={() => void syncNow()} className={btn.quiet}>Sync now</button>
        </div>
        {sync.lastError && sync.stuck > 0 && <p className="text-sm text-warm-ink">{sync.lastError}</p>}
        <Link href="/settings" className={`${btn.quiet} mt-1`}>Settings &amp; Apple Health</Link>
        <button onClick={() => void signOut()} className={btn.quiet}>Sign out</button>
      </Card>
    </div>
  );
}
