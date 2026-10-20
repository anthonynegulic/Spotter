"use client";

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label?: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative h-9 w-16 shrink-0 rounded-full transition-colors ${checked ? "bg-accent" : "bg-line"}`}
    >
      <span className={`absolute top-1 size-7 rounded-full bg-white shadow transition-all ${checked ? "left-8" : "left-1"}`} />
    </button>
  );
}
