import { parseHealthExport, type SampleRow, type WorkoutRow } from "./healthExport.ts";

/**
 * The health-ingest request handler, independent of runtime and database so
 * it can be tested in Node. Authenticates with a per-user ingest token (never
 * the user's session), then upserts so re-sends never duplicate.
 */

export const TOKEN_HEADER = "x-ingest-token";

export interface IngestStore {
  /** The user a token belongs to, if it exists and isn't revoked. */
  userForTokenHash(hash: string): Promise<string | null>;
  upsertSamples(userId: string, rows: SampleRow[]): Promise<void>;
  upsertWorkouts(userId: string, rows: WorkoutRow[]): Promise<void>;
  markTokenUsed(hash: string): Promise<void>;
}

export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

export async function handleIngest(req: Request, store: IngestStore): Promise<Response> {
  if (req.method !== "POST") return json(405, { error: "Use POST" });

  const header = req.headers.get(TOKEN_HEADER) ?? req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const token = header.trim();
  if (!token) return json(401, { error: `Missing ${TOKEN_HEADER} header` });
  const hash = await sha256Hex(token);
  const userId = await store.userForTokenHash(hash);
  if (!userId) return json(401, { error: "Unknown or revoked token" });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json(400, { error: "Body must be JSON (set Export Format to JSON)" });
  }

  let parsed;
  try {
    parsed = parseHealthExport(body);
  } catch (e) {
    return json(400, { error: e instanceof Error ? e.message : String(e) });
  }

  // Within one request a sample can appear twice; keep the last.
  const samples = [...new Map(parsed.samples.map((s) => [`${s.metric}|${s.recorded_at}`, s])).values()];
  const workouts = [...new Map(parsed.workouts.map((w) => [w.external_id, w])).values()];
  if (samples.length) await store.upsertSamples(userId, samples);
  if (workouts.length) await store.upsertWorkouts(userId, workouts);
  await store.markTokenUsed(hash);

  return json(200, { samples: samples.length, workouts: workouts.length, skipped: parsed.skipped });
}
