"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { AlertTriangle, Check, ChevronDown, ChevronUp, Copy, HeartPulse, KeyRound } from "lucide-react";
import { useState } from "react";
import { AppShell } from "@/components/AppShell";
import { btn, Card, Chip, cx, ScreenHeader, Sheet } from "@/components/ui";
import { useUserId } from "@/lib/auth";
import { db } from "@/lib/db/local";
import type { IngestTokenRow } from "@/lib/db/types";
import { createIngestToken, ingestUrl, revokeIngestToken, TOKEN_HEADER } from "@/lib/health/tokens";
import { useNow } from "@/lib/hooks/useNow";
import { relativeDay } from "@/lib/workout/progress";

export default function SettingsPage() {
  return (
    <AppShell>
      <ScreenHeader title="Settings" back="/program" />
      <div className="flex flex-col gap-4 px-[var(--spacing-gutter)] pb-6">
        <AppleHealth />
      </div>
    </AppShell>
  );
}

const STALE_HOURS = 26;

function AppleHealth() {
  const userId = useUserId();
  const data = useLiveQuery(async () => {
    const tokens = (await db.ingest_tokens.toArray()).sort((a, b) => b.created_at.localeCompare(a.created_at));
    const samples = await db.health_samples.filter((s) => s.source !== "manual" && !s.deleted_at).count();
    const workouts = await db.health_workouts.count();
    return { tokens, samples, workouts };
  }, []);
  const [creating, setCreating] = useState(false);
  const [guide, setGuide] = useState(false);
  const now = useNow(60_000);
  if (!data) return null;

  const active = data.tokens.filter((t) => !t.revoked_at);
  const lastReceived = active.map((t) => t.last_used_at).filter(Boolean).sort().at(-1) ?? null;
  const hoursSince = lastReceived ? (now - new Date(lastReceived).getTime()) / 3_600_000 : null;
  const stale = hoursSince !== null && hoursSince > STALE_HOURS;

  return (
    <>
      <Card className="flex flex-col gap-4 p-5">
        <div className="flex items-center gap-3">
          <span className="grid size-12 shrink-0 place-items-center rounded-full bg-warm-tint text-warm-ink">
            <HeartPulse className="size-6" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-heading font-extrabold">Apple Health</h2>
            <p className="text-ink-2">Steps, calories, exercise minutes, weigh-ins and Watch workouts, via Health Auto Export.</p>
          </div>
        </div>

        <div className={cx("rounded-[var(--radius-panel)] p-4", stale ? "bg-warm-tint text-warm-ink" : "bg-pill")}>
          <div className="flex items-center gap-2 font-bold">
            {stale && <AlertTriangle className="size-5" />}
            {lastReceived ? `Last received ${formatAgo(lastReceived, now)}` : active.length ? "Nothing received yet" : "Not connected"}
          </div>
          <p className={cx("mt-1 text-sm", stale ? "" : "text-ink-2")}>
            {stale
              ? "Health Auto Export hasn't sent anything for over a day. Open it on your iPhone to let the automation run, and check it's still switched on."
              : lastReceived
                ? `${data.samples} daily readings and ${data.workouts} workouts so far.`
                : active.length
                  ? "Set up the automation below, then use its manual sync to send a first batch."
                  : "Create a token, then set up a Health Auto Export automation with it."}
          </p>
        </div>

        {active.length > 0 && (
          <ul className="flex flex-col gap-2">
            {active.map((t) => (
              <TokenRow key={t.id} token={t} now={now} />
            ))}
          </ul>
        )}

        <button onClick={() => setCreating(true)} className={btn.tinted}>
          <KeyRound className="size-5" /> {active.length ? "Create another token" : "Create a token"}
        </button>

        <button onClick={() => setGuide((g) => !g)} className="flex items-center justify-between font-bold text-accent-ink" aria-expanded={guide}>
          How to set up Health Auto Export
          {guide ? <ChevronUp className="size-5" /> : <ChevronDown className="size-5" />}
        </button>
        {guide && <SetupGuide />}
      </Card>

      <CreateTokenSheet open={creating} onClose={() => setCreating(false)} userId={userId} />
    </>
  );
}

function TokenRow({ token, now }: { token: IngestTokenRow; now: number }) {
  const [confirm, setConfirm] = useState(false);
  return (
    <li className="flex items-center gap-3 rounded-[var(--radius-panel)] border-2 border-line px-4 py-3">
      <div className="min-w-0 flex-1">
        <div className="truncate font-bold">{token.label ?? "Ingest token"}</div>
        <div className="text-sm text-ink-2">
          Created {relativeDay(new Date(token.created_at), new Date())}
          {token.last_used_at ? ` · last used ${formatAgo(token.last_used_at, now)}` : " · not used yet"}
        </div>
      </div>
      {confirm ? (
        <button onClick={() => void revokeIngestToken(token)} className={`${btn.quiet} text-danger`}>
          Revoke
        </button>
      ) : (
        <button onClick={() => setConfirm(true)} className={btn.quiet}>
          Revoke…
        </button>
      )}
    </li>
  );
}

