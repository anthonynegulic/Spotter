import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { db } from "../local";
import { pull, push } from "../sync";

/** In-memory stand-in for the bits of PostgREST the sync engine uses. */
class FakeServer {
  tables = new Map<string, Map<string, Record<string, unknown>>>();
  offline = false;
  upsertCalls = 0;
  clock = Date.parse("2026-10-19T00:00:00Z");

  table(name: string) {
    if (!this.tables.has(name)) this.tables.set(name, new Map());
    return this.tables.get(name)!;
  }

  client(): SupabaseClient {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const server = this;
    const netErr = { error: { message: "TypeError: Failed to fetch", code: "" }, data: null };
    return {
      from(name: string) {
        return {
          async upsert(rows: Record<string, unknown>[]) {
            if (server.offline) return netErr;
            server.upsertCalls++;
            for (const r of rows) {
              server.clock += 1000;
              server.table(name).set(r.id as string, { ...server.table(name).get(r.id as string), ...r, updated_at: new Date(server.clock).toISOString() });
            }
            return { error: null };
          },
          select() {
            let since = "";
            let limit = Infinity;
            const q = {
              gt(_col: string, v: string) { since = v; return q; },
              order() { return q; },
              limit(n: number) { limit = n; return q; },
              then(resolve: (v: unknown) => void) {
                if (server.offline) return resolve(netErr);
                const data = [...server.table(name).values()]
                  .filter((r) => (r.updated_at as string) > since)
                  .sort((a, b) => (a.updated_at as string).localeCompare(b.updated_at as string))
                  .slice(0, limit);
                resolve({ data, error: null });
              },
            };
            return q;
          },
        };
      },
    } as unknown as SupabaseClient;
  }
}

const set = (id: string, weight: number) => ({
  id, user_id: "u", session_id: "s", exercise_id: "e", item_key: null, set_number: 1, weight_kg: weight, reps: 8, note: null, logged_at: "2026-10-19T08:00:00Z", deleted_at: null,
});

async function queue(row: ReturnType<typeof set>) {
  await db.sets.put(row);
  await db.outbox.add({ table: "sets", row_id: row.id, payload: row, attempts: 0 });
}

describe("sync", () => {
  let server: FakeServer;
  beforeEach(async () => {
    server = new FakeServer();
    await Promise.all(db.tables.map((t) => t.clear()));
  });

  it("keeps writes queued while offline, then pushes once on reconnect", async () => {
    await queue(set("a", 80));
    server.offline = true;
    await expect(push(server.client())).rejects.toThrow();
    expect(await db.outbox.count()).toBe(1);
    expect(server.table("sets").size).toBe(0);

    server.offline = false;
    await push(server.client());
    expect(await db.outbox.count()).toBe(0);
    expect(server.table("sets").size).toBe(1);
  });

  it("a retried upsert of the same row doesn't create a duplicate", async () => {
    await queue(set("a", 80));
    await push(server.client());
    // Simulate the response being lost: the same write is sent again.
    await queue(set("a", 80));
    await push(server.client());
    expect(server.table("sets").size).toBe(1);
  });

  it("batches consecutive writes and keeps the latest value per row", async () => {
    await queue(set("a", 80));
    await queue(set("a", 82.5));
    await queue(set("b", 60));
    await push(server.client());
    expect(server.upsertCalls).toBe(1);
    expect(server.table("sets").get("a")!.weight_kg).toBe(82.5);
  });

  it("pulls remote rows, converting numeric strings, without clobbering unsynced local edits", async () => {
    server.table("sets").set("r", { ...set("r", 0), weight_kg: "100.5", updated_at: "2026-10-19T01:00:00Z" });
    server.table("sets").set("a", { ...set("a", 70), updated_at: "2026-10-19T01:00:01Z" });
    await queue(set("a", 90)); // local edit not yet pushed
    await pull(server.client());
    expect((await db.sets.get("r"))!.weight_kg).toBe(100.5);
    expect((await db.sets.get("a"))!.weight_kg).toBe(90);
  });

  it("only pulls rows changed since last time", async () => {
    server.table("sets").set("r", { ...set("r", 50), updated_at: "2026-10-19T01:00:00Z" });
    server.table("sets").set("q", { ...set("q", 60), updated_at: "2026-10-19T02:00:00Z" });
    await pull(server.client());
    await db.sets.clear();
    await pull(server.client());
    // r is well before the cursor and isn't fetched again; q sits at the cursor
    // and is re-read by the small overlap window, which is harmless.
    expect((await db.sets.toArray()).map((s) => s.id)).toEqual(["q"]);
  });
});
