/**
 * Parses a Health Auto Export JSON payload (export version 2, also tolerating
 * version 1) into the rows Spotter stores. Plain TypeScript with no runtime
 * imports, so the Edge Function (Deno) and the tests (Node) share it.
 *
 * Kept: daily totals and body measurements, resting heart rate, and a summary
 * per workout. Everything else in the payload (per-minute heart rate, routes,
 * splits) is ignored on purpose. See BRIEF.md §5.6.
 */

export interface SampleRow {
  metric: string;
  value: number;
  unit: string;
  recorded_at: string;
  local_date: string;
  source: string | null;
}

export interface WorkoutRow {
  external_id: string;
  name: string;
  started_at: string;
  ended_at: string;
  duration_s: number | null;
  active_kcal: number | null;
  avg_hr: number | null;
  max_hr: number | null;
  source: string | null;
}

export interface ParsedExport {
  samples: SampleRow[];
  workouts: WorkoutRow[];
  skipped: number;
  /** Metric names in the payload that Spotter doesn't keep, so a renamed metric isn't lost silently. */
  ignored: string[];
}

/** Health Auto Export metric name → Spotter metric and the unit we store it in. */
const METRICS: Record<string, { metric: string; unit: "count" | "kcal" | "min" | "kg" | "%" | "bpm" }> = {
  step_count: { metric: "step_count", unit: "count" },
  active_energy: { metric: "active_energy", unit: "kcal" },
  apple_exercise_time: { metric: "apple_exercise_time", unit: "min" },
  weight_body_mass: { metric: "body_mass", unit: "kg" },
  body_mass: { metric: "body_mass", unit: "kg" },
  body_fat_percentage: { metric: "body_fat_percentage", unit: "%" },
  body_mass_index: { metric: "body_mass_index", unit: "count" },
  lean_body_mass: { metric: "lean_body_mass", unit: "kg" },
  resting_heart_rate: { metric: "resting_heart_rate", unit: "bpm" },
};

/** "2026-10-19 00:00:00 +1100" → ISO string, plus the local calendar day it was recorded on. */
export function parseHaeDate(s: unknown): { iso: string; localDate: string } | null {
  if (typeof s !== "string") return null;
  const m = s.trim().match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})(?:\.\d+)?\s*([+-]\d{2}):?(\d{2})$/);
  if (!m) {
    const d = new Date(s);
    return Number.isNaN(d.getTime()) ? null : { iso: d.toISOString(), localDate: s.slice(0, 10) };
  }
  const d = new Date(`${m[1]}T${m[2]}${m[3]}:${m[4]}`);
  if (Number.isNaN(d.getTime())) return null;
  return { iso: d.toISOString(), localDate: m[1] };
}

/** Converts a value into the unit we store. Null if the unit is one we don't understand. */
export function convert(value: number, from: string, to: string): number | null {
  const f = from.trim().toLowerCase();
  if (to === "kcal") {
    if (f === "kcal" || f === "cal") return value;
    if (f === "kj") return value / 4.184;
    return null;
  }
  if (to === "kg") {
    if (f === "kg") return value;
    if (f === "lb" || f === "lbs") return value * 0.45359237;
    if (f === "g") return value / 1000;
    return null;
  }
  if (to === "min") {
    if (f === "min") return value;
    if (f === "hr" || f === "h") return value * 60;
    if (f === "s" || f === "sec") return value / 60;
    return null;
  }
  return value; // counts, %, bpm: no conversion
}

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const qty = (v: unknown): number | null => (v && typeof v === "object" ? num((v as { qty?: unknown }).qty) : num(v));
const unitOf = (v: unknown): string | null => (v && typeof v === "object" && typeof (v as { units?: unknown }).units === "string" ? (v as { units: string }).units : null);
const round = (v: number, places: number) => Math.round(v * 10 ** places) / 10 ** places;

export function parseHealthExport(body: unknown): ParsedExport {
  const out: ParsedExport = { samples: [], workouts: [], skipped: 0, ignored: [] };
  const data = (body as { data?: { metrics?: unknown; workouts?: unknown } } | null)?.data;
  if (!data || typeof data !== "object") throw new Error("Expected a Health Auto Export JSON body with a `data` object");

  for (const m of Array.isArray(data.metrics) ? data.metrics : []) {
    const name = (m as { name?: unknown })?.name;
    const map = typeof name === "string" ? METRICS[name] : undefined;
    if (!map) {
      // Not a metric we keep (e.g. raw heart_rate). Reported back so a renamed one is noticed.
      if (typeof name === "string" && !out.ignored.includes(name)) out.ignored.push(name);
      continue;
    }
    const units = String((m as { units?: unknown }).units ?? "");
    for (const point of Array.isArray((m as { data?: unknown }).data) ? (m as { data: unknown[] }).data : []) {
      const p = point as { date?: unknown; qty?: unknown; source?: unknown };
      const when = parseHaeDate(p.date);
      const raw = num(p.qty);
      const value = raw === null ? null : convert(raw, units, map.unit);
      if (!when || value === null) {
        out.skipped++;
        continue;
      }
      out.samples.push({
        metric: map.metric,
        value: round(value, 3),
        unit: map.unit,
        recorded_at: when.iso,
        local_date: when.localDate,
        source: typeof p.source === "string" ? p.source : null,
      });
    }
  }

  for (const w of Array.isArray(data.workouts) ? data.workouts : []) {
    const x = w as Record<string, unknown>;
    const start = parseHaeDate(x.start);
    const end = parseHaeDate(x.end);
    const id = typeof x.id === "string" ? x.id : start ? `${x.name}@${start.iso}` : null;
    if (!start || !end || !id) {
      out.skipped++;
      continue;
    }
    // v2: activeEnergyBurned + heartRate{avg,max}; v1: activeEnergy + avgHeartRate/maxHeartRate.
    const energy = x.activeEnergyBurned ?? x.activeEnergy;
    const energyQty = qty(energy);
    const kcal = energyQty === null ? null : convert(energyQty, unitOf(energy) ?? "kcal", "kcal");
    const hr = x.heartRate as { avg?: unknown; max?: unknown } | undefined;
    const avg = qty(hr?.avg) ?? qty(x.avgHeartRate);
    const max = qty(hr?.max) ?? qty(x.maxHeartRate);
    const duration = num(x.duration);
    const source = x.source && typeof x.source === "object" ? (x.source as { name?: unknown }).name : x.source;
    out.workouts.push({
      external_id: id,
      name: typeof x.name === "string" ? x.name : "Workout",
      started_at: start.iso,
      ended_at: end.iso,
      duration_s: duration === null ? null : round(duration, 1),
      active_kcal: kcal === null ? null : round(kcal, 1),
      avg_hr: avg === null ? null : round(avg, 1),
      max_hr: max === null ? null : round(max, 1),
      source: typeof source === "string" ? source : null,
    });
  }
  return out;
}
