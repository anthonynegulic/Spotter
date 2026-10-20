"use client";

import { useEffect } from "react";
import { AuthProvider } from "@/lib/auth";
import { repairMergedExercises } from "@/lib/db/repo";
import { onAfterPull, requestSync } from "@/lib/db/sync";

onAfterPull(repairMergedExercises);

export function Providers({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
    const kick = () => requestSync(0);
    const onVisible = () => document.visibilityState === "visible" && kick();
    window.addEventListener("online", kick);
    document.addEventListener("visibilitychange", onVisible);
    const interval = setInterval(() => document.visibilityState === "visible" && requestSync(0), 30_000);
    return () => {
      window.removeEventListener("online", kick);
      document.removeEventListener("visibilitychange", onVisible);
      clearInterval(interval);
    };
  }, []);

  return <AuthProvider>{children}</AuthProvider>;
}
