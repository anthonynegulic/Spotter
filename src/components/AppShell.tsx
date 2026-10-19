"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useAuth } from "@/lib/auth";
import { TabBar } from "./TabBar";
import { FullScreenLoading } from "./ui";

/** Wraps signed-in screens: sends signed-out users to /login, adds the tab bar. */
export function AppShell({ children, tabs = true }: { children: React.ReactNode; tabs?: boolean }) {
  const { state } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (state.status === "signedOut") router.replace("/login");
  }, [state.status, router]);

  if (state.status !== "signedIn") return <FullScreenLoading />;
  return (
    <div className={tabs ? "pb-[calc(var(--spacing-tabbar)+env(safe-area-inset-bottom)+16px)]" : "pb-safe"}>
      <div className="mx-auto max-w-xl">{children}</div>
      {tabs && <TabBar />}
    </div>
  );
}
