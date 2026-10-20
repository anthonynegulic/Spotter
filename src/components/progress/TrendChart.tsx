"use client";

import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { Range } from "@/lib/workout/progress";

const BLUE = "#2a5ff0";
const ORANGE = "#ff7a1a";
const GRID = "#e8eaf0";
const INK_2 = "#555c6b";

export interface TrendPoint {
  t: number;
  value: number;
}

/**
 * Single-series trend: 2px line, 10% area wash, hairline grid, the latest
 * point marked in orange. Tap or drag for a crosshair tooltip.
 */
export function TrendChart({
  points,
  range,
  format,
  unit,
  label,
  height = 200,
}: {
  points: TrendPoint[];
  range: Range;
  format: (v: number) => string;
  unit: string;
  label: string;
  height?: number;
}) {
  const values = points.map((p) => p.value);
  const [lo, hi] = niceDomain(Math.min(...values), Math.max(...values));
  const ticks = niceTicks(lo, hi);
  const xTicks = timeTicks(points[0].t, points[points.length - 1].t, range);
  const last = points.length - 1;

  return (
    <figure aria-label={label} className="-mx-1">
      <ResponsiveContainer width="100%" height={height}>
        <AreaChart data={points} margin={{ top: 12, right: 12, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id="trend-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={BLUE} stopOpacity={0.12} />
              <stop offset="100%" stopColor={BLUE} stopOpacity={0.04} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke={GRID} strokeWidth={1} />
          <XAxis
            dataKey="t"
            type="number"
            scale="time"
            domain={[points[0].t, points[last].t]}
            ticks={xTicks}
            tickFormatter={(t: number) => tickLabel(t, range)}
            tick={{ fill: INK_2, fontSize: 13, fontWeight: 600 }}
            axisLine={false}
            tickLine={false}
            interval="preserveStartEnd"
            padding={{ left: 8, right: 8 }}
          />
          <YAxis
            domain={[lo, hi]}
            ticks={ticks}
            width={44}
            tick={{ fill: INK_2, fontSize: 13, fontWeight: 600 }}
            tickFormatter={(v: number) => compact(v)}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip
            cursor={{ stroke: INK_2, strokeWidth: 1 }}
            content={({ active, payload }) => {
              const p = active && payload?.[0]?.payload as TrendPoint | undefined;
              if (!p) return null;
              return (
                <div className="rounded-[var(--radius-button)] bg-ink px-3 py-2 text-sm text-white shadow-lg">
                  <div className="font-semibold opacity-80">
                    {new Date(p.t).toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short" })}
                  </div>
                  <div className="text-base font-extrabold">
                    {format(p.value)} {unit}
                  </div>
                </div>
              );
            }}
          />
          <Area
            type="monotone"
            dataKey="value"
            stroke={BLUE}
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="url(#trend-fill)"
            isAnimationActive={false}
            dot={(props: { cx?: number; cy?: number; index?: number }) =>
              props.index === last && props.cx !== undefined && props.cy !== undefined ? (
                <circle key="last" cx={props.cx} cy={props.cy} r={6} fill={ORANGE} stroke="#fff" strokeWidth={2} />
              ) : (
                <g key={`d${props.index}`} />
              )
            }
            activeDot={{ r: 6, fill: BLUE, stroke: "#fff", strokeWidth: 2 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </figure>
  );
}

/** Pads the range and rounds to a clean step so the line never hugs the edges. */
export function niceDomain(min: number, max: number): [number, number] {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [0, 1];
  const span = Math.max(max - min, Math.abs(max) * 0.05, 1);
  const step = niceStep(span / 2);
  const lo = Math.max(0, Math.floor((min - span * 0.15) / step) * step);
  const hi = Math.ceil((max + span * 0.15) / step) * step;
  return [lo, hi === lo ? lo + step : hi];
}

function niceStep(raw: number): number {
  const pow = 10 ** Math.floor(Math.log10(raw));
  const m = raw / pow;
  return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 5 ? 5 : 10) * pow;
}

/** Three evenly spaced, round ticks across the domain. */
export function niceTicks(lo: number, hi: number): number[] {
  const mid = (lo + hi) / 2;
  return [lo, Number.isInteger(mid) ? mid : Math.round(mid * 10) / 10, hi];
}

function timeTicks(from: number, to: number, range: Range): number[] {
  const ticks: number[] = [];
  const d = new Date(from);
  if (range === "4w") {
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + ((8 - d.getDay()) % 7)); // next Monday
    for (; d.getTime() <= to; d.setDate(d.getDate() + 7)) ticks.push(d.getTime());
  } else {
    const d2 = new Date(d.getFullYear(), d.getMonth() + (d.getDate() === 1 ? 0 : 1), 1);
    for (; d2.getTime() <= to; d2.setMonth(d2.getMonth() + 1)) ticks.push(d2.getTime());
  }
  // Keep at most five, evenly picked.
  if (ticks.length <= 5) return ticks.length ? ticks : [from, to];
  const step = Math.ceil(ticks.length / 5);
  return ticks.filter((_, i) => i % step === 0);
}

function tickLabel(t: number, range: Range): string {
  const d = new Date(t);
  return range === "4w"
    ? d.toLocaleDateString("en-AU", { day: "numeric", month: "short" })
    : d.toLocaleDateString("en-AU", { month: "short" });
}

export function compact(v: number): string {
  if (Math.abs(v) >= 10_000) return `${Math.round(v / 1000)}K`;
  if (Math.abs(v) >= 1000) return `${(v / 1000).toFixed(1).replace(/\.0$/, "")}K`;
  return Number.isInteger(v) ? String(v) : v.toFixed(1);
}
