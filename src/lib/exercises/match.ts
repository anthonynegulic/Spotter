import type { Equipment } from "@/lib/program/schema";

/**
 * Silent exercise matching at import (BRIEF.md §5.1). In order:
 *   1. exact name, case-insensitive;
 *   2. a known alias;
 *   3. a high-confidence fuzzy match.
 * Anything less certain becomes a new exercise: a duplicate can be merged
 * later, but a wrong merge silently corrupts history.
 */

export interface MatchCandidate {
  id: string;
  name: string;
  equipment: Equipment | null;
  aliases: string[];
}

export type MatchKind = "exact" | "alias" | "fuzzy";

export function matchExercise(
  name: string,
  equipment: Equipment | null,
  candidates: MatchCandidate[],
): { id: string; kind: MatchKind } | null {
  const lower = simple(name);

  const exact = candidates.find((c) => simple(c.name) === lower);
  if (exact) return { id: exact.id, kind: "exact" };

  const alias = candidates.find((c) => c.aliases.some((a) => simple(a) === lower));
  if (alias) return { id: alias.id, kind: "alias" };

  const tokens = canonicalTokens(name);
  if (tokens.length === 0) return null;
  for (const c of candidates) {
    if (equipment && c.equipment && equipment !== c.equipment && equipment !== "other" && c.equipment !== "other") continue;
    const names = [c.name, ...c.aliases];
    if (names.some((n) => tokensMatch(tokens, canonicalTokens(n)))) return { id: c.id, kind: "fuzzy" };
  }
  return null;
}

/** Lowercase, trimmed, single-spaced. The form used for exact and alias matches. */
export function simple(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

const ABBREVIATIONS: Record<string, string[]> = {
  db: ["dumbbell"],
  dbs: ["dumbbell"],
  bb: ["barbell"],
  kb: ["kettlebell"],
  bw: ["bodyweight"],
  rdl: ["romanian", "deadlift"],
  sldl: ["stiff", "leg", "deadlift"],
  ohp: ["overhead", "press"],
  inc: ["incline"],
  dec: ["decline"],
  ext: ["extension"],
  alt: ["alternating"],
  rev: ["reverse"],
  tri: ["tricep"],
  bi: ["bicep"],
  ez: ["ez"],
};

/** Words that never change which exercise it is. */
const FILLER = new Set(["the", "a", "an", "with", "on", "of", "and", "using", "exercise"]);

/** Compound words written several ways: "pull-up", "pullup", "pull up". */
const COMPOUNDS: [RegExp, string][] = [
  [/\bpull[\s-]?ups?\b/g, "pullup"],
  [/\bchin[\s-]?ups?\b/g, "chinup"],
  [/\bpush[\s-]?ups?\b/g, "pushup"],
  [/\bsit[\s-]?ups?\b/g, "situp"],
  [/\bstep[\s-]?ups?\b/g, "stepup"],
  [/\bpull[\s-]?downs?\b/g, "pulldown"],
  [/\bpush[\s-]?downs?\b/g, "pushdown"],
  [/\bdead[\s-]?lifts?\b/g, "deadlift"],
  [/\bdumb[\s-]?bells?\b/g, "dumbbell"],
  [/\bbar[\s-]?bells?\b/g, "barbell"],
  [/\bkettle[\s-]?bells?\b/g, "kettlebell"],
  [/\bbody[\s-]?weight\b/g, "bodyweight"],
  [/\bover[\s-]?head\b/g, "overhead"],
];

/** Sorted, de-pluralised, abbreviation-expanded tokens. Word order is ignored. */
export function canonicalTokens(name: string): string[] {
  let s = name.toLowerCase().replace(/&/g, " and ");
  for (const [re, to] of COMPOUNDS) s = s.replace(re, to);
  const raw = s.split(/[^a-z0-9]+/).filter(Boolean);
  const out: string[] = [];
  for (const t of raw) {
    for (const word of ABBREVIATIONS[t] ?? [t]) {
      if (FILLER.has(word)) continue;
      out.push(singular(word));
    }
  }
  return out.sort();
}

function singular(t: string): string {
  if (t.length > 3 && t.endsWith("s") && !t.endsWith("ss") && !t.endsWith("us")) return t.slice(0, -1);
  return t;
}

/**
 * Same words, allowing a one-letter typo in longer words ("romainian").
 * Every word has to line up, so "Dumbbell Bench Press" never matches
 * "Barbell Bench Press" or "Incline Dumbbell Bench Press".
 */
function tokensMatch(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] === b[i]) continue;
    if (a[i].length < 5 || b[i].length < 5 || editDistance(a[i], b[i]) > 1) return false;
  }
  return true;
}

function editDistance(a: string, b: string): number {
  const dp = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = dp[j];
      dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return dp[b.length];
}
