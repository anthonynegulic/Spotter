import { db } from "./local";
import type { RowMap, SyncedTable, TableRow } from "./types";
import { requestSync } from "./sync";

/**
 * Write rows locally and queue them for Supabase in one transaction, so the
 * local cache and the outbox never disagree. Rows are queued in the order
 * given; parents must come before children.
 */
export async function saveRows(rows: TableRow[]): Promise<void> {
  const tables = [...new Set(rows.map(([t]) => t))].map((t) => db.table(t));
  await db.transaction("rw", [...tables, db.outbox], async () => {
    for (const [table, row] of rows) {
      await db.table(table).put(row);
      await db.outbox.add({ table, row_id: row.id, payload: { ...row } as Record<string, unknown>, attempts: 0 });
    }
  });
  requestSync();
}

export function saveRow<T extends SyncedTable>(table: T, row: RowMap[T]): Promise<void> {
  return saveRows([[table, row] as TableRow]);
}

export function newId(): string {
  return crypto.randomUUID();
}

export function nowIso(): string {
  return new Date().toISOString();
}
