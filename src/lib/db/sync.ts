import type { SupabaseClient } from "@supabase/supabase-js";
import { db, getMeta, setMeta, type OutboxEntry } from "./local";
import { SYNCED_TABLES } from "./types";

/**
 * Sync engine. Push: drain the outbox in order, batching consecutive writes to
 * the same table into one upsert. Upserts are keyed on the device-generated id,
 * so retrying after a dropped connection never creates duplicates. Pull: fetch
 * rows changed since the last pull (by server-set updated_at), skipping rows
 * that still have local changes waiting to go up.
 */

const BATCH = 200;
const PULL_PAGE = 1000;
/** Re-read a few seconds behind the cursor so rows committed slightly out of order aren't missed. */
const PULL_OVERLAP_MS = 5000;
/** After this many failed attempts a write is parked so it can't block everything behind it. */
const MAX_ATTEMPTS = 8;

export type SyncState = {
  pending: number;
  syncing: boolean;
  lastSyncedAt: string | null;
  lastError: string | null;
  stuck: number;
};

let state: SyncState = { pending: 0, syncing: false, lastSyncedAt: null, lastError: null, stuck: 0 };
const listeners = new Set<(s: SyncState) => void>();

export function getSyncState(): SyncState {
  return state;
}

export function subscribeSync(fn: (s: SyncState) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function update(patch: Partial<SyncState>) {
  state = { ...state, ...patch };
  for (const fn of listeners) fn(state);
}

let client: SupabaseClient | null = null;
const afterPull: (() => Promise<void>)[] = [];

/** Run after every successful pull, e.g. to tidy up rows that arrived from another phone. */
export function onAfterPull(fn: () => Promise<void>) {
  afterPull.push(fn);
}
let running: Promise<void> | null = null;
let again = false;
let timer: ReturnType<typeof setTimeout> | null = null;

/** Called once signed in. Until then writes just queue up locally. */
export function startSync(c: SupabaseClient) {
  client = c;
  void refreshPending();
  requestSync(0);
}

export function stopSync() {
  client = null;
  if (timer) clearTimeout(timer);
}

/** Debounced: a burst of writes becomes one sync. */
export function requestSync(delayMs = 800) {
  void refreshPending();
  if (!client) return;
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => void syncNow(), delayMs);
}

export async function syncNow(): Promise<void> {
  if (!client) return;
  if (running) {
    again = true;
    return running;
  }
  running = (async () => {
    update({ syncing: true });
    try {
      do {
        again = false;
        await push(client!);
        await pull(client!);
        for (const fn of afterPull) await fn();
      } while (again);
      update({ lastSyncedAt: new Date().toISOString(), lastError: null });
    } catch (e) {
      update({ lastError: e instanceof Error ? e.message : String(e) });
    } finally {
      await refreshPending();
      update({ syncing: false });
      running = null;
    }
  })();
  return running;
}

async function refreshPending() {
  const all = await db.outbox.toArray();
  update({
    pending: all.filter((e) => e.attempts < MAX_ATTEMPTS).length,
    stuck: all.filter((e) => e.attempts >= MAX_ATTEMPTS).length,
  });
}

class NetworkError extends Error {}

export async function push(c: SupabaseClient): Promise<void> {
  for (;;) {
    const entries = (await db.outbox.orderBy("seq").limit(BATCH).toArray()).filter((e) => e.attempts < MAX_ATTEMPTS);
    if (entries.length === 0) return;

    // Consecutive entries for the same table go up together.
    const groups: OutboxEntry[][] = [];
    for (const e of entries) {
      const last = groups.at(-1);
      if (last && last[0].table === e.table) last.push(e);
      else groups.push([e]);
    }

    for (const group of groups) {
      // The latest payload per row wins within a batch.
      const byId = new Map<string, Record<string, unknown>>();
      for (const e of group) byId.set(e.row_id, stripServerFields(e.payload));
      const { error } = await c.from(group[0].table).upsert([...byId.values()], { onConflict: "id" });
      if (error) {
        if (isNetworkError(error)) throw new NetworkError(error.message);
        await db.outbox.bulkPut(group.map((e) => ({ ...e, attempts: e.attempts + 1, last_error: error.message })));
        throw new Error(`Sync failed for ${group[0].table}: ${error.message}`);
      }
      await db.outbox.bulkDelete(group.map((e) => e.seq!));
    }
  }
}

export async function pull(c: SupabaseClient): Promise<void> {
  for (const table of SYNCED_TABLES) {
    const cursorKey = `pulled:${table}`;
    let cursor = (await getMeta<string>(cursorKey)) ?? "1970-01-01T00:00:00Z";
    for (;;) {
      const since = new Date(new Date(cursor).getTime() - PULL_OVERLAP_MS).toISOString();
      const { data, error } = await c
        .from(table)
        .select("*")
        .gt("updated_at", since)
        .order("updated_at", { ascending: true })
        .limit(PULL_PAGE);
      if (error) {
        if (isNetworkError(error)) throw new NetworkError(error.message);
        throw new Error(`Pull failed for ${table}: ${error.message}`);
      }
      const rows = (data ?? []).map(normaliseNumbers) as { id: string; updated_at: string }[];
      if (rows.length) {
        // Checked inside the transaction so a set logged mid-pull is never overwritten.
        await db.transaction("rw", [db.table(table), db.outbox], async () => {
          const pending = new Set(
            (await db.outbox.where("[table+row_id]").anyOf(rows.map((r) => [table, r.id])).toArray()).map((e) => e.row_id),
          );
          const fresh = rows.filter((r) => !pending.has(r.id));
          if (fresh.length) await db.table(table).bulkPut(fresh);
        });
      }
      if (rows.length) cursor = rows[rows.length - 1].updated_at;
      await setMeta(cursorKey, cursor);
      if (rows.length < PULL_PAGE) break;
    }
  }
}

/** Postgres numeric comes back as a string; the app wants numbers. */
const NUMERIC_FIELDS = new Set([
  "weight_kg", "increment_kg", "duration_min", "incline", "speed_kmh", "distance_km", "duration_minutes", "target_weight_kg",
  "target", "target_per_kg", "value",
]);
function normaliseNumbers(row: Record<string, unknown>): Record<string, unknown> {
  const out = { ...row };
  for (const k of NUMERIC_FIELDS) {
    if (typeof out[k] === "string") out[k] = Number(out[k]);
  }
  return out;
}

function stripServerFields(row: Record<string, unknown>): Record<string, unknown> {
  const rest = { ...row };
  delete rest.updated_at;
  return rest;
}

function isNetworkError(error: { message?: string; code?: string }): boolean {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return true;
  const msg = (error.message ?? "").toLowerCase();
  return !error.code && (msg.includes("fetch") || msg.includes("network") || msg.includes("load failed"));
}

/** Wipe local data, e.g. when a different person signs in on this phone. */
export async function clearLocal(): Promise<void> {
  await db.transaction("rw", db.tables, async () => {
    for (const t of db.tables) await t.clear();
  });
  await refreshPending();
}

export function isNetworkFailure(e: unknown): boolean {
  return e instanceof NetworkError;
}
