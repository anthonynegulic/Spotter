"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { useEffect } from "react";

/** Shared building blocks for the "Balanced" design direction. */

export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(" ");
}

export const btn = {
  primary:
    "inline-flex items-center justify-center gap-2 rounded-[var(--radius-control)] bg-accent px-5 font-bold text-white active:bg-accent-press disabled:opacity-50 min-h-14 text-lg",
  tinted:
    "inline-flex items-center justify-center gap-2 rounded-[var(--radius-control)] bg-accent-tint px-4 font-bold text-accent-ink active:brightness-95 disabled:opacity-50 min-h-12",
  quiet:
    "inline-flex items-center justify-center gap-2 rounded-[var(--radius-button)] bg-pill px-4 font-semibold text-ink active:brightness-95 disabled:opacity-50 min-h-11",
  white:
    "inline-flex items-center justify-center gap-2 rounded-[var(--radius-button)] bg-white px-3 font-bold text-ink active:brightness-95 min-h-10",
  link: "inline-flex items-center gap-2 font-bold text-accent-ink active:opacity-70 min-h-11",
};

export function Card({ className, children, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cx("rounded-[var(--radius-card)] bg-card p-4", className)} {...rest}>
      {children}
    </div>
  );
}

export function Chip({ tone = "grey", children, className }: { tone?: "blue" | "orange" | "grey"; children: React.ReactNode; className?: string }) {
  const tones = {
    blue: "bg-accent-tint text-accent-ink",
    orange: "bg-warm-tint text-warm-ink",
    grey: "bg-pill text-ink-2",
  };
  return (
    <span className={cx("inline-flex items-center rounded-full px-3 py-1 text-sm font-bold", tones[tone], className)}>
      {children}
    </span>
  );
}

export function PrBadge({ className }: { className?: string }) {
  return (
    <span className={cx("inline-flex items-center rounded-full bg-warm px-2.5 py-0.5 text-xs font-extrabold text-on-warm", className)}>
      PR
    </span>
  );
}

/** Page header with the square back button from the mockups. */
export function ScreenHeader({ title, back, right }: { title: string; back?: string | true; right?: React.ReactNode }) {
  const router = useRouter();
  return (
    <header className="pt-safe flex items-center gap-3 px-[var(--spacing-gutter)] pb-4">
      {back &&
        (back === true ? (
          <button aria-label="Back" onClick={() => router.back()} className="grid size-12 shrink-0 place-items-center rounded-[var(--radius-panel)] bg-card">
            <ChevronLeft className="size-6" />
          </button>
        ) : (
          <Link aria-label="Back" href={back} className="grid size-12 shrink-0 place-items-center rounded-[var(--radius-panel)] bg-card">
            <ChevronLeft className="size-6" />
          </Link>
        ))}
      <h1 className="min-w-0 flex-1 truncate text-title font-extrabold tracking-tight">{title}</h1>
      {right}
    </header>
  );
}

/** Bottom sheet. Tapping the backdrop closes it. */
export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title?: string; children: React.ReactNode }) {
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end" role="dialog" aria-modal="true" aria-label={title}>
      <button aria-label="Close" className="animate-fade-in absolute inset-0 bg-black/35" onClick={onClose} />
      <div className="animate-sheet-up pb-safe relative max-h-[90dvh] overflow-y-auto rounded-t-[24px] bg-card px-[var(--spacing-gutter)] pt-3">
        <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-line" />
        {title && <h2 className="mb-3 text-heading font-extrabold">{title}</h2>}
        <div className="pb-4">{children}</div>
      </div>
    </div>
  );
}

export function Spinner() {
  return <div className="size-6 animate-spin rounded-full border-[3px] border-accent-tint border-t-accent" aria-label="Loading" />;
}

export function FullScreenLoading() {
  return (
    <div className="grid min-h-dvh place-items-center">
      <Spinner />
    </div>
  );
}
