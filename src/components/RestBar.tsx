"use client";

import { useEffect, useSyncExternalStore } from "react";
import { adjustRest, clearRest, getRest, subscribeRest } from "@/lib/workout/rest";
import { useNow } from "@/lib/hooks/useNow";
import { cx } from "./ui";

/** How long the "rest's up" state stays on screen before the bar tidies itself away. */
const DONE_LINGER_MS = 90_000;

export function RestBar() {
  const rest = useSyncExternalStore(subscribeRest, getRest, () => null);
  const now = useNow(250, rest !== null);

  const remainingMs = rest ? rest.endAt - now : 0;
  const done = rest !== null && remainingMs <= 0;

  useEffect(() => {
    if (rest && now - rest.endAt > DONE_LINGER_MS) clearRest();
  }, [rest, now]);

  if (!rest) return null;
  const secs = Math.max(0, Math.ceil(remainingMs / 1000));
  const progress = Math.min(1, Math.max(0, 1 - remainingMs / (rest.total * 1000)));

  return (
    <div className="sticky top-0 z-40 px-[var(--spacing-gutter)] pt-[max(env(safe-area-inset-top),8px)] pb-2">
      <div
        className={cx(
          "relative overflow-hidden rounded-[var(--radius-card)] bg-warm px-5 py-3 text-on-warm shadow-lg shadow-warm/25",
          done && "animate-rest-done",
        )}
        role="timer"
        aria-live={done ? "assertive" : "off"}
      >
        <div className="absolute inset-y-0 left-0 bg-white/20" style={{ width: `${progress * 100}%` }} aria-hidden />
        <div className="relative flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <div className="text-sm font-bold">{done ? "Rest's up" : "Rest"}</div>
            <div className="text-4xl leading-none font-extrabold">{done ? "Next set" : formatClock(secs)}</div>
          </div>
          {done ? (
            <button onClick={clearRest} className="min-h-11 rounded-[var(--radius-button)] bg-white px-4 font-bold">
              Dismiss
            </button>
          ) : (
            <>
              <button onClick={() => adjustRest(-15)} className="min-h-11 rounded-[var(--radius-button)] bg-white px-3 font-bold" aria-label="Take 15 seconds off">
                −15s
              </button>
              <button onClick={() => adjustRest(15)} className="min-h-11 rounded-[var(--radius-button)] bg-white px-3 font-bold" aria-label="Add 15 seconds">
                +15s
              </button>
              <button onClick={clearRest} className="min-h-11 rounded-[var(--radius-button)] bg-white px-3 font-bold">
                Skip
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export function formatClock(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}
