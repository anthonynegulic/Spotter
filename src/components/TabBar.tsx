"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarDays, ChartLine, ListChecks, Target } from "lucide-react";
import { cx } from "./ui";

const TABS = [
  { href: "/today", label: "Today", icon: CalendarDays },
  { href: "/program", label: "Program", icon: ListChecks },
  { href: "/progress", label: "Progress", icon: ChartLine },
  { href: "/goals", label: "Goals", icon: Target },
];

export function TabBar() {
  const path = usePathname();
  return (
    <nav className="pb-safe fixed inset-x-0 bottom-0 z-30 border-t border-line bg-card/95 backdrop-blur">
      <ul className="mx-auto flex max-w-xl justify-around px-2 pt-2 pb-1">
        {TABS.map(({ href, label, icon: Icon }) => {
          const active = path === href || path.startsWith(href + "/");
          return (
            <li key={href} className="flex-1">
              <Link
                href={href}
                className={cx(
                  "mx-1 flex flex-col items-center gap-0.5 rounded-[var(--radius-panel)] py-2 text-xs font-semibold",
                  active ? "bg-accent-tint text-accent-ink" : "text-ink-2",
                )}
              >
                <Icon className="size-6" strokeWidth={2} />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
