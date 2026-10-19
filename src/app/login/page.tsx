"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { btn, Card } from "@/components/ui";
import { useAuth } from "@/lib/auth";
import { supabaseConfigured } from "@/lib/supabase";

export default function LoginPage() {
  const { state, signIn } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (state.status === "signedIn") router.replace("/today");
  }, [state.status, router]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(await signIn(email, password));
    setBusy(false);
  }

  return (
    <main className="pt-safe mx-auto flex min-h-dvh max-w-md flex-col justify-center px-[var(--spacing-gutter)] pb-10">
      <div className="mb-8 flex items-center gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/icons/icon-192.png" alt="" className="size-14 rounded-[var(--radius-panel)]" />
        <div>
          <h1 className="text-title font-extrabold tracking-tight">Spotter</h1>
          <p className="text-ink-2">Sign in to start training</p>
        </div>
      </div>

      <Card className="p-5">
        <form onSubmit={submit} className="flex flex-col gap-4">
          <label className="flex flex-col gap-1.5">
            <span className="font-semibold">Email</span>
            <input
              type="email"
              autoComplete="email"
              inputMode="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="min-h-13 rounded-[var(--radius-control)] border-2 border-line bg-white px-4 outline-none focus:border-accent"
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="font-semibold">Password</span>
            <input
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="min-h-13 rounded-[var(--radius-control)] border-2 border-line bg-white px-4 outline-none focus:border-accent"
            />
          </label>
          {error && <p className="rounded-[var(--radius-button)] bg-warm-tint px-4 py-3 font-semibold text-warm-ink">{error}</p>}
          {!supabaseConfigured && (
            <p className="rounded-[var(--radius-button)] bg-pill px-4 py-3 text-ink-2">
              This build isn&apos;t connected to Supabase yet. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in Vercel.
            </p>
          )}
          <button type="submit" disabled={busy} className={btn.primary}>
            {busy ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </Card>
      <p className="mt-6 text-center text-sm text-ink-2">Accounts are invite-only.</p>
    </main>
  );
}
