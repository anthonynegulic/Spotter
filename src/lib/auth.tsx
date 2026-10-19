"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { clearLocal, startSync, stopSync, syncNow } from "@/lib/db/sync";
import { db, getMeta, setMeta } from "@/lib/db/local";
import { saveRow } from "@/lib/db/write";
import { supabase, supabaseConfigured } from "@/lib/supabase";

type AuthState =
  | { status: "loading" }
  | { status: "signedOut" }
  | { status: "signedIn"; userId: string; email: string | null };

interface AuthApi {
  state: AuthState;
  signIn(email: string, password: string): Promise<string | null>;
  signOut(): Promise<void>;
}

const AuthContext = createContext<AuthApi | null>(null);

/**
 * Auth with offline launches in mind. The Supabase session lives in
 * localStorage; if it can't be refreshed because there's no signal, we keep
 * the user signed in with their cached user id so logging still works, and
 * sync resumes once a fresh session is available.
 */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>(() => (supabaseConfigured ? { status: "loading" } : { status: "signedOut" }));

  useEffect(() => {
    if (!supabaseConfigured) return;
    const sb = supabase();
    let cancelled = false;

    const adopt = async (userId: string, email: string | null, online: boolean) => {
      const previous = await getMeta<string>("userId");
      if (previous && previous !== userId) await clearLocal();
      await setMeta("userId", userId);
      await setMeta("email", email);
      if (cancelled) return;
      setState({ status: "signedIn", userId, email });
      if (online) {
        startSync(sb);
        // After the first pull, so the profile we update is the server's copy.
        void syncNow().then(() => recordTimezone(userId));
      }
    };

    (async () => {
      const { data } = await sb.auth.getSession();
      if (data.session) {
        await adopt(data.session.user.id, data.session.user.email ?? null, true);
        return;
      }
      const cachedId = await getMeta<string>("userId");
      if (cachedId && !navigator.onLine) {
        const email = (await getMeta<string>("email")) ?? null;
        if (!cancelled) setState({ status: "signedIn", userId: cachedId, email });
        return;
      }
      if (!cancelled) setState({ status: "signedOut" });
    })();

    const { data: sub } = sb.auth.onAuthStateChange((event, session) => {
      if (session && (event === "SIGNED_IN" || event === "TOKEN_REFRESHED")) {
        void adopt(session.user.id, session.user.email ?? null, true);
      }
      if (event === "SIGNED_OUT") {
        stopSync();
        setState({ status: "signedOut" });
      }
    });

    const onOnline = () => void sb.auth.getSession();
    window.addEventListener("online", onOnline);
    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
      window.removeEventListener("online", onOnline);
    };
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    if (!supabaseConfigured) return "The app isn't connected to its database yet.";
    const { error } = await supabase().auth.signInWithPassword({ email: email.trim(), password });
    if (!error) return null;
    if (error.message.toLowerCase().includes("invalid login")) return "That email and password don't match.";
    if (!navigator.onLine) return "You're offline. Signing in needs a connection the first time.";
    return error.message;
  }, []);

  const signOut = useCallback(async () => {
    stopSync();
    await supabase().auth.signOut();
    await clearLocal();
    setState({ status: "signedOut" });
  }, []);

  return <AuthContext.Provider value={{ state, signIn, signOut }}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthApi {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth outside AuthProvider");
  return ctx;
}

/** The signed-in user's id. Only call inside screens behind the auth gate. */
export function useUserId(): string {
  const { state } = useAuth();
  if (state.status !== "signedIn") throw new Error("Not signed in");
  return state.userId;
}

/** Goals reset at local midnight in Phase 2, so keep the profile's timezone current. */
async function recordTimezone(userId: string) {
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const profile = await db.profiles.get(userId);
  if (profile?.timezone === tz) return;
  await saveRow("profiles", { ...profile, id: userId, timezone: tz });
}
