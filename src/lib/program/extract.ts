/**
 * Pulls the JSON object out of a chat reply. Chat apps wrap JSON in ```json
 * fences and often add a sentence before or after it, so we find the
 * outermost balanced {...} and ignore everything else.
 */
export type ExtractResult =
  | { ok: true; value: unknown }
  | { ok: false; error: string };

export function extractJson(text: string): ExtractResult {
  const cleaned = text
    .replace(/^﻿/, "")
    // Smart quotes from notes apps and some chat UIs.
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'");

  // Prefer the contents of a fenced block if there is one.
  const fence = cleaned.match(/```(?:json|JSON)?\s*\n([\s\S]*?)```/);
  const source = fence ? fence[1] : cleaned;

  const start = source.indexOf("{");
  if (start === -1) {
    return { ok: false, error: "Couldn't find any JSON in what you pasted. Paste the whole reply from Claude or ChatGPT." };
  }
  const end = findMatchingBrace(source, start);
  if (end === -1) {
    return { ok: false, error: "The JSON looks cut off. Check you copied the whole reply, right to the last }." };
  }
  const candidate = source.slice(start, end + 1);

  try {
    return { ok: true, value: JSON.parse(candidate) };
  } catch {
    // Trailing commas are the most common hand-edit mistake; safe to drop.
    const relaxed = candidate.replace(/,(\s*[}\]])/g, "$1");
    try {
      return { ok: true, value: JSON.parse(relaxed) };
    } catch (e) {
      return { ok: false, error: describeParseError(e, relaxed) };
    }
  }
}

/** Index of the brace that closes the one at `start`, ignoring braces inside strings. */
function findMatchingBrace(s: string, start: number): number {
  let depth = 0;
  let inString = false;
  for (let i = start; i < s.length; i++) {
    const c = s[i];
    if (inString) {
      if (c === "\\") i++;
      else if (c === '"') inString = false;
      continue;
    }
    if (c === '"') inString = true;
    else if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

function describeParseError(e: unknown, source: string): string {
  const msg = e instanceof Error ? e.message : String(e);
  const pos = msg.match(/position (\d+)/);
  if (pos) {
    const index = Number(pos[1]);
    const line = source.slice(0, index).split("\n").length;
    const snippet = source.slice(Math.max(0, index - 20), index + 20).replace(/\s+/g, " ").trim();
    return `The JSON has a formatting error on line ${line}, near "${snippet}". Ask the AI to resend it, or fix that spot.`;
  }
  return "The JSON has a formatting error. Ask the AI to resend it as valid JSON.";
}
