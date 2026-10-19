"use client";

import { useEffect, useLayoutEffect, useRef } from "react";
import { cx } from "./ui";

const ITEM_H = 48;
const VISIBLE = 5;

/**
 * iOS-style wheel built on CSS scroll-snap, so momentum and snapping come from
 * the browser and it stays smooth on iPhone. No library.
 */
export function Wheel<T extends number>({
  values,
  value,
  onChange,
  format = String,
  label,
}: {
  values: T[];
  value: T;
  onChange: (v: T) => void;
  format?: (v: T) => string;
  label: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const settleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastEmitted = useRef<T>(value);
  const index = Math.max(0, values.indexOf(value));

  // Jump to the value whenever it changes from outside (open, nudge buttons).
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || lastEmitted.current === value) return;
    el.scrollTop = index * ITEM_H;
    lastEmitted.current = value;
  }, [index, value]);

  useLayoutEffect(() => {
    if (ref.current) ref.current.scrollTop = index * ITEM_H;
    // Only on mount; later changes are handled above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => () => {
    if (settleTimer.current) clearTimeout(settleTimer.current);
  }, []);

  function onScroll() {
    const el = ref.current;
    if (!el) return;
    const i = Math.min(values.length - 1, Math.max(0, Math.round(el.scrollTop / ITEM_H)));
    const v = values[i];
    if (v !== lastEmitted.current) {
      lastEmitted.current = v;
      onChange(v);
    }
    if (settleTimer.current) clearTimeout(settleTimer.current);
    settleTimer.current = setTimeout(() => {
      // Belt and braces for browsers that leave it between items.
      if (Math.abs(el.scrollTop - i * ITEM_H) > 1) el.scrollTo({ top: i * ITEM_H, behavior: "smooth" });
    }, 140);
  }

  return (
    <div className="relative flex-1" aria-label={label}>
      <div
        className="pointer-events-none absolute inset-x-1 rounded-[var(--radius-button)] bg-accent-tint"
        style={{ top: ITEM_H * Math.floor(VISIBLE / 2), height: ITEM_H }}
        aria-hidden
      />
      <div
        ref={ref}
        onScroll={onScroll}
        className="no-scrollbar relative snap-y snap-mandatory overflow-y-scroll overscroll-contain"
        style={{
          height: ITEM_H * VISIBLE,
          paddingBlock: ITEM_H * Math.floor(VISIBLE / 2),
          maskImage: "linear-gradient(to bottom, transparent, black 30%, black 70%, transparent)",
          WebkitMaskImage: "linear-gradient(to bottom, transparent, black 30%, black 70%, transparent)",
        }}
        role="listbox"
        aria-label={label}
        tabIndex={0}
      >
        {values.map((v, i) => (
          <button
            key={v}
            role="option"
            aria-selected={v === value}
            onClick={() => ref.current?.scrollTo({ top: i * ITEM_H, behavior: "smooth" })}
            className={cx(
              "flex w-full snap-center items-center justify-center text-2xl",
              v === value ? "font-extrabold text-accent-ink" : "font-semibold text-ink-2",
            )}
            style={{ height: ITEM_H }}
          >
            {format(v)}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Weight values for a wheel: 0..max in `step`, plus the current value if it's off-grid. */
export function weightValues(step: number, max: number, current: number): number[] {
  const values: number[] = [];
  for (let v = 0; v <= max + 1e-9; v = Math.round((v + step) * 100) / 100) values.push(v);
  if (!values.some((v) => Math.abs(v - current) < 1e-9)) {
    values.push(current);
    values.sort((a, b) => a - b);
  }
  return values;
}
