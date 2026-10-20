"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { useState } from "react";
import { healthSource } from "@/lib/health/source";
import type { HealthSampleRow } from "@/lib/db/types";
import { change, inRange, sinceLabel, type Range } from "@/lib/workout/progress";
import { Card } from "../ui";
import { DeltaChip } from "./DeltaChip";
import { MetricToggle } from "./RangeTabs";
import { TrendChart } from "./TrendChart";

type Body = "body_mass" | "body_fat_percentage" | "lean_body_mass";
const BODY: { key: Body; label: string; title: string; unit: string }[] = [
  { key: "body_mass", label: "Weight", title: "Body weight", unit: "kg" },
  { key: "body_fat_percentage", label: "Body fat", title: "Body fat", unit: "%" },
  { key: "lean_body_mass", label: "Lean mass", title: "Lean mass", unit: "kg" },
];

type Activity = "step_count" | "active_energy" | "apple_exercise_time";
const ACTIVITY: { key: Activity; label: string; unit: string }[] = [
  { key: "step_count", label: "Steps", unit: "steps" },
  { key: "active_energy", label: "Calories", unit: "kcal" },
  { key: "apple_exercise_time", label: "Minutes", unit: "min" },
];

/** One reading per day: the latest that day (weigh-ins can happen more than once). */
function daily(samples: HealthSampleRow[], metric: string) {
  const byDay = new Map<string, HealthSampleRow>();
  for (const s of samples) {
    if (s.metric !== metric || s.deleted_at) continue;
    const day = s.local_date ?? s.recorded_at.slice(0, 10);
    const prev = byDay.get(day);
    if (!prev || s.recorded_at > prev.recorded_at) byDay.set(day, s);
  }
  return [...byDay.entries()]
    .map(([day, s]) => {
      const [y, m, d] = day.split("-").map(Number);
      return { t: new Date(y, m - 1, d, 12).getTime(), value: Math.round(s.value * 10) / 10, source: s.source };
    })
    .sort((a, b) => a.t - b.t);
}

/** Body weight and composition from Renpho via Apple Health (or typed in), on the Progress tab. */
export function BodyCard({ range }: { range: Range }) {
  const samples = useLiveQuery(() => healthSource.samples(BODY.map((b) => b.key)), []);
  const [metric, setMetric] = useState<Body>("body_mass");
  if (!samples) return null;
  const available = BODY.filter((b) => samples.some((s) => s.metric === b.key && !s.deleted_at));
  if (available.length === 0) return null;
  const current = available.find((b) => b.key === metric) ?? available[0];
  const all = daily(samples, current.key);
  const pts = inRange(all, range, new Date());
  const latest = all.at(-1)!;
  const delta = change(pts);
  const fmt = (v: number) => (Math.round(v * 10) / 10).toString();
  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-3">
        <h2 className="text-heading font-extrabold">{current.title}</h2>
        <span className="text-sm text-ink-2">{latest.source === "manual" ? "Entered by hand" : "From Apple Health"}</span>
      </div>
      <div className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-2">
        <span className="text-[2.5rem] leading-none font-extrabold">{fmt(latest.value)}</span>
        <span className="text-lg text-ink-2">{current.unit}</span>
        {delta && <DeltaChip delta={delta.delta} unit={current.unit} since={sinceLabel(delta.since, range, new Date())} format={fmt} />}
      </div>
      {pts.length > 1 ? (
        <div className="mt-4">
          <TrendChart points={pts} range={range} format={fmt} unit={current.unit} label={`${current.title} over time`} height={170} />
        </div>
      ) : (
        <p className="mt-3 text-sm text-ink-2">The trend draws itself once there are a few readings in this range.</p>
      )}
      {available.length > 1 && (
        <div className="mt-4">
          <MetricToggle options={available} value={current.key} onChange={setMetric} />
        </div>
      )}
    </Card>
  );
}

/** Daily steps, active calories and exercise minutes from the Watch. */
export function ActivityCard({ range }: { range: Range }) {
  const samples = useLiveQuery(() => healthSource.samples(ACTIVITY.map((a) => a.key)), []);
  const [metric, setMetric] = useState<Activity>("step_count");
  if (!samples) return null;
  const available = ACTIVITY.filter((a) => samples.some((s) => s.metric === a.key && !s.deleted_at));
  if (available.length === 0) return null;
  const current = available.find((a) => a.key === metric) ?? available[0];
  const pts = inRange(daily(samples, current.key), range, new Date());
  const avg = pts.length ? pts.reduce((n, p) => n + p.value, 0) / pts.length : 0;
  const fmt = (v: number) => Math.round(v).toLocaleString("en-AU");
  return (
    <Card className="p-5">
      <h2 className="text-heading font-extrabold">Daily activity</h2>
      <p className="mt-2 flex items-baseline gap-2">
        <span className="text-[2.5rem] leading-none font-extrabold">{fmt(avg)}</span>
        <span className="text-lg text-ink-2">{current.unit} a day on average</span>
      </p>
      {pts.length > 1 && (
        <div className="mt-4">
          <TrendChart points={pts} range={range} format={fmt} unit={current.unit} label={`Daily ${current.label.toLowerCase()}`} height={170} />
        </div>
      )}
      <div className="mt-4">
        <MetricToggle options={available} value={current.key} onChange={setMetric} />
      </div>
    </Card>
  );
}
