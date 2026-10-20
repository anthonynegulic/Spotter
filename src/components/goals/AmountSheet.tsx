"use client";

import { useState } from "react";
import { btn, Sheet } from "../ui";

/** A single number, typed in: a custom protein amount, today's steps, a body weight. */
export function AmountSheet({
  open,
  onClose,
  title,
  unit,
  initial,
  decimals = false,
  onSave,
  saveLabel = "Save",
  hint,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  unit: string;
  initial?: number | null;
  decimals?: boolean;
  onSave: (value: number) => void;
  saveLabel?: string;
  hint?: string;
}) {
  return (
    <Sheet open={open} onClose={onClose} title={title}>
      {open && <Body unit={unit} initial={initial} decimals={decimals} onSave={onSave} saveLabel={saveLabel} hint={hint} />}
    </Sheet>
  );
}

function Body({ unit, initial, decimals, onSave, saveLabel, hint }: { unit: string; initial?: number | null; decimals: boolean; onSave: (v: number) => void; saveLabel: string; hint?: string }) {
  const [text, setText] = useState(initial ? String(initial) : "");
  const value = Number(text.replace(",", "."));
  const valid = text.trim() !== "" && Number.isFinite(value) && value > 0;
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (valid) onSave(decimals ? Math.round(value * 10) / 10 : Math.round(value));
      }}
    >
      <label className="flex items-center gap-3 rounded-[var(--radius-control)] border-2 border-line px-4 focus-within:border-accent">
        <input
          autoFocus
          inputMode={decimals ? "decimal" : "numeric"}
          value={text}
          onChange={(e) => setText(e.target.value.replace(decimals ? /[^\d.,]/g : /\D/g, ""))}
          className="min-h-16 min-w-0 flex-1 bg-transparent text-3xl font-extrabold outline-none"
          aria-label={`Amount in ${unit}`}
        />
        <span className="text-lg font-semibold text-ink-2">{unit}</span>
      </label>
      {hint && <p className="text-sm text-ink-2">{hint}</p>}
      <button type="submit" disabled={!valid} className={`${btn.primary} w-full`}>
        {saveLabel}
      </button>
    </form>
  );
}
