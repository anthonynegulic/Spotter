"use client";

/**
 * Rest timer state. Timestamp-based: we store when rest ends and work out
 * what's left on every render, so the timer is right after the phone locks
 * or the app is closed. Kept in localStorage so it survives a reload.
 */

export interface RestState {
  endAt: number;
  total: number;
}

const KEY = "spotter.rest";
let current: RestState | null = read();
const listeners = new Set<() => void>();

function read(): RestState | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as RestState) : null;
  } catch {
    return null;
  }
}

function write(next: RestState | null) {
  current = next;
  try {
    if (next) localStorage.setItem(KEY, JSON.stringify(next));
    else localStorage.removeItem(KEY);
  } catch {
    // Private mode etc.: the timer still works for this page.
  }
  for (const fn of listeners) fn();
}

export function getRest(): RestState | null {
  return current;
}

export function subscribeRest(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function startRest(seconds: number) {
  if (seconds <= 0) return write(null);
  write({ endAt: Date.now() + seconds * 1000, total: seconds });
}

export function adjustRest(deltaSeconds: number) {
  if (!current) return;
  const endAt = Math.max(Date.now(), current.endAt + deltaSeconds * 1000);
  write({ endAt, total: Math.max(1, current.total + deltaSeconds) });
}

export function clearRest() {
  write(null);
}