function CreateTokenSheet({ open, onClose, userId }: { open: boolean; onClose: () => void; userId: string }) {
  const [label, setLabel] = useState("Health Auto Export");
  const [token, setToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const close = () => {
    setToken(null);
    onClose();
  };
  return (
    <Sheet open={open} onClose={close} title={token ? "Your token" : "Create a token"}>
      {token ? (
        <div className="flex flex-col gap-4">
          <p className="rounded-[var(--radius-panel)] bg-warm-tint p-3 font-semibold text-warm-ink">
            Copy it now. Spotter only keeps a fingerprint of it, so it can&apos;t be shown again.
          </p>
          <CopyField label="Token" value={token} />
          <CopyField label="URL" value={ingestUrl() ?? "(Supabase isn't configured)"} />
          <CopyField label="Header name" value={TOKEN_HEADER} />
          <p className="text-sm text-ink-2">Paste these into the automation as described under &ldquo;How to set up Health Auto Export&rdquo;.</p>
          <button onClick={close} className={btn.primary}>
            Done
          </button>
        </div>
      ) : (
        <form
          className="flex flex-col gap-4"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setToken(await createIngestToken(userId, label));
            setBusy(false);
          }}
        >
          <label className="flex flex-col gap-1">
            <span className="text-sm font-bold text-ink-2">Name (so you can tell tokens apart)</span>
            <input value={label} onChange={(e) => setLabel(e.target.value)} className="min-h-12 rounded-[var(--radius-control)] border-2 border-line px-3 outline-none focus:border-accent" />
          </label>
          <p className="text-sm text-ink-2">The token only lets Health Auto Export send data into your account. It can&apos;t read anything, and you can revoke it here at any time.</p>
          <button type="submit" disabled={busy} className={btn.primary}>
            Create token
          </button>
        </form>
      )}
    </Sheet>
  );
}

function CopyField({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div>
      <div className="mb-1 text-sm font-bold text-ink-2">{label}</div>
      <div className="flex items-center gap-2 rounded-[var(--radius-panel)] bg-pill p-2 pl-3">
        <code className="min-w-0 flex-1 font-mono text-sm break-all select-all">{value}</code>
        <button
          aria-label={`Copy ${label}`}
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(value);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            } catch {
              // Long-press to copy still works.
            }
          }}
          className="grid size-11 shrink-0 place-items-center rounded-[var(--radius-button)] bg-card"
        >
          {copied ? <Check className="size-5 text-accent" /> : <Copy className="size-5" />}
        </button>
      </div>
    </div>
  );
}

/** The Health Auto Export settings, in the order the app shows them. */
function SetupGuide() {
  const url = ingestUrl();
  return (
    <div className="flex flex-col gap-4 text-ink">
      <Step n={1} title="Create a metrics automation">
        In Health Auto Export, tap <b>Automated</b> and add a new automation. Set <b>Automation Type</b> to <b>REST API</b>.
      </Step>
      <Step n={2} title="Where to send it">
        <b>URL:</b> <code className="font-mono text-sm break-all">{url ?? "your Supabase URL + /functions/v1/health-ingest"}</code>
        <br />
        <b>Headers:</b> add one with key <code className="font-mono text-sm">{TOKEN_HEADER}</code> and your token as the value.
      </Step>
      <Step n={3} title="What to send">
        <b>Data Type:</b> Health Metrics. Select <b>Step Count, Active Energy, Apple Exercise Time, Weight &amp; Body Mass, Body Fat Percentage, Body Mass Index, Lean Body Mass</b> and <b>Resting Heart Rate</b>.
      </Step>
      <Step n={4} title="Format">
        <b>Export Format:</b> JSON · <b>Export Version:</b> v2 · <b>Summarize Data:</b> on · <b>Time Grouping:</b> Day. For the date range, pick one that includes today (Previous 7 Days is fine: Spotter updates each day rather than adding it twice).
      </Step>
      <Step n={5} title="Let it read Apple Health">
        In the Health app, tap your picture → <b>Apps</b> → <b>Health Auto Export</b> and turn on reading for all of the above, plus <b>Workouts</b> and{" "}
        <b>Heart Rate</b>. iOS doesn&apos;t report a missing permission; that metric is just quietly left out of the export.
      </Step>
      <Step n={6} title="Keep the rest private">
        Turn <b>off</b> routes, ECG, cycle tracking, medications, symptoms and state of mind. Spotter doesn&apos;t use them.
      </Step>
      <Step n={7} title="Workouts">
        Add a second automation the same way (same URL and header) with <b>Data Type: Workouts</b>, JSON v2, routes off. Watch workouts that overlap a logged session show up in its summary.
      </Step>
      <Step n={8} title="Test it">
        In each automation, tap <b>Manual Upload</b> → <b>Begin Export</b>. The response should show a 200 with the number of samples or workouts saved. &ldquo;Last received&rdquo; above should update within a few seconds of the next sync on this phone.
      </Step>
      <p className="text-sm text-ink-2">
        <Chip className="mr-1 py-0.5 text-xs">Note</Chip>
        iOS decides when background automations actually run, so data can lag until Health Auto Export is next opened.
      </p>
    </div>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <span className="grid size-8 shrink-0 place-items-center rounded-full bg-accent-tint font-extrabold text-accent-ink">{n}</span>
      <div className="min-w-0">
        <div className="font-bold">{title}</div>
        <div className="text-ink-2 [&_b]:text-ink">{children}</div>
      </div>
    </div>
  );
}

function formatAgo(iso: string, now: number): string {
  const mins = Math.round((now - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const day = relativeDay(new Date(iso), new Date(now));
  return day === "Yesterday" ? "yesterday" : `on ${day}`;
}
