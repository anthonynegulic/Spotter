import type { IngestStore } from "./ingest.ts";
import type { SampleRow, WorkoutRow } from "./healthExport.ts";

/** Minimal shape of the supabase-js client used here, so this file has no runtime imports. */
interface Client {
  from(table: string): {
    select(cols: string): { eq(c: string, v: string): { is(c: string, v: null): { maybeSingle(): PromiseLike<{ data: { user_id: string } | null; error: { message: string } | null }> } } };
    upsert(rows: object[], opts: { onConflict: string }): PromiseLike<{ error: { message: string } | null }>;
    update(patch: object): { eq(c: string, v: string): PromiseLike<{ error: { message: string } | null }> };
  };
}

/** IngestStore backed by Supabase, using the service role (bypasses RLS; server-side only). */
export function supabaseStore(client: Client): IngestStore {
  const check = (error: { message: string } | null, what: string) => {
    if (error) throw new Error(`${what}: ${error.message}`);
  };
  return {
    async userForTokenHash(hash) {
      // A failed lookup (e.g. a missing service role key) must be a server error, not "unknown token".
      const { data, error } = await client.from("ingest_tokens").select("user_id").eq("token_hash", hash).is("revoked_at", null).maybeSingle();
      check(error, "Checking token");
      return data?.user_id ?? null;
    },
    async upsertSamples(userId, rows: SampleRow[]) {
      for (let i = 0; i < rows.length; i += 500) {
        const { error } = await client
          .from("health_samples")
          .upsert(rows.slice(i, i + 500).map((r) => ({ ...r, user_id: userId, deleted_at: null })), { onConflict: "user_id,metric,recorded_at" });
        check(error, "Saving health samples");
      }
    },
    async upsertWorkouts(userId, rows: WorkoutRow[]) {
      const { error } = await client
        .from("health_workouts")
        .upsert(rows.map((r) => ({ ...r, user_id: userId })), { onConflict: "user_id,external_id" });
      check(error, "Saving workouts");
    },
    async markTokenUsed(hash) {
      const { error } = await client.from("ingest_tokens").update({ last_used_at: new Date().toISOString() }).eq("token_hash", hash);
      check(error, "Updating last received");
    },
  };
}
