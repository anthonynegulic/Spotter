import { db } from "@/lib/db/local";
import type { IngestTokenRow } from "@/lib/db/types";
import { newId, nowIso, saveRow } from "@/lib/db/write";

/** The header Health Auto Export sends the token in. Must match supabase/functions/_shared/ingest.ts. */
export const TOKEN_HEADER = "X-Ingest-Token";

export function ingestUrl(): string | null {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  return base ? `${base.replace(/\/$/, "")}/functions/v1/health-ingest` : null;
}

export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Creates an ingest token on the phone and stores only its hash. The token
 * is returned once so it can be copied into Health Auto Export.
 */
export async function createIngestToken(userId: string, label: string): Promise<string> {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const token = `spt_${btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")}`;
  const row: IngestTokenRow = {
    id: newId(),
    user_id: userId,
    token_hash: await sha256Hex(token),
    label: label.trim() || null,
    created_at: nowIso(),
    last_used_at: null,
    revoked_at: null,
  };
  await saveRow("ingest_tokens", row);
  return token;
}

export async function revokeIngestToken(token: IngestTokenRow): Promise<void> {
  const fresh = (await db.ingest_tokens.get(token.id)) ?? token;
  await saveRow("ingest_tokens", { ...fresh, revoked_at: nowIso() });
}
